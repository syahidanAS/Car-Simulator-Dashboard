import React, { useEffect, useRef } from 'react';
import { X, RotateCcw, Sliders, Speaker, Cpu } from 'lucide-react';
import { AudioSystemStatus, GearRatios, UserSettings } from '../../engine/types';
import { VolumeControls } from './VolumeControls';

interface AudioSettingsProps {
  isOpen: boolean;
  settings: UserSettings;
  audioStatus: AudioSystemStatus;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onResetSettings: () => void;
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({
  isOpen,
  settings,
  audioStatus,
  onClose,
  onUpdateSettings,
  onResetSettings,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Sync open/close state with native HTMLDialogElement.showModal()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback for light-dismiss (`closedby="any"`) when browser lacks native HTMLDialogElement.prototype.closedBy
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent, el: HTMLDialogElement) => {
        const r = el.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = outside(e, dialog);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e, dialog)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  const handleGearRatioChange = (key: keyof GearRatios, val: number) => {
    if (!Number.isFinite(val) || val <= 0.3) return;
    onUpdateSettings({
      gearRatios: {
        ...settings.gearRatios,
        [key]: val,
      },
    });
  };

  return (
    <dialog
      ref={dialogRef}
      id="cockpit-settings-modal"
      aria-labelledby="cockpit-settings-title"
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="w-full max-w-3xl rounded-xl bg-[#0e1015] text-white border border-white/15 shadow-2xl p-0 m-auto cockpit-scroller max-h-[90vh]"
    >
      <div className="p-5 flex flex-col gap-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-[#e11d2a]" />
            <div>
              <h2
                id="cockpit-settings-title"
                className="text-sm sm:text-base font-black uppercase tracking-[0.18em] text-white"
              >
                ECU, DRIVETRAIN & DSP CALIBRATION
              </h2>
              <p className="text-[11px] text-zinc-400">
                Real-time parameters persist automatically in local browser storage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetSettings}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono uppercase tracking-wider text-zinc-300 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#e11d2a]" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings Dialog"
              autoFocus
              className="p-1.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1. Audio Mixing Levels */}
        <div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-zinc-300 mb-2">
            1. 3-CHANNEL AUDIO MIXER LEVELS
          </h3>
          <VolumeControls
            settings={settings}
            onUpdateSettings={onUpdateSettings}
          />
        </div>

        {/* 2. Engine RPM & Dynamics Calibration */}
        <div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-zinc-300 mb-2">
            2. ENGINE RPM LIMITS & FLYWHEEL DYNAMICS
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Idle RPM */}
            <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <label htmlFor="cfg-idle-rpm" className="text-zinc-400 uppercase">
                  IDLE RPM
                </label>
                <span className="text-white font-bold tabular-nums">
                  {settings.idleRpm} RPM
                </span>
              </div>
              <input
                id="cfg-idle-rpm"
                type="range"
                min={700}
                max={1600}
                step={25}
                value={settings.idleRpm}
                style={
                  {
                    '--attr-min': 700,
                    '--attr-max': 1600,
                    '--control-value': settings.idleRpm,
                  } as React.CSSProperties
                }
                onChange={(e) =>
                  onUpdateSettings({ idleRpm: Number(e.target.value) })
                }
                className="cockpit-slider"
              />
            </div>

            {/* Redline RPM */}
            <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <label
                  htmlFor="cfg-redline-rpm"
                  className="text-zinc-400 uppercase"
                >
                  REDLINE RPM
                </label>
                <span className="text-[#ff2836] font-bold tabular-nums">
                  {settings.redlineRpm} RPM
                </span>
              </div>
              <input
                id="cfg-redline-rpm"
                type="range"
                min={6500}
                max={9200}
                step={100}
                value={settings.redlineRpm}
                style={
                  {
                    '--attr-min': 6500,
                    '--attr-max': 9200,
                    '--control-value': settings.redlineRpm,
                  } as React.CSSProperties
                }
                onChange={(e) => {
                  const newRedline = Number(e.target.value);
                  onUpdateSettings({
                    redlineRpm: newRedline,
                    maxRpm: Math.max(settings.maxRpm, newRedline + 300),
                  });
                }}
                className="cockpit-slider"
              />
            </div>

            {/* Max RPM */}
            <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <label htmlFor="cfg-max-rpm" className="text-zinc-400 uppercase">
                  MAXIMUM RPM
                </label>
                <span className="text-white font-bold tabular-nums">
                  {settings.maxRpm} RPM
                </span>
              </div>
              <input
                id="cfg-max-rpm"
                type="range"
                min={7000}
                max={9800}
                step={100}
                value={settings.maxRpm}
                style={
                  {
                    '--attr-min': 7000,
                    '--attr-max': 9800,
                    '--control-value': settings.maxRpm,
                  } as React.CSSProperties
                }
                onChange={(e) =>
                  onUpdateSettings({
                    maxRpm: Math.max(
                      settings.redlineRpm + 200,
                      Number(e.target.value)
                    ),
                  })
                }
                className="cockpit-slider"
              />
            </div>

            {/* Engine Inertia */}
            <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <label htmlFor="cfg-inertia" className="text-zinc-400 uppercase">
                  FLYWHEEL INERTIA
                </label>
                <span className="text-white font-bold tabular-nums">
                  {settings.engineInertia.toFixed(2)}x
                </span>
              </div>
              <input
                id="cfg-inertia"
                type="range"
                min={0.4}
                max={1.8}
                step={0.05}
                value={settings.engineInertia}
                style={
                  {
                    '--attr-min': 0.4,
                    '--attr-max': 1.8,
                    '--control-value': settings.engineInertia,
                  } as React.CSSProperties
                }
                onChange={(e) =>
                  onUpdateSettings({ engineInertia: Number(e.target.value) })
                }
                className="cockpit-slider"
              />
            </div>

