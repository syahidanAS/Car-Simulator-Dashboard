import { EngineProfile, SimulationTelemetry } from './types';
import {
  rpmToCrankFrequency,
  rpmToFiringFrequency,
  setAudioParamSmooth,
} from '../utils/audioMath';
import { clamp, inverseLerp } from '../utils/interpolation';

/**
 * Handles:
 * - LAYER 1: Periodic combustion pulses:
 *   - 720-degree 4-stroke Firing-Order Cycle Oscillator (64 harmonics computed via Fourier transform of individual cylinder firing angles & bank weights, e.g. Mustang GT Coyote 1-3-7-2-6-5-4-8 R-R-L-R-L-L-R-L)
 *   - Primary firing frequency oscillator + upper harmonic scream + irregularity LFO
 * - LAYER 3: Intake induction roar (throttle-opened bandpass air noise + induction resonance)
 * - LAYER 4: Mechanical valvetrain & timing chain texture
 */
export class CombustionSynth {
  private ctx: AudioContext;
  public readonly output: GainNode;

  // Layer 1: Combustion oscillators
  private firingCycleOsc: OscillatorNode; // Runs at f_cycle = RPM / 120 with 64-harmonic firing-order PeriodicWave
  private primaryOsc: OscillatorNode;
  private halfOrderOsc: OscillatorNode;
  private harmonicOsc: OscillatorNode;

  // Cross-Plane V8 (Mustang GT 5.0 Coyote) uneven bank-pairing oscillators & AM modulator
  private crossPlaneCrankOsc: OscillatorNode;
  private crossPlaneCamOsc: OscillatorNode;
  private crossPlaneGain: GainNode;
  private bankPairModOsc: OscillatorNode;
  private bankPairModDepth: GainNode;

  private irregularityLfo: OscillatorNode;
  private irregularityGain: GainNode;

  private firingCycleGain: GainNode;
  private primaryGain: GainNode;
  private halfOrderGain: GainNode;
  private harmonicGain: GainNode;
  private leftBankFilter: BiquadFilterNode;
  private rightBankFilter: BiquadFilterNode;
  private leftBankPanner: StereoPannerNode;
  private rightBankPanner: StereoPannerNode;
  private combustionFilter: BiquadFilterNode;
  private combustionLayerGain: GainNode;

  // Layer 3: Intake induction
  private intakeNoiseSource: AudioBufferSourceNode | null = null;
  private intakeFilter: BiquadFilterNode;
  private intakeResonator: BiquadFilterNode;
  private intakeLayerGain: GainNode;

  // Layer 4: Mechanical texture
  private mechOsc: OscillatorNode;
  private mechFilter: BiquadFilterNode;
  private mechLayerGain: GainNode;

  private noiseBuffer: AudioBuffer;
  private currentProfileId = '';

  constructor(ctx: AudioContext, initialProfile: EngineProfile) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 1.0;

    // Create pink-ish noise buffer for intake & mechanical air texture
    this.noiseBuffer = this.createPinkNoiseBuffer(ctx, 3.0);

    // --- LAYER 1: COMBUSTION ---
    this.firingCycleOsc = ctx.createOscillator();
    this.primaryOsc = ctx.createOscillator();
    this.halfOrderOsc = ctx.createOscillator();
    this.harmonicOsc = ctx.createOscillator();
    this.halfOrderOsc.type = 'sawtooth';

    // Cross-plane V8 uneven bank-pairing (R-R-L-R-L-L-R-R) synthesis nodes
    this.crossPlaneCrankOsc = ctx.createOscillator();
    this.crossPlaneCamOsc = ctx.createOscillator();
    this.crossPlaneGain = ctx.createGain();
    this.crossPlaneGain.gain.value = 0;

    const cpReal = new Float32Array([0, 0.95, 0.72, 0.85, 0.35, 0.62, 0.25, 0.18, 0.12]);
    const cpImag = new Float32Array([0, 1.00, 0.85, 0.90, 0.45, 0.70, 0.30, 0.22, 0.15]);
    try {
      const cpWave = ctx.createPeriodicWave(cpReal, cpImag, { disableNormalization: false });
      this.crossPlaneCrankOsc.setPeriodicWave(cpWave);
      this.crossPlaneCamOsc.setPeriodicWave(cpWave);
    } catch {
      this.crossPlaneCrankOsc.type = 'sawtooth';
      this.crossPlaneCamOsc.type = 'triangle';
    }

