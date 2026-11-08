import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gear, TransmissionMode } from '../../engine/types';

interface GearIndicatorProps {
  gear: Gear;
  transmissionMode: TransmissionMode;
  isShifting: boolean;
  shiftDirection: 'UP' | 'DOWN' | null;
}

export const GearIndicator: React.FC<GearIndicatorProps> = ({
  gear,
  transmissionMode,
  isShifting,
  shiftDirection,
}) => {
  return (
    <div className="cockpit-panel rounded-lg p-3.5 flex flex-col items-center justify-between border border-white/10 relative overflow-hidden">
      <div className="w-full flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-400">
          F1 DCT GEAR
        </span>
        <span
          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
            transmissionMode === 'MANUAL'
              ? 'bg-[#e11d2a]/20 text-[#ff2836] border border-[#e11d2a]/40'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}
        >
          {transmissionMode}
        </span>
      </div>

      <div className="relative h-14 flex items-center justify-center my-1">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={String(gear)}
            initial={{
              y: shiftDirection === 'UP' ? 16 : shiftDirection === 'DOWN' ? -16 : 0,
              opacity: 0,
              scale: 0.85,
            }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{
              y: shiftDirection === 'UP' ? -16 : 16,
              opacity: 0,
              scale: 0.85,
            }}
            transition={{ duration: 0.11, ease: 'easeOut' }}
            className={`text-5xl font-mono font-black tabular-nums leading-none ${
              gear === 'N'
                ? 'text-amber-400'
                : isShifting
                  ? 'text-[#ff2836]'
                  : 'text-white'
            }`}
          >
            {gear}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* 7-step gear strip indicator */}
      <div className="w-full flex items-center justify-between gap-1 mt-1">
        {(['N', 1, 2, 3, 4, 5, 6] as Gear[]).map((g) => {
          const active = g === gear;
          return (
            <span
              key={String(g)}
              className={`flex-1 text-center text-[10px] font-mono font-bold py-0.5 rounded transition-colors ${
                active
                  ? g === 'N'
                    ? 'bg-amber-400 text-black'
                    : 'bg-[#e11d2a] text-white shadow-[0_0_8px_rgba(225,29,42,0.7)]'
                  : 'bg-white/5 text-zinc-400'
              }`}
            >
              {g}
            </span>
          );
        })}
      </div>
    </div>
  );
};

