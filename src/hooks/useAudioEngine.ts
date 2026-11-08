import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import { AudioSystemStatus, UserSettings } from '../engine/types';

export function useAudioEngine(settings: UserSettings) {
  const engineRef = useRef<AudioEngine>(AudioEngine.getInstance());
  const [status, setStatus] = useState<AudioSystemStatus>(() =>
    engineRef.current.getStatus()
  );

  useEffect(() => {
    engineRef.current.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStatus(engineRef.current.getStatus());
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

  const resumeAudio = useCallback(async () => {
    await engineRef.current.initAndResume();
    setStatus(engineRef.current.getStatus());
  }, []);

  return {
    audioEngine: engineRef.current,
    audioStatus: status,
    resumeAudio,
  };
}

