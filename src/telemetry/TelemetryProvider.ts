import { SimulationTelemetry } from '../engine/types';

export type GpsConnectionStatus = 'OFF' | 'SEARCHING' | 'LOCKED' | 'ERROR';

export interface GpsCoordinates {
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  accuracyM: number | null;
  headingDeg: number | null;
  gpsSpeedKmh: number | null;
  coordSpeedKmh: number;
  dopplerSpeedKmh: number | null;
  deltaMeters: number;
  tripDistanceMeters: number;
  gpsAccelKmhPerSec: number;
  updateCount: number;
  lastUpdated: number | null;
}

export interface ExternalSensorSnapshot {
  gps: GpsCoordinates;
  gpsStatus: GpsConnectionStatus;
  gpsError: string | null;
  externalThrottle: number | null;
  sourceType: 'LOCAL_SIMULATION' | 'BROWSER_GPS_LIVE' | 'ESP32_MQTT' | 'RASPBERRY_PI_SERIAL';
  isHardwareConnected: boolean;
}

export type TelemetryListener = (
  telemetry: SimulationTelemetry,
  sensorInfo: ExternalSensorSnapshot
) => void;

/**
 * Abstract interface for vehicle telemetry providers.
 * Supports local physics simulation, live Browser Geolocation GPS coordinate tracking for EVs,
 * and future Raspberry Pi / ESP32 hardware providers.
 */
export interface ITelemetryProvider {
  readonly id: string;
  readonly name: string;
  start(): void;
  stop(): void;
  enableGps(): void;
  disableGps(): void;
  getLatestTelemetry(): SimulationTelemetry;
  getSensorSnapshot(): ExternalSensorSnapshot;
  subscribe(listener: TelemetryListener): () => void;
}
