# Copyright 2026 Arsydian
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

"""Hiroyasu IC-980 Pro Max driver (EXPERIMENTAL, untested on hardware).

Protocol summary (reverse-engineered, never verified against a radio):

  * 115200 baud, 8-N-1.
  * Handshake: host sends b"PROG81LS", radio answers b"A" (some firmware
    answers b"Y" followed by an ident string, which is drained).  Host
    sends 0x02, radio answers 8 bytes starting with b"P3207".  Host sends
    0x06, radio answers 0x06.
  * Read:  b"R" + addr(3, big-endian) + len(1)
           -> b"W" + addr(3) + len(1) + data(len); host then sends 0x06.
  * Write: b"W" + addr(3, big-endian) + len(1) + data(len) -> 0x06.
  * End:   b"E" (radio leaves programming mode and restarts).

The radio is addressed per channel record rather than as one contiguous
EEPROM image, so this driver assembles its own image ("mmap") from the
pieces it reads.  Image layout:

  offset 0x0000 .. 0x4267  500 channel records x 34 bytes, channel index
                           i (0..499) at offset i * 34.  Index i lives in
                           the radio at
                           0x1000 + (i // 32) * 0x1000 + (i % 32) * 34
  offset 0x4268 .. 0x426D  6 handset key opcode bytes, radio 0x120C5

Total image size is 17006 bytes.  See _image_blocks() for the mapping
between image offsets and radio addresses used by sync_in and sync_out.
"""

import logging
import struct

from chirp import bitwise
from chirp import chirp_common
from chirp import directory
from chirp import errors
from chirp import memmap
from chirp import util
from chirp.settings import RadioSetting
from chirp.settings import RadioSettingGroup
from chirp.settings import RadioSettings
from chirp.settings import RadioSettingValueBoolean
from chirp.settings import RadioSettingValueMap

LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Protocol constants
# ---------------------------------------------------------------------------

CMD_PROGRAM = b"PROG81LS"
CMD_IDENT = b"\x02"
CMD_READ = b"R"
CMD_WRITE = b"W"
CMD_END = b"E"
ACK = b"\x06"
REPLY_PROGRAM = b"A"
REPLY_PROGRAM_ALT = b"Y"   # some firmware: b"Y" + ident string
MODEL_IDENT = b"P3207"
IDENT_LENGTH = 8

TIMEOUT = 1.0          # seconds, per serial read
DRAIN_TIME = 0.1       # seconds to wait for stray bytes after b"A"/b"Y"
RETRIES = 3            # extra attempts after a failed block read/write

# ---------------------------------------------------------------------------
# Memory layout constants
# ---------------------------------------------------------------------------

NUM_CHANNELS = 500
RECORD_SIZE = 34
CHANNELS_PER_PAGE = 32
CHANNEL_BASE = 0x1000
PAGE_SIZE = 0x1000

KEYS_ADDRESS = 0x120C5
KEYS_LENGTH = 6

KEYS_OFFSET = NUM_CHANNELS * RECORD_SIZE      # 0x4268 in the image
MEM_SIZE = KEYS_OFFSET + KEYS_LENGTH          # 17006 bytes

# Bitfields are listed most-significant bit first (bitwise convention).
# Every field named unknown* is never written by this driver, so bits whose
# meaning is not known are preserved exactly as read from the radio.
MEM_FORMAT = """
struct {
  ul32 rxfreq;          // 0-3   RX frequency, Hz
  ul32 txfreq;          // 4-7   TX frequency, Hz
  ul16 rxtone;          // 8-9   RX tone value (CTCSS Hz*10 / 0x2800|DCS)
  ul16 txtone;          // 10-11 TX tone value
  u8 unknown12a:1,      // 12    bit 7      unknown
     sigcode:2,         //       bits 6-5   RX signal code
     busylock:2,        //       bits 4-3   busy lock
     unknown12b:3;      //       bits 2-0   unknown
  u8 scanadd:1,         // 13    bit 7      1 = scan add, 0 = skip
     unknown13:1,       //       bit 6      unknown
     highpower:1,       //       bit 5      1 = High, 0 = Low
     wide:1,            //       bit 4      1 = 25 kHz, 0 = 12.5 kHz
     specialdcs:3,      //       bits 3-1   special DCS 0-4
     compander:1;       //       bit 0      compander
  u8 unknown14:3,       // 14    bits 7-5   unknown
     vague:1,           //       bit 4      vague subaudio
     scrambler:4;       //       bits 3-0   scrambler 0-8
  u8 txtype:2,          // 15    bits 7-6   TX tone type
     rxtype:2,          //       bits 5-4   RX tone type
     unknown15a:1,      //       bit 3      unknown
     am:1,              //       bit 2      1 = AM, 0 = FM
     unknown15b:2;      //       bits 1-0   unknown
  u8 pttpush;           // 16    PTT push code
  u8 pttpop;            // 17    PTT pop code
  char name[16];        // 18-33 ASCII, zero padded
} memory[500];

struct {
  u8 key1_short;
  u8 key1_long;
  u8 key2_short;
  u8 key2_long;
  u8 key3_short;
  u8 key3_long;
} keys;
"""

