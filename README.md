# Hiroyasu IC-980 Pro Max - Radio Programmer

![Version](https://img.shields.io/badge/version-v1.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-emerald.svg)
![Protocol](https://img.shields.io/badge/protocol-PROG81LS%20%28115200%208--N--1%29-indigo.svg)
![License](https://img.shields.io/badge/license-MIT-purple.svg)

A clean, modern, cross-platform (Windows, macOS, Linux) radio programming suite for the **Hiroyasu IC-980 Pro Max** (and compatible radios like Radtel RT-920 and P3207 family), built with full **RepeaterBook** directory import, interactive 500-channel memory management, auxiliary settings configuration, and direct USB serial programming.

---

## ✨ Features

- **Direct USB Radio Programming**:
  - Full bidirectional communication with the radio over USB-to-UART programming cable (Prolific, FTDI, CH340, CP210x).
  - Uses the reverse-engineered **`PROG81LS`** serial handshake protocol at **115,200 baud (8-N-1)**.
  - Read from Radio and Write to Radio with real-time percentage progress bar and sector status.
- **RepeaterBook Integration**:
  - Live query by **State / Region**, **County**, **Band** (2m VHF 144 MHz, 70cm UHF 440 MHz), or **Keywords**.
  - **Proximity Search**: Calculate distance in miles from your coordinates using the Haversine formula.
  - One-click import with flexible placement: *Append to empty slots*, *Start at Channel #*, or *Overwrite*.
  - Automatic calculation of Duplex direction (`+` / `-`), offsets, and CTCSS/DCS access tones.
- **Full 500-Channel Memory Editor**:
  - High-density spreadsheet grid with inline editing.
  - Complete parameter coverage: Channel Name (16 chars), RX/TX Frequencies, Duplex, Offset, TX Tone (QT/DQT Enc), RX Tone (QT/DQT Dec), Power (High/Low), Bandwidth (Wide 25kHz / Narrow 12.5kHz), Scan (ADD/DEL), Modulation (FM/AM Airband), Busy Channel Lockout (OFF/DQT/CAT), Scrambler (OFF/1-8), Compander, Vague Subaudio, Special DCS, and PTT ANI codes.
- **Interchange & Codeplug Compatibility**:
  - **`.ysf` Binary Format**: Reads and writes standard 47,046-byte codeplugs with active channel bitmask generation (bytes 351..413).
  - **CHIRP CSV**: 21-column import and export.
  - **OEM CPS CSV**: 18-column full parameter spreadsheet import and export.
- **Radio Auxiliary Settings**:
  - Squelch Level (0–9), Time-Out Timer (TOT), Power-On Display (Custom Message or Battery Voltage), Roger Beep, Voice Announcements, Keypad Beep, and Squelch Tail Elimination.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or newer)
- npm or yarn

### Installation & Launch
```bash
# Install dependencies
npm install

# Start development server (Web / Electron)
npm run dev

# Run automated test suite
npm run test

# Build production bundle
npm run build
```

---

## 📡 Hardware & Protocol Architecture

Reverse-engineered from the OEM firmware and CPS suite:
- **Baud Rate**: `115200`
- **Data Bits**: `8`
- **Parity**: `None`
- **Stop Bits**: `1`
- **Handshake Sequence**:
  1. Host sends `PROG81LS` (`0x50 0x52 0x4F 0x47 0x38 0x31 0x4C 0x53`)
  2. Radio replies with `'A'` (`0x41`) or `'YS'` model header
  3. Host sends `0x02` (STX)
  4. Radio replies with `P3207\xFF\xFF\xFF`
  5. Host sends `0x06` (ACK), Radio echoes `0x06` (ACK)
- **Memory Addressing**:
  $$\text{EEPROM Address} = 0x1000 + (\lfloor \text{Ch} / 32 \rfloor \times 0x1000) + ((\text{Ch} \pmod{32}) \times 34)$$
- **Read Command**: `['R', (addr >> 16) & 0xFF, (addr >> 8) & 0xFF, addr & 0xFF, length]`
- **Write Command**: `['W', (addr >> 16) & 0xFF, (addr >> 8) & 0xFF, addr & 0xFF, length, ...data]`
- **End Command**: `'E'` (`0x45`) reboots radio.

---

## 🧪 Verification

All binary codecs, EEPROM math, and CSV parsers are verified with automated tests:
```bash
npm run test
```
- `tests/tone-tables.test.ts`: CTCSS (50 tones) and DCS (104 codes) encoding.
- `tests/ysf-codec.test.ts`: 47,046-byte binary `.ysf` codeplug round-trip encoding.
- `tests/csv-codec.test.ts`: CHIRP 21-column CSV format interchange.
- `tests/eeprom-codec.test.ts`: 34-byte physical radio record layout and sector math.
- `tests/repeaterbook.test.ts`: Proximity radius calculation and repeater mapping.

---

## 📄 License
MIT License. Created with JBM High-Integrity Engineering.