    // Bank-pairing amplitude modulator on primary firing pulses
    this.bankPairModOsc = ctx.createOscillator();
    this.bankPairModOsc.type = 'sawtooth';
    this.bankPairModOsc.frequency.value = 12;
    this.bankPairModDepth = ctx.createGain();
    this.bankPairModDepth.gain.value = 0;

    // Subtle irregularity LFO to prevent robotic phase lock
    this.irregularityLfo = ctx.createOscillator();
    this.irregularityLfo.type = 'triangle';
    this.irregularityLfo.frequency.value = 7.3;
    this.irregularityGain = ctx.createGain();
    this.irregularityGain.gain.value = 1.8;

    this.irregularityLfo.connect(this.irregularityGain);
    this.irregularityGain.connect(this.primaryOsc.frequency);
    this.irregularityGain.connect(this.harmonicOsc.frequency);
    this.irregularityGain.connect(this.crossPlaneCrankOsc.frequency);

    this.firingCycleGain = ctx.createGain();
    this.primaryGain = ctx.createGain();
    this.halfOrderGain = ctx.createGain();
    this.harmonicGain = ctx.createGain();

    // Connect bank-pairing AM modulator into primaryGain
    this.bankPairModOsc.connect(this.bankPairModDepth);
    this.bankPairModDepth.connect(this.primaryGain.gain);

    this.combustionFilter = ctx.createBiquadFilter();
    this.combustionFilter.type = 'lowpass';
    this.combustionFilter.frequency.value = 1200;
    this.combustionFilter.Q.value = 1.4;

    // Dual Cylinder Bank Stereo Separation (Left Bank vs Right Bank)
    this.leftBankFilter = ctx.createBiquadFilter();
    this.leftBankFilter.type = 'peaking';
    this.leftBankFilter.frequency.value = 240;
    this.leftBankFilter.Q.value = 1.5;
    this.leftBankFilter.gain.value = 3.5;

    this.rightBankFilter = ctx.createBiquadFilter();
    this.rightBankFilter.type = 'peaking';
    this.rightBankFilter.frequency.value = 310;
    this.rightBankFilter.Q.value = 1.5;
    this.rightBankFilter.gain.value = 3.5;

    this.leftBankPanner = ctx.createStereoPanner();
    this.leftBankPanner.pan.value = -0.68;

    this.rightBankPanner = ctx.createStereoPanner();
    this.rightBankPanner.pan.value = 0.68;

    // Slight detune between banks for natural 3D stereo engine bay width
    this.primaryOsc.detune.value = 4.5;
    this.crossPlaneCamOsc.detune.value = -5.5;

    this.combustionLayerGain = ctx.createGain();
    this.combustionLayerGain.gain.value = 0;

    this.firingCycleOsc.connect(this.firingCycleGain);
    this.primaryOsc.connect(this.primaryGain);
    this.halfOrderOsc.connect(this.halfOrderGain);
    this.harmonicOsc.connect(this.harmonicGain);
    this.crossPlaneCrankOsc.connect(this.crossPlaneGain);
    this.crossPlaneCamOsc.connect(this.crossPlaneGain);

    // Route Left Bank (Firing Order Cycle + Cross-Plane Crank) -> Left Panner (-0.68)
    this.firingCycleGain.connect(this.leftBankFilter);
    this.crossPlaneGain.connect(this.leftBankFilter);
    this.leftBankFilter.connect(this.leftBankPanner);
    this.leftBankPanner.connect(this.combustionFilter);

    // Route Right Bank (Primary Firing + Upper Harmonic Scream) -> Right Panner (+0.68)
    this.primaryGain.connect(this.rightBankFilter);
    this.harmonicGain.connect(this.rightBankFilter);
    this.rightBankFilter.connect(this.rightBankPanner);
    this.rightBankPanner.connect(this.combustionFilter);

    // Route Half-Order Sub-Growl to Center + Both Banks
    this.halfOrderGain.connect(this.combustionFilter);

    this.combustionFilter.connect(this.combustionLayerGain);
    this.combustionLayerGain.connect(this.output);

    // --- LAYER 3: INTAKE ---
    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 450;
    this.intakeFilter.Q.value = 2.2;

    this.intakeResonator = ctx.createBiquadFilter();
    this.intakeResonator.type = 'peaking';
    this.intakeResonator.frequency.value = 950;
    this.intakeResonator.Q.value = 3.0;
    this.intakeResonator.gain.value = 8.0;

    this.intakeLayerGain = ctx.createGain();
    this.intakeLayerGain.gain.value = 0;

    this.intakeFilter.connect(this.intakeResonator);
    this.intakeResonator.connect(this.intakeLayerGain);
    this.intakeLayerGain.connect(this.output);

