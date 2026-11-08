import { SimulationTelemetry, UserSettings } from './types';
import { gainToDb, setAudioParamSmooth } from '../utils/audioMath';
import { clamp, inverseLerp } from '../utils/interpolation';

const mediaElementSourceCache = new WeakMap<
  HTMLMediaElement,
  MediaElementAudioSourceNode
>();

/**
 * Shared Audio Mixing Console:
 * - Engine Channel (with Engine Gain + Engine Analyser)
 * - Music Channel (with MediaElementAudioSourceNode + Music Gain + Ducking Gain + Music Analyser)
 * - Master Bus (Master Gain -> DynamicsCompressorNode -> Master Analyser -> Destination)
 */
export class AudioMixer {
  private ctx: AudioContext;

  public readonly engineInput: GainNode;
  private engineGain: GainNode;
  public readonly engineAnalyser: AnalyserNode;

  private musicGain: GainNode;
  private musicDuckingGain: GainNode;
  public readonly musicAnalyser: AnalyserNode;

  private masterGain: GainNode;
  private compressor: DynamicsCompressorNode;
  public readonly masterAnalyser: AnalyserNode;

  private engineTimeData: Float32Array;
  private musicTimeData: Float32Array;
  private masterTimeData: Float32Array;

  private isDuckingActive = false;

  constructor(ctx: AudioContext, initialSettings: UserSettings) {
    this.ctx = ctx;

    // 1. Engine Channel
    this.engineInput = ctx.createGain();
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = initialSettings.engineVolume;

    this.engineAnalyser = ctx.createAnalyser();
    this.engineAnalyser.fftSize = 512;
    this.engineAnalyser.smoothingTimeConstant = 0.8;

    // 2. Music Channel
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = initialSettings.musicVolume;

    this.musicDuckingGain = ctx.createGain();
    this.musicDuckingGain.gain.value = 1.0;

    this.musicAnalyser = ctx.createAnalyser();
    this.musicAnalyser.fftSize = 512;
    this.musicAnalyser.smoothingTimeConstant = 0.8;

    // 3. Master Bus & Dynamics Compressor (prevents clipping)
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = initialSettings.masterVolume;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.masterAnalyser.smoothingTimeConstant = 0.82;

    // Wire Engine Channel -> Wide Stereo Spatializer -> Engine Gain -> Master
    this.engineInput.connect(this.engineGain);

    // High-pass (> 165 Hz) Cross-Bank Stereo Widener & Cockpit Early Reflections
    const widenerHp = ctx.createBiquadFilter();
    widenerHp.type = 'highpass';
    widenerHp.frequency.value = 165;

    const splitter = ctx.createChannelSplitter(2);
    const leftDelay = ctx.createDelay(0.05);
    leftDelay.delayTime.value = 0.0074; // 7.4ms Haas reflection
    const rightDelay = ctx.createDelay(0.05);
    rightDelay.delayTime.value = 0.0132; // 13.2ms Haas reflection

    const wideLeftPan = ctx.createStereoPanner();
    wideLeftPan.pan.value = -0.95;
    const wideRightPan = ctx.createStereoPanner();
    wideRightPan.pan.value = 0.95;

    const widenerGain = ctx.createGain();
    widenerGain.gain.value = 0.34;

    this.engineInput.connect(widenerHp);
    widenerHp.connect(splitter);
    // Cross-feed L->R and R->L with Haas delay for ultra-wide 3D stereo cockpit stage
    splitter.connect(leftDelay, 0);
    splitter.connect(rightDelay, 1);
    leftDelay.connect(wideRightPan);
    rightDelay.connect(wideLeftPan);
    wideLeftPan.connect(widenerGain);
    wideRightPan.connect(widenerGain);
    widenerGain.connect(this.engineGain);

    this.engineGain.connect(this.engineAnalyser);
    this.engineAnalyser.connect(this.masterGain);

    // Wire Music Channel -> Ducking -> Music Analyser -> Master
    this.musicGain.connect(this.musicDuckingGain);
    this.musicDuckingGain.connect(this.musicAnalyser);
    this.musicAnalyser.connect(this.masterGain);

    // Wire Master -> Compressor -> Master Analyser -> Destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);

    this.engineTimeData = new Float32Array(this.engineAnalyser.fftSize);
    this.musicTimeData = new Float32Array(this.musicAnalyser.fftSize);
    this.masterTimeData = new Float32Array(this.masterAnalyser.fftSize);
  }

