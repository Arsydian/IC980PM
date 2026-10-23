import { describe, it, expect } from 'vitest';
import {
  calculateDistanceMiles,
  searchRepeaters,
  repeaterToRadioChannel,
  parseRepeaterBookCsv,
  US_STATE_MAP
} from '../src/services/repeaterbook';
import { RepeaterBookResult } from '../src/types/radio';
import { TEST_REPEATERS } from './fixtures/test-repeaters';

function matchState(stateInRecord: string, searchState: string): boolean {
  const normSearch = searchState.trim().toUpperCase();
  const fullSearch = US_STATE_MAP[normSearch] || searchState.trim();
  const recLower = stateInRecord.toLowerCase().trim();
  return recLower.includes(fullSearch.toLowerCase()) || recLower === normSearch.toLowerCase();
}

describe('RepeaterBook Service & Math', () => {
  it('should calculate Haversine distance in miles accurately', () => {
    // New York (40.7128, -74.0060) to Hartford (41.7658, -72.6734) is ~99.5 miles
    const dist = calculateDistanceMiles(40.7128, -74.0060, 41.7658, -72.6734);
    expect(dist).toBeGreaterThan(95);
    expect(dist).toBeLessThan(105);
  });

  it('should match state names and 2-letter abbreviations bidirectionally', () => {
    expect(matchState('Florida', 'FL')).toBe(true);
    expect(matchState('Florida', 'fl')).toBe(true);
    expect(matchState('Florida', 'Florida')).toBe(true);
    expect(matchState('Texas', 'TX')).toBe(true);
    expect(matchState('New York', 'NY')).toBe(true);
    expect(matchState('California', 'CA')).toBe(true);
    expect(matchState('Ohio', 'OH')).toBe(true);
    expect(matchState('Washington', 'WA')).toBe(true);
    expect(matchState('Georgia', 'GA')).toBe(true);
    expect(matchState('Pennsylvania', 'PA')).toBe(true);
    expect(matchState('Florida', 'TX')).toBe(false);
  });

  it('should filter repeaters by state abbreviation (e.g. FL) and band', async () => {
    const results = await searchRepeaters({
      importedList: TEST_REPEATERS,
      state: 'FL',
      band: '144'
    });
    expect(results.length).toBe(1);
    expect(results[0].callsign).toBe('K4WPD');
    expect(results[0].state).toBe('Florida');
    expect(results[0].frequency).toBe(146.790);
  });

  it('should filter repeaters by state full name (e.g. Texas)', async () => {
    const results = await searchRepeaters({
      importedList: TEST_REPEATERS,
      state: 'Texas'
    });
    expect(results.length).toBe(2);
    results.forEach((r) => {
      expect(r.state.toLowerCase()).toContain('texas');
    });
  });

  it('should search repeaters by keyword or city (e.g. Orlando, Dallas)', async () => {
    const results = await searchRepeaters({
      importedList: TEST_REPEATERS,
      keyword: 'Orlando'
    });
    expect(results.length).toBe(1);
    expect(results[0].location).toContain('Orlando');
  });

  it('should perform proximity search given lat/lon and radius', async () => {
    // Orlando, FL coordinates (28.5383, -81.3792)
    const results = await searchRepeaters({
      importedList: TEST_REPEATERS,
      lat: 28.5383,
      lon: -81.3792,
      radiusMiles: 100
    });
    expect(results.length).toBe(1);
    expect(results[0].callsign).toBe('K4WPD');
    expect(results[0].distanceMiles).toBe(0);
  });

  it('should convert RepeaterBookResult to valid RadioChannel struct', () => {
    const item: RepeaterBookResult = {
      callsign: 'W1AW',
      frequency: 146.880,
      offset: 0.600,
      duplex: '-',
      toneType: 'Tone',
      toneVal: '100.0',
      location: 'Newington, CT',
      county: 'Hartford',
      state: 'Connecticut',
      use: 'OPEN'
    };

    const ch = repeaterToRadioChannel(item, 5);
    expect(ch.id).toBe(5);
    expect(ch.name).toBe('W1AW');
    expect(ch.rxFreq).toBe(146.88000);
    expect(ch.txFreq).toBe(146.28000);
    expect(ch.duplex).toBe('-');
    expect(ch.offset).toBe(0.60000);
    expect(ch.txTone.type).toBe(1);
    expect(ch.txTone.ctcss).toBe(100.0);
  });

  it('should parse RepeaterBook CSV text properly', () => {
    const sampleCsv = `Callsign,Frequency,Offset,Tone,Location,State
K4WPD,146.790,-0.600,107.2,Orlando,Florida
N4LCR,444.200,+5.000,123.0,Miami,Florida`;

    const parsed = parseRepeaterBookCsv(sampleCsv);
    expect(parsed.length).toBe(2);
    expect(parsed[0].callsign).toBe('K4WPD');
    expect(parsed[0].frequency).toBe(146.790);
    expect(parsed[0].duplex).toBe('-');
    expect(parsed[0].toneVal).toBe('107.2');
    expect(parsed[1].callsign).toBe('N4LCR');
    expect(parsed[1].frequency).toBe(444.200);
    expect(parsed[1].duplex).toBe('+');
  });
});
