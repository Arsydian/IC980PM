import { describe, it, expect } from 'vitest';
import { channelsToChirpCsv, importCsvToChannels, parseCsvRows } from '../src/codecs/csv-codec';
import { createBlankChannel } from '../src/codecs/ysf-codec';
import { RadioChannel } from '../src/types/radio';

describe('CHIRP & OEM CSV Codec', () => {
  it('should parse raw CSV lines with escaped quotes correctly', () => {
    const raw = 'Location,Name,Frequency\r\n0,"W1AW, Repeater",146.880000\r\n1,Simplex,146.520000';
    const rows = parseCsvRows(raw);
    expect(rows.length).toBe(3);
    expect(rows[1][1]).toBe('W1AW, Repeater');
    expect(rows[1][2]).toBe('146.880000');
  });

  it('should export channels to valid CHIRP 21-column CSV format', () => {
    const channels: RadioChannel[] = Array.from({ length: 500 }, (_, i) => createBlankChannel(i + 1));
    channels[0] = {
      ...createBlankChannel(1),
      name: 'W1AW-RPT',
      rxFreq: 146.88000,
      txFreq: 146.28000,
      duplex: '-',
      offset: 0.60000,
      txTone: { type: 1, ctcss: 100.0, dcs: '023' },
      rxTone: { type: 0, ctcss: 88.5, dcs: '023' }
    };

    const csv = channelsToChirpCsv(channels);
    expect(csv).toContain('Location,Name,Frequency,Duplex,Offset,Tone');
    expect(csv).toContain('W1AW-RPT,146.880000,-,0.600000,Tone,100.0');
  });

  it('should round-trip import CHIRP CSV back to channel structs', () => {
    const sampleChirp = `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Power,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE
0,W1AW-TEST,146.880000,-,0.600000,Tone,100.0,88.5,023,NN,023,Tone->Tone,FM,5.00,,High,,,,,
1,DCS-RPT,447.820000,-,5.000000,DTCS,88.5,88.5,023,NN,023,Tone->Tone,NFM,5.00,S,Low,,,,,
`;
    const blanks = Array.from({ length: 500 }, (_, i) => createBlankChannel(i + 1));
    const { channels, importedCount } = importCsvToChannels(sampleChirp, blanks, 1);

    expect(importedCount).toBe(2);
    expect(channels[0].name).toBe('W1AW-TEST');
    expect(channels[0].rxFreq).toBe(146.88000);
    expect(channels[0].txFreq).toBe(146.28000);
    expect(channels[0].duplex).toBe('-');
    expect(channels[0].offset).toBe(0.60000);
    expect(channels[0].txTone.type).toBe(1);
    expect(channels[0].txTone.ctcss).toBe(100.0);

    expect(channels[1].name).toBe('DCS-RPT');
    expect(channels[1].rxFreq).toBe(447.82000);
    expect(channels[1].txFreq).toBe(442.82000);
    expect(channels[1].duplex).toBe('-');
    expect(channels[1].offset).toBe(5.00000);
    expect(channels[1].txTone.type).toBe(2);
    expect(channels[1].txTone.dcs).toBe('023');
    expect(channels[1].bandwidth).toBe(0); // NFM
    expect(channels[1].scan).toBe(0); // Skip 'S'
    expect(channels[1].power).toBe(0); // Low
  });
});
