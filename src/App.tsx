import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Power,
  Flame,
  Navigation,
  LocateFixed,
  Zap,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Music,
  OctagonAlert,
} from 'lucide-react';
import { CockpitHeader } from './components/cockpit/CockpitHeader';
import { Tachometer } from './components/cockpit/Tachometer';
import { Speedometer } from './components/cockpit/Speedometer';
import { GearIndicator } from './components/cockpit/GearIndicator';
import { ShiftIndicator } from './components/cockpit/ShiftIndicator';
import { EngineStatus } from './components/cockpit/EngineStatus';
import { RevButton } from './components/cockpit/RevButton';
import { ThrottlePedal } from './components/cockpit/ThrottlePedal';
import { EngineControls } from './components/controls/EngineControls';
import { TransmissionControls } from './components/controls/TransmissionControls';
import { ProfileSelector } from './components/controls/ProfileSelector';
import { MusicPlayer } from './components/music/MusicPlayer';
import { AudioVisualizer } from './components/audio/AudioVisualizer';
import { AudioSettings } from './components/audio/AudioSettings';
import { useEngine } from './hooks/useEngine';
import { useMusicPlayer } from './hooks/useMusicPlayer';

export const App: React.FC = () => {
  const {
    telemetry,
    telemetryRef,
    sensorSnapshot,
    profile,
    profileId,
    settings,
    audioStatus,
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
  } = useEngine();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [isClusterFullscreen, setIsClusterFullscreen] = useState(false);

  const {
    musicState,
    currentTrack,
    togglePlay: toggleMusicPlay,
    next: nextTrack,
    previous: prevTrack,
  } = useMusicPlayer();

  // Keep mobile/tablet screen awake (Screen Wake Lock API) while engine or fullscreen is active
  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null;
    const shouldKeepAwake =
      isClusterFullscreen ||
      telemetry.engineState !== 'OFF' ||
      sensorSnapshot.gpsStatus === 'LOCKED';

    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        if (shouldKeepAwake && nav.wakeLock) {
          wakeLock = await nav.wakeLock.request('screen');
        }
      } catch {
        // Ignore if Wake Lock API is unsupported or denied
      }
    };

    void requestWakeLock();
    return () => {
      if (wakeLock) {
        void wakeLock.release().catch(() => {});
      }
    };
  }, [isClusterFullscreen, telemetry.engineState, sensorSnapshot.gpsStatus]);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };

    if (!isClusterFullscreen) {
      setIsClusterFullscreen(true);
      try {
        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
          }
        }
      } catch {
        // Fallback to viewport-locked fullscreen cluster mode (e.g. iOS Safari)
      }
    } else {
      setIsClusterFullscreen(false);
      try {
        if (doc.fullscreenElement && doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } catch {
        // Ignore
      }
    }
  }, [isClusterFullscreen]);

  // Sync fullscreen state with browser Escape key and 'F' keyboard shortcut
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        setIsClusterFullscreen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === 'Escape' && isClusterFullscreen) {
        setIsClusterFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange
      );
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isClusterFullscreen, toggleFullscreen]);

  const isEngineOn = telemetry.engineState !== 'OFF';
  const isStarting = telemetry.engineState === 'STARTING';
  const isGpsLocked = sensorSnapshot.gpsStatus === 'LOCKED';

  return (
    <div className="min-h-screen w-full carbon-surface text-white flex flex-col justify-between overflow-x-hidden">
      {/* SLIM TOP HEADER (Hidden when in Fullscreen Car Cluster Mode) */}
      {!isClusterFullscreen && (
        <CockpitHeader
          engineState={telemetry.engineState}
          audioStatus={audioStatus}
          profile={profile}
          settings={settings}
          onUpdateSettings={updateSettings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onResumeAudio={() => void resumeAudio()}
          onToggleFullscreen={() => void toggleFullscreen()}
        />
      )}

      <main
        className={
          isClusterFullscreen
            ? 'fixed inset-0 z-50 w-screen h-screen overflow-y-auto bg-gradient-to-b from-[#0d111a] via-[#06080c] to-[#020305] p-3 sm:p-6 flex flex-col justify-between'
            : 'flex-1 w-full max-w-[1560px] mx-auto px-3 sm:px-5 py-3 flex flex-col gap-4'
        }
      >
        {/* ===================================================================
            1. MUSTANG GT TWIN-DIAL DIGITAL INSTRUMENT CLUSTER BINNACLE
               Left: RPM Tachometer | Center: Gear + Fuel (E-F) + Temp | Right: MPH Speedometer
           =================================================================== */}
        <section
          aria-label="Mustang GT Digital Instrument Cluster"
          className={
            isClusterFullscreen
              ? 'flex-1 flex flex-col justify-between max-w-[1640px] w-full mx-auto rounded-3xl p-4 sm:p-7 border border-white/15 bg-gradient-to-b from-[#111520]/90 via-[#080a0f]/95 to-[#040507] shadow-[0_24px_80px_rgba(0,0,0,0.95),inset_0_1px_2px_rgba(255,255,255,0.18)] relative'
              : 'relative rounded-3xl p-4 sm:p-6 border border-white/15 bg-gradient-to-b from-[#111520] via-[#090b10] to-[#050608] shadow-[0_24px_60px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.15)]'
          }
        >
          {/* Top Bar inside Cluster Binnacle: Profile Badge, Shift Lights & Fullscreen Toggle */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#e11d2a] shadow-[0_0_8px_#e11d2a]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-400">
                {profile.name} ({profile.code})
              </span>
            </div>

            <div className="flex-1 max-w-xl mx-auto">
              <ShiftIndicator
                rpm={telemetry.rpm}
                redlineRpm={settings.redlineRpm}
                maxRpm={settings.maxRpm}
                isShiftWarning={telemetry.isShiftWarning}
                isRedline={telemetry.isRedline}
                isRevLimiter={telemetry.isRevLimiter}
                engineOn={telemetry.engineState !== 'OFF'}
              />
            </div>

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title={
                isClusterFullscreen
                  ? 'Keluar Mode Layar Penuh (Shortcut: F atau ESC)'
                  : 'Tampilkan Dashboard Layar Penuh (Shortcut: F)'
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-200 transition-all active:scale-95 shrink-0"
            >
              {isClusterFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-[#ff4d58]" />
                  <span>EXIT FULLSCREEN [ESC]</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden sm:inline">FULLSCREEN CLUSTER</span>
                </>
              )}
            </button>
          </div>

          {/* Twin-Pod Cluster: LEFT = RPM | CENTER = GEAR & FUEL GAUGE | RIGHT = MPH */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center my-auto">
            {/* LEFT DIAL: RPM TACHOMETER */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center order-1">
              <Tachometer
                telemetryRef={telemetryRef}
                telemetry={telemetry}
                profile={profile}
                settings={settings}
              />
            </div>

            {/* CENTER CLUSTER LCD: GEAR POSITION + FUEL GAUGE (E ─── F) + BOOST & COOLANT TEMP */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-3 order-3 lg:order-2 px-1 sm:px-3">
              <GearIndicator
                gear={telemetry.gear}
                transmissionMode={telemetry.transmissionMode}
                isShifting={telemetry.isShifting}
                shiftDirection={telemetry.shiftDirection}
              />

              <EngineStatus
                telemetry={telemetry}
                profile={profile}
                turboEnabled={settings.turboEnabled}
                onRefuel={refuel}
              />
            </div>

            {/* RIGHT DIAL: MPH SPEEDOMETER */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center order-2 lg:order-3">
              <Speedometer
                telemetryRef={telemetryRef}
                speedKmh={telemetry.speedKmh}
                accelerationG={telemetry.accelerationG}
                sensorSnapshot={sensorSnapshot}
              />
            </div>
          </div>

          {/* ===============================================================
              STEERING-WHEEL COMPACT HUD BAR (Shown in Fullscreen Mode)
             =============================================================== */}
          {isClusterFullscreen && (
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 bg-[#07090e]/90 px-4 py-2.5 rounded-2xl">
              {/* Ignition Start / Stop */}
              <button
                type="button"
                onClick={() => void toggleEngine()}
                className={`px-4 py-2.5 rounded-xl font-mono text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition-all active:scale-95 ${
                  isEngineOn
                    ? 'bg-[#1a1d24] border-[#e11d2a]/60 text-white'
                    : 'bg-gradient-to-r from-[#e11d2a] to-[#b5121e] border-white/20 text-white shadow-[0_0_20px_rgba(225,29,42,0.5)]'
                }`}
              >
                <Power
                  className={`w-4 h-4 ${
                    isStarting
                      ? 'text-amber-300 animate-spin'
                      : isEngineOn
                        ? 'text-[#ff2836]'
                        : 'text-white'
                  }`}
                />
                <span>
                  {isStarting
                    ? 'CRANKING...'
                    : isEngineOn
                      ? 'ENGINE STOP'
                      : 'ENGINE START'}
                </span>
              </button>

              {/* Hold-to-Brake & Rapid Downshift Button [B] + Hold-to-Rev Accelerator Button [SPACE] */}
              <div className="flex items-center gap-2 flex-1 max-w-lg">
                <button
                  type="button"
                  onPointerDown={(e) => {
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // ignore
                    }
                    setBrake(1.0);
                  }}
                  onPointerUp={() => setBrake(0)}
                  onPointerCancel={() => setBrake(0)}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-mono text-xs font-black uppercase tracking-[0.14em] flex items-center justify-center gap-2 border select-none touch-none transition-all active:scale-95 ${
                    telemetry.brake > 0.05
                      ? 'bg-amber-500 border-amber-200 text-black shadow-[0_0_25px_rgba(245,158,11,0.85)]'
                      : 'bg-[#181c26] hover:bg-[#222836] border-amber-400/50 text-amber-300'
                  }`}
                >
                  <OctagonAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {telemetry.brake > 0.05
                      ? `BRAKING • G${telemetry.gear}`
                      : 'HOLD BRAKE [B]'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!isEngineOn || isStarting}
                  onPointerDown={(e) => {
                    if (!isEngineOn || isStarting) return;
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // ignore
                    }
                    setThrottle(1.0);
                  }}
                  onPointerUp={() => setThrottle(0)}
                  onPointerCancel={() => setThrottle(0)}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-mono text-xs font-black uppercase tracking-[0.14em] flex items-center justify-center gap-2 border select-none touch-none transition-all active:scale-95 ${
                    !isEngineOn || isStarting
                      ? 'bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed'
                      : telemetry.throttle > 0.05
                        ? 'bg-[#e11d2a] border-white/40 text-white shadow-[0_0_25px_rgba(225,29,42,0.8)]'
                        : 'bg-[#181c26] hover:bg-[#222836] border-[#e11d2a]/50 text-white'
                  }`}
                >
                  <Flame className="w-4 h-4 text-[#ff4d58] shrink-0" />
                  <span>
                    {telemetry.throttle > 0.05
                      ? `REV ${Math.round(telemetry.rpm)} RPM`
                      : 'HOLD REV [SPACE]'}
                  </span>
                </button>
              </div>

              {/* Quick Paddle Shifters + Auto + EV GPS Sync */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={shiftDown}
                  className="px-3 py-2 rounded-lg bg-[#151821] hover:bg-white/10 border border-white/15 font-mono text-xs font-bold text-white"
                >
                  GEAR -
                </button>
                <button
                  type="button"
                  onClick={shiftUp}
                  className="px-3 py-2 rounded-lg bg-[#151821] hover:bg-white/10 border border-white/15 font-mono text-xs font-bold text-white"
                >
                  GEAR +
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTransmissionMode(
                      telemetry.transmissionMode === 'AUTO' ? 'MANUAL' : 'AUTO'
                    )
                  }
                  className={`px-3 py-2 rounded-lg font-mono text-xs font-bold border ${
                    telemetry.transmissionMode === 'AUTO'
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      : 'bg-white/5 border-white/10 text-zinc-300'
                  }`}
                >
                  {telemetry.transmissionMode}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleGps()}
                  className={`px-3 py-2 rounded-lg font-mono text-xs font-bold border flex items-center gap-1.5 ${
                    isGpsLocked
                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                      : 'bg-[#181c26] border-white/15 text-zinc-200'
                  }`}
                >
                  {isGpsLocked ? (
                    <LocateFixed className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Navigation className="w-3.5 h-3.5 text-[#e11d2a]" />
                  )}
                  <span>{isGpsLocked ? 'EV GPS ON' : 'EV GPS'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void triggerBlowOff()}
                  className="px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 font-mono text-xs font-bold text-sky-300 flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>BOV</span>
                </button>
              </div>

              {/* Compact S3 Music Controls inside Fullscreen Cluster */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                <Music className="w-3.5 h-3.5 text-[#e11d2a] shrink-0" />
                <span className="text-[10px] font-mono text-zinc-300 max-w-[130px] truncate">
                  {currentTrack ? currentTrack.title : 'S3 AUDIO READY'}
                </span>
                <button
                  type="button"
                  onClick={() => void prevTrack()}
                  aria-label="Previous Track"
                  className="p-1 rounded hover:bg-white/10 text-zinc-300"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void toggleMusicPlay()}
                  aria-label={musicState.isPlaying ? 'Pause Music' : 'Play Music'}
                  className="p-1.5 rounded-lg bg-[#e11d2a] text-white"
                >
                  {musicState.isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void nextTrack()}
                  aria-label="Next Track"
                  className="p-1 rounded hover:bg-white/10 text-zinc-300"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ===================================================================
            2. LOWER CENTER CONSOLE (Hidden when in Fullscreen Cluster Mode)
           =================================================================== */}
        {!isClusterFullscreen && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* LEFT CONSOLE: Ignition Push Button + 6-Speed / Auto / EV GPS Shifter */}
            <div className="lg:col-span-4 cockpit-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between gap-3">
              <EngineControls
                engineState={telemetry.engineState}
                startupPhase={telemetry.startupPhase}
                profile={profile}
                settings={settings}
                onToggleEngine={() => void toggleEngine()}
                onTriggerBlowOff={() => void triggerBlowOff()}
                onUpdateSettings={updateSettings}
              />

              <TransmissionControls
                gear={telemetry.gear}
                transmissionMode={telemetry.transmissionMode}
                sensorSnapshot={sensorSnapshot}
                onShiftUp={shiftUp}
                onShiftDown={shiftDown}
                onSetGear={setGear}
                onSetTransmissionMode={setTransmissionMode}
                onToggleGps={() => void toggleGps()}
              />
            </div>

            {/* CENTER CONSOLE: Tactile REV ENGINE Pedal + Engine Sound Profile Selector */}
            <div className="lg:col-span-4 cockpit-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between gap-3">
              <div className="bg-[#0a0b0e] rounded-xl p-2 border border-white/10 flex flex-col items-center justify-center">
                <RevButton
                  engineState={telemetry.engineState}
                  rpm={telemetry.rpm}
                  throttle={telemetry.throttle}
                  brake={telemetry.brake}
                  gear={telemetry.gear}
                  speedKmh={telemetry.speedKmh}
                  isRedline={telemetry.isRedline}
                  isRevLimiter={telemetry.isRevLimiter}
                  onSetThrottle={setThrottle}
                  onSetBrake={setBrake}
                />
              </div>

              <ThrottlePedal
                engineState={telemetry.engineState}
                throttle={telemetry.throttle}
                effectiveThrottle={telemetry.effectiveThrottle}
                onSetThrottle={setThrottle}
              />

              <ProfileSelector
                selectedProfileId={profileId}
                onSelectProfile={selectProfile}
              />
            </div>

            {/* RIGHT CONSOLE: SYNC Infotainment Music Player (MinIO S3 Integrated) */}
            <div className="lg:col-span-4 flex flex-col">
              <MusicPlayer
                musicVolume={settings.musicVolume}
                onChangeMusicVolume={(vol) =>
                  updateSettings({ musicVolume: vol })
                }
              />
            </div>
          </section>
        )}
      </main>

      {/* COLLAPSIBLE AUDIO DSP WAVEFORM & SPECTRUM FOOTER (Hidden in Fullscreen Mode) */}
      {!isClusterFullscreen && (
        <footer className="w-full max-w-[1560px] mx-auto px-3 sm:px-5 pb-3">
          <div className="flex justify-center mb-1.5">
            <button
              type="button"
              onClick={() => setShowVisualizer((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
            >
              <Activity className="w-3 h-3 text-[#e11d2a]" />
              <span>
                {showVisualizer
                  ? 'SEMBUNYIKAN AUDIO SPECTRUM'
                  : 'TAMPILKAN AUDIO SPECTRUM & WAVEFORM'}
              </span>
              {showVisualizer ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )}
            </button>
          </div>

          {showVisualizer && (
            <AudioVisualizer audioStatus={audioStatus} telemetry={telemetry} />
          )}
        </footer>
      )}

      {/* SETTINGS MODAL */}
      <AudioSettings
        isOpen={isSettingsOpen}
        settings={settings}
        audioStatus={audioStatus}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
      />
    </div>
  );
};

export default App;
