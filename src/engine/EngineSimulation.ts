import {
  EngineProfile,
  EngineProfileId,
  EngineState,
  Gear,
  SimulationTelemetry,
  TransmissionMode,
  UserSettings,
} from './types';
import { DEFAULT_USER_SETTINGS, ENGINE_PROFILES } from './EngineProfiles';
import { applyResponseCurve, clamp, inverseLerp, lerp } from '../utils/interpolation';
import { damp } from '../utils/smoothing';

const TIRE_CIRCUMFERENCE_M = 2.12; // 305/35 ZR20 rear supercar tire
/**
 * Scales real-world EV GPS speeds (e.g. 0-100 km/h city/highway driving)
 * into exciting multi-gear supercar RPM sweeps across all 6 gears.
 */
const EV_GPS_DRIVETRAIN_SCALE = 2.15;

export class EngineSimulation {
  private profile: EngineProfile;
  private settings: UserSettings;
  private telemetry: SimulationTelemetry;

  private startupElapsed = 0;
  private shiftTimer = 0;
  private shiftTargetRpm = 900;
  private limiterPhase = 0;
  private idleJitterPhase = 0;
  private previousThrottle = 0;
  private blowOffCooldown = 0;
  private popCooldown = 0;
  private autoShiftCooldown = 0;
  private brakeHoldTimer = 0;
  private brakeDownshiftCooldown = 0;

  // Live EV GPS telemetry inputs
  private isGpsModeActive = false;
  private gpsVelocityInput: number | null = null;
  private gpsAccelInput = 0;

  constructor(
    initialProfileId: EngineProfileId = 'mustang_gt_v8',
    initialSettings: UserSettings = DEFAULT_USER_SETTINGS
  ) {
    this.profile = ENGINE_PROFILES[initialProfileId];
    this.settings = { ...initialSettings, gearRatios: { ...initialSettings.gearRatios } };

    this.telemetry = {
      rpm: 0,
      targetRpm: 0,
      throttle: 0,
      effectiveThrottle: 0,
      brake: 0,
      speedKmh: 0,
      gear: 'N',
      transmissionMode: 'MANUAL',
      engineState: 'OFF',
      startupPhase: 'OFF',
      startupElapsed: 0,
      combustionActive: false,
      profileId: initialProfileId,
      turboBoost: 0,
      engineLoad: 0,
      engineBrakingIntensity: 0,
      isRevLimiter: false,
      isRedline: false,
      isShiftWarning: false,
      isShifting: false,
      shiftDirection: null,
      torqueInterruption: 1,
      accelerationG: 0,
      oilTempC: 88,
      waterTempC: 90,
      fuelLevel: 84,
      exhaustPopTrigger: 0,
      blowOffTrigger: 0,
    };
  }

  public getTelemetry(): SimulationTelemetry {
    return this.telemetry;
  }

  public getProfile(): EngineProfile {
    return this.profile;
  }

  public getSettings(): UserSettings {
    return this.settings;
  }

  public setProfile(profileId: EngineProfileId): void {
    const nextProfile = ENGINE_PROFILES[profileId];
    if (!nextProfile) return;
    this.profile = nextProfile;
    this.telemetry.profileId = profileId;

    this.settings.idleRpm = nextProfile.idleRpm;
    this.settings.redlineRpm = nextProfile.redlineRpm;
    this.settings.maxRpm = nextProfile.maxRpm;
  }

