import { RadioChannel, RepeaterBookResult, ToneSetting } from '../types/radio';
import { createBlankChannel, deriveDuplex, isChannelEmpty, roundMHz } from '../codecs/channel';
import { createEmptyTone, parseToneString, sameTone } from '../codecs/tone-tables';
import { parseCsvRows } from '../codecs/csv-parse';
import { detectCsvFormat, parseCsvChannels } from '../codecs/csv-codec';
import { getRegion, isHardwareTx, RegionId } from '../codecs/band-plans';
import { toRadioAscii } from '../codecs/text';
import { desktop } from '../platform';

export const RB_ATTRIBUTION = 'Data courtesy of RepeaterBook.com';
export const RB_HOME = 'https://www.repeaterbook.com';
export const RB_TOKEN_PAGE = 'https://www.repeaterbook.com/user/api_apps.php';

export const US_STATES: { abbr: string; name: string; fips: string }[] = [
  ['AL', 'Alabama', '01'], ['AK', 'Alaska', '02'], ['AZ', 'Arizona', '04'], ['AR', 'Arkansas', '05'],
  ['CA', 'California', '06'], ['CO', 'Colorado', '08'], ['CT', 'Connecticut', '09'], ['DE', 'Delaware', '10'],
  ['DC', 'District of Columbia', '11'], ['FL', 'Florida', '12'], ['GA', 'Georgia', '13'], ['HI', 'Hawaii', '15'],
  ['ID', 'Idaho', '16'], ['IL', 'Illinois', '17'], ['IN', 'Indiana', '18'], ['IA', 'Iowa', '19'],
  ['KS', 'Kansas', '20'], ['KY', 'Kentucky', '21'], ['LA', 'Louisiana', '22'], ['ME', 'Maine', '23'],
  ['MD', 'Maryland', '24'], ['MA', 'Massachusetts', '25'], ['MI', 'Michigan', '26'], ['MN', 'Minnesota', '27'],
  ['MS', 'Mississippi', '28'], ['MO', 'Missouri', '29'], ['MT', 'Montana', '30'], ['NE', 'Nebraska', '31'],
  ['NV', 'Nevada', '32'], ['NH', 'New Hampshire', '33'], ['NJ', 'New Jersey', '34'], ['NM', 'New Mexico', '35'],
  ['NY', 'New York', '36'], ['NC', 'North Carolina', '37'], ['ND', 'North Dakota', '38'], ['OH', 'Ohio', '39'],
  ['OK', 'Oklahoma', '40'], ['OR', 'Oregon', '41'], ['PA', 'Pennsylvania', '42'], ['RI', 'Rhode Island', '44'],
  ['SC', 'South Carolina', '45'], ['SD', 'South Dakota', '46'], ['TN', 'Tennessee', '47'], ['TX', 'Texas', '48'],
  ['UT', 'Utah', '49'], ['VT', 'Vermont', '50'], ['VA', 'Virginia', '51'], ['WA', 'Washington', '53'],
  ['WV', 'West Virginia', '54'], ['WI', 'Wisconsin', '55'], ['WY', 'Wyoming', '56']
].map(([abbr, name, fips]) => ({ abbr, name, fips }));

export const CANADIAN_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories',
  'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'
];

/** Great-circle distance in miles (Haversine). */
export function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** True when a record's state matches a 2-letter code or (part of) a state/province name. */
export function matchState(stateInRecord: string, search: string): boolean {
  const s = search.trim();
  if (!s) return true;
  const rec = (stateInRecord || '').trim().toLowerCase();
  const us = US_STATES.find((st) => st.abbr === s.toUpperCase());
  if (us) return rec === us.name.toLowerCase() || rec === us.abbr.toLowerCase();
  return rec.includes(s.toLowerCase());
}

// ---------- Duplex helpers ----------

