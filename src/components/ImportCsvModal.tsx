import React, { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { RadioChannel } from '../types/radio';
import { CsvFormat, ParsedCsvChannel } from '../codecs/csv-codec';
import { applyPlacement, planPlacement, PlacementMode } from '../codecs/placement';
import { PlacementPicker } from './PlacementPicker';
import { Button, Modal } from './ui';

export interface PendingCsv {
  fileName: string;
  format: CsvFormat;
  rows: ParsedCsvChannel[];
}

interface ImportCsvModalProps {
  pending: PendingCsv | null;
  channels: RadioChannel[];
  onClose: () => void;
  onImport: (next: RadioChannel[], count: number) => void;
}

const ImportForm: React.FC<{ pending: PendingCsv } & Omit<ImportCsvModalProps, 'pending'>> = ({ pending, channels, onClose, onImport }) => {
  const hasLocations = pending.rows.some((r) => r.location !== undefined);
  const [mode, setMode] = useState<PlacementMode>(hasLocations ? 'location' : 'appendEmpty');
  const [startAt, setStartAt] = useState(1);
  const plan = useMemo(
    () => planPlacement(channels, pending.rows.length, mode, startAt, pending.rows.map((r) => r.location)),
    [channels, pending, mode, startAt]
  );
  const count = plan.targets.filter((t) => t !== -1).length;

  return (
    <Modal
      title={`Import ${pending.fileName}`}
      subtitle={`${pending.format === 'oem' ? 'OEM CPS' : 'CHIRP'} CSV · ${pending.rows.length} channel(s)`}
      icon={<FileSpreadsheet className="w-5 h-5" />}
      width="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={count === 0}
            onClick={() => {
              onImport(applyPlacement(channels, pending.rows.map((r) => r.channel), plan), count);
              onClose();
            }}
          >
            Import {count} channel(s)
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        <PlacementPicker mode={mode} startAt={startAt} onModeChange={setMode} onStartAtChange={setStartAt} plan={plan} allowLocation={hasLocations} />
        <div className="max-h-64 overflow-auto border border-slate-800 rounded-lg">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr><th className="text-left px-2 py-1">File #</th><th className="text-left px-2 py-1">Name</th><th className="text-left px-2 py-1">RX</th><th className="text-left px-2 py-1">TX</th><th className="text-left px-2 py-1">→ Channel</th></tr>
            </thead>
            <tbody>
              {pending.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-800 text-slate-300">
                  <td className="px-2 py-0.5">{r.location ?? ''}</td>
                  <td className="px-2 py-0.5">{r.channel.name}</td>
                  <td className="px-2 py-0.5">{r.channel.rxFreq.toFixed(5)}</td>
                  <td className="px-2 py-0.5">{r.channel.txFreq.toFixed(5)}</td>
                  <td className="px-2 py-0.5">{plan.targets[i] === -1 ? <span className="text-rose-300">skipped</span> : plan.targets[i] + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export const ImportCsvModal: React.FC<ImportCsvModalProps> = ({ pending, ...props }) =>
  pending ? <ImportForm key={pending.fileName} pending={pending} {...props} /> : null;
