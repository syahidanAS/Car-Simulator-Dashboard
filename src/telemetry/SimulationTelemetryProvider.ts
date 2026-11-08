import { EngineSimulation } from '../engine/EngineSimulation';
import { SimulationTelemetry } from '../engine/types';
import { clamp } from '../utils/interpolation';
import { damp } from '../utils/smoothing';
import {
  ExternalSensorSnapshot,
  ITelemetryProvider,
  TelemetryListener,
} from './TelemetryProvider';

/**
 * High-precision WGS84 Haversine distance in meters between two GPS coordinates.
 */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371008.8; // Mean Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Hybrid Local Physics + Live Browser Geolocation GPS Telemetry Provider.
 * Tracks real-time EV coordinate changes (lat/lon deltas + Doppler speed) from the device GPS module
 * and feeds continuous velocity & acceleration into the EngineSimulation.
 */
export class SimulationTelemetryProvider implements ITelemetryProvider {
  public readonly id = 'ev-gps-and-physics-simulation';
  public readonly name = 'EV Coordinate GPS & Physics Telemetry Engine';

  private simulation: EngineSimulation;
  private listeners = new Set<TelemetryListener>();
  private watchId: number | null = null;
  private pollTimerId: number | null = null;

  private prevFix: {
    lat: number;
    lon: number;
    timeMs: number;
    speedKmh: number;
  } | null = null;

  private smoothedGpsSpeedKmh = 0;
  private smoothedGpsAccel = 0;

  private sensorSnapshot: ExternalSensorSnapshot = {
    gps: {
      latitude: null,
      longitude: null,
      altitudeM: null,
      accuracyM: null,
      headingDeg: null,
      gpsSpeedKmh: null,
      coordSpeedKmh: 0,
      dopplerSpeedKmh: null,
      deltaMeters: 0,
      tripDistanceMeters: 0,
      gpsAccelKmhPerSec: 0,
      updateCount: 0,
      lastUpdated: null,
    },
    gpsStatus: 'OFF',
    gpsError: null,
    externalThrottle: null,
    sourceType: 'LOCAL_SIMULATION',
    isHardwareConnected: false,
  };

  constructor(simulation: EngineSimulation) {
    this.simulation = simulation;
  }

  public start(): void {
    // Driven by requestAnimationFrame step(dt)
  }

  public stop(): void {
    this.disableGps();
  }

