import { EngineProfile, SimulationTelemetry } from './types';
import { setAudioParamSmooth } from '../utils/audioMath';
import { clamp, inverseLerp } from '../utils/interpolation';

/**
 * Handles:
 * - LAYER 2: Exhaust acoustic body, dual tuned manifold resonators, H-pipe/X-pipe sub-bass, and metallic harmonic saturation
 * - LAYER 6: Engine braking vacuum overrun resonance + stochastic overrun exhaust crackle/gurgle generator
 */
export class ExhaustSynth {
  private ctx: AudioContext;
  public readonly input: GainNode;
  public readonly output: GainNode;

  // Layer 2: Exhaust resonator filter bank
  private lowBodyFilter: BiquadFilterNode;
  private formant1Filter: BiquadFilterNode;
  private formant2Filter: BiquadFilterNode;
  private highRaspFilter: BiquadFilterNode;
  private waveShaper: WaveShaperNode;
  private exhaustBodyGain: GainNode;

  // True Stereo Dual-Exit Quad Exhaust Stage (Left Pipe -0.82 / Right Pipe +0.82 + Center H-Pipe Sub)
  private subCenterFilter: BiquadFilterNode;
  private leftPipeDelay: DelayNode;
  private rightPipeDelay: DelayNode;
  private leftPipeResonator: BiquadFilterNode;
  private rightPipeResonator: BiquadFilterNode;
  private leftPipePanner: StereoPannerNode;
  private rightPipePanner: StereoPannerNode;
  private stereoModLfo: OscillatorNode;
  private stereoModDepth: GainNode;

  // Layer 6: Engine braking vacuum resonance & overrun burble
  private brakingOsc: OscillatorNode;
  private brakingFilter: BiquadFilterNode;
  private brakingLayerGain: GainNode;

  private lastPopTrigger = 0;
  private currentDrive = -1;

  constructor(ctx: AudioContext, initialProfile: EngineProfile) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Low-frequency exhaust body
    this.lowBodyFilter = ctx.createBiquadFilter();
    this.lowBodyFilter.type = 'lowshelf';
    this.lowBodyFilter.frequency.value = initialProfile.exhaustFormants[0];
    this.lowBodyFilter.gain.value = 6.5;

    // Mid-frequency exhaust resonance 1
    this.formant1Filter = ctx.createBiquadFilter();
    this.formant1Filter.type = 'peaking';
    this.formant1Filter.frequency.value = initialProfile.exhaustFormants[1];
    this.formant1Filter.Q.value = 2.4;
    this.formant1Filter.gain.value = 7.0;

    // Mid-frequency exhaust resonance 2
    this.formant2Filter = ctx.createBiquadFilter();
    this.formant2Filter.type = 'peaking';
    this.formant2Filter.frequency.value = initialProfile.exhaustFormants[2];
    this.formant2Filter.Q.value = 2.8;
    this.formant2Filter.gain.value = 5.5;

    // High-frequency metallic rasp
    this.highRaspFilter = ctx.createBiquadFilter();
    this.highRaspFilter.type = 'peaking';
    this.highRaspFilter.frequency.value = initialProfile.exhaustFormants[3];
    this.highRaspFilter.Q.value = 2.0;
    this.highRaspFilter.gain.value = 4.0;

    // Non-linear waveshaper for metallic exhaust bark
    this.waveShaper = ctx.createWaveShaper();
    this.waveShaper.oversample = '2x';
    this.updateDistortionCurve(initialProfile.exhaustDrive);

    this.exhaustBodyGain = ctx.createGain();
    this.exhaustBodyGain.gain.value = 0.85;

    // --- DUAL-EXIT QUAD EXHAUST WIDE STEREO IMAGING ---
    // 1. Center H-Pipe Sub-Bass Crossover (< 130 Hz stays anchored in center)
    this.subCenterFilter = ctx.createBiquadFilter();
    this.subCenterFilter.type = 'lowpass';
    this.subCenterFilter.frequency.value = 130;
    this.subCenterFilter.Q.value = 0.8;

