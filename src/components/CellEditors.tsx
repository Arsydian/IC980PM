import React, { useEffect, useState } from 'react';
import { ToneSetting } from '../types/radio';
import { formatTone, TONE_OPTION_GROUPS, toneFromKey, toneKey } from '../codecs/tone-tables';
import { formatMHz, parseFrequencyInput } from '../codecs/channel';
import { toRadioAscii } from '../codecs/text';

const cellInput =
  'w-full bg-transparent px-1.5 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed';

/**
 * Frequency entry that is only committed on Enter or blur, so partial input
 * like "146." is never rewritten while typing. Escape reverts.
 */
export const FreqInput: React.FC<{
  value: number;
  onCommit: (mhz: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  allowZero?: boolean;
}> = ({ value, onCommit, disabled, className = '', placeholder = '—', ariaLabel, allowZero = true }) => {
  const [text, setText] = useState(formatMHz(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(formatMHz(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const mhz = parseFrequencyInput(text);
    if (Number.isNaN(mhz) || (!allowZero && mhz === 0)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (Math.abs(mhz - value) > 1e-7) onCommit(mhz);
    else setText(formatMHz(value));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={invalid}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      title={invalid ? 'Enter a frequency in MHz, e.g. 146.52' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(formatMHz(value));
          setInvalid(false);
        }
      }}
      className={`${cellInput} font-mono ${invalid ? 'ring-1 ring-rose-500 text-rose-300' : ''} ${className}`}
    />
  );
};

/** Offset in MHz, same commit rules as FreqInput but accepts small values. */
export const OffsetInput: React.FC<{ value: number; onCommit: (mhz: number) => void; disabled?: boolean; ariaLabel: string }> = ({
  value,
  onCommit,
  disabled,
  ariaLabel
}) => {
  const fmt = (v: number) => (v > 0 ? v.toFixed(3) : '');
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (text.trim() === '') onCommit(0);
    else if (Number.isFinite(v) && v >= 0 && v < 100) onCommit(v);
    else setText(fmt(value));
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      disabled={disabled}
      placeholder={disabled ? '' : '0.600'}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(fmt(value));
      }}
      className={`${cellInput} font-mono`}
    />
  );
};

/** Channel name, limited to what the radio can display. */
export const NameInput: React.FC<{ value: string; onChange: (name: string) => void; placeholder?: string; ariaLabel: string; className?: string }> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = ''
}) => (
  <input
    type="text"
    aria-label={ariaLabel}
    maxLength={16}
    spellCheck={false}
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(toRadioAscii(e.target.value))}
    className={`${cellInput} font-sans ${className}`}
  />
);

const toneOptions = TONE_OPTION_GROUPS.map((g) => (
  <optgroup key={g.label} label={g.label}>
    {g.options.map((o) => (
      <option key={o.key} value={o.key}>
        {o.label}
      </option>
    ))}
  </optgroup>
));

export const ToneSelect: React.FC<{ value: ToneSetting; onChange: (tone: ToneSetting) => void; ariaLabel: string; className?: string }> = ({
  value,
  onChange,
  ariaLabel,
  className = ''
}) => {
  const key = toneKey(value);
  const standard = TONE_OPTION_GROUPS.some((g) => g.options.some((o) => o.key === key));
  return (
    <select
      aria-label={ariaLabel}
      value={key}
      onChange={(e) => onChange(toneFromKey(e.target.value, value))}
      className={`w-full bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none font-mono ${value.type === 0 ? 'text-slate-500' : 'text-emerald-300'} ${className}`}
    >
      {!standard && <option value={key}>{formatTone(value)} (non-standard)</option>}
      {toneOptions}
    </select>
  );
};

export function CellSelect<T extends number | string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const known = options.some(([v]) => v === value);
  return (
    <select
      aria-label={ariaLabel}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find(([v]) => String(v) === raw);
        if (match) onChange(match[0]);
      }}
      className="w-full bg-transparent px-1 py-0.5 rounded text-xs focus:bg-slate-800 focus:outline-none font-sans"
    >
      {!known && <option value={String(value)}>? ({String(value)})</option>}
      {options.map(([v, label]) => (
        <option key={String(v)} value={String(v)} className="bg-slate-800">
          {label}
        </option>
      ))}
    </select>
  );
}
