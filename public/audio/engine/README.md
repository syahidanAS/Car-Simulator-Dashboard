# Engine Audio Sample Stems (`public/audio/engine/`)

Place optional legally licensed or custom-recorded `.wav` stems in this directory to enable external sample crossfading alongside the real-time Web Audio DSP synthesizer:

- `idle.wav`
- `low-rpm.wav`
- `mid-rpm.wav`
- `high-rpm.wav`
- `acceleration.wav`
- `deceleration.wav`
- `engine-braking.wav`
- `turbo-spool.wav`
- `turbo-blowoff.wav`

When these files are not present, `AudioProcessor.ts` automatically operates in **PROCEDURAL HYBRID DSP** mode and displays `DSP: PROCEDURAL HYBRID DSP` in the cockpit header and settings modal.

