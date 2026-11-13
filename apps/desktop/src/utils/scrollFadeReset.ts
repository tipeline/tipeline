/**
 * Works around a Chromium quirk with the CSS-only `scroll-fade` utility (style.css): its
 * fades follow a scroll-driven animation, and when a box that was scrolled down stops being
 * scrollable (its content shrank: Show less, a filter, a closed section), Chromium keeps the
 * fade from the last scroll position. The top edge then stays faded over content that is
 * fully visible (Home's date after Show less). Restarting the animation recomputes it.
 *
 * One watcher for the whole page: after DOM changes and window resizes (at most once a
 * frame), any `.scroll-fade` box that can't scroll but still shows a fade gets reset.
 */
export function resetStaleScrollFades(root: ParentNode = document): number {
  let reset = 0;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.scroll-fade'))) {
    if (el.scrollHeight > el.clientHeight) continue;
    const style = getComputedStyle(el);
    const faded = [style.getPropertyValue('--scroll-fade-top'), style.getPropertyValue('--scroll-fade-bottom')].some(
      (value) => value.trim() !== '' && parseFloat(value) !== 0
    );
    if (!faded) continue;
    el.style.animation = 'none';
    void el.offsetHeight; // apply "none" before putting the stylesheet's animation back
    el.style.animation = '';
    reset++;
  }
  return reset;
}

export function installScrollFadeReset(): () => void {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      resetStaleScrollFades();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
  };
}