  private handleGpsPosition = (position: GeolocationPosition): void => {
    const {
      latitude,
      longitude,
      altitude,
      accuracy,
      heading,
      speed,
    } = position.coords;
    const nowMs = performance.now();

    // 1. Hardware Doppler speed (if reported by device GPS module)
    const hasDoppler =
      typeof speed === 'number' && Number.isFinite(speed) && speed >= 0;
    const dopplerSpeedKmh = hasDoppler ? speed * 3.6 : null;

    // 2. Coordinate-change Haversine velocity calculation: v = (Δd / Δt) * 3.6
    let deltaMeters = 0;
    let coordSpeedKmh = 0;
    let dtSec = 0;

    if (this.prevFix) {
      dtSec = Math.max(0.05, (nowMs - this.prevFix.timeMs) / 1000);
      deltaMeters = haversineMeters(
        this.prevFix.lat,
        this.prevFix.lon,
        latitude,
        longitude
      );

      // Adaptive noise gate based on GPS accuracy so stationary jitter is ignored
      // while genuine EV movement (even slow creep) is captured
      const minMoveMeters =
        dopplerSpeedKmh !== null && dopplerSpeedKmh > 1.0
          ? 0.2
          : clamp((accuracy || 8) * 0.08, 0.5, 2.2);

      if (deltaMeters >= minMoveMeters && dtSec < 20) {
        coordSpeedKmh = (deltaMeters / dtSec) * 3.6;
      }
    }

    // 3. Fuse Doppler speed and Coordinate-delta speed
    // Crucially: if Doppler speed is null OR 0 while coordinates moved significantly, use coordSpeedKmh!
    let rawFusedSpeedKmh = 0;
    if (dopplerSpeedKmh !== null && dopplerSpeedKmh > 0.8) {
      rawFusedSpeedKmh =
        coordSpeedKmh > 0.5
          ? dopplerSpeedKmh * 0.65 + coordSpeedKmh * 0.35
          : dopplerSpeedKmh;
    } else {
      rawFusedSpeedKmh = coordSpeedKmh;
    }

    rawFusedSpeedKmh = clamp(rawFusedSpeedKmh, 0, 350);

    // Smooth speed & compute longitudinal EV acceleration (km/h per second)
    const prevSpeed = this.prevFix ? this.prevFix.speedKmh : 0;
    const instantAccel =
      dtSec > 0.05 ? clamp((rawFusedSpeedKmh - prevSpeed) / dtSec, -45, 45) : 0;

    const smoothingRate =
      rawFusedSpeedKmh < this.smoothedGpsSpeedKmh ? 4.2 : 6.5;
    const nextSmoothedSpeed = damp(
      this.smoothedGpsSpeedKmh,
      rawFusedSpeedKmh,
      smoothingRate,
      dtSec || 0.2
    );
    this.smoothedGpsSpeedKmh =
      rawFusedSpeedKmh < 0.5 && nextSmoothedSpeed < 0.8 ? 0 : nextSmoothedSpeed;
    this.smoothedGpsAccel = damp(
      this.smoothedGpsAccel,
      instantAccel,
      5.0,
      dtSec || 0.2
    );

    const addedTripMeters = deltaMeters >= 0.8 && deltaMeters < 500 ? deltaMeters : 0;

    this.prevFix = {
      lat: latitude,
      lon: longitude,
      timeMs: nowMs,
      speedKmh: this.smoothedGpsSpeedKmh,
    };

    this.sensorSnapshot = {
      gps: {
        latitude,
        longitude,
        altitudeM: typeof altitude === 'number' ? altitude : null,
        accuracyM: typeof accuracy === 'number' ? accuracy : null,
        headingDeg: typeof heading === 'number' ? heading : null,
        gpsSpeedKmh: this.smoothedGpsSpeedKmh,
        coordSpeedKmh,
        dopplerSpeedKmh,
        deltaMeters,
        tripDistanceMeters:
          this.sensorSnapshot.gps.tripDistanceMeters + addedTripMeters,
        gpsAccelKmhPerSec: this.smoothedGpsAccel,
        updateCount: this.sensorSnapshot.gps.updateCount + 1,
        lastUpdated: nowMs,
      },
      gpsStatus: 'LOCKED',
      gpsError: null,
      externalThrottle: null,
      sourceType: 'BROWSER_GPS_LIVE',
      isHardwareConnected: true,
    };

    this.simulation.setGpsTelemetryInput(
      this.smoothedGpsSpeedKmh,
      this.smoothedGpsAccel,
       true
    );
    this.notifyListeners();
  };

  private handleGpsError = (error: GeolocationPositionError): void => {
    let msg = 'Gagal membaca modul GPS perangkat.';
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      msg =
        'Browser mewajibkan koneksi HTTPS (atau localhost) untuk akses sensor GPS perangkat.';
    } else if (error.code === error.PERMISSION_DENIED) {
      msg =
        'Akses Lokasi/GPS ditolak. Harap izinkan akses Location pada browser/HP Anda.';
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      msg = 'Sinyal modul GPS belum terkunci (pastikan GPS HP/mobil aktif).';
    } else if (error.code === error.TIMEOUT) {
      msg = 'Timeout menunggu pembaruan koordinat GPS.';
    }

