import React from 'react';
import { HandsetKeyFunction, HandsetKeySettings, RadioSettings } from '../types/radio';
import { DEFAULT_HANDSET_KEYS } from '../codecs/eeprom-codec';
import { X, Sliders, Save, Mic } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RadioSettings;
  onSaveSettings: (updated: RadioSettings) => void;
}

const SHORT_PRESS_OPTIONS: { value: HandsetKeyFunction; label: string }[] = [
  { value: 0x00, label: 'Unassigned (0x00)' },
  { value: 0x04, label: 'Reverse Frequency - Monitor Repeater (0x04)' },
  { value: 0x02, label: 'Monitor - Squelch Toggle (0x02)' },
  { value: 0x03, label: 'Scan Start / Stop (0x03)' },
  { value: 0x08, label: 'FM Broadcast Radio (0x08)' },
  { value: 0x09, label: 'Emergency Alarm Beep (0x09)' },
  { value: 0x0C, label: 'Frequency Match Counter (0x0C)' }
];

const LONG_PRESS_OPTIONS: { value: HandsetKeyFunction; label: string }[] = [
  { value: 0x00, label: 'Unassigned (0x00)' },
  { value: 0x04, label: 'Reverse Frequency - Monitor Repeater (0x04)' },
  { value: 0x02, label: 'Monitor Momentary - Squelch while held (0x02)' },
  { value: 0x01, label: 'Monitor Latched - Squelch Open (0x01)' },
  { value: 0x03, label: 'Scan Start / Stop (0x03)' },
  { value: 0x08, label: 'FM Broadcast Radio (0x08)' },
  { value: 0x09, label: 'Emergency Alarm Beep (0x09)' },
  { value: 0x0B, label: 'Warning Light Flash (0x0B)' },
  { value: 0x0C, label: 'Frequency Match Counter (0x0C)' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  const [localSettings, setLocalSettings] = React.useState<RadioSettings>({
    ...settings,
    keys: settings.keys ? { ...settings.keys } : { ...DEFAULT_HANDSET_KEYS }
  });

  React.useEffect(() => {
    setLocalSettings({
      ...settings,
      keys: settings.keys ? { ...settings.keys } : { ...DEFAULT_HANDSET_KEYS }
    });
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  const updateKey = (keyName: keyof HandsetKeySettings, value: HandsetKeyFunction) => {
    setLocalSettings((prev) => ({
      ...prev,
      keys: {
        ...(prev.keys || DEFAULT_HANDSET_KEYS),
        [keyName]: value
      }
    }));
  };

  const keys = localSettings.keys || DEFAULT_HANDSET_KEYS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Radio System & Handset Key Settings</h2>
              <p className="text-xs text-slate-400">Configure global parameters and programmable microphone triggers for the IC-980 Pro Max</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Settings Body */}
        <div className="p-5 space-y-5 text-xs overflow-y-auto">
          {/* Handset Programmable Keys Section */}
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <div className="p-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-200">Handset & Microphone Programmable Keys</h3>
                <p className="text-[11px] text-slate-400">
                  Assign function triggers to Key 1 (P1), Key 2 (P2), and Key 3 (P3). Select <span className="text-amber-400 font-medium">Reverse Frequency</span> to monitor repeater inputs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Key 1 */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-semibold text-amber-300 flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <span>Key 1 (P1)</span>
                  <span className="text-[10px] text-slate-400 font-mono">0x120C5</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Short Press</label>
                  <select
                    value={keys.key1Short}
                    onChange={(e) => updateKey('key1Short', parseInt(e.target.value) as HandsetKeyFunction)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    {SHORT_PRESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Long Press (Hold)</label>
                  <select
                    value={keys.key1Long}
                    onChange={(e) => updateKey('key1Long', parseInt(e.target.value) as HandsetKeyFunction)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    {LONG_PRESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Key 2 */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-semibold text-sky-300 flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <span>Key 2 (P2)</span>
                  <span className="text-[10px] text-slate-400 font-mono">0x120C7</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Short Press</label>
                  <select
                    value={keys.key2Short}
                    onChange={(e) => updateKey('key2Short', parseInt(e.target.value) as HandsetKeyFunction)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                  >
                    {SHORT_PRESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Long Press (Hold)</label>
                  <select
                    value={keys.key2Long}
                    onChange={(e) => updateKey('key2Long', parseInt(e.target.value) as HandsetKeyFunction)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                  >
                    {LONG_PRESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Key 3 */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-semibold text-purple-300 flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <span>Key 3 (P3)</span>
                  <span className="text-[10px] text-slate-400 font-mono">0x120C9</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Short Press</label>
                  <select
                    value={keys.key3Short}
                    onChange={(e) => updateKey('key3Short', parseInt(e.target.value) as HandsetKeyFunction)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  >
                    {SHORT_PRESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Long Press (Hold)</label>
                  <select
                    value={keys.key3Long}
                    onChange={(e) => updateKey('key3Long', parseInt(e.target.value) as HandsetKeyFunction)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  >
                    {LONG_PRESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Global System Settings */}
          <div className="grid grid-cols-2 gap-4">
            {/* Squelch */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Squelch Level (0 - 9)</label>
              <select
                value={localSettings.squelch}
                onChange={(e) => setLocalSettings({ ...localSettings, squelch: parseInt(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Level {lvl} {lvl === 0 ? '(Open)' : lvl === 5 ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* TOT */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Time-Out Timer (TOT)</label>
              <select
                value={localSettings.tot}
                onChange={(e) => setLocalSettings({ ...localSettings, tot: parseInt(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={0}>OFF (Unlimited)</option>
                <option value={30}>30 Seconds</option>
                <option value={60}>60 Seconds</option>
                <option value={120}>120 Seconds</option>
                <option value={180}>180 Seconds</option>
                <option value={300}>300 Seconds</option>
              </select>
            </div>

            {/* Power-On Display Mode */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Power-On Display</label>
              <select
                value={localSettings.powerOnDisplay}
                onChange={(e) => setLocalSettings({ ...localSettings, powerOnDisplay: parseInt(e.target.value) as 0 | 1 })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={0}>Custom Message</option>
                <option value={1}>Battery Voltage</option>
              </select>
            </div>

            {/* Power-On Message Text */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Power-On Message (Max 7 chars)</label>
              <input
                type="text"
                maxLength={7}
                value={localSettings.powerOnMsg}
                onChange={(e) => setLocalSettings({ ...localSettings, powerOnMsg: e.target.value.toUpperCase() })}
                disabled={localSettings.powerOnDisplay !== 0}
                placeholder="WELCOME"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-40 font-mono"
              />
            </div>

            {/* Roger Beep */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Roger Beep</label>
              <select
                value={localSettings.rogerBeep}
                onChange={(e) => setLocalSettings({ ...localSettings, rogerBeep: parseInt(e.target.value) as 0 | 1 | 2 })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={0}>OFF</option>
                <option value={1}>Roger Tone 1</option>
                <option value={2}>Roger Tone 2</option>
              </select>
            </div>

            {/* Voice Prompt */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Voice Announcement</label>
              <select
                value={localSettings.voicePrompt}
                onChange={(e) => setLocalSettings({ ...localSettings, voicePrompt: parseInt(e.target.value) as 0 | 1 | 2 })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={0}>OFF (Mute Voice)</option>
                <option value={1}>Chinese</option>
                <option value={2}>English</option>
              </select>
            </div>

            {/* Key Beep */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Keypad Beep</label>
              <select
                value={localSettings.keyBeep}
                onChange={(e) => setLocalSettings({ ...localSettings, keyBeep: parseInt(e.target.value) as 0 | 1 })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={1}>Enabled (ON)</option>
                <option value={0}>Disabled (OFF)</option>
              </select>
            </div>

            {/* Tail Tone Elimination */}
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Squelch Tail Elimination</label>
              <select
                value={localSettings.tailEliminate}
                onChange={(e) => setLocalSettings({ ...localSettings, tailEliminate: parseInt(e.target.value) as 0 | 1 })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={1}>Enabled (ON)</option>
                <option value={0}>Disabled (OFF)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg shadow-sm transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Apply Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
