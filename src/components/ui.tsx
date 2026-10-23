import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export const inputClass =
  'w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-40';
export const selectClass = inputClass;

type ButtonVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'ghost';

const variants: Record<ButtonVariant, string> = {
  default: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
  primary: 'bg-sky-600 hover:bg-sky-500 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  warning: 'bg-amber-600 hover:bg-amber-500 text-white',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white',
  ghost: 'text-slate-300 hover:text-white hover:bg-slate-800'
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }> = ({
  variant = 'default',
  className = '',
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    {...props}
  />
);

export const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  children,
  className = ''
}) => (
  <label className={`block text-xs ${className}`}>
    <span className="block text-slate-400 mb-1 font-medium">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
  </label>
);

export const Confidence: React.FC<{ level: 'inferred' | 'unverified' }> = ({ level }) => (
  <span
    title={level === 'inferred'
      ? 'Location worked out from the structure of the factory file. Confirm with the OEM software.'
      : 'From the original reverse-engineering notes. Not yet confirmed on a radio.'}
    className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border bg-amber-500/10 text-amber-300 border-amber-500/30"
  >
    {level}
  </span>
);

interface ModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ title, subtitle, icon, onClose, footer, width = 'max-w-xl', children }) => {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className={`flex flex-col w-full ${width} max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <div className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20 shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3 border-t border-slate-800 bg-slate-900/90">{footer}</div>}
      </div>
    </div>
  );
};

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}

/** A toolbar button that opens a small list of actions. */
export const Menu: React.FC<{ label: React.ReactNode; items: MenuItem[]; title?: string }> = ({ label, items, title }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button title={title} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </Button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-40 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span className="block">{item.label}</span>
              {item.hint && <span className="block text-[11px] text-slate-500">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