/** US/Canada band-plan guess, used only when a source gives no direction, offset or input frequency. */
function guessNorthAmericanShift(freq: number): { duplex: '+' | '-' | 'OFF'; offset: number } {
  if (freq >= 145.1 && freq < 145.5) return { duplex: '-', offset: 0.6 };
  if (freq >= 146.0 && freq < 146.4) return { duplex: '+', offset: 0.6 };
  if (freq >= 146.6 && freq < 147.0) return { duplex: '-', offset: 0.6 };
  if (freq >= 147.0 && freq < 147.4) return { duplex: '+', offset: 0.6 };
  if (freq >= 442 && freq < 445) return { duplex: '+', offset: 5 };
  if (freq >= 447 && freq < 450) return { duplex: '-', offset: 5 };
  return { duplex: 'OFF', offset: 0 };
}

function shiftFromInput(output: number, input: number | undefined) {
  if (!(input && input > 0)) return null;
  return deriveDuplex(output, input);
}

// ---------- JSON (API) ----------

function field(obj: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(obj).find((k) => k.toLowerCase() === n.toLowerCase());
    if (key && obj[key] !== null && obj[key] !== undefined && String(obj[key]).trim() !== '') return String(obj[key]).trim();
  }
  return '';
}

const toneOrNone = (s: string): ToneSetting => (s ? parseToneString(s) : createEmptyTone());
const yesNo = (s: string): boolean | undefined => (s ? /^(yes|y|true|1)$/i.test(s) : undefined);
const num = (s: string): number | undefined => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : undefined;
};

export function parseRepeaterBookJson(text: string): RepeaterBookResult[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RepeaterBookError('RepeaterBook returned something that is not JSON.');
  }
  if (json && !Array.isArray(json) && (json.error || json.code) && !json.results) {
    throw RepeaterBookError.fromCode(String(json.error ?? json.code), json.message);
  }
  const rows: Record<string, unknown>[] = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : [];
  const out: RepeaterBookResult[] = [];
  for (const r of rows) {
    const frequency = num(field(r, 'Frequency'));
    if (!frequency || frequency <= 0) continue;
    const inputFrequency = num(field(r, 'Input Freq', 'Input Frequency'));
    const shift = shiftFromInput(frequency, inputFrequency) ?? { duplex: 'OFF' as const, offset: 0 };
    const stateId = field(r, 'State ID');
    const rptrId = field(r, 'Rptr ID');
    const bandwidth = field(r, 'FM Bandwidth');
    out.push({
      callsign: field(r, 'Callsign') || 'REPEATER',
      frequency: roundMHz(frequency),
      inputFrequency: inputFrequency ? roundMHz(inputFrequency) : undefined,
      offset: shift.offset,
      duplex: shift.duplex,
      txTone: toneOrNone(field(r, 'PL', 'PL/CTCSS Uplink')),
      rxTone: toneOrNone(field(r, 'TSQ', 'PL/CTCSS TSQ Downlink')),
      narrow: bandwidth ? /12\.5/.test(bandwidth) : undefined,
      location: field(r, 'Nearest City', 'City', 'Landmark'),
      county: field(r, 'County'),
      state: field(r, 'State', 'Region'),
      country: field(r, 'Country'),
      use: field(r, 'Use', 'Use/Membership') || 'OPEN',
      status: field(r, 'Operational Status') || undefined,
      analog: yesNo(field(r, 'FM Analog', 'Analog Capable')),
      lat: num(field(r, 'Lat', 'Latitude')),
      lon: num(field(r, 'Long', 'Lon', 'Longitude')),
      detailUrl: stateId && rptrId ? `${RB_HOME}/repeaters/details.php?state_id=${encodeURIComponent(stateId)}&ID=${encodeURIComponent(rptrId)}` : undefined
    });
  }
  return out;
}

// ---------- CSV (files exported from RepeaterBook, CHIRP or the OEM software) ----------

