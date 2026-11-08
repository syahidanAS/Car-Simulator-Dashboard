import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicManager } from '../music/MusicManager';
import { MusicPlayerState } from '../music/types';

export function useMusicPlayer() {
  const managerRef = useRef<MusicManager>(MusicManager.getInstance());
  const [musicState, setMusicState] = useState<MusicPlayerState>(() =>
    managerRef.current.getState()
  );

  useEffect(() => {
    const unsubscribe = managerRef.current.subscribe((newState) => {
      setMusicState(newState);
    });
    return unsubscribe;
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    await managerRef.current.addFiles(files);
  }, []);

  const addSynthTestTrack = useCallback(async () => {
    await managerRef.current.addOrigSynthwaveTestTrack();
  }, []);

  const selectTrack = useCallback(async (trackId: string, autoPlay = true) => {
    await managerRef.current.selectTrack(trackId, autoPlay);
  }, []);

  const togglePlay = useCallback(async () => {
    await managerRef.current.togglePlay();
  }, []);

  const play = useCallback(async () => {
    await managerRef.current.play();
  }, []);

  const pause = useCallback(() => {
    managerRef.current.pause();
  }, []);

  const next = useCallback(async () => {
    await managerRef.current.next();
  }, []);

  const previous = useCallback(async () => {
    await managerRef.current.previous();
  }, []);

  const seek = useCallback((seconds: number) => {
    managerRef.current.seek(seconds);
  }, []);

  const toggleShuffle = useCallback(() => {
    managerRef.current.toggleShuffle();
  }, []);

  const cycleRepeatMode = useCallback(() => {
    managerRef.current.cycleRepeatMode();
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    managerRef.current.removeTrack(trackId);
  }, []);

  const clearPlaylist = useCallback(() => {
    managerRef.current.clearPlaylist();
  }, []);

  const syncS3Bucket = useCallback(async () => {
    await managerRef.current.syncWithS3Bucket();
  }, []);

  const currentTrack =
    musicState.tracks.find((t) => t.id === musicState.currentTrackId) ?? null;

  return {
    musicState,
    currentTrack,
    addFiles,
    addSynthTestTrack,
    selectTrack,
    togglePlay,
    play,
    pause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeatMode,
    removeTrack,
    clearPlaylist,
    syncS3Bucket,
  };
}