  /**
   * Connects an HTMLAudioElement to the Music Channel safely,
   * preventing duplicate MediaElementAudioSourceNode creation.
   */
  public attachMediaElement(audioElement: HTMLAudioElement): void {
    let sourceNode = mediaElementSourceCache.get(audioElement);
    if (!sourceNode) {
      sourceNode = this.ctx.createMediaElementSource(audioElement);
      mediaElementSourceCache.set(audioElement, sourceNode);
    }
    try {
      sourceNode.disconnect();
    } catch {
      // ignore
    }
    sourceNode.connect(this.musicGain);
  }

  public updateVolumes(settings: UserSettings): void {
    const now = this.ctx.currentTime;
    setAudioParamSmooth(this.masterGain.gain, clamp(settings.masterVolume, 0, 1), now, 0.03);
    setAudioParamSmooth(this.engineGain.gain, clamp(settings.engineVolume, 0, 1), now, 0.03);
    setAudioParamSmooth(this.musicGain.gain, clamp(settings.musicVolume, 0, 1), now, 0.03);
  }

  /**
   * Updates real-time audio ducking of the music channel during high RPM / high throttle / rev limiter.
   */
  public updateDucking(telemetry: SimulationTelemetry, settings: UserSettings): void {
    const now = this.ctx.currentTime;

    if (!settings.audioDuckingEnabled || telemetry.engineState === 'OFF') {
      this.isDuckingActive = false;
      setAudioParamSmooth(this.musicDuckingGain.gain, 1.0, now, 0.25);
      return;
    }

    const highRpmFactor = inverseLerp(
      settings.redlineRpm * 0.55,
      settings.redlineRpm,
      telemetry.rpm
    );
    const throttleFactor = telemetry.effectiveThrottle * 0.45;
    const limiterBoost = telemetry.isRevLimiter ? 0.35 : 0;

    const duckDemand = clamp(highRpmFactor * 0.75 + throttleFactor + limiterBoost, 0, 1);
    const attenuation = duckDemand * clamp(settings.audioDuckingIntensity, 0, 0.85);

    this.isDuckingActive = attenuation > 0.08;
    const targetDuckGain = clamp(1.0 - attenuation, 0.15, 1.0);

    // Fast attack (70ms), smooth release (280ms)
    const timeConstant = targetDuckGain < this.musicDuckingGain.gain.value ? 0.07 : 0.28;
    setAudioParamSmooth(this.musicDuckingGain.gain, targetDuckGain, now, timeConstant);
  }

  public getIsDuckingActive(): boolean {
    return this.isDuckingActive;
  }

  private computeRms(analyser: AnalyserNode, buffer: Float32Array): number {
    analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>);
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i];
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / buffer.length);
  }

  public getChannelLevels(): {
    engineLevel: number;
    musicLevel: number;
    masterLevelDb: number;
  } {
    if (this.ctx.state !== 'running') {
      return { engineLevel: 0, musicLevel: 0, masterLevelDb: -60 };
    }
    const engineRms = this.computeRms(this.engineAnalyser, this.engineTimeData);
    const musicRms = this.computeRms(this.musicAnalyser, this.musicTimeData);
    const masterRms = this.computeRms(this.masterAnalyser, this.masterTimeData);

    return {
      engineLevel: clamp(engineRms * 2.8, 0, 1),
      musicLevel: clamp(musicRms * 2.5, 0, 1),
      masterLevelDb: clamp(gainToDb(masterRms), -60, 0),
    };
  }

  public dispose(): void {
    try {
      this.engineInput.disconnect();
      this.engineGain.disconnect();
      this.musicGain.disconnect();
      this.musicDuckingGain.disconnect();
      this.masterGain.disconnect();
      this.compressor.disconnect();
      this.masterAnalyser.disconnect();
    } catch {
      // ignore
    }
  }
}

