import React, { useState, useRef, useEffect } from 'react';
import { RepeaterBookResult, RadioChannel } from '../types/radio';
import {
  searchRepeaters,
  repeaterToRadioChannel,
  parseRepeaterBookCsv,
  US_STATE_MAP
} from '../services/repeaterbook';
import {
  X,
  Search,
  MapPin,
  CheckSquare,
  Square,
  Download,
  Compass,
  Navigation,
  Upload,
  Key,
  RotateCcw,
  AlertCircle
} from 'lucide-react';

interface RepeaterBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (channelsToInsert: RadioChannel[], targetStartIndex: number, mode: 'append' | 'startAt' | 'overwrite') => void;
  existingChannels: RadioChannel[];
}

export const RepeaterBookModal: React.FC<RepeaterBookModalProps> = ({
  isOpen,
  onClose,
  onImport,
  existingChannels
}) => {
  // Search parameters
  const [activeTab, setActiveTab] = useState<'directory' | 'proximity'>('directory');
  const [keyword, setKeyword] = useState('');
  const [state, setState] = useState('');
  const [band, setBand] = useState('all');
  const [proximityLat, setProximityLat] = useState<string>('');
  const [proximityLon, setProximityLon] = useState<string>('');
  const [radiusMiles, setRadiusMiles] = useState<number>(50);
  const [isLocating, setIsLocating] = useState(false);

  // API Token settings
  const [showApiToken, setShowApiToken] = useState(false);
  const [apiToken, setApiToken] = useState(() => {
    try {
      return localStorage.getItem('repeaterbook_api_token') || '';
    } catch {
      return '';
    }
  });

  // Search execution & feedback state
  const [results, setResults] = useState<RepeaterBookResult[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchSummary, setSearchSummary] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Placement options
  const [placementMode, setPlacementMode] = useState<'append' | 'startAt' | 'overwrite'>('append');
  const [startChannel, setStartChannel] = useState<number>(1);

  // File input ref for direct CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (apiToken) {
      try {
        localStorage.setItem('repeaterbook_api_token', apiToken);
      } catch {
        // Ignore local storage error
      }
    }
  }, [apiToken]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    setIsSearching(true);
    setStatusMessage(null);
    try {
      const lat = proximityLat ? parseFloat(proximityLat) : undefined;
      const lon = proximityLon ? parseFloat(proximityLon) : undefined;

      const summaryParts: string[] = [];
      if (activeTab === 'directory') {
        if (state.trim()) summaryParts.push(`State: ${state.trim().toUpperCase()}`);
      } else {
        if (lat !== undefined && lon !== undefined) {
          summaryParts.push(`Proximity: ${lat.toFixed(3)}, ${lon.toFixed(3)} (±${radiusMiles}mi)`);
        }
      }
      if (band !== 'all') summaryParts.push(`Band: ${band === '144' ? '2m (144MHz)' : '70cm (440MHz)'}`);
      if (keyword.trim()) summaryParts.push(`"${keyword.trim()}"`);

      const summary = summaryParts.length > 0 ? summaryParts.join(' | ') : 'All Repeaters';
      setSearchSummary(summary);

      const res = await searchRepeaters({
        state: activeTab === 'directory' ? (state.trim() || undefined) : undefined,
        band: band !== 'all' ? band : undefined,
        keyword: keyword.trim() || undefined,
        lat: activeTab === 'proximity' ? lat : undefined,
        lon: activeTab === 'proximity' ? lon : undefined,
        radiusMiles: activeTab === 'proximity' && lat !== undefined && lon !== undefined ? radiusMiles : undefined,
        apiToken: apiToken.trim() || undefined
      });

      setResults(res);
      setHasSearched(true);
      // Select all by default
      setSelectedIndices(new Set(res.map((_, i) => i)));
    } catch (err: any) {
      console.error('Repeater search failed:', err);
      setStatusMessage(`Search error: ${err.message || 'Failed to query repeaters'}`);
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleShowAll = async () => {
    setState('');
    setKeyword('');
    setBand('all');
    setProximityLat('');
    setProximityLon('');
    setIsSearching(true);
    setStatusMessage(null);
    try {
      const res = await searchRepeaters({ band: 'all' });
      setResults(res);
      setHasSearched(true);
      setSearchSummary('Complete North American Directory');
      setSelectedIndices(new Set(res.map((_, i) => i)));
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser or environment.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setProximityLat(pos.coords.latitude.toFixed(4));
        setProximityLon(pos.coords.longitude.toFixed(4));
        setIsLocating(false);
        setActiveTab('proximity');
      },
      (err) => {
        setIsLocating(false);
        alert(`Could not acquire location: ${err.message}. Please enter coordinates manually.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseRepeaterBookCsv(text);
      if (imported.length === 0) {
        alert('No valid repeaters found in the selected CSV file. Please ensure it contains standard RepeaterBook or CHIRP headers.');
        return;
      }
      setResults(imported);
      setHasSearched(true);
      setSearchSummary(`Imported from ${file.name}`);
      setSelectedIndices(new Set(imported.map((_, i) => i)));
      setStatusMessage(`Successfully loaded ${imported.length} repeaters from ${file.name}`);
    } catch (err: any) {
      alert(`Error reading CSV file: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIndices.size === results.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(results.map((_, i) => i)));
    }
  };

  const handleToggleRow = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedIndices(next);
  };

  const handleCommitImport = () => {
    const selected = results.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    let targetIdx = startChannel;
    if (placementMode === 'append') {
      const firstEmpty = existingChannels.findIndex((c) => c.rxFreq <= 0);
      targetIdx = firstEmpty !== -1 ? firstEmpty + 1 : 1;
    }

    const convertedChannels = selected.map((r, i) =>
      repeaterToRadioChannel(r, targetIdx + i)
    );

    onImport(convertedChannels, targetIdx, placementMode);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                RepeaterBook Proximity & Directory Import
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30">
                  50-State & Live API
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Find nearby VHF/UHF repeaters and program directly into IC-980 Pro Max memory channels
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowApiToken(!showApiToken)}
              title="Configure RepeaterBook API Token"
              className={`p-1.5 rounded-lg border transition ${
                apiToken
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import RepeaterBook or CHIRP CSV file"
              className="p-1.5 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800 rounded-lg transition"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCsvUpload}
              accept=".csv"
              className="hidden"
            />
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Optional Live API Token Drawer */}
        {showApiToken && (
          <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 text-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex-1">
              <label className="block text-slate-300 font-medium mb-1">
                RepeaterBook API Application Token (Optional)
              </label>
              <input
                type="password"
                placeholder="Paste free token (rbuapp_...)"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="text-[11px] text-slate-400 max-w-sm">
              RepeaterBook offers free user API tokens at{' '}
              <a
                href="https://www.repeaterbook.com/user/api_apps.php"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                repeaterbook.com
              </a>
              . When left empty, searches query the built-in 50-state verified database.
            </div>
          </div>
        )}

        {/* Tab Headers: Directory vs Proximity */}
        <div className="flex items-center gap-1 px-4 pt-2.5 bg-slate-950/80 border-b border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 font-medium rounded-t-lg transition border-t border-x ${
              activeTab === 'directory'
                ? 'bg-slate-900 text-sky-400 border-slate-800'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            Directory Search (State / Region)
          </button>
          <button
            onClick={() => setActiveTab('proximity')}
            className={`flex items-center gap-1 px-3 py-1.5 font-medium rounded-t-lg transition border-t border-x ${
              activeTab === 'proximity'
                ? 'bg-slate-900 text-sky-400 border-slate-800'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Proximity Radius (GPS / Coordinates)</span>
          </button>
        </div>

        {/* Search Controls */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 text-xs">
          {activeTab === 'directory' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">State / Region</label>
                <input
                  type="text"
                  list="us-states-list"
                  placeholder="e.g. FL, NY, Texas, CA"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                />
                <datalist id="us-states-list">
                  {Object.entries(US_STATE_MAP).map(([abbr, name]) => (
                    <option key={abbr} value={abbr}>
                      {name} ({abbr})
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Frequency Band</label>
                <select
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Bands (2m & 70cm)</option>
                  <option value="144">144 MHz (2m VHF)</option>
                  <option value="440">440 MHz (70cm UHF)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Keyword / Callsign / City</label>
                <input
                  type="text"
                  placeholder="Callsign, city, or frequency"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded transition shadow-sm"
                >
                  <Search className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                  <span>{isSearching ? 'Searching...' : 'Search Repeaters'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 28.5383"
                  value={proximityLat}
                  onChange={(e) => setProximityLat(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. -81.3792"
                  value={proximityLon}
                  onChange={(e) => setProximityLon(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Radius (Miles)</label>
                <select
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(parseInt(e.target.value) || 50)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value={15}>15 Miles</option>
                  <option value={30}>30 Miles</option>
                  <option value={50}>50 Miles</option>
                  <option value={75}>75 Miles</option>
                  <option value={100}>100 Miles</option>
                  <option value={200}>200 Miles</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Band</label>
                <select
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Bands</option>
                  <option value="144">144 MHz (2m)</option>
                  <option value="440">440 MHz (70cm)</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleUseLocation}
                  disabled={isLocating}
                  title="Detect coordinates from GPS or Browser"
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded transition"
                >
                  <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded transition shadow-sm"
                >
                  <Search className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                  <span>{isSearching ? 'Searching...' : 'Search Nearby'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Filter Bar & Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span>Popular States:</span>
              {['FL', 'TX', 'CA', 'NY', 'OH', 'GA', 'PA', 'WA', 'IL'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setState(st);
                    setActiveTab('directory');
                  }}
                  className={`px-1.5 py-0.5 rounded font-mono border transition ${
                    state.toUpperCase() === st
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleShowAll}
              className="text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Browse All Repeaters ({50}+ US States)</span>
            </button>
          </div>
        </div>

        {/* Results Banner if searched */}
        {hasSearched && (
          <div className="flex items-center justify-between px-5 py-2 bg-slate-900 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Search Filter:</span>
              <span className="font-medium text-slate-200">{searchSummary}</span>
              <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono text-[11px]">
                {results.length} found
              </span>
            </div>
            {statusMessage && (
              <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {statusMessage}
              </span>
            )}
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-auto bg-slate-950 p-2 font-mono text-xs min-h-[220px]">
          {!hasSearched ? (
            <div className="flex flex-col items-center justify-center h-56 text-slate-500 gap-3 font-sans">
              <div className="p-3 bg-slate-900 rounded-full border border-slate-800 text-slate-400">
                <MapPin className="w-8 h-8 text-sky-400" />
              </div>
              <div className="text-center">
                <p className="text-slate-300 font-medium">Ready to Search Repeaters</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter a state code (e.g. FL, TX, CA, NY), keyword, or click "Search Repeaters"
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleSearch}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition shadow-sm"
                >
                  Search Current Criteria
                </button>
                <button
                  onClick={handleShowAll}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition"
                >
                  Show All Repeaters
                </button>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-slate-400 gap-3 font-sans">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-slate-200 font-medium">No Repeaters Found</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  No repeaters matched {searchSummary ? `"${searchSummary}"` : 'your query'}.
                  Try searching by 2-letter state code (e.g. FL, TX, CA, NY, OH) or clearing your keywords.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleShowAll}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
                >
                  Clear Filters & Show All
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 z-10">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">
                    <button
                      onClick={handleToggleSelectAll}
                      className="hover:text-sky-400"
                      title={selectedIndices.size === results.length ? 'Deselect All' : 'Select All'}
                    >
                      {selectedIndices.size === results.length && results.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2">Callsign</th>
                  <th className="px-3 py-2">Output (RX)</th>
                  <th className="px-3 py-2">Duplex</th>
                  <th className="px-3 py-2">Tone</th>
                  <th className="px-3 py-2">Location / County</th>
                  <th className="px-3 py-2">Use</th>
                  {results.some((r) => r.distanceMiles !== undefined) && (
                    <th className="px-3 py-2">Distance</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {results.map((r, idx) => {
                  const isChecked = selectedIndices.has(idx);
                  return (
                    <tr
                      key={idx}
                      onClick={() => handleToggleRow(idx)}
                      className={`hover:bg-slate-900/60 cursor-pointer transition ${
                        isChecked ? 'bg-sky-950/20 text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRow(idx)}
                          className="rounded border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 font-bold text-sky-400 font-mono">{r.callsign}</td>
                      <td className="px-3 py-2 font-mono text-slate-100">{r.frequency.toFixed(4)} MHz</td>
                      <td className="px-3 py-2 font-mono">{r.duplex} {r.offset.toFixed(3)}</td>
                      <td className="px-3 py-2 font-mono text-emerald-400">
                        {r.toneVal && r.toneVal !== 'None' ? `${r.toneVal} (${r.toneType})` : 'CSQ / None'}
                      </td>
                      <td className="px-3 py-2">
                        {r.location ? `${r.location}, ` : ''}{r.state}
                        {r.county ? ` (${r.county} Co.)` : ''}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                          {r.use}
                        </span>
                      </td>
                      {r.distanceMiles !== undefined && (
                        <td className="px-3 py-2 font-mono text-amber-400">{r.distanceMiles} mi</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Import Placement Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium">Placement:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="placement"
                checked={placementMode === 'append'}
                onChange={() => setPlacementMode('append')}
                className="text-sky-600 focus:ring-0"
              />
              <span className="text-slate-300">Append to empty slots</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="placement"
                checked={placementMode === 'startAt'}
                onChange={() => setPlacementMode('startAt')}
                className="text-sky-600 focus:ring-0"
              />
              <span className="text-slate-300">Start at Channel:</span>
              <input
                type="number"
                min={1}
                max={500}
                value={startChannel}
                onChange={(e) => setStartChannel(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={placementMode !== 'startAt'}
                className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-center font-mono disabled:opacity-40"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Selected: <strong className="text-sky-400">{selectedIndices.size}</strong> repeaters
            </span>
            <button
              onClick={handleCommitImport}
              disabled={selectedIndices.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              <span>Import to Radio Channels</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
