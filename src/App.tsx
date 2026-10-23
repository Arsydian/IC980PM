import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History as HistoryIcon, X } from 'lucide-react';
import { CodeplugExtras, RadioChannel } from './types/radio';
import { createNewCodeplug, decodeYsf } from './codecs/ysf-codec';
import { channelsToChirpCsv, channelsToOemCsv, parseCsvChannels } from './codecs/csv-codec';
import { channelsToTsv, parseClipboardText } from './codecs/clipboard';
import { bandOf, getRegion, RegionId, REGIONS } from './codecs/band-plans';
import { cloneChannel, isChannelEmpty } from './codecs/channel';
import { BulkPatch, bulkEdit, clearChannels, compactChannels, deleteAndShift, insertBlank, moveChannels, pasteChannels, sortByFrequency } from './codecs/channel-ops';
import { IssueSeverity, validateChannels } from './codecs/validation';
import { backupFileName, BACKUP_EXTENSION, channelsFromBackup, parseBackup, RadioBackup, serializeBackup } from './codecs/radio-backup';
import { RadioLink, OperationCancelledError } from './services/serial-driver';
import { WebSerialTransport } from './services/serial-transport';
import { getSimulatedRadio } from './services/fake-radio';
import { readRadio, restoreRadio, writeRadio } from './services/radio-operations';
import { APP_VERSION, desktop, downloadFile, storage } from './platform';
import { discardDraft, Draft, readDraft, useCodeplug } from './state/useCodeplug';
import { TitleBar } from './components/TitleBar';
import { BandFilter, Toolbar } from './components/Toolbar';
import { ChannelGrid } from './components/ChannelGrid';
import { SelectionBar } from './components/SelectionBar';
import { ValidationPanel } from './components/ValidationPanel';
import { RepeaterBookModal } from './components/RepeaterBookModal';
import { ExtrasModal } from './components/ExtrasModal';
import { ChannelDetailsModal } from './components/ChannelDetailsModal';
import { CompareModal } from './components/CompareModal';
import { ConnectModal, SerialPortPicker } from './components/ConnectModal';
import { WriteChoices, WriteRadioModal } from './components/WriteRadioModal';
import { ImportCsvModal, PendingCsv } from './components/ImportCsvModal';
import { idleProgress, ProgressState, RadioProgressModal } from './components/RadioProgressModal';
import { Button, Modal } from './components/ui';

type PendingRadioAction =
  | { kind: 'read' }
  | { kind: 'write'; choices: WriteChoices }
  | { kind: 'restore'; backup: RadioBackup };

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const REGION_KEY = 'ic980.region';
const LAST_BACKUP_KEY = 'ic980.lastBackup';
const SEVERITY_RANK: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
const today = () => new Date().toISOString().slice(0, 10);

/** Channels read from the radio keep the .ysf record bytes of the same slot when the frequencies match. */
function mergeRadioChannels(current: RadioChannel[], fromRadio: RadioChannel[]): RadioChannel[] {
  return fromRadio.map((ch, i) => {
    const old = current[i];
    if (!isChannelEmpty(ch) && old?.rawBytes && Math.abs(old.rxFreq - ch.rxFreq) < 1e-6 && Math.abs(old.txFreq - ch.txFreq) < 1e-6) {
      return { ...ch, rawBytes: old.rawBytes };
    }
    return ch;
  });
}

