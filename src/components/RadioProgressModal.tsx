import React from 'react';
import { Radio, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface RadioProgressModalProps {
  isOpen: boolean;
  title: string;
  percentage: number;
  statusText: string;
  isError: boolean;
  errorMessage?: string;
  isSuccess: boolean;
  onClose: () => void;
}

export const RadioProgressModal: React.FC<RadioProgressModalProps> = ({
  isOpen,
  title,
  percentage,
  statusText,
  isError,
  errorMessage,
  isSuccess,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-6 text-center select-none">
        <div className="flex justify-center mb-4">
          {isSuccess ? (
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/30">
              <CheckCircle className="w-8 h-8" />
            </div>
          ) : isError ? (
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/30">
              <AlertCircle className="w-8 h-8" />
            </div>
          ) : (
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-full border border-sky-500/30 animate-pulse">
              <Radio className="w-8 h-8" />
            </div>
          )}
        </div>

        <h3 className="text-base font-semibold text-slate-100 mb-1">{title}</h3>
        <p className="text-xs text-slate-400 mb-5">{statusText}</p>

        {!isError && (
          <div className="w-full bg-slate-800 rounded-full h-3 mb-2 overflow-hidden border border-slate-700/60">
            <div
              className={`h-full transition-all duration-300 ${
                isSuccess ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-indigo-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
            />
          </div>
        )}

        {!isError && (
          <div className="text-right text-xs font-mono font-medium text-slate-400 mb-4">
            {percentage}%
          </div>
        )}

        {isError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs text-left mb-4 break-words">
            {errorMessage || 'Unknown communication error'}
          </div>
        )}

        {(isSuccess || isError) && (
          <button
            onClick={onClose}
            className={`w-full py-2 font-medium text-xs rounded-lg transition shadow-sm ${
              isSuccess
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isSuccess ? 'Done' : 'Close'}
          </button>
        )}
      </div>
    </div>
  );
};
