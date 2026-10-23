import React from 'react';
import { AlertTriangle, Radio, Usb } from 'lucide-react';
import { REGIONS, RegionId } from '../codecs/band-plans';
import { APP_VERSION } from '../platform';

interface TitleBarProps {
  connectionLabel: string | null;
  onConnectToggle: () => void;
  activeCount: number;
  fileName: string | null;
  dirty: boolean;
  region: RegionId;
  onRegionChange: (r: RegionId) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ connectionLabel, onConnectToggle, activeCount, fileName, dirty, region, onRegionChange }) => (
  <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 select-none">
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <Radio className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">IC-980 Pro Max Programmer</h1>
          <span className="px-2 py-0.5 text-[11px] font-mono rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">v{APP_VERSION}</span>
          <span
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30"
            title="Reading and writing over USB has not been tested on a real radio yet. Keep the automatic backups."
          >
            <AlertTriangle className="w-3 h-3" />
            Radio I/O untested
          </span>
        </div>
        <p className="text-[11px] text-slate-500 truncate">
          {fileName ?? 'Untitled codeplug'}
          {dirty && <span className="text-amber-400"> • unsaved changes</span>}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-3 text-xs">
      <label className="flex items-center gap-1.5 text-slate-400">
        Region
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value as RegionId)}
          className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
          title="Used for transmit band checks and RepeaterBook searches"
        >
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-md border border-slate-700">
        <span className="text-slate-400">Programmed</span>
        <span className="font-semibold text-sky-400 font-mono">{activeCount} / 500</span>
      </div>
      <button
        onClick={onConnectToggle}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors border ${
          connectionLabel
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
        }`}
        title={connectionLabel ? 'Disconnect' : 'Connect to the radio'}
      >
        <Usb className="w-3.5 h-3.5" />
        <span>{connectionLabel ? `${connectionLabel} — disconnect` : 'Connect radio'}</span>
      </button>
    </div>
  </header>
);
