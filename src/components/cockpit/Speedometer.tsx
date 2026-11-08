import React, { useEffect, useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import { SimulationTelemetry } from '../../engine/types';
import { ExternalSensorSnapshot } from '../../telemetry/TelemetryProvider';
import { clamp, lerp } from '../../utils/interpolation';

const KMH_TO_MPH = 0.621371;
const MAX_MPH = 180;

interface SpeedometerProps {
  telemetryRef?: React.MutableRefObject<SimulationTelemetry>;
  speedKmh: number;
  accelerationG: number;
  sensorSnapshot: ExternalSensorSnapshot;
}

export const Speedometer: React.FC<SpeedometerProps> = ({
  telemetryRef,
  speedKmh,
  sensorSnapshot,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedMphRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    // 270-degree sweep matching the Left RPM Tachometer
    const START_ANGLE = (135 * Math.PI) / 180;
    const END_ANGLE = (405 * Math.PI) / 180;
    const SWEEP = END_ANGLE - START_ANGLE;

    const render = () => {
      const liveKmh = telemetryRef ? telemetryRef.current.speedKmh : speedKmh;
      const engineOn = telemetryRef
        ? telemetryRef.current.engineState !== 'OFF'
        : true;
      const targetMph = clamp(liveKmh * KMH_TO_MPH, 0, MAX_MPH);

      smoothedMphRef.current = lerp(smoothedMphRef.current, targetMph, 0.25);
      const displayMph = clamp(smoothedMphRef.current, 0, MAX_MPH);

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height) || 340;

      if (
        canvas.width !== Math.floor(size * dpr) ||
        canvas.height !== Math.floor(size * dpr)
      ) {
        canvas.width = Math.floor(size * dpr);
        canvas.height = Math.floor(size * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const outerRadius = size * 0.46;
      const trackRadius = size * 0.41;
      const tickOuter = size * 0.43;

      // 1. Mustang GT Brushed Chrome/Gunmetal Outer Bezel Ring
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(212, 212, 216, 0.22)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 2. Deep Carbon/Charcoal Dial Face
      const faceGrad = ctx.createRadialGradient(
        cx,
        cy,
        size * 0.05,
        cx,
        cy,
        outerRadius
      );
      faceGrad.addColorStop(0, '#131722');
      faceGrad.addColorStop(0.72, '#0a0c12');
      faceGrad.addColorStop(1, '#050609');

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = faceGrad;
      ctx.fill();

      // 3. Background Track Arc
      ctx.beginPath();
      ctx.arc(cx, cy, trackRadius, START_ANGLE, END_ANGLE);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = size * 0.032;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // 4. Active MPH Dynamic Arc
      const currentAngle = START_ANGLE + (displayMph / MAX_MPH) * SWEEP;
      if (displayMph > 0.4) {
        const activeGrad = ctx.createLinearGradient(0, size, size, 0);
        activeGrad.addColorStop(0, '#38bdf8');
        activeGrad.addColorStop(0.55, '#f59e0b');
        activeGrad.addColorStop(1, '#e11d2a');

        ctx.beginPath();
        ctx.arc(cx, cy, trackRadius, START_ANGLE, currentAngle);
        ctx.strokeStyle = activeGrad;
        ctx.lineWidth = size * 0.032;
        ctx.stroke();
      }

      // 5. Tick Marks & MPH Numerals (every 5 MPH minor, 10 MPH medium, 20 MPH major)
      for (let mph = 0; mph <= MAX_MPH; mph += 5) {
        const ratio = mph / MAX_MPH;
        const angle = START_ANGLE + ratio * SWEEP;
        const isMajor = mph % 20 === 0;
        const isMid = mph % 10 === 0 && !isMajor;

        const innerLen = isMajor
          ? size * 0.052
          : isMid
            ? size * 0.034
            : size * 0.018;

        const x1 = cx + Math.cos(angle) * tickOuter;
        const y1 = cy + Math.sin(angle) * tickOuter;
        const x2 = cx + Math.cos(angle) * (tickOuter - innerLen);
        const y2 = cy + Math.sin(angle) * (tickOuter - innerLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle =
          mph <= displayMph && engineOn
            ? '#ffffff'
            : isMajor
              ? 'rgba(255, 255, 255, 0.84)'
              : 'rgba(255, 255, 255, 0.26)';
        ctx.lineWidth = isMajor ? 2.5 : isMid ? 1.5 : 1;
        ctx.stroke();

        if (isMajor) {
          const labelRadius = tickOuter - size * 0.098;
          const lx = cx + Math.cos(angle) * labelRadius;
          const ly = cy + Math.sin(angle) * labelRadius;

          ctx.font = `800 ${Math.round(size * 0.044)}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle =
            mph <= displayMph && engineOn ? '#ffffff' : '#a1a1aa';
          ctx.fillText(String(mph), lx, ly);
        }
      }

      // 6. Tapered Mustang GT Speedometer Needle
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(currentAngle);

      ctx.shadowColor = 'rgba(225, 29, 42, 0.65)';
      ctx.shadowBlur = 12;

      const needleLength = tickOuter - size * 0.015;
      const tailLength = size * 0.075;

      ctx.beginPath();
      ctx.moveTo(-tailLength, -3.5);
      ctx.lineTo(needleLength, -1.2);
      ctx.lineTo(needleLength + 4, 0);
      ctx.lineTo(needleLength, 1.2);
      ctx.lineTo(-tailLength, 3.5);
      ctx.closePath();

      const needleGrad = ctx.createLinearGradient(
        -tailLength,
        0,
        needleLength,
        0
      );
      needleGrad.addColorStop(0, '#990f19');
      needleGrad.addColorStop(0.3, '#e11d2a');
      needleGrad.addColorStop(1, '#ff4d58');
      ctx.fillStyle = needleGrad;
      ctx.fill();
      ctx.restore();

      // 7. Center Brushed Aluminum Hub Cap
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.068, 0, Math.PI * 2);
      ctx.fillStyle = '#181b22';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.025, 0, Math.PI * 2);
      ctx.fillStyle = '#e11d2a';
      ctx.fill();

      ctx.restore();
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [speedKmh, telemetryRef]);

  const displayMphInt = Math.round(clamp(speedKmh * KMH_TO_MPH, 0, MAX_MPH));
  const displayKmhInt = Math.round(clamp(speedKmh, 0, 350));
  const isGpsLocked = sensorSnapshot.gpsStatus === 'LOCKED';

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[380px] aspect-square mx-auto select-none">
      <canvas
        ref={canvasRef}
        aria-label={`Speedometer: ${displayMphInt} MPH (${displayKmhInt} km/h)`}
        role="img"
        className="w-full h-full block"
      />

      {/* Top Sub-Label inside Right Dial */}
      <div className="absolute top-[22%] flex flex-col items-center pointer-events-none">
        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400 font-semibold">
          GROUND SPEED
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-sky-400 font-bold mt-0.5 flex items-center gap-1">
          {isGpsLocked ? (
            <>
              <LocateFixed className="w-2.5 h-2.5 text-emerald-400" />
              <span className="text-emerald-400">EV GPS LIVE</span>
            </>
          ) : (
            'MPH • KM/H'
          )}
        </span>
      </div>

      {/* Bottom Digital MPH Readout inside Right Dial */}
      <div className="absolute bottom-[12%] flex flex-col items-center pointer-events-none">
        <div className="text-3xl sm:text-4xl font-mono font-black tabular-nums tracking-tight text-white leading-none">
          {displayMphInt}
        </div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.24em] text-[#e11d2a] mt-0.5">
          MPH
        </span>
        <span className="text-[9px] font-mono tabular-nums text-zinc-400">
          {displayKmhInt} km/h
        </span>
      </div>
    </div>
  );
};
