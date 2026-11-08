import { AudioEngine } from '../engine/AudioEngine';
import { PlaylistManager } from './PlaylistManager';
import { MusicPlayerState, RepeatMode, TrackItem } from './types';

type MusicStateListener = (state: MusicPlayerState) => void;

/**
 * Manages the cockpit HTMLAudioElement, playlist queue, local file ingestion,
 * and shared AudioContext routing via AudioEngine.
 */
export class MusicManager {
  private static instance: MusicManager | null = null;

  private audio: HTMLAudioElement;
  private state: MusicPlayerState;
  private listeners = new Set<MusicStateListener>();

  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  private constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    const restoredTracks = PlaylistManager.loadPersistedTracks();

    this.state = {
      tracks: restoredTracks,
      currentTrackId: restoredTracks[0]?.id ?? null,
      isPlaying: false,
      currentTime: 0,
      duration: restoredTracks[0]?.duration ?? 0,
      shuffle: false,
      repeatMode: 'ALL',
      errorMessage: null,
      s3Connected: false,
      s3Bucket: 'car-simulator',
      s3Endpoint: 'http://100.88.163.2:9000',
      isSyncingS3: false,
    };

    // Route through the shared AudioEngine mixer
    AudioEngine.getInstance().attachMusicElement(this.audio);

    this.bindAudioEvents();

