import React, { useMemo, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { diffYsfImages } from '../codecs/ysf-diff';
import { TOTAL_FILE_SIZE } from '../codecs/ysf-codec';
import { toHex } from '../codecs/text';
import { Button, Modal } from './ui';

interface Side {
  name: string;
  bytes: Uint8Array;
}

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
  current: () => Uint8Array;
}

const hexList = (bytes: number[]) => bytes.map((b) => (b < 0 ? '--' : toHex(b))).join(' ');

const FilePick: React.FC<{ label: string; side: Side | null; onPick: (s: Side) => void; onCurrent?: () => void }> = ({ label, side, onPick, onCurrent }) => (
  <div className="flex-1 p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-2">
    <div className="text-slate-400 font-medium">{label}</div>
    <div className="text-slate-200 font-mono truncate">{side ? `${side.name} (${side.bytes.length} bytes)` : 'Nothing chosen'}</div>
    <div className="flex gap-2">
      <label className="inline-flex items-center px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer hover:bg-slate-700">
        Choose .ysf…
        <input
          type="file"
          accept=".ysf,.Ysf,.YSF"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onPick({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
            e.target.value = '';
          }}
        />
      </label>
      {onCurrent && <Button onClick={onCurrent}>Use open codeplug</Button>}
    </div>
  </div>
);

/** Byte-level comparison of two codeplug files, for mapping settings the app doesn't know yet. */
export const CompareModal: React.FC<CompareModalProps> = ({ open, onClose, current }) => {
  const [a, setA] = useState<Side | null>(null);
  const [b, setB] = useState<Side | null>(null);
  const runs = useMemo(() => (a && b ? diffYsfImages(a.bytes, b.bytes) : []), [a, b]);
  if (!open) return null;

  const sizeWarning = [a, b].some((s) => s && s.bytes.length !== TOTAL_FILE_SIZE);
  return (
    <Modal title="Compare .ysf files" subtitle="Find which bytes a setting changes" icon={<GitCompare className="w-5 h-5" />} width="max-w-4xl" onClose={onClose}>
      <div className="p-5 space-y-4 text-xs">
        <p className="text-slate-400">
          In the OEM software, save a codeplug, change exactly one setting, and save again under a new name. Compare the two files here: the differing bytes are
          where that setting is stored. Report findings so they can be added to the app (docs/MAPPING.md).
        </p>
        <div className="flex gap-3">
          <FilePick label="File A (before)" side={a} onPick={setA} onCurrent={() => setA({ name: 'Open codeplug', bytes: current() })} />
          <FilePick label="File B (after)" side={b} onPick={setB} />
        </div>
        {sizeWarning && <p className="text-amber-300">One of the files is not {TOTAL_FILE_SIZE} bytes, so it may not be an IC-980 Pro Max codeplug.</p>}
        {a && b && (
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-900 text-slate-300">{runs.length === 0 ? 'The files are identical.' : `${runs.length} differing range(s)`}</div>
            {runs.length > 0 && (
              <div className="max-h-80 overflow-auto">
                <table className="w-full font-mono">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left px-3 py-1">Offset</th>
                      <th className="text-left px-3 py-1">Field</th>
                      <th className="text-left px-3 py-1">A</th>
                      <th className="text-left px-3 py-1">B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.start} className="border-t border-slate-800">
                        <td className="px-3 py-1 text-slate-300 whitespace-nowrap">{r.start} (0x{toHex(r.start, 4)}){r.end > r.start ? `–${r.end}` : ''}</td>
                        <td className="px-3 py-1 font-sans text-slate-300">{r.label}</td>
                        <td className="px-3 py-1 text-rose-300">{hexList(r.a)}</td>
                        <td className="px-3 py-1 text-emerald-300">{hexList(r.b)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
