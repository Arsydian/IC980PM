import React, { useState } from 'react';
import { Radio, Save } from 'lucide-react';
import { RadioChannel } from '../types/radio';
import { formatTone } from '../codecs/tone-tables';
import { OEM_LABELS } from '../codecs/csv-codec';
import { toRadioAscii } from '../codecs/text';
import { Button, Field, inputClass, Modal, selectClass } from './ui';

interface ChannelDetailsModalProps {
  channel: RadioChannel | null;
  onClose: () => void;
  onSave: (updated: RadioChannel) => void;
}

const options = (labels: string[]) => labels.map((label, value) => <option key={value} value={value}>{label}</option>);

const DetailsForm: React.FC<{ channel: RadioChannel; onClose: () => void; onSave: (c: RadioChannel) => void }> = ({ channel, onClose, onSave }) => {
  const [ch, setCh] = useState<RadioChannel>(channel);
  const num = (key: keyof RadioChannel) => ({
    value: ch[key] as number,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setCh({ ...ch, [key]: parseInt(e.target.value, 10) })
  });

  return (
    <Modal
      title={`Channel ${ch.id} — advanced settings`}
      subtitle={ch.rxFreq > 0 ? `${ch.rxFreq.toFixed(5)} MHz · TX tone ${formatTone(ch.txTone)} · RX tone ${formatTone(ch.rxTone)}` : 'Empty channel'}
      icon={<Radio className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onSave(ch); onClose(); }}><Save className="w-3.5 h-3.5" />Apply</Button>
        </>
      }
    >
      <div className="p-5 grid grid-cols-2 gap-4">
        <Field label="Channel name (16 characters)">
          <input className={inputClass} maxLength={16} value={ch.name} onChange={(e) => setCh({ ...ch, name: toRadioAscii(e.target.value) })} />
        </Field>
        <Field label="Busy channel lockout"><select className={selectClass} {...num('busy')}>{options(OEM_LABELS.busy)}</select></Field>
        <Field label="Special DCS"><select className={selectClass} {...num('specialDcs')}>{options(OEM_LABELS.specialDcs)}</select></Field>
        <Field label="Voice scrambler"><select className={selectClass} {...num('scrambler')}>{options(OEM_LABELS.scrambler)}</select></Field>
        <Field label="Compander"><select className={selectClass} {...num('compander')}>{options(OEM_LABELS.onOff)}</select></Field>
        <Field label="Vague subaudio"><select className={selectClass} {...num('vague')}>{options(OEM_LABELS.onOff)}</select></Field>
        <Field label="RX signal code"><select className={selectClass} {...num('rxSig')}>{options(OEM_LABELS.rxSig)}</select></Field>
        <div />
        <Field label="PTT push code (sent on key-down)"><select className={selectClass} {...num('pushCode')}>{options(OEM_LABELS.code)}</select></Field>
        <Field label="PTT pop code (sent on release)"><select className={selectClass} {...num('popCode')}>{options(OEM_LABELS.code)}</select></Field>
      </div>
    </Modal>
  );
};

/** Hooks live in DetailsForm, which mounts fresh for each channel opened. */
export const ChannelDetailsModal: React.FC<ChannelDetailsModalProps> = ({ channel, onClose, onSave }) =>
  channel ? <DetailsForm key={channel.id} channel={channel} onClose={onClose} onSave={onSave} /> : null;
