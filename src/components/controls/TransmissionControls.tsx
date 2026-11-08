import React from 'react';
import { ChevronUp, ChevronDown, Cog, Navigation, LocateFixed } from 'lucide-react';
import { Gear, TransmissionMode } from '../../engine/types';
import { ExternalSensorSnapshot } from '../../telemetry/TelemetryProvider';

interface TransmissionControlsProps {
  gear: Gear;
  transmissionMode: TransmissionMode;
  sensorSnapshot: ExternalSensorSnapshot;
  onShiftUp: () => void;
  onShiftDown: () => void;
  onSetGear: (gear: Gear) => void;
  onSetTransmissionMode: (mode: TransmissionMode) => void;
  onToggleGps: () => void;
}

const GEARS: Gear[] = ['N', 1, 2, 3, 4, 5, 6];

export const TransmissionControls: React.FC<TransmissionControlsProps> = ({
  gear,
  transmissionMode,
  sensorSnapshot,
  onShiftUp,
  onShiftDown,
  onSetGear,
  onSetTransmissionMode,
  onToggleGps,
}) => {
  const canShiftDown = gear !== 'N';
  const canShiftUp = gear !== 6;
  const isGpsActive =
    sensorSnapshot.gpsStatus === 'LOCKED' ||
    sensorSnapshot.gpsStatus === 'SEARCHING';

  return (
    <div className="bg-[#0a0b0e] rounded-lg p-3 border border-white/10 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Cog className="w-3.5 h-3.5 text-[#e11d2a]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
            6-SPEED F1 TRANSMISSION
          </span>
        </div>

        {/* Manual / Auto Gearbox Mode Toggle */}
        <div className="flex rounded bg-[#14171f] p-0.5 border border-white/10">
          {(['MANUAL', 'AUTO'] as TransmissionMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSetTransmissionMode(mode)}
              className={`px-2.5 py-0.5 text-[10px] font-mono font-bold rounded transition-colors ${
                transmissionMode === mode
                  ? 'bg-[#e11d2a] text-white shadow-[0_0_8px_rgba(225,29,42,0.5)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* GPS Location Connect + Auto Transmission Sync Bar */}
      <div className="rounded-lg bg-[#11141c] border border-white/10 p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleGps}
            className={`flex-1 py-1.5 px-2.5 rounded font-mono text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
              sensorSnapshot.gpsStatus === 'LOCKED'
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]'
                : sensorSnapshot.gpsStatus === 'SEARCHING'
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 animate-pulse'
                  : 'bg-[#181c26] hover:bg-[#202634] border-white/15 text-zinc-200'
            }`}
          >
            {isGpsActive ? (
              <LocateFixed className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Navigation className="w-3.5 h-3.5 text-[#e11d2a]" />
            )}
            <span>
              {sensorSnapshot.gpsStatus === 'LOCKED'
                ? 'EV GPS COORD SYNC ACTIVE'
                : sensorSnapshot.gpsStatus === 'SEARCHING'
                  ? 'MENCARI KOORDINAT GPS EV...'
                  : 'CONNECT EV GPS + AUTO GEAR'}
            </span>
          </button>

          <span
            className={`text-[9px] font-mono font-bold px-2 py-1 rounded uppercase ${
              sensorSnapshot.gpsStatus === 'LOCKED'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : sensorSnapshot.gpsStatus === 'SEARCHING'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : sensorSnapshot.gpsStatus === 'ERROR'
                    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                    : 'bg-white/5 text-zinc-400'
            }`}
          >
            {sensorSnapshot.gpsStatus}
          </span>
        </div>

        {/* Live EV Coordinates, Delta Meters, Trip Distance & Fix Counter */}
        {sensorSnapshot.gpsStatus === 'LOCKED' &&
          sensorSnapshot.gps.latitude !== null &&
          sensorSnapshot.gps.longitude !== null && (
            <div className="flex flex-col gap-1 text-[10px] font-mono tabular-nums text-zinc-300 px-1 pt-1 border-t border-white/5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span>
                  LAT {sensorSnapshot.gps.latitude.toFixed(6)}° • LON{' '}
                  {sensorSnapshot.gps.longitude.toFixed(6)}°
                </span>
                <span className="text-emerald-400 font-bold">
                  {(sensorSnapshot.gps.gpsSpeedKmh ?? 0).toFixed(1)} KM/H
                  {sensorSnapshot.gps.accuracyM
                    ? ` (±${Math.round(sensorSnapshot.gps.accuracyM)}m)`
                    : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between text-[9px] text-zinc-400">
                <span>
                  Δ KOORDINAT: {(sensorSnapshot.gps.deltaMeters ?? 0).toFixed(2)}m •
                  TRIP: {Math.round(sensorSnapshot.gps.tripDistanceMeters ?? 0)}m
                </span>
                <span>
                  COORD {(sensorSnapshot.gps.coordSpeedKmh ?? 0).toFixed(1)} km/h •
                  FIX #{sensorSnapshot.gps.updateCount}
                </span>
              </div>
            </div>
          )}

        {sensorSnapshot.gpsError && (
          <p className="text-[10px] font-mono text-amber-300 px-1">
            {sensorSnapshot.gpsError}
          </p>
        )}
      </div>

      {/* F1 Paddle Shifter Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canShiftDown}
          onClick={onShiftDown}
          className={`py-2 px-3 rounded border font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
            canShiftDown
              ? 'bg-[#151821] hover:bg-[#1d222e] border-white/15 text-white'
              : 'bg-[#0d0f14] border-white/5 text-zinc-600 cursor-not-allowed'
          }`}
        >
          <ChevronDown className="w-4 h-4 text-[#e11d2a]" />
          <span>DOWN [↓]</span>
        </button>

        <button
          type="button"
          disabled={!canShiftUp}
          onClick={onShiftUp}
          className={`py-2 px-3 rounded border font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
            canShiftUp
              ? 'bg-[#151821] hover:bg-[#1d222e] border-white/15 text-white'
              : 'bg-[#0d0f14] border-white/5 text-zinc-600 cursor-not-allowed'
          }`}
        >
          <span>UP [↑]</span>
          <ChevronUp className="w-4 h-4 text-emerald-400" />
        </button>
      </div>

      {/* Direct Gear Gate Buttons */}
      <div className="grid grid-cols-7 gap-1">
        {GEARS.map((g) => {
          const isSelected = g === gear;
          return (
            <button
              key={String(g)}
              type="button"
              onClick={() => onSetGear(g)}
              className={`py-1.5 rounded font-mono text-xs font-extrabold transition-all ${
                isSelected
                  ? g === 'N'
                    ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                    : 'bg-[#e11d2a] text-white shadow-[0_0_10px_rgba(225,29,42,0.6)]'
                  : 'bg-[#14171f] hover:bg-white/10 text-zinc-400 border border-white/5'
              }`}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
};
