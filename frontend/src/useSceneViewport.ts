import { useCallback, useLayoutEffect, useState } from 'react';

// Fit only scenes whose real content fits, including input scenes. Overflowing
// scenes retain their natural page layout rather than nested scroll areas.
export function useSceneViewport() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const ref = useCallback((element: HTMLElement | null) => setRoot(element), []);
  useLayoutEffect(() => {
    if (!root) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      if (window.innerWidth < 1001) {
        root.classList.remove('scene-fit');
        return;
      }
      root.classList.add('scene-fit');
      const scene = Array.from(root.children).find(element => element.tagName === 'SECTION');
      if (!scene) { root.classList.remove('scene-fit'); return; }
      const top = root.querySelector('.intro-topbar')?.getBoundingClientRect().bottom ?? 0;
      const candidates = scene.querySelectorAll<HTMLElement>('.dialogue-photo, .dialogue-box, .dialogue-content, .introduction-copy, .profile-detail, .interview-info, .formation-status, .interview-dock, .month-finished, .interview-hub-footer, button');
      const overflow = root.scrollHeight > root.clientHeight + 1 || Array.from(candidates).some(element => {
        if (element.closest('dialog') || !element.getClientRects().length) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.bottom > window.innerHeight + 1 || rect.top < top - 1
          // Cutout image boxes include transparent pixels outside the frame.
          // Their visible alpha bounds are fitted by PhotoSlot, not scrollHeight.
          || (!element.classList.contains('dialogue-photo') && ['auto', 'scroll', 'hidden'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1);
      });
      root.classList.toggle('scene-fit', !overflow);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    window.addEventListener('resize', schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    measure();
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts.removeEventListener('loadingdone', schedule);
      root.classList.remove('scene-fit');
    };
  }, [root]);
  return ref;
}
