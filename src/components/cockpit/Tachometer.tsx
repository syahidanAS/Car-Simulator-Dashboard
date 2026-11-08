import React, { useEffect, useRef } from 'react';
import {
  EngineProfile,
  SimulationTelemetry,
  UserSettings,
} from '../../engine/types';
import { clamp, inverseLerp, lerp } from '../../utils/interpolation';

interface TachometerProps {
  telemetryRef: React.MutableRefObject<SimulationTelemetry>;
  telemetry: SimulationTelemetry;
  profile: EngineProfile;
  settings: UserSettings;
}

export const Tachometer: React.FC<TachometerProps> = ({
  telemetryRef,
  telemetry,
  profile,
  settings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedRpmRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    // Angles in radians: 135 deg (bottom-left) to 405 deg (bottom-right) -> 270 deg sweep
    const START_ANGLE = (135 * Math.PI) / 180;
    const END_ANGLE = (405 * Math.PI) / 180;
    const SWEEP = END_ANGLE - START_ANGLE;

    const render = () => {
      const live = telemetryRef.current;
      const maxRpm = Math.max(7000, settings.maxRpm);
      const redlineRpm = clamp(settings.redlineRpm, 5500, maxRpm - 100);
      const idleRpm = clamp(settings.idleRpm, 600, 2000);

      // Smooth needle interpolation at display refresh rate
      smoothedRpmRef.current = lerp(smoothedRpmRef.current, live.rpm, 0.28);
      const displayRpm = clamp(smoothedRpmRef.current, 0, maxRpm);

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height) || 340;

      if (canvas.width !== Math.floor(size * dpr) || canvas.height !== Math.floor(size * dpr)) {
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

      // 1. Outer Metallic Bezel Ring
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = live.isRedline
        ? 'rgba(255, 40, 54, 0.65)'
        : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 2. Dial Face Radial Gradient
      const faceGrad = ctx.createRadialGradient(
        cx,
        cy,
        size * 0.05,
        cx,
        cy,
        outerRadius
      );
      faceGrad.addColorStop(0, '#14171f');
      faceGrad.addColorStop(0.72, '#0b0d12');
      faceGrad.addColorStop(1, '#06070a');

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = faceGrad;
      ctx.fill();

      // Subtle redline ambient glow inside the dial when near or above redline
      if (displayRpm > redlineRpm - 500) {
        const redIntensity = inverseLerp(redlineRpm - 500, maxRpm, displayRpm);
        const redGlow = ctx.createRadialGradient(
          cx,
          cy,
          size * 0.1,
          cx,
          cy,
          outerRadius
        );
        redGlow.addColorStop(0, `rgba(225, 29, 42, ${0.06 * redIntensity})`);
        redGlow.addColorStop(1, `rgba(225, 29, 42, ${0.26 * redIntensity})`);
        ctx.beginPath();
        ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = redGlow;
        ctx.fill();
      }

      // 3. Background Track Arc
      ctx.beginPath();
      ctx.arc(cx, cy, trackRadius, START_ANGLE, END_ANGLE);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = size * 0.032;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // 4. Idle RPM Marker Arc
      const idleAngle = START_ANGLE + (idleRpm / maxRpm) * SWEEP;
      ctx.beginPath();
      ctx.arc(cx, cy, trackRadius, idleAngle - 0.015, idleAngle + 0.015);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = size * 0.038;
      ctx.stroke();

      // 5. Redline Zone Arc
      const redlineAngle = START_ANGLE + (redlineRpm / maxRpm) * SWEEP;
      ctx.beginPath();
      ctx.arc(cx, cy, trackRadius, redlineAngle, END_ANGLE);
      ctx.strokeStyle = 'rgba(225, 29, 42, 0.35)';
      ctx.lineWidth = size * 0.032;
      ctx.stroke();

      // 6. Active RPM Dynamic Arc
      const currentAngle = START_ANGLE + (displayRpm / maxRpm) * SWEEP;
      if (displayRpm > 20) {
        const activeGrad = ctx.createLinearGradient(0, size, size, 0);
        activeGrad.addColorStop(0, '#f59e0b');
        activeGrad.addColorStop(0.6, '#e11d2a');
        activeGrad.addColorStop(1, '#ff2836');

        ctx.beginPath();
        ctx.arc(cx, cy, trackRadius, START_ANGLE, currentAngle);
        ctx.strokeStyle = displayRpm >= redlineRpm ? '#ff2836' : activeGrad;
        ctx.lineWidth = size * 0.032;
        ctx.stroke();
      }

      // 7. Tick Marks & Numerals (every 200 RPM minor, every 1000 RPM major)
      const maxThousands = Math.ceil(maxRpm / 1000);
      const stepRpm = 200;

      for (let r = 0; r <= maxRpm; r += stepRpm) {
        const ratio = r / maxRpm;
        const angle = START_ANGLE + ratio * SWEEP;
        const isMajor = r % 1000 === 0;
        const isHalf = r % 500 === 0 && !isMajor;
        const isRedZone = r >= redlineRpm;

        const innerLen = isMajor
          ? size * 0.052
          : isHalf
            ? size * 0.034
            : size * 0.02;

        const x1 = cx + Math.cos(angle) * tickOuter;
        const y1 = cy + Math.sin(angle) * tickOuter;
        const x2 = cx + Math.cos(angle) * (tickOuter - innerLen);
        const y2 = cy + Math.sin(angle) * (tickOuter - innerLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isRedZone
          ? '#ff2836'
          : r <= displayRpm && live.engineState !== 'OFF'
            ? '#ffffff'
            : isMajor
              ? 'rgba(255, 255, 255, 0.82)'
              : 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = isMajor ? 2.5 : isHalf ? 1.5 : 1;
        ctx.stroke();

        // Major numeral (0..9)
        if (isMajor && r / 1000 <= maxThousands) {
          const labelRadius = tickOuter - size * 0.095;
          const lx = cx + Math.cos(angle) * labelRadius;
          const ly = cy + Math.sin(angle) * labelRadius;

          ctx.font = `800 ${Math.round(size * 0.056)}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isRedZone
            ? '#ff2836'
            : r <= displayRpm && live.engineState !== 'OFF'
              ? '#ffffff'
              : '#a1a1aa';
          ctx.fillText(String(r / 1000), lx, ly);
        }
      }

      // 8. Tapered Precision Tachometer Needle
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(currentAngle);

      // Needle drop shadow / glow
      ctx.shadowColor = live.isRedline
        ? 'rgba(255, 40, 54, 0.9)'
        : 'rgba(225, 29, 42, 0.65)';
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

      const needleGrad = ctx.createLinearGradient(-tailLength, 0, needleLength, 0);
      needleGrad.addColorStop(0, '#990f19');
      needleGrad.addColorStop(0.3, '#e11d2a');
      needleGrad.addColorStop(1, '#ff4d58');
      ctx.fillStyle = needleGrad;
      ctx.fill();
      ctx.restore();

      // 9. Center Machined Hub Cap
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.068, 0, Math.PI * 2);
      ctx.fillStyle = '#181b22';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
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
  }, [settings.idleRpm, settings.maxRpm, settings.redlineRpm, telemetryRef]);

  const roundedRpm = Math.round(telemetry.rpm);

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[380px] aspect-square mx-auto select-none">
      <canvas
        ref={canvasRef}
        aria-label={`Engine Tachometer: ${roundedRpm} RPM`}
        role="img"
        className="w-full h-full block"
      />

      {/* Top Sub-Label inside Dial */}
      <div className="absolute top-[22%] flex flex-col items-center pointer-events-none">
        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400 font-semibold">
          RPM x 1000
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-[#e11d2a] font-bold mt-0.5">
          {profile.code} • {profile.aspiration}
        </span>
      </div>

      {/* Bottom Digital Telemetry Readout inside Dial */}
      <div className="absolute bottom-[13%] flex flex-col items-center pointer-events-none">
        {telemetry.isRedline && (
          <div className="mb-1 px-2 py-0.5 rounded bg-[#e11d2a] text-white text-[9px] font-mono font-black uppercase tracking-[0.2em] animate-pulse shadow-[0_0_12px_rgba(225,29,42,0.9)]">
            {telemetry.isRevLimiter ? 'LIMITER CUT' : 'REDLINE'}
          </div>
        )}
        <div
          className={`text-2xl sm:text-3xl font-mono font-black tabular-nums tracking-tight ${
            telemetry.isRedline
              ? 'text-[#ff2836] drop-shadow-[0_0_10px_rgba(255,40,54,0.6)]'
              : 'text-white'
          }`}
        >
          {roundedRpm.toLocaleString()}
        </div>
        <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-zinc-400">
          DIGITAL R/MIN
        </span>
      </div>
    </div>
  );
};

