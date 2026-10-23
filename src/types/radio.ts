export type ToneType = 0 | 1 | 2 | 3; // 0=None, 1=CTCSS, 2=DCS Normal (N), 3=DCS Inverted (I)

export interface ToneSetting {
  type: ToneType;
  ctcss: number;       // e.g. 88.5
  dcs: string;         // e.g. "023"
  noneRaw?: number;    // preserved raw value when tone is off (usually 0xFFFF)
}

export type Duplex = '+' | '-' | 'OFF' | 'SPLIT';

export interface RadioChannel {
  id: number;          // 1 to 500
  name: string;        // Up to 16 printable ASCII characters
  rxFreq: number;      // MHz (e.g. 146.52000)
  txFreq: number;      // MHz (e.g. 146.52000)
  duplex: Duplex;
  offset: number;      // MHz (e.g. 0.60000 or 5.00000); for SPLIT this mirrors |tx - rx|
  rxTone: ToneSetting;
  txTone: ToneSetting;
  power: 0 | 1;        // 0=Low, 1=High
  bandwidth: 0 | 1;    // 0=Narrow (12.5 kHz), 1=Wide (25 kHz)
  scan: 0 | 1;         // 0=DEL/Skip, 1=ADD
  busy: 0 | 1 | 2;     // 0=OFF, 1=DQT, 2=CAT
  specialDcs: 0 | 1 | 2 | 3 | 4;
  vague: 0 | 1;        // Vague Subaudio (0=OFF, 1=ON)
  compander: 0 | 1;    // 0=OFF, 1=ON
  scrambler: number;   // 0=OFF, 1..8
  mode: 0 | 1;         // 0=FM, 1=AM (Airband reception)
  rxSig: 0 | 1 | 2 | 3;// 0=OFF, 1=DTMF, 2=FSK, 3=FSK DTMF
  pushCode: number;    // 0=OFF, 1=ID, 2..31=Code 1..30
  popCode: number;     // 0=OFF, 1=ID, 2..31=Code 1..30
  rawBytes?: number[];    // Original 85-byte .ysf record (unknown bits are preserved on save)
  eepromBytes?: number[]; // Original 34-byte radio record (unknown bits are preserved on write)
}

export type HandsetKeyFunction =
  | 0x00  // Unassigned
  | 0x01  // Monitor (Toggle Squelch Open)
  | 0x02  // Monitor Momentary
  | 0x03  // Scan Start/Stop
  | 0x04  // Reverse Frequency (Monitor Repeater Input)
  | 0x08  // FM Broadcast Radio (65-108 MHz)
  | 0x09  // Emergency Alarm Beep
  | 0x0B  // Emergency Warning Light
  | 0x0C; // Frequency Match Sweep

export interface HandsetKeySettings {
  key1Short: HandsetKeyFunction;
  key1Long: HandsetKeyFunction;
  key2Short: HandsetKeyFunction;
  key2Long: HandsetKeyFunction;
  key3Short: HandsetKeyFunction;
  key3Long: HandsetKeyFunction;
}

/** Data stored outside the 500 channel records of a .ysf codeplug. */
export interface CodeplugExtras {
  keys: HandsetKeySettings;
  powerOnMessage: string;
  vfos: RadioChannel[];          // 2 channel-format records in the file header
  tailMemories: RadioChannel[];  // 7 channel-format records at the end of the settings block
}

export interface RepeaterBookResult {
  callsign: string;
  frequency: number;   // Output (radio RX), MHz
  inputFrequency?: number; // Repeater input (radio TX), MHz
  offset: number;      // MHz, always positive
  duplex: '+' | '-' | 'OFF' | 'SPLIT';
  duplexGuessed?: boolean; // the source gave no direction; it was taken from the US band plan
  txTone: ToneSetting; // Uplink tone (radio TX)
  rxTone: ToneSetting; // Downlink tone (radio RX / TSQL)
  narrow?: boolean;
  location: string;
  county: string;
  state: string;
  country?: string;
  use: string;         // 'OPEN', 'CLOSED', 'PRIVATE', ...
  status?: string;     // 'On-air', 'Off-air', 'Testing', 'Unknown'
  analog?: boolean;    // FM analog capable
  lat?: number;
  lon?: number;
  distanceMiles?: number;
  detailUrl?: string;
}