    // --- LAYER 4: MECHANICAL ---
    this.mechOsc = ctx.createOscillator();
    this.mechOsc.type = 'triangle';
    this.mechFilter = ctx.createBiquadFilter();
    this.mechFilter.type = 'bandpass';
    this.mechFilter.frequency.value = 1800;
    this.mechFilter.Q.value = 3.5;

    this.mechLayerGain = ctx.createGain();
    this.mechLayerGain.gain.value = 0;

    this.mechOsc.connect(this.mechFilter);
    this.mechFilter.connect(this.mechLayerGain);
    this.mechLayerGain.connect(this.output);

    this.applyProfile(initialProfile);

    // Start continuous oscillators & noise source
    const now = ctx.currentTime;
    this.firingCycleOsc.start(now);
    this.primaryOsc.start(now);
    this.halfOrderOsc.start(now);
    this.harmonicOsc.start(now);
    this.crossPlaneCrankOsc.start(now);
    this.crossPlaneCamOsc.start(now);
    this.bankPairModOsc.start(now);
    this.irregularityLfo.start(now);
    this.mechOsc.start(now);
    this.startIntakeNoise();
  }

  /**
   * Synthesizes a 64-harmonic PeriodicWave representing one full 720° 4-stroke engine cycle
   * from the exact cylinder firing angles and exhaust bank pulse weights.
   * For Mustang GT 5.0 Coyote (`CROSS_PLANE_V8`), models the exact `1-3-7-2-6-5-4-8` (`R-R-L-R-L-L-R-L`)
   * cross-plane firing order!
   */
  private buildFiringOrderWave(profile: EngineProfile): PeriodicWave {
    const numHarmonics = 64;
    const real = new Float32Array(numHarmonics + 1);
    const imag = new Float32Array(numHarmonics + 1);

    // Determine cylinder pulse weights & phase offsets over the 720-degree cycle
    let weights: number[];
    let phaseOffsets: number[];

    if (profile.crankConfiguration === 'CROSS_PLANE_V8') {
      // Ford 5.0L Coyote Cross-Plane V8 firing order: 1-3-7-2-6-5-4-8 -> Bank sequence: R, R, L, R, L, L, R, L
      // Unequal acoustic bank coupling through H-pipe creates the signature cross-plane V8 burble
      weights = [1.05, 1.12, 0.44, 0.98, 0.46, 0.39, 1.02, 0.42];
      phaseOffsets = [0.0, 0.03, -0.02, 0.01, -0.03, 0.04, -0.01, 0.02];
    } else if (profile.crankConfiguration === 'FLAT_PLANE_V8') {
      // Flat-plane V8: alternating L-R-L-R-L-R-L-R
      weights = [1.0, 0.78, 0.98, 0.80, 1.02, 0.76, 0.96, 0.82];
      phaseOffsets = [0, 0, 0, 0, 0, 0, 0, 0];
    } else if (profile.crankConfiguration === 'V12_65') {
      weights = [1.0, 0.92, 0.96, 0.90, 1.02, 0.94, 0.98, 0.91, 1.01, 0.93, 0.97, 0.89];
      phaseOffsets = new Array(12).fill(0);
    } else {
      // 120-degree V6
      weights = [1.0, 0.86, 0.96, 0.88, 1.02, 0.84];
      phaseOffsets = [0, 0, 0, 0, 0, 0];
    }

    const cylCount = weights.length;

    for (let n = 1; n <= numHarmonics; n++) {
      let sumCos = 0;
      let sumSin = 0;

      // Spectral envelope of an individual cylinder exhaust blowdown pulse
      const pulseEnvelope = Math.exp(-n / (cylCount * 3.2)) * (1 + 0.35 * Math.sin((n / cylCount) * Math.PI));

      for (let k = 0; k < cylCount; k++) {
        const theta = (k * 2 * Math.PI) / cylCount + phaseOffsets[k];
        sumCos += weights[k] * Math.cos(n * theta);
        sumSin += weights[k] * Math.sin(n * theta);
      }

      real[n] = (sumCos / cylCount) * pulseEnvelope;
      imag[n] = (sumSin / cylCount) * pulseEnvelope;
    }

    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSeconds);
    // 2-channel uncorrelated stereo pink noise for wide induction air rush
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  private startIntakeNoise(): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.connect(this.intakeFilter);
    src.start();
    this.intakeNoiseSource = src;
  }

  public applyProfile(profile: EngineProfile): void {
    if (this.currentProfileId === profile.id) return;
    this.currentProfileId = profile.id;

    const real = new Float32Array(profile.harmonicsReal);
    const imag = new Float32Array(profile.harmonicsImag);
    try {
      const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      this.primaryOsc.setPeriodicWave(wave);
      this.harmonicOsc.setPeriodicWave(wave);
      const cycleWave = this.buildFiringOrderWave(profile);
      this.firingCycleOsc.setPeriodicWave(cycleWave);
    } catch {
      this.primaryOsc.type = 'sawtooth';
      this.harmonicOsc.type = 'sawtooth';
      this.firingCycleOsc.type = 'sawtooth';
    }
  }

  public update(telemetry: SimulationTelemetry, profile: EngineProfile): void {
    this.applyProfile(profile);
    const now = this.ctx.currentTime;

    if (
      (telemetry.engineState === 'OFF' && telemetry.rpm < 20) ||
      (telemetry.engineState === 'STARTING' && !telemetry.combustionActive)
    ) {
      // Allow subtle pre-catch cylinder sputter only in the final 0.28s of cranking
      const preCatchGain =
        telemetry.engineState === 'STARTING' && telemetry.startupElapsed > 1.55
          ? 0.09 * Math.max(0, Math.sin(telemetry.startupElapsed * 55))
          : 0;
      setAudioParamSmooth(this.combustionLayerGain.gain, preCatchGain, now, 0.025);
      setAudioParamSmooth(this.intakeLayerGain.gain, 0, now, 0.04);
      setAudioParamSmooth(this.mechLayerGain.gain, 0, now, 0.04);
      return;
    }

    const rpm = Math.max(120, telemetry.rpm);
    const normRpm = inverseLerp(profile.idleRpm, profile.maxRpm, rpm);
    const throttle = telemetry.effectiveThrottle;
    const isCrossPlane = profile.crankConfiguration === 'CROSS_PLANE_V8';

    // 720-degree 4-stroke cycle frequency (RPM / 120) and primary firing frequency
    const cycleFreq = Math.max(2, rpm / 120);
    const firingFreq = rpmToFiringFrequency(rpm, profile.cylinders);
    const crankFreq = rpmToCrankFrequency(rpm);

    setAudioParamSmooth(this.firingCycleOsc.frequency, cycleFreq, now, 0.015);
    setAudioParamSmooth(this.primaryOsc.frequency, firingFreq, now, 0.016);
    setAudioParamSmooth(
      this.halfOrderOsc.frequency,
      isCrossPlane ? crankFreq * 1.5 : crankFreq * (profile.cylinders / 4),
      now,
      0.016
    );
    setAudioParamSmooth(
      this.harmonicOsc.frequency,
      isCrossPlane ? firingFreq * 1.25 : firingFreq * 1.5,
      now,
      0.016
    );

    // Firing-order cycle wave is strongest on Cross-Plane V8 for authentic 1-3-7-2-6-5-4-8 pulse cadence
    const cycleWaveLevel = isCrossPlane
      ? 0.68 * (0.75 + throttle * 0.35)
      : 0.32 * (0.7 + throttle * 0.3);
    setAudioParamSmooth(this.firingCycleGain.gain, cycleWaveLevel, now, 0.02);

    // Cross-Plane V8 (Mustang GT 5.0L Coyote) uneven bank-pairing rumble & chop
    if (isCrossPlane) {
      setAudioParamSmooth(this.crossPlaneCrankOsc.frequency, crankFreq, now, 0.016);
      setAudioParamSmooth(this.crossPlaneCamOsc.frequency, crankFreq * 0.5, now, 0.016);
      setAudioParamSmooth(this.bankPairModOsc.frequency, crankFreq, now, 0.016);

      const crossPlaneRumbleLevel = (0.58 - normRpm * 0.22) * (0.75 + throttle * 0.35);
      const bankModAmount = (0.28 - normRpm * 0.14) * (0.8 + throttle * 0.25);

      setAudioParamSmooth(this.crossPlaneGain.gain, Math.max(0.18, crossPlaneRumbleLevel), now, 0.02);
      setAudioParamSmooth(this.bankPairModDepth.gain, Math.max(0.08, bankModAmount), now, 0.02);
    } else {
      setAudioParamSmooth(this.crossPlaneGain.gain, 0, now, 0.02);
      setAudioParamSmooth(this.bankPairModDepth.gain, 0, now, 0.02);
    }

    // Irregularity jitter increases at idle for organic cam lope (especially strong on Mustang GT V8)
    const lopeMultiplier = isCrossPlane ? 2.4 : 1.0;
    const jitterAmount =
      telemetry.engineState === 'IDLE'
        ? 2.2 * lopeMultiplier
        : (1.2 + normRpm * 3.5) * (isCrossPlane ? 1.45 : 1.0) +
          (telemetry.isRevLimiter ? 18 : 0);
    setAudioParamSmooth(this.irregularityGain.gain, jitterAmount, now, 0.03);
    setAudioParamSmooth(
      this.irregularityLfo.frequency,
      telemetry.isRevLimiter
        ? profile.revLimiterHz
        : isCrossPlane
          ? Math.max(5.5, crankFreq * 0.5)
          : 6.5 + normRpm * 14,
      now,
      0.03
    );

    // Balance between deep sub-order growl and high-RPM scream
    const primaryLevel = 0.48 + throttle * 0.28;
    const halfOrderLevel = isCrossPlane
      ? (0.48 - normRpm * 0.15) * (0.7 + throttle * 0.3)
      : (1 - normRpm * 0.55) * 0.34;
    const harmonicScream = Math.pow(normRpm, 1.3) * (0.28 + throttle * 0.35);

    setAudioParamSmooth(this.primaryGain.gain, primaryLevel, now, 0.02);
    setAudioParamSmooth(this.halfOrderGain.gain, halfOrderLevel, now, 0.02);
    setAudioParamSmooth(this.harmonicGain.gain, harmonicScream, now, 0.02);

    // Filter opens dramatically with RPM and throttle load
    const cutoffHz = clamp(
      (isCrossPlane ? 210 : 260) +
        normRpm * (isCrossPlane ? 2350 : 2800) +
        throttle * 1900 -
        telemetry.engineBrakingIntensity * 600,
      160,
      6500
    );
    setAudioParamSmooth(this.combustionFilter.frequency, cutoffHz, now, 0.02);
    setAudioParamSmooth(
      this.leftBankFilter.frequency,
      clamp(firingFreq * 1.85, 160, 1800),
      now,
      0.025
    );
    setAudioParamSmooth(
      this.rightBankFilter.frequency,
      clamp(firingFreq * 2.25, 190, 2200),
      now,
      0.025
    );

    // Combustion intensity drops during engine braking & ignition cut
    const brakingAttenuation = 1 - telemetry.engineBrakingIntensity * 0.42;
    const limiterModulation = telemetry.isRevLimiter
      ? 0.35 + 0.65 * telemetry.torqueInterruption
      : telemetry.torqueInterruption;

    const totalCombustionGain =
      clamp(0.34 + throttle * 0.38 + normRpm * 0.22, 0.15, 0.90) *
      brakingAttenuation *
      limiterModulation;

    setAudioParamSmooth(this.combustionLayerGain.gain, totalCombustionGain, now, 0.015);

    // 2. LAYER 3: Intake induction roar (Coyote 5.0L Dual-Runner IMRC deeper induction throat vs European scream)
    const intakeFreq = isCrossPlane
      ? clamp(220 + normRpm * 1150 + throttle * 480, 190, 2200)
      : clamp(320 + normRpm * 1650 + throttle * 650, 250, 3200);
    setAudioParamSmooth(this.intakeFilter.frequency, intakeFreq, now, 0.025);
    setAudioParamSmooth(this.intakeResonator.frequency, intakeFreq * 1.65, now, 0.025);

    const intakeGain = clamp(
      (0.03 + Math.pow(throttle, 1.2) * (isCrossPlane ? 0.38 : 0.32)) *
        (0.4 + normRpm * 0.8),
      0,
      0.42
    );
    setAudioParamSmooth(this.intakeLayerGain.gain, intakeGain, now, 0.025);

    // 3. LAYER 4: Mechanical valvetrain texture (subtle high-order precision whine)
    const mechFreq = clamp(crankFreq * 12, 180, 4200);
    setAudioParamSmooth(this.mechOsc.frequency, mechFreq, now, 0.02);
    setAudioParamSmooth(this.mechFilter.frequency, mechFreq * 1.2, now, 0.02);
    const mechGain = clamp(0.016 + normRpm * 0.042, 0.01, 0.06);
    setAudioParamSmooth(this.mechLayerGain.gain, mechGain, now, 0.03);
  }

  public dispose(): void {
    try {
      this.firingCycleOsc.stop();
      this.primaryOsc.stop();
      this.halfOrderOsc.stop();
      this.harmonicOsc.stop();
      this.crossPlaneCrankOsc.stop();
      this.crossPlaneCamOsc.stop();
      this.bankPairModOsc.stop();
      this.irregularityLfo.stop();
      this.mechOsc.stop();
      this.intakeNoiseSource?.stop();
    } catch {
      // ignore if already stopped
    }
    this.output.disconnect();
  }
}