const COLUMN_NAMES: Record<string, string[]> = {
  callsign: ['callsign', 'call', 'call sign'],
  frequency: ['frequency', 'output', 'output freq', 'output frequency', 'downlink', 'rx', 'rx freq'],
  input: ['input freq', 'input', 'input frequency', 'uplink', 'tx', 'tx freq'],
  offset: ['offset', 'shift'],
  duplex: ['duplex', 'direction', 'dir', 'offset direction'],
  tone: ['pl', 'tone', 'ctcss', 'uplink tone', 'pl/ctcss', 'pl/ctcss uplink', 'access tone', 'tx tone', 'encode'],
  tsq: ['tsq', 'downlink tone', 'pl/ctcss tsq downlink', 'rx tone', 'decode'],
  location: ['location', 'city', 'nearest city', 'landmark'],
  county: ['county'],
  state: ['state', 'province', 'region', 'st/pr'],
  country: ['country'],
  lat: ['lat', 'latitude'],
  lon: ['lon', 'long', 'longitude', 'lng'],
  use: ['use', 'use/membership', 'access'],
  status: ['operational status', 'status']
};

function columnIndex(header: string[], key: string): number {
  const norm = header.map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  for (const name of COLUMN_NAMES[key]) {
    const idx = norm.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function channelToResult(ch: RadioChannel): RepeaterBookResult {
  const tx = ch.txFreq > 0 ? ch.txFreq : ch.rxFreq;
  const { duplex, offset } = deriveDuplex(ch.rxFreq, tx);
  return {
    callsign: ch.name || 'REPEATER',
    frequency: ch.rxFreq,
    inputFrequency: tx,
    offset,
    duplex,
    txTone: { ...ch.txTone },
    rxTone: { ...ch.rxTone },
    narrow: ch.bandwidth === 0,
    location: '',
    county: '',
    state: '',
    use: 'OPEN'
  };
}

/**
 * Parses a RepeaterBook CSV download. CHIRP and OEM CPS CSV files are recognised
 * and parsed with their own codecs, so their tone columns are read correctly.
 */
export function parseRepeaterBookCsv(csvText: string, region: RegionId = 'US'): RepeaterBookResult[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];
  const header = rows[0];

  if (detectCsvFormat(header) !== 'unknown') {
    return parseCsvChannels(csvText).channels.map((p) => channelToResult(p.channel));
  }

  const idx = Object.fromEntries(Object.keys(COLUMN_NAMES).map((k) => [k, columnIndex(header, k)])) as Record<string, number>;
  if (idx.frequency === -1) return [];
  const cell = (row: string[], key: string) => (idx[key] !== -1 ? (row[idx[key]] ?? '').trim() : '');
  const northAmerica = getRegion(region).repeaterBook === 'NA';

  const results: RepeaterBookResult[] = [];
  for (const row of rows.slice(1)) {
    const frequency = parseFloat(cell(row, 'frequency'));
    if (!(frequency > 0)) continue;

    const input = parseFloat(cell(row, 'input'));
    const offsetText = cell(row, 'offset');
    const offsetValue = parseFloat(offsetText);
    const duplexText = cell(row, 'duplex').toLowerCase();

    let duplex: RepeaterBookResult['duplex'] = 'OFF';
    let offset = 0;
    let guessed = false;
    const fromInput = shiftFromInput(frequency, input > 0 ? input : undefined);
    if (fromInput) {
      ({ duplex, offset } = fromInput);
    } else {
      offset = Number.isFinite(offsetValue) ? Math.abs(offsetValue) : 0;
      if (duplexText === '+' || /^(pos|plus|up)/.test(duplexText)) duplex = '+';
      else if (duplexText === '-' || /^(neg|minus|down)/.test(duplexText)) duplex = '-';
      else if (/split/.test(duplexText)) duplex = 'SPLIT';
      else if (/^[+-]/.test(offsetText) && offset > 0) duplex = offsetText.startsWith('-') ? '-' : '+';
      else if (!duplexText && !offsetText && northAmerica) {
        ({ duplex, offset } = guessNorthAmericanShift(frequency));
        guessed = duplex !== 'OFF';
      }
      if ((duplex === '+' || duplex === '-') && offset === 0 && northAmerica) {
        offset = frequency >= 400 ? 5 : 0.6;
      }
    }

    results.push({
      callsign: cell(row, 'callsign') || 'REPEATER',
      frequency: roundMHz(frequency),
      inputFrequency: input > 0 ? roundMHz(input) : undefined,
      offset: roundMHz(offset),
      duplex,
      duplexGuessed: guessed || undefined,
      txTone: toneOrNone(cell(row, 'tone')),
      rxTone: toneOrNone(cell(row, 'tsq')),
      location: cell(row, 'location'),
      county: cell(row, 'county'),
      state: cell(row, 'state'),
      country: cell(row, 'country') || undefined,
      use: cell(row, 'use') || 'OPEN',
      status: cell(row, 'status') || undefined,
      lat: num(cell(row, 'lat')),
      lon: num(cell(row, 'lon'))
    });
  }
  return results;
}

// ---------- API access ----------

export class RepeaterBookError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
  }

  static fromCode(code: string, detail?: string, status?: number): RepeaterBookError {
    const messages: Record<string, string> = {
      auth_missing: 'RepeaterBook needs your API token. Add it in the key settings.',
      auth_invalid: 'RepeaterBook rejected the token format. Paste the full rbuapp_ token again.',
      auth_inactive: 'Your RepeaterBook token or this app is not active yet.',
      auth_revoked: 'Your RepeaterBook token was revoked. Generate a new one.',
      auth_scope_denied: 'Your token is not approved for this region\'s endpoint.',
      ua_mismatch: 'RepeaterBook did not accept this app\'s User-Agent. Check your contact details in the key settings.',
      rate_limited: 'RepeaterBook is rate-limiting requests. Wait a while before searching again.'
    };
    return new RepeaterBookError(messages[code] ?? `RepeaterBook error: ${detail || code}`, code, status);
  }
}

