import { PersistedTrackMetadata, TrackItem } from './types';
import { loadFromStorage, PLAYLIST_META_KEY, saveToStorage } from '../utils/storage';

const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.opus'];

/**
 * Manages playlist metadata persistence, ID3v2 tag & album art extraction,
 * and safe restoration of playlist metadata without persisting temporary blob URLs.
 */
export class PlaylistManager {
  public static loadPersistedTracks(): TrackItem[] {
    const persisted = loadFromStorage<PersistedTrackMetadata[]>(PLAYLIST_META_KEY, []);
    if (!Array.isArray(persisted)) return [];

    return persisted.map((meta) => {
      const hasS3 = Boolean(meta.s3Key);
      return {
        ...meta,
        s3Key: meta.s3Key ?? null,
        blobUrl: hasS3
          ? `/api/music/stream?key=${encodeURIComponent(meta.s3Key!)}`
          : null,
        needsRelink: !hasS3,
      };
    });
  }

  public static saveTracksMetadata(tracks: TrackItem[]): void {
    const metadata: PersistedTrackMetadata[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      fileName: t.fileName,
      fileSize: t.fileSize,
      mimeType: t.mimeType,
      duration: t.duration,
      s3Key: t.s3Key ?? null,
      // Keep small artwork thumbnails only (< 80KB) to respect localStorage quota
      artworkDataUrl:
        t.artworkDataUrl && t.artworkDataUrl.length < 85000 ? t.artworkDataUrl : null,
      addedAt: t.addedAt,
    }));
    saveToStorage(PLAYLIST_META_KEY, metadata);
  }

  public static isSupportedAudioFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    const hasValidExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasAudioMime = file.type.startsWith('audio/') || file.type === 'application/ogg';
    return hasValidExt || hasAudioMime;
  }

  /**
   * Parses basic ID3v2 tags (TIT2 title, TPE1 artist, TALB album, APIC artwork)
   * directly from the first 256KB of a local audio file, falling back to filename parsing.
   */
  public static async extractMetadataFromFile(file: File): Promise<{
    title: string;
    artist: string;
    album: string;
    artworkDataUrl: string | null;
  }> {
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    let defaultArtist = 'Local Cockpit Audio';
    let defaultTitle = cleanName;

    if (cleanName.includes(' - ')) {
      const parts = cleanName.split(' - ');
      defaultArtist = parts[0].trim() || defaultArtist;
      defaultTitle = parts.slice(1).join(' - ').trim() || defaultTitle;
    }

    try {
      const slice = file.slice(0, Math.min(file.size, 262144));
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Check for "ID3" header
      if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        const version = bytes[3];
        const tagSize =
          ((bytes[6] & 0x7f) << 21) |
          ((bytes[7] & 0x7f) << 14) |
          ((bytes[8] & 0x7f) << 7) |
          (bytes[9] & 0x7f);

        const maxOffset = Math.min(bytes.length, 10 + tagSize);
        let offset = 10;
        let title = '';
        let artist = '';
        let album = '';
        let artworkDataUrl: string | null = null;

        while (offset + 10 < maxOffset) {
          const frameId = String.fromCharCode(
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3]
          );
          if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

          let frameSize = 0;
          if (version === 4) {
            frameSize =
              ((bytes[offset + 4] & 0x7f) << 21) |
              ((bytes[offset + 5] & 0x7f) << 14) |
              ((bytes[offset + 6] & 0x7f) << 7) |
              (bytes[offset + 7] & 0x7f);
          } else {
            frameSize =
              (bytes[offset + 4] << 24) |
              (bytes[offset + 5] << 16) |
              (bytes[offset + 6] << 8) |
              bytes[offset + 7];
          }

          if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;

          const frameData = bytes.subarray(offset + 10, offset + 10 + frameSize);

          if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TALB') {
            const text = PlaylistManager.decodeId3TextFrame(frameData);
            if (text) {
              if (frameId === 'TIT2') title = text;
              if (frameId === 'TPE1') artist = text;
              if (frameId === 'TALB') album = text;
            }
          } else if (frameId === 'APIC' && !artworkDataUrl && frameSize < 70000) {
            artworkDataUrl = PlaylistManager.decodeId3ApicFrame(frameData);
          }

          offset += 10 + frameSize;
        }

        return {
          title: title || defaultTitle,
          artist: artist || defaultArtist,
          album: album || 'Driver Media Library',
          artworkDataUrl,
        };
      }
    } catch {
      // Fallback to filename metadata
    }

    return {
      title: defaultTitle,
      artist: defaultArtist,
      album: 'Driver Media Library',
      artworkDataUrl: null,
    };
  }

  private static decodeId3TextFrame(data: Uint8Array): string {
    if (data.length <= 1) return '';
    const encoding = data[0];
    const textBytes = data.subarray(1);
    try {
      let decoder: TextDecoder;
      if (encoding === 1) {
        decoder = new TextDecoder('utf-16');
      } else if (encoding === 2) {
        decoder = new TextDecoder('utf-16be');
      } else if (encoding === 3) {
        decoder = new TextDecoder('utf-8');
      } else {
        decoder = new TextDecoder('iso-8859-1');
      }
      return decoder.decode(textBytes).replace(/\0/g, '').trim();
    } catch {
      return '';
    }
  }

  private static decodeId3ApicFrame(data: Uint8Array): string | null {
    try {
      let idx = 1; // skip encoding byte
      let mimeEnd = idx;
      while (mimeEnd < data.length && data[mimeEnd] !== 0) mimeEnd++;
      const mime =
        new TextDecoder('iso-8859-1').decode(data.subarray(idx, mimeEnd)).trim() || 'image/jpeg';
      idx = mimeEnd + 2; // skip null + picture type byte
      while (idx < data.length && data[idx] !== 0) idx++;
      idx += 1;
      if (idx < data.length && data[idx] === 0) idx += 1;

      const imgBytes = data.subarray(idx);
      if (imgBytes.length < 64) return null;

      let binary = '';
      for (let i = 0; i < imgBytes.length; i++) {
        binary += String.fromCharCode(imgBytes[i]);
      }
      return `data:${mime};base64,${btoa(binary)}`;
    } catch {
      return null;
    }
  }

  public static probeAudioDuration(blobUrl: string): Promise<number> {
    return new Promise((resolve) => {
      const tempAudio = new Audio();
      tempAudio.preload = 'metadata';
      const cleanup = () => {
        tempAudio.onloadedmetadata = null;
        tempAudio.onerror = null;
        tempAudio.src = '';
      };
      tempAudio.onloadedmetadata = () => {
        const dur = Number.isFinite(tempAudio.duration) ? tempAudio.duration : 0;
        cleanup();
        resolve(dur);
      };
      tempAudio.onerror = () => {
        cleanup();
        resolve(0);
      };
      tempAudio.src = blobUrl;
    });
  }
}

