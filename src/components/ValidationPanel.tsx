import React from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { ChannelIssue, countBySeverity, IssueSeverity } from '../codecs/validation';

const ICON: Record<IssueSeverity, React.ReactNode> = {
  error: <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
  info: <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
};

interface ValidationPanelProps {
  issues: ChannelIssue[];
  open: boolean;
  onToggle: () => void;
  onJump: (channelId: number) => void;
  regionName: string;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ issues, open, onToggle, onJump, regionName }) => {
  const counts = countBySeverity(issues);
  return (
    <div className="border-t border-slate-800 bg-slate-900 text-xs">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-slate-800/60 text-slate-300" aria-expanded={open}>
        <span className="font-medium">Checks ({regionName})</span>
        <span className="flex items-center gap-1 text-rose-300">{ICON.error}{counts.error} errors</span>
        <span className="flex items-center gap-1 text-amber-300">{ICON.warning}{counts.warning} warnings</span>
        <span className="flex items-center gap-1 text-sky-300">{ICON.info}{counts.info} notes</span>
        <span className="flex-1" />
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <ul className="max-h-48 overflow-y-auto border-t border-slate-800 divide-y divide-slate-800/60">
          {issues.length === 0 && <li className="px-4 py-3 text-slate-500">No problems found.</li>}
          {issues.map((issue, i) => (
            <li key={i}>
              <button onClick={() => onJump(issue.channelId)} className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-slate-800/60">
                {ICON[issue.severity]}
                <span className="font-mono text-slate-400 w-14">Ch {issue.channelId}</span>
                <span className="text-slate-200">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
