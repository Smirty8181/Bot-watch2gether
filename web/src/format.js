export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h}:${String(m % 60).padStart(2, "0")}:${s}`;
  return `${m}:${s}`;
}

export function ding() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  } catch {
    /* ignore */
  }
}
