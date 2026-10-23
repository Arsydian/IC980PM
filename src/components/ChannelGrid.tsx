import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Duplex, RadioChannel } from '../types/radio';
import { bandOf } from '../codecs/band-plans';
import { isChannelEmpty, withDuplex, withOffset, withRxFreq, withTxFreq } from '../codecs/channel';
import { IssueSeverity } from '../codecs/validation';
import { CellSelect, FreqInput, NameInput, OffsetInput, ToneSelect } from './CellEditors';

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

const DUPLEX_OPTIONS: [Duplex, string][] = [['OFF', 'Simplex'], ['+', '+ Offset'], ['-', '− Offset'], ['SPLIT', 'Split']];
const POWER_OPTIONS: [0 | 1, string][] = [[1, 'High'], [0, 'Low']];
const BW_OPTIONS: [0 | 1, string][] = [[1, 'Wide'], [0, 'Narrow']];
const SCAN_OPTIONS: [0 | 1, string][] = [[1, 'ADD'], [0, 'DEL']];
const MODE_OPTIONS: [0 | 1, string][] = [[0, 'FM'], [1, 'AM']];

const BAND_COLOR = { vhf: 'text-cyan-400', uhf: 'text-purple-400', air: 'text-amber-400', other: 'text-slate-300' };
const ISSUE_DOT: Record<IssueSeverity, string> = { error: 'bg-rose-500', warning: 'bg-amber-400', info: 'bg-sky-500' };

export interface ChannelGridProps {
  channels: RadioChannel[];
  visibleIndices: number[];
  selected: Set<number>;
  issueLevels: Map<number, { severity: IssueSeverity; message: string }>;
  onRowMouseDown: (index: number, e: React.MouseEvent) => void;
  onChange: (index: number, updated: RadioChannel, coalesceKey?: string) => void;
  onOpenDetails: (index: number) => void;
  onClear: (index: number) => void;
  /** Change `nonce` to scroll the given channel index into view. */
  scrollTarget?: { index: number; nonce: number };
}

interface RowProps {
  ch: RadioChannel;
  index: number;
  selected: boolean;
  issue?: { severity: IssueSeverity; message: string };
  onRowMouseDown: ChannelGridProps['onRowMouseDown'];
  onChange: ChannelGridProps['onChange'];
  onOpenDetails: ChannelGridProps['onOpenDetails'];
  onClear: ChannelGridProps['onClear'];
}

