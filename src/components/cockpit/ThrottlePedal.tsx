import React, { useCallback, useRef } from 'react';
import { EngineState } from '../../engine/types';
import { clamp } from '../../utils/interpolation';

interface ThrottlePedalProps {
  engineState: EngineState;
  throttle: number;
  effectiveThrottle: number;
  onSetThrottle: (value: number) => void;
}

/**
 * Interactive progressive accelerator pedal + telemetry bar.
 * Allows fine modulation (0% - 100%) by dragging or clicking along the pedal surface.
 */
export const ThrottlePedal: React.FC<ThrottlePedalProps> = ({
  engineState,
  throttle,
  effectiveThrottle,
  onSetThrottle,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const isDisabled = engineState === 'OFF' || engineState === 'STARTING';

  const updateFromClientX = useCallback(
    (clientX: number) => {
      if (isDisabled || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      onSetThrottle(ratio);
    },
    [isDisabled, onSetThrottle]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingRef.current = true;
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    onSetThrottle(0);
  };

  const rawPct = Math.round(throttle * 100);
  const mappedPct = Math.round(effectiveThrottle * 100);

  return (
    <div className="bg-[#0a0b0e] rounded-lg p-3 border border-white/10 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
          PROGRESSIVE THROTTLE PEDAL (TOUCH / DRAG)
        </span>
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="text-zinc-400">INPUT:</span>
          <span className="font-bold text-white">{rawPct}%</span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">VALVE:</span>
          <span className="font-bold text-[#e11d2a]">{mappedPct}%</span>
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="Progressive Accelerator Pedal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rawPct}
        tabIndex={isDisabled ? -1 : 0}
        className={`relative h-7 rounded bg-[#14171f] border border-white/10 overflow-hidden touch-none ${
          isDisabled ? 'opacity-45 cursor-not-allowed' : 'cursor-ew-resize'
        }`}
      >
        {/* Machined pedal grip grooves */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,255,255,0.18) 10px, rgba(255,255,255,0.18) 12px)',
          }}
        />

        {/* Active Throttle Fill */}
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-[#e11d2a] to-[#ff2836] transition-all duration-75"
          style={{ width: `${rawPct}%` }}
        />

        <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none text-[10px] font-mono uppercase tracking-widest text-white/80">
          <span>0% IDLE</span>
          <span>DRAG FOR PARTIAL THROTTLE</span>
          <span>100% WOT</span>
        </div>
      </div>
    </div>
  );
};