    // Automatically sync tracks from MinIO S3 bucket on startup
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      void this.syncWithS3Bucket();
    }
  }

  /**
   * Fetches all audio tracks stored in the MinIO S3 bucket (`car-simulator`)
   * and merges them into the active cockpit playlist.
   */
  public async syncWithS3Bucket(): Promise<void> {
    this.state.isSyncingS3 = true;
    this.emit();

    try {
      const res = await fetch('/api/music/tracks', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        this.state.s3Connected = false;
        this.state.isSyncingS3 = false;
        this.emit();
        return;
      }

      const data = (await res.json()) as {
        connected: boolean;
        bucket: string;
        endpoint: string;
        error?: string;
        tracks: Array<{
          id: string;
          s3Key: string;
          title: string;
          artist: string;
          album: string;
          fileName: string;
          fileSize: number;
          mimeType: string;
          duration: number;
          artworkDataUrl: string | null;
          streamUrl: string;
          addedAt: number;
        }>;
      };

      this.state.s3Connected = Boolean(data.connected);
      if (data.bucket) this.state.s3Bucket = data.bucket;
      if (data.endpoint) this.state.s3Endpoint = data.endpoint;

      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        const s3Tracks: TrackItem[] = data.tracks.map((t) => ({
          id: t.id,
          s3Key: t.s3Key,
          title: t.title,
          artist: t.artist,
          album: t.album,
          fileName: t.fileName,
          fileSize: t.fileSize,
          mimeType: t.mimeType,
          duration: t.duration,
          artworkDataUrl: t.artworkDataUrl,
          blobUrl: t.streamUrl,
          isUploading: false,
          needsRelink: false,
          addedAt: t.addedAt,
        }));

        // Keep any local session tracks that are currently uploading or not yet on S3
        const s3Keys = new Set(s3Tracks.map((t) => t.s3Key));
        const s3Ids = new Set(s3Tracks.map((t) => t.id));
        const localOnly = this.state.tracks.filter(
          (t) =>
            !t.needsRelink &&
            !s3Ids.has(t.id) &&
            (!t.s3Key || !s3Keys.has(t.s3Key))
        );

        this.state.tracks = [...s3Tracks, ...localOnly];
        if (
          !this.state.currentTrackId ||
          !this.state.tracks.some((t) => t.id === this.state.currentTrackId)
        ) {
          this.state.currentTrackId = this.state.tracks[0]?.id ?? null;
          this.state.duration = this.state.tracks[0]?.duration ?? 0;
        }
        PlaylistManager.saveTracksMetadata(this.state.tracks);
      }
    } catch {
      this.state.s3Connected = false;
    } finally {
      this.state.isSyncingS3 = false;
      this.emit();
    }
  }

  private async uploadFileToS3(file: File, track: TrackItem): Promise<void> {
    if (typeof fetch === 'undefined') return;
    track.isUploading = true;
    this.emit();

    try {
      const metaPayload = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        fileName: track.fileName,
        fileSize: track.fileSize,
        mimeType: track.mimeType,
        duration: track.duration,
        artworkDataUrl:
          track.artworkDataUrl && track.artworkDataUrl.length < 75000
            ? track.artworkDataUrl
            : null,
        addedAt: track.addedAt,
      };

      const utf8Bytes = new TextEncoder().encode(JSON.stringify(metaPayload));
      let binary = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const metaBase64 = btoa(binary);

      const res = await fetch('/api/music/upload', {
        method: 'POST',
        headers: {
          'Content-Type': track.mimeType || 'application/octet-stream',
          'x-track-meta': metaBase64,
        },
        body: file,
      });

      if (res.ok) {
        const result = (await res.json()) as {
          ok: boolean;
          bucket?: string;
          track?: { s3Key: string; streamUrl: string };
        };
        if (result.ok && result.track) {
          track.s3Key = result.track.s3Key;
          this.state.s3Connected = true;
          if (result.bucket) this.state.s3Bucket = result.bucket;
          PlaylistManager.saveTracksMetadata(this.state.tracks);
        }
      }
    } catch {
      // Keep playing from local session blobUrl if MinIO S3 is temporarily unreachable
    } finally {
      track.isUploading = false;
      this.emit();
    }
  }

  private bindAudioEvents(): void {
    this.audio.addEventListener('timeupdate', () => {
      this.state.currentTime = this.audio.currentTime || 0;
      this.emit();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        this.state.duration = this.audio.duration;
        const active = this.getCurrentTrack();
        if (active && active.duration === 0) {
          active.duration = this.audio.duration;
          PlaylistManager.saveTracksMetadata(this.state.tracks);
        }
        this.emit();
      }
    });

    this.audio.addEventListener('play', () => {
      this.state.isPlaying = true;
      this.emit();
    });

    this.audio.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.emit();
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', () => {
      this.state.isPlaying = false;
      this.state.errorMessage =
        'Unable to decode or play this audio file. Please verify the file format (MP3, WAV, OGG, M4A, FLAC).';
      this.emit();
    });
  }

  public getState(): MusicPlayerState {
    return { ...this.state, tracks: [...this.state.tracks] };
  }

  public subscribe(listener: MusicStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((fn) => fn(snapshot));
  }

  public getCurrentTrack(): TrackItem | null {
    return this.state.tracks.find((t) => t.id === this.state.currentTrackId) ?? null;
  }

  /**
   * Adds or relinks local audio files from <input type="file"> or drag-and-drop.
   */
  public async addFiles(fileList: FileList | File[]): Promise<void> {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    this.state.errorMessage = null;
    let addedAny = false;
    let firstAddedOrRelinkedId: string | null = null;

    for (const file of files) {
      if (!PlaylistManager.isSupportedAudioFile(file)) {
        this.state.errorMessage = `Unsupported file skipped: "${file.name}". Supported: MP3, WAV, OGG, M4A, FLAC.`;
        continue;
      }

      const blobUrl = URL.createObjectURL(file);
      const duration = await PlaylistManager.probeAudioDuration(blobUrl);

      // Check if this file matches a previously persisted track awaiting relink
      const existingUnlinked = this.state.tracks.find(
        (t) => t.needsRelink && t.fileName === file.name && t.fileSize === file.size
      );

      if (existingUnlinked) {
        existingUnlinked.blobUrl = blobUrl;
        existingUnlinked.needsRelink = false;
        if (duration > 0) existingUnlinked.duration = duration;
        if (!existingUnlinked.s3Key) {
          void this.uploadFileToS3(file, existingUnlinked);
        }
        if (!firstAddedOrRelinkedId) firstAddedOrRelinkedId = existingUnlinked.id;
        addedAny = true;
        continue;
      }

      const meta = await PlaylistManager.extractMetadataFromFile(file);
      const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const newTrack: TrackItem = {
        id,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'audio/mpeg',
        duration,
        artworkDataUrl: meta.artworkDataUrl,
        blobUrl,
        s3Key: null,
        isUploading: true,
        needsRelink: false,
        addedAt: Date.now(),
      };

      this.state.tracks.push(newTrack);
      void this.uploadFileToS3(file, newTrack);
      if (!firstAddedOrRelinkedId) firstAddedOrRelinkedId = newTrack.id;
      addedAny = true;
    }

    if (addedAny) {
      PlaylistManager.saveTracksMetadata(this.state.tracks);
      const current = this.getCurrentTrack();
      if (!current || current.needsRelink) {
        if (firstAddedOrRelinkedId) {
          await this.selectTrack(firstAddedOrRelinkedId, false);
        }
      }
    }

    this.emit();
  }

  /**
   * Synthesizes an original, license-free stereo driving synthwave track (WAV) in-memory
   * and adds it as a local File to the playlist for instant testing.
   */
  public async addOrigSynthwaveTestTrack(): Promise<void> {
    const sampleRate = 44100;
    const durationSec = 16; // 16-second seamless 120 BPM synthwave loop
    const numSamples = sampleRate * durationSec;
    const numChannels = 2;
    const bytesPerSample = 2;
    const dataSize = numSamples * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    // Bass & arpeggio notes in A minor (A1, F1, C2, G1)
    const bassFreqs = [55.0, 43.65, 65.41, 49.0];
    const arpFreqs = [220.0, 261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 261.63];

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const barIndex = Math.floor(t / 4) % 4;
      const beatPhase = (t * 2) % 1; // 120 BPM (2 beats/sec)
      const eighthPhase = (t * 4) % 1;
      const sixteenthIndex = Math.floor(t * 8) % 8;

      // Kick drum on every beat
      const kickEnv = Math.exp(-beatPhase * 14);
      const kickFreq = 48 + 110 * Math.exp(-beatPhase * 28);
      const kick = Math.sin(2 * Math.PI * kickFreq * beatPhase) * kickEnv * 0.45;

      // Rolling 1/8th synth bass
      const bassF = bassFreqs[barIndex];
      const bassEnv = Math.exp(-eighthPhase * 5.5);
      const bass =
        Math.tanh(
          (Math.sin(2 * Math.PI * bassF * t) +
            0.5 * Math.sin(2 * Math.PI * bassF * 2 * t)) *
            1.8
        ) *
        bassEnv *
        0.28;

      // Stereo synth arpeggio
      const arpF = arpFreqs[sixteenthIndex];
      const arpEnv = Math.exp(-((t * 8) % 1) * 6);
      const arpL = Math.sin(2 * Math.PI * arpF * t) * arpEnv * 0.16;
      const arpR = Math.sin(2 * Math.PI * (arpF * 1.003) * t + 0.4) * arpEnv * 0.16;

      const left = Math.max(-0.95, Math.min(0.95, kick + bass + arpL));
      const right = Math.max(-0.95, Math.min(0.95, kick + bass + arpR));

      view.setInt16(offset, left * 32767, true);
      view.setInt16(offset + 2, right * 32767, true);
      offset += 4;
    }

    const wavFile = new File(
      [buffer],
      'Maranello Telemetry Synth - Night Drive (Original Synth WAV).wav',
      { type: 'audio/wav' }
    );
    await this.addFiles([wavFile]);
  }

  public async selectTrack(trackId: string, autoPlay = true): Promise<void> {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    this.state.currentTrackId = track.id;
    this.state.currentTime = 0;
    this.state.duration = track.duration || 0;
    this.state.errorMessage = null;

    if (track.needsRelink || !track.blobUrl) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.state.isPlaying = false;
      this.state.errorMessage = `Track "${track.title}" was restored from saved playlist metadata. Please re-select "${track.fileName}" from your device to play.`;
      this.emit();
      return;
    }

    this.audio.src = track.blobUrl;
    this.audio.currentTime = 0;

    if (autoPlay) {
      await this.play();
    } else {
      this.emit();
    }
  }

  public async play(): Promise<void> {
    this.state.errorMessage = null;
    await AudioEngine.getInstance().initAndResume();

    let current = this.getCurrentTrack();
    if (!current && this.state.tracks.length > 0) {
      current = this.state.tracks.find((t) => !t.needsRelink) ?? this.state.tracks[0];
      this.state.currentTrackId = current.id;
    }

    if (!current) {
      this.state.errorMessage = 'Upload a local audio file (MP3, WAV, OGG) to start playback.';
      this.emit();
      return;
    }

    if (current.needsRelink || !current.blobUrl) {
      this.state.errorMessage = `Please re-select "${current.fileName}" from your computer to restore local file access.`;
      this.emit();
      return;
    }

    if (this.audio.src !== current.blobUrl) {
      this.audio.src = current.blobUrl;
    }

    try {
      await this.audio.play();
      this.state.isPlaying = true;
    } catch (err) {
      this.state.isPlaying = false;
      this.state.errorMessage =
        err instanceof Error ? err.message : 'Playback failed to start.';
    }
    this.emit();
  }

  public pause(): void {
    this.audio.pause();
    this.state.isPlaying = false;
    this.emit();
  }

  public async togglePlay(): Promise<void> {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  public seek(timeSeconds: number): void {
    if (!Number.isFinite(timeSeconds)) return;
    const clamped = Math.max(0, Math.min(timeSeconds, this.state.duration || 0));
    this.audio.currentTime = clamped;
    this.state.currentTime = clamped;
    this.emit();
  }

  public async next(): Promise<void> {
    const playable = this.state.tracks;
    if (playable.length === 0) return;

    if (this.state.shuffle && playable.length > 1) {
      const others = playable.filter((t) => t.id !== this.state.currentTrackId);
      const randomTrack = others[Math.floor(Math.random() * others.length)];
      if (randomTrack) {
        await this.selectTrack(randomTrack.id, this.state.isPlaying);
        return;
      }
    }

    const currentIdx = playable.findIndex((t) => t.id === this.state.currentTrackId);
    const nextIdx = (currentIdx + 1) % playable.length;
    await this.selectTrack(playable[nextIdx].id, this.state.isPlaying);
  }

  public async previous(): Promise<void> {
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    const playable = this.state.tracks;
    if (playable.length === 0) return;

    const currentIdx = playable.findIndex((t) => t.id === this.state.currentTrackId);
    const prevIdx = (currentIdx - 1 + playable.length) % playable.length;
    await this.selectTrack(playable[prevIdx].id, this.state.isPlaying);
  }

  private handleTrackEnded(): void {
    if (this.state.repeatMode === 'ONE') {
      this.seek(0);
      void this.play();
      return;
    }

    const playable = this.state.tracks;
    if (playable.length === 0) return;

    const currentIdx = playable.findIndex((t) => t.id === this.state.currentTrackId);
    const isLast = currentIdx === playable.length - 1;

    if (isLast && this.state.repeatMode === 'OFF' && !this.state.shuffle) {
      this.state.isPlaying = false;
      this.seek(0);
      this.emit();
      return;
    }

    void this.next();
  }

  public toggleShuffle(): void {
    this.state.shuffle = !this.state.shuffle;
    this.emit();
  }

  public cycleRepeatMode(): void {
    const order: RepeatMode[] = ['OFF', 'ALL', 'ONE'];
    const nextIdx = (order.indexOf(this.state.repeatMode) + 1) % order.length;
    this.state.repeatMode = order[nextIdx];
    this.emit();
  }

  public removeTrack(trackId: string): void {
    const idx = this.state.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;

    const removed = this.state.tracks[idx];
    if (removed.blobUrl && removed.blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(removed.blobUrl);
    }

    if (typeof fetch !== 'undefined' && (removed.s3Key || removed.id)) {
      const qs = new URLSearchParams({
        id: removed.id,
        ...(removed.s3Key ? { key: removed.s3Key } : {}),
      });
      void fetch(`/api/music/tracks?${qs.toString()}`, { method: 'DELETE' }).catch(
        () => {}
      );
    }

    const wasCurrent = this.state.currentTrackId === trackId;
    this.state.tracks.splice(idx, 1);
    PlaylistManager.saveTracksMetadata(this.state.tracks);

    if (wasCurrent) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.state.isPlaying = false;
      this.state.currentTime = 0;
      const nextTrack = this.state.tracks[idx] ?? this.state.tracks[0] ?? null;
      this.state.currentTrackId = nextTrack?.id ?? null;
      this.state.duration = nextTrack?.duration ?? 0;
    }

    this.emit();
  }

  public clearPlaylist(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.state.tracks.forEach((t) => {
      if (t.blobUrl && t.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(t.blobUrl);
      }
      if (typeof fetch !== 'undefined' && (t.s3Key || t.id)) {
        const qs = new URLSearchParams({
          id: t.id,
          ...(t.s3Key ? { key: t.s3Key } : {}),
        });
        void fetch(`/api/music/tracks?${qs.toString()}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    });
    this.state.tracks = [];
    this.state.currentTrackId = null;
    this.state.isPlaying = false;
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.state.errorMessage = null;
    PlaylistManager.saveTracksMetadata([]);
    this.emit();
  }
}

