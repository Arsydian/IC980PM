import React, { useState } from 'react';
import { RadioChannel } from '../types/radio';
import { formatTone, parseToneString } from '../codecs/tone-tables';
import { X, Save, Radio } from 'lucide-react';

interface ChannelDetailsModalProps {
  channel: RadioChannel | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: RadioChannel) => void;
}

export const ChannelDetailsModal: React.FC<ChannelDetailsModalProps> = ({
  channel,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !channel) return null;

  const [localCh, setLocalCh] = useState<RadioChannel>({ ...channel });

  React.useEffect(() => {
    if (channel) setLocalCh({ ...channel });
  }, [channel]);

  const handleSave = () => {
    onSave(localCh);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Channel {localCh.id} Advanced Inspector
              </h2>
              <p className="text-xs text-slate-400">Detailed bitfields and signaling configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 grid grid-cols-2 gap-4 text-xs font-sans">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Channel Name (Max 16 Chars)</label>
            <input
              type="text"
              maxLength={16}
              value={localCh.name}
              onChange={(e) => setLocalCh({ ...localCh, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Busy Channel Lockout</label>
            <select
              value={localCh.busy}
              onChange={(e) => setLocalCh({ ...localCh, busy: parseInt(e.target.value) as 0 | 1 | 2 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF (Transmit Allowed)</option>
              <option value={1}>DQT Lock</option>
              <option value={2}>CAT Carrier Lock</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Special DCS</label>
            <select
              value={localCh.specialDcs}
              onChange={(e) => setLocalCh({ ...localCh, specialDcs: parseInt(e.target.value) as any })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF (Standard DCS)</option>
              <option value={1}>Special DCS 1</option>
              <option value={2}>Special DCS 2</option>
              <option value={3}>Special DCS 3</option>
              <option value={4}>Special DCS 4</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Voice Scrambler</label>
            <select
              value={localCh.scrambler}
              onChange={(e) => setLocalCh({ ...localCh, scrambler: parseInt(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>Scramble Code {s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Compander</label>
            <select
              value={localCh.compander}
              onChange={(e) => setLocalCh({ ...localCh, compander: parseInt(e.target.value) as 0 | 1 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF (Normal)</option>
              <option value={1}>ON (Noise Compression)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Vague Subaudio</label>
            <select
              value={localCh.vague}
              onChange={(e) => setLocalCh({ ...localCh, vague: parseInt(e.target.value) as 0 | 1 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF</option>
              <option value={1}>ON</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">RX Signal Code</label>
            <select
              value={localCh.rxSig}
              onChange={(e) => setLocalCh({ ...localCh, rxSig: parseInt(e.target.value) as any })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF</option>
              <option value={1}>DTMF Signaling</option>
              <option value={2}>FSK Signaling</option>
              <option value={3}>FSK + DTMF</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">PTT Push Code</label>
            <select
              value={localCh.pushCode}
              onChange={(e) => setLocalCh({ ...localCh, pushCode: parseInt(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value={0}>OFF</option>
              <option value={1}>ANI ID</option>
              {Array.from({ length: 30 }, (_, i) => i + 2).map((code) => (
                <option key={code} value={code}>Code Form-{code - 1}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg shadow-sm transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Apply to Channel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
