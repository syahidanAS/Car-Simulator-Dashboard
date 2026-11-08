import React from 'react';
import { Radio, AlertCircle, Cloud, RefreshCw } from 'lucide-react';
import { useMusicPlayer } from '../../hooks/useMusicPlayer';
import { TrackInfo } from './TrackInfo';
import { MusicControls } from './MusicControls';
import { MusicUploader } from './MusicUploader';
import { Playlist } from './Playlist';

interface MusicPlayerProps {
  musicVolume: number;
  onChangeMusicVolume: (vol: number) => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  musicVolume,
  onChangeMusicVolume,
}) => {
  const {
    musicState,
    currentTrack,
    addFiles,
    addSynthTestTrack,
    selectTrack,
    togglePlay,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeatMode,
    removeTrack,
    clearPlaylist,
    syncS3Bucket,
  } = useMusicPlayer();

  return (
    <section
      aria-label="Cockpit Infotainment Music System"
      className="cockpit-panel rounded-xl p-3.5 flex flex-col gap-3 h-full border border-white/10"
    >
      {/* Panel Header + MinIO S3 Bucket Status */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 gap-2">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#e11d2a]" />
          <h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-white">
            COCKPIT INFOTAINMENT
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              musicState.s3Connected
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-zinc-400'
            }`}
            title={`MinIO S3 Endpoint: ${musicState.s3Endpoint} / Bucket: ${musicState.s3Bucket}`}
          >
            <Cloud className="w-2.5 h-2.5" />
            S3: {musicState.s3Bucket}
          </span>
          <button
            type="button"
            onClick={() => void syncS3Bucket()}
            title="Sync Playlist with MinIO S3 Bucket"
            aria-label="Sync Playlist with MinIO S3 Bucket"
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 transition-colors"
          >
            <RefreshCw
              className={`w-3 h-3 ${musicState.isSyncingS3 ? 'animate-spin text-emerald-400' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Error or Relink Banner */}
      {musicState.errorMessage && (
        <div className="flex items-start gap-2 p-2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[11px]">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{musicState.errorMessage}</span>
        </div>
      )}

      {/* Track Metadata & Artwork */}
      <TrackInfo track={currentTrack} isPlaying={musicState.isPlaying} />

      {/* Playback Controls & Music Volume */}
      <MusicControls
        isPlaying={musicState.isPlaying}
        currentTime={musicState.currentTime}
        duration={musicState.duration}
        shuffle={musicState.shuffle}
        repeatMode={musicState.repeatMode}
        musicVolume={musicVolume}
        hasTracks={musicState.tracks.length > 0}
        onTogglePlay={() => void togglePlay()}
        onPrevious={() => void previous()}
        onNext={() => void next()}
        onSeek={seek}
        onToggleShuffle={toggleShuffle}
        onCycleRepeat={cycleRepeatMode}
        onChangeMusicVolume={onChangeMusicVolume}
      />

      {/* File Uploader & Drag-and-Drop */}
      <MusicUploader
        onAddFiles={addFiles}
        onAddSynthTestTrack={addSynthTestTrack}
      />

      {/* Local Playlist Queue */}
      <Playlist
        tracks={musicState.tracks}
        currentTrackId={musicState.currentTrackId}
        isPlaying={musicState.isPlaying}
        onSelectTrack={(id) => void selectTrack(id, true)}
        onRemoveTrack={removeTrack}
        onClearPlaylist={clearPlaylist}
      />
    </section>
  );
};