export const App: React.FC = () => {
  const cp = useCodeplug();
  const { channels, extras } = cp;

  const [region, setRegion] = useState<RegionId>(() => {
    const saved = storage.get(REGION_KEY) as RegionId | null;
    return saved && REGIONS.some((r) => r.id === saved) ? saved : 'US';
  });
  useEffect(() => { storage.set(REGION_KEY, region); }, [region]);
  const regionInfo = getRegion(region);

  const [searchQuery, setSearchQuery] = useState('');
  const [bandFilter, setBandFilter] = useState<BandFilter>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ index: number; nonce: number }>();
  const clipRef = useRef<{ channels: RadioChannel[]; tsv: string } | null>(null);
  const [hasClip, setHasClip] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(() => readDraft());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [checksOpen, setChecksOpen] = useState(false);

  const [connectOpen, setConnectOpen] = useState(false);
  const [rbOpen, setRbOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const [pendingCsv, setPendingCsv] = useState<PendingCsv | null>(null);
  const [restorePending, setRestorePending] = useState<{ backup: RadioBackup; name: string } | null>(null);
  const [progress, setProgress] = useState<ProgressState>(idleProgress);

  const [link, setLink] = useState<RadioLink | null>(null);
  const pendingActionRef = useRef<PendingRadioAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(() => storage.get(LAST_BACKUP_KEY));

  const ysfInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 9000 : 5000);
  }, []);

  // ---------- Derived data ----------

  const issues = useMemo(() => validateChannels(channels, regionInfo), [channels, regionInfo]);
  const issueLevels = useMemo(() => {
    const map = new Map<number, { severity: IssueSeverity; message: string }>();
    for (const i of issues) {
      const cur = map.get(i.channelId);
      if (!cur) map.set(i.channelId, { severity: i.severity, message: i.message });
      else map.set(i.channelId, {
        severity: SEVERITY_RANK[i.severity] < SEVERITY_RANK[cur.severity] ? i.severity : cur.severity,
        message: `${cur.message}\n${i.message}`
      });
    }
    return map;
  }, [issues]);

  const visibleIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const out: number[] = [];
    channels.forEach((ch, i) => {
      if (q) {
        const hit = ch.name.toLowerCase().includes(q) || String(ch.id) === q ||
          (ch.rxFreq > 0 && ch.rxFreq.toFixed(4).includes(q)) || (ch.txFreq > 0 && ch.txFreq.toFixed(4).includes(q));
        if (!hit) return;
      }
      if (bandFilter === 'active' && isChannelEmpty(ch)) return;
      if ((bandFilter === 'vhf' || bandFilter === 'uhf' || bandFilter === 'air') && (isChannelEmpty(ch) || bandOf(ch.rxFreq) !== bandFilter)) return;
      if (bandFilter === 'issues' && !issueLevels.has(ch.id)) return;
      out.push(i);
    });
    return out;
  }, [channels, searchQuery, bandFilter, issueLevels]);

  const visibleRef = useRef(visibleIndices);
  visibleRef.current = visibleIndices;
  const selectedList = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const activeCount = channels.filter((c) => !isChannelEmpty(c)).length;

  // ---------- Grid callbacks (stable, so memoised rows don't re-render) ----------

  const onChange = useCallback((index: number, updated: RadioChannel, coalesceKey?: string) => {
    cp.updateChannels((chs) => chs.map((c, i) => (i === index ? updated : c)), coalesceKey);
  }, [cp.updateChannels]);

  const onClear = useCallback((index: number) => {
    cp.updateChannels((chs) => clearChannels(chs, [index]));
  }, [cp.updateChannels]);

  const onOpenDetails = useCallback((index: number) => setDetailsIndex(index), []);

  const onRowMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    const anchor = anchorRef.current;
    if (e.shiftKey && anchor !== null) {
      const vis = visibleRef.current;
      const a = vis.indexOf(anchor);
      const b = vis.indexOf(index);
      if (a !== -1 && b !== -1) {
        setSelected(new Set(vis.slice(Math.min(a, b), Math.max(a, b) + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    } else {
      setSelected((s) => (s.size === 1 && s.has(index) ? s : new Set([index])));
    }
    anchorRef.current = index;
  }, []);

  const jumpTo = useCallback((channelId: number) => {
    const index = channelId - 1;
    if (!visibleRef.current.includes(index)) {
      setSearchQuery('');
      setBandFilter('all');
    }
    setSelected(new Set([index]));
    anchorRef.current = index;
    setScrollTarget({ index, nonce: Date.now() });
  }, []);

  // ---------- Selection actions ----------

  const copySelection = useCallback((cut = false): string | null => {
    if (selectedList.length === 0) return null;
    const rows = selectedList.map((i) => cloneChannel(channels[i]));
    const tsv = channelsToTsv(rows);
    clipRef.current = { channels: rows, tsv };
    setHasClip(true);
    if (cut) cp.updateChannels((chs) => clearChannels(chs, selectedList));
    toast(`${cut ? 'Cut' : 'Copied'} ${rows.length} channel(s).`);
    return tsv;
  }, [selectedList, channels, cp.updateChannels, toast]);

  const pasteRows = useCallback((rows: RadioChannel[]) => {
    if (rows.length === 0) {
      toast('Nothing to paste: the clipboard has no channel rows.', 'error');
      return;
    }
    const start = selectedList[0] ?? 0;
    const overwrites = rows.filter((_, k) => start + k < 500 && !isChannelEmpty(channels[start + k])).length;
    if (overwrites > 0 && !window.confirm(`Pasting ${rows.length} channel(s) at channel ${start + 1} replaces ${overwrites} programmed channel(s). Continue?`)) return;
    let pastedIdx: number[] = [];
    cp.updateChannels((chs) => {
      const res = pasteChannels(chs, start, rows);
      pastedIdx = res.indices;
      return res.channels;
    });
    setTimeout(() => setSelected(new Set(pastedIdx)), 0);
    toast(`Pasted ${rows.length} channel(s) at channel ${start + 1}.`);
  }, [selectedList, channels, cp.updateChannels, toast]);

  const pasteText = useCallback((text: string) => {
    const clip = clipRef.current;
    pasteRows(clip && text.trim() === clip.tsv.trim() ? clip.channels : parseClipboardText(text));
  }, [pasteRows]);

  const pasteFromButton = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) return pasteText(text);
    } catch {
      // clipboard read refused: fall back to the in-app clipboard
    }
    if (clipRef.current) pasteRows(clipRef.current.channels);
  }, [pasteText, pasteRows]);

  const moveSelection = useCallback((delta: -1 | 1) => {
    let moved: number[] = selectedList;
    cp.updateChannels((chs) => {
      const res = moveChannels(chs, selectedList, delta);
      moved = res.indices;
      return res.channels;
    });
    setTimeout(() => {
      setSelected(new Set(moved));
      if (moved[0] !== undefined) setScrollTarget({ index: moved[0], nonce: Date.now() });
    }, 0);
  }, [selectedList, cp.updateChannels]);

  const insertAtSelection = () => {
    const at = selectedList[0] ?? 0;
    const next = insertBlank(channels, at);
    if (!next) {
      toast('Channel 500 is in use, so nothing can shift down. Clear it first.', 'error');
      return;
    }
    cp.updateChannels(() => next);
  };

  // ---------- Keyboard & clipboard events ----------

  const anyModal = connectOpen || rbOpen || extrasOpen || compareOpen || writeOpen || detailsIndex !== null || !!pendingCsv || !!restorePending || progress.isOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (!anyModal) saveYsf(); return; }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); if (!anyModal) openYsf(); return; }
      if (anyModal || isEditable(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); cp.undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); cp.redo(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(visibleRef.current)); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedList.length) { e.preventDefault(); cp.updateChannels((chs) => clearChannels(chs, selectedList)); }
      else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedList.length) { e.preventDefault(); moveSelection(e.key === 'ArrowUp' ? -1 : 1); }
      else if (e.key === 'Escape') setSelected(new Set());
    };
    const onCopy = (e: ClipboardEvent) => {
      if (anyModal || isEditable(e.target) || selectedList.length === 0) return;
      const tsv = copySelection(e.type === 'cut');
      if (tsv && e.clipboardData) {
        e.clipboardData.setData('text/plain', tsv);
        e.preventDefault();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (anyModal || isEditable(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      e.preventDefault();
      pasteText(text);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  });

  // ---------- Files ----------

  const confirmDiscard = (what: string) => !cp.dirty || window.confirm(`${what} replaces the open codeplug, which has unsaved changes. Continue?`);

  const newCodeplug = () => {
    if (!confirmDiscard('Creating a new codeplug')) return;
    cp.load(createNewCodeplug(), null);
    setSelected(new Set());
  };

  function openYsf() {
    if (confirmDiscard('Opening a file')) ysfInput.current?.click();
  }

  const onYsfChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      cp.load(decodeYsf(new Uint8Array(await file.arrayBuffer())), file.name);
      setSelected(new Set());
      toast(`Opened ${file.name}.`);
    } catch (err: any) {
      toast(`Could not open ${file.name}: ${err.message}`, 'error');
    }
  };

  function saveYsf() {
    try {
      const name = cp.fileName && /\.ysf$/i.test(cp.fileName) ? cp.fileName : `IC980_Codeplug_${today()}.ysf`;
      downloadFile(name, cp.encode(), 'application/octet-stream');
      cp.setFileName(name);
      cp.markSaved();
    } catch (err: any) {
      toast(`Could not save: ${err.message}`, 'error');
    }
  }

  const onCsvChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { format, channels: rows } = parseCsvChannels(await file.text());
    if (format === 'unknown') {
      toast(`${file.name} isn't a CHIRP or OEM CSV. For RepeaterBook downloads use RepeaterBook → Load CSV.`, 'error');
      return;
    }
    if (rows.length === 0) {
      toast(`${file.name} has no channels with a frequency.`, 'error');
      return;
    }
    setPendingCsv({ fileName: file.name, format, rows });
  };

  // ---------- Radio ----------

  const persistBackup = useCallback(async (backup: RadioBackup): Promise<string> => {
    const text = serializeBackup(backup);
    const name = backupFileName(backup.model);
    storage.set(LAST_BACKUP_KEY, text);
    setLastBackup(text);
    if (desktop) return `Backup saved to ${await desktop.saveBackup(name, text)}`;
    downloadFile(name, text, 'application/json');
    return `Backup downloaded as ${name}`;
  }, []);

  const startProgress = (title: string) => {
    abortRef.current = new AbortController();
    setProgress({ isOpen: true, title, percentage: 0, statusText: 'Starting…', phase: 'running' });
    return {
      signal: abortRef.current.signal,
      onProgress: (percentage: number, statusText: string) => setProgress((p) => ({ ...p, percentage, statusText })),
      appVersion: APP_VERSION
    };
  };

  const failProgress = (err: unknown, extra?: React.ReactNode) => {
    const cancelled = err instanceof OperationCancelledError;
    setProgress((p) => ({
      ...p,
      phase: cancelled ? 'cancelled' : 'error',
      statusText: cancelled ? 'Cancelled. The radio was told to leave programming mode.' : 'The operation failed.',
      errorMessage: cancelled ? undefined : (err instanceof Error ? err.message : String(err)),
      details: extra
    }));
  };

  const runRead = async (l: RadioLink) => {
    const opts = startProgress('Reading the radio');
    try {
      const result = await readRadio(l, opts);
      const backupNote = await persistBackup(result.backup);
      const merged = mergeRadioChannels(channels, result.channels);
      cp.load({ channels: merged, image: cp.image, extras: { ...extras, keys: result.keys } }, null);
      setSelected(new Set());
      const count = merged.filter((c) => !isChannelEmpty(c)).length;
      setProgress((p) => ({
        ...p, phase: 'success', percentage: 100, statusText: `Read ${count} programmed channel(s) from ${result.backup.model}.`,
        details: <p className="text-slate-400">{backupNote}</p>
      }));
    } catch (err) {
      failProgress(err);
    }
  };

  const runWrite = async (l: RadioLink, choices: WriteChoices) => {
    const opts = startProgress('Writing to the radio');
    let backupNote = '';
    try {
      const result = await writeRadio(l, channels, {
        ...opts,
        keys: extras.keys,
        verify: choices.verify,
        onlyChanged: choices.onlyChanged,
        onBackup: async (b) => { backupNote = await persistBackup(b); }
      });
      setProgress((p) => ({
        ...p, phase: 'success', percentage: 100,
        statusText: `Wrote ${result.written} block(s)${result.unchanged ? `, ${result.unchanged} already matched` : ''}${result.verified ? ', all verified' : ''}.`,
        details: <p className="text-slate-400">{backupNote} — restore it from Radio → Restore a backup if needed.</p>
      }));
    } catch (err) {
      failProgress(err, backupNote ? <p className="text-slate-300">{backupNote}. Use Radio → Restore a backup to put the radio back as it was.</p> : undefined);
    }
  };

  const runRestore = async (l: RadioLink, backup: RadioBackup) => {
    const opts = startProgress('Restoring a backup');
    try {
      const blocks = await restoreRadio(l, backup, opts);
      setProgress((p) => ({
        ...p, phase: 'success', percentage: 100, statusText: `Restored and verified ${blocks} block(s).`,
        details: (
          <Button onClick={() => {
            const { channels: chs, keys } = channelsFromBackup(backup);
            cp.load({ channels: chs, image: cp.image, extras: { ...extras, keys: keys ?? extras.keys } }, null);
            setProgress(idleProgress);
          }}>
            Load the backup's channels into the editor
          </Button>
        )
      }));
    } catch (err) {
      failProgress(err);
    }
  };

  const runAction = (l: RadioLink, action: PendingRadioAction) => {
    if (action.kind === 'read') void runRead(l);
    else if (action.kind === 'write') void runWrite(l, action.choices);
    else void runRestore(l, action.backup);
  };

  const withLink = (action: PendingRadioAction) => {
    if (link && !link.isClosed) runAction(link, action);
    else {
      pendingActionRef.current = action;
      setConnectOpen(true);
    }
  };

  const connect = async (kind: 'serial' | 'simulator') => {
    setConnectOpen(false);
    try {
      const transport = kind === 'simulator' ? getSimulatedRadio() : await WebSerialTransport.request();
      const l = new RadioLink(transport);
      l.onClose((err) => {
        setLink((cur) => (cur === l ? null : cur));
        if (err) toast('The radio connection was lost.', 'error');
      });
      setLink(l);
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action) runAction(l, action);
      else toast(`Connected to ${transport.label}.`);
    } catch (err: any) {
      pendingActionRef.current = null;
      if (err?.message !== 'No port selected.') toast(err?.message ?? String(err), 'error');
    }
  };

  const disconnect = async () => {
    const l = link;
    setLink(null);
    await l?.close();
  };

  // A USB cable pulled out mid-session.
  useEffect(() => {
    if (!link || !(link.transport instanceof WebSerialTransport) || !('serial' in navigator)) return;
    const serial = (navigator as any).serial;
    const onDisconnect = (e: Event) => {
      if ((link.transport as WebSerialTransport).isPort(e.target)) {
        void link.close();
        setLink(null);
        toast('The programming cable was unplugged.', 'error');
      }
    };
    serial.addEventListener('disconnect', onDisconnect);
    return () => serial.removeEventListener('disconnect', onDisconnect);
  }, [link, toast]);

  const readClicked = () => {
    if (!confirmDiscard('Reading the radio')) return;
    withLink({ kind: 'read' });
  };

  const onBackupChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setRestorePending({ backup: parseBackup(await file.text()), name: file.name });
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const exportText = (text: string, name: string) => downloadFile(name, text, 'text/csv;charset=utf-8');
  const restoreDraftClicked = () => {
    if (draft) cp.restoreDraft(draft);
    setDraft(null);
  };

  const detailsChannel = detailsIndex !== null ? channels[detailsIndex] : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <TitleBar
        connectionLabel={link ? link.transport.label : null}
        onConnectToggle={() => (link ? void disconnect() : setConnectOpen(true))}
        activeCount={activeCount}
        fileName={cp.fileName}
        dirty={cp.dirty}
        region={region}
        onRegionChange={setRegion}
      />

      <Toolbar
        onNew={newCodeplug}
        onOpen={openYsf}
        onSave={saveYsf}
        importItems={[
          { label: 'CHIRP or OEM CSV…', hint: 'Keeps channel numbers from the file', onClick: () => csvInput.current?.click() },
          { label: 'RepeaterBook…', onClick: () => setRbOpen(true) },
          { label: 'Paste rows from a spreadsheet', hint: 'Select a channel, then Ctrl+V', onClick: () => void pasteFromButton() }
        ]}
        exportItems={[
          { label: 'CHIRP CSV', onClick: () => exportText(channelsToChirpCsv(channels), `IC980_Channels_${today()}.csv`) },
          { label: 'OEM CPS CSV', hint: 'All 18 columns, for the manufacturer software', onClick: () => exportText(channelsToOemCsv(channels), `IC980_CPS_${today()}.csv`) },
          { label: 'Copy selected rows', hint: 'Tab-separated, for spreadsheets', disabled: selectedList.length === 0, onClick: () => { const tsv = copySelection(); if (tsv) void navigator.clipboard?.writeText(tsv).catch(() => undefined); } }
        ]}
        radioItems={[
          { label: 'Restore a backup…', hint: `Writes a ${BACKUP_EXTENSION} file back to the radio`, onClick: () => backupInput.current?.click() },
          ...(desktop
            ? [{ label: 'Open backups folder', onClick: () => void desktop!.openBackupsFolder() }]
            : [{ label: 'Download last backup', disabled: !lastBackup, onClick: () => lastBackup && downloadFile(backupFileName(parseBackup(lastBackup).model), lastBackup, 'application/json') }]),
          { label: link ? 'Disconnect' : 'Connect…', onClick: () => (link ? void disconnect() : setConnectOpen(true)) }
        ]}
        toolItems={[
          { label: 'Compare two .ysf files…', hint: 'For mapping unknown settings', onClick: () => setCompareOpen(true) },
          { label: 'Show checks', onClick: () => setChecksOpen(true) },
          { label: 'Remove gaps between channels', onClick: () => cp.updateChannels(compactChannels) },
          { label: 'Sort all channels by frequency', onClick: () => cp.updateChannels((chs) => sortByFrequency(chs)) }
        ]}
        onRead={readClicked}
        onWrite={() => setWriteOpen(true)}
        onRepeaterBook={() => setRbOpen(true)}
        onExtras={() => setExtrasOpen(true)}
        onUndo={cp.undo}
        onRedo={cp.redo}
        canUndo={cp.canUndo}
        canRedo={cp.canRedo}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        bandFilter={bandFilter}
        onBandFilterChange={setBandFilter}
      />

      {draft && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-200">
          <HistoryIcon className="w-4 h-4" />
          <span className="flex-1">Unsaved work from {new Date(draft.savedAt).toLocaleString()}{draft.fileName ? ` (${draft.fileName})` : ''} was found.</span>
          <Button variant="warning" onClick={restoreDraftClicked}>Restore it</Button>
          <Button variant="ghost" onClick={() => { discardDraft(); setDraft(null); }}>Discard</Button>
        </div>
      )}

      {selectedList.length > 0 && (
        <SelectionBar
          count={selectedList.length}
          canPaste={hasClip || typeof navigator.clipboard?.readText === 'function'}
          onCopy={() => { const tsv = copySelection(); if (tsv) void navigator.clipboard?.writeText(tsv).catch(() => undefined); }}
          onCut={() => { const tsv = copySelection(true); if (tsv) void navigator.clipboard?.writeText(tsv).catch(() => undefined); }}
          onPaste={() => void pasteFromButton()}
          onClear={() => cp.updateChannels((chs) => clearChannels(chs, selectedList))}
          onMove={moveSelection}
          onInsert={insertAtSelection}
          onDeleteShift={() => { cp.updateChannels((chs) => deleteAndShift(chs, selectedList)); setSelected(new Set()); }}
          onSort={() => cp.updateChannels((chs) => sortByFrequency(chs, selectedList))}
          onBulk={(patch: BulkPatch) => cp.updateChannels((chs) => bulkEdit(chs, selectedList, patch))}
          onSelectNone={() => setSelected(new Set())}
        />
      )}

      <ChannelGrid
        channels={channels}
        visibleIndices={visibleIndices}
        selected={selected}
        issueLevels={issueLevels}
        onRowMouseDown={onRowMouseDown}
        onChange={onChange}
        onOpenDetails={onOpenDetails}
        onClear={onClear}
        scrollTarget={scrollTarget}
      />

      <ValidationPanel issues={issues} open={checksOpen} onToggle={() => setChecksOpen((o) => !o)} onJump={jumpTo} regionName={regionInfo.name} />

      <input type="file" ref={ysfInput} onChange={onYsfChosen} accept=".ysf,.Ysf,.YSF" className="hidden" />
      <input type="file" ref={csvInput} onChange={onCsvChosen} accept=".csv" className="hidden" />
      <input type="file" ref={backupInput} onChange={onBackupChosen} accept={BACKUP_EXTENSION} className="hidden" />

      <RepeaterBookModal
        open={rbOpen}
        onClose={() => setRbOpen(false)}
        channels={channels}
        region={region}
        onImport={(next, count) => { cp.updateChannels(() => next); toast(`Imported ${count} repeater(s).`); }}
      />
      <ExtrasModal
        open={extrasOpen}
        extras={extras}
        onClose={() => setExtrasOpen(false)}
        onApply={(next: CodeplugExtras) => cp.updateExtras(() => next)}
        onOpenCompare={() => setCompareOpen(true)}
      />
      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} current={cp.encode} />
      <ChannelDetailsModal
        channel={detailsChannel}
        onClose={() => setDetailsIndex(null)}
        onSave={(updated) => detailsIndex !== null && onChange(detailsIndex, updated)}
      />
      <ImportCsvModal
        pending={pendingCsv}
        channels={channels}
        onClose={() => setPendingCsv(null)}
        onImport={(next, count) => { cp.updateChannels(() => next); toast(`Imported ${count} channel(s).`); }}
      />
      <WriteRadioModal
        open={writeOpen}
        programmedCount={activeCount}
        issues={issues}
        onClose={() => setWriteOpen(false)}
        onShowIssues={() => { setWriteOpen(false); setChecksOpen(true); setBandFilter('issues'); }}
        onConfirm={(choices) => { setWriteOpen(false); withLink({ kind: 'write', choices }); }}
      />
      {restorePending && (
        <Modal
          title="Restore a backup to the radio"
          subtitle={restorePending.name}
          onClose={() => setRestorePending(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRestorePending(null)}>Cancel</Button>
              <Button variant="warning" onClick={() => { const b = restorePending.backup; setRestorePending(null); withLink({ kind: 'restore', backup: b }); }}>
                Write backup to radio
              </Button>
            </>
          }
        >
          <div className="p-5 text-xs text-slate-300 space-y-2">
            <p>Model {restorePending.backup.model || 'unknown'}, saved {restorePending.backup.createdAt ? new Date(restorePending.backup.createdAt).toLocaleString() : 'at an unknown time'}.</p>
            <p>{restorePending.backup.blocks.length} memory block(s) will be written exactly as saved, then read back and verified.</p>
          </div>
        </Modal>
      )}
      <ConnectModal open={connectOpen} onClose={() => { setConnectOpen(false); pendingActionRef.current = null; }} onChoose={(k) => void connect(k)} />
      <SerialPortPicker />
      <RadioProgressModal
        state={progress}
        onCancel={() => abortRef.current?.abort()}
        onClose={() => setProgress(idleProgress)}
      />

      <div className="fixed bottom-12 right-4 z-[60] space-y-2 w-80" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 p-3 rounded-lg border text-xs shadow-xl ${t.tone === 'error' ? 'bg-rose-950/90 border-rose-800 text-rose-200' : 'bg-slate-900/95 border-slate-700 text-slate-200'}`}>
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
