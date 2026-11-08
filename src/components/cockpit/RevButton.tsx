import React, { useCallback, useRef } from 'react';
import { Flame, OctagonAlert, ChevronsDown } from 'lucide-react';
import { EngineState, Gear } from '../../engine/types';

interface RevButtonProps {
  engineState: EngineState;
  rpm: number;
  throttle: number;
  brake: number;
  gear: Gear;
  speedKmh: number;
  isRedline: boolean;
  isRevLimiter: boolean;
  onSetThrottle: (value: number) => void;
  onSetBrake: (value: number) => void;
}

export const RevButton: React.FC<RevButtonProps> = ({
  engineState,
  rpm,
  throttle,
  brake,
  gear,
  speedKmh,
  isRedline,
  isRevLimiter,
  onSetThrottle,
  onSetBrake,
}) => {
  const activeThrottlePointerId = useRef<number | null>(null);
  const activeBrakePointerId = useRef<number | null>(null);

  const isDisabled = engineState === 'OFF' || engineState === 'STARTING';
  const isRevving = throttle > 0.05 && !isDisabled;
  const isBraking = brake > 0.05;
  const throttlePct = Math.round(throttle * 100);
  const displayRpm = Math.round(rpm);
  const speedMph = Math.round(speedKmh * 0.621371);

  const handleThrottlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore if synthetic event
      }
      activeThrottlePointerId.current = e.pointerId;
      onSetThrottle(1.0);
    },
    [isDisabled, onSetThrottle]
  );

  const releaseThrottle = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (activeThrottlePointerId.current !== null) {
        try {
          if (e.currentTarget.hasPointerCapture(activeThrottlePointerId.current)) {
            e.currentTarget.releasePointerCapture(activeThrottlePointerId.current);
          }
        } catch {
          // ignore
        }
        activeThrottlePointerId.current = null;
      }
      onSetThrottle(0);
    },
    [onSetThrottle]
  );

  const handleBrakePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore if synthetic event
      }
      activeBrakePointerId.current = e.pointerId;
      onSetBrake(1.0);
    },
    [onSetBrake]
  );

  const releaseBrake = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (activeBrakePointerId.current !== null) {
        try {
          if (e.currentTarget.hasPointerCapture(activeBrakePointerId.current)) {
            e.currentTarget.releasePointerCapture(activeBrakePointerId.current);
          }
        } catch {
          // ignore
        }
        activeBrakePointerId.current = null;
      }
      onSetBrake(0);
    },
    [onSetBrake]
  );

  return (
    <div className="w-full flex flex-col items-center justify-center py-1.5 select-none">
      <div className="flex items-center justify-center gap-4 sm:gap-6 w-full">
        {/* ============================================================
            LEFT PEDAL: BREMBO BRAKE + RAPID DOWNSHIFT [SHORTCUT: B]
           ============================================================ */}
        <div className="relative flex flex-col items-center">
          {isBraking && (
            <div className="absolute -inset-2 rounded-full border-2 border-amber-400/80 animate-ping opacity-55 pointer-events-none" />
          )}

          <div
            className={`p-1.5 rounded-full transition-all duration-150 ${
              isBraking
                ? 'bg-gradient-to-tr from-amber-500 via-[#ff2836] to-amber-300 shadow-[0_0_28px_rgba(245,158,11,0.8)]'
                : 'bg-zinc-800/90 border border-white/15 hover:border-amber-400/60'
            }`}
          >
            <button
              type="button"
              onPointerDown={handleBrakePointerDown}
              onPointerUp={releaseBrake}
              onPointerCancel={releaseBrake}
              onLostPointerCapture={() => {
                activeBrakePointerId.current = null;
                onSetBrake(0);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') {
                  e.preventDefault();
                  onSetBrake(1.0);
                }
              }}
              onKeyUp={(e) => {
                if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') {
                  e.preventDefault();
                  onSetBrake(0);
                }
              }}
              aria-label="Brake Pedal & Rapid Downshift (Hold Button or Key B)"
              className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center transition-transform duration-100 touch-none cursor-pointer ${
                isBraking
                  ? 'bg-gradient-to-b from-amber-500 via-[#d9480f] to-[#7c1d05] text-white scale-[0.95] shadow-inner'
                  : 'bg-gradient-to-b from-[#232733] to-[#11131a] text-zinc-100 hover:brightness-110 shadow-[inset_0_2px_4px_rgba(255,255,255,0.16)]'
              }`}
            >
              {/* Slotted brake rotor inner ring */}
              <div
                className={`absolute inset-2 rounded-full border border-dashed pointer-events-none ${
                  isBraking ? 'border-amber-200/60' : 'border-amber-400/30'
                }`}
              />

              <div className="flex items-center gap-1 mb-0.5">
                <OctagonAlert
                  className={`w-5 h-5 ${
                    isBraking ? 'text-white animate-pulse' : 'text-amber-400'
                  }`}
                />
                {isBraking && typeof gear === 'number' && gear > 1 && (
                  <ChevronsDown className="w-4 h-4 text-amber-200 animate-bounce" />
                )}
              </div>

              <span className="text-xs sm:text-sm font-black tracking-[0.16em] uppercase leading-tight">
                BRAKE [B]
              </span>

              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-black/45 border border-white/10">
                <span>GEAR {gear}</span>
                <span className="text-white/40">•</span>
                <span>{speedMph} MPH</span>
              </div>

              <span
                className={`mt-1 text-[8px] font-mono font-black uppercase tracking-wider ${
                  isBraking
                    ? 'text-amber-100 animate-pulse'
                    : 'text-amber-400/80'
                }`}
              >
                {isBraking
                  ? typeof gear === 'number' && gear > 1
                    ? 'RAPID DOWNSHIFT!'
                    : 'BREMBO LOCK!'
                  : 'HOLD: FAST GEAR -'}
              </span>
            </button>
          </div>
        </div>

        {/* ============================================================
            RIGHT PEDAL: REV ENGINE / ACCELERATOR [SHORTCUT: SPACE]
           ============================================================ */}
        <div className="relative flex flex-col items-center">
          {/* Outer animated pulse ring when revving */}
          {isRevving && (
            <div
              className={`absolute -inset-2.5 rounded-full border-2 pointer-events-none ${
                isRedline
                  ? 'border-[#ff2836] animate-ping opacity-55'
                  : 'border-[#e11d2a]/70 animate-pulse'
              }`}
            />
          )}

          {/* Rotating conic border while revving */}
          <div
            className={`p-1.5 rounded-full transition-all duration-150 ${
              isDisabled
                ? 'bg-zinc-900 border border-white/5'
                : isRevving
                  ? 'bg-gradient-to-tr from-[#e11d2a] via-amber-400 to-[#ff2836] shadow-[0_0_32px_rgba(225,29,42,0.75)]'
                  : 'bg-zinc-800/90 border border-white/15 hover:border-[#e11d2a]/60'
            }`}
          >
            <button
              type="button"
              disabled={isDisabled}
              onPointerDown={handleThrottlePointerDown}
              onPointerUp={releaseThrottle}
              onPointerCancel={releaseThrottle}
              onLostPointerCapture={() => {
                activeThrottlePointerId.current = null;
                onSetThrottle(0);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.code === 'Space' || e.code === 'Enter') {
                  e.preventDefault();
                  if (!isDisabled) onSetThrottle(1.0);
                }
              }}
              onKeyUp={(e) => {
                if (e.code === 'Space' || e.code === 'Enter') {
                  e.preventDefault();
                  onSetThrottle(0);
                }
              }}
              aria-label="Rev Engine (Press and Hold or Hold Spacebar)"
              className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center transition-transform duration-100 touch-none ${
                isDisabled
                  ? 'bg-[#12141a] text-zinc-600 cursor-not-allowed'
                  : isRevving
                    ? 'bg-gradient-to-b from-[#ff2836] to-[#990f19] text-white scale-[0.96] shadow-inner'
                    : 'bg-gradient-to-b from-[#e11d2a] to-[#8a0d16] text-white hover:brightness-110 shadow-[inset_0_2px_4px_rgba(255,255,255,0.28)] cursor-pointer'
              }`}
            >
              {/* Carbon inner ring */}
              <div className="absolute inset-2 rounded-full border border-white/20 pointer-events-none" />

              <Flame
                className={`w-5 h-5 mb-0.5 ${
                  isDisabled
                    ? 'text-zinc-600'
                    : isRevving
                      ? 'text-amber-300 animate-bounce'
                      : 'text-white/90'
                }`}
              />

              <span className="text-xs sm:text-sm font-black tracking-[0.14em] uppercase leading-tight">
                REV [SPACE]
              </span>

              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-black/35 border border-white/10">
                <span>{throttlePct}% THR</span>
                <span className="text-white/40">•</span>
                <span>{displayRpm}</span>
              </div>

              {isRedline && !isDisabled ? (
                <span className="mt-1 text-[8px] font-mono font-black uppercase tracking-widest text-amber-300 animate-pulse">
                  {isRevLimiter ? 'LIMITER!' : 'REDLINE!'}
                </span>
              ) : (
                <span className="mt-1 text-[8px] font-mono font-bold uppercase tracking-wider text-white/75">
                  ACCELERATOR
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <span className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400 text-center">
        {isDisabled
          ? 'START ENGINE TO REV • HOLD [B] FOR BRAKE & RAPID DOWNSHIFT'
          : 'HOLD [B] BRAKE + RAPID DOWNSHIFT • HOLD [SPACE] TO REV'}
      </span>
    </div>
  );
};