  public updateSettings(partial: Partial<UserSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      gearRatios: partial.gearRatios
        ? { ...this.settings.gearRatios, ...partial.gearRatios }
        : this.settings.gearRatios,
    };
  }

  /**
   * Receives real-time EV speed (km/h) and acceleration (km/h/s) from the Browser GPS module.
   */
  public setGpsTelemetryInput(
    speedKmh: number | null,
    accelKmhPerSec: number,
    isActive: boolean
  ): void {
    this.gpsVelocityInput = speedKmh;
    this.gpsAccelInput = accelKmhPerSec;
    this.isGpsModeActive = isActive;
  }

  /** Backward-compatible helper for setting GPS velocity */
  public setGpsVelocityInput(speedKmh: number | null): void {
    this.gpsVelocityInput = speedKmh;
    this.isGpsModeActive = speedKmh !== null;
  }

  public triggerManualBlowOff(): void {
    if (this.telemetry.engineState === 'OFF') return;
    this.telemetry.blowOffTrigger += 1;
  }

  public refuel(): void {
    this.telemetry.fuelLevel = 100;
  }

  public startEngine(): void {
    if (this.telemetry.engineState !== 'OFF') return;
    this.telemetry.engineState = 'STARTING';
    this.telemetry.startupPhase = 'PRIME';
    this.telemetry.startupElapsed = 0;
    this.telemetry.combustionActive = false;
    this.startupElapsed = 0;
    this.telemetry.rpm = 0;
    this.telemetry.throttle = 0;
    this.telemetry.effectiveThrottle = 0;
  }

  public stopEngine(): void {
    if (this.telemetry.engineState === 'OFF') return;
    this.telemetry.engineState = 'OFF';
    this.telemetry.startupPhase = 'OFF';
    this.telemetry.startupElapsed = 0;
    this.telemetry.combustionActive = false;
    this.telemetry.throttle = 0;
    this.telemetry.effectiveThrottle = 0;
    this.telemetry.isRevLimiter = false;
    this.telemetry.isRedline = false;
    this.telemetry.isShiftWarning = false;
    this.telemetry.engineLoad = 0;
    this.telemetry.engineBrakingIntensity = 0;
  }

  public toggleEngine(): void {
    if (this.telemetry.engineState === 'OFF') {
      this.startEngine();
    } else {
      this.stopEngine();
    }
  }

  public setThrottle(value: number): void {
    if (this.telemetry.engineState === 'OFF' || this.telemetry.engineState === 'STARTING') {
      this.telemetry.throttle = 0;
      return;
    }
    const clamped = clamp(value, 0, 1);
    this.telemetry.throttle = clamped;
    if (clamped > 0.05) {
      this.telemetry.brake = 0;
      this.brakeHoldTimer = 0;
    }
  }

  public setBrake(value: number): void {
    const clamped = clamp(value, 0, 1);
    this.telemetry.brake = clamped;
    if (clamped > 0.05) {
      this.telemetry.throttle = 0;
    } else {
      this.brakeHoldTimer = 0;
      this.brakeDownshiftCooldown = 0;
    }
  }

  public setTransmissionMode(mode: TransmissionMode): void {
    this.telemetry.transmissionMode = mode;
    if (mode === 'AUTO' && this.telemetry.gear === 'N' && this.telemetry.speedKmh > 1) {
      this.engageGear(1, 'UP');
    }
  }

  public shiftUp(): boolean {
    const current = this.telemetry.gear;
    const nextGear: Gear | null =
      current === 'N'
        ? 1
        : current === 1
          ? 2
          : current === 2
            ? 3
            : current === 3
              ? 4
              : current === 4
                ? 5
                : current === 5
                  ? 6
                  : null;

    if (nextGear === null) return false;
    return this.engageGear(nextGear, 'UP');
  }

  public shiftDown(): boolean {
    const current = this.telemetry.gear;
    const prevGear: Gear | null =
      current === 6
        ? 5
        : current === 5
          ? 4
          : current === 4
            ? 3
            : current === 3
              ? 2
              : current === 2
                ? 1
                : current === 1
                  ? 'N'
                  : null;

    if (prevGear === null) return false;
    return this.engageGear(prevGear, 'DOWN');
  }

  public setGear(targetGear: Gear): boolean {
    if (targetGear === this.telemetry.gear) return false;
    const currentNum = this.telemetry.gear === 'N' ? 0 : this.telemetry.gear;
    const targetNum = targetGear === 'N' ? 0 : targetGear;
    const direction = targetNum > currentNum ? 'UP' : 'DOWN';
    return this.engageGear(targetGear, direction);
  }

  private engageGear(targetGear: Gear, direction: 'UP' | 'DOWN'): boolean {
    const idleRpm = this.settings.idleRpm;
    const maxRpm = this.settings.maxRpm;
    const effectiveSpeed = this.isGpsModeActive
      ? this.telemetry.speedKmh * EV_GPS_DRIVETRAIN_SCALE
      : this.telemetry.speedKmh;

    if (targetGear !== 'N') {
      const coupledRpm = this.speedToRpm(effectiveSpeed, targetGear);
      if (direction === 'DOWN' && coupledRpm > maxRpm - 250) {
        return false;
      }
      this.shiftTargetRpm = clamp(coupledRpm, idleRpm, maxRpm);

      // Smooth, gentle Rev-Match Throttle Blip on Downshifts (no instant RPM jump or harsh spike)
      if (direction === 'DOWN' && this.telemetry.engineState !== 'OFF') {
        const blipBoost = this.isGpsModeActive ? 160 : 280;
        const coupledMargin = this.isGpsModeActive ? 80 : 140;
        const maxBlipRpm = this.isGpsModeActive
          ? Math.min(4200, this.settings.redlineRpm - 1200)
          : this.settings.redlineRpm - 650;
        const blipTarget = clamp(
          Math.max(coupledRpm + coupledMargin, this.telemetry.rpm + blipBoost),
          idleRpm + 260,
          maxBlipRpm
        );
        this.shiftTargetRpm = blipTarget;
      }
    } else {
      this.shiftTargetRpm = clamp(this.telemetry.rpm * 0.85, idleRpm, maxRpm);
    }

    this.telemetry.gear = targetGear;
    this.telemetry.isShifting = true;
    this.telemetry.shiftDirection = direction;
    this.shiftTimer = direction === 'DOWN' ? 0.22 : 0.14;
    // Upshifts have a brief ignition torque cut; downshifts keep smooth rev-match flow without harsh audio drop
    this.telemetry.torqueInterruption = direction === 'DOWN' ? 0.92 : 0.22;

    if (this.telemetry.rpm > 2800 && this.popCooldown <= 0) {
      this.telemetry.exhaustPopTrigger += 1;
      this.popCooldown = 0.35;
    }

    // Trigger signature turbo blow-off hiss on upshifts under boost!
    if (
      direction === 'UP' &&
      this.settings.turboEnabled &&
      this.telemetry.turboBoost > 0.15 &&
      this.blowOffCooldown <= 0
    ) {
      this.telemetry.blowOffTrigger += 1;
      this.blowOffCooldown = 0.22;
    }

    return true;
  }

  public rpmToSpeed(rpm: number, gear: Gear): number {
    if (gear === 'N') return 0;
    const ratio = this.settings.gearRatios[gear];
    const finalDrive = this.settings.gearRatios.finalDrive;
    if (!ratio || !finalDrive) return 0;
    const wheelRpm = rpm / (ratio * finalDrive);
    const speedKmh = wheelRpm * TIRE_CIRCUMFERENCE_M * 0.06;
    return clamp(speedKmh, 0, 350);
  }

  public speedToRpm(speedKmh: number, gear: Gear): number {
    if (gear === 'N') return this.settings.idleRpm;
    const ratio = this.settings.gearRatios[gear];
    const finalDrive = this.settings.gearRatios.finalDrive;
    const wheelRpm = speedKmh / (TIRE_CIRCUMFERENCE_M * 0.06);
    return wheelRpm * ratio * finalDrive;
  }

  /**
   * High-frequency physics tick (called via requestAnimationFrame / simulation loop)
   */
  public step(rawDt: number): SimulationTelemetry {
    const dt = clamp(rawDt, 0.001, 0.05);
    const prevSpeed = this.telemetry.speedKmh;

    this.blowOffCooldown = Math.max(0, this.blowOffCooldown - dt);
    this.popCooldown = Math.max(0, this.popCooldown - dt);
    this.autoShiftCooldown = Math.max(0, this.autoShiftCooldown - dt);

    const idleRpm = clamp(this.settings.idleRpm, 650, 2000);
    const redlineRpm = clamp(this.settings.redlineRpm, 6000, 9500);
    const maxRpm = Math.max(redlineRpm + 200, clamp(this.settings.maxRpm, 6500, 10000));

    // 1. Handle OFF state
    if (this.telemetry.engineState === 'OFF') {
      this.telemetry.rpm = damp(this.telemetry.rpm, 0, 5.5, dt);
      if (this.telemetry.rpm < 15) this.telemetry.rpm = 0;
      this.telemetry.speedKmh = damp(this.telemetry.speedKmh, 0, 1.8, dt);
      if (this.telemetry.speedKmh < 0.2) this.telemetry.speedKmh = 0;
      this.telemetry.turboBoost = damp(this.telemetry.turboBoost, 0, 6.0, dt);
      this.telemetry.engineLoad = 0;
      this.telemetry.engineBrakingIntensity = 0;
      this.telemetry.accelerationG = 0;
      return this.telemetry;
    }

    // 2. Handle realistic multi-stage STARTING sequence (3.55s total)
    if (this.telemetry.engineState === 'STARTING') {
      const prevPhase = this.telemetry.startupPhase;
      this.startupElapsed += dt;
      this.telemetry.startupElapsed = this.startupElapsed;

      if (this.startupElapsed < 0.42) {
        // Stage 1: Ignition ON + Fuel Pump Rail Prime + Starter Solenoid Engage
        this.telemetry.startupPhase = 'PRIME';
        this.telemetry.combustionActive = false;
        this.telemetry.rpm = 0;
        this.telemetry.engineLoad = 0.08;
      } else if (this.startupElapsed < 1.85) {
        // Stage 2: Starter Motor Cranking (~6 compression strokes before cylinder catch)
        this.telemetry.startupPhase = 'CRANKING';
        const crankTime = this.startupElapsed - 0.42;
        // Rhythmic compression resistance oscillation (~4.3 strokes/sec -> ~260 RPM cranking)
        const strokeWave = Math.sin(crankTime * 27.0);
        const preCatchBoost =
          crankTime > 1.05 ? (crankTime - 1.05) * 340 : 0;
        const targetCrankRpm = 225 + strokeWave * 58 + preCatchBoost;
        this.telemetry.rpm = damp(this.telemetry.rpm, targetCrankRpm, 18, dt);
        this.telemetry.combustionActive = false;
        this.telemetry.engineLoad = 0.42 + strokeWave * 0.12;
      } else if (this.startupElapsed < 2.65) {
        // Stage 3: Explosive Cylinder Ignition Catch & Cold-Start Bark Flare
        this.telemetry.startupPhase = 'CATCH_FLARE';
        this.telemetry.combustionActive = true;
        if (prevPhase !== 'CATCH_FLARE') {
          // Fire exhaust crackle transient on initial cylinder ignition catch
          this.telemetry.exhaustPopTrigger += 1;
        }
        const flareTarget = idleRpm + 1750;
        this.telemetry.rpm = damp(this.telemetry.rpm, flareTarget, 10.5, dt);
        this.telemetry.engineLoad = 0.88;
      } else if (this.startupElapsed < 3.55) {
        // Stage 4: ECU Fast-Idle Settle Down to Warm Idle
        this.telemetry.startupPhase = 'FAST_IDLE';
        this.telemetry.combustionActive = true;
        if (prevPhase !== 'FAST_IDLE') {
          // Overrun burble as flare RPM drops toward idle
          this.telemetry.exhaustPopTrigger += 1;
        }
        const settleJitter =
          Math.sin(this.startupElapsed * 34) *
          (28 * this.profile.camLopeIntensity);
        this.telemetry.rpm =
          damp(this.telemetry.rpm, idleRpm + 110, 4.8, dt) + settleJitter * 0.25;
        this.telemetry.engineLoad = 0.28;
      } else {
        // Startup complete -> steady IDLE
        this.telemetry.engineState = 'IDLE';
        this.telemetry.startupPhase = 'RUNNING';
        this.telemetry.combustionActive = true;
        this.telemetry.rpm = idleRpm;
      }
      return this.telemetry;
    }

    // 3. EV GPS Coordinate Velocity & Acceleration Sync Mode
    const isManualOverride = this.telemetry.throttle >= 0.05;
    const isGpsControl =
      this.isGpsModeActive &&
      this.gpsVelocityInput !== null &&
      !isManualOverride;

    let rawThrottle = this.telemetry.throttle;

    let isGpsHardDecel = false;

    if (isGpsControl && this.gpsVelocityInput !== null) {
      // Ensure AUTO transmission is active during EV GPS driving
      if (this.telemetry.transmissionMode !== 'AUTO') {
        this.telemetry.transmissionMode = 'AUTO';
      }

      const targetGpsSpeed = clamp(this.gpsVelocityInput, 0, 350);
      const speedDropGap = this.telemetry.speedKmh - targetGpsSpeed;

      // Bounded & progressive deceleration when EV stops drastically so speed & RPM never nose-dive harshly
      if (targetGpsSpeed < this.telemetry.speedKmh) {
        const maxDecelKmhPerSec = 28 + speedDropGap * 0.16;
        const dampedSpeed = damp(this.telemetry.speedKmh, targetGpsSpeed, 2.2, dt);
        const stepDrop = Math.min(
          this.telemetry.speedKmh - dampedSpeed,
          maxDecelKmhPerSec * dt
        );
        this.telemetry.speedKmh = Math.max(
          targetGpsSpeed,
          this.telemetry.speedKmh - stepDrop
        );
      } else {
        this.telemetry.speedKmh = damp(
          this.telemetry.speedKmh,
          targetGpsSpeed,
          6.5,
          dt
        );
      }
      if (targetGpsSpeed < 0.5 && this.telemetry.speedKmh < 0.5) {
        this.telemetry.speedKmh = 0;
      }

      const realAccelKmhPerSec =
        (this.telemetry.speedKmh - prevSpeed) / dt + this.gpsAccelInput * 0.35;

      // Detect drastic EV deceleration or coming to a stop while still in a higher gear
      isGpsHardDecel =
        speedDropGap > 5.0 ||
        realAccelKmhPerSec < -3.5 ||
        (targetGpsSpeed < 1.5 &&
          this.telemetry.gear !== 'N' &&
          this.telemetry.gear > 1);

      if (this.telemetry.speedKmh > 0.8) {
        if (this.telemetry.gear === 'N') {
          this.engageGear(1, 'UP');
        }
        // Compute virtual throttle from EV speed + EV longitudinal acceleration
        if (realAccelKmhPerSec < -0.9 || isGpsHardDecel) {
          // EV is decelerating / braking -> 0 throttle
          rawThrottle = 0;
        } else {
          const baseCruise = clamp(0.14 + this.telemetry.speedKmh / 140, 0.14, 0.65);
          const accelDemand = clamp(realAccelKmhPerSec * 0.14, 0, 0.75);
          rawThrottle = clamp(baseCruise + accelDemand, 0.12, 1.0);
        }
      } else {
        // EV is stationary (0 km/h) -> idle at 0 throttle and let sequential downshift step down smoothly to Gear 1
        rawThrottle = 0;
      }
    }

    // Compute effective throttle
    const curveExp = this.profile.throttleCurveExponent * this.settings.throttleResponse;
    const effectiveThrottle = applyResponseCurve(rawThrottle, curveExp);
    this.telemetry.effectiveThrottle = effectiveThrottle;

    // Auto-launch from Neutral into Gear 1 when in AUTO mode and throttle is pressed
    if (
      this.telemetry.transmissionMode === 'AUTO' &&
      this.telemetry.gear === 'N' &&
      effectiveThrottle > 0.12 &&
      this.autoShiftCooldown <= 0
    ) {
      this.engageGear(1, 'UP');
      this.autoShiftCooldown = 0.35;
    }

    // 4. Handle Active Brake Pedal & Smooth Sequential Downshifting
    const brakeInput = this.telemetry.brake;
    if (brakeInput > 0.05) {
      this.brakeHoldTimer += dt;
      this.brakeDownshiftCooldown = Math.max(0, this.brakeDownshiftCooldown - dt);

      // Progressive Brembo brake pressure ramp-in over 0.22s so initial pedal bite is smooth
      const smoothBrake = clamp(this.brakeHoldTimer / 0.22, 0.25, 1.0) * brakeInput;
      const brakeDecel = (42 + this.telemetry.speedKmh * 0.32) * smoothBrake;
      this.telemetry.speedKmh = Math.max(
        0,
        this.telemetry.speedKmh - brakeDecel * dt
      );

      // Smoothly downshift gears (6 -> 5 -> 4 -> 3 -> 2 -> 1) at a natural cadence while brake is held
      if (
        this.brakeHoldTimer >= 0.32 &&
        this.brakeDownshiftCooldown <= 0 &&
        !this.telemetry.isShifting &&
        this.telemetry.gear !== 'N' &&
        this.telemetry.gear > 1
      ) {
        const nextLowerGear = (this.telemetry.gear - 1) as Gear;
        const lowerGearCoupledRpm = this.speedToRpm(
          this.telemetry.speedKmh,
          nextLowerGear
        );
        // Only downshift when vehicle speed has slowed into a smooth rev-match window for the lower gear
        if (lowerGearCoupledRpm <= redlineRpm - 550) {
          if (this.shiftDown()) {
            this.brakeDownshiftCooldown = 0.48;
          }
        }
      }
    } else {
      this.brakeHoldTimer = 0;
      this.brakeDownshiftCooldown = 0;
    }

    // Handle gear shift timer
    if (this.shiftTimer > 0) {
      const totalShiftDuration =
        this.telemetry.shiftDirection === 'DOWN' ? 0.22 : 0.14;
      this.shiftTimer = Math.max(0, this.shiftTimer - dt);
      this.telemetry.isShifting = true;
      this.telemetry.torqueInterruption =
        this.telemetry.shiftDirection === 'DOWN'
          ? lerp(0.92, 1.0, 1 - this.shiftTimer / totalShiftDuration)
          : lerp(0.22, 1.0, 1 - this.shiftTimer / totalShiftDuration);
    } else {
      this.telemetry.isShifting = false;
      this.telemetry.shiftDirection = null;
      this.telemetry.torqueInterruption = 1.0;
    }

    const inertiaMultiplier = clamp(
      this.profile.inertiaFactor * this.settings.engineInertia,
      0.3,
      2.5
    );

    // 5. NEUTRAL vs IN-GEAR dynamics
    if (this.telemetry.gear === 'N') {
      const targetFreeRpm = lerp(idleRpm, maxRpm + 120, effectiveThrottle);
      this.telemetry.targetRpm = targetFreeRpm;

      if (effectiveThrottle > 0.02) {
        const torqueCurve =
          0.75 + 0.45 * Math.sin(inverseLerp(idleRpm, redlineRpm, this.telemetry.rpm) * Math.PI);
        const riseRate = (6200 / inertiaMultiplier) * effectiveThrottle * torqueCurve;
        const fallRate = (2600 / inertiaMultiplier) * (1 - effectiveThrottle);
        if (this.telemetry.rpm < targetFreeRpm) {
          this.telemetry.rpm += riseRate * dt;
        } else {
          this.telemetry.rpm -= fallRate * dt;
        }
      } else {
        const rpmAboveIdle = Math.max(0, this.telemetry.rpm - idleRpm);
        const decayRate =
          (2400 + rpmAboveIdle * 0.48 * this.profile.engineBrakingFactor) / inertiaMultiplier;
        this.telemetry.rpm = Math.max(idleRpm, this.telemetry.rpm - decayRate * dt);
      }

      if (!isGpsControl) {
        const aeroDrag = 0.00045 * this.telemetry.speedKmh * this.telemetry.speedKmh;
        const rollingDrag = this.telemetry.speedKmh > 0.1 ? 1.8 : 0;
        this.telemetry.speedKmh = Math.max(
          0,
          this.telemetry.speedKmh - (aeroDrag + rollingDrag) * dt
        );
      }
    } else {
      // IN GEAR (1..6)
      const gearNum = this.telemetry.gear;
      const gearRatio = this.settings.gearRatios[gearNum];
      const finalDrive = this.settings.gearRatios.finalDrive;

      if (isGpsControl) {
        // Scale EV GPS speed into supercar RPM across all 6 gears with soft shift-glide interpolation
        const scaledDrivetrainSpeed = this.telemetry.speedKmh * EV_GPS_DRIVETRAIN_SCALE;
        const baseCoupledRpm = clamp(
          this.speedToRpm(scaledDrivetrainSpeed, gearNum),
          idleRpm,
          maxRpm
        );
        const targetGpsRpm = this.telemetry.isShifting
          ? Math.max(baseCoupledRpm, this.shiftTargetRpm)
          : baseCoupledRpm;
        const gpsRpmDamp =
          this.telemetry.isShifting && this.telemetry.shiftDirection === 'DOWN'
            ? 6.5
            : isGpsHardDecel
              ? 7.2
              : 10.5;
        const nextRpm = damp(this.telemetry.rpm, targetGpsRpm, gpsRpmDamp, dt);
        // Cap per-second RPM slew rate during GPS deceleration for ultra-smooth acoustic transition
        const maxRpmSlewPerSec = isGpsHardDecel ? 2600 : 5200;
        const maxDelta = maxRpmSlewPerSec * dt;
        this.telemetry.rpm = clamp(
          nextRpm,
          this.telemetry.rpm - maxDelta,
          this.telemetry.rpm + maxDelta
        );
      } else if (this.telemetry.isShifting) {
        const coupledRpm = Math.max(
          idleRpm,
          this.shiftTargetRpm,
          this.speedToRpm(this.telemetry.speedKmh, gearNum)
        );
        const shiftSmoothing =
          this.telemetry.shiftDirection === 'DOWN' ? 9.5 : 18;
        this.telemetry.rpm = damp(this.telemetry.rpm, coupledRpm, shiftSmoothing, dt);
      } else {
        const normRpm = inverseLerp(idleRpm, maxRpm, this.telemetry.rpm);
        const torqueFactor =
          0.65 + 0.55 * Math.sin(clamp(normRpm, 0.05, 0.95) * Math.PI);

        const driveForce =
          effectiveThrottle *
          torqueFactor *
          gearRatio *
          finalDrive *
          (6.8 / inertiaMultiplier) *
          this.telemetry.torqueInterruption;

        const aeroDrag = 0.00052 * this.telemetry.speedKmh * this.telemetry.speedKmh;
        const rollingResistance = this.telemetry.speedKmh > 0.05 ? 1.35 : 0;
        const engineBrakeDrag =
          effectiveThrottle < 0.06 && this.telemetry.rpm > idleRpm + 250
            ? (1 - effectiveThrottle * 15) *
              gearRatio *
              finalDrive *
              0.55 *
              this.profile.engineBrakingFactor *
              normRpm
            : 0;

        const maxGearSpeedKmh = this.rpmToSpeed(maxRpm - 25, gearNum);
        const limiterCut =
          this.telemetry.rpm >= maxRpm - 65 ||
          this.telemetry.speedKmh >= maxGearSpeedKmh
            ? 0.0
            : 1.0;

        const netAccelKmhPerSec =
          driveForce * limiterCut - aeroDrag - rollingResistance - engineBrakeDrag;

        this.telemetry.speedKmh = clamp(
          this.telemetry.speedKmh + netAccelKmhPerSec * dt,
          0,
          Math.min(350, maxGearSpeedKmh)
        );

        const coupledRpm = this.speedToRpm(this.telemetry.speedKmh, gearNum);
        const launchSlipRpm =
          idleRpm + effectiveThrottle * (2400 / Math.sqrt(gearNum));
        const targetInGearRpm = Math.max(coupledRpm, launchSlipRpm);

        this.telemetry.rpm = damp(this.telemetry.rpm, targetInGearRpm, 18 / inertiaMultiplier, dt);
      }

      // Automatic transmission upshift/downshift logic
      if (
        this.telemetry.transmissionMode === 'AUTO' &&
        !this.telemetry.isShifting &&
        this.autoShiftCooldown <= 0
      ) {
        const autoUpshiftRpm = isGpsControl
          ? lerp(4400, redlineRpm - 250, clamp(effectiveThrottle * 1.3, 0, 1))
          : lerp(
              Math.min(4200, redlineRpm * 0.62),
              redlineRpm - 140,
              clamp(effectiveThrottle * 1.25, 0, 1)
            );

        const effectiveSpeedForDownshift = isGpsControl
          ? this.telemetry.speedKmh * EV_GPS_DRIVETRAIN_SCALE
          : this.telemetry.speedKmh;
        const lowerGearCoupledRpm =
          gearNum > 1
            ? this.speedToRpm(effectiveSpeedForDownshift, (gearNum - 1) as Gear)
            : idleRpm;

        if (this.telemetry.rpm >= autoUpshiftRpm && gearNum < 6 && effectiveThrottle > 0.05) {
          this.shiftUp();
          this.autoShiftCooldown = 0.42;
        } else if (
          isGpsHardDecel &&
          gearNum > 1 &&
          this.telemetry.rpm <= 3550 &&
          lowerGearCoupledRpm <= 4150
        ) {
          // Responsive yet gentle sequential downshift when EV GPS speed drops/stops drastically
          this.shiftDown();
          this.autoShiftCooldown = 0.40;
        } else if (
          this.telemetry.rpm < 2350 &&
          gearNum > 1 &&
          lowerGearCoupledRpm < redlineRpm - 900
        ) {
          this.shiftDown();
          this.autoShiftCooldown = 0.38;
        }
      }
    }

    // 6. Subtle organic idle micro-fluctuation (with authentic cam-lope chop for Cross-Plane Mustang GT V8)
    if (effectiveThrottle < 0.02 && this.telemetry.rpm < idleRpm + 180) {
      const isCrossPlane = this.profile.crankConfiguration === 'CROSS_PLANE_V8';
      this.idleJitterPhase += dt * (isCrossPlane ? 16.5 : 11.5);
      const lopeScale = isCrossPlane ? 2.1 : 1.0;
      const jitter =
        (Math.sin(this.idleJitterPhase) * 9 +
          Math.cos(this.idleJitterPhase * 1.5) * 6) *
        lopeScale;
      this.telemetry.rpm = Math.max(idleRpm - 28, this.telemetry.rpm + jitter * dt * 5);
    }

    // 7. Rev Limiter Logic (hard ignition cut near maxRpm)
    const limiterThreshold = maxRpm - 65;
    if (this.telemetry.rpm >= limiterThreshold && effectiveThrottle > 0.1) {
      this.telemetry.isRevLimiter = true;
      this.limiterPhase += dt * this.profile.revLimiterHz * Math.PI * 2;
      const bounce = Math.sin(this.limiterPhase) * 85;
      this.telemetry.rpm = clamp(limiterThreshold + bounce, limiterThreshold - 110, maxRpm);
      this.telemetry.torqueInterruption = Math.sin(this.limiterPhase) > 0 ? 0.9 : 0.05;
      if (this.popCooldown <= 0 && Math.sin(this.limiterPhase) < -0.7) {
        this.telemetry.exhaustPopTrigger += 1;
        this.popCooldown = 0.07;
      }
    } else {
      this.telemetry.isRevLimiter = false;
      this.telemetry.rpm = clamp(this.telemetry.rpm, idleRpm - 30, maxRpm);
    }

    // 8. Redline and Shift Warning indicators
    this.telemetry.isRedline = this.telemetry.rpm >= redlineRpm;
    this.telemetry.isShiftWarning = this.telemetry.rpm >= redlineRpm - 350;

    // 9. Turbocharger Spool & Signature Blow-Off Valve Hiss ("Desisan Khas Turbo")
    if (this.settings.turboEnabled) {
      const rpmFactor = inverseLerp(idleRpm + 350, redlineRpm * 0.8, this.telemetry.rpm);
      const targetBoost = clamp(
        effectiveThrottle * (0.32 + 0.82 * rpmFactor) + rpmFactor * 0.14,
        0,
        1
      );
      const spoolRate = targetBoost > this.telemetry.turboBoost ? 4.8 : 6.2;

      const throttleDrop = this.previousThrottle - effectiveThrottle;
      if (
        throttleDrop > 0.14 &&
        this.telemetry.turboBoost > 0.15 &&
        this.blowOffCooldown <= 0
      ) {
        this.telemetry.blowOffTrigger += 1;
        this.blowOffCooldown = 0.28;
      }

      this.telemetry.turboBoost = damp(this.telemetry.turboBoost, targetBoost, spoolRate, dt);
    } else {
      this.telemetry.turboBoost = damp(this.telemetry.turboBoost, 0, 8.0, dt);
    }

    // 10. Engine Braking & Overrun Burble Simulation
    const isOffThrottleHighRpm =
      effectiveThrottle < 0.04 && this.telemetry.rpm > idleRpm + 550;
    if (isOffThrottleHighRpm) {
      const overrunNorm = inverseLerp(idleRpm + 550, redlineRpm, this.telemetry.rpm);
      const targetBraking = clamp(overrunNorm * this.profile.engineBrakingFactor, 0, 1);
      this.telemetry.engineBrakingIntensity = damp(
        this.telemetry.engineBrakingIntensity,
        targetBraking,
        10,
        dt
      );

      if (
        this.popCooldown <= 0 &&
        this.telemetry.rpm > 2100 &&
        Math.random() < this.profile.burbleIntensity * overrunNorm * 0.45
      ) {
        this.telemetry.exhaustPopTrigger += 1;
        this.popCooldown = 0.055 + Math.random() * 0.09;
      }
    } else {
      this.telemetry.engineBrakingIntensity = damp(
        this.telemetry.engineBrakingIntensity,
        0,
        12,
        dt
      );
    }

    // 11. Engine Load & State Classification
    const rawLoad = clamp(
      effectiveThrottle * 0.85 +
        inverseLerp(idleRpm, maxRpm, this.telemetry.rpm) * 0.15,
      0.08,
      1.0
    );
    this.telemetry.engineLoad = damp(this.telemetry.engineLoad, rawLoad, 12, dt);

    if (this.telemetry.isRevLimiter) {
      this.telemetry.engineState = 'REV_LIMITER';
    } else if (effectiveThrottle > 0.12) {
      if (
        this.telemetry.gear !== 'N' &&
        Math.abs(this.telemetry.speedKmh - prevSpeed) / dt < 1.2 &&
        effectiveThrottle < 0.45
      ) {
        this.telemetry.engineState = 'CRUISING';
      } else {
        this.telemetry.engineState = 'ACCELERATING';
      }
    } else if (this.telemetry.engineBrakingIntensity > 0.18) {
      this.telemetry.engineState = 'ENGINE_BRAKING';
    } else if (this.telemetry.rpm > idleRpm + 250) {
      this.telemetry.engineState = 'DECELERATING';
    } else {
      this.telemetry.engineState = 'IDLE';
    }

    // 12. Longitudinal G-force approximation & Fuel consumption
    const accelMps2 = ((this.telemetry.speedKmh - prevSpeed) / dt) / 3.6;
    this.telemetry.accelerationG = damp(this.telemetry.accelerationG, accelMps2 / 9.81, 8, dt);

    const fuelBurnRate =
      0.008 +
      effectiveThrottle * 0.065 +
      inverseLerp(idleRpm, maxRpm, this.telemetry.rpm) * 0.032;
    this.telemetry.fuelLevel = Math.max(
      2,
      this.telemetry.fuelLevel - fuelBurnRate * dt
    );

    this.previousThrottle = effectiveThrottle;
    return this.telemetry;
  }
}
