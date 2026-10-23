import React, { useState } from 'react';
import { Mic, Sliders } from 'lucide-react';
import { CodeplugExtras, Duplex, HandsetKeyFunction, HandsetKeySettings, RadioChannel } from '../types/radio';
import { HANDSET_KEY_ORDER, RADIO_UNMAPPED_REGIONS } from '../codecs/eeprom-codec';
import { POWER_ON_MSG_LENGTH } from '../codecs/ysf-codec';
import { withDuplex, withOffset, withRxFreq, withTxFreq } from '../codecs/channel';
import { toRadioAscii } from '../codecs/text';
import { CellSelect, FreqInput, OffsetInput, ToneSelect } from './CellEditors';
import { Button, Confidence, Field, inputClass, Modal, selectClass } from './ui';

const KEY_FUNCTIONS: { value: HandsetKeyFunction; label: string }[] = [
  { value: 0x00, label: 'Unassigned' },
  { value: 0x04, label: 'Reverse frequency (listen on repeater input)' },
  { value: 0x02, label: 'Monitor — momentary (while held)' },
  { value: 0x01, label: 'Monitor — latched (squelch open)' },
  { value: 0x03, label: 'Scan start / stop' },
  { value: 0x08, label: 'FM broadcast radio' },
  { value: 0x09, label: 'Emergency alarm' },
  { value: 0x0B, label: 'Warning light' },
  { value: 0x0C, label: 'Frequency match / counter' }
];

const KEY_LABELS: Record<keyof HandsetKeySettings, string> = {
  key1Short: 'P1 short press', key1Long: 'P1 long press',
  key2Short: 'P2 short press', key2Long: 'P2 long press',
  key3Short: 'P3 short press', key3Long: 'P3 long press'
};

const DUPLEX: [Duplex, string][] = [['OFF', 'Simplex'], ['+', '+'], ['-', '−'], ['SPLIT', 'Split']];

type Tab = 'keys' | 'message' | 'vfo' | 'memories' | 'unmapped';

