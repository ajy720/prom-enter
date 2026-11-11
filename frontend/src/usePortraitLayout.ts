import { useLayoutEffect, useRef } from 'react';

// Follow actual flex wrapping and the real header height, rather than assuming
// every scene has the same toolbar, padding and resource/banner rows.
export function usePortraitLayout(enabled: boolean, widthRatio: number) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const photo = ref.current;
    const pane = photo?.parentElement;
    const stage = pane?.closest<HTMLElement>('.prologue-scene, .recruitment-briefing, .candidate-interview, .month-photo-stage, .monthly-stage, .monthly-intro');
    const dock = stage?.querySelector<HTMLElement>(':scope > .intro-dialogue-dock, :scope > .interview-dock, :scope > .monthly-dock, :scope > .monthly-intro-copy');
    if (!enabled || !photo || !pane || !stage || !dock) return;
    let frame = 0;
    const measure = () => {
      pane.style.setProperty('--portrait-column-width', `max(340px, calc(var(--dialogue-portrait-height) * ${widthRatio} + 24px))`);
      const portrait = pane.getBoundingClientRect();
      const dialogue = dock.getBoundingClientRect();
      const desktop = window.innerWidth >= 1001;
      const stacked = desktop && dialogue.left < portrait.right - 1 && dialogue.right > portrait.left + 1;
      stage.classList.toggle('portrait-stacked', stacked);
      const top = Math.max(0, stage.getBoundingClientRect().top + window.scrollY + parseFloat(getComputedStyle(stage).paddingTop));
      const value = `${top}px`;
      if (pane.style.getPropertyValue('--portrait-stage-top') !== value) pane.style.setProperty('--portrait-stage-top', value);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(stage); observer.observe(pane); observer.observe(dock);
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule);
      stage.classList.remove('portrait-stacked'); pane.style.removeProperty('--portrait-stage-top'); pane.style.removeProperty('--portrait-column-width');
    };
  }, [enabled, widthRatio]);
  return ref;
}
