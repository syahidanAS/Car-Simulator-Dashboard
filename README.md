# FERRARI VIRTUAL COCKPIT & ENGINE SIMULATOR

Real-time supercar virtual cockpit, hybrid Web Audio API engine synthesizer, 6-speed F1 manual/automatic transmission simulator, integrated infotainment music player, and **EV GPS Coordinate Velocity Sync** built with React, Vite, TypeScript, and Tailwind CSS.

---

## 1. Quick Start & Ubuntu Server Deployment (Port `5013`)

### Deploy with Docker Compose on Ubuntu Server
The project is pre-configured to build and serve on **port `5013`** via Docker and Nginx:

```bash
# 1. Build and start the container in detached mode
docker compose up -d --build

# 2. Check container health and logs
docker compose ps
docker compose logs -f
```

The application will be available at:
- **`http://<ubuntu-server-ip>:5013`**
- Healthcheck endpoint: **`http://<ubuntu-server-ip>:5013/healthz`**

> **Important Note for EV Browser GPS (`navigator.geolocation`)**:
> Modern mobile and in-car browsers require a **Secure Context (`HTTPS`)** outside `localhost` to grant GPS sensor access. When accessing from your EV over the internet, point your reverse proxy (Nginx / Cloudflare Tunnel / Caddy) with SSL (`https://`) to `http://127.0.0.1:5013`.

### Local Development
```bash
npm install
npm run dev
```

---

## 2. Engine Audio Synthesis Architecture

The audio engine (`src/engine/`) uses a single shared `AudioContext` and synthesizes six distinct acoustic layers in real time without relying on static MP3 pitch-shifting:

1. **Combustion Layer (`CombustionSynth.ts`)**:
   - Uses 64-harmonic `PeriodicWave` synthesis across a full $720^\circ$ four-stroke crankshaft cycle (`f_cycle = RPM / 120`).
   - Models cylinder-specific firing intervals, including the **Ferrari 296 GTB $120^\circ$ V6 Twin-Turbo**, **Mustang GT 5.0L Coyote Cross-Plane V8** (`1-3-7-2-6-5-4-8` firing order with bank-pairing burble), **Naturally Aspirated V12**, **Flat-Plane V8**, and **Track Mode**.
2. **Exhaust Layer (`ExhaustSynth.ts`)**:
   - Dual RPM-tracking bandpass formant filters, H-pipe/X-pipe sub-bass resonance, asymmetric `WaveShaperNode` saturation, and overrun crackle/burble synthesis during deceleration.
3. **Intake & Mechanical Layers (`CombustionSynth.ts`)**:
   - Throttle-dependent intake air rush and gear-whine harmonic oscillator scaled to drivetrain RPM.
4. **Turbocharger & Blow-Off Valve (`TurboSynth.ts`)**:
   - High-frequency compressor blade spool whistle (`1.9–6.8 kHz`), pressurized boost air hiss, and dual-mode **Blow-Off Valve (`PSSSHHH!` pneumatic dump + 5-pulse `Stu-tu-tu` compressor flutter)** triggered automatically on high-boost throttle release, upshifts, or manually via the **BOV HISS** button.
5. **Master Bus (`AudioMixer.ts`)**:
   - Independent gain stages for Master, Engine, and Music channels routed through a master `DynamicsCompressorNode`, `StereoPannerNode`, and `AnalyserNode` (`fftSize = 2048`).

---

## 3. Physics, Transmission & EV GPS Coordinate Simulation

- **Drivetrain & 6-Speed Gearbox (`EngineSimulation.ts`)**:
  - Supports **Manual (`N, 1, 2, 3, 4, 5, 6`)** and **Automatic (`AUTO`)** modes with realistic clutch engagement, rev-drop on upshift, rev-match blip on downshift, and hard fuel-cut rev limiter oscillation.
- **EV GPS Coordinate Sync (`SimulationTelemetryProvider.ts`)**:
  - Connects directly to `navigator.geolocation.watchPosition` (`enableHighAccuracy: true, maximumAge: 0`) with an active 1Hz coordinate polling fallback.
  - Calculates real-time vehicle speed from Haversine coordinate deltas ($\Delta \text{lat}, \Delta \text{lon} \rightarrow \frac{\Delta d}{\Delta t} \times 3.6\text{ km/h}$) fused with hardware Doppler speed, driving the speedometer, automatic gear shifts, turbo boost spool on acceleration, and BOV hiss + engine braking burble when the EV decelerates.

---

## 4. MinIO S3 Cloud Music Storage (`car-simulator`)

The cockpit music player automatically stores and streams audio tracks (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`) from your **MinIO S3 Bucket** via the built-in AWS Signature Version 4 gateway ([`server/s3MinioHandler.mjs`](file:///Users/syahidan/Documents/car-simulator-project/server/s3MinioHandler.mjs)):

```env
AWS_ACCESS_KEY_ID=E058VA970PLY1X2NY8ME
AWS_SECRET_ACCESS_KEY=wjMsNEvVUGIUdwPCVpB6g1KkGaoplZOA+J127+C9
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=car-simulator
AWS_USE_PATH_STYLE_ENDPOINT=true
AWS_ENDPOINT=http://100.88.163.2:9000
AWS_URL=http://100.88.163.2:9000/smart-sdmk
PORT=5013
```

- **Auto-Bucket Creation**: Automatically verifies and creates the `car-simulator` bucket on MinIO if it does not exist yet.
- **Cross-Device Playlist Persistence**: Tracks uploaded from the cockpit UI (or dropped directly into the `car-simulator` bucket via MinIO Console) are automatically listed and streamed with HTTP `Range` support and CORS headers so the Web Audio API waveform and FFT spectrum analyzer work seamlessly across all devices.

---

## 5. Adding Custom Engine Sound Profiles

To add a new engine profile, add an entry to `ENGINE_PROFILES` in `src/engine/EngineProfiles.ts` and register its `EngineProfileId` in `src/engine/types.ts`:
- Configure `cylinders`, `idleRpm`, `redlineRpm`, `maxRpm`, `hasTurbo`, `exhaustBaseFreq`, `exhaustResonance`, `harmonicWeights`, `distortionAmount`, and `burbleIntensity`.
- For custom firing-order waveforms, add the firing angle intervals in `buildFiringOrderWave()` inside `src/engine/CombustionSynth.ts`.

