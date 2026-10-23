import React from 'react';
import { AlertCircle, CheckCircle, Radio } from 'lucide-react';
import { Button } from './ui';

export interface ProgressState {
  isOpen: boolean;
  title: string;
  percentage: number;
  statusText: string;
  phase: 'running' | 'success' | 'error' | 'cancelled';
  errorMessage?: string;
  details?: React.ReactNode;
}

export const idleProgress: ProgressState = { isOpen: false, title: '', percentage: 0, statusText: '', phase: 'running' };

interface RadioProgressModalProps {
  state: ProgressState;
  onCancel: () => void;
  onClose: () => void;
}

export const RadioProgressModal: React.FC<RadioProgressModalProps> = ({ state, onCancel, onClose }) => {
  if (!state.isOpen) return null;
  const running = state.phase === 'running';
  const failed = state.phase === 'error' || state.phase === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-live="polite">
      <div className="flex flex-col w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-center select-none">
        <div className="flex justify-center mb-4">
          {state.phase === 'success' ? (
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/30"><CheckCircle className="w-8 h-8" /></div>
          ) : failed ? (
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/30"><AlertCircle className="w-8 h-8" /></div>
          ) : (
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-full border border-sky-500/30 animate-pulse"><Radio className="w-8 h-8" /></div>
          )}
        </div>

        <h3 className="text-base font-semibold text-slate-100 mb-1">{state.title}</h3>
        <p className="text-xs text-slate-400 mb-5">{state.statusText}</p>

        {!failed && (
          <>
            <div className="w-full bg-slate-800 rounded-full h-3 mb-2 overflow-hidden border border-slate-700/60">
              <div
                className={`h-full transition-all duration-300 ${state.phase === 'success' ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-indigo-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, state.percentage))}%` }}
              />
            </div>
            <div className="text-right text-xs font-mono text-slate-400 mb-4">{state.percentage}%</div>
          </>
        )}

        {failed && state.errorMessage && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs text-left mb-4 break-words">{state.errorMessage}</div>
        )}
        {state.details && <div className="text-xs text-left text-slate-300 mb-4 space-y-1">{state.details}</div>}

        {running ? (
          <Button onClick={onCancel} className="w-full">Cancel</Button>
        ) : (
          <Button variant={state.phase === 'success' ? 'success' : 'default'} onClick={onClose} className="w-full">
            {state.phase === 'success' ? 'Done' : 'Close'}
          </Button>
        )}
      </div>
    </div>
  );
};
