import { clamp, inverseLerp } from './interpolation';

/**
 * Converts RPM and cylinder count for a 4-stroke engine into primary firing event frequency (Hz).
 * f = RPM * cylinders / 120
 */
export function rpmToFiringFrequency(rpm: number, cylinders: number): number {
  return Math.max(5, (Math.max(0, rpm) * cylinders) / 120);
}

/**
 * Crankshaft fundamental rotation frequency in Hz (RPM / 60).
 */
export function rpmToCrankFrequency(rpm: number): number {
  return Math.max(2, Math.max(0, rpm) / 60);
}

/**
 * Converts decibels to linear gain.
 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Converts linear gain to decibels.
 */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(1e-6, gain));
}

/**
 * Safely schedules an AudioParam transition without clicks or pops.
 */
export function setAudioParamSmooth(
  param: AudioParam,
  value: number,
  currentTime: number,
  timeConstant = 0.025
): void {
  if (!Number.isFinite(value)) return;
  try {
    param.setTargetAtTime(value, currentTime, Math.max(0.005, timeConstant));
  } catch {
    param.value = value;
  }
}

/**
 * Computes multi-band crossfade weights across 4 RPM zones:
 * [idle, low, mid, high]
 */
export function computeRpmZoneWeights(
  rpm: number,
  idleRpm: number,
  maxRpm: number
): { idle: number; low: number; mid: number; high: number } {
  const norm = inverseLerp(idleRpm, maxRpm, Math.max(idleRpm, rpm));

  // Gaussian-like overlapping windows across normalized RPM [0..1]
  const idle = Math.pow(clamp(1 - norm * 4.0, 0, 1), 1.4);
  const low = Math.exp(-Math.pow((norm - 0.26) / 0.2, 2));
  const mid = Math.exp(-Math.pow((norm - 0.58) / 0.24, 2));
  const high = clamp(Math.pow(inverseLerp(0.55, 0.95, norm), 1.2), 0, 1);

  const sum = idle + low + mid + high || 1;
  return {
    idle: idle / sum,
    low: low / sum,
    mid: mid / sum,
    high: high / sum,
  };
}

