import { EngineProfile, SimulationTelemetry, UserSettings } from './types';
import { setAudioParamSmooth } from '../utils/audioMath';
import { clamp, lerp } from '../utils/interpolation';

/**
 * LAYER 5: TURBOCHARGER SYNTHESIZER
 * - High-RPM compressor blade whistle (1.9 kHz – 7.0 kHz)
 * - High-pressure induction boost hiss ("desisan turbo" 1.8 kHz – 5.2 kHz)
 * - Signature pneumatic Blow-Off Valve ("PSSSHHH!") + Wastegate compressor surge flutter ("Stu-tu-tu")
 *   on throttle lift and gear upshifts.
 */
export class TurboSynth {
  private ctx: AudioContext;
  public readonly output: GainNode;

  private whistleOsc: OscillatorNode;
  private whistleHarmonicOsc: OscillatorNode;
  private whistleFilter: BiquadFilterNode;
  private whistleGain: GainNode;

  private airNoiseSource: AudioBufferSourceNode | null = null;
  private airBandpass: BiquadFilterNode;
  private hissShelf: BiquadFilterNode;
  private airGain: GainNode;

  private noiseBuffer: AudioBuffer;
  private lastBlowOffTrigger = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 1.15;

    this.noiseBuffer = this.createWhiteNoiseBuffer(ctx, 2.5);

    // 1. Compressor turbine blade whistle
    this.whistleOsc = ctx.createOscillator();
    this.whistleOsc.type = 'sine';
    this.whistleOsc.frequency.value = 2100;

    this.whistleHarmonicOsc = ctx.createOscillator();
    this.whistleHarmonicOsc.type = 'triangle';
    this.whistleHarmonicOsc.frequency.value = 3150;

    this.whistleFilter = ctx.createBiquadFilter();
    this.whistleFilter.type = 'bandpass';
    this.whistleFilter.frequency.value = 2800;
    this.whistleFilter.Q.value = 4.0;

    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;

    // Twin-Turbo Left & Right Stereo Turbine Separation
    const leftTurbinePan = ctx.createStereoPanner();
    leftTurbinePan.pan.value = -0.55;
    const rightTurbinePan = ctx.createStereoPanner();
    rightTurbinePan.pan.value = 0.55;

    this.whistleOsc.connect(leftTurbinePan);
    leftTurbinePan.connect(this.whistleFilter);
    this.whistleHarmonicOsc.connect(rightTurbinePan);
    rightTurbinePan.connect(this.whistleFilter);
    this.whistleFilter.connect(this.whistleGain);
    this.whistleGain.connect(this.output);

    // 2. Pressurized boost air hiss ("desisan khas turbo")
    this.airBandpass = ctx.createBiquadFilter();
    this.airBandpass.type = 'bandpass';
    this.airBandpass.frequency.value = 2400;
    this.airBandpass.Q.value = 1.25;

    this.hissShelf = ctx.createBiquadFilter();
    this.hissShelf.type = 'highshelf';
    this.hissShelf.frequency.value = 3600;
    this.hissShelf.gain.value = 9.5;

    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;

    this.airBandpass.connect(this.hissShelf);
    this.hissShelf.connect(this.airGain);
    this.airGain.connect(this.output);

