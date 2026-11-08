export type EngineState =
  | 'OFF'
  | 'STARTING'
  | 'IDLE'
  | 'ACCELERATING'
  | 'CRUISING'
  | 'DECELERATING'
  | 'ENGINE_BRAKING'
  | 'REV_LIMITER';

export type Gear = 'N' | 1 | 2 | 3 | 4 | 5 | 6;

export type TransmissionMode = 'MANUAL' | 'AUTO';

export type EngineProfileId =
  | 'v6_twin_turbo'
  | 'mustang_gt_v8'
  | 'na_v12'
  | 'v8_performance'
  | 'track_mode';

export type AudioSampleMode = 'procedural' | 'hybrid';

export type CrankConfiguration = 'V6_120' | 'CROSS_PLANE_V8' | 'FLAT_PLANE_V8' | 'V12_65';

export interface EngineProfile {
  id: EngineProfileId;
  name: string;
  subtitle: string;
  code: string;
  cylinders: number;
  displacementLiters: number;
  aspiration: 'TWIN-TURBO' | 'NATURALLY ASPIRATED' | 'TWIN-TURBO TRACK';
  crankConfiguration: CrankConfiguration;
  idleRpm: number;
  redlineRpm: number;
  maxRpm: number;
  hasTurbo: boolean;
  /** Flywheel inertia factor (lower = revs faster) */
  inertiaFactor: number;
  /** Throttle curve exponent (< 1 = sharper, > 1 = smoother) */
  throttleCurveExponent: number;
  /** Engine braking deceleration factor */
  engineBrakingFactor: number;
  /** Harmonic amplitudes for PeriodicWave [DC, f1, f2, f3, ... f16] */
  harmonicsReal: number[];
  harmonicsImag: number[];
  /** Exhaust resonator frequencies [lowBodyHz, midFormant1Hz, midFormant2Hz, highRaspHz] */
  exhaustFormants: [number, number, number, number];
  /** Exhaust distortion drive (1..10) */
  exhaustDrive: number;
  /** Overrun burble/crackle intensity (0..1) */
  burbleIntensity: number;
  /** Rev limiter cut rate in Hz */
  revLimiterHz: number;
  /** Cam lope / uneven bank chop intensity at idle and low RPM (0..1) */
  camLopeIntensity: number;
  /** Sub-bass H-pipe / X-pipe chest rumble level (0..1) */
  subBassLevel: number;
}

export interface GearRatios {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  finalDrive: number;
}

export type StartupPhase =
  | 'OFF'
  | 'PRIME'
  | 'CRANKING'
  | 'CATCH_FLARE'
  | 'FAST_IDLE'
  | 'RUNNING';

export interface SimulationTelemetry {
  rpm: number;
  targetRpm: number;
  throttle: number; // 0..1 raw input
  effectiveThrottle: number; // 0..1 curved throttle
  brake: number; // 0..1 brake pedal input
  speedKmh: number;
  gear: Gear;
  transmissionMode: TransmissionMode;
  engineState: EngineState;
  startupPhase: StartupPhase;
  startupElapsed: number;
  combustionActive: boolean;
  profileId: EngineProfileId;
  turboBoost: number; // 0..1 (maps to 0..1.8 bar)
  engineLoad: number; // 0..1
  engineBrakingIntensity: number; // 0..1
  isRevLimiter: boolean;
  isRedline: boolean;
  isShiftWarning: boolean;
  isShifting: boolean;
  shiftDirection: 'UP' | 'DOWN' | null;
  torqueInterruption: number; // 0..1 (1 = normal torque, 0 = cut during shift)
  accelerationG: number; // longitudinal G-force approximation
  oilTempC: number;
  waterTempC: number;
  fuelLevel: number; // 0..100 percentage
  exhaustPopTrigger: number; // increments when an overrun pop occurs
  blowOffTrigger: number; // increments when turbo blow-off occurs
}

export interface UserSettings {
  masterVolume: number; // 0..1
  engineVolume: number; // 0..1
  musicVolume: number; // 0..1
  idleRpm: number;
  redlineRpm: number;
  maxRpm: number;
  engineInertia: number; // 0.3..2.0 multiplier
  throttleResponse: number; // 0.4..1.8 exponent
  gearRatios: GearRatios;
  turboEnabled: boolean;
  audioDuckingEnabled: boolean;
  audioDuckingIntensity: number; // 0..0.8
  audioSampleMode: AudioSampleMode;
}

export interface AudioSystemStatus {
  contextState: AudioContextState | 'uninitialized';
  sampleRate: number;
  activeMode: 'PROCEDURAL HYBRID DSP' | 'SAMPLE + DSP HYBRID';
  loadedSampleCount: number;
  totalSampleCount: number;
  outputDeviceLabel: string;
  masterLevelDb: number;
  engineLevel: number; // 0..1 RMS
  musicLevel: number; // 0..1 RMS
  isDuckingActive: boolean;
}

