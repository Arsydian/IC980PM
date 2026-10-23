import React from 'react';
import {
  FilePlus,
  FolderOpen,
  Save,
  Download,
  Upload,
  BookOpen,
  Sliders,
  Search,
  Filter
} from 'lucide-react';

interface ToolbarProps {
  onNew: () => void;
  onOpen: () => void;
  onSaveYsf: () => void;
  onExportCsv: () => void;
  onImportCsv: () => void;
  onReadRadio: () => void;
  onWriteRadio: () => void;
  onOpenRepeaterBook: () => void;
  onOpenSettings: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  bandFilter: string;
  onBandFilterChange: (b: string) => void;
  connected: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onNew,
  onOpen,
  onSaveYsf,
  onExportCsv,
  onImportCsv,
  onReadRadio,
  onWriteRadio,
  onOpenRepeaterBook,
  onOpenSettings,
  searchQuery,
  onSearchChange,
  bandFilter,
  onBandFilterChange,
  connected
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-900/60 border-b border-slate-800 text-xs select-none">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* File Actions */}
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          title="Create New Blank Codeplug"
        >
          <FilePlus className="w-3.5 h-3.5 text-slate-400" />
          <span>New</span>
        </button>

        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          title="Open .YSF Codeplug File"
        >
          <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
          <span>Open .YSF</span>
        </button>

        <button
          onClick={onSaveYsf}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          title="Save as IC-980 .YSF File"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span>Save .YSF</span>
        </button>

        <div className="h-5 w-px bg-slate-700/80 mx-1" />

        {/* CSV Tools */}
        <button
          onClick={onImportCsv}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          title="Import CHIRP or OEM CSV"
        >
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span>Import CSV</span>
        </button>

        <button
          onClick={onExportCsv}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          title="Export as CHIRP CSV"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Export CSV</span>
        </button>

        <div className="h-5 w-px bg-slate-700/80 mx-1" />

        {/* RepeaterBook Special Tool */}
        <button
          onClick={onOpenRepeaterBook}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-medium rounded shadow-sm transition"
          title="Import Repeaters by Location or Proximity"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>RepeaterBook Import</span>
        </button>

        <div className="h-5 w-px bg-slate-700/80 mx-1" />

        {/* Physical Radio Programming */}
        <button
          onClick={onReadRadio}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded shadow-sm transition"
          title="Read Codeplug from Radio over USB"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Read from Radio</span>
        </button>

        <button
          onClick={onWriteRadio}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded shadow-sm transition"
          title="Write Channels to Radio over USB"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Write to Radio</span>
        </button>

        <div className="h-5 w-px bg-slate-700/80 mx-1" />

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          title="Configure Radio Auxiliary Settings"
        >
          <Sliders className="w-3.5 h-3.5 text-purple-400" />
          <span>Radio Settings</span>
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-800 rounded border border-slate-700 px-2 py-1">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={bandFilter}
            onChange={(e) => onBandFilterChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-800">All Bands</option>
            <option value="vhf" className="bg-slate-800">VHF (134-176 MHz)</option>
            <option value="uhf" className="bg-slate-800">UHF (400-475 MHz)</option>
            <option value="air" className="bg-slate-800">Airband AM (108-137 MHz)</option>
            <option value="active" className="bg-slate-800">Active Only</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-800 rounded border border-slate-700 px-2.5 py-1 w-52">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs w-full focus:outline-none placeholder:text-slate-500"
          />
        </div>
      </div>
    </div>
  );
};