    // 2. Left Tailpipe (-0.82 pan, 4.2ms acoustic path length)
    this.leftPipeDelay = ctx.createDelay(0.05);
    this.leftPipeDelay.delayTime.value = 0.0042;
    this.leftPipeResonator = ctx.createBiquadFilter();
    this.leftPipeResonator.type = 'peaking';
    this.leftPipeResonator.frequency.value = initialProfile.exhaustFormants[1] * 0.94;
    this.leftPipeResonator.Q.value = 2.0;
    this.leftPipeResonator.gain.value = 4.5;
    this.leftPipePanner = ctx.createStereoPanner();
    this.leftPipePanner.pan.value = -0.82;

    // 3. Right Tailpipe (+0.82 pan, 12.6ms Haas acoustic path + turbulence LFO)
    this.rightPipeDelay = ctx.createDelay(0.05);
    this.rightPipeDelay.delayTime.value = 0.0126;
    this.rightPipeResonator = ctx.createBiquadFilter();
    this.rightPipeResonator.type = 'peaking';
    this.rightPipeResonator.frequency.value = initialProfile.exhaustFormants[1] * 1.07;
    this.rightPipeResonator.Q.value = 2.0;
    this.rightPipeResonator.gain.value = 4.5;
    this.rightPipePanner = ctx.createStereoPanner();
    this.rightPipePanner.pan.value = 0.82;

    // Subtle exhaust gas turbulence LFO modulating inter-pipe phase
    this.stereoModLfo = ctx.createOscillator();
    this.stereoModLfo.type = 'sine';
    this.stereoModLfo.frequency.value = 2.4;
    this.stereoModDepth = ctx.createGain();
    this.stereoModDepth.gain.value = 0.0009;
    this.stereoModLfo.connect(this.stereoModDepth);
    this.stereoModDepth.connect(this.rightPipeDelay.delayTime);
    this.stereoModLfo.start(ctx.currentTime);

    // Connect Layer 2 chain -> Dual Stereo Quad Exhaust Stage
    this.input.connect(this.lowBodyFilter);
    this.lowBodyFilter.connect(this.formant1Filter);
    this.formant1Filter.connect(this.formant2Filter);
    this.formant2Filter.connect(this.waveShaper);
    this.waveShaper.connect(this.highRaspFilter);
    this.highRaspFilter.connect(this.exhaustBodyGain);

    // Split True Stereo Left Bank (Ch 0) & Right Bank (Ch 1) into Left & Right Quad Tailpipes
    const bankSplitter = ctx.createChannelSplitter(2);
    this.exhaustBodyGain.connect(bankSplitter);

    // Center H-Pipe Sub-Bass Crossover (< 130 Hz stays anchored in center)
    this.exhaustBodyGain.connect(this.subCenterFilter);
    this.subCenterFilter.connect(this.output);

    // Left Bank (Ch 0) -> Left Tailpipe Delay & Resonator -> Left Pan (-0.88)
    bankSplitter.connect(this.leftPipeDelay, 0);
    this.leftPipeDelay.connect(this.leftPipeResonator);
    this.leftPipeResonator.connect(this.leftPipePanner);
    this.leftPipePanner.connect(this.output);

    // Right Bank (Ch 1) -> Right Tailpipe Delay & Resonator -> Right Pan (+0.88)
    bankSplitter.connect(this.rightPipeDelay, 1);
    this.rightPipeDelay.connect(this.rightPipeResonator);
    this.rightPipeResonator.connect(this.rightPipePanner);
    this.rightPipePanner.connect(this.output);

    // --- LAYER 6: ENGINE BRAKING OVERRUN ---
    this.brakingOsc = ctx.createOscillator();
    this.brakingOsc.type = 'sawtooth';
    this.brakingOsc.frequency.value = 75;

    this.brakingFilter = ctx.createBiquadFilter();
    this.brakingFilter.type = 'bandpass';
    this.brakingFilter.frequency.value = 195;
    this.brakingFilter.Q.value = 1.9;

