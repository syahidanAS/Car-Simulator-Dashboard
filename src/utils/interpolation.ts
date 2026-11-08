/**
 * Mathematical interpolation utilities for real-time engine simulation and gauges.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * clamp(alpha, 0, 1);
}

export function inverseLerp(min: number, max: number, value: number): number {
  if (Math.abs(max - min) < 1e-9) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = inverseLerp(edge0, edge1, x);
  return t * t * (3 - 2 * t);
}

/**
 * Equal-power crossfade gains for two overlapping zones.
 */
export function equalPowerCrossfade(t: number): [number, number] {
  const clamped = clamp(t, 0, 1);
  const angle = clamped * Math.PI * 0.5;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 *Applies a throttle response curve:
 * exponent < 1 = aggressive (track), exponent > 1 = progressive, 1 = linear
 */
export function applyResponseCurve(input: number, exponent: number): number {
  const clamped = clamp(input, 0, 1);
  return Math.pow(clamped, Math.max(0.25, exponent));
}

