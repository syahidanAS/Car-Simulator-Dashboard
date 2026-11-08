import React from 'react';
import { Disc3, AlertCircle } from 'lucide-react';
import { TrackItem } from '../../music/types';

interface TrackInfoProps {
  track: TrackItem | null;
  isPlaying: boolean;
}

export const TrackInfo: React.FC<TrackInfoProps> = ({ track, isPlaying }) => {
  return (
    <div className="flex items-center gap-3 bg-[#0a0b0e] p-2.5 rounded-lg border border-white/10">
      {/* Album Artwork or Precision Disc Icon */}
      <div className="relative w-14 h-14 rounded bg-[#14171f] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
        {track?.artworkDataUrl ? (
          <img
            src={track.artworkDataUrl}
            alt={`${track.title} album cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <Disc3
            className={`w-7 h-7 text-[#e11d2a] ${
              isPlaying ? 'animate-spin' : 'opacity-70'
            }`}
            style={{ animationDuration: '4s' }}
          />
        )}
        {isPlaying && (
          <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        )}
      </div>

      {/* Metadata Text */}
      <div className="min-w-0 flex-1">
        {track ? (
          <>
            <div className="flex items-center gap-1.5">
              <h3
                className="text-xs sm:text-sm font-bold text-white truncate"
                title={track.title}
              >
                {track.title}
              </h3>
              {track.needsRelink && (
                <span
                  title="Local file access expired after page reload. Re-select file to play."
                  className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0"
                >
                  <AlertCircle className="w-2.5 h-2.5" />
                  Relink
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{track.artist}</p>
            <p className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">
              {track.album}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-300">
              No Track Loaded
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Upload local MP3, WAV, or OGG files below
            </p>
          </>
        )}
      </div>
    </div>
  );
};

