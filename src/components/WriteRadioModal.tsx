import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Upload } from 'lucide-react';
import { ChannelIssue, countBySeverity } from '../codecs/validation';
import { RADIO_MAPPED_REGIONS, RADIO_UNMAPPED_REGIONS } from '../codecs/eeprom-codec';
import { Button, Modal } from './ui';

export interface WriteChoices {
  verify: boolean;
  onlyChanged: boolean;
}

interface WriteRadioModalProps {
  open: boolean;
  programmedCount: number;
  issues: ChannelIssue[];
  onClose: () => void;
  onConfirm: (choices: WriteChoices) => void;
  onShowIssues: () => void;
}

const WriteForm: React.FC<Omit<WriteRadioModalProps, 'open'>> = ({ programmedCount, issues, onClose, onConfirm, onShowIssues }) => {
  const counts = countBySeverity(issues);
  const [verify, setVerify] = useState(true);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const blocked = counts.error > 0;
  const needsAck = counts.warning > 0 && !acceptWarnings;

  return (
    <Modal
      title="Write to radio"
      icon={<Upload className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="warning" disabled={blocked || needsAck} onClick={() => onConfirm({ verify, onlyChanged })}>
            <Upload className="w-3.5 h-3.5" />Back up, then write
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-4 text-xs">
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Writing over USB has not been tested on a real IC-980 Pro Max yet. Before writing, the app reads the radio and saves a backup you can restore from
            the Radio menu. If anything looks wrong afterwards, restore that backup or reprogram with the OEM software.
          </span>
        </div>

        <div>
          <div className="text-slate-200 font-medium mb-1">What is sent</div>
          <ul className="list-disc pl-5 text-slate-300 space-y-0.5">
            {RADIO_MAPPED_REGIONS.map((r) => <li key={r.label}>{r.label} <span className="text-slate-500">({r.detail})</span></li>)}
          </ul>
          <p className="text-slate-500 mt-1">{programmedCount} channel(s) are programmed; the other slots are written as empty.</p>
        </div>
        <div>
          <div className="text-slate-200 font-medium mb-1">Not sent (radio address not known yet)</div>
          <p className="text-slate-400">{RADIO_UNMAPPED_REGIONS.join(' · ')}. Save a .ysf file and program these with the OEM software for now.</p>
        </div>

        {(counts.error > 0 || counts.warning > 0) && (
          <div className={`p-3 rounded-lg border ${blocked ? 'border-rose-500/40 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-center gap-2 font-medium text-slate-100">
              <AlertCircle className={`w-4 h-4 ${blocked ? 'text-rose-400' : 'text-amber-400'}`} />
              {blocked ? `${counts.error} error(s) must be fixed before writing.` : `${counts.warning} warning(s).`}
              <button className="text-sky-400 hover:underline font-normal" onClick={onShowIssues}>Show</button>
            </div>
            {!blocked && (
              <label className="flex items-center gap-2 mt-2 text-slate-300">
                <input type="checkbox" checked={acceptWarnings} onChange={(e) => setAcceptWarnings(e.target.checked)} />
                I've checked the warnings (for example, I'm licensed to transmit on those frequencies).
              </label>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
            Read back and verify every block after writing (recommended)
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            Only send records that differ from what the radio holds (faster; leave off to send everything)
          </label>
        </div>
      </div>
    </Modal>
  );
};

export const WriteRadioModal: React.FC<WriteRadioModalProps> = ({ open, ...props }) => (open ? <WriteForm {...props} /> : null);
