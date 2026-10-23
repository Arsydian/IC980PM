import React, { useEffect, useState } from 'react';
import { Cpu, Usb } from 'lucide-react';
import { desktop, SerialPortInfo } from '../platform';
import { describeUsbVendor, isKnownCableChip, isWebSerialSupported } from '../services/serial-transport';
import { Button, Modal } from './ui';

interface ConnectModalProps {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: 'serial' | 'simulator') => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({ open, onClose, onChoose }) => {
  if (!open) return null;
  const serialOk = isWebSerialSupported();
  const linuxHint = desktop?.platform === 'linux';
  return (
    <Modal title="Connect" subtitle="Choose what to program" icon={<Usb className="w-5 h-5" />} onClose={onClose}>
      <div className="p-5 grid gap-3 text-xs">
        <button
          disabled={!serialOk}
          onClick={() => onChoose('serial')}
          className="text-left p-4 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 disabled:opacity-40"
        >
          <div className="flex items-center gap-2 text-slate-100 font-medium"><Usb className="w-4 h-4 text-emerald-400" />USB programming cable</div>
          <p className="text-slate-400 mt-1">
            Plug the cable into the radio, switch the radio on, then pick the cable's serial port. Close the OEM software first — only one program can use the port.
            {linuxHint && ' On Linux your user must be in the dialout (or uucp) group.'}
          </p>
          {!serialOk && <p className="text-amber-300 mt-1">This browser can't open serial ports. Use the desktop app, or Chrome / Edge.</p>}
        </button>
        <button onClick={() => onChoose('simulator')} className="text-left p-4 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800">
          <div className="flex items-center gap-2 text-slate-100 font-medium"><Cpu className="w-4 h-4 text-sky-400" />Simulated radio</div>
          <p className="text-slate-400 mt-1">A built-in pretend radio for trying Read, Write, backups and restore without hardware. Its memory lasts until you close the app.</p>
        </button>
      </div>
    </Modal>
  );
};

/** Desktop app only: lists serial ports when the renderer asks for one (Electron has no built-in chooser). */
export const SerialPortPicker: React.FC = () => {
  const [ports, setPorts] = useState<SerialPortInfo[] | null>(null);

  useEffect(() => {
    if (!desktop) return;
    const offList = desktop.onSerialPorts((list) => setPorts(list));
    const offAdd = desktop.onSerialPortAdded((p) => setPorts((cur) => (cur ? [...cur.filter((c) => c.portId !== p.portId), p] : cur)));
    const offRemove = desktop.onSerialPortRemoved((p) => setPorts((cur) => (cur ? cur.filter((c) => c.portId !== p.portId) : cur)));
    return () => {
      offList();
      offAdd();
      offRemove();
    };
  }, []);

  if (!ports || !desktop) return null;
  const choose = (id: string | null) => {
    void desktop!.selectSerialPort(id);
    setPorts(null);
  };
  const sorted = [...ports].sort((a, b) => Number(isKnownCableChip(b.vendorId)) - Number(isKnownCableChip(a.vendorId)));

  return (
    <Modal title="Choose the programming cable" icon={<Usb className="w-5 h-5" />} onClose={() => choose(null)} footer={<Button variant="ghost" onClick={() => choose(null)}>Cancel</Button>}>
      <div className="p-4 space-y-2 text-xs">
        {sorted.length === 0 && <p className="text-slate-400 p-3">No serial ports found. Plug the cable in — it will appear here.</p>}
        {sorted.map((p) => {
          const chip = describeUsbVendor(p.vendorId);
          return (
            <button key={p.portId} onClick={() => choose(p.portId)} className="w-full text-left p-3 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800">
              <div className="text-slate-100 font-medium">{p.displayName || p.portName || p.portId}</div>
              <div className="text-slate-400">
                {p.portName}
                {chip ? ` · ${chip} (likely the cable)` : p.vendorId !== undefined ? ` · USB ${p.vendorId.toString(16).padStart(4, '0')}:${(p.productId ?? 0).toString(16).padStart(4, '0')}` : ' · not a USB device'}
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
};