    const now = ctx.currentTime;
    this.whistleOsc.start(now);
    this.whistleHarmonicOsc.start(now);
    this.startAirNoise();
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSeconds);
    // 2-channel uncorrelated stereo white noise for wide twin-turbo boost hiss
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.38;
      }
    }
    return buffer;
  }

  private startAirNoise(): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.connect(this.airBandpass);
    src.start();
    this.airNoiseSource = src;
  }

  public update(
    telemetry: SimulationTelemetry,
    _profile: EngineProfile,
    settings: UserSettings
  ): void {
    const now = this.ctx.currentTime;
    // Allow turbo hiss on any profile whenever settings.turboEnabled is true
    const isActive =
      settings.turboEnabled &&
      telemetry.engineState !== 'OFF' &&
      telemetry.rpm > 100;

    if (!isActive) {
      setAudioParamSmooth(this.whistleGain.gain, 0, now, 0.04);
      setAudioParamSmooth(this.airGain.gain, 0, now, 0.04);
      return;
    }

    const boost = clamp(telemetry.turboBoost, 0, 1);

    // Turbine pitch scales from 1,900 Hz to 6,800 Hz with boost
    const turbineFreq = lerp(1900, 6800, Math.pow(boost, 0.82));
    setAudioParamSmooth(this.whistleOsc.frequency, turbineFreq, now, 0.025);
    setAudioParamSmooth(this.whistleHarmonicOsc.frequency, turbineFreq * 1.48, now, 0.025);
    setAudioParamSmooth(this.whistleFilter.frequency, turbineFreq, now, 0.025);

    // Audible spool whistle & high-pressure induction hiss ("desisan turbo")
    const whistleLevel = Math.pow(boost, 1.15) * 0.16;
    const airHissLevel = Math.pow(boost, 0.95) * 0.34;

    setAudioParamSmooth(this.whistleGain.gain, whistleLevel, now, 0.03);
    setAudioParamSmooth(this.airBandpass.frequency, lerp(1600, 4400, boost), now, 0.03);
    setAudioParamSmooth(this.airGain.gain, airHissLevel, now, 0.03);

    // Blow-off valve / wastegate flutter when throttle is lifted or during upshift under boost
    if (telemetry.blowOffTrigger > this.lastBlowOffTrigger) {
      this.lastBlowOffTrigger = telemetry.blowOffTrigger;
      this.triggerBlowOff(Math.max(0.35, boost));
    }
  }

  /**
   * Synthesizes a dual-layer Turbo Blow-Off Valve ("PSSSHHH!" pneumatic hiss)
   * combined with Wastegate / Compressor Surge Flutter ("Stu-tu-tu").
   */
  public triggerBlowOff(boostIntensity: number): void {
    const now = this.ctx.currentTime;
    const intensity = clamp(boostIntensity, 0.25, 1.0);
    const duration = 0.38 + intensity * 0.26;

    // Layer A: Pneumatic BOV Hiss ("PSSSHHH!")
    const hissSrc = this.ctx.createBufferSource();
    hissSrc.buffer = this.noiseBuffer;
    hissSrc.loop = true;

    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.setValueAtTime(4800, now);
    hissFilter.frequency.exponentialRampToValueAtTime(1450, now + duration);
    hissFilter.Q.value = 1.8;

    const hissHigh = this.ctx.createBiquadFilter();
    hissHigh.type = 'highshelf';
    hissHigh.frequency.value = 3200;
    hissHigh.gain.value = 10;

    const hissGain = this.ctx.createGain();
    const hissPeak = clamp(intensity * 0.48, 0.16, 0.52);
    hissGain.gain.setValueAtTime(0.001, now);
    hissGain.gain.linearRampToValueAtTime(hissPeak, now + 0.018);
    hissGain.gain.exponentialRampToValueAtTime(hissPeak * 0.45, now + duration * 0.45);
    hissGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    const hissPanner = this.ctx.createStereoPanner();
    hissPanner.pan.value = -0.58;

    hissSrc.connect(hissFilter);
    hissFilter.connect(hissHigh);
    hissHigh.connect(hissGain);
    hissGain.connect(hissPanner);
    hissPanner.connect(this.output);

    hissSrc.start(now);
    hissSrc.stop(now + duration + 0.02);

    // Layer B: Compressor Surge Flutter ("Stu-tu-tu-tu") resonant whistle modulation (Right side)
    const flutterSrc = this.ctx.createBufferSource();
    flutterSrc.buffer = this.noiseBuffer;
    flutterSrc.loop = true;

    const flutterFilter = this.ctx.createBiquadFilter();
    flutterFilter.type = 'bandpass';
    flutterFilter.frequency.setValueAtTime(2900, now);
    flutterFilter.frequency.exponentialRampToValueAtTime(1150, now + duration);
    flutterFilter.Q.value = 4.2;

    const flutterGain = this.ctx.createGain();
    const flutterPeak = clamp(intensity * 0.36, 0.12, 0.38);
    flutterGain.gain.setValueAtTime(0.001, now);
    flutterGain.gain.linearRampToValueAtTime(flutterPeak, now + 0.02);

    const pulseCount = 5;
    const pulseStep = (duration - 0.03) / pulseCount;
    for (let i = 1; i <= pulseCount; i++) {
      const tValley = now + 0.02 + (i - 0.5) * pulseStep;
      const tPeak = now + 0.02 + i * pulseStep;
      const decayFactor = Math.pow(0.64, i);
      flutterGain.gain.linearRampToValueAtTime(flutterPeak * decayFactor * 0.22, tValley);
      flutterGain.gain.linearRampToValueAtTime(flutterPeak * decayFactor, tPeak);
    }
    flutterGain.gain.exponentialRampToValueAtTime(0.0005, now + duration);

    const flutterPanner = this.ctx.createStereoPanner();
    flutterPanner.pan.value = 0.62;

    flutterSrc.connect(flutterFilter);
    flutterFilter.connect(flutterGain);
    flutterGain.connect(flutterPanner);
    flutterPanner.connect(this.output);

    flutterSrc.start(now);
    flutterSrc.stop(now + duration + 0.02);
  }

  public dispose(): void {
    try {
      this.whistleOsc.stop();
      this.whistleHarmonicOsc.stop();
      this.airNoiseSource?.stop();
    } catch {
      // ignore
    }
    this.output.disconnect();
  }
}
