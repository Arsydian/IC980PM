import React from 'react';
import { PlacementMode, PlacementPlan } from '../codecs/placement';

interface PlacementPickerProps {
  mode: PlacementMode;
  startAt: number;
  onModeChange: (m: PlacementMode) => void;
  onStartAtChange: (n: number) => void;
  plan: PlacementPlan;
  allowLocation?: boolean;
}

function describeTargets(plan: PlacementPlan): string {
  if (plan.targets.length === 0) return 'Nothing selected yet.';
  const slots = plan.targets.filter((t) => t !== -1).map((t) => t + 1);
  if (slots.length === 0) return 'No free slots.';
  const contiguous = slots.every((s, i) => i === 0 || s === slots[i - 1] + 1);
  return contiguous && slots.length > 1 ? `Channels ${slots[0]}–${slots[slots.length - 1]}` : `Channel${slots.length > 1 ? 's' : ''} ${slots.slice(0, 12).join(', ')}${slots.length > 12 ? '…' : ''}`;
}

export const PlacementPicker: React.FC<PlacementPickerProps> = ({ mode, startAt, onModeChange, onStartAtChange, plan, allowLocation }) => (
  <div className="space-y-1.5 text-xs">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-slate-400 font-medium">Place into:</span>
      {allowLocation && (
        <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
          <input type="radio" checked={mode === 'location'} onChange={() => onModeChange('location')} />
          Channel numbers from the file
        </label>
      )}
      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
        <input type="radio" checked={mode === 'appendEmpty'} onChange={() => onModeChange('appendEmpty')} />
        Empty slots only
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
        <input type="radio" checked={mode === 'startAt'} onChange={() => onModeChange('startAt')} />
        Consecutive slots
      </label>
      {mode !== 'location' && (
        <label className="flex items-center gap-1.5 text-slate-300">
          from channel
          <input
            type="number"
            min={1}
            max={500}
            value={startAt}
            onChange={(e) => onStartAtChange(Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-center font-mono"
          />
        </label>
      )}
    </div>
    <div className="text-slate-400">
      {describeTargets(plan)}
      {plan.overwrites.length > 0 && (
        <span className="text-amber-300"> · replaces {plan.overwrites.length} programmed channel(s): {plan.overwrites.slice(0, 10).join(', ')}{plan.overwrites.length > 10 ? '…' : ''}</span>
      )}
      {plan.dropped > 0 && <span className="text-rose-300"> · {plan.dropped} won't fit</span>}
    </div>
  </div>
);
