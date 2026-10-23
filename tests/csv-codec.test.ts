import { describe, it, expect } from 'vitest';
import { channelsToChirpCsv, channelsToOemCsv, importCsvToChannels, parseCsvRows } from '../src/codecs/csv-codec';
import { createBlankChannel, createBlankChannels } from '../src/codecs/channel';
import { dcsTone, ctcssTone } from '../src/codecs/tone-tables';
import { channelsToTsv, parseClipboardText } from '../src/codecs/clipboard';
import { RadioChannel } from '../src/types/radio';

const sampleChirp = `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Power,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE
0,W1AW-TEST,146.880000,-,0.600000,Tone,100.0,88.5,023,NN,023,Tone->Tone,FM,5.00,,High,,,,,
1,DCS-RPT,447.820000,-,5.000000,DTCS,88.5,88.5,023,NN,023,Tone->Tone,NFM,5.00,S,Low,,,,,
`;

describe('CHIRP & OEM CSV Codec', () => {
  it('parses quoted cells', () => {
    const rows = parseCsvRows('Location,Name,Frequency\r\n0,"W1AW, Repeater",146.880000\r\n1,Simplex,146.520000');
    expect(rows.length).toBe(3);
    expect(rows[1][1]).toBe('W1AW, Repeater');
  });

  it('exports CHIRP CSV with 1-based channel numbers as Location', () => {
    const channels = createBlankChannels();
    channels[9] = {
      ...createBlankChannel(10), name: 'W1AW-RPT', rxFreq: 146.88, txFreq: 146.28, duplex: '-', offset: 0.6, txTone: ctcssTone(100)
    };
    const csv = channelsToChirpCsv(channels);
    expect(csv).toContain('10,W1AW-RPT,146.880000,-,0.600000,Tone,100.0');
  });

  it('imports CHIRP CSV, shifting 0-based locations onto channels 1 and 2', () => {
    const { channels, importedCount, format } = importCsvToChannels(sampleChirp, createBlankChannels(), { mode: 'location' });
    expect(format).toBe('chirp');
    expect(importedCount).toBe(2);
    expect(channels[0]).toMatchObject({ name: 'W1AW-TEST', rxFreq: 146.88, duplex: '-', offset: 0.6 });
    expect(channels[0].txFreq).toBeCloseTo(146.28, 6);
    expect(channels[0].txTone).toMatchObject({ type: 1, ctcss: 100 });
    expect(channels[1]).toMatchObject({ name: 'DCS-RPT', rxFreq: 447.82, bandwidth: 0, scan: 0, power: 0 });
    expect(channels[1].txTone).toMatchObject({ type: 2, dcs: '023' });
  });

  it('keeps channel positions through a CHIRP export and import', () => {
    const channels = createBlankChannels();
    channels[9] = { ...createBlankChannel(10), name: 'TEN', rxFreq: 146.52, txFreq: 146.52 };
    channels[41] = { ...createBlankChannel(42), name: 'FORTYTWO', rxFreq: 446, txFreq: 446 };
    const back = importCsvToChannels(channelsToChirpCsv(channels), createBlankChannels(), { mode: 'location' }).channels;
    expect(back[9].name).toBe('TEN');
    expect(back[41].name).toBe('FORTYTWO');
    expect(back[0].rxFreq).toBe(0);
  });

  it('round-trips every field through the OEM CPS CSV format', () => {
    const channels = createBlankChannels();
    channels[2] = {
      ...createBlankChannel(3), name: 'FULL', rxFreq: 446.1, txFreq: 441.1, duplex: '-', offset: 5,
      rxTone: dcsTone('754', true), txTone: ctcssTone(131.8), power: 0, bandwidth: 0, scan: 0, busy: 2,
      specialDcs: 3, vague: 1, compander: 1, scrambler: 7, mode: 0, rxSig: 3, pushCode: 1, popCode: 12
    };
    const csv = channelsToOemCsv(channels);
    expect(csv.startsWith('﻿NO.,RX Freq.')).toBe(true);
    expect(csv).toContain('3,446.10000,441.10000,D754I,131.8,Low,Narrow,DEL,CAT,Special DCS 3,ON,ON,scramble 7,FM,FSK DTMF,ID,Code form-11,FULL');
    const back = importCsvToChannels(csv, createBlankChannels(), { mode: 'location' }).channels[2];
    const { rawBytes, eepromBytes, ...expected } = channels[2] as RadioChannel;
    expect(back).toMatchObject(expected);
  });

  it('appends only into empty slots without touching programmed channels', () => {
    const existing = createBlankChannels();
    existing[0] = { ...createBlankChannel(1), name: 'KEEP1', rxFreq: 146.52, txFreq: 146.52 };
    existing[2] = { ...createBlankChannel(3), name: 'KEEP3', rxFreq: 146.55, txFreq: 146.55 };
    const { channels, plan } = importCsvToChannels(sampleChirp, existing, { mode: 'appendEmpty' });
    expect(plan.overwrites).toEqual([]);
    expect(channels[0].name).toBe('KEEP1');
    expect(channels[1].name).toBe('W1AW-TEST');
    expect(channels[2].name).toBe('KEEP3');
    expect(channels[3].name).toBe('DCS-RPT');
  });

  it('rejects CSV files it does not recognise', () => {
    expect(() => importCsvToChannels('a,b\n1,2', createBlankChannels())).toThrow(/Unrecognised CSV/);
  });

  it('round-trips rows through the spreadsheet clipboard format', () => {
    const rows = [
      { ...createBlankChannel(1), name: 'A', rxFreq: 146.94, txFreq: 146.34, txTone: ctcssTone(100), power: 0 as const },
      { ...createBlankChannel(2), name: 'B', rxFreq: 446.0, txFreq: 446.0, rxTone: dcsTone('023'), txTone: dcsTone('023'), bandwidth: 0 as const }
    ];
    const back = parseClipboardText(channelsToTsv(rows));
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ name: 'A', rxFreq: 146.94, duplex: '-', power: 0 });
    expect(back[0].txTone).toMatchObject({ type: 1, ctcss: 100 });
    expect(back[1]).toMatchObject({ name: 'B', bandwidth: 0 });
    expect(back[1].rxTone).toMatchObject({ type: 2, dcs: '023' });
  });

  it('accepts header-less rows pasted from a spreadsheet', () => {
    const back = parseClipboardText('LOCAL\t146.52\t146.52\tNone\tNone\n');
    expect(back[0]).toMatchObject({ name: 'LOCAL', rxFreq: 146.52, duplex: 'OFF' });
  });
});
