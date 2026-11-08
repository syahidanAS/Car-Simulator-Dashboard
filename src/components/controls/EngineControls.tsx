import React from 'react';
import { Power, Wind, Volume2, Zap } from 'lucide-react';
import {
  EngineProfile,
  EngineState,
  StartupPhase,
  UserSettings,
} from '../../engine/types';

interface EngineControlsProps {
  engineState: EngineState;
  startupPhase?: StartupPhase;
  profile: EngineProfile;
  settings: UserSettings;
  onToggleEngine: () => void;
  onTriggerBlowOff: () => void;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
}

export const EngineControls: React.FC<EngineControlsProps> = ({
  engineState,
  startupPhase = 'OFF',
  settings,
  onToggleEngine,
  onTriggerBlowOff,
  onUpdateSettings,
}) => {
  const isEngineOn = engineState !== 'OFF';
  const isStarting = engineState === 'STARTING';

  const getStartButtonLabel = () => {
    if (!isStarting) {
      return isEngineOn ? 'ENGINE STOP' : 'ENGINE START';
    }
    if (startupPhase === 'PRIME') return 'IGNITION PRIMING...';
    if (startupPhase === 'CRANKING') return 'STARTER CRANKING...';
    if (startupPhase === 'CATCH_FLARE') return 'IGNITION CATCH!';
    if (startupPhase === 'FAST_IDLE') return 'WARMING IDLE...';
    return 'CRANKING...';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Ignition Start / Stop + Turbo Spool & BOV Hiss Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleEngine}
          className={`flex-1 py-3 px-3 rounded-lg font-black text-xs sm:text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all active:scale-[0.98] border ${
            isEngineOn
              ? 'bg-[#1a1d24] hover:bg-[#222630] text-white border-[#e11d2a]/60 shadow-[0_0_16px_rgba(225,29,42,0.25)]'
              : 'bg-gradient-to-r from-[#e11d2a] to-[#b5121e] hover:brightness-110 text-white border-white/20 shadow-[0_0_24px_rgba(225,29,42,0.5)]'
          }`}
        >
          <Power
            className={`w-4 h-4 shrink-0 ${
              isStarting
                ? 'text-amber-300 animate-spin'
                : isEngineOn
                  ? 'text-[#ff2836]'
                  : 'text-white'
            }`}
          />
          <span>{getStartButtonLabel()}</span>
        </button>

        {/* Turbocharger Acoustic Layer Toggle (works on ALL profiles) */}
        <button
          type="button"
          onClick={() =>
            onUpdateSettings({ turboEnabled: !settings.turboEnabled })
          }
          title="Aktifkan/Nonaktifkan Suara Desisan Spool Turbo & Blow-Off Valve"
          className={`px-3 py-3 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
            settings.turboEnabled
              ? 'bg-amber-500/15 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
              : 'bg-[#12151c] border-white/10 text-zinc-400 hover:text-white'
          }`}
        >
          <Wind className="w-4 h-4" />
          <span>{settings.turboEnabled ? 'TURBO ON' : 'TURBO OFF'}</span>
        </button>

        {/* Manual BOV Hiss ("PSSSHHH!") Trigger Button */}
        <button
          type="button"
          onClick={onTriggerBlowOff}
          title="Tes suara desisan Blow-Off Valve (BOV Hiss / Stu-tu-tu)"
          className="px-3 py-3 rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>BOV HISS</span>
        </button>
      </div>

      {/* Independent Engine Channel Volume */}
      <div className="bg-[#0a0b0e] rounded-lg p-3 border border-white/10">
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="right-engine-volume"
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#e11d2a]" />
            ENGINE & TURBO EXHAUST LEVEL
          </label>
          <span className="text-xs font-mono font-bold tabular-nums text-white">
            {Math.round(settings.engineVolume * 100)}%
          </span>
        </div>
        <input
          id="right-engine-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.engineVolume * 100)}
          aria-valuetext={`${Math.round(settings.engineVolume * 100)}%`}
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
    </div>
  );
};
