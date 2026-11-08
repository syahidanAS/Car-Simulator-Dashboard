import {
  AudioSampleMode,
  EngineProfile,
  SimulationTelemetry,
} from './types';
import { computeRpmZoneWeights, setAudioParamSmooth } from '../utils/audioMath';
import { clamp } from '../utils/interpolation';

const SAMPLE_FILES = {
  idle: '/audio/engine/idle.wav',
  low: '/audio/engine/low-rpm.wav',
  mid: '/audio/engine/mid-rpm.wav',
  high: '/audio/engine/high-rpm.wav',
  acceleration: '/audio/engine/acceleration.wav',
  deceleration: '/audio/engine/deceleration.wav',
  engineBraking: '/audio/engine/engine-braking.wav',
  turboSpool: '/audio/engine/turbo-spool.wav',
  turboBlowoff: '/audio/engine/turbo-blowoff.wav',
} as const;

type SampleKey = keyof typeof SAMPLE_FILES;

interface ZoneLoopNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
  baseRpm: number;
}

/**
 * Multi-zone RPM crossfading sample & procedural wavetable loop processor.
 * Attempts to load `/audio/engine/*.wav` assets and provides procedural multi-harmonic
 * AudioBuffer fallback when files are absent or when Procedural Mode is selected.
 */
export class AudioProcessor {
  private ctx: AudioContext;
  public readonly output: GainNode;

  private externalBuffers: Partial<Record<SampleKey, AudioBuffer>> = {};
  private proceduralBuffers: Record<'idle' | 'low' | 'mid' | 'high', AudioBuffer>;

  private zoneNodes: Record<'idle' | 'low' | 'mid' | 'high', ZoneLoopNode> | null = null;
  private sampleMode: AudioSampleMode = 'hybrid';
  private loadedExternalCount = 0;
  private isLoading = false;
  private currentProfileId = '';

  constructor(ctx: AudioContext, initialProfile: EngineProfile) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.55;
    this.currentProfileId = initialProfile.id;

    this.proceduralBuffers = this.buildProfileBuffers(initialProfile);

