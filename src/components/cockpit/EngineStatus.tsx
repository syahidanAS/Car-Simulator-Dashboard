import React from 'react';
import { Fuel, Wind, Thermometer } from 'lucide-react';
import { EngineProfile, SimulationTelemetry } from '../../engine/types';
import { clamp } from '../../utils/interpolation';

interface EngineStatusProps {
  telemetry: SimulationTelemetry;
  profile: EngineProfile;
  turboEnabled: boolean;
  onRefuel?: () => void;
}

export const EngineStatus: React.FC<EngineStatusProps> = ({
  telemetry,
  turboEnabled,
  onRefuel,
}) => {
  const fuelPct = Math.round(clamp(telemetry.fuelLevel ?? 84, 0, 100));
  const dteMiles = Math.round((fuelPct / 100) * 320);
  const isLowFuel = fuelPct <= 18;
  const totalSegments = 16;
  const activeSegments = Math.round((fuelPct / 100) * totalSegments);

  const boostBar = (telemetry.turboBoost * 1.8).toFixed(2);
  const boostPsi = (telemetry.turboBoost * 26.1).toFixed(1);

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* MUSTANG GT FUEL GAUGE INDICATOR (E ──────── F) */}
      <div className="bg-[#0a0c12]/90 rounded-xl p-3 border border-white/10 flex flex-col gap-2 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Fuel
              className={`w-4 h-4 ${
                isLowFuel ? 'text-amber-400 animate-pulse' : 'text-sky-400'
              }`}
            />
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-zinc-300">
              FUEL LEVEL
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono font-black tabular-nums ${
                isLowFuel ? 'text-amber-400' : 'text-white'
              }`}
            >
              {fuelPct}% • {dteMiles} MI TO E
            </span>
            {onRefuel && fuelPct < 98 && (
              <button
                type="button"
                onClick={onRefuel}
                className="px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-[9px] font-mono font-bold uppercase tracking-wider transition-colors"
              >
                + ISI BENSIN
              </button>
            )}
          </div>
        </div>

        {/* Classic Mustang GT E ─── 1/2 ─── F Segmented Fuel Bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-black text-amber-400">E</span>
          <div
            className="flex-1 grid gap-1 h-2.5 bg-black/60 p-0.5 rounded border border-white/10"
            style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
          >
            {Array.from({ length: totalSegments }).map((_, idx) => {
              const filled = idx < activeSegments;
              const segColor = !filled
                ? 'bg-white/5'
                : idx < 3
                  ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                  : 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]';
              return (
                <div
                  key={idx}
                  className={`h-full rounded-[1px] transition-all duration-150 ${segColor}`}
                />
              );
            })}
          </div>
          <span className="text-xs font-mono font-black text-white">F</span>
        </div>

        <div className="flex justify-between text-[9px] font-mono text-zinc-500 px-4">
          <span>0</span>
          <span>1/4</span>
          <span>1/2</span>
          <span>3/4</span>
          <span>FULL</span>
        </div>
      </div>

      {/* COMPACT TWIN AUX GAUGES: BOOST (PSI/BAR) & ENGINE TEMP (C ─── H) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Turbo Boost / Vacuum */}
        <div className="bg-[#0a0c12]/90 rounded-lg p-2.5 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9px] font-mono uppercase tracking-widest">
              BOOST / VAC
            </span>
            <Wind
              className={`w-3.5 h-3.5 ${
                turboEnabled ? 'text-amber-400' : 'text-zinc-600'
              }`}
            />
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-sm font-mono font-black tabular-nums text-white">
              {turboEnabled ? `${boostPsi} PSI` : 'NAT ASP'}
            </span>
            <span className="text-[9px] font-mono text-zinc-400">
              {turboEnabled ? `${boostBar} BAR` : '0.0 BAR'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-[#e11d2a] transition-all duration-75"
              style={{
                width: `${turboEnabled ? telemetry.turboBoost * 100 : 12}%`,
              }}
            />
          </div>
        </div>

        {/* Coolant Temp (C ─── H) */}
        <div className="bg-[#0a0c12]/90 rounded-lg p-2.5 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9px] font-mono uppercase tracking-widest">
              COOLANT TEMP
            </span>
            <Thermometer className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-[10px] font-mono font-bold text-sky-400">
              C
            </span>
            <span className="text-sm font-mono font-black tabular-nums text-white">
              {telemetry.waterTempC}°C
            </span>
            <span className="text-[10px] font-mono font-bold text-[#e11d2a]">
              H
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-150"
              style={{ width: '54%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
