import { RepeaterBookResult, RadioChannel } from '../types/radio';
import { createBlankChannel } from '../codecs/ysf-codec';
import { parseToneString } from '../codecs/tone-tables';
import { parseCsvRows } from '../codecs/csv-codec';

export const US_STATE_MAP: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia'
};

export interface RepeaterSearchParams {
  state?: string;
  county?: string;
  band?: string; // '144' (2m), '440' (70cm), 'all'
  lat?: number;
  lon?: number;
  radiusMiles?: number;
  keyword?: string;
  apiToken?: string;
  importedList?: RepeaterBookResult[];
}

/**
 * Calculates Great-Circle distance in miles using the Haversine formula
 */
export function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Converts a standard RepeaterBook entry to an IC-980 Pro Max RadioChannel
 */
export function repeaterToRadioChannel(r: RepeaterBookResult, targetChannelId: number): RadioChannel {
  const ch = createBlankChannel(targetChannelId);

  // Name: max 16 characters
  const tag = (r.callsign || r.location || 'REPEATER').trim();
  ch.name = tag.substring(0, 16);

  ch.rxFreq = Math.round(r.frequency * 1e5) / 1e5;
  ch.offset = Math.round(r.offset * 1e5) / 1e5;

  if (r.duplex === '+') {
    ch.duplex = '+';
    ch.txFreq = Math.round((ch.rxFreq + ch.offset) * 1e5) / 1e5;
  } else if (r.duplex === '-') {
    ch.duplex = '-';
    ch.txFreq = Math.round((ch.rxFreq - ch.offset) * 1e5) / 1e5;
  } else {
    ch.duplex = 'OFF';
    ch.txFreq = ch.rxFreq;
  }

  // Parse Tones
  if (r.toneVal && r.toneVal !== 'None' && r.toneVal !== 'Off') {
    const parsed = parseToneString(r.toneVal);
    ch.txTone = parsed;
    if (r.toneType === 'TSQL') {
      ch.rxTone = { ...parsed };
    }
  }

  ch.power = 1;     // High power for repeaters
  ch.bandwidth = 1; // Standard Wide FM (25 kHz)
  ch.scan = 1;      // Add to scan list
  ch.mode = 0;      // FM

  return ch;
}

/**
 * Parses CSV exported directly from RepeaterBook (or CHIRP) into RepeaterBookResult[]
 */
export function parseRepeaterBookCsv(csvText: string): RepeaterBookResult[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const callsignIdx = header.findIndex(h => /callsign|call|name/i.test(h));
  const freqIdx = header.findIndex(h => /frequency|output|downlink|rx/i.test(h));
  const offsetIdx = header.findIndex(h => /offset|input|shift/i.test(h));
  const duplexIdx = header.findIndex(h => /duplex|dir|split/i.test(h));
  const toneTypeIdx = header.findIndex(h => /tone\s*type|type/i.test(h));
  const toneValIdx = header.findIndex(h => /tone|ctcss|pl|qt/i.test(h));
  const locIdx = header.findIndex(h => /location|city/i.test(h));
  const countyIdx = header.findIndex(h => /county/i.test(h));
  const stateIdx = header.findIndex(h => /state|region|prov/i.test(h));
  const latIdx = header.findIndex(h => /lat|latitude/i.test(h));
  const lonIdx = header.findIndex(h => /lon|longitude|lng/i.test(h));
  const useIdx = header.findIndex(h => /use|access/i.test(h));

  const results: RepeaterBookResult[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < 2) continue;

    const freqStr = freqIdx !== -1 ? row[freqIdx] : '';
    const frequency = parseFloat(freqStr);
    if (!frequency || isNaN(frequency) || frequency <= 0) continue;

    let offset = 0.600;
    if (offsetIdx !== -1 && row[offsetIdx]) {
      const parsedOffset = parseFloat(row[offsetIdx]);
      if (!isNaN(parsedOffset)) offset = Math.abs(parsedOffset);
    } else if (frequency >= 420 && frequency <= 450) {
      offset = 5.000;
    }

    let duplex: '+' | '-' | 'OFF' = 'OFF';
    if (duplexIdx !== -1 && row[duplexIdx]) {
      const d = row[duplexIdx].trim();
      if (d === '+' || d === '-') duplex = d;
      else if (/pos|\+/i.test(d)) duplex = '+';
      else if (/neg|-/i.test(d)) duplex = '-';
    } else {
      if (frequency >= 144 && frequency < 147) duplex = '-';
      else if (frequency >= 147 && frequency <= 148) duplex = '+';
      else if (frequency >= 440 && frequency <= 450) duplex = '+';
    }

    const callsign = (callsignIdx !== -1 ? row[callsignIdx] : '') || 'REPEATER';
    const location = (locIdx !== -1 ? row[locIdx] : '') || '';
    const county = (countyIdx !== -1 ? row[countyIdx] : '') || '';
    const state = (stateIdx !== -1 ? row[stateIdx] : '') || '';
    const toneVal = (toneValIdx !== -1 ? row[toneValIdx] : '') || 'None';
    const toneType = (toneTypeIdx !== -1 ? row[toneTypeIdx] : '') || (toneVal && toneVal !== 'None' ? 'Tone' : 'None');
    const use = (useIdx !== -1 ? row[useIdx] : '') || 'OPEN';

    const lat = latIdx !== -1 ? parseFloat(row[latIdx]) || undefined : undefined;
    const lon = lonIdx !== -1 ? parseFloat(row[lonIdx]) || undefined : undefined;

    results.push({
      callsign,
      frequency,
      offset,
      duplex,
      toneType,
      toneVal,
      location,
      county,
      state,
      use,
      lat,
      lon
    });
  }

  return results;
}

