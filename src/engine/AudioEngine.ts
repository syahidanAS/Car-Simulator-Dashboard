import {
  AudioSystemStatus,
  EngineProfile,
  SimulationTelemetry,
  UserSettings,
} from './types';
import { DEFAULT_USER_SETTINGS, ENGINE_PROFILES } from './EngineProfiles';
import { CombustionSynth } from './CombustionSynth';
import { ExhaustSynth } from './ExhaustSynth';
import { TurboSynth } from './TurboSynth';
import { AudioProcessor } from './AudioProcessor';
import { AudioMixer } from './AudioMixer';

/**
 * Core Web Audio DSP Engine for the Ferrari Virtual Cockpit.
 * Manages one shared AudioContext, all 6 engine synthesis layers, sample crossfader,
 * startup ignition sequence, and master audio mixer.
 */
export class AudioEngine {
  private static instance: AudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private mixer: AudioMixer | null = null;
  private combustionSynth: CombustionSynth | null = null;
  private exhaustSynth: ExhaustSynth | null = null;
  private turboSynth: TurboSynth | null = null;
  private audioProcessor: AudioProcessor | null = null;

  private settings: UserSettings = { ...DEFAULT_USER_SETTINGS };
  private currentProfile: EngineProfile = ENGINE_PROFILES.v6_twin_turbo;
  private pendingAudioElement: HTMLAudioElement | null = null;
  private outputDeviceLabel = 'System Default Stereo Output';

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private constructor() {
    void this.detectAudioOutputDevice();
  }

