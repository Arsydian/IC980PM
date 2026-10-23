import { RepeaterBookResult } from '../../src/types/radio';
import { createEmptyTone, ctcssTone } from '../../src/codecs/tone-tables';

const entry = (r: Omit<RepeaterBookResult, 'rxTone' | 'txTone'> & { tone: number }): RepeaterBookResult => {
  const { tone, ...rest } = r;
  return { ...rest, txTone: ctcssTone(tone), rxTone: createEmptyTone() };
};

export const TEST_REPEATERS: RepeaterBookResult[] = [
  entry({
    callsign: 'W1AW', frequency: 146.88, offset: 0.6, duplex: '-', tone: 100.0,
    location: 'Newington, CT', county: 'Hartford', state: 'Connecticut', use: 'OPEN', lat: 41.7148, lon: -72.7272
  }),
  entry({
    callsign: 'K4WPD', frequency: 146.79, offset: 0.6, duplex: '-', tone: 107.2,
    location: 'Orlando, FL', county: 'Orange', state: 'Florida', use: 'OPEN', lat: 28.5383, lon: -81.3792
  }),
  entry({
    callsign: 'N4LCR', frequency: 444.2, offset: 5.0, duplex: '+', tone: 123.0,
    location: 'Miami, FL', county: 'Miami-Dade', state: 'Florida', use: 'OPEN', lat: 25.7617, lon: -80.1918
  }),
  entry({
    callsign: 'K5EAA', frequency: 146.76, offset: 0.6, duplex: '-', tone: 100.0,
    location: 'Austin, TX', county: 'Travis', state: 'Texas', use: 'OPEN', lat: 30.2672, lon: -97.7431
  }),
  entry({
    callsign: 'N5LUC', frequency: 443.9, offset: 5.0, duplex: '+', tone: 114.8,
    location: 'Dallas, TX', county: 'Dallas', state: 'Texas', use: 'OPEN', lat: 32.7767, lon: -96.797
  })
];
