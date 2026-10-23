# IC-980 Pro Max Programmer

![Version](https://img.shields.io/badge/version-v1.2.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-emerald.svg)
![License](https://img.shields.io/badge/license-MIT-purple.svg)

Desktop programming software for the **Hiroyasu IC-980 Pro Max** radio: a 500-channel editor,
`.ysf` codeplug files, CHIRP and OEM CSV, and RepeaterBook import.

> **Status: radio reading and writing over USB has not been tested on a real radio.**
> The protocol was reverse-engineered from the OEM software. The app reads and backs up the radio
> before every write and verifies what it writes, but keep the OEM software handy until someone has
> confirmed it works. Reports (good or bad) are very welcome.

## Features

- **Channel editor** — all 500 channels with every per-channel setting (tones, power, bandwidth, scan,
  AM/FM, busy lock, scrambler, compander, special DCS, PTT ANI codes). Undo/redo, multi-select
  (Shift/Ctrl-click), copy/cut/paste (also to and from spreadsheets), move, insert, delete-and-shift,
  sort, remove gaps, bulk edits, search and filters. Unsaved work is kept as a draft and offered back
  after a crash.
- **Checks** — flags transmit frequencies outside the radio's range or outside your region's amateur
  2 m / 70 cm allocations (US, Canada, UK, Ireland, Australia, New Zealand, South Africa), duplicates,
  and other mistakes. Errors block writing to the radio; warnings need confirming.
- **Radio over USB** (Prolific, FTDI, CH340 and CP210x cables) — read, write and restore. Every write
  first reads the radio and saves a backup (`.ic980bak`), then verifies each block. Writes can be
  cancelled; the radio is always told to leave programming mode. A built-in **simulated radio** lets you
  try all of it without hardware.
- **Files** — `.ysf` codeplugs (bytes the app doesn't understand are kept), CHIRP CSV and the OEM CPS's
  18-column CSV (import and export, channel numbers preserved).
- **Radio settings** — handset key assignments, power-on message, VFO A/B and the settings-block memories.
  Global settings such as squelch and TOT aren't mapped yet; **Tools → Compare two .ysf files** helps map
  them (see [docs/MAPPING.md](docs/MAPPING.md)).
- **RepeaterBook** — search by country, state/province, county or city (desktop app), or load a
  RepeaterBook/CHIRP CSV. Filters for band, distance, on-air, FM analog, and repeaters you already have.
  Data courtesy of [RepeaterBook.com](https://www.repeaterbook.com).
- **CHIRP driver (draft)** — [tools/chirp](tools/chirp) has an experimental CHIRP driver using the same
  protocol.

## Install and run

Requires Node.js 20 or newer.

```bash
npm install
npm run dev:electron   # desktop app with hot reload
npm run dev            # browser only (Chrome or Edge for USB)
npm test               # test suite, including a simulated radio
```

Build installers for the current platform (output in `release/`):

```bash
npm run dist           # or dist:win, dist:mac, dist:linux
```

macOS builds are unsigned unless you configure signing; Gatekeeper will ask for confirmation.
On Linux, add your user to the `dialout` (or `uucp`) group to use the serial port.

## RepeaterBook access

RepeaterBook's API requires an approved application and a personal token for each user.

1. Sign in at RepeaterBook and open **API Apps** (`https://www.repeaterbook.com/user/api_apps.php`).
2. Generate a token for this app and copy it (it is shown once).
3. In the app: **RepeaterBook → key icon**, enter your callsign and email (RepeaterBook requires contact
   details with each request) and paste the token.

The token is stored with the operating system's encrypted storage and is only sent to
`www.repeaterbook.com`. Results are kept in memory for the current session only. Live search runs in the
desktop app; in a browser, download a CSV from RepeaterBook and use **Load CSV**.

## Protocol

115200 baud, 8-N-1. The host sends `PROG81LS`, the radio answers `A`; the host sends `0x02`, the radio
answers `P3207\xFF\xFF\xFF`; the host sends `0x06`, the radio answers `0x06`. Blocks are read with
`R a2 a1 a0 len` (reply `W a2 a1 a0 len data…`, acknowledged with `0x06`) and written with
`W a2 a1 a0 len data…` (reply `0x06`). `E` ends the session. Channel *i* is at
`0x1000 + ⌊i/32⌋·0x1000 + (i mod 32)·34`. Full details: [docs/MAPPING.md](docs/MAPPING.md).

## Project layout

- `src/codecs` — file formats, radio memory layout, validation, row operations (no UI code)
- `src/services` — serial protocol, radio operations, simulator, RepeaterBook
- `src/components`, `src/App.tsx` — the interface
- `electron` — desktop shell (serial port picker, RepeaterBook requests, backups)
- `tests` — Vitest suite

## License

MIT © 2026 Arsydian. The CHIRP driver in `tools/chirp` is GPL-3.0-or-later, as CHIRP requires.
Not affiliated with Hiroyasu or RepeaterBook.
