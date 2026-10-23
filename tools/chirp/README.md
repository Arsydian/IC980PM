# CHIRP driver: Hiroyasu IC-980 Pro Max (experimental)

`hiroyasu_ic980promax.py` is a draft [CHIRP](https://github.com/kk7ds/chirp)
driver (Python 3, CHIRP "next") for the Hiroyasu IC-980 Pro Max mobile radio.

> **Untested.** The protocol was reverse-engineered and this driver has never
> been run against a real radio. Before you use it, read the radio with the
> manufacturer's (OEM) programming software and keep that backup, so you can
> restore the radio if something goes wrong. CHIRP shows the same warning when
> you pick this model.

## Loading it in CHIRP

The driver is not part of CHIRP, so you load it by hand for each session:

1. Install a current CHIRP "next" build.
2. Turn on **Help → Developer Mode** and restart CHIRP.
3. Choose **File → Load Module** and select `hiroyasu_ic980promax.py`.
4. Use **Radio → Download From Radio**, then pick vendor **Hiroyasu**, model
   **IC-980 Pro Max**, and your cable's serial port.

The module stays loaded only until CHIRP exits. Load it again before you open
an `.img` file saved with it.

## What it supports

- 500 channels (shown in CHIRP as 1–500): RX/TX frequency (simplex, +/−,
  split, TX off), name (16 ASCII characters), FM / NFM / AM, High/Low power,
  scan add/skip, and CTCSS/DCS as Tone, TSQL, DTCS or Cross (TX and RX tones
  are separate, and DCS can be normal or inverted).
- Per-channel extras: busy lock, RX signal code, special DCS, scrambler,
  compander, vague subaudio, and PTT push/pop codes.
- Settings: the functions of handset keys 1–3, short and long press.
- Bits whose meaning is unknown are kept exactly as they were read.

## Protocol facts the driver relies on

These come from the project's reverse-engineering notes and are unconfirmed.

- Serial: 115200 baud, 8-N-1.
- Handshake: send `PROG81LS` and expect `A` (0x41). Some firmware may send
  `Y` (0x59) and an ident string instead; the driver discards any extra bytes
  that arrive within about 100 ms. Then send 0x02 and expect 8 bytes starting
  with `P3207` (the driver refuses other idents). Then send 0x06 and expect
  0x06.
- Read: send `R` + 3-byte big-endian address + 1-byte length. The radio
  replies `W` + the same address + length + data. The driver checks the
  address and length it gets back, then sends 0x06.
- Write: send `W` + 3-byte big-endian address + length + data. The radio
  replies 0x06.
- End: send `E` (the radio leaves programming mode and restarts). The driver
  sends it from a `finally` block once the model ident is verified.
- A failed block read or write is retried up to 3 times, with the input
  flushed before each retry.

### Radio memory

- Channel *i* (0–499) is at `0x1000 + (i // 32) * 0x1000 + (i % 32) * 34`.
  Each record is 34 bytes:

  | Bytes | Contents |
  |---|---|
  | 0–3 | RX frequency in Hz, u32 little-endian |
  | 4–7 | TX frequency in Hz, u32 little-endian |
  | 8–9 / 10–11 | RX / TX tone value, u16 LE. CTCSS = Hz × 10; DCS = 0x2800 \| octal code (e.g. 023 → 0x2813) |
  | 12 | bits 3–4 busy lock (off/DQT/CAT); bits 5–6 RX signal code (off/DTMF/FSK/FSK+DTMF) |
  | 13 | bit 7 scan add; bit 5 high power; bit 4 wide (25 kHz); bits 1–3 special DCS; bit 0 compander |
  | 14 | bit 4 vague subaudio; bits 0–3 scrambler (0–8) |
  | 15 | bit 2 AM; bits 4–5 RX tone type; bits 6–7 TX tone type (0 none, 1 CTCSS, 2 DCS, 3 DCS inverted) |
  | 16 / 17 | PTT push / pop code (0 off, 1 ID, 2–31 = code 1–30) |
  | 18–33 | name, ASCII, zero-padded |

- A channel is empty if its RX frequency is 0 or 0xFFFFFFFF. When you delete
  a channel, the driver fills the record with the byte (0x00 or 0xFF) that
  most empty records in the downloaded image use, or 0x00 if there are none.
- The handset key functions are 6 bytes at 0x120C5 (key 1 short/long, key 2
  short/long, key 3 short/long). Known values: 0x00 unassigned, 0x01 monitor
  (latched), 0x02 monitor (momentary), 0x03 scan, 0x04 reverse, 0x08 FM
  broadcast, 0x09 alarm, 0x0B warning light, 0x0C frequency match. Any other
  value is shown as "Unknown" and kept as it is.
- TX: 134–176 MHz and 400–475 MHz. RX also covers 108–136 MHz (airband, AM).

### CHIRP image layout

The radio is read record by record, so the driver builds its own image:
500 × 34-byte channel records (channel *i* at offset `i * 34`), followed by
the 6 key bytes at offset 0x4268, for 17006 bytes in total. When it uploads,
the driver writes each record back to its real radio address. As a result,
`.img` files from this driver can't be opened with the OEM software.

## Assumptions beyond the notes

- Power levels are only High/Low. The 50 W and 10 W figures are placeholders.
- A channel set to TX "off" is stored with an unset TX frequency, using the
  same pattern as an empty RX frequency.
- A new channel in an empty slot starts from a zeroed record, with both tone
  values set to 0xFFFF. When a tone is set to "none", the stored tone value
  is left as it was.
- The labels "Off" for special DCS 0 and scrambler 0 are guesses.
- CHIRP warns, but does not block, if the TX frequency is outside the TX
  ranges (for example a simplex airband channel). Set duplex to "off" for
  receive-only channels.

## Submitting upstream later

CHIRP also needs a test image of a real radio (`tests/images/`), and the
driver must pass CHIRP's driver test suite. Before submitting, check CHIRP's
current contributor guidelines and update the copyright header.