/**
 * Normalizes state inputs between 2-letter codes and full state names
 */
function matchState(stateInRecord: string, searchState: string): boolean {
  const normSearch = searchState.trim().toUpperCase();
  const fullSearch = US_STATE_MAP[normSearch] || searchState.trim();
  const recLower = stateInRecord.toLowerCase().trim();
  return recLower.includes(fullSearch.toLowerCase()) || recLower === normSearch.toLowerCase();
}

/**
 * Searches repeaters from an imported list or queries the online RepeaterBook API
 */
export async function searchRepeaters(params: RepeaterSearchParams): Promise<RepeaterBookResult[]> {
  let results: RepeaterBookResult[] = [];

  // If user provided a staged/imported list of repeaters
  if (params.importedList && params.importedList.length > 0) {
    results = [...params.importedList];
  } else {
    // Query live RepeaterBook API if parameters are provided
    try {
      results = await fetchLiveRepeaterBook(params);
    } catch (e) {
      console.warn('RepeaterBook live query returned no data:', e);
      results = [];
    }
  }

  // State filtering
  if (params.state && params.state.trim().length > 0) {
    results = results.filter(r => matchState(r.state, params.state!));
  }

  // County filtering
  if (params.county && params.county.trim().length > 0) {
    const c = params.county.toLowerCase().trim();
    results = results.filter(r => r.county.toLowerCase().includes(c));
  }

  // Band filtering
  if (params.band && params.band !== 'all') {
    if (params.band === '144') {
      results = results.filter(r => r.frequency >= 144 && r.frequency <= 148);
    } else if (params.band === '440') {
      results = results.filter(r => r.frequency >= 420 && r.frequency <= 450);
    }
  }

  // Keyword filtering
  if (params.keyword && params.keyword.trim().length > 0) {
    const kw = params.keyword.toLowerCase().trim();
    results = results.filter(r =>
      r.callsign.toLowerCase().includes(kw) ||
      r.location.toLowerCase().includes(kw) ||
      r.county.toLowerCase().includes(kw) ||
      r.state.toLowerCase().includes(kw) ||
      r.frequency.toFixed(4).includes(kw)
    );
  }

  // Distance / Radius filtering
  if (params.lat !== undefined && params.lon !== undefined) {
    results = results.map(r => {
      const dist = (r.lat && r.lon) ? calculateDistanceMiles(params.lat!, params.lon!, r.lat, r.lon) : undefined;
      return { ...r, distanceMiles: dist };
    });

    if (params.radiusMiles && params.radiusMiles > 0) {
      results = results.filter(r => r.distanceMiles !== undefined && r.distanceMiles <= params.radiusMiles!);
    }

    results.sort((a, b) => (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999));
  }

  return results;
}

/**
 * Fetches repeaters from the RepeaterBook API
 */
export async function fetchLiveRepeaterBook(params: RepeaterSearchParams): Promise<RepeaterBookResult[]> {
  const queryParams = new URLSearchParams();
  if (params.state) queryParams.set('state', params.state);
  if (params.county) queryParams.set('county', params.county);
  if (params.lat) queryParams.set('lat', params.lat.toString());
  if (params.lon) queryParams.set('lon', params.lon.toString());
  if (params.radiusMiles) queryParams.set('distance', params.radiusMiles.toString());

  const url = `https://www.repeaterbook.com/api/export.php?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'IC980-ProMax-Programmer/1.0.1 (Radio Programming Suite)'
    }
  });

  if (!response.ok) {
    throw new Error(`RepeaterBook API responded with HTTP ${response.status}`);
  }

  const text = await response.text();
  return parseRepeaterBookCsv(text);
}
