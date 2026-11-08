export type RepeatMode = 'OFF' | 'ONE' | 'ALL';

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number; // seconds
  artworkDataUrl: string | null;
  /** Audio stream URL (either S3 `/api/music/stream?key=...` or session blob URL) */
  blobUrl: string | null;
  /** MinIO S3 object key inside `car-simulator` bucket */
  s3Key?: string | null;
  /** True while file is being uploaded to MinIO S3 bucket */
  isUploading?: boolean;
  /** True when restored from local-only metadata without S3 key */
  needsRelink: boolean;
  addedAt: number;
}

export interface PersistedTrackMetadata {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number;
  artworkDataUrl: string | null;
  s3Key?: string | null;
  addedAt: number;
}

export interface MusicPlayerState {
  tracks: TrackItem[];
  currentTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  errorMessage: string | null;
  s3Connected: boolean;
  s3Bucket: string;
  s3Endpoint: string;
  isSyncingS3: boolean;
}