# Tone type codes (bytes 15 bits 7-6 for TX, bits 5-4 for RX)
TONE_NONE = 0
TONE_CTCSS = 1
TONE_DCS_NORMAL = 2
TONE_DCS_INVERTED = 3

DCS_FLAG = 0x2800
DCS_CODE_MASK = 0x01FF

# Frequencies that mark a channel as empty (RX) or TX as unset
UNSET_FREQS = (0x00000000, 0xFFFFFFFF)

# Wattage is not known; these are placeholders so CHIRP can show and
# convert power levels.  Only the High/Low distinction is stored.
POWER_LEVELS = [chirp_common.PowerLevel("High", watts=50),
                chirp_common.PowerLevel("Low", watts=10)]

MODES = ["FM", "NFM", "AM"]
TMODES = ["", "Tone", "TSQL", "DTCS", "Cross"]
CROSS_MODES = ["Tone->Tone", "Tone->DTCS", "DTCS->Tone", "DTCS->DTCS",
               "DTCS->", "->Tone", "->DTCS"]
DUPLEXES = ["", "-", "+", "split", "off"]

# RX covers airband (108-136 MHz AM) plus the TX ranges.  CHIRP treats the
# upper edge of a band as exclusive, hence the +1.
RX_BANDS = [(108000000, 176000001),
            (400000000, 475000001)]
TX_BANDS = [(134000000, 176000000),
            (400000000, 475000000)]

# Per-channel option tables: (label, raw value)
BUSYLOCK_MAP = [("Off", 0), ("DQT", 1), ("CAT", 2)]
SIGCODE_MAP = [("Off", 0), ("DTMF", 1), ("FSK", 2), ("FSK+DTMF", 3)]
SPECIALDCS_MAP = [("Off", 0)] + [(str(i), i) for i in range(1, 5)]
SCRAMBLER_MAP = [("Off", 0)] + [(str(i), i) for i in range(1, 9)]
PTTCODE_MAP = ([("Off", 0), ("ID", 1)] +
               [("Code %d" % i, i + 1) for i in range(1, 31)])

# Per-channel extra settings and the width (bits) of their fields
EXTRA_FIELD_BITS = {
    "busylock": 2,
    "sigcode": 2,
    "specialdcs": 3,
    "scrambler": 4,
    "compander": 1,
    "vague": 1,
    "pttpush": 8,
    "pttpop": 8,
}

KEY_FUNCTION_MAP = [
    ("Unassigned", 0x00),
    ("Monitor (latched)", 0x01),
    ("Monitor (momentary)", 0x02),
    ("Scan", 0x03),
    ("Reverse", 0x04),
    ("FM Broadcast", 0x08),
    ("Alarm", 0x09),
    ("Warning Light", 0x0B),
    ("Frequency Match", 0x0C),
]
KEY_FIELDS = [
    ("key1_short", "Key 1 (short press)"),
    ("key1_long", "Key 1 (long press)"),
    ("key2_short", "Key 2 (short press)"),
    ("key2_long", "Key 2 (long press)"),
    ("key3_short", "Key 3 (short press)"),
    ("key3_long", "Key 3 (long press)"),
]

