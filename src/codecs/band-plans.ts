export interface FrequencyRange {
  min: number; // MHz, inclusive
  max: number; // MHz, inclusive
  label: string;
}

export type RegionId = 'US' | 'CA' | 'GB' | 'IE' | 'AU' | 'NZ' | 'ZA' | 'OTHER';

export interface RegionInfo {
  id: RegionId;
  name: string;
  /** RepeaterBook endpoint: North America (export.php) or rest of world (exportROW.php). */
  repeaterBook: 'NA' | 'ROW' | null;
  /** Country name as RepeaterBook spells it. */
  rbCountry?: string;
  /** Amateur 2 m / 70 cm allocations the radio can reach. Check your own licence conditions. */
  amateurTx: FrequencyRange[];
  /** Usual repeater shift, used only when an import gives a direction but no offset. */
  defaultOffsets?: { vhf: number; uhf: number };
}

/** What the radio hardware covers (from the OEM software's band limits). */
export const HARDWARE_TX_RANGES: FrequencyRange[] = [
  { min: 134, max: 176, label: 'VHF' },
  { min: 400, max: 475, label: 'UHF' }
];
export const AIRBAND_RX: FrequencyRange = { min: 108, max: 136, label: 'Airband (AM receive only)' };

export const REGIONS: RegionInfo[] = [
  {
    id: 'US', name: 'United States', repeaterBook: 'NA', rbCountry: 'United States',
    amateurTx: [{ min: 144, max: 148, label: '2 m' }, { min: 420, max: 450, label: '70 cm' }],
    defaultOffsets: { vhf: 0.6, uhf: 5 }
  },
  {
    id: 'CA', name: 'Canada', repeaterBook: 'NA', rbCountry: 'Canada',
    amateurTx: [{ min: 144, max: 148, label: '2 m' }, { min: 430, max: 450, label: '70 cm' }],
    defaultOffsets: { vhf: 0.6, uhf: 5 }
  },
  {
    id: 'GB', name: 'United Kingdom', repeaterBook: 'ROW', rbCountry: 'United Kingdom',
    amateurTx: [{ min: 144, max: 146, label: '2 m' }, { min: 430, max: 440, label: '70 cm' }]
  },
  {
    id: 'IE', name: 'Ireland', repeaterBook: 'ROW', rbCountry: 'Ireland',
    amateurTx: [{ min: 144, max: 146, label: '2 m' }, { min: 430, max: 440, label: '70 cm' }]
  },
  {
    id: 'AU', name: 'Australia', repeaterBook: 'ROW', rbCountry: 'Australia',
    amateurTx: [{ min: 144, max: 148, label: '2 m' }, { min: 420, max: 450, label: '70 cm' }]
  },
  {
    id: 'NZ', name: 'New Zealand', repeaterBook: 'ROW', rbCountry: 'New Zealand',
    amateurTx: [{ min: 144, max: 148, label: '2 m' }, { min: 430, max: 440, label: '70 cm' }]
  },
  {
    id: 'ZA', name: 'South Africa', repeaterBook: 'ROW', rbCountry: 'South Africa',
    amateurTx: [{ min: 144, max: 146, label: '2 m' }, { min: 430, max: 440, label: '70 cm' }]
  },
  {
    id: 'OTHER', name: 'Other (hardware limits only)', repeaterBook: null,
    amateurTx: []
  }
];

export function getRegion(id: RegionId): RegionInfo {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

export const inRange = (mhz: number, r: FrequencyRange) => mhz >= r.min && mhz <= r.max;

export function isHardwareTx(mhz: number): boolean {
  return HARDWARE_TX_RANGES.some((r) => inRange(mhz, r));
}

export function isHardwareRx(mhz: number): boolean {
  return isHardwareTx(mhz) || inRange(mhz, AIRBAND_RX);
}

/** True when the region has no amateur limits configured, or the frequency is inside one. */
export function isAmateurTx(mhz: number, region: RegionInfo): boolean {
  return region.amateurTx.length === 0 || region.amateurTx.some((r) => inRange(mhz, r));
}

export type Band = 'vhf' | 'uhf' | 'air' | 'other';

export function bandOf(mhz: number): Band {
  if (inRange(mhz, AIRBAND_RX) && mhz < 134) return 'air';
  if (inRange(mhz, HARDWARE_TX_RANGES[0])) return 'vhf';
  if (inRange(mhz, HARDWARE_TX_RANGES[1])) return 'uhf';
  return 'other';
}
