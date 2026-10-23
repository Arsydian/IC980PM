import React, { useState, useRef } from 'react';
import { RadioChannel, RadioSettings } from './types/radio';
import { createBlankChannel, createNewCodeplug, decodeYsf, encodeYsf } from './codecs/ysf-codec';
import { DEFAULT_HANDSET_KEYS } from './codecs/eeprom-codec';
import { channelsToChirpCsv, importCsvToChannels } from './codecs/csv-codec';
import { serialDriver } from './services/serial-driver';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { ChannelGrid } from './components/ChannelGrid';
import { RepeaterBookModal } from './components/RepeaterBookModal';
import { SettingsModal } from './components/SettingsModal';
import { ChannelDetailsModal } from './components/ChannelDetailsModal';
import { RadioProgressModal } from './components/RadioProgressModal';

export const App: React.FC = () => {
  // Initialize with factory template
  const initialCodeplug = React.useMemo(() => createNewCodeplug(), []);
  const [channels, setChannels] = useState<RadioChannel[]>(initialCodeplug.channels);
  const [rawHeader, setRawHeader] = useState<Uint8Array>(initialCodeplug.rawHeader);
  const [rawTail, setRawTail] = useState<Uint8Array>(initialCodeplug.rawTail);

  const [connected, setConnected] = useState(false);
  const [portName, setPortName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [bandFilter, setBandFilter] = useState('all');
  const [clipboard, setClipboard] = useState<RadioChannel | null>(null);

  // Modals
  const [isRepeaterBookOpen, setIsRepeaterBookOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedDetailsChannel, setSelectedDetailsChannel] = useState<RadioChannel | null>(null);

  // Progress Modal
  const [progress, setProgress] = useState({
    isOpen: false,
    title: '',
    percentage: 0,
    statusText: '',
    isError: false,
    errorMessage: '',
    isSuccess: false
  });

  // Radio auxiliary settings
  const [radioSettings, setRadioSettings] = useState<RadioSettings>({
    powerOnDisplay: 0,
    powerOnMsg: 'HIROYASU',
    squelch: 5,
    tot: 120,
    vox: 0,
    voicePrompt: 2,
    rogerBeep: 0,
    keyBeep: 1,
    backlightTimeout: 10,
    frequencyStep: 1,
    tailEliminate: 1,
    dualWatch: 0,
    keys: initialCodeplug.keys || { ...DEFAULT_HANDSET_KEYS }
  });

  // Hidden File Inputs
  const fileInputRefYsf = useRef<HTMLInputElement>(null);
  const fileInputRefCsv = useRef<HTMLInputElement>(null);

  const activeChannelCount = channels.filter((c) => c.rxFreq > 0).length;

  const handleConnectToggle = async () => {
    if (connected) {
      await serialDriver.disconnect();
      setConnected(false);
      setPortName('');
    } else {
      try {
        await serialDriver.connect(115200);
        setConnected(true);
        setPortName('IC-980 USB Port');
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleNew = () => {
    if (window.confirm('Create new blank codeplug? Any unsaved edits will be cleared.')) {
      const fresh = createNewCodeplug();
      setChannels(fresh.channels);
      setRawHeader(fresh.rawHeader);
      setRawTail(fresh.rawTail);
      setRadioSettings((prev) => ({ ...prev, keys: fresh.keys }));
    }
  };

  const handleOpenYsf = () => {
    fileInputRefYsf.current?.click();
  };

  const handleYsfFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const decoded = decodeYsf(bytes);
      setChannels(decoded.channels);
      setRawHeader(decoded.rawHeader);
      setRawTail(decoded.rawTail);
      if (decoded.keys) {
        setRadioSettings((prev) => ({ ...prev, keys: decoded.keys }));
      }
    } catch (err: any) {
      alert(`Error reading .YSF file: ${err.message}`);
    } finally {
      if (fileInputRefYsf.current) fileInputRefYsf.current.value = '';
    }
  };

  const handleSaveYsf = () => {
    try {
      const bytes = encodeYsf(channels, rawHeader, rawTail, radioSettings.keys);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IC980_Codeplug_${new Date().toISOString().slice(0, 10)}.ysf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Error saving .YSF file: ${err.message}`);
    }
  };

  const handleExportCsv = () => {
    try {
      const csvStr = channelsToChirpCsv(channels);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IC980_Channels_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Error exporting CSV: ${err.message}`);
    }
  };

  const handleImportCsv = () => {
    fileInputRefCsv.current?.click();
  };

  const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { channels: updated, importedCount } = importCsvToChannels(text, channels, 1);
      setChannels(updated);
      alert(`Successfully imported ${importedCount} channels from ${file.name}`);
    } catch (err: any) {
      alert(`Error importing CSV: ${err.message}`);
    } finally {
      if (fileInputRefCsv.current) fileInputRefCsv.current.value = '';
    }
  };

  const handleChannelChange = (index: number, updated: RadioChannel) => {
    setChannels((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleClearChannel = (index: number) => {
    setChannels((prev) => {
      const next = [...prev];
      next[index] = createBlankChannel(index + 1);
      return next;
    });
  };

  const handleCopyChannel = (channel: RadioChannel) => {
    setClipboard({ ...channel });
  };

  const handlePasteChannel = (index: number) => {
    if (!clipboard) return;
    setChannels((prev) => {
      const next = [...prev];
      next[index] = { ...clipboard, id: index + 1 };
      return next;
    });
  };

  const handleRepeaterImport = (
    channelsToInsert: RadioChannel[],
    targetStartIndex: number,
    mode: 'append' | 'startAt' | 'overwrite'
  ) => {
    setChannels((prev) => {
      const next = [...prev];
      for (let i = 0; i < channelsToInsert.length; i++) {
        const destIdx = (targetStartIndex - 1) + i;
        if (destIdx >= 500) break;
        next[destIdx] = {
          ...channelsToInsert[i],
          id: destIdx + 1
        };
      }
      return next;
    });
  };

  const handleReadRadio = async () => {
    if (!connected) {
      try {
        await serialDriver.connect(115200);
        setConnected(true);
        setPortName('IC-980 USB Port');
      } catch (err: any) {
        alert(err.message);
        return;
      }
    }

    setProgress({
      isOpen: true,
      title: 'Reading from IC-980 Pro Max',
      percentage: 0,
      statusText: 'Initializing serial handshake...',
      isError: false,
      errorMessage: '',
      isSuccess: false
    });

    try {
      const { channels: readChannels, keys: readKeys } = await serialDriver.readRadioData((percentage, statusText) => {
        setProgress((p) => ({ ...p, percentage, statusText }));
      });
      setChannels(readChannels);
      if (readKeys) {
        setRadioSettings((prev) => ({ ...prev, keys: readKeys }));
      }
      setProgress((p) => ({
        ...p,
        isSuccess: true,
        percentage: 100,
        statusText: 'Codeplug and handset keys read successfully from radio!'
      }));
    } catch (err: any) {
      setProgress((p) => ({
        ...p,
        isError: true,
        errorMessage: err.message,
        statusText: 'Read operation failed'
      }));
    }
  };

  const handleWriteRadio = async () => {
    if (!connected) {
      try {
        await serialDriver.connect(115200);
        setConnected(true);
        setPortName('IC-980 USB Port');
      } catch (err: any) {
        alert(err.message);
        return;
      }
    }

    // Safety Snapshot
    setProgress({
      isOpen: true,
      title: 'Writing to IC-980 Pro Max',
      percentage: 0,
      statusText: 'Preparing safety snapshot and handshaking...',
      isError: false,
      errorMessage: '',
      isSuccess: false
    });

    try {
      await serialDriver.writeRadioData(channels, radioSettings.keys, (percentage, statusText) => {
        setProgress((p) => ({ ...p, percentage, statusText }));
      });
      setProgress((p) => ({
        ...p,
        isSuccess: true,
        percentage: 100,
        statusText: 'Radio successfully programmed!'
      }));
    } catch (err: any) {
      setProgress((p) => ({
        ...p,
        isError: true,
        errorMessage: err.message,
        statusText: 'Write operation failed'
      }));
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Dynamic Titlebar with synchronized version badge */}
      <TitleBar
        connected={connected}
        portName={portName}
        onConnectToggle={handleConnectToggle}
        activeCount={activeChannelCount}
      />

      {/* Main Operations Toolbar */}
      <Toolbar
        onNew={handleNew}
        onOpen={handleOpenYsf}
        onSaveYsf={handleSaveYsf}
        onExportCsv={handleExportCsv}
        onImportCsv={handleImportCsv}
        onReadRadio={handleReadRadio}
        onWriteRadio={handleWriteRadio}
        onOpenRepeaterBook={() => setIsRepeaterBookOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        bandFilter={bandFilter}
        onBandFilterChange={setBandFilter}
        connected={connected}
      />

      {/* 500-Channel Memory Spreadsheet Grid */}
      <ChannelGrid
        channels={channels}
        onChannelChange={handleChannelChange}
        onClearChannel={handleClearChannel}
        onCopyChannel={handleCopyChannel}
        onPasteChannel={handlePasteChannel}
        hasClipboard={clipboard !== null}
        onOpenDetails={(ch) => setSelectedDetailsChannel(ch)}
        searchQuery={searchQuery}
        bandFilter={bandFilter}
      />

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRefYsf}
        onChange={handleYsfFileSelected}
        accept=".ysf"
        className="hidden"
      />
      <input
        type="file"
        ref={fileInputRefCsv}
        onChange={handleCsvFileSelected}
        accept=".csv"
        className="hidden"
      />

      {/* RepeaterBook Modal */}
      <RepeaterBookModal
        isOpen={isRepeaterBookOpen}
        onClose={() => setIsRepeaterBookOpen(false)}
        onImport={handleRepeaterImport}
        existingChannels={channels}
      />

      {/* Radio Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={radioSettings}
        onSaveSettings={setRadioSettings}
      />

      {/* Advanced Channel Inspector */}
      <ChannelDetailsModal
        channel={selectedDetailsChannel}
        isOpen={selectedDetailsChannel !== null}
        onClose={() => setSelectedDetailsChannel(null)}
        onSave={(updated) => {
          handleChannelChange(updated.id - 1, updated);
        }}
      />

      {/* Progress & Communication Modal */}
      <RadioProgressModal
        isOpen={progress.isOpen}
        title={progress.title}
        percentage={progress.percentage}
        statusText={progress.statusText}
        isError={progress.isError}
        errorMessage={progress.errorMessage}
        isSuccess={progress.isSuccess}
        onClose={() => setProgress((p) => ({ ...p, isOpen: false }))}
      />
    </div>
  );
};
