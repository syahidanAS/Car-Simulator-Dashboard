import { clamp, lerp } from './interpolation';

/**
 * Frame-rate independent exponential smoothing filter.
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  return lerp(current, target, 1 - Math.exp(-lambda * Math.max(0, dt)));
}

/**
 * Asymmetric damper with separate attack and release rates (e.g., turbo spool, needle dynamics, audio ducking).
 */
export class AsymmetricDamper {
  private value: number;
  private attackLambda: number;
  private releaseLambda: number;

  constructor(initialValue = 0, attackLambda = 12, releaseLambda = 5) {
    this.value = initialValue;
    this.attackLambda = attackLambda;
    this.releaseLambda = releaseLambda;
  }

  public update(target: number, dt: number): number {
    const rate = target > this.value ? this.attackLambda : this.releaseLambda;
    this.value = damp(this.value, target, rate, dt);
    return this.value;
  }

  public setImmediate(val: number): void {
    this.value = val;
  }

  public getValue(): number {
    return this.value;
  }

  public setRates(attackLambda: number, releaseLambda: number): void {
    this.attackLambda = clamp(attackLambda, 0.5, 100);
    this.releaseLambda = clamp(releaseLambda, 0.5, 100);
  }
}