    if (this.sensorSnapshot.gpsStatus !== 'LOCKED') {
      this.sensorSnapshot = {
        ...this.sensorSnapshot,
        gpsStatus: 'ERROR',
        gpsError: msg,
        sourceType: 'LOCAL_SIMULATION',
        isHardwareConnected: false,
      };
      this.simulation.setGpsTelemetryInput(null, 0, false);
      this.notifyListeners();
    }
  };

  public enableGps(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.sensorSnapshot = {
        ...this.sensorSnapshot,
        gpsStatus: 'ERROR',
        gpsError: 'Geolocation/GPS tidak didukung di browser ini.',
        sourceType: 'LOCAL_SIMULATION',
        isHardwareConnected: false,
      };
      this.notifyListeners();
      return;
    }

    this.cleanupGpsWatchers();

    this.prevFix = null;
    this.smoothedGpsSpeedKmh = 0;
    this.smoothedGpsAccel = 0;

    this.sensorSnapshot = {
      ...this.sensorSnapshot,
      gpsStatus: 'SEARCHING',
      gpsError: null,
      sourceType: 'BROWSER_GPS_LIVE',
      isHardwareConnected: false,
    };

    // Engage AUTO transmission and GPS active mode on simulation
    this.simulation.setTransmissionMode('AUTO');
    this.simulation.setGpsTelemetryInput(0, 0, true);
    this.notifyListeners();

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000,
    };

    // 1. Continuous hardware GPS watch
    this.watchId = navigator.geolocation.watchPosition(
      this.handleGpsPosition,
      this.handleGpsError,
      geoOptions
    );

    // 2. Active 1Hz coordinate poll fallback for mobile browsers that buffer watchPosition
    this.pollTimerId = window.setInterval(() => {
      const lastUpdate = this.sensorSnapshot.gps.lastUpdated;
      if (!lastUpdate || performance.now() - lastUpdate > 950) {
        navigator.geolocation.getCurrentPosition(
          this.handleGpsPosition,
          () => {
            // ignore transient poll timeout if watchPosition is active
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 4000 }
        );
      }
    }, 1000);
  }

  private cleanupGpsWatchers(): void {
    if (
      this.watchId !== null &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.pollTimerId !== null) {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
  }

  public disableGps(): void {
    this.cleanupGpsWatchers();
    this.prevFix = null;
    this.smoothedGpsSpeedKmh = 0;
    this.smoothedGpsAccel = 0;
    this.simulation.setGpsTelemetryInput(null, 0, false);

    this.sensorSnapshot = {
      gps: {
        latitude: null,
        longitude: null,
        altitudeM: null,
        accuracyM: null,
        headingDeg: null,
        gpsSpeedKmh: null,
        coordSpeedKmh: 0,
        dopplerSpeedKmh: null,
        deltaMeters: 0,
        tripDistanceMeters: 0,
        gpsAccelKmhPerSec: 0,
        updateCount: 0,
        lastUpdated: null,
      },
      gpsStatus: 'OFF',
      gpsError: null,
      externalThrottle: null,
      sourceType: 'LOCAL_SIMULATION',
      isHardwareConnected: false,
    };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const telemetry = this.simulation.getTelemetry();
    const snapshot = this.getSensorSnapshot();
    this.listeners.forEach((listener) => listener(telemetry, snapshot));
  }

  public step(dt: number): SimulationTelemetry {
    // If GPS is locked but no new coordinate movement has arrived for > 2.8 seconds,
    // smoothly decay GPS velocity to 0 km/h (e.g., when EV stops at a traffic light)
    if (
      this.sensorSnapshot.gpsStatus === 'LOCKED' &&
      this.sensorSnapshot.gps.lastUpdated !== null
    ) {
      const silenceSec =
        (performance.now() - this.sensorSnapshot.gps.lastUpdated) / 1000;
      if (silenceSec > 2.8 && this.smoothedGpsSpeedKmh > 0) {
        const prev = this.smoothedGpsSpeedKmh;
        this.smoothedGpsSpeedKmh = damp(this.smoothedGpsSpeedKmh, 0, 2.5, dt);
        if (this.smoothedGpsSpeedKmh < 0.5) this.smoothedGpsSpeedKmh = 0;
        this.smoothedGpsAccel = (this.smoothedGpsSpeedKmh - prev) / Math.max(0.01, dt);
        this.sensorSnapshot.gps.gpsSpeedKmh = this.smoothedGpsSpeedKmh;
        this.sensorSnapshot.gps.gpsAccelKmhPerSec = this.smoothedGpsAccel;
        this.simulation.setGpsTelemetryInput(
          this.smoothedGpsSpeedKmh,
          this.smoothedGpsAccel,
          true
        );
      }
    }

    const telemetry = this.simulation.step(dt);
    const snapshot = this.getSensorSnapshot();
    this.listeners.forEach((listener) => listener(telemetry, snapshot));
    return telemetry;
  }

  public getLatestTelemetry(): SimulationTelemetry {
    return this.simulation.getTelemetry();
  }

  public getSensorSnapshot(): ExternalSensorSnapshot {
    return {
      ...this.sensorSnapshot,
      gps: { ...this.sensorSnapshot.gps },
    };
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