  private async detectAudioOutputDevice(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const output = devices.find((d) => d.kind === 'audiooutput' && d.label);
        if (output?.label) {
          this.outputDeviceLabel = output.label;
        }
      }
    } catch {
      // Ignore permission/enumeration restrictions
    }
  }

  /**
   * Initializes and/or resumes the shared AudioContext upon explicit user interaction.
   */
  public async initAndResume(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.mixer = new AudioMixer(this.ctx, this.settings);
      this.combustionSynth = new CombustionSynth(this.ctx, this.currentProfile);
      this.exhaustSynth = new ExhaustSynth(this.ctx, this.currentProfile);
      this.turboSynth = new TurboSynth(this.ctx);
      this.audioProcessor = new AudioProcessor(this.ctx, this.currentProfile);
      this.audioProcessor.setSampleMode(this.settings.audioSampleMode);

      // Signal routing:
      // CombustionSynth (Layers 1, 3, 4) + AudioProcessor (Multi-zone loops) -> ExhaustSynth (Layers 2, 6) -> Mixer Engine Channel
      this.combustionSynth.output.connect(this.exhaustSynth.input);
      this.audioProcessor.output.connect(this.exhaustSynth.input);
      this.exhaustSynth.output.connect(this.mixer.engineInput);

      // TurboSynth (Layer 5) -> Mixer Engine Channel
      this.turboSynth.output.connect(this.mixer.engineInput);

      if (this.pendingAudioElement) {
        this.mixer.attachMediaElement(this.pendingAudioElement);
      }
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    void this.detectAudioOutputDevice();
    return this.ctx;
  }

  public attachMusicElement(audioElement: HTMLAudioElement): void {
    this.pendingAudioElement = audioElement;
    if (this.mixer) {
      this.mixer.attachMediaElement(audioElement);
    }
  }

  private startupMasterGain: GainNode | null = null;

  /**
   * Cancels any active starter cranking audio if the user stops the engine early.
   */
  public cancelStartupSound(): void {
    if (this.ctx && this.startupMasterGain) {
      const now = this.ctx.currentTime;
      try {
        this.startupMasterGain.gain.cancelScheduledValues(now);
        this.startupMasterGain.gain.setTargetAtTime(0, now, 0.02);
      } catch {
        // ignore
      }
      this.startupMasterGain = null;
    }
  }

  /**
   * Synthesizes a realistic multi-stage car ignition sequence (3.55s):
   * 1. Ignition relay click + fuel pump rail prime + starter solenoid bendix clack (0.00s - 0.42s)
   * 2. Six distinct starter motor compression chugs with armature pitch load dip (0.42s - 1.85s)
   * 3. Pre-catch cylinder coughs + explosive cold-start ignition bark flare (1.85s - 3.10s)
   */
  public async playStartupSound(profile: EngineProfile): Promise<void> {
    const ctx = await this.initAndResume();
    this.cancelStartupSound();

    const now = ctx.currentTime;
    const isCrossPlane = profile.crankConfiguration === 'CROSS_PLANE_V8';

    const seqMaster = ctx.createGain();
    seqMaster.gain.setValueAtTime(1.0, now);
    if (this.mixer) {
      seqMaster.connect(this.mixer.engineInput);
    }
    this.startupMasterGain = seqMaster;

    // =========================================================================
    // STAGE 1: Ignition Relay Click + Fuel Pump Prime + Solenoid Clack (0.00s - 0.42s)
    // =========================================================================
    const relayOsc = ctx.createOscillator();
    relayOsc.type = 'triangle';
    relayOsc.frequency.setValueAtTime(1750, now + 0.01);
    relayOsc.frequency.exponentialRampToValueAtTime(420, now + 0.035);
    const relayGain = ctx.createGain();
    relayGain.gain.setValueAtTime(0.001, now);
    relayGain.gain.linearRampToValueAtTime(0.18, now + 0.012);
    relayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    relayOsc.connect(relayGain);
    relayGain.connect(seqMaster);
    relayOsc.start(now + 0.01);
    relayOsc.stop(now + 0.045);

    // Electric high-pressure fuel pump prime hum
    const pumpOsc = ctx.createOscillator();
    pumpOsc.type = 'sine';
    pumpOsc.frequency.setValueAtTime(1280, now + 0.03);
    pumpOsc.frequency.linearRampToValueAtTime(1390, now + 0.38);
    const pumpGain = ctx.createGain();
    pumpGain.gain.setValueAtTime(0.0001, now);
    pumpGain.gain.linearRampToValueAtTime(0.045, now + 0.06);
    pumpGain.gain.setValueAtTime(0.045, now + 0.34);
    pumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    pumpOsc.connect(pumpGain);
    pumpGain.connect(seqMaster);
    pumpOsc.start(now + 0.03);
    pumpOsc.stop(now + 0.43);

    // Starter Bendix Solenoid Engagement Clack at t = 0.38s
    const solenoidOsc = ctx.createOscillator();
    solenoidOsc.type = 'square';
    solenoidOsc.frequency.setValueAtTime(340, now + 0.38);
    solenoidOsc.frequency.exponentialRampToValueAtTime(85, now + 0.425);
    const solenoidGain = ctx.createGain();
    solenoidGain.gain.setValueAtTime(0.0001, now + 0.375);
    solenoidGain.gain.linearRampToValueAtTime(0.32, now + 0.385);
    solenoidGain.gain.exponentialRampToValueAtTime(0.001, now + 0.43);
    solenoidOsc.connect(solenoidGain);
    solenoidGain.connect(seqMaster);
    solenoidOsc.start(now + 0.375);
    solenoidOsc.stop(now + 0.435);

    // =========================================================================
    // STAGE 2: Starter Motor Cranking — 6 Compression Strokes (0.42s - 1.85s)
    // =========================================================================
    const strokeTimes = [0.43, 0.67, 0.91, 1.14, 1.37, 1.60];
    const strokeDurations = [0.22, 0.22, 0.21, 0.21, 0.21, 0.22];

    // Continuous starter armature gear whine modulated by each cylinder compression stroke
    const starterGearOsc = ctx.createOscillator();
    starterGearOsc.type = 'sawtooth';
    const starterHarmOsc = ctx.createOscillator();
    starterHarmOsc.type = 'triangle';

    const baseWhineHz = isCrossPlane ? 148 : 188;
    starterGearOsc.frequency.setValueAtTime(baseWhineHz, now + 0.42);
    starterHarmOsc.frequency.setValueAtTime(baseWhineHz * 2.5, now + 0.42);

    const starterFilter = ctx.createBiquadFilter();
    starterFilter.type = 'bandpass';
    starterFilter.frequency.setValueAtTime(isCrossPlane ? 420 : 560, now + 0.42);
    starterFilter.Q.value = 2.2;

    const starterGain = ctx.createGain();
    starterGain.gain.setValueAtTime(0.0001, now);
    starterGain.gain.setValueAtTime(0.01, now + 0.42);

    for (let i = 0; i < strokeTimes.length; i++) {
      const tStart = now + strokeTimes[i];
      const dur = strokeDurations[i];
      const tPeak = tStart + dur * 0.52; // Top Dead Center (max compression drag)
      const tRelease = tStart + dur;
      // Cranking speeds up slightly on strokes 5 & 6 as cylinders begin assisting
      const speedUp = i >= 4 ? (i - 3) * 18 : 0;

      // Pitch dips at TDC compression and rises as piston passes TDC
      starterGearOsc.frequency.linearRampToValueAtTime(
        baseWhineHz - 36 + speedUp,
        tPeak
      );
      starterGearOsc.frequency.linearRampToValueAtTime(
        baseWhineHz + 24 + speedUp,
        tRelease
      );

      starterHarmOsc.frequency.linearRampToValueAtTime(
        (baseWhineHz - 36 + speedUp) * 2.5,
        tPeak
      );
      starterHarmOsc.frequency.linearRampToValueAtTime(
        (baseWhineHz + 24 + speedUp) * 2.5,
        tRelease
      );

      // Gain swells on each compression effort ("whirrr-UH, whirrr-UH")
      starterGain.gain.linearRampToValueAtTime(0.28, tPeak);
      starterGain.gain.linearRampToValueAtTime(0.11, tRelease);

      // Individual cylinder compression thud (piston compressing air in cylinder)
      const compOsc = ctx.createOscillator();
      compOsc.type = 'sine';
      compOsc.frequency.setValueAtTime(isCrossPlane ? 62 : 76, tStart);
      compOsc.frequency.linearRampToValueAtTime(
        isCrossPlane ? 92 : 112,
        tPeak
      );
      compOsc.frequency.exponentialRampToValueAtTime(48, tRelease);

      const compGain = ctx.createGain();
      compGain.gain.setValueAtTime(0.001, tStart);
      compGain.gain.linearRampToValueAtTime(0.36, tPeak);
      compGain.gain.exponentialRampToValueAtTime(0.005, tRelease);

      compOsc.connect(compGain);
      compGain.connect(seqMaster);
      compOsc.start(tStart);
      compOsc.stop(tRelease + 0.01);

      // Pre-catch weak combustion coughs on strokes 5 & 6 (1.37s and 1.60s)
      if (i >= 4) {
        const coughOsc = ctx.createOscillator();
        coughOsc.type = 'sawtooth';
        coughOsc.frequency.setValueAtTime(isCrossPlane ? 82 : 105, tPeak);
        coughOsc.frequency.exponentialRampToValueAtTime(55, tRelease + 0.04);

        const coughFilter = ctx.createBiquadFilter();
        coughFilter.type = 'lowpass';
        coughFilter.frequency.value = 380;

        const coughGain = ctx.createGain();
        coughGain.gain.setValueAtTime(0.001, tPeak);
        coughGain.gain.linearRampToValueAtTime(i === 5 ? 0.34 : 0.2, tPeak + 0.02);
        coughGain.gain.exponentialRampToValueAtTime(0.001, tRelease + 0.05);

        coughOsc.connect(coughFilter);
        coughFilter.connect(coughGain);
        coughGain.connect(seqMaster);
        coughOsc.start(tPeak);
        coughOsc.stop(tRelease + 0.06);
      }
    }

    starterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.92);

    const harmSubGain = ctx.createGain();
    harmSubGain.gain.value = 0.35;
    starterHarmOsc.connect(harmSubGain);
    harmSubGain.connect(starterFilter);
    starterGearOsc.connect(starterFilter);
    starterFilter.connect(starterGain);
    starterGain.connect(seqMaster);

    starterGearOsc.start(now + 0.42);
    starterHarmOsc.start(now + 0.42);
    starterGearOsc.stop(now + 1.94);
    starterHarmOsc.stop(now + 1.94);

    // =========================================================================
    // STAGE 3: Explosive Cold-Start Ignition Catch & Exhaust Bark (1.85s - 3.10s)
    // =========================================================================
    const catchTime = now + 1.84;

    // Deep sub-bass cylinder catch thump
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(98, catchTime);
    thumpOsc.frequency.exponentialRampToValueAtTime(38, catchTime + 0.26);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.001, catchTime);
    thumpGain.gain.linearRampToValueAtTime(0.55, catchTime + 0.025);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, catchTime + 0.28);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(seqMaster);
    thumpOsc.start(catchTime);
    thumpOsc.stop(catchTime + 0.3);

    // Aggressive cold-start exhaust bark flare
    const barkOsc = ctx.createOscillator();
    barkOsc.type = 'sawtooth';
    const baseFireFreq = ((profile.idleRpm + 1750) * profile.cylinders) / 120;
    barkOsc.frequency.setValueAtTime(
      baseFireFreq * (isCrossPlane ? 0.38 : 0.5),
      catchTime
    );
    barkOsc.frequency.exponentialRampToValueAtTime(
      baseFireFreq * (isCrossPlane ? 0.95 : 1.12),
      catchTime + 0.26
    );
    barkOsc.frequency.exponentialRampToValueAtTime(
      (profile.idleRpm * profile.cylinders) / 120,
      catchTime + 1.25
    );

    const barkFilter = ctx.createBiquadFilter();
    barkFilter.type = 'lowpass';
    barkFilter.frequency.setValueAtTime(isCrossPlane ? 1550 : 2100, catchTime);
    barkFilter.frequency.exponentialRampToValueAtTime(
      isCrossPlane ? 420 : 620,
      catchTime + 1.25
    );

    const barkGain = ctx.createGain();
    barkGain.gain.setValueAtTime(0.0001, now);
    barkGain.gain.setValueAtTime(0.001, catchTime);
    barkGain.gain.linearRampToValueAtTime(
      isCrossPlane ? 0.48 : 0.38,
      catchTime + 0.09
    );
    barkGain.gain.exponentialRampToValueAtTime(0.001, catchTime + 1.28);

    // Dual-pipe stereo spread on cold-start ignition bark
    const barkLeftPan = ctx.createStereoPanner();
    barkLeftPan.pan.value = -0.78;
    const barkRightDelay = ctx.createDelay(0.05);
    barkRightDelay.delayTime.value = 0.0085;
    const barkRightPan = ctx.createStereoPanner();
    barkRightPan.pan.value = 0.78;

    barkOsc.connect(barkFilter);
    barkFilter.connect(barkGain);
    barkGain.connect(barkLeftPan);
    barkLeftPan.connect(seqMaster);
    barkGain.connect(barkRightDelay);
    barkRightDelay.connect(barkRightPan);
    barkRightPan.connect(seqMaster);

    barkOsc.start(catchTime);
    barkOsc.stop(catchTime + 1.3);
  }

  public update(
    telemetry: SimulationTelemetry,
    profile: EngineProfile,
    settings: UserSettings
  ): void {
    this.currentProfile = profile;
    this.settings = settings;

    if (!this.ctx || this.ctx.state !== 'running') return;

    this.audioProcessor?.setSampleMode(settings.audioSampleMode);
    this.combustionSynth?.update(telemetry, profile);
    this.audioProcessor?.update(telemetry, profile);
    this.exhaustSynth?.update(telemetry, profile);
    this.turboSynth?.update(telemetry, profile, settings);
    this.mixer?.updateVolumes(settings);
    this.mixer?.updateDucking(telemetry, settings);
  }

  public updateSettings(settings: UserSettings): void {
    this.settings = settings;
    this.audioProcessor?.setSampleMode(settings.audioSampleMode);
    this.mixer?.updateVolumes(settings);
  }

  public getAnalysers(): {
    master: AnalyserNode | null;
    engine: AnalyserNode | null;
    music: AnalyserNode | null;
  } {
    return {
      master: this.mixer?.masterAnalyser ?? null,
      engine: this.mixer?.engineAnalyser ?? null,
      music: this.mixer?.musicAnalyser ?? null,
    };
  }

  public getStatus(): AudioSystemStatus {
    const levels = this.mixer?.getChannelLevels() ?? {
      engineLevel: 0,
      musicLevel: 0,
      masterLevelDb: -60,
    };

    const loadedCount = this.audioProcessor?.getLoadedSampleCount() ?? 0;
    const totalCount = this.audioProcessor?.getTotalSampleCount() ?? 9;
    const isExternalActive = this.audioProcessor?.isExternalHybridActive() ?? false;

    return {
      contextState: this.ctx ? this.ctx.state : 'uninitialized',
      sampleRate: this.ctx?.sampleRate ?? 48000,
      activeMode: isExternalActive ? 'SAMPLE + DSP HYBRID' : 'PROCEDURAL HYBRID DSP',
      loadedSampleCount: loadedCount,
      totalSampleCount: totalCount,
      outputDeviceLabel: this.outputDeviceLabel,
      masterLevelDb: levels.masterLevelDb,
      engineLevel: levels.engineLevel,
      musicLevel: levels.musicLevel,
      isDuckingActive: this.mixer?.getIsDuckingActive() ?? false,
    };
  }

  public dispose(): void {
    this.combustionSynth?.dispose();
    this.exhaustSynth?.dispose();
    this.turboSynth?.dispose();
    this.audioProcessor?.dispose();
    this.mixer?.dispose();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}

