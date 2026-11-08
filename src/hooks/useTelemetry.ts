import { useEffect, useRef, useState } from 'react';
import { ExternalSensorSnapshot, ITelemetryProvider } from '../telemetry/TelemetryProvider';

export function useTelemetry(provider: ITelemetryProvider) {
  const [sensorSnapshot, setSensorSnapshot] = useState<ExternalSensorSnapshot>(() =>
    provider.getSensorSnapshot()
  );
  const latestTelemetryRef = useRef(provider.getLatestTelemetry());
  const lastSensorUpdateRef = useRef(0);

  useEffect(() => {
    provider.start();
    const unsubscribe = provider.subscribe((telemetry, sensors) => {
      latestTelemetryRef.current = telemetry;
      const now = performance.now();
      setSensorSnapshot((prev) => {
        const statusChanged =
          prev.gpsStatus !== sensors.gpsStatus ||
          prev.gpsError !== sensors.gpsError ||
          prev.sourceType !== sensors.sourceType ||
          prev.isHardwareConnected !== sensors.isHardwareConnected ||
          prev.gps.updateCount !== sensors.gps.updateCount;
        const speedDecayed =
          now - lastSensorUpdateRef.current > 150 &&
          prev.gps.gpsSpeedKmh !== sensors.gps.gpsSpeedKmh;

        if (statusChanged || speedDecayed) {
          lastSensorUpdateRef.current = now;
          return { ...sensors, gps: { ...sensors.gps } };
        }
        return prev;
      });
    });
    return () => {
      unsubscribe();
      provider.stop();
    };
  }, [provider]);

  return {
    latestTelemetryRef,
    sensorSnapshot,
  };
}