export interface RepeaterQuery {
  region: RegionId;
  /** US: 2-letter code; elsewhere a state, province or region name. */
  state?: string;
  county?: string;
  city?: string;
  callsign?: string;
}

export function buildRepeaterBookUrl(q: RepeaterQuery): string {
  const region = getRegion(q.region);
  if (!region.repeaterBook || !region.rbCountry) {
    throw new RepeaterBookError('Pick a country to search RepeaterBook.');
  }
  const params = new URLSearchParams();
  if (region.repeaterBook === 'NA') {
    params.set('country', region.rbCountry);
    const us = q.region === 'US' && q.state ? US_STATES.find((s) => s.abbr === q.state!.toUpperCase()) : undefined;
    if (us) params.set('state_id', us.fips);
    if (q.county) params.set('county', q.county);
  } else {
    params.set('country', region.rbCountry);
    if (q.state) params.set('region', q.state);
  }
  if (q.city) params.set('city', q.city);
  if (q.callsign) params.set('callsign', q.callsign);
  const endpoint = region.repeaterBook === 'NA' ? 'export.php' : 'exportROW.php';
  return `${RB_HOME}/api/${endpoint}?${params.toString()}`;
}

/** Most recent responses, kept in memory for this session only (RepeaterBook's caching policy). */
const cache = new Map<string, { at: number; results: RepeaterBookResult[] }>();
const CACHE_MS = 30 * 60 * 1000;

export async function fetchRepeaterBook(q: RepeaterQuery, contact: string): Promise<RepeaterBookResult[]> {
  const url = buildRepeaterBookUrl(q);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  if (!desktop) {
    throw new RepeaterBookError('Live RepeaterBook search runs in the desktop app (browsers block the request). In the browser, download a CSV from RepeaterBook and use "Load CSV".');
  }

  const res = await desktop.repeaterBookFetch(url, contact);
  if (res.status === 429) throw RepeaterBookError.fromCode('rate_limited', undefined, 429);
  if (res.status < 200 || res.status >= 300) {
    let code = '';
    try {
      code = JSON.parse(res.body)?.error ?? '';
    } catch {
      // not JSON
    }
    if (code) throw RepeaterBookError.fromCode(code, undefined, res.status);
    throw new RepeaterBookError(`RepeaterBook responded with HTTP ${res.status}.`, undefined, res.status);
  }
  const results = parseRepeaterBookJson(res.body);
  if (cache.size > 20) cache.clear();
  cache.set(url, { at: Date.now(), results });
  return results;
}

