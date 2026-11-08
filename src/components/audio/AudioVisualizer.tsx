import React, { useEffect, useRef } from 'react';
import { AudioEngine } from '../../engine/AudioEngine';
import { AudioSystemStatus, SimulationTelemetry } from '../../engine/types';

interface AudioVisualizerProps {
  audioStatus: AudioSystemStatus;
  telemetry: SimulationTelemetry;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioStatus,
  telemetry,
}) => {
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const waveCanvas = waveformCanvasRef.current;
    const specCanvas = spectrumCanvasRef.current;
    if (!waveCanvas || !specCanvas) return;

    const waveCtx = waveCanvas.getContext('2d');
    const specCtx = specCanvas.getContext('2d');
    if (!waveCtx || !specCtx) return;

    let rafId = 0;
    const timeData = new Uint8Array(1024);
    const freqData = new Uint8Array(512);

    const draw = () => {
      const { master } = AudioEngine.getInstance().getAnalysers();
      const dpr = window.devicePixelRatio || 1;

      // 1. Render Time-Domain Waveform
      const wRect = waveCanvas.getBoundingClientRect();
      const wWidth = Math.max(120, wRect.width);
      const wHeight = Math.max(48, wRect.height);

      if (
        waveCanvas.width !== Math.floor(wWidth * dpr) ||
        waveCanvas.height !== Math.floor(wHeight * dpr)
      ) {
        waveCanvas.width = Math.floor(wWidth * dpr);
        waveCanvas.height = Math.floor(wHeight * dpr);
      }

      waveCtx.save();
      waveCtx.scale(dpr, dpr);
      waveCtx.clearRect(0, 0, wWidth, wHeight);

      // Subtle center reference grid line
      waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      waveCtx.lineWidth = 1;
      waveCtx.beginPath();
      waveCtx.moveTo(0, wHeight / 2);
      waveCtx.lineTo(wWidth, wHeight / 2);
      waveCtx.stroke();

      if (master) {
        master.getByteTimeDomainData(timeData);
      } else {
        timeData.fill(128);
      }

      waveCtx.lineWidth = 1.8;
      waveCtx.strokeStyle = '#ff2836';
      waveCtx.beginPath();

      const sliceWidth = wWidth / timeData.length;
      let x = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * wHeight) / 2;
        if (i === 0) {
          waveCtx.moveTo(x, y);
        } else {
          waveCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      waveCtx.stroke();
      waveCtx.restore();

      // 2. Render Frequency Spectrum
      const sRect = specCanvas.getBoundingClientRect();
      const sWidth = Math.max(120, sRect.width);
      const sHeight = Math.max(48, sRect.height);

      if (
        specCanvas.width !== Math.floor(sWidth * dpr) ||
        specCanvas.height !== Math.floor(sHeight * dpr)
      ) {
        specCanvas.width = Math.floor(sWidth * dpr);
        specCanvas.height = Math.floor(sHeight * dpr);
      }

      specCtx.save();
      specCtx.scale(dpr, dpr);
      specCtx.clearRect(0, 0, sWidth, sHeight);

      if (master) {
        master.getByteFrequencyData(freqData);
      } else {
        freqData.fill(0);
      }

      const barCount = 48;
      const barGap = 2;
      const barWidth = (sWidth - barGap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        // Focus on the first ~180 FFT bins where engine harmonics and music energy live
        const binIndex = Math.floor((i / barCount) * 180);
        const val = freqData[binIndex] / 255;
        const barH = Math.max(2, val * (sHeight - 4));
        const bx = i * (barWidth + barGap);
        const by = sHeight - barH;

        const grad = specCtx.createLinearGradient(0, sHeight, 0, 0);
        grad.addColorStop(0, '#990f19');
        grad.addColorStop(0.65, '#e11d2a');
        grad.addColorStop(1, '#f59e0b');

        specCtx.fillStyle = grad;
        specCtx.fillRect(bx, by, barWidth, barH);
      }

      specCtx.restore();

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const enginePct = Math.round(audioStatus.engineLevel * 100);
  const musicPct = Math.round(audioStatus.musicLevel * 100);
  const firingFreq = Math.round(
    (telemetry.rpm *
      (telemetry.profileId === 'na_v12'
        ? 12
        : telemetry.profileId === 'v8_performance' ||
            telemetry.profileId === 'mustang_gt_v8'
          ? 8
          : 6)) /
      120
  );

  return (
    <section
      aria-label="Real-Time DSP Oscilloscope & Spectrum Analyzer"
      className="cockpit-panel rounded-xl p-3 border border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center"
    >
      {/* Left: Time-Domain Waveform */}
      <div className="lg:col-span-4 bg-[#0a0b0e] rounded-lg p-2.5 border border-white/5 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
            REAL-TIME WAVEFORM (OSCILLOSCOPE)
          </span>
          <span className="text-[10px] font-mono tabular-nums text-[#ff2836]">
            {firingFreq} HZ PULSE
          </span>
        </div>
        <canvas
          ref={waveformCanvasRef}
          aria-label="Audio Output Waveform"
          className="w-full h-14 block"
        />
      </div>

      {/* Center: FFT Frequency Spectrum */}
      <div className="lg:col-span-5 bg-[#0a0b0e] rounded-lg p-2.5 border border-white/5 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
            HARMONIC FREQUENCY SPECTRUM (FFT)
          </span>
          <span className="text-[10px] font-mono tabular-nums text-amber-400">
            {audioStatus.masterLevelDb > -58
              ? `${audioStatus.masterLevelDb.toFixed(1)} dBFS`
              : '-∞ dBFS'}
          </span>
        </div>
        <canvas
          ref={spectrumCanvasRef}
          aria-label="Audio Frequency Spectrum"
          className="w-full h-14 block"
        />
      </div>

      {/* Right: Channel Activity Meters & Live Telemetry Summary */}
      <div className="lg:col-span-3 bg-[#0a0b0e] rounded-lg p-2.5 border border-white/5 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
            BUS CHANNEL METERS
          </span>
          <span className="text-[9px] font-mono uppercase text-emerald-400">
            COMPRESSOR ON
          </span>
        </div>

        {/* Engine Channel VU Meter */}
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-zinc-400">CH1 ENGINE SYNTH</span>
            <span className="tabular-nums text-white font-semibold">{enginePct}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-[#ff2836] transition-all duration-75"
              style={{ width: `${enginePct}%` }}
            />
          </div>
        </div>

        {/* Music Channel VU Meter */}
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-zinc-400">CH2 MUSIC PLAYER</span>
            <span className="tabular-nums text-white font-semibold">{musicPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-75"
              style={{ width: `${musicPct}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

