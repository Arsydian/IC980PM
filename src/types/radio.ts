export type ToneType = 0 | 1 | 2 | 3; // 0=None, 1=CTCSS, 2=DCS Normal (N), 3=DCS Inverted (I)

export interface ToneSetting {
  type: ToneType;
  ctcss: number;       // e.g. 88.5
  dcs: string;         // e.g. "023"
  noneRaw?: number;    // preserved raw value when tone is off (usually 0xFFFF)
}

export interface RadioChannel {
  id: number;          // 1 to 500
  name: string;        // Up to 16 ASCII characters
  rxFreq: number;      // MHz (e.g. 146.52000)
  txFreq: number;      // MHz (e.g. 146.52000)
  duplex: '+' | '-' | 'OFF' | 'SPLIT';
  offset: number;      // MHz (e.g. 0.60000 or 5.00000)
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
  rawBytes?: number[]; // Raw 85-byte vendor record
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

export interface RadioSettings {
  powerOnDisplay: 0 | 1;     // 0 = Message, 1 = Voltage
  powerOnMsg: string;        // Up to 7 characters
  squelch: number;           // 0 to 9
  tot: number;               // Timeout Timer (0=OFF, 30..300 seconds)
  vox: number;               // 0=OFF, 1..9
  voicePrompt: 0 | 1 | 2;    // 0=OFF, 1=Chinese, 2=English
  rogerBeep: 0 | 1 | 2;      // 0=OFF, 1=ROGER1, 2=ROGER2
  keyBeep: 0 | 1;            // 0=OFF, 1=ON
  backlightTimeout: number;  // 0=Always ON, 5, 10, 15, 20s
  frequencyStep: number;     // Index for 2.5K, 5K, 6.25K, 10K, 12.5K, 25K
  tailEliminate: 0 | 1;      // 0=OFF, 1=ON
  dualWatch: 0 | 1;          // 0=OFF, 1=ON
  keys: HandsetKeySettings;  // Microphone & programmable handset keys
}

export interface RepeaterBookResult {
  callsign: string;
  frequency: number;   // MHz
  offset: number;      // MHz
  duplex: string;      // '+', '-', 'OFF', 'Split'
  toneType: string;    // 'Tone', 'TSQL', 'DTCS', 'None'
  toneVal: string;     // e.g. "88.5" or "023"
  tonePolarity?: string; // 'NN', 'RI', etc.
  location: string;
  county: string;
  state: string;
  use: string;         // 'OPEN', 'CLOSED', etc.
  lat?: number;
  lon?: number;
  distanceMiles?: number;
}