    this.brakingLayerGain = ctx.createGain();
    this.brakingLayerGain.gain.value = 0;

    this.brakingOsc.connect(this.brakingFilter);
    this.brakingFilter.connect(this.brakingLayerGain);
    this.brakingLayerGain.connect(this.output);

    this.brakingOsc.start(ctx.currentTime);
  }

  private updateDistortionCurve(drive: number): void {
    if (Math.abs(this.currentDrive - drive) < 0.05) return;
    this.currentDrive = drive;

    const samples = 2048;
    const curve = new Float32Array(samples);
    const k = clamp(drive, 1, 12);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Asymmetric tube/manifold saturation for rich even + odd harmonics
      const shifted = x + 0.11 * x * x;
      curve[i] = Math.tanh(shifted * k) / Math.tanh(k);
    }
    this.waveShaper.curve = curve;
  }

  public update(telemetry: SimulationTelemetry, profile: EngineProfile): void {
    const now = this.ctx.currentTime;
    this.updateDistortionCurve(profile.exhaustDrive);

    if (telemetry.engineState === 'OFF' && telemetry.rpm < 20) {
      setAudioParamSmooth(this.exhaustBodyGain.gain, 0, now, 0.05);
      setAudioParamSmooth(this.brakingLayerGain.gain, 0, now, 0.05);
      return;
    }

    const rpm = Math.max(120, telemetry.rpm);
    const normRpm = inverseLerp(profile.idleRpm, profile.maxRpm, rpm);
    const throttle = telemetry.effectiveThrottle;
    const braking = telemetry.engineBrakingIntensity;
    const isCrossPlane = profile.crankConfiguration === 'CROSS_PLANE_V8';

    const [lowHz, mid1Hz, mid2Hz, highHz] = profile.exhaustFormants;

    // Boost low-shelf chest rumble for Cross-Plane V8 (Mustang GT 5.0L H-pipe / X-pipe)
    const lowShelfGain = isCrossPlane
      ? 9.5 + (1 - normRpm * 0.4) * 3.0
      : 5.5 + profile.subBassLevel * 3.0;
    setAudioParamSmooth(this.lowBodyFilter.gain, lowShelfGain, now, 0.03);

    // Shift exhaust formants dynamically with RPM and exhaust gas velocity
    setAudioParamSmooth(
      this.lowBodyFilter.frequency,
      lowHz * (0.88 + normRpm * 0.45),
      now,
      0.025
    );
    setAudioParamSmooth(
      this.formant1Filter.frequency,
      mid1Hz * (0.85 + normRpm * 0.65),
      now,
      0.025
    );
    setAudioParamSmooth(
      this.formant1Filter.gain,
      isCrossPlane ? 8.8 : 7.0,
      now,
      0.03
    );
    setAudioParamSmooth(
      this.formant2Filter.frequency,
      mid2Hz * (0.82 + normRpm * 0.85),
      now,
      0.025
    );
    setAudioParamSmooth(
      this.highRaspFilter.frequency,
      highHz * (0.8 + normRpm * 0.6),
      now,
      0.025
    );

    // Exhaust valve opening effect: Mustang GT Active Quad Exhaust opens wide above 3200 RPM or high throttle
    const valveOpen = clamp(normRpm * 1.15 + throttle * 0.75, 0, 1);
    setAudioParamSmooth(
      this.highRaspFilter.gain,
      (isCrossPlane ? 3.2 : 2.0) + valveOpen * 8.0 - braking * 2.5,
      now,
      0.03
    );

    // Dynamically sweep Left & Right Quad Tailpipe resonators & widen stereo image with valve opening
    setAudioParamSmooth(
      this.leftPipeResonator.frequency,
      mid1Hz * 0.91 * (0.85 + normRpm * 0.65),
      now,
      0.025
    );
    setAudioParamSmooth(
      this.rightPipeResonator.frequency,
      mid1Hz * 1.09 * (0.85 + normRpm * 0.65),
      now,
      0.025
    );
    const stereoWidth = clamp(0.8 + valveOpen * 0.16, 0.78, 0.96);
    setAudioParamSmooth(this.leftPipePanner.pan, -stereoWidth, now, 0.03);
    setAudioParamSmooth(this.rightPipePanner.pan, stereoWidth, now, 0.03);

    const exhaustLevel = clamp(
      (isCrossPlane ? 0.62 : 0.55) + throttle * 0.35 + normRpm * 0.25,
      0.25,
      1.0
    );
    setAudioParamSmooth(this.exhaustBodyGain.gain, exhaustLevel, now, 0.02);

    // Layer 6: Engine braking deep vacuum resonance
    const firingFreq = (rpm * profile.cylinders) / 120;
    setAudioParamSmooth(
      this.brakingOsc.frequency,
      isCrossPlane ? firingFreq * 0.25 : firingFreq * 0.5,
      now,
      0.02
    );
    setAudioParamSmooth(
      this.brakingFilter.frequency,
      isCrossPlane
        ? clamp(105 + normRpm * 210, 95, 340)
        : clamp(140 + normRpm * 290, 120, 480),
      now,
      0.03
    );
    setAudioParamSmooth(
      this.brakingLayerGain.gain,
      braking * (isCrossPlane ? 0.42 : 0.32),
      now,
      0.03
    );

    // Trigger overrun exhaust burble / shift crackle transient when signaled by simulation
    if (telemetry.exhaustPopTrigger > this.lastPopTrigger) {
      this.lastPopTrigger = telemetry.exhaustPopTrigger;
      this.triggerExhaustPop(profile.burbleIntensity, normRpm, isCrossPlane);
    }
  }

  /**
   * Synthesizes a realistic acoustic exhaust manifold pop/crackle or deep V8 gurgle transient.
   */
  public triggerExhaustPop(
    intensity: number,
    normRpm: number,
    isCrossPlane = false
  ): void {
    const now = this.ctx.currentTime;
    const duration = isCrossPlane
      ? 0.065 + Math.random() * 0.055
      : 0.045 + Math.random() * 0.035;

    // 1. Short burst of filtered impulse noise
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp((-i / bufferSize) * (isCrossPlane ? 5.2 : 6.5));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isCrossPlane
      ? 115 + Math.random() * 145 + normRpm * 95
      : 180 + Math.random() * 260 + normRpm * 160;
    filter.Q.value = isCrossPlane ? 2.2 : 1.6;

    const popGain = this.ctx.createGain();
    const peakGain = clamp(
      (0.2 + intensity * 0.28) * (0.65 + Math.random() * 0.35),
      0.08,
      0.48
    );
    popGain.gain.setValueAtTime(peakGain, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const popPanner = this.ctx.createStereoPanner();
    // Alternate pops randomly between Left Tailpipe (-0.85..-0.40) and Right Tailpipe (+0.40..+0.85)
    const side = Math.random() < 0.5 ? -1 : 1;
    popPanner.pan.value = side * (0.42 + Math.random() * 0.45);

    noise.connect(filter);
    filter.connect(popGain);
    popGain.connect(popPanner);
    popPanner.connect(this.output);

    noise.start(now);
    noise.stop(now + duration);

    // 2. For Mustang GT Cross-Plane V8, add a deep low-end hollow pipe thump on overrun burbles
    if (isCrossPlane) {
      const thumpOsc = this.ctx.createOscillator();
      thumpOsc.type = 'triangle';
      const startPitch = 135 + Math.random() * 45;
      thumpOsc.frequency.setValueAtTime(startPitch, now);
      thumpOsc.frequency.exponentialRampToValueAtTime(52, now + duration);

      const thumpGain = this.ctx.createGain();
      thumpGain.gain.setValueAtTime(peakGain * 0.85, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      thumpOsc.connect(thumpGain);
      thumpGain.connect(popPanner);

      thumpOsc.start(now);
      thumpOsc.stop(now + duration + 0.01);
    }
  }

  public dispose(): void {
    try {
      this.brakingOsc.stop();
    } catch {
      // ignore
    }
    this.input.disconnect();
    this.output.disconnect();
  }
}
