import React from 'react';
import { Gauge } from 'lucide-react';
import { ENGINE_PROFILE_LIST } from '../../engine/EngineProfiles';
import { EngineProfileId } from '../../engine/types';

interface ProfileSelectorProps {
  selectedProfileId: EngineProfileId;
  onSelectProfile: (profileId: EngineProfileId) => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  selectedProfileId,
  onSelectProfile,
}) => {
  return (
    <div className="bg-[#0a0b0e] rounded-lg p-3 border border-white/10 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-[#e11d2a]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
            MANETTINO ACOUSTIC & ENGINE MAP
          </span>
        </div>
        <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400">
          {ENGINE_PROFILE_LIST.length} PROFILES
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {ENGINE_PROFILE_LIST.map((p, idx) => {
          const active = p.id === selectedProfileId;
          const isMustang = p.id === 'mustang_gt_v8';
          const spanFull =
            ENGINE_PROFILE_LIST.length % 2 === 1 &&
            idx === ENGINE_PROFILE_LIST.length - 1;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProfile(p.id)}
              className={`text-left p-2 rounded border transition-all ${
                spanFull ? 'sm:col-span-2' : ''
              } ${
                active
                  ? 'bg-[#e11d2a]/15 border-[#e11d2a] text-white shadow-[inset_0_0_12px_rgba(225,29,42,0.2)]'
                  : 'bg-[#12151c] hover:bg-[#191d27] border-white/10 text-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wide text-white">
                  {p.name}
                </span>
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                    active
                      ? 'bg-[#e11d2a] text-white'
                      : isMustang
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-white/5 text-zinc-400'
                  }`}
                >
                  {isMustang ? '5.0L V8' : `${p.cylinders}C`}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                {p.subtitle}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