const MemoryTable: React.FC<{ rows: RadioChannel[]; label: (i: number) => string; onChange: (i: number, ch: RadioChannel) => void }> = ({ rows, label, onChange }) => (
  <table className="w-full text-xs border-collapse">
    <thead className="text-slate-400">
      <tr>
        {['', 'RX MHz', 'Duplex', 'Offset / TX', 'TX tone', 'RX tone', 'Power', 'Bandwidth', 'Mode'].map((h) => (
          <th key={h} className="text-left px-1 py-1 font-medium">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((ch, i) => (
        <tr key={i} className="border-t border-slate-800">
          <td className="px-1 py-1 text-slate-400 whitespace-nowrap">{label(i)}</td>
          <td className="px-1"><FreqInput ariaLabel={`${label(i)} RX`} value={ch.rxFreq} onCommit={(v) => onChange(i, withRxFreq(ch, v))} /></td>
          <td className="px-1"><CellSelect ariaLabel={`${label(i)} duplex`} value={ch.duplex} options={DUPLEX} onChange={(d) => onChange(i, withDuplex(ch, d))} /></td>
          <td className="px-1">
            {ch.duplex === 'SPLIT'
              ? <FreqInput ariaLabel={`${label(i)} TX`} value={ch.txFreq} allowZero={false} onCommit={(v) => onChange(i, withTxFreq(ch, v))} />
              : <OffsetInput ariaLabel={`${label(i)} offset`} value={ch.offset} disabled={ch.duplex === 'OFF'} onCommit={(v) => onChange(i, withOffset(ch, v))} />}
          </td>
          <td className="px-1"><ToneSelect ariaLabel={`${label(i)} TX tone`} value={ch.txTone} onChange={(txTone) => onChange(i, { ...ch, txTone })} /></td>
          <td className="px-1"><ToneSelect ariaLabel={`${label(i)} RX tone`} value={ch.rxTone} onChange={(rxTone) => onChange(i, { ...ch, rxTone })} /></td>
          <td className="px-1"><CellSelect ariaLabel={`${label(i)} power`} value={ch.power} options={[[1, 'High'], [0, 'Low']]} onChange={(power) => onChange(i, { ...ch, power })} /></td>
          <td className="px-1"><CellSelect ariaLabel={`${label(i)} bandwidth`} value={ch.bandwidth} options={[[1, 'Wide'], [0, 'Narrow']]} onChange={(bandwidth) => onChange(i, { ...ch, bandwidth })} /></td>
          <td className="px-1"><CellSelect ariaLabel={`${label(i)} mode`} value={ch.mode} options={[[0, 'FM'], [1, 'AM']]} onChange={(mode) => onChange(i, { ...ch, mode })} /></td>
        </tr>
      ))}
    </tbody>
  </table>
);

interface ExtrasModalProps {
  extras: CodeplugExtras;
  onClose: () => void;
  onApply: (extras: CodeplugExtras) => void;
  onOpenCompare: () => void;
}

const ExtrasForm: React.FC<ExtrasModalProps> = ({ extras, onClose, onApply, onOpenCompare }) => {
  const [draft, setDraft] = useState<CodeplugExtras>(extras);
  const [tab, setTab] = useState<Tab>('keys');
  const tabs: [Tab, string][] = [['keys', 'Handset keys'], ['message', 'Power-on message'], ['vfo', 'VFO A / B'], ['memories', 'Settings-block memories'], ['unmapped', 'Not yet mapped']];
  const fileOnly = <p className="text-[11px] text-slate-400">Saved in .ysf files. Not sent over USB yet — its address in radio memory is unknown, so program it with the OEM software from a saved .ysf.</p>;

  return (
    <Modal
      title="Radio settings"
      subtitle="Data stored outside the 500 channels"
      icon={<Sliders className="w-5 h-5" />}
      width="max-w-4xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onApply(draft); onClose(); }}>Apply</Button>
        </>
      }
    >
      <div className="flex gap-1 px-4 pt-3 border-b border-slate-800 text-xs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-t-lg border-t border-x ${tab === id ? 'bg-slate-950 text-sky-400 border-slate-800' : 'text-slate-400 border-transparent hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-5 space-y-4 text-xs bg-slate-950/50 min-h-[300px]">
        {tab === 'keys' && (
          <>
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-400" />
              <span className="text-slate-200 font-medium">Programmable microphone keys</span>
              <Confidence level="unverified" />
            </div>
            <p className="text-[11px] text-slate-400">Saved in .ysf files (settings block +41) and written to the radio at 0x120C5.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {HANDSET_KEY_ORDER.map((k) => (
                <Field key={k} label={KEY_LABELS[k]}>
                  <select
                    className={selectClass}
                    value={draft.keys[k]}
                    onChange={(e) => setDraft({ ...draft, keys: { ...draft.keys, [k]: parseInt(e.target.value, 10) as HandsetKeyFunction } })}
                  >
                    {KEY_FUNCTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </Field>
              ))}
            </div>
          </>
        )}

        {tab === 'message' && (
          <>
            <div className="flex items-center gap-2"><span className="text-slate-200 font-medium">Power-on message</span><Confidence level="inferred" /></div>
            {fileOnly}
            <Field label={`Message (up to ${POWER_ON_MSG_LENGTH} characters)`} hint="The factory file holds HELLO here." className="max-w-xs">
              <input
                className={`${inputClass} font-mono`}
                maxLength={POWER_ON_MSG_LENGTH}
                value={draft.powerOnMessage}
                onChange={(e) => setDraft({ ...draft, powerOnMessage: toRadioAscii(e.target.value, POWER_ON_MSG_LENGTH) })}
              />
            </Field>
          </>
        )}

        {tab === 'vfo' && (
          <>
            <div className="flex items-center gap-2"><span className="text-slate-200 font-medium">VFO A / B</span><Confidence level="inferred" /></div>
            {fileOnly}
            <p className="text-[11px] text-slate-500">Two channel-format records in the file header (factory values 430.000 and 144.300 MHz). Which is A and which is B is a guess.</p>
            <MemoryTable rows={draft.vfos} label={(i) => `VFO ${i === 0 ? 'A' : 'B'}`} onChange={(i, ch) => setDraft({ ...draft, vfos: draft.vfos.map((v, k) => (k === i ? ch : v)) })} />
          </>
        )}

        {tab === 'memories' && (
          <>
            <div className="flex items-center gap-2"><span className="text-slate-200 font-medium">Settings-block memories</span><Confidence level="inferred" /></div>
            {fileOnly}
            <p className="text-[11px] text-slate-500">
              The last 595 bytes of the settings block are seven records in the channel format. The OEM software has a seven-row "Repeat" table, so these are probably its entries
              (factory values 435.025 RX / 455.025 TX on rows 2–7 — outside most amateur allocations).
            </p>
            <MemoryTable rows={draft.tailMemories} label={(i) => `Row ${i + 1}`} onChange={(i, ch) => setDraft({ ...draft, tailMemories: draft.tailMemories.map((v, k) => (k === i ? ch : v)) })} />
          </>
        )}

        {tab === 'unmapped' && (
          <>
            <p className="text-slate-300">These settings exist on the radio, but where they live in the file and in radio memory has not been worked out yet, so the app can't edit them:</p>
            <ul className="list-disc pl-5 text-slate-400 space-y-1">
              {RADIO_UNMAPPED_REGIONS.slice(3).map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="text-slate-400">
              To map one: in the OEM software change just that setting, save a second .ysf, then compare the two files here. The differing bytes are the setting. See docs/MAPPING.md.
            </p>
            <Button onClick={() => { onClose(); onOpenCompare(); }}>Compare two .ysf files…</Button>
          </>
        )}
      </div>
    </Modal>
  );
};

export const ExtrasModal: React.FC<ExtrasModalProps & { open: boolean }> = ({ open, ...props }) => (open ? <ExtrasForm {...props} /> : null);
