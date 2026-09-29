// Drives requestAnimationFrame off timers instead of the compositor.
//
// The automation window is occluded, so the real rAF never fires and every
// framer-motion animation freezes at its initial (opacity:0) state. That makes
// AnimatePresence mode="wait" never finish its exit, so the next view never
// mounts and navigation looks broken. This shim lets transitions complete so
// the DOM state can be asserted. Test-only; never shipped.
(() => {
  if (window.__rafShim) return;
  window.__rafShim = true;
  let nextId = 1;
  const pending = new Map();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    pending.set(id, setTimeout(() => {
      pending.delete(id);
      try { cb(performance.now()); } catch (e) { /* ignore */ }
    }, 16));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const t = pending.get(id);
    if (t) clearTimeout(t);
    pending.delete(id);
  };
  document.addEventListener('visibilitychange', () => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  });
})();