// ---------- Filtering & conversion ----------

export interface RepeaterFilter {
  band?: 'all' | '144' | '440';
  keyword?: string;
  state?: string;
  onlyOnAir?: boolean;
  onlyAnalog?: boolean;
  origin?: { lat: number; lon: number };
  radiusMiles?: number;
}

export function filterRepeaters<T extends RepeaterBookResult>(results: T[], f: RepeaterFilter): T[] {
  let out = results.filter((r) => isHardwareTx(r.frequency));
  if (f.state) out = out.filter((r) => matchState(r.state, f.state!));
  if (f.band === '144') out = out.filter((r) => r.frequency >= 144 && r.frequency <= 148);
  if (f.band === '440') out = out.filter((r) => r.frequency >= 420 && r.frequency <= 450);
  if (f.onlyAnalog) out = out.filter((r) => r.analog !== false);
  if (f.onlyOnAir) out = out.filter((r) => !r.status || /on-?air/i.test(r.status));
  if (f.keyword?.trim()) {
    const kw = f.keyword.trim().toLowerCase();
    out = out.filter((r) =>
      [r.callsign, r.location, r.county, r.state].some((s) => (s || '').toLowerCase().includes(kw)) ||
      r.frequency.toFixed(4).includes(kw));
  }
  if (f.origin) {
    const { lat, lon } = f.origin;
    out = out.map((r) => ({
      ...r,
      distanceMiles: r.lat !== undefined && r.lon !== undefined ? calculateDistanceMiles(lat, lon, r.lat, r.lon) : undefined
    }));
    if (f.radiusMiles && f.radiusMiles > 0) {
      out = out.filter((r) => r.distanceMiles !== undefined && r.distanceMiles <= f.radiusMiles!);
    }
    out.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  }
  return out;
}

/** True when a channel with the same RX/TX frequencies and tones is already programmed. */
export function isAlreadyProgrammed(r: RepeaterBookResult, channels: RadioChannel[]): boolean {
  const tx = r.inputFrequency ?? (r.duplex === '+' ? r.frequency + r.offset : r.duplex === '-' ? r.frequency - r.offset : r.frequency);
  return channels.some((ch) =>
    !isChannelEmpty(ch) &&
    Math.abs(ch.rxFreq - r.frequency) < 0.0005 &&
    Math.abs((ch.txFreq || ch.rxFreq) - tx) < 0.0005 &&
    sameTone(ch.txTone, r.txTone));
}

export type NameFormat = 'callsign' | 'callsign-city' | 'city';

export function repeaterToRadioChannel(r: RepeaterBookResult, targetChannelId: number, nameFormat: NameFormat = 'callsign'): RadioChannel {
  const ch = createBlankChannel(targetChannelId);
  const city = (r.location || '').split(',')[0].trim();
  const name = nameFormat === 'city' ? city || r.callsign
    : nameFormat === 'callsign-city' ? [r.callsign, city].filter(Boolean).join(' ')
      : r.callsign || city;
  ch.name = toRadioAscii(name || 'REPEATER');

  ch.rxFreq = roundMHz(r.frequency);
  if (r.inputFrequency && r.inputFrequency > 0) {
    ch.txFreq = roundMHz(r.inputFrequency);
    Object.assign(ch, deriveDuplex(ch.rxFreq, ch.txFreq));
  } else {
    ch.offset = roundMHz(r.offset);
    ch.duplex = r.duplex;
    ch.txFreq = r.duplex === '+' ? roundMHz(ch.rxFreq + ch.offset)
      : r.duplex === '-' ? roundMHz(ch.rxFreq - ch.offset)
        : ch.rxFreq;
    if (r.duplex === 'SPLIT') ch.duplex = 'OFF';
  }

  ch.txTone = { ...r.txTone };
  ch.rxTone = { ...r.rxTone };
  ch.power = 1;
  ch.bandwidth = r.narrow ? 0 : 1;
  ch.scan = 1;
  ch.mode = 0;
  return ch;
}
