import React from 'react';
import { inverseLerp } from '../../utils/interpolation';

interface ShiftIndicatorProps {
  rpm: number;
  redlineRpm: number;
  maxRpm: number;
  isShiftWarning: boolean;
  isRedline: boolean;
  isRevLimiter: boolean;
  engineOn: boolean;
}

const LED_COUNT = 10;

export const ShiftIndicator: React.FC<ShiftIndicatorProps> = ({
  rpm,
  redlineRpm,
  maxRpm,
  isShiftWarning,
  isRedline,
  isRevLimiter,
  engineOn,
}) => {
  // Shift LEDs start illuminating at 55% of redline RPM up to redline
  const startRpm = redlineRpm * 0.55;
  const progress = engineOn ? inverseLerp(startRpm, redlineRpm, rpm) : 0;
  const activeLeds = Math.round(progress * LED_COUNT);

  return (
    <div className="cockpit-panel rounded-lg px-4 py-2.5 border border-white/10 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
          F1 LED SHIFT ARRAY
        </span>
        <div className="flex items-center gap-2">
          {isRevLimiter ? (
            <span className="text-[10px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded bg-[#ff2836] text-white animate-pulse">
              REV LIMITER ACTIVE ({maxRpm} RPM)
            </span>
          ) : isRedline ? (
            <span className="text-[10px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded bg-[#e11d2a] text-white animate-pulse">
              UPSHIFT NOW
            </span>
          ) : isShiftWarning ? (
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">
              OPTIMAL SHIFT ZONE
            </span>
          ) : (
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
              REDLINE {redlineRpm.toLocaleString()} RPM
            </span>
          )}
        </div>
      </div>

      {/* 10-LED Steering Wheel Top Shift Bar */}
      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: LED_COUNT }).map((_, index) => {
          const isLit = index < activeLeds;
          let colorClass = 'bg-white/5 border-white/10';
          if (isLit) {
            if (isRevLimiter) {
              colorClass =
                'bg-[#ff2836] border-[#ff4d58] shadow-[0_0_12px_rgba(255,40,54,0.95)] animate-pulse';
            } else if (index < 4) {
              colorClass =
                'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.7)]';
            } else if (index < 7) {
              colorClass =
                'bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.75)]';
            } else {
              colorClass =
                'bg-[#ff2836] border-[#ff6b75] shadow-[0_0_10px_rgba(255,40,54,0.9)]';
            }
          }

          return (
            <div
              key={index}
              className={`h-2.5 rounded-sm border transition-all duration-75 ${colorClass}`}
            />
          );
        })}
      </div>
    </div>
  );
};

