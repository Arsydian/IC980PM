import { describe, it, expect } from 'vitest';
import {
  buildRepeaterBookUrl,
  calculateDistanceMiles,
  filterRepeaters,
  isAlreadyProgrammed,
  matchState,
  parseRepeaterBookCsv,
  parseRepeaterBookJson,
  repeaterToRadioChannel
} from '../src/services/repeaterbook';
import { createBlankChannel, createBlankChannels } from '../src/codecs/channel';
import { TEST_REPEATERS } from './fixtures/test-repeaters';

describe('RepeaterBook service', () => {
  it('calculates Haversine distance in miles', () => {
    const dist = calculateDistanceMiles(40.7128, -74.006, 41.7658, -72.6734);
    expect(dist).toBeGreaterThan(95);
    expect(dist).toBeLessThan(105);
  });

  it('matches state names and 2-letter abbreviations', () => {
    expect(matchState('Florida', 'FL')).toBe(true);
    expect(matchState('Florida', 'fl')).toBe(true);
    expect(matchState('Florida', 'Florida')).toBe(true);
    expect(matchState('New York', 'NY')).toBe(true);
    expect(matchState('Florida', 'TX')).toBe(false);
    expect(matchState('Ontario', 'ont')).toBe(true);
  });

  it('builds North America and rest-of-world export URLs', () => {
    expect(buildRepeaterBookUrl({ region: 'US', state: 'VA', county: 'Fairfax' }))
      .toBe('https://www.repeaterbook.com/api/export.php?country=United+States&state_id=51&county=Fairfax');
    expect(buildRepeaterBookUrl({ region: 'GB', city: 'London' }))
      .toBe('https://www.repeaterbook.com/api/exportROW.php?country=United+Kingdom&city=London');
  });

  it('parses the export API JSON format', () => {
    const json = JSON.stringify({
      count: 2,
      results: [
        {
          'State ID': '12', 'Rptr ID': '345', Frequency: '146.79000', 'Input Freq': '146.19000', PL: '107.2', TSQ: '',
          'Nearest City': 'Orlando', County: 'Orange', State: 'Florida', Country: 'United States', Lat: '28.53', Long: '-81.37',
          Callsign: 'K4ABC', Use: 'OPEN', 'Operational Status': 'On-air', 'FM Analog': 'Yes', 'FM Bandwidth': '25 kHz'
        },
        {
          Frequency: '444.20000', 'Input Freq': '449.20000', PL: 'D023', TSQ: 'D023', Callsign: 'N4XYZ',
          'Operational Status': 'Off-air', 'FM Analog': 'No'
        }
      ]
    });
    const [a, b] = parseRepeaterBookJson(json);
    expect(a).toMatchObject({ callsign: 'K4ABC', frequency: 146.79, duplex: '-', offset: 0.6, status: 'On-air', analog: true, narrow: false });
    expect(a.txTone).toMatchObject({ type: 1, ctcss: 107.2 });
    expect(a.detailUrl).toContain('state_id=12&ID=345');
    expect(b).toMatchObject({ duplex: '+', offset: 5, analog: false });
    expect(b.rxTone).toMatchObject({ type: 2, dcs: '023' });

    const usable = filterRepeaters([a, b], { onlyOnAir: true, onlyAnalog: true });
    expect(usable.map((r) => r.callsign)).toEqual(['K4ABC']);
  });

  it('turns API error codes into readable messages', () => {
    expect(() => parseRepeaterBookJson('{"error":"auth_revoked"}')).toThrow(/revoked/);
  });

  it('filters by state, band, keyword and proximity', () => {
    expect(filterRepeaters(TEST_REPEATERS, { state: 'FL', band: '144' }).map((r) => r.callsign)).toEqual(['K4WPD']);
    expect(filterRepeaters(TEST_REPEATERS, { state: 'Texas' })).toHaveLength(2);
    expect(filterRepeaters(TEST_REPEATERS, { keyword: 'Orlando' })).toHaveLength(1);
    const near = filterRepeaters(TEST_REPEATERS, { origin: { lat: 28.5383, lon: -81.3792 }, radiusMiles: 100 });
    expect(near.map((r) => r.callsign)).toEqual(['K4WPD']);
    expect(near[0].distanceMiles).toBe(0);
  });

  it('converts a repeater to a channel', () => {
    const ch = repeaterToRadioChannel(TEST_REPEATERS[0], 5);
    expect(ch).toMatchObject({ id: 5, name: 'W1AW', rxFreq: 146.88, duplex: '-', offset: 0.6 });
    expect(ch.txFreq).toBeCloseTo(146.28, 6);
    expect(ch.txTone).toMatchObject({ type: 1, ctcss: 100 });
    expect(repeaterToRadioChannel(TEST_REPEATERS[1], 1, 'callsign-city').name).toBe('K4WPD Orlando');
  });

  it('respects the sign of an offset when there is no duplex column', () => {
    const [r] = parseRepeaterBookCsv('Callsign,Frequency,Offset\nW0ABC,146.985,+0.600\n');
    expect(r.duplex).toBe('+');
    expect(r.offset).toBe(0.6);
  });

  it('reads tones from CHIRP files loaded into the RepeaterBook import', () => {
    const chirp = 'Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq\n0,W1XYZ,146.940000,-,0.600000,Tone,100.0,88.5\n';
    const [r] = parseRepeaterBookCsv(chirp);
    expect(r).toMatchObject({ callsign: 'W1XYZ', duplex: '-', offset: 0.6 });
    expect(r.txTone).toMatchObject({ type: 1, ctcss: 100 });
  });

  it('flags band-plan guesses and uses 5 MHz for UHF', () => {
    const [vhf, uhf] = parseRepeaterBookCsv('Callsign,Frequency,PL\nA,146.790,107.2\nB,444.200,123.0\n');
    expect(vhf).toMatchObject({ duplex: '-', offset: 0.6, duplexGuessed: true });
    expect(uhf).toMatchObject({ duplex: '+', offset: 5, duplexGuessed: true });
    expect(vhf.txTone).toMatchObject({ type: 1, ctcss: 107.2 });
  });

  it('spots repeaters that are already programmed', () => {
    const channels = createBlankChannels();
    channels[3] = repeaterToRadioChannel(TEST_REPEATERS[0], 4);
    expect(isAlreadyProgrammed(TEST_REPEATERS[0], channels)).toBe(true);
    expect(isAlreadyProgrammed(TEST_REPEATERS[1], channels)).toBe(false);
    expect(isAlreadyProgrammed(TEST_REPEATERS[1], [createBlankChannel(1)])).toBe(false);
  });
});
