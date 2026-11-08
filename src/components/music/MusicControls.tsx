import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
} from 'lucide-react';
import { RepeatMode } from '../../music/types';

interface MusicControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  musicVolume: number;
  hasTracks: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onChangeMusicVolume: (vol: number) => void;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const totalSec = Math.floor(sec);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const MusicControls: React.FC<MusicControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  shuffle,
  repeatMode,
  musicVolume,
  hasTracks,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onChangeMusicVolume,
}) => {
  const safeMax = duration > 0 ? duration : 100;
  const safeVal = duration > 0 ? Math.min(currentTime, duration) : 0;

  return (
    <div className="flex flex-col gap-2.5 bg-[#0a0b0e] p-3 rounded-lg border border-white/10">
      {/* Seek Bar & Time Display */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-zinc-400 mb-0.5">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
        <input
          id="music-seek-slider"
          type="range"
          min={0}
          max={safeMax}
          step={0.1}
          disabled={!hasTracks || duration <= 0}
          value={safeVal}
          aria-label="Track seek progress"
          aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
          style={
            {
              '--attr-min': 0,
              '--attr-max': safeMax,
              '--control-value': safeVal,
            } as React.CSSProperties
          }
          onChange={(e) => onSeek(Number(e.target.value))}
          className="cockpit-slider"
        />
      </div>

      {/* Transport Buttons */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onToggleShuffle}
          aria-label="Toggle Shuffle"
          title="Shuffle Playlist"
          className={`p-1.5 rounded transition-colors ${
            shuffle
              ? 'text-[#e11d2a] bg-[#e11d2a]/15'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Shuffle className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasTracks}
            onClick={onPrevious}
            aria-label="Previous Track"
            className="p-2 rounded bg-[#14171f] hover:bg-white/10 border border-white/10 text-zinc-200 disabled:opacity-40 transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause Music' : 'Play Music'}
            className="w-10 h-10 rounded-full bg-[#e11d2a] hover:bg-[#ff2836] text-white flex items-center justify-center shadow-[0_0_14px_rgba(225,29,42,0.5)] transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            disabled={!hasTracks}
            onClick={onNext}
            aria-label="Next Track"
            className="p-2 rounded bg-[#14171f] hover:bg-white/10 border border-white/10 text-zinc-200 disabled:opacity-40 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onCycleRepeat}
          aria-label={`Repeat mode: ${repeatMode}`}
          title={`Repeat: ${repeatMode}`}
          className={`p-1.5 rounded transition-colors flex items-center gap-0.5 ${
            repeatMode !== 'OFF'
              ? 'text-[#e11d2a] bg-[#e11d2a]/15'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {repeatMode === 'ONE' ? (
            <Repeat1 className="w-4 h-4" />
          ) : (
            <Repeat className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Independent Music Channel Volume */}
      <div className="pt-1.5 border-t border-white/5 flex flex-col">
        <div className="flex items-center justify-between mb-0.5">
          <label
            htmlFor="left-music-volume"
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-400"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            INFOTAINMENT MUSIC LEVEL
          </label>
          <span className="text-xs font-mono font-bold tabular-nums text-white">
            {Math.round(musicVolume * 100)}%
          </span>
        </div>
        <input
          id="left-music-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(musicVolume * 100)}
          aria-valuetext={`${Math.round(musicVolume * 100)}%`}
          style={
            {
              '--attr-min': 0,
              '--attr-max': 100,
              '--control-value': Math.round(musicVolume * 100),
            } as React.CSSProperties
          }
          onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
          className="cockpit-slider"
        />
      </div>
    </div>
  );
};

