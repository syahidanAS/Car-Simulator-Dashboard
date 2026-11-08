import React from 'react';
import { Trash2, Music, AlertTriangle } from 'lucide-react';
import { TrackItem } from '../../music/types';

interface PlaylistProps {
  tracks: TrackItem[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onSelectTrack: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onClearPlaylist: () => void;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const totalSec = Math.floor(sec);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const Playlist: React.FC<PlaylistProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onSelectTrack,
  onRemoveTrack,
  onClearPlaylist,
}) => {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0a0b0e] rounded-lg border border-white/10 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
          PLAYLIST QUEUE ({tracks.length})
        </span>
        {tracks.length > 0 && (
          <button
            type="button"
            onClick={onClearPlaylist}
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-[#ff2836] transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto cockpit-scroller divide-y divide-white/5 max-h-[190px] xl:max-h-[240px]">
        {tracks.length === 0 ? (
          <div className="py-8 px-4 text-center flex flex-col items-center justify-center text-zinc-500">
            <Music className="w-5 h-5 mb-1.5 opacity-40" />
            <p className="text-xs">Playlist is empty</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Drop local audio files or click "Synth Track"
            </p>
          </div>
        ) : (
          tracks.map((track, idx) => {
            const isCurrent = track.id === currentTrackId;
            return (
              <div
                key={track.id}
                className={`group flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors ${
                  isCurrent ? 'bg-[#e11d2a]/15' : 'hover:bg-white/5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTrack(track.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  <span
                    className={`text-[10px] font-mono tabular-nums w-4 shrink-0 ${
                      isCurrent ? 'text-[#ff2836] font-bold' : 'text-zinc-500'
                    }`}
                  >
                    {isCurrent && isPlaying ? '▶' : idx + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p
                        className={`text-xs font-medium truncate ${
                          isCurrent ? 'text-white font-semibold' : 'text-zinc-300'
                        }`}
                      >
                        {track.title}
                      </p>
                      {track.isUploading && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 animate-pulse">
                          S3 UP...
                        </span>
                      )}
                      {!track.isUploading && track.s3Key && (
                        <span
                          title={`Stored in MinIO S3 (${track.s3Key})`}
                          className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0"
                        >
                          S3
                        </span>
                      )}
                      {track.needsRelink && (
                        <span
                          title="Re-select local file to restore playback"
                          className="inline-flex shrink-0"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {track.artist}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                    {formatDuration(track.duration)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveTrack(track.id)}
                    aria-label={`Remove ${track.title}`}
                    className="p-1 rounded text-zinc-500 hover:text-[#ff2836] hover:bg-white/5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

