import { flushSync } from 'react-dom';

let queued: (() => void)[] | null = null;
let active: ViewTransition | null = null;

// Only month boundaries use this effect. It updates the UI once and never
// replays the navigation or its server request.
export function changeMonth(update: () => void) {
  if (queued) { queued.push(update); return; }
  if (!document.startViewTransition || document.visibilityState === 'hidden'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update(); return;
  }
  active?.skipTransition();
  queued = [update];
  const commit = () => {
    const updates = queued;
    queued = null;
    if (updates) flushSync(() => updates.forEach(apply => apply()));
  };
  try {
    const transition = document.startViewTransition(commit);
    active = transition;
    void transition.ready.catch(() => {});
    void transition.finished.catch(() => {}).finally(() => { if (active === transition) active = null; });
  } catch {
    commit();
  }
}
