# Memory map: what is known, and how to map the rest

Nothing below has been confirmed on a real radio yet. Each item says where its
location came from.

## `.ysf` codeplug files (47,046 bytes)

| Range (file offset) | Contents | Source |
| --- | --- | --- |
| 0–563 | Header | OEM file structure |
| 173–257 | VFO A record (channel format; factory 430.000 MHz) | Inferred: RX at +0, TX at +14 and flags at +58 match the channel layout |
| 258–342 | VFO B record (channel format; factory 144.300 MHz) | Inferred, as above. Which one is A and which is B is a guess |
| 351–413 | One bit per programmed channel: channel *n* → byte 351 + ⌊n/8⌋, bit n mod 8 | Reference editor |
| 564–43,063 | 500 channel records × 85 bytes | Reference editor |
| 43,064–47,045 | Settings block (3,982 bytes) | OEM file structure |
| settings +41…+46 | Handset key opcodes P1 short, P1 long, P2 short, P2 long, P3 short, P3 long | Original reverse-engineering notes |
| settings +3315…+3321 | Power-on message, ASCII (factory "HELLO") | Inferred: the only text in the factory file |
| settings +3387…+3981 | Seven channel-format records (factory rows 2–7: 435.025 RX / 455.025 TX) | Inferred: an exact fit of 7 × 85 bytes. The OEM software has a seven-row "Repeat" table |

### Channel record (85 bytes)

| Offset | Field |
| --- | --- |
| 0–3 | RX frequency, Hz, u32 little-endian |
| 14–17 | TX frequency, Hz, u32 LE |
| 28–29, 30 | RX tone value (u16 LE), RX tone type |
| 41–42, 43 | TX tone value (u16 LE), TX tone type |
| 57 | bits 3–4 busy lock (0 off, 1 DQT, 2 CAT); bits 5–6 RX signal code |
| 58 | bit 7 scan; bit 5 power high; bit 4 wide; bits 1–3 special DCS; bit 0 compander |
| 59 | bit 4 vague subaudio; bits 0–3 scrambler |
| 60 | bit 2 AM; bits 4–5 RX tone type; bits 6–7 TX tone type |
| 61, 62 | PTT push code, PTT pop code (0 off, 1 ID, 2–31 code form 1–30) |
| 63–78 | Name, 16 ASCII bytes |

Tone types: 0 none, 1 CTCSS (value = Hz × 10), 2 DCS normal, 3 DCS inverted
(value = 0x2800 | octal code). Bits and bytes not listed are kept unchanged on save.

## Radio memory (over USB)

| Address | Contents |
| --- | --- |
| 0x1000 + ⌊i/32⌋ × 0x1000 + (i mod 32) × 34 | Channel *i* (0–499), 34-byte record |
| 0x120C5 | Six handset key opcodes |

The 34-byte record holds the same fields as the file record, packed: RX Hz (0–3),
TX Hz (4–7), RX tone (8–9), TX tone (10–11), then bytes 12–15 match file bytes
57–60, 16–17 the PTT codes, and 18–33 the name. Empty slots read as all 0x00 or
all 0xFF; the app treats both as empty and writes empty slots with whichever
byte the radio already uses.

Not mapped in radio memory yet: VFOs, power-on message, the settings-block
memories, global settings (squelch, TOT, VOX, beeps, voice, backlight, step,
dual watch) and the DTMF/ANI code lists. The app only sends what it can place.

## Mapping a setting from the OEM software

1. In the OEM software, read the radio (or open a codeplug) and save it as `a.ysf`.
2. Change exactly one setting — for example squelch from 5 to 6 — and save as `b.ysf`.
3. In this app, open **Tools → Compare two .ysf files…**, choose `a.ysf` and `b.ysf`.
4. The differing bytes are where that setting lives in the file. Try a few values
   to learn the encoding (plain number, index into a list, a bit within a byte).
5. Open an issue or pull request with the offset, encoding and the values you tried.

To find the **radio** address of a setting, the same idea applies to USB traffic:
capture what the OEM software sends while writing (for example with a serial port
monitor) before and after changing one setting.

Once an offset is confirmed, add it to `src/codecs/ysf-codec.ts` (file) and
`src/codecs/eeprom-codec.ts` (radio), with a test in `tests/`.
