import React, { useEffect, useMemo, useState } from 'react';
import { Compass, ExternalLink, Key, Navigation, Search, Upload } from 'lucide-react';
import { RadioChannel, RepeaterBookResult } from '../types/radio';
import { getRegion, REGIONS, RegionId } from '../codecs/band-plans';
import { applyPlacement, planPlacement, PlacementMode } from '../codecs/placement';
import { formatTone } from '../codecs/tone-tables';
import {
  CANADIAN_PROVINCES,
  fetchRepeaterBook,
  filterRepeaters,
  isAlreadyProgrammed,
  NameFormat,
  parseRepeaterBookCsv,
  RB_ATTRIBUTION,
  RB_HOME,
  RB_TOKEN_PAGE,
  repeaterToRadioChannel,
  US_STATES
} from '../services/repeaterbook';
import { desktop, storage } from '../platform';
import { PlacementPicker } from './PlacementPicker';
import { Button, Field, inputClass, Modal, selectClass } from './ui';

type Row = RepeaterBookResult & { key: number };

interface RepeaterBookModalProps {
  open: boolean;
  onClose: () => void;
  channels: RadioChannel[];
  region: RegionId;
  onImport: (next: RadioChannel[], count: number) => void;
}

const CONTACT_KEY = 'ic980.rbContact';
const rbRegions = REGIONS.filter((r) => r.repeaterBook);

