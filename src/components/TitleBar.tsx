import React from 'react';
import { Radio, RefreshCw, Usb, Sun, Moon } from 'lucide-react';

interface TitleBarProps {
  connected: boolean;
  portName?: string;
  onConnectToggle: () => void;
  activeCount: number;
}

const APP_VERSION = '1.1.0';

export const TitleBar: React.FC<TitleBarProps> = ({
  connected,
  portName,
  onConnectToggle,
  activeCount
}) => {
  const currentVersion =
    (typeof window !== 'undefined' && (window as any).api?.appVersion) || APP_VERSION;

  return (
    <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
          <Radio className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            Hiroyasu IC-980 Pro Max Programmer
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
            v{currentVersion}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-md border border-slate-700">
          <span className="text-slate-400">Active Channels:</span>
          <span className="font-semibold text-sky-400 font-mono">{activeCount} / 500</span>
        </div>

        <button
          onClick={onConnectToggle}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors border ${
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
          }`}
        >
          <Usb className={`w-3.5 h-3.5 ${connected ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span>{connected ? (portName || 'Radio Connected (115200 8N1)') : 'Connect Radio'}</span>
        </button>
      </div>
    </header>
  );
};