            {/* Throttle Response Curve */}
            <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <label htmlFor="cfg-throttle" className="text-zinc-400 uppercase">
                  THROTTLE CURVE
                </label>
                <span className="text-white font-bold tabular-nums">
                  {settings.throttleResponse.toFixed(2)}
                </span>
              </div>
              <input
                id="cfg-throttle"
                type="range"
                min={0.5}
                max={1.6}
                step={0.05}
                value={settings.throttleResponse}
                style={
                  {
                    '--attr-min': 0.5,
                    '--attr-max': 1.6,
                    '--control-value': settings.throttleResponse,
                  } as React.CSSProperties
                }
                onChange={(e) =>
                  onUpdateSettings({ throttleResponse: Number(e.target.value) })
                }
                className="cockpit-slider"
              />
            </div>

            {/* Ducking Intensity */}
            <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <label htmlFor="cfg-ducking" className="text-zinc-400 uppercase">
                  MUSIC DUCKING DEPTH
                </label>
                <span className="text-white font-bold tabular-nums">
                  {Math.round(settings.audioDuckingIntensity * 100)}%
                </span>
              </div>
              <input
                id="cfg-ducking"
                type="range"
                min={0}
                max={75}
                step={5}
                value={Math.round(settings.audioDuckingIntensity * 100)}
                style={
                  {
                    '--attr-min': 0,
                    '--attr-max': 75,
                    '--control-value': Math.round(
                      settings.audioDuckingIntensity * 100
                    ),
                  } as React.CSSProperties
                }
                onChange={(e) =>
                  onUpdateSettings({
                    audioDuckingIntensity: Number(e.target.value) / 100,
                  })
                }
                className="cockpit-slider"
              />
            </div>
          </div>
        </div>

        {/* 3. Six-Speed Gear Ratios & Final Drive */}
        <div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-zinc-300 mb-2">
            3. 6-SPEED TRANSMISSION RATIOS & FINAL DRIVE
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {([1, 2, 3, 4, 5, 6] as const).map((g) => (
              <div
                key={g}
                className="bg-[#0a0b0e] p-2.5 rounded-lg border border-white/10 flex flex-col gap-1"
              >
                <label
                  htmlFor={`ratio-gear-${g}`}
                  className="text-[10px] font-mono uppercase text-zinc-400"
                >
                  GEAR {g}
                </label>
                <input
                  id={`ratio-gear-${g}`}
                  type="number"
                  step={0.05}
                  min={0.5}
                  max={5.0}
                  value={settings.gearRatios[g]}
                  onChange={(e) =>
                    handleGearRatioChange(g, parseFloat(e.target.value))
                  }
                  className="w-full bg-[#14171f] border border-white/10 rounded px-2 py-1 text-xs font-mono font-bold tabular-nums text-white focus:outline-none focus:border-[#e11d2a]"
                />
              </div>
            ))}
            <div className="bg-[#0a0b0e] p-2.5 rounded-lg border border-white/10 flex flex-col gap-1">
              <label
                htmlFor="ratio-final-drive"
                className="text-[10px] font-mono uppercase text-amber-400"
              >
                FINAL DRIVE
              </label>
              <input
                id="ratio-final-drive"
                type="number"
                step={0.05}
                min={2.0}
                max={5.5}
                value={settings.gearRatios.finalDrive}
                onChange={(e) =>
                  handleGearRatioChange('finalDrive', parseFloat(e.target.value))
                }
                className="w-full bg-[#14171f] border border-white/10 rounded px-2 py-1 text-xs font-mono font-bold tabular-nums text-amber-300 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* 4. DSP Switches & Output Hardware Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Turbo Toggle */}
          <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">Turbocharger DSP</div>
              <div className="text-[10px] text-zinc-400">
                Spool whistle & BOV surge
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.turboEnabled}
              onClick={() =>
                onUpdateSettings({ turboEnabled: !settings.turboEnabled })
              }
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                settings.turboEnabled
                  ? 'bg-[#e11d2a] text-white'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              {settings.turboEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* Audio Ducking Toggle */}
          <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">Smart Audio Ducking</div>
              <div className="text-[10px] text-zinc-400">
                Attenuate music at high RPM
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.audioDuckingEnabled}
              onClick={() =>
                onUpdateSettings({
                  audioDuckingEnabled: !settings.audioDuckingEnabled,
                })
              }
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                settings.audioDuckingEnabled
                  ? 'bg-[#e11d2a] text-white'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              {settings.audioDuckingEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* Synthesis / Sample Mode */}
          <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">Audio Engine Mode</div>
              <div className="text-[10px] text-zinc-400">
                {audioStatus.loadedSampleCount > 0
                  ? `${audioStatus.loadedSampleCount} WAV stems loaded`
                  : 'Procedural Hybrid Active'}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  audioSampleMode:
                    settings.audioSampleMode === 'hybrid'
                      ? 'procedural'
                      : 'hybrid',
                })
              }
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-xs font-mono font-bold text-amber-300 uppercase"
            >
              {settings.audioSampleMode}
            </button>
          </div>
        </div>

        {/* 5. Hardware Audio Output Diagnostics */}
        <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <Speaker className="w-4 h-4 text-[#e11d2a]" />
            <span>OUTPUT DEVICE:</span>
            <span className="text-white font-semibold">
              {audioStatus.outputDeviceLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              {audioStatus.activeMode}
            </span>
            <span>•</span>
            <span>{audioStatus.sampleRate} Hz</span>
          </div>
        </div>
      </div>
    </dialog>
  );
};

