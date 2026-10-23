import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { CodeplugExtras, RadioChannel } from '../types/radio';
import { createNewCodeplug, DecodedYsf, encodeYsf } from '../codecs/ysf-codec';
import { base64ToBytes, bytesToBase64 } from '../codecs/text';
import { storage } from '../platform';
import { createHistory, History, HistoryAction, historyReducer } from './history';

export interface CodeplugDoc {
  channels: RadioChannel[];
  extras: CodeplugExtras;
}

export interface Draft {
  savedAt: string;
  fileName: string | null;
  image: string;
  doc: CodeplugDoc;
}

const DRAFT_KEY = 'ic980.draft';

export function readDraft(): Draft | null {
  const text = storage.get(DRAFT_KEY);
  if (!text) return null;
  try {
    const draft = JSON.parse(text) as Draft;
    return Array.isArray(draft?.doc?.channels) && draft.doc.channels.length === 500 ? draft : null;
  } catch {
    return null;
  }
}

export function discardDraft(): void {
  storage.remove(DRAFT_KEY);
}

type Reducer = (s: History<CodeplugDoc>, a: HistoryAction<CodeplugDoc>) => History<CodeplugDoc>;

/**
 * The open codeplug: channels and extras with undo/redo, plus the full .ysf image
 * whose unmodelled bytes are written back on save.
 */
export function useCodeplug() {
  const initial = useMemo(() => createNewCodeplug(), []);
  const [history, dispatch] = useReducer<Reducer, null>(
    historyReducer as Reducer,
    null,
    () => createHistory<CodeplugDoc>({ channels: initial.channels, extras: initial.extras })
  );
  const [image, setImage] = useState<Uint8Array>(initial.image);
  const [fileName, setFileName] = useState<string | null>(null);
  const [savedDoc, setSavedDoc] = useState<CodeplugDoc>(history.present);

  const doc = history.present;
  const dirty = doc !== savedDoc;

  const update = useCallback((fn: (d: CodeplugDoc) => CodeplugDoc, coalesceKey?: string) => {
    dispatch({ type: 'update', fn, coalesceKey });
  }, []);

  const updateChannels = useCallback((fn: (c: RadioChannel[]) => RadioChannel[], coalesceKey?: string) => {
    dispatch({ type: 'update', fn: (d) => ({ ...d, channels: fn(d.channels) }), coalesceKey });
  }, []);

  const updateExtras = useCallback((fn: (e: CodeplugExtras) => CodeplugExtras, coalesceKey?: string) => {
    dispatch({ type: 'update', fn: (d) => ({ ...d, extras: fn(d.extras) }), coalesceKey });
  }, []);

  const load = useCallback((decoded: DecodedYsf, name: string | null, asSaved = true) => {
    const next = { channels: decoded.channels, extras: decoded.extras };
    dispatch({ type: 'reset', value: next });
    setImage(decoded.image);
    setFileName(name);
    if (asSaved) setSavedDoc(next);
    else setSavedDoc({ ...next });
  }, []);

  const markSaved = useCallback(() => setSavedDoc(history.present), [history.present]);

  const encode = useCallback(() => encodeYsf(doc.channels, image, doc.extras), [doc, image]);

  // Keep a draft of unsaved work so a crash or accidental close loses nothing.
  useEffect(() => {
    if (!dirty) {
      discardDraft();
      return;
    }
    const timer = setTimeout(() => {
      const draft: Draft = { savedAt: new Date().toISOString(), fileName, image: bytesToBase64(image), doc };
      storage.set(DRAFT_KEY, JSON.stringify(draft));
    }, 800);
    return () => clearTimeout(timer);
  }, [doc, dirty, fileName, image]);

  // Browsers show a "leave site?" prompt; the desktop app shows its own dialog.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const restoreDraft = useCallback((draft: Draft) => {
    dispatch({ type: 'reset', value: draft.doc });
    setImage(base64ToBytes(draft.image));
    setFileName(draft.fileName);
    setSavedDoc({ ...draft.doc }); // still unsaved
  }, []);

  return {
    doc,
    channels: doc.channels,
    extras: doc.extras,
    image,
    fileName,
    setFileName,
    dirty,
    update,
    updateChannels,
    updateExtras,
    load,
    markSaved,
    encode,
    restoreDraft,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  };
}
