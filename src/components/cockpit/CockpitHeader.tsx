import React from 'react';
import { Volume2, VolumeX, Settings, Maximize2 } from 'lucide-react';
import {
  AudioSystemStatus,
  EngineProfile,
  EngineState,
  UserSettings,
} from '../../engine/types';

interface CockpitHeaderProps {
  engineState: EngineState;
  audioStatus: AudioSystemStatus;
  profile: EngineProfile;
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onOpenSettings: () => void;
  onResumeAudio: () => void;
  onToggleFullscreen: () => void;
}

export const CockpitHeader: React.FC<CockpitHeaderProps> = ({
  engineState,
  profile,
  settings,
  onUpdateSettings,
  onOpenSettings,
  onToggleFullscreen,
}) => {
  const isEngineOn = engineState !== 'OFF';

  return (
    <header className="cockpit-panel border-b border-white/10 px-4 py-2 flex items-center justify-between gap-3 z-20">
      {/* Left: Clean Mustang GT Digital Cluster Title */}
      <div className="flex items-center gap-3">
        <div className="w-2 h-6 bg-[#e11d2a] rounded-sm shadow-[0_0_10px_rgba(225,29,42,0.7)]" />
        <div className="flex items-center gap-2.5">
          <h1 className="text-xs sm:text-sm font-black tracking-[0.2em] uppercase text-white">
            MUSTANG GT DIGITAL CLUSTER
          </h1>
          <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 border border-white/10 text-sky-400 font-bold">
            {profile.name} • {profile.code}
          </span>
        </div>
      </div>

      {/* Right: Engine Status Dot, Master Volume, Fullscreen & Setup Button */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0a0b0e] border border-white/10">
          <span
            className={`w-2 h-2 rounded-full ${
              engineState === 'OFF'
                ? 'bg-zinc-600'
                : engineState === 'REV_LIMITER'
                  ? 'bg-[#ff2836] animate-ping'
                  : engineState === 'STARTING'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
            }`}
          />
          <span
            className={`text-[10px] font-mono font-bold tracking-wider uppercase ${
              isEngineOn ? 'text-white' : 'text-zinc-500'
            }`}
          >
            {engineState.replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-[115px] sm:min-w-[145px]">
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                masterVolume: settings.masterVolume > 0 ? 0 : 0.85,
              })
            }
            aria-label={settings.masterVolume === 0 ? 'Unmute Master' : 'Mute Master'}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            {settings.masterVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-[#e11d2a]" />
            ) : (
              <Volume2 className="w-4 h-4 text-zinc-300" />
            )}
          </button>
          <div className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-0.5">
              <label
                htmlFor="header-master-volume"
                className="text-[9px] font-mono uppercase tracking-widest text-zinc-400"
              >
                VOLUME
              </label>
              <span className="text-[10px] font-mono tabular-nums text-zinc-200 font-semibold">
                {Math.round(settings.masterVolume * 100)}%
              </span>
            </div>
            <input
              id="header-master-volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(settings.masterVolume * 100)}
              aria-valuetext={`${Math.round(settings.masterVolume * 100)}%`}
              style={
                {
                  '--attr-min': 0,
                  '--attr-max': 100,
                  '--control-value': Math.round(settings.masterVolume * 100),
                } as React.CSSProperties
              }
              onChange={(e) =>
                onUpdateSettings({ masterVolume: Number(e.target.value) / 100 })
              }
              className="cockpit-slider"
            />
          </div>
        </div>

        {/* Fullscreen Car Dashboard Mode Button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          title="Mode Layar Penuh Dashboard Mobil (Shortcut: F)"
          aria-label="Enter Fullscreen Car Dashboard Mode"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#e11d2a]/20 hover:bg-[#e11d2a]/35 border border-[#e11d2a]/50 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all active:scale-95 shadow-[0_0_12px_rgba(225,29,42,0.25)]"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#ff4d58]" />
          <span className="hidden sm:inline text-[10px]">FULLSCREEN</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open Cockpit Settings"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 text-xs font-semibold uppercase tracking-wider text-zinc-200 transition-all active:scale-95"
        >
          <Settings className="w-3.5 h-3.5 text-[#e11d2a]" />
          <span className="hidden sm:inline text-[11px]">Setup</span>
        </button>
      </div>
    </header>
  );
};