const RepeaterBookForm: React.FC<Omit<RepeaterBookModalProps, 'open'>> = ({ onClose, channels, region: appRegion, onImport }) => {
  const [region, setRegion] = useState<RegionId>(getRegion(appRegion).repeaterBook ? appRegion : 'US');
  const [state, setState] = useState('');
  const [county, setCounty] = useState('');
  const [city, setCity] = useState('');

  const [results, setResults] = useState<Row[]>([]);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [band, setBand] = useState<'all' | '144' | '440'>('all');
  const [keyword, setKeyword] = useState('');
  const [onlyOnAir, setOnlyOnAir] = useState(true);
  const [onlyAnalog, setOnlyAnalog] = useState(true);
  const [hideProgrammed, setHideProgrammed] = useState(true);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [radius, setRadius] = useState(50);
  const [locating, setLocating] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [nameFormat, setNameFormat] = useState<NameFormat>('callsign');
  const [mode, setMode] = useState<PlacementMode>('appendEmpty');
  const [startAt, setStartAt] = useState(1);

  const [showKey, setShowKey] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [contact, setContact] = useState(() => storage.get(CONTACT_KEY) ?? '');

  useEffect(() => {
    void desktop?.hasRepeaterBookToken().then(setHasToken);
  }, []);
  useEffect(() => {
    storage.set(CONTACT_KEY, contact);
  }, [contact]);

  const origin = lat && lon && Number.isFinite(parseFloat(lat)) && Number.isFinite(parseFloat(lon))
    ? { lat: parseFloat(lat), lon: parseFloat(lon) }
    : undefined;

  const visible = useMemo(() => {
    const filtered = filterRepeaters(results, {
      band,
      keyword,
      onlyOnAir,
      onlyAnalog,
      state: region === 'CA' ? state : undefined,
      origin,
      radiusMiles: origin ? radius : undefined
    });
    return hideProgrammed ? filtered.filter((r) => !isAlreadyProgrammed(r, channels)) : filtered;
  }, [results, band, keyword, onlyOnAir, onlyAnalog, region, state, origin?.lat, origin?.lon, radius, hideProgrammed, channels]);

  const chosen = visible.filter((r) => selected.has(r.key));
  const plan = useMemo(() => planPlacement(channels, chosen.length, mode, startAt), [channels, chosen.length, mode, startAt]);

  const loadResults = (list: RepeaterBookResult[], label: string) => {
    const rows = list.map((r, key) => ({ ...r, key }));
    setResults(rows);
    setSource(label);
    setSelected(new Set(rows.filter((r) => !isAlreadyProgrammed(r, channels)).map((r) => r.key)));
  };

  const search = async () => {
    setError(null);
    if (region === 'US' && !state) {
      setError('Pick a state — RepeaterBook asks apps to keep requests narrow.');
      return;
    }
    if (!contact.trim()) {
      setShowKey(true);
      setError('Add your callsign and email in the key settings; RepeaterBook requires contact details in each request.');
      return;
    }
    setBusy(true);
    try {
      const list = await fetchRepeaterBook({ region, state: state || undefined, county: county || undefined, city: city || undefined }, contact.trim());
      loadResults(list, `${getRegion(region).name}${state ? ` · ${state}` : ''}${county ? ` · ${county}` : ''}${city ? ` · ${city}` : ''}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const loadCsv = async (file: File) => {
    setError(null);
    try {
      const list = parseRepeaterBookCsv(await file.text(), region);
      if (list.length === 0) throw new Error('No repeaters found in that file. Expected a RepeaterBook, CHIRP or OEM CSV export.');
      loadResults(list, file.name);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  const saveToken = async () => {
    if (!desktop) return;
    try {
      const res = await desktop.setRepeaterBookToken(tokenInput);
      setTokenInput('');
      setHasToken(res.stored !== 'none');
      setTokenMessage(res.stored === 'secure' ? 'Token saved in your system\'s encrypted storage.'
        : res.stored === 'session' ? 'No encrypted storage on this system: the token is kept until you close the app.'
          : 'Token removed.');
    } catch (err: any) {
      setTokenMessage(err?.message ?? String(err));
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError('Location is not available here. Type your latitude and longitude.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4));
        setLon(pos.coords.longitude.toFixed(4));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(`Could not get your location (${err.message}). Type your latitude and longitude instead.`);
      },
      { timeout: 10000 }
    );
  };

  const toggle = (key: number) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.key));

  const doImport = () => {
    const incoming = chosen.map((r) => repeaterToRadioChannel(r, 1, nameFormat));
    onImport(applyPlacement(channels, incoming, plan), plan.targets.filter((t) => t !== -1).length);
    onClose();
  };

  return (
    <Modal
      title="RepeaterBook import"
      subtitle={<>Find repeaters and add them to channels. <a href={RB_HOME} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{RB_ATTRIBUTION}</a></>}
      icon={<Compass className="w-5 h-5" />}
      width="max-w-6xl"
      onClose={onClose}
      footer={
        <div className="w-full flex flex-wrap items-end justify-between gap-3">
          <PlacementPicker mode={mode} startAt={startAt} onModeChange={setMode} onStartAtChange={setStartAt} plan={plan} />
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-slate-400">
              Name
              <select value={nameFormat} onChange={(e) => setNameFormat(e.target.value as NameFormat)} className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-200">
                <option value="callsign">Callsign</option>
                <option value="callsign-city">Callsign + city</option>
                <option value="city">City</option>
              </select>
            </label>
            <Button variant="success" disabled={chosen.length === 0 || plan.dropped === chosen.length} onClick={doImport}>
              Import {chosen.length} repeater(s)
            </Button>
          </div>
        </div>
      }
    >
      <div className="text-xs">
        {/* Search */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <Field label="Country">
              <select className={selectClass} value={region} onChange={(e) => { setRegion(e.target.value as RegionId); setState(''); }}>
                {rbRegions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label={region === 'US' ? 'State' : region === 'CA' ? 'Province' : 'Region (optional)'}>
              {region === 'US' ? (
                <select className={selectClass} value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">Choose…</option>
                  {US_STATES.map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                </select>
              ) : region === 'CA' ? (
                <select className={selectClass} value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">All provinces</option>
                  {CANADIAN_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input className={inputClass} value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. England" />
              )}
            </Field>
            {region === 'US' && (
              <Field label="County (optional)"><input className={inputClass} value={county} onChange={(e) => setCounty(e.target.value)} /></Field>
            )}
            <Field label="City (optional)"><input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} /></Field>
            <div className="flex gap-2 md:col-span-2">
              <Button variant="primary" onClick={search} disabled={busy || !desktop} title={desktop ? 'Query RepeaterBook' : 'Live search runs in the desktop app'}>
                <Search className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Searching…' : 'Search RepeaterBook'}
              </Button>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer hover:bg-slate-700" title="RepeaterBook, CHIRP or OEM CSV">
                <Upload className="w-3.5 h-3.5" />Load CSV
                <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadCsv(f); e.target.value = ''; }} />
              </label>
              <Button onClick={() => setShowKey(!showKey)} title="RepeaterBook token and contact details" className={hasToken ? 'text-emerald-400' : ''}>
                <Key className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {!desktop && <p className="text-amber-300">Live search runs in the desktop app; browsers block requests to RepeaterBook. Here you can load a CSV downloaded from RepeaterBook.</p>}

          {showKey && (
            <div className="grid md:grid-cols-2 gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900">
              <Field label="Your callsign and email" hint="Sent to RepeaterBook with every request (their API rules require a contact). Stored on this computer.">
                <input className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="W1ABC; you@example.com" />
              </Field>
              <Field
                label={`RepeaterBook app token ${hasToken ? '(saved)' : ''}`}
                hint={<>Generate a personal token for this app at <a className="text-sky-400 hover:underline" href={RB_TOKEN_PAGE} target="_blank" rel="noreferrer">RepeaterBook API Apps</a>. It is shown once; paste it here. Leave empty and save to remove it.</>}
              >
                <div className="flex gap-2">
                  <input type="password" className={inputClass} value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder={hasToken ? '••••••• (saved)' : 'rbuapp_…'} disabled={!desktop} />
                  <Button onClick={saveToken} disabled={!desktop}>Save</Button>
                </div>
                {tokenMessage && <span className="block mt-1 text-emerald-300">{tokenMessage}</span>}
              </Field>
            </div>
          )}
          {error && <p className="text-rose-300">{error}</p>}
        </div>

        {/* Filters */}
        {results.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-slate-800">
            <Field label="Band">
              <select className={selectClass} value={band} onChange={(e) => setBand(e.target.value as typeof band)}>
                <option value="all">2 m and 70 cm</option>
                <option value="144">2 m only</option>
                <option value="440">70 cm only</option>
              </select>
            </Field>
            <Field label="Keyword"><input className={inputClass} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Callsign, city, frequency" /></Field>
            <Field label="Near (lat, lon)">
              <div className="flex gap-1">
                <input className={`${inputClass} w-24`} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" />
                <input className={`${inputClass} w-24`} value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Lon" />
                <Button onClick={locate} disabled={locating} title="Use my location"><Navigation className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} /></Button>
              </div>
            </Field>
            <Field label="Within">
              <select className={selectClass} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))} disabled={!origin}>
                {[15, 30, 50, 75, 100, 200].map((m) => <option key={m} value={m}>{m} miles</option>)}
              </select>
            </Field>
            <div className="flex flex-col gap-1 text-slate-300">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyOnAir} onChange={(e) => setOnlyOnAir(e.target.checked)} />On-air only</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyAnalog} onChange={(e) => setOnlyAnalog(e.target.checked)} />FM analog only</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={hideProgrammed} onChange={(e) => setHideProgrammed(e.target.checked)} />Hide ones already programmed</label>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="min-h-[240px] max-h-[44vh] overflow-auto">
          {results.length === 0 ? (
            <div className="p-10 text-center text-slate-500">Search RepeaterBook or load a CSV to see repeaters here.</div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allVisibleSelected}
                      onChange={() => {
                        const next = new Set(selected);
                        visible.forEach((r) => (allVisibleSelected ? next.delete(r.key) : next.add(r.key)));
                        setSelected(next);
                      }}
                    />
                  </th>
                  <th className="px-3 py-2">Callsign</th>
                  <th className="px-3 py-2">Output</th>
                  <th className="px-3 py-2">Shift</th>
                  <th className="px-3 py-2">Tone (TX / RX)</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Use / status</th>
                  {origin && <th className="px-3 py-2">Distance</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visible.map((r) => (
                  <tr key={r.key} onClick={() => toggle(r.key)} className={`cursor-pointer hover:bg-slate-900/60 ${selected.has(r.key) ? 'text-slate-200 bg-sky-950/20' : 'text-slate-400'}`}>
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${r.callsign}`} checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
                    </td>
                    <td className="px-3 py-1.5 font-mono font-semibold text-sky-400">
                      {r.detailUrl ? (
                        <a href={r.detailUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:underline">
                          {r.callsign}<ExternalLink className="w-3 h-3" />
                        </a>
                      ) : r.callsign}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-100">{r.frequency.toFixed(4)}</td>
                    <td className="px-3 py-1.5 font-mono" title={r.duplexGuessed ? 'Direction guessed from the band plan — check it' : undefined}>
                      {r.duplex === 'OFF' ? 'simplex' : r.duplex === 'SPLIT' ? `split ${r.inputFrequency?.toFixed(4) ?? ''}` : `${r.duplex}${r.offset.toFixed(3)}`}
                      {r.duplexGuessed && <span className="text-amber-400"> ?</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-emerald-400">{formatTone(r.txTone)}{r.rxTone.type ? ` / ${formatTone(r.rxTone)}` : ''}</td>
                    <td className="px-3 py-1.5">{[r.location, r.county && `${r.county} Co.`, r.state].filter(Boolean).join(', ')}</td>
                    <td className="px-3 py-1.5">{r.use}{r.status ? ` · ${r.status}` : ''}</td>
                    {origin && <td className="px-3 py-1.5 font-mono text-amber-400">{r.distanceMiles !== undefined ? `${r.distanceMiles} mi` : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-800 text-slate-500">
            {source}: {results.length} loaded, {visible.length} shown. Results are kept in memory for this session only.
          </div>
        )}
      </div>
    </Modal>
  );
};

export const RepeaterBookModal: React.FC<RepeaterBookModalProps> = ({ open, ...props }) => (open ? <RepeaterBookForm {...props} /> : null);
