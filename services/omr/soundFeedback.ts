let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx =
      typeof window !== 'undefined'
        ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!Ctx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playBeep(freqHz: number, startOffsetSec: number, durationSec: number, volume = 0.08) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const startAt = ctx.currentTime + startOffsetSec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqHz, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.02);
  } catch {
    /* audio playback is optional */
  }
}

export function playScanSuccessTone(muted = false) {
  if (muted) return;
  playBeep(880, 0, 0.09, 0.08);
  playBeep(1174.66, 0.095, 0.13, 0.09);
}

export function playScanFlagTone(muted = false) {
  if (muted) return;
  playBeep(660, 0, 0.1, 0.08);
  playBeep(523.25, 0.11, 0.14, 0.08);
}