VALID_CHARS = chirp_common.CHARSET_ASCII
NAME_LENGTH = 16


# ---------------------------------------------------------------------------
# Address mapping
# ---------------------------------------------------------------------------

def _channel_address(index):
    """Return the radio address of channel record @index (0-based)."""
    return (CHANNEL_BASE + (index // CHANNELS_PER_PAGE) * PAGE_SIZE +
            (index % CHANNELS_PER_PAGE) * RECORD_SIZE)


def _image_blocks():
    """Yield (image_offset, radio_address, length) for every block."""
    for index in range(NUM_CHANNELS):
        yield index * RECORD_SIZE, _channel_address(index), RECORD_SIZE
    yield KEYS_OFFSET, KEYS_ADDRESS, KEYS_LENGTH


def _address_bytes(address):
    """Encode @address as 3 bytes, big-endian."""
    return struct.pack(">I", address)[1:]


# ---------------------------------------------------------------------------
# Serial protocol
# ---------------------------------------------------------------------------

def _drain(pipe, duration=DRAIN_TIME, limit=512):
    """Read and return whatever the radio sends within ~@duration seconds.

    Bounded by @limit bytes so a babbling port cannot loop forever.
    """
    old_timeout = pipe.timeout
    junk = b""
    try:
        pipe.timeout = duration
        while len(junk) < limit:
            chunk = pipe.read(64)
            if not chunk:
                break
            junk += chunk
    finally:
        pipe.timeout = old_timeout
    return junk


def _flush_input(pipe):
    """Discard pending input, including bytes still on their way in."""
    try:
        pipe.reset_input_buffer()
    except AttributeError:
        pipe.flushInput()
    junk = _drain(pipe)
    if junk:
        LOG.debug("Discarded %i stray bytes:\n%s",
                  len(junk), util.hexprint(junk))


def _enter_programming_mode(radio):
    """Put the radio in programming mode and verify the model ident.

    Raises errors.RadioError on any failure.  Nothing is sent to end the
    session from here: until the ident is verified we do not know which
    radio we are talking to, so we do not send it further commands.
    """
    pipe = radio.pipe
    pipe.timeout = TIMEOUT
    try:
        pipe.reset_input_buffer()
    except AttributeError:
        pipe.flushInput()

    pipe.write(CMD_PROGRAM)
    reply = pipe.read(1)
    if not reply:
        raise errors.RadioError("Radio did not respond to the programming "
                                "request. Check the cable, port and that "
                                "the radio is switched on.")
    if reply not in (REPLY_PROGRAM, REPLY_PROGRAM_ALT):
        LOG.debug("Unexpected programming reply:\n%s", util.hexprint(reply))
        raise errors.RadioError("Radio refused programming mode "
                                "(reply 0x%02X)" % reply[0])

    # Some firmware sends b"Y" plus an ident string; also tolerate any
    # stray bytes after b"A".
    extra = _drain(pipe)
    if extra:
        LOG.debug("Programming reply %r followed by %i extra bytes:\n%s",
                  reply, len(extra), util.hexprint(extra))

    pipe.write(CMD_IDENT)
    ident = pipe.read(IDENT_LENGTH)
    LOG.debug("Model ident:\n%s", util.hexprint(ident))
    if len(ident) != IDENT_LENGTH:
        raise errors.RadioError("Radio did not send its model ident "
                                "(got %i of %i bytes)" %
                                (len(ident), IDENT_LENGTH))
    if not ident.startswith(MODEL_IDENT):
        raise errors.RadioError("Unsupported radio model (ident %r, "
                                "expected %r)" % (ident, MODEL_IDENT))
    return ident


def _confirm_programming_mode(radio):
    """Final step of the handshake: 0x06 -> 0x06."""
    pipe = radio.pipe
    pipe.write(ACK)
    reply = pipe.read(1)
    if reply != ACK:
        LOG.debug("Handshake confirmation reply:\n%s", util.hexprint(reply))
        raise errors.RadioError("Radio did not confirm programming mode")


def _exit_programming_mode(radio):
    """Send the end-of-session command.  Never raises."""
    try:
        radio.pipe.write(CMD_END)
    except Exception:
        LOG.exception("Failed to send end-of-session command; the radio "
                      "may need to be switched off and on again")


def _read_block_once(pipe, address, length):
    header = _address_bytes(address) + bytes([length])
    pipe.write(CMD_READ + header)
    reply = pipe.read(len(header) + 1 + length)
    if len(reply) != len(header) + 1 + length:
        LOG.debug("Short reply at 0x%06X:\n%s", address, util.hexprint(reply))
        raise errors.RadioError("Short reply reading 0x%06X (%i bytes)" %
                                (address, len(reply)))
    if reply[:1] != CMD_WRITE or reply[1:len(header) + 1] != header:
        LOG.debug("Bad reply header at 0x%06X:\n%s",
                  address, util.hexprint(reply))
        raise errors.RadioError("Unexpected reply header reading 0x%06X" %
                                address)
    pipe.write(ACK)
    return reply[len(header) + 1:]


def _write_block_once(pipe, address, data):
    pipe.write(CMD_WRITE + _address_bytes(address) + bytes([len(data)]) +
               data)
    reply = pipe.read(1)
    if reply != ACK:
        LOG.debug("Write reply at 0x%06X:\n%s", address, util.hexprint(reply))
        raise errors.RadioError("Radio did not acknowledge write at 0x%06X" %
                                address)


def _with_retries(pipe, func, *args):
    """Run @func, retrying up to RETRIES times on protocol errors.

    Only errors.RadioError (bad/short/missing replies) is retried.  Port
    failures propagate immediately.
    """
    last_error = None
    for attempt in range(RETRIES + 1):
        if last_error is not None:
            LOG.warning("Retrying (%i/%i) after: %s",
                        attempt, RETRIES, last_error)
            _flush_input(pipe)
        try:
            return func(pipe, *args)
        except errors.RadioError as e:
            last_error = e
    raise errors.RadioError("%s (gave up after %i attempts)" %
                            (last_error, RETRIES + 1))


def _read_block(radio, address, length):
    return _with_retries(radio.pipe, _read_block_once, address, length)


def _write_block(radio, address, data):
    _with_retries(radio.pipe, _write_block_once, address, data)


def _run_session(radio, transfer):
    """Handshake, run @transfer(radio), and always end the session.

    The end command is sent once the model ident has been verified, even
    if the final handshake acknowledgement or the transfer fails, so the
    radio is not left stuck in programming mode.
    """
    _enter_programming_mode(radio)
    try:
        _confirm_programming_mode(radio)
        return transfer(radio)
    finally:
        _exit_programming_mode(radio)


def _download(radio):
    status = chirp_common.Status()
    status.msg = "Cloning from radio"
    status.cur = 0
    status.max = MEM_SIZE
    radio.status_fn(status)

    image = bytearray(MEM_SIZE)
    for offset, address, length in _image_blocks():
        image[offset:offset + length] = _read_block(radio, address, length)
        status.cur = offset + length
        radio.status_fn(status)
    return memmap.MemoryMapBytes(bytes(image))


def _upload(radio):
    image = radio.get_mmap().get_packed()
    if len(image) != MEM_SIZE:
        raise errors.RadioError("Image is %i bytes, expected %i" %
                                (len(image), MEM_SIZE))

    status = chirp_common.Status()
    status.msg = "Cloning to radio"
    status.cur = 0
    status.max = MEM_SIZE
    radio.status_fn(status)

    for offset, address, length in _image_blocks():
        _write_block(radio, address, image[offset:offset + length])
        status.cur = offset + length
        radio.status_fn(status)


# ---------------------------------------------------------------------------
# Tone encoding
# ---------------------------------------------------------------------------

def _decode_tone(ttype, raw):
    """Return a (mode, value, polarity) spec for split_tone_decode()."""
    if ttype == TONE_CTCSS:
        hz = raw / 10.0
        if 50.0 < hz < 300.0:
            return "Tone", hz, None
        LOG.warning("Ignoring out-of-range CTCSS value 0x%04X", raw)
    elif ttype in (TONE_DCS_NORMAL, TONE_DCS_INVERTED):
        if (raw & ~DCS_CODE_MASK) != DCS_FLAG:
            LOG.debug("DCS value 0x%04X lacks the usual 0x%04X flag",
                      raw, DCS_FLAG)
        code = int("%o" % (raw & DCS_CODE_MASK))
        if code in chirp_common.ALL_DTCS_CODES:
            polarity = "R" if ttype == TONE_DCS_INVERTED else "N"
            return "DTCS", code, polarity
        LOG.warning("Ignoring invalid DCS value 0x%04X", raw)
    return "", None, None


def _encode_tone(mode, value, polarity):
    """Return (tone type, raw value or None) from a split_tone_encode spec.

    None means "leave the stored value alone" (no tone).
    """
    if mode == "Tone":
        return TONE_CTCSS, int(round(value * 10))
    if mode == "DTCS":
        ttype = TONE_DCS_INVERTED if polarity == "R" else TONE_DCS_NORMAL
        return ttype, DCS_FLAG | int("%d" % value, 8)
    return TONE_NONE, None


def _tx_freq(mem):
    """TX frequency in Hz for @mem, or None for duplex 'off'."""
    if mem.duplex == "off":
        return None
    if mem.duplex == "split":
        return mem.offset
    if mem.duplex == "+":
        return mem.freq + mem.offset
    if mem.duplex == "-":
        return mem.freq - mem.offset
    return mem.freq


def _map_setting(name, label, entries, raw):
    """RadioSetting over a (label, value) table that keeps unknown values."""
    entries = list(entries)
    if raw not in [value for _label, value in entries]:
        entries.append(("Unknown (0x%02X)" % raw, raw))
    return RadioSetting(name, label, RadioSettingValueMap(entries, raw))


# ---------------------------------------------------------------------------
# Radio class
# ---------------------------------------------------------------------------

@directory.register
class HiroyasuIC980ProMax(chirp_common.CloneModeRadio):
    """Hiroyasu IC-980 Pro Max"""
    VENDOR = "Hiroyasu"
    MODEL = "IC-980 Pro Max"
    BAUD_RATE = 115200
    NEEDS_COMPAT_SERIAL = False

    POWER_LEVELS = POWER_LEVELS
    _memsize = MEM_SIZE
    _fill_byte = 0x00

    @classmethod
    def get_prompts(cls):
        rp = chirp_common.RadioPrompts()
        rp.experimental = (
            "This driver is experimental and has NOT been tested with a "
            "real radio. The programming protocol was reverse-engineered "
            "and may be incomplete or wrong, which could corrupt the "
            "radio's configuration.\n\n"
            "Before using it, read and save a full backup of the radio "
            "with the manufacturer's (OEM) programming software, and keep "
            "that backup so you can restore the radio if anything goes "
            "wrong.")
        rp.pre_download = (
            "1. Connect the programming cable to the radio and computer.\n"
            "2. Switch the radio on.\n"
            "3. Click OK. The radio restarts when the download finishes.")
        rp.pre_upload = (
            "1. Make sure you have a backup made with the OEM software.\n"
            "2. Connect the programming cable and switch the radio on.\n"
            "3. Click OK. The radio restarts when the upload finishes.")
        return rp

    def get_features(self):
        rf = chirp_common.RadioFeatures()
        rf.has_settings = True
        rf.has_bank = False
        rf.has_name = True
        rf.has_ctone = True
        rf.has_cross = True
        rf.has_rx_dtcs = True
        rf.has_dtcs_polarity = True
        rf.has_tuning_step = False
        rf.has_nostep_tuning = True    # frequencies are stored in Hz
        rf.can_odd_split = True
        rf.valid_name_length = NAME_LENGTH
        rf.valid_characters = VALID_CHARS
        rf.valid_modes = list(MODES)
        rf.valid_tmodes = list(TMODES)
        rf.valid_cross_modes = list(CROSS_MODES)
        rf.valid_duplexes = list(DUPLEXES)
        rf.valid_power_levels = list(POWER_LEVELS)
        rf.valid_skips = ["", "S"]
        rf.valid_tones = list(chirp_common.TONES)
        rf.valid_dtcs_codes = list(chirp_common.DTCS_CODES)
        rf.valid_tuning_steps = [2.5, 5.0, 6.25, 10.0, 12.5, 20.0, 25.0,
                                 50.0, 100.0]
        rf.valid_bands = list(RX_BANDS)
        rf.memory_bounds = (1, NUM_CHANNELS)
        return rf

    # -- cloning -----------------------------------------------------------

    def sync_in(self):
        try:
            self._mmap = _run_session(self, _download)
        except errors.RadioError:
            raise
        except Exception as e:
            LOG.exception("Unexpected error during download")
            raise errors.RadioError("Failed to communicate with the radio: "
                                    "%s" % e)
        self.process_mmap()

    def sync_out(self):
        try:
            _run_session(self, _upload)
        except errors.RadioError:
            raise
        except Exception as e:
            LOG.exception("Unexpected error during upload")
            raise errors.RadioError("Failed to communicate with the radio: "
                                    "%s" % e)

    def process_mmap(self):
        self._memobj = bitwise.parse(MEM_FORMAT, self._mmap)
        self._fill_byte = self._detect_fill_byte()

    def _detect_fill_byte(self):
        """Fill byte used for empty records in this image (0x00 or 0xFF).

        Majority vote over the records whose RX frequency is 0x00000000 or
        0xFFFFFFFF; 0x00 on a tie or when there are no empty records.
        """
        data = self._mmap.get_packed()
        zeros = ones = 0
        for index in range(NUM_CHANNELS):
            rx = data[index * RECORD_SIZE:index * RECORD_SIZE + 4]
            if rx == b"\x00" * 4:
                zeros += 1
            elif rx == b"\xFF" * 4:
                ones += 1
        return 0xFF if ones > zeros else 0x00

    # -- memories ----------------------------------------------------------

    def get_raw_memory(self, number):
        return repr(self._memobj.memory[number - 1])

    @staticmethod
    def _is_empty(_mem):
        return int(_mem.rxfreq) in UNSET_FREQS

    def get_memory(self, number):
        _mem = self._memobj.memory[number - 1]
        mem = chirp_common.Memory()
        mem.number = number

        if self._is_empty(_mem):
            mem.empty = True
            return mem

        mem.freq = int(_mem.rxfreq)
        txfreq = int(_mem.txfreq)
        if txfreq in UNSET_FREQS:
            mem.duplex = "off"
            mem.offset = 0
        elif txfreq == mem.freq:
            mem.duplex = ""
            mem.offset = 0
        elif chirp_common.is_split(self.get_features().valid_bands,
                                   mem.freq, txfreq):
            mem.duplex = "split"
            mem.offset = txfreq
        elif txfreq > mem.freq:
            mem.duplex = "+"
            mem.offset = txfreq - mem.freq
        else:
            mem.duplex = "-"
            mem.offset = mem.freq - txfreq

        name = str(_mem.name).split("\x00", 1)[0]
        mem.name = "".join(c for c in name if c in VALID_CHARS).rstrip()

        if _mem.am:
            mem.mode = "AM"
        else:
            mem.mode = "FM" if _mem.wide else "NFM"

        mem.power = POWER_LEVELS[0] if _mem.highpower else POWER_LEVELS[1]
        mem.skip = "" if _mem.scanadd else "S"

        txtone = _decode_tone(int(_mem.txtype), int(_mem.txtone))
        rxtone = _decode_tone(int(_mem.rxtype), int(_mem.rxtone))
        chirp_common.split_tone_decode(mem, txtone, rxtone)

        mem.extra = RadioSettingGroup("Extra", "extra")
        mem.extra.append(_map_setting("busylock", "Busy Lock",
                                      BUSYLOCK_MAP, int(_mem.busylock)))
        mem.extra.append(_map_setting("sigcode", "RX Signal Code",
                                      SIGCODE_MAP, int(_mem.sigcode)))
        mem.extra.append(_map_setting("specialdcs", "Special DCS",
                                      SPECIALDCS_MAP, int(_mem.specialdcs)))
        mem.extra.append(_map_setting("scrambler", "Scrambler",
                                      SCRAMBLER_MAP, int(_mem.scrambler)))
        mem.extra.append(RadioSetting(
            "compander", "Compander",
            RadioSettingValueBoolean(bool(_mem.compander))))
        mem.extra.append(RadioSetting(
            "vague", "Vague Subaudio",
            RadioSettingValueBoolean(bool(_mem.vague))))
        mem.extra.append(_map_setting("pttpush", "PTT Push Code",
                                      PTTCODE_MAP, int(_mem.pttpush)))
        mem.extra.append(_map_setting("pttpop", "PTT Pop Code",
                                      PTTCODE_MAP, int(_mem.pttpop)))
        return mem

    def set_memory(self, mem):
        _mem = self._memobj.memory[mem.number - 1]

        if mem.empty:
            _mem.set_raw(bytes([self._fill_byte]) * RECORD_SIZE)
            return

        if self._is_empty(_mem):
            # New channel in a previously empty slot: start from a clean
            # record (unknown bits zero, no tone values).
            _mem.set_raw(b"\x00" * RECORD_SIZE)
            _mem.rxtone = 0xFFFF
            _mem.txtone = 0xFFFF

        _mem.rxfreq = mem.freq
        txfreq = _tx_freq(mem)
        if txfreq is None:
            # Receive only.  Assumption: an unset TX frequency (same
            # pattern as an empty RX frequency) disables transmit.
            if int(_mem.txfreq) not in UNSET_FREQS:
                _mem.txfreq = 0xFFFFFFFF if self._fill_byte else 0
        else:
            _mem.txfreq = txfreq

        name = mem.name.rstrip()[:NAME_LENGTH]
        name = "".join(c if c in VALID_CHARS else " " for c in name)
        _mem.name = name.ljust(NAME_LENGTH, "\x00")

        if mem.mode == "AM":
            _mem.am = 1
        else:
            _mem.am = 0
            _mem.wide = int(mem.mode == "FM")

        _mem.highpower = int(mem.power is None or
                             mem.power == POWER_LEVELS[0])
        _mem.scanadd = int(mem.skip != "S")

        txspec, rxspec = chirp_common.split_tone_encode(mem)
        txtype, txraw = _encode_tone(*txspec)
        rxtype, rxraw = _encode_tone(*rxspec)
        _mem.txtype = txtype
        _mem.rxtype = rxtype
        if txraw is not None:
            _mem.txtone = txraw
        if rxraw is not None:
            _mem.rxtone = rxraw

        for setting in mem.extra:
            name = setting.get_name()
            if name not in EXTRA_FIELD_BITS:
                LOG.debug("Ignoring foreign extra setting %s", name)
                continue
            value = setting.value
            if isinstance(value, RadioSettingValueMap):
                raw = value.get_mem_val()
            else:
                raw = int(value)
            if not 0 <= raw < (1 << EXTRA_FIELD_BITS[name]):
                LOG.warning("Ignoring out-of-range %s=%r", name, raw)
                continue
            setattr(_mem, name, raw)

    def validate_memory(self, mem):
        msgs = super().validate_memory(mem)
        if mem.empty:
            return msgs
        txfreq = _tx_freq(mem)
        if txfreq is not None and not chirp_common.in_range(txfreq,
                                                            TX_BANDS):
            msgs.append(chirp_common.ValidationWarning(
                "TX frequency %s is outside the transmit ranges "
                "(134-176, 400-475 MHz). Use duplex 'off' for "
                "receive-only channels." %
                chirp_common.format_freq(txfreq)))
        return msgs

    # -- settings ----------------------------------------------------------

    def get_settings(self):
        _keys = self._memobj.keys
        keys = RadioSettingGroup("keys", "Handset Keys")
        for field, label in KEY_FIELDS:
            keys.append(_map_setting(field, label, KEY_FUNCTION_MAP,
                                     int(getattr(_keys, field))))
        return RadioSettings(keys)

    def set_settings(self, settings):
        _keys = self._memobj.keys
        key_names = [field for field, _label in KEY_FIELDS]
        for element in settings:
            if not isinstance(element, RadioSetting):
                self.set_settings(element)
                continue
            name = element.get_name()
            if name in key_names:
                setattr(_keys, name, element.value.get_mem_val())
            else:
                LOG.warning("Ignoring unknown setting %s", name)
