import React from 'react';
import { ArrowDown, ArrowUp, ArrowDownWideNarrow, ClipboardPaste, Copy, Eraser, ListPlus, Scissors, Trash2, X } from 'lucide-react';
import { BulkPatch } from '../codecs/channel-ops';
import { Button } from './ui';

interface SelectionBarProps {
  count: number;
  canPaste: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onClear: () => void;
  onMove: (delta: -1 | 1) => void;
  onInsert: () => void;
  onDeleteShift: () => void;
  onSort: () => void;
  onBulk: (patch: BulkPatch) => void;
  onSelectNone: () => void;
}

const bulkSelect = (label: string, options: [string, BulkPatch][], onBulk: (p: BulkPatch) => void) => (
  <select
    aria-label={`Set ${label} for selected channels`}
    value=""
    onChange={(e) => {
      const opt = options.find(([l]) => l === e.target.value);
      if (opt) onBulk(opt[1]);
    }}
    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
  >
    <option value="">{label}…</option>
    {options.map(([l]) => (
      <option key={l} value={l}>{l}</option>
    ))}
  </select>
);

export const SelectionBar: React.FC<SelectionBarProps> = (p) => (
  <div className="flex flex-wrap items-center gap-1.5 px-4 py-1.5 bg-sky-950/40 border-b border-sky-900/60 text-xs">
    <span className="text-sky-300 font-medium mr-1">{p.count} selected</span>
    <Button onClick={p.onCopy} title="Copy (Ctrl+C)"><Copy className="w-3.5 h-3.5" />Copy</Button>
    <Button onClick={p.onCut} title="Cut (Ctrl+X)"><Scissors className="w-3.5 h-3.5" />Cut</Button>
    <Button onClick={p.onPaste} disabled={!p.canPaste} title="Paste at the first selected channel (Ctrl+V)"><ClipboardPaste className="w-3.5 h-3.5" />Paste</Button>
    <Button onClick={p.onClear} title="Clear (Delete)"><Eraser className="w-3.5 h-3.5" />Clear</Button>
    <span className="w-px h-5 bg-slate-700 mx-1" />
    <Button onClick={() => p.onMove(-1)} title="Move up (Alt+↑)"><ArrowUp className="w-3.5 h-3.5" /></Button>
    <Button onClick={() => p.onMove(1)} title="Move down (Alt+↓)"><ArrowDown className="w-3.5 h-3.5" /></Button>
    <Button onClick={p.onInsert} title="Insert a blank channel above the selection, shifting the rest down"><ListPlus className="w-3.5 h-3.5" />Insert</Button>
    <Button onClick={p.onDeleteShift} title="Delete and shift the following channels up"><Trash2 className="w-3.5 h-3.5" />Delete &amp; shift</Button>
    <Button onClick={p.onSort} disabled={p.count < 2} title="Sort the selected channels by RX frequency"><ArrowDownWideNarrow className="w-3.5 h-3.5" />Sort</Button>
    <span className="w-px h-5 bg-slate-700 mx-1" />
    {bulkSelect('Power', [['High', { power: 1 }], ['Low', { power: 0 }]], p.onBulk)}
    {bulkSelect('Bandwidth', [['Wide', { bandwidth: 1 }], ['Narrow', { bandwidth: 0 }]], p.onBulk)}
    {bulkSelect('Scan', [['ADD', { scan: 1 }], ['DEL', { scan: 0 }]], p.onBulk)}
    {bulkSelect('Mode', [['FM', { mode: 0 }], ['AM', { mode: 1 }]], p.onBulk)}
    <span className="flex-1" />
    <Button variant="ghost" onClick={p.onSelectNone} title="Clear selection (Esc)"><X className="w-3.5 h-3.5" /></Button>
  </div>
);