const ChannelRow = memo(function ChannelRow({ ch, index, selected, issue, onRowMouseDown, onChange, onOpenDetails, onClear }: RowProps) {
  const empty = isChannelEmpty(ch);
  const set = (patch: Partial<RadioChannel>, key?: string) => onChange(index, { ...ch, ...patch }, key);
  const n = ch.id;

  return (
    <tr
      style={{ height: ROW_HEIGHT }}
      onMouseDown={(e) => onRowMouseDown(index, e)}
      aria-selected={selected}
      className={`border-b border-slate-800/60 ${selected ? 'bg-sky-950/50' : empty ? 'text-slate-600 hover:bg-slate-900/30' : 'text-slate-200 hover:bg-slate-900/60'}`}
    >
      <td className={`px-2 border-r border-slate-800 text-center font-semibold select-none ${selected ? 'text-sky-300 border-l-2 border-l-sky-500' : 'text-slate-400'}`}>
        <span className="inline-flex items-center gap-1">
          {issue && <span title={issue.message} className={`w-1.5 h-1.5 rounded-full ${ISSUE_DOT[issue.severity]}`} />}
          {n}
        </span>
      </td>
      <td className="px-1 border-r border-slate-800">
        <NameInput ariaLabel={`Channel ${n} name`} value={ch.name} placeholder={empty ? '' : 'Name'} onChange={(name) => set({ name }, `name:${n}`)} />
      </td>
      <td className="px-1 border-r border-slate-800">
        <FreqInput ariaLabel={`Channel ${n} RX frequency`} value={ch.rxFreq} className={BAND_COLOR[bandOf(ch.rxFreq)]} onCommit={(mhz) => onChange(index, withRxFreq(ch, mhz))} />
      </td>
      <td className="px-1 border-r border-slate-800">
        {ch.duplex === 'SPLIT' ? (
          <FreqInput ariaLabel={`Channel ${n} TX frequency`} value={ch.txFreq} className={BAND_COLOR[bandOf(ch.txFreq)]} allowZero={false} onCommit={(mhz) => onChange(index, withTxFreq(ch, mhz))} />
        ) : (
          <span className="px-1.5 font-mono text-slate-400">{empty ? '' : (ch.txFreq || ch.rxFreq).toFixed(5)}</span>
        )}
      </td>
      <td className="px-1 border-r border-slate-800">
        <CellSelect ariaLabel={`Channel ${n} duplex`} value={ch.duplex} options={DUPLEX_OPTIONS} onChange={(d) => onChange(index, withDuplex(ch, d))} />
      </td>
      <td className="px-1 border-r border-slate-800">
        {ch.duplex === 'SPLIT' ? (
          <span className="px-1.5 font-mono text-slate-500">{ch.offset > 0 ? ch.offset.toFixed(3) : ''}</span>
        ) : (
          <OffsetInput ariaLabel={`Channel ${n} offset`} value={ch.offset} disabled={ch.duplex === 'OFF'} onCommit={(mhz) => onChange(index, withOffset(ch, mhz))} />
        )}
      </td>
      <td className="px-1 border-r border-slate-800">
        <ToneSelect ariaLabel={`Channel ${n} TX tone`} value={ch.txTone} onChange={(txTone) => set({ txTone })} />
      </td>
      <td className="px-1 border-r border-slate-800">
        <ToneSelect ariaLabel={`Channel ${n} RX tone`} value={ch.rxTone} onChange={(rxTone) => set({ rxTone })} />
      </td>
      <td className="px-1 border-r border-slate-800">
        <CellSelect ariaLabel={`Channel ${n} power`} value={ch.power} options={POWER_OPTIONS} onChange={(power) => set({ power })} />
      </td>
      <td className="px-1 border-r border-slate-800">
        <CellSelect ariaLabel={`Channel ${n} bandwidth`} value={ch.bandwidth} options={BW_OPTIONS} onChange={(bandwidth) => set({ bandwidth })} />
      </td>
      <td className="px-1 border-r border-slate-800">
        <CellSelect ariaLabel={`Channel ${n} scan`} value={ch.scan} options={SCAN_OPTIONS} onChange={(scan) => set({ scan })} />
      </td>
      <td className="px-1 border-r border-slate-800">
        <CellSelect ariaLabel={`Channel ${n} mode`} value={ch.mode} options={MODE_OPTIONS} onChange={(mode) => set({ mode })} />
      </td>
      <td className="px-1 text-center">
        <div className="flex items-center justify-center gap-0.5">
          <button
            onClick={() => onOpenDetails(index)}
            className="p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded"
            title="Advanced channel settings"
            aria-label={`Channel ${n} advanced settings`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onClear(index)}
            disabled={empty}
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded disabled:opacity-30"
            title="Clear channel"
            aria-label={`Clear channel ${n}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});

const HEADERS: [string, string][] = [
  ['#', 'w-14 text-center'], ['Name', 'w-40'], ['RX MHz', 'w-28'], ['TX MHz', 'w-28'], ['Duplex', 'w-24'],
  ['Offset', 'w-20'], ['TX Tone (Enc)', 'w-32'], ['RX Tone (Dec)', 'w-32'], ['Power', 'w-20'],
  ['Bandwidth', 'w-24'], ['Scan', 'w-16'], ['Mode', 'w-16'], ['', 'w-16']
];

export const ChannelGrid: React.FC<ChannelGridProps> = (props) => {
  const { channels, visibleIndices, selected, issueLevels, scrollTarget } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    setViewport(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!scrollTarget || !scrollRef.current) return;
    const pos = visibleIndices.indexOf(scrollTarget.index);
    if (pos === -1) return;
    const el = scrollRef.current;
    const top = pos * ROW_HEIGHT;
    const headerH = 34;
    if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight - headerH) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    }
  }, [scrollTarget?.nonce]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(visibleIndices.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const rows = visibleIndices.slice(start, end);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      className="flex-1 overflow-auto bg-slate-950 text-xs"
      data-testid="channel-grid"
    >
      <table className="w-full border-collapse text-left table-fixed min-w-[1180px]">
        <thead className="sticky top-0 bg-slate-900 text-slate-400 font-semibold z-10 shadow-sm">
          <tr className="border-b border-slate-800" style={{ height: 34 }}>
            {HEADERS.map(([label, cls], i) => (
              <th key={i} className={`px-2 border-r border-slate-800 ${cls}`}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && <tr style={{ height: start * ROW_HEIGHT }} aria-hidden />}
          {rows.map((index) => (
            <ChannelRow
              key={index}
              ch={channels[index]}
              index={index}
              selected={selected.has(index)}
              issue={issueLevels.get(index + 1)}
              onRowMouseDown={props.onRowMouseDown}
              onChange={props.onChange}
              onOpenDetails={props.onOpenDetails}
              onClear={props.onClear}
            />
          ))}
          {end < visibleIndices.length && <tr style={{ height: (visibleIndices.length - end) * ROW_HEIGHT }} aria-hidden />}
        </tbody>
      </table>
      {visibleIndices.length === 0 && (
        <div className="p-10 text-center text-slate-500">No channels match the current filter.</div>
      )}
    </div>
  );
};