    this.startZoneLoops(initialProfile);
    void this.tryLoadExternalSamples();
  }

  private buildProfileBuffers(
    profile: EngineProfile
  ): Record<'idle' | 'low' | 'mid' | 'high', AudioBuffer> {
    const isCrossPlane = profile.crankConfiguration === 'CROSS_PLANE_V8';
    return {
      idle: this.synthesizeZoneBuffer(
        this.ctx,
        profile.idleRpm,
        profile.cylinders,
        0.35,
        isCrossPlane
      ),
      low: this.synthesizeZoneBuffer(
        this.ctx,
        2400,
        profile.cylinders,
        0.5,
        isCrossPlane
      ),
      mid: this.synthesizeZoneBuffer(
        this.ctx,
        4800,
        profile.cylinders,
        0.72,
        isCrossPlane
      ),
      high: this.synthesizeZoneBuffer(
        this.ctx,
        profile.redlineRpm - 500,
        profile.cylinders,
        0.95,
        isCrossPlane
      ),
    };
  }

  /**
   * Generates a seamless multi-cycle combustion pulse-train buffer for a given RPM zone
   * so crossfading between zones works identically whether external WAVs exist or not.
   */
  private synthesizeZoneBuffer(
    ctx: AudioContext,
    baseRpm: number,
    cylinders: number,
    brightness: number,
    isCrossPlane = false
  ): AudioBuffer {
    const firingFreq = (baseRpm * cylinders) / 120;
    const cycles = Math.max(16, Math.round(firingFreq * 1.5));
    const duration = cycles / firingFreq;
    const length = Math.max(512, Math.floor(ctx.sampleRate * duration));
    // 2-channel true stereo buffer modeling Left & Right cylinder banks
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    const dataL = buffer.getChannelData(0);
    const dataR = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const phase = t * firingFreq * Math.PI * 2;
      const crankPhase = phase / (cylinders / 2);

      if (isCrossPlane) {
        // Cross-Plane V8 (Mustang GT 5.0L Coyote) uneven bank pulse pairing (L vs R banks)
        const bankPairingL =
          0.68 +
          0.34 * Math.sin(crankPhase) +
          0.24 * Math.cos(crankPhase * 0.5) +
          0.18 * Math.sin(crankPhase * 1.5 + 0.6);
        const bankPairingR =
          0.68 -
          0.34 * Math.sin(crankPhase) +
          0.24 * Math.sin(crankPhase * 0.5 + 0.4) +
          0.18 * Math.cos(crankPhase * 1.5 + 0.6);

        const subRumble =
          Math.sin(crankPhase) * 0.52 +
          Math.sin(crankPhase * 1.5 + 0.3) * 0.38 +
          Math.sin(crankPhase * 2.0 + 0.7) * 0.44;

        const h1L = Math.sin(phase) * 0.95;
        const h2L = Math.sin(phase * 2 + 0.35) * (0.62 + brightness * 0.25);
        const h3L = Math.sin(phase * 3 + 0.75) * (0.45 + brightness * 0.32);
        const h4L = Math.sin(phase * 4 + 1.05) * (0.28 + brightness * 0.28);

        const h1R = Math.sin(phase + 0.42) * 0.95;
        const h2R = Math.sin(phase * 2 + 1.15) * (0.62 + brightness * 0.25);
        const h3R = Math.sin(phase * 3 + 1.65) * (0.45 + brightness * 0.32);
        const h4R = Math.sin(phase * 4 + 2.05) * (0.28 + brightness * 0.28);

        dataL[i] =
          Math.tanh(((h1L + h2L + h3L + h4L) * bankPairingL + subRumble) * 0.72) * 0.55;
        dataR[i] =
          Math.tanh(((h1R + h2R + h3R + h4R) * bankPairingR + subRumble) * 0.72) * 0.55;
      } else {
        // Multi-harmonic stereo acoustic pulse with L/R bank phase separation
        const cylModL =
          0.82 + 0.18 * Math.sin(crankPhase) + 0.08 * Math.cos(crankPhase * 2);
        const cylModR =
          0.82 - 0.18 * Math.sin(crankPhase) + 0.08 * Math.sin(crankPhase * 2);

        const h1L = Math.sin(phase);
        const h2L = Math.sin(phase * 2 + 0.4) * (0.55 + brightness * 0.2);
        const h3L = Math.sin(phase * 3 + 0.8) * (0.4 + brightness * 0.35);
        const h4L = Math.sin(phase * 4 + 1.1) * (0.22 + brightness * 0.25);
        const h6L = Math.sin(phase * 6 + 0.3) * (0.18 + brightness * 0.38);

        const h1R = Math.sin(phase + 0.38);
        const h2R = Math.sin(phase * 2 + 1.05) * (0.55 + brightness * 0.2);
        const h3R = Math.sin(phase * 3 + 1.55) * (0.4 + brightness * 0.35);
        const h4R = Math.sin(phase * 4 + 1.95) * (0.22 + brightness * 0.25);
        const h6R = Math.sin(phase * 6 + 1.1) * (0.18 + brightness * 0.38);

        dataL[i] = Math.tanh((h1L + h2L + h3L + h4L + h6L) * cylModL * 0.65) * 0.5;
        dataR[i] = Math.tanh((h1R + h2R + h3R + h4R + h6R) * cylModR * 0.65) * 0.5;
      }
    }

    return buffer;
  }

  public async tryLoadExternalSamples(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    let count = 0;

    const entries = Object.entries(SAMPLE_FILES) as [SampleKey, string][];
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) return;
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html')) return;
          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength < 256) return;
          const decoded = await this.ctx.decodeAudioData(arrayBuffer);
          this.externalBuffers[key] = decoded;
          count += 1;
        } catch {
          // File unavailable; procedural buffer remains active
        }
      })
    );

    this.loadedExternalCount = count;
    this.isLoading = false;

    if (count > 0 && this.sampleMode === 'hybrid') {
      this.restartZoneLoops();
    }
  }

  private getActiveBuffer(zone: 'idle' | 'low' | 'mid' | 'high'): AudioBuffer {
    if (this.sampleMode === 'hybrid' && this.externalBuffers[zone]) {
      return this.externalBuffers[zone]!;
    }
    return this.proceduralBuffers[zone];
  }

  private startZoneLoops(profile?: EngineProfile): void {
    this.stopZoneLoops();

    const idleBase = profile?.idleRpm ?? 900;
    const highBase = profile ? profile.redlineRpm - 500 : 7800;

    const createZone = (
      zone: 'idle' | 'low' | 'mid' | 'high',
      baseRpm: number
    ): ZoneLoopNode => {
      const source = this.ctx.createBufferSource();
      source.buffer = this.getActiveBuffer(zone);
      source.loop = true;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      source.connect(gain);
      gain.connect(this.output);
      source.start();

      return { source, gain, baseRpm };
    };

    this.zoneNodes = {
      idle: createZone('idle', idleBase),
      low: createZone('low', 2400),
      mid: createZone('mid', 4800),
      high: createZone('high', highBase),
    };
  }

  private stopZoneLoops(): void {
    if (!this.zoneNodes) return;
    Object.values(this.zoneNodes).forEach((node) => {
      try {
        node.source.stop();
        node.source.disconnect();
        node.gain.disconnect();
      } catch {
        // ignore
      }
    });
    this.zoneNodes = null;
  }

  public restartZoneLoops(profile?: EngineProfile): void {
    this.startZoneLoops(profile);
  }

  public setSampleMode(mode: AudioSampleMode): void {
    if (this.sampleMode === mode) return;
    this.sampleMode = mode;
    this.restartZoneLoops();
  }

  public getLoadedSampleCount(): number {
    return this.loadedExternalCount;
  }

  public getTotalSampleCount(): number {
    return Object.keys(SAMPLE_FILES).length;
  }

  public isExternalHybridActive(): boolean {
    return this.sampleMode === 'hybrid' && this.loadedExternalCount > 0;
  }

  public update(telemetry: SimulationTelemetry, profile: EngineProfile): void {
    if (this.currentProfileId !== profile.id) {
      this.currentProfileId = profile.id;
      this.proceduralBuffers = this.buildProfileBuffers(profile);
      this.restartZoneLoops(profile);
    }

    if (!this.zoneNodes) return;
    const now = this.ctx.currentTime;

    if (
      (telemetry.engineState === 'OFF' && telemetry.rpm < 20) ||
      (telemetry.engineState === 'STARTING' && !telemetry.combustionActive)
    ) {
      setAudioParamSmooth(this.zoneNodes.idle.gain.gain, 0, now, 0.04);
      setAudioParamSmooth(this.zoneNodes.low.gain.gain, 0, now, 0.04);
      setAudioParamSmooth(this.zoneNodes.mid.gain.gain, 0, now, 0.04);
      setAudioParamSmooth(this.zoneNodes.high.gain.gain, 0, now, 0.04);
      return;
    }

    const rpm = Math.max(250, telemetry.rpm);
    const weights = computeRpmZoneWeights(rpm, profile.idleRpm, profile.maxRpm);
    const loadBoost = 0.65 + telemetry.effectiveThrottle * 0.35;

    const zones: ('idle' | 'low' | 'mid' | 'high')[] = ['idle', 'low', 'mid', 'high'];
    for (const key of zones) {
      const node = this.zoneNodes[key];
      const rate = clamp(rpm / node.baseRpm, 0.35, 2.4);
      setAudioParamSmooth(node.source.playbackRate, rate, now, 0.02);
      setAudioParamSmooth(node.gain.gain, weights[key] * loadBoost * 0.45, now, 0.025);
    }
  }

  public dispose(): void {
    this.stopZoneLoops();
    this.output.disconnect();
  }
}
