import React from 'react';
import { Volume2 } from 'lucide-react';
import { UserSettings } from '../../engine/types';

interface VolumeControlsProps {
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
}

export const VolumeControls: React.FC<VolumeControlsProps> = ({
  settings,
  onUpdateSettings,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Master Bus Volume */}
      <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="settings-master-vol"
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1"
          >
            <Volume2 className="w-3.5 h-3.5 text-white" />
            Master Bus
          </label>
          <span className="text-xs font-mono font-bold tabular-nums text-white">
            {Math.round(settings.masterVolume * 100)}%
          </span>
        </div>
        <input
          id="settings-master-vol"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.masterVolume * 100)}
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

      {/* Engine Synthesizer Volume */}
      <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="settings-engine-vol"
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#e11d2a]" />
            Engine Synth
          </label>
          <span className="text-xs font-mono font-bold tabular-nums text-white">
            {Math.round(settings.engineVolume * 100)}%
          </span>
        </div>
        <input
          id="settings-engine-vol"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.engineVolume * 100)}
          style={
            {
              '--attr-min': 0,
              '--attr-max': 100,
              '--control-value': Math.round(settings.engineVolume * 100),
            } as React.CSSProperties
          }
          onChange={(e) =>
            onUpdateSettings({ engineVolume: Number(e.target.value) / 100 })
          }
          className="cockpit-slider"
        />
      </div>

      {/* Music Player Volume */}
      <div className="bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="settings-music-vol"
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            Music Player
          </label>
          <span className="text-xs font-mono font-bold tabular-nums text-white">
            {Math.round(settings.musicVolume * 100)}%
          </span>
        </div>
        <input
          id="settings-music-vol"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.musicVolume * 100)}
          style={
            {
              '--attr-min': 0,
              '--attr-max': 100,
              '--control-value': Math.round(settings.musicVolume * 100),
            } as React.CSSProperties
          }
          onChange={(e) =>
            onUpdateSettings({ musicVolume: Number(e.target.value) / 100 })
          }
          className="cockpit-slider"
        />
      </div>
    </div>
  );
};

