import React from 'react';
import { BookOpen, Download, FilePlus, Filter, FolderOpen, Redo2, Save, Search, Sliders, Undo2, Upload, Wrench } from 'lucide-react';
import { Button, Menu, MenuItem } from './ui';

export type BandFilter = 'all' | 'active' | 'vhf' | 'uhf' | 'air' | 'issues';

interface ToolbarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  importItems: MenuItem[];
  exportItems: MenuItem[];
  radioItems: MenuItem[];
  toolItems: MenuItem[];
  onRead: () => void;
  onWrite: () => void;
  onRepeaterBook: () => void;
  onExtras: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  bandFilter: BandFilter;
  onBandFilterChange: (b: BandFilter) => void;
}

export const Toolbar: React.FC<ToolbarProps> = (p) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-900/60 border-b border-slate-800 text-xs select-none">
    <div className="flex flex-wrap items-center gap-1.5">
      <Button onClick={p.onNew} title="New blank codeplug"><FilePlus className="w-3.5 h-3.5 text-slate-400" />New</Button>
      <Button onClick={p.onOpen} title="Open a .ysf codeplug (Ctrl+O)"><FolderOpen className="w-3.5 h-3.5 text-sky-400" />Open</Button>
      <Button onClick={p.onSave} title="Save as .ysf (Ctrl+S)"><Save className="w-3.5 h-3.5 text-emerald-400" />Save .ysf</Button>
      <Menu label={<><Upload className="w-3.5 h-3.5 text-amber-400" />Import</>} items={p.importItems} />
      <Menu label={<><Download className="w-3.5 h-3.5 text-slate-400" />Export</>} items={p.exportItems} />

      <span className="h-5 w-px bg-slate-700/80 mx-1" />
      <Button variant="primary" onClick={p.onRepeaterBook} className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500">
        <BookOpen className="w-3.5 h-3.5" />RepeaterBook
      </Button>

      <span className="h-5 w-px bg-slate-700/80 mx-1" />
      <Button variant="success" onClick={p.onRead} title="Read the radio over USB"><Download className="w-3.5 h-3.5" />Read radio</Button>
      <Button variant="warning" onClick={p.onWrite} title="Write to the radio over USB"><Upload className="w-3.5 h-3.5" />Write radio</Button>
      <Menu label="Radio" items={p.radioItems} />

      <span className="h-5 w-px bg-slate-700/80 mx-1" />
      <Button onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="w-3.5 h-3.5" /></Button>
      <Button onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="w-3.5 h-3.5" /></Button>
      <Button onClick={p.onExtras} title="Handset keys, power-on message, VFOs and other non-channel data"><Sliders className="w-3.5 h-3.5 text-purple-400" />Radio settings</Button>
      <Menu label={<><Wrench className="w-3.5 h-3.5 text-slate-400" />Tools</>} items={p.toolItems} />
    </div>

    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-slate-800 rounded border border-slate-700 px-2 py-1">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select
          aria-label="Filter channels"
          value={p.bandFilter}
          onChange={(e) => p.onBandFilterChange(e.target.value as BandFilter)}
          className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
        >
          <option value="all" className="bg-slate-800">All channels</option>
          <option value="active" className="bg-slate-800">Programmed only</option>
          <option value="vhf" className="bg-slate-800">VHF (134–176 MHz)</option>
          <option value="uhf" className="bg-slate-800">UHF (400–475 MHz)</option>
          <option value="air" className="bg-slate-800">Airband (108–134 MHz)</option>
          <option value="issues" className="bg-slate-800">With problems</option>
        </select>
      </div>
      <div className="flex items-center gap-1.5 bg-slate-800 rounded border border-slate-700 px-2.5 py-1 w-52">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          type="search"
          aria-label="Search channels"
          placeholder="Search name, frequency, #"
          value={p.searchQuery}
          onChange={(e) => p.onSearchChange(e.target.value)}
          className="bg-transparent text-slate-200 text-xs w-full focus:outline-none placeholder:text-slate-500"
        />
      </div>
    </div>
  </div>
);
