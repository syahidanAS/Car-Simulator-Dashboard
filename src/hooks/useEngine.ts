import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import {
  DEFAULT_USER_SETTINGS,
  ENGINE_PROFILES,
} from '../engine/EngineProfiles';
import { EngineSimulation } from '../engine/EngineSimulation';
import {
  EngineProfile,
  EngineProfileId,
  Gear,
  SimulationTelemetry,
  TransmissionMode,
  UserSettings,
} from '../engine/types';
import { SimulationTelemetryProvider } from '../telemetry/SimulationTelemetryProvider';
import { loadFromStorage, saveToStorage, SETTINGS_KEY } from '../utils/storage';
import { useAudioEngine } from './useAudioEngine';
import { useTelemetry } from './useTelemetry';

export function useEngine() {
  const [settings, setSettingsState] = useState<UserSettings>(() =>
    loadFromStorage<UserSettings>(SETTINGS_KEY, DEFAULT_USER_SETTINGS)
  );

  const [profileId, setProfileIdState] = useState<EngineProfileId>('mustang_gt_v8');

  const simulationRef = useRef<EngineSimulation | null>(null);
  if (!simulationRef.current) {
    simulationRef.current = new EngineSimulation('mustang_gt_v8', {
      ...settings,
      idleRpm: ENGINE_PROFILES.mustang_gt_v8.idleRpm,
      redlineRpm: ENGINE_PROFILES.mustang_gt_v8.redlineRpm,
      maxRpm: ENGINE_PROFILES.mustang_gt_v8.maxRpm,
    });
  }

  const telemetryProvider = useMemo(
    () => new SimulationTelemetryProvider(simulationRef.current!),
    []
  );

  const { latestTelemetryRef, sensorSnapshot } = useTelemetry(telemetryProvider);
  const { audioEngine, audioStatus, resumeAudio } = useAudioEngine(settings);

  const [uiTelemetry, setUiTelemetry] = useState<SimulationTelemetry>(() => ({
    ...simulationRef.current!.getTelemetry(),
  }));

  const settingsRef = useRef<UserSettings>(settings);
  settingsRef.current = settings;

  const profileRef = useRef<EngineProfile>(ENGINE_PROFILES[profileId]);
  profileRef.current = ENGINE_PROFILES[profileId];

  // Persist user settings and sync to simulation + audio engine
  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettingsState((prev) => {
      const next: UserSettings = {
        ...prev,
        ...patch,
        gearRatios: patch.gearRatios
          ? { ...prev.gearRatios, ...patch.gearRatios }
          : prev.gearRatios,
      };
      saveToStorage(SETTINGS_KEY, next);
      simulationRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const activeProfile = ENGINE_PROFILES[profileId];
    const defaults: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      idleRpm: activeProfile.idleRpm,
      redlineRpm: activeProfile.redlineRpm,
      maxRpm: activeProfile.maxRpm,
      gearRatios: { ...DEFAULT_USER_SETTINGS.gearRatios },
    };
    saveToStorage(SETTINGS_KEY, defaults);
    setSettingsState(defaults);
    simulationRef.current?.updateSettings(defaults);
  }, [profileId]);

  const selectProfile = useCallback((nextId: EngineProfileId) => {
    const nextProfile = ENGINE_PROFILES[nextId];
    if (!nextProfile) return;
    setProfileIdState(nextId);
    simulationRef.current?.setProfile(nextId);
    setSettingsState((prev) => {
      const updated: UserSettings = {
        ...prev,
        idleRpm: nextProfile.idleRpm,
        redlineRpm: nextProfile.redlineRpm,
        maxRpm: nextProfile.maxRpm,
      };
      saveToStorage(SETTINGS_KEY, updated);
      return updated;
    });
  }, []);

  const startEngine = useCallback(async () => {
    const sim = simulationRef.current;
    if (!sim) return;
    await resumeAudio();
    if (sim.getTelemetry().engineState === 'OFF') {
      sim.startEngine();
      void audioEngine.playStartupSound(sim.getProfile());
      setUiTelemetry({ ...sim.getTelemetry() });
    }
  }, [audioEngine, resumeAudio]);

  const stopEngine = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    audioEngine.cancelStartupSound();
    sim.stopEngine();
    setUiTelemetry({ ...sim.getTelemetry() });
  }, [audioEngine]);

  const toggleEngine = useCallback(async () => {
    const sim = simulationRef.current;
    if (!sim) return;
    if (sim.getTelemetry().engineState === 'OFF') {
      await startEngine();
    } else {
      stopEngine();
    }
  }, [startEngine, stopEngine]);

  const setThrottle = useCallback(
    (value: number) => {
      const sim = simulationRef.current;
      if (!sim) return;
      if (value > 0 && audioStatus.contextState !== 'running') {
        void resumeAudio();
      }
      sim.setThrottle(value);
    },
    [audioStatus.contextState, resumeAudio]
  );

  const setBrake = useCallback(
    (value: number) => {
      const sim = simulationRef.current;
      if (!sim) return;
      if (value > 0 && audioStatus.contextState !== 'running') {
        void resumeAudio();
      }
      sim.setBrake(value);
      setUiTelemetry({ ...sim.getTelemetry() });
    },
    [audioStatus.contextState, resumeAudio]
  );

  const shiftUp = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    if (sim.shiftUp()) {
      setUiTelemetry({ ...sim.getTelemetry() });
    }
  }, []);

  const shiftDown = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    if (sim.shiftDown()) {
      setUiTelemetry({ ...sim.getTelemetry() });
    }
  }, []);

  const setGear = useCallback((gear: Gear) => {
    const sim = simulationRef.current;
    if (!sim) return;
    if (sim.setGear(gear)) {
      setUiTelemetry({ ...sim.getTelemetry() });
    }
  }, []);

  const setTransmissionMode = useCallback((mode: TransmissionMode) => {
    const sim = simulationRef.current;
    if (!sim) return;
    sim.setTransmissionMode(mode);
    setUiTelemetry({ ...sim.getTelemetry() });
  }, []);

  const toggleGps = useCallback(async () => {
    const currentStatus = telemetryProvider.getSensorSnapshot().gpsStatus;
    if (currentStatus === 'OFF' || currentStatus === 'ERROR') {
      // Automatically start engine and switch to AUTO transmission when GPS Live Drive is activated
      if (simulationRef.current?.getTelemetry().engineState === 'OFF') {
        await startEngine();
      }
      simulationRef.current?.setTransmissionMode('AUTO');
      telemetryProvider.enableGps();
    } else {
      telemetryProvider.disableGps();
    }
  }, [startEngine, telemetryProvider]);

  const triggerBlowOff = useCallback(async () => {
    await resumeAudio();
    if (simulationRef.current?.getTelemetry().engineState === 'OFF') {
      await startEngine();
    }
    simulationRef.current?.triggerManualBlowOff();
  }, [resumeAudio, startEngine]);

  const refuel = useCallback(() => {
    simulationRef.current?.refuel();
    if (simulationRef.current) {
      setUiTelemetry({ ...simulationRef.current.getTelemetry() });
    }
  }, []);

  // Main requestAnimationFrame physics & audio parameter loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastUiSync = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const telemetry = telemetryProvider.step(dt);
      AudioEngine.getInstance().update(
        telemetry,
        profileRef.current,
        settingsRef.current
      );

      // Update React UI snapshot at ~30fps to avoid excessive React re-renders
      if (now - lastUiSync >= 32) {
        lastUiSync = now;
        setUiTelemetry({ ...telemetry });
      }

      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, [telemetryProvider]);

  // Global keyboard controls (Space to rev, B to brake & rapid downshift, ArrowUp/ArrowDown to shift) + focus loss safety release
  useEffect(() => {
    let isSpaceHeld = false;
    let isBrakeHeld = false;

    const isEditableElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) {
        // Still prevent Space scrolling if focused on a range slider or button
        if (
          e.code === 'Space' &&
          e.target instanceof HTMLInputElement &&
          e.target.type !== 'text' &&
          e.target.type !== 'number'
        ) {
          e.preventDefault();
        } else {
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!isSpaceHeld) {
          isSpaceHeld = true;
          setThrottle(1.0);
        }
      } else if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (!isBrakeHeld) {
          isBrakeHeld = true;
          setBrake(1.0);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        shiftUp();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        shiftDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isSpaceHeld) {
        e.preventDefault();
        isSpaceHeld = false;
        setThrottle(0);
      } else if (
        (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') &&
        isBrakeHeld
      ) {
        e.preventDefault();
        isBrakeHeld = false;
        setBrake(0);
      }
    };

    const releaseThrottleSafely = () => {
      isSpaceHeld = false;
      isBrakeHeld = false;
      simulationRef.current?.setThrottle(0);
      simulationRef.current?.setBrake(0);
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseThrottleSafely);
    document.addEventListener('visibilitychange', releaseThrottleSafely);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseThrottleSafely);
      document.removeEventListener('visibilitychange', releaseThrottleSafely);
    };
  }, [setBrake, setThrottle, shiftDown, shiftUp]);

  return {
    telemetry: uiTelemetry,
    telemetryRef: latestTelemetryRef,
    sensorSnapshot,
    profile: ENGINE_PROFILES[profileId],
    profileId,
    settings,
    audioStatus,
    startEngine,
    stopEngine,
    toggleEngine,
    setThrottle,
    setBrake,
    shiftUp,
    shiftDown,
    setGear,
    setTransmissionMode,
    toggleGps,
    triggerBlowOff,
    refuel,
    selectProfile,
    updateSettings,
    resetSettings,
    resumeAudio,
  };
}

