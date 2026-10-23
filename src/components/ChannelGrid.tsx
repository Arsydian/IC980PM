import React, { useState } from 'react';
import { RadioChannel, ToneSetting, ToneType } from '../types/radio';
import { CTCSS_TONES, DCS_CODES, formatTone, parseToneString } from '../codecs/tone-tables';
import { Copy, Trash2, Edit3, MoreHorizontal, AlertTriangle } from 'lucide-react';

interface ChannelGridProps {
  channels: RadioChannel[];
  onChannelChange: (index: number, updated: RadioChannel) => void;
  onClearChannel: (index: number) => void;
  onCopyChannel: (channel: RadioChannel) => void;
  onPasteChannel: (index: number) => void;
  hasClipboard: boolean;
  onOpenDetails: (channel: RadioChannel) => void;
  searchQuery: string;
  bandFilter: string;
}

export const ChannelGrid: React.FC<ChannelGridProps> = ({
  channels,
  onChannelChange,
  onClearChannel,
  onCopyChannel,
  onPasteChannel,
  hasClipboard,
  onOpenDetails,
  searchQuery,
  bandFilter
}) => {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  // Filter channels based on search and band
  const filteredChannels = channels.filter((ch) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        ch.name.toLowerCase().includes(q) ||
        (ch.rxFreq > 0 && ch.rxFreq.toFixed(4).includes(q)) ||
        (ch.txFreq > 0 && ch.txFreq.toFixed(4).includes(q)) ||
        ch.id.toString().includes(q);
      if (!match) return false;
    }

    if (bandFilter === 'active') {
      return ch.rxFreq > 0;
    }
    if (bandFilter === 'vhf') {
      return ch.rxFreq >= 134 && ch.rxFreq <= 176;
    }
    if (bandFilter === 'uhf') {
      return ch.rxFreq >= 400 && ch.rxFreq <= 475;
    }
    if (bandFilter === 'air') {
      return ch.rxFreq >= 108 && ch.rxFreq < 137;
    }
    return true;
  });

  const handleRxFreqChange = (index: number, valStr: string) => {
    const rx = parseFloat(valStr) || 0;
    const ch = channels[index];
    let tx = rx;
    if (ch.duplex === '+') tx = Math.round((rx + ch.offset) * 1e5) / 1e5;
    if (ch.duplex === '-') tx = Math.round((rx - ch.offset) * 1e5) / 1e5;
    onChannelChange(index, { ...ch, rxFreq: rx, txFreq: tx });
  };

  const handleOffsetChange = (index: number, valStr: string) => {
    const off = parseFloat(valStr) || 0;
    const ch = channels[index];
    let tx = ch.rxFreq;
    if (ch.duplex === '+') tx = Math.round((ch.rxFreq + off) * 1e5) / 1e5;
    if (ch.duplex === '-') tx = Math.round((ch.rxFreq - off) * 1e5) / 1e5;
    onChannelChange(index, { ...ch, offset: off, txFreq: tx });
  };

  const handleDuplexChange = (index: number, duplex: '+' | '-' | 'OFF' | 'SPLIT') => {
    const ch = channels[index];
    let tx = ch.rxFreq;
    if (duplex === '+') tx = Math.round((ch.rxFreq + ch.offset) * 1e5) / 1e5;
    if (duplex === '-') tx = Math.round((ch.rxFreq - ch.offset) * 1e5) / 1e5;
    onChannelChange(index, { ...ch, duplex, txFreq: tx });
  };

  const isOutOfBand = (freq: number, isTx: boolean): boolean => {
    if (freq <= 0) return false;
    if (!isTx && freq >= 108 && freq < 137) return false; // Airband RX allowed
    const isVhf = freq >= 134 && freq <= 176;
    const isUhf = freq >= 400 && freq <= 475;
    return !isVhf && !isUhf;
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-950 font-mono text-xs">
      <table className="w-full border-collapse border border-slate-800 text-left">
        <thead className="sticky top-0 bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 z-10 shadow-sm">
          <tr>
            <th className="px-3 py-2 w-12 border-r border-slate-800 text-center">#</th>
            <th className="px-3 py-2 w-44 border-r border-slate-800">Channel Name</th>
            <th className="px-3 py-2 w-32 border-r border-slate-800">RX Freq (MHz)</th>
            <th className="px-3 py-2 w-32 border-r border-slate-800">TX Freq (MHz)</th>
            <th className="px-2 py-2 w-20 border-r border-slate-800 text-center">Duplex</th>
            <th className="px-3 py-2 w-24 border-r border-slate-800">Offset</th>
            <th className="px-3 py-2 w-36 border-r border-slate-800">TX Tone (Enc)</th>
            <th className="px-3 py-2 w-36 border-r border-slate-800">RX Tone (Dec)</th>
            <th className="px-2 py-2 w-20 border-r border-slate-800 text-center">Power</th>
            <th className="px-2 py-2 w-24 border-r border-slate-800 text-center">Bandwidth</th>
            <th className="px-2 py-2 w-16 border-r border-slate-800 text-center">Scan</th>
            <th className="px-2 py-2 w-16 border-r border-slate-800 text-center">Mode</th>
            <th className="px-3 py-2 w-24 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {filteredChannels.map((ch) => {
            const rawIndex = ch.id - 1;
            const isEmpty = ch.rxFreq <= 0;
            const isSelected = selectedRow === ch.id;
            const outOfBand = isOutOfBand(ch.rxFreq, false) || isOutOfBand(ch.txFreq, true);

            return (
              <tr
                key={ch.id}
                onClick={() => setSelectedRow(ch.id)}
                className={`transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-sky-950/40 border-l-2 border-l-sky-500'
                    : isEmpty
                    ? 'text-slate-600 hover:bg-slate-900/30'
                    : 'text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {/* ID */}
                <td className="px-3 py-1.5 border-r border-slate-800 text-center text-slate-400 font-semibold select-none">
                  {ch.id}
                </td>

                {/* Name */}
                <td className="px-2 py-1 border-r border-slate-800">
                  <input
                    type="text"
                    maxLength={16}
                    value={ch.name}
                    onChange={(e) => onChannelChange(rawIndex, { ...ch, name: e.target.value })}
                    placeholder={isEmpty ? '—' : 'Channel Name'}
                    className="w-full bg-transparent px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 font-sans text-xs"
                  />
                </td>

                {/* RX Frequency */}
                <td className="px-2 py-1 border-r border-slate-800">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.00125"
                      value={ch.rxFreq > 0 ? ch.rxFreq : ''}
                      onChange={(e) => handleRxFreqChange(rawIndex, e.target.value)}
                      placeholder="0.00000"
                      className={`w-full bg-transparent px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs ${
                        ch.rxFreq >= 134 && ch.rxFreq <= 176
                          ? 'text-cyan-400'
                          : ch.rxFreq >= 400 && ch.rxFreq <= 475
                          ? 'text-purple-400'
                          : ch.rxFreq >= 108 && ch.rxFreq < 137
                          ? 'text-amber-400'
                          : 'text-slate-300'
                      }`}
                    />
                    {outOfBand && (
                      <span title="Frequency out of guaranteed factory range">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      </span>
                    )}
                  </div>
                </td>

                {/* TX Frequency */}
                <td className="px-2 py-1 border-r border-slate-800">
                  <input
                    type="number"
                    step="0.00125"
                    value={ch.txFreq > 0 ? ch.txFreq : ''}
                    onChange={(e) => {
                      const tx = parseFloat(e.target.value) || 0;
                      onChannelChange(rawIndex, { ...ch, txFreq: tx });
                    }}
                    placeholder="0.00000"
                    disabled={ch.duplex !== 'OFF' && ch.duplex !== 'SPLIT'}
                    className={`w-full bg-transparent px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs ${
                      ch.duplex !== 'OFF' ? 'text-slate-400 cursor-not-allowed' : 'text-slate-300'
                    }`}
                  />
                </td>

                {/* Duplex */}
                <td className="px-1 py-1 border-r border-slate-800 text-center">
                  <select
                    value={ch.duplex}
                    onChange={(e) => handleDuplexChange(rawIndex, e.target.value as any)}
                    className="bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none"
                  >
                    <option value="OFF" className="bg-slate-800">Simplex</option>
                    <option value="+" className="bg-slate-800">+ Offset</option>
                    <option value="-" className="bg-slate-800">- Offset</option>
                    <option value="SPLIT" className="bg-slate-800">Split</option>
                  </select>
                </td>

                {/* Offset */}
                <td className="px-2 py-1 border-r border-slate-800">
                  <input
                    type="number"
                    step="0.005"
                    value={ch.offset > 0 ? ch.offset : ''}
                    onChange={(e) => handleOffsetChange(rawIndex, e.target.value)}
                    placeholder="0.00000"
                    disabled={ch.duplex === 'OFF'}
                    className="w-full bg-transparent px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
                  />
                </td>

                {/* TX Tone */}
                <td className="px-2 py-1 border-r border-slate-800">
                  <input
                    type="text"
                    value={formatTone(ch.txTone)}
                    onChange={(e) => {
                      const tone = parseToneString(e.target.value);
                      onChannelChange(rawIndex, { ...ch, txTone: tone });
                    }}
                    placeholder="None / 88.5 / D023N"
                    className="w-full bg-transparent px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
                  />
                </td>

                {/* RX Tone */}
                <td className="px-2 py-1 border-r border-slate-800">
                  <input
                    type="text"
                    value={formatTone(ch.rxTone)}
                    onChange={(e) => {
                      const tone = parseToneString(e.target.value);
                      onChannelChange(rawIndex, { ...ch, rxTone: tone });
                    }}
                    placeholder="None / 88.5 / D023N"
                    className="w-full bg-transparent px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
                  />
                </td>

                {/* Power */}
                <td className="px-1 py-1 border-r border-slate-800 text-center">
                  <select
                    value={ch.power}
                    onChange={(e) => onChannelChange(rawIndex, { ...ch, power: parseInt(e.target.value) as 0 | 1 })}
                    className="bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none font-sans"
                  >
                    <option value={1} className="bg-slate-800">High</option>
                    <option value={0} className="bg-slate-800">Low</option>
                  </select>
                </td>

                {/* Bandwidth */}
                <td className="px-1 py-1 border-r border-slate-800 text-center">
                  <select
                    value={ch.bandwidth}
                    onChange={(e) => onChannelChange(rawIndex, { ...ch, bandwidth: parseInt(e.target.value) as 0 | 1 })}
                    className="bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none font-sans"
                  >
                    <option value={1} className="bg-slate-800">Wide (25k)</option>
                    <option value={0} className="bg-slate-800">Narrow (12.5k)</option>
                  </select>
                </td>

                {/* Scan */}
                <td className="px-1 py-1 border-r border-slate-800 text-center">
                  <select
                    value={ch.scan}
                    onChange={(e) => onChannelChange(rawIndex, { ...ch, scan: parseInt(e.target.value) as 0 | 1 })}
                    className="bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none font-sans"
                  >
                    <option value={1} className="bg-slate-800">ADD</option>
                    <option value={0} className="bg-slate-800">DEL</option>
                  </select>
                </td>

                {/* Mode */}
                <td className="px-1 py-1 border-r border-slate-800 text-center">
                  <select
                    value={ch.mode}
                    onChange={(e) => onChannelChange(rawIndex, { ...ch, mode: parseInt(e.target.value) as 0 | 1 })}
                    className="bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none font-sans"
                  >
                    <option value={0} className="bg-slate-800">FM</option>
                    <option value={1} className="bg-slate-800">AM</option>
                  </select>
                </td>

                {/* Actions */}
                <td className="px-2 py-1 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetails(ch);
                      }}
                      className="p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded transition"
                      title="Advanced Channel Settings"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyChannel(ch);
                      }}
                      className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition"
                      title="Copy Channel"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearChannel(rawIndex);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                      title="Clear Channel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
