// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { resetStaleScrollFades } from '@/utils/scrollFadeReset';

// The real bug is Chromium keeping a scroll-driven fade after a box stops scrolling (checked
// in the Desktop app over CDP). Here the leftover fade is set by hand, standing in for the
// value Chromium leaves behind; what's tested is which boxes get reset.
function box(fadeTop: string, scrollable: boolean) {
  const el = document.createElement('div');
  el.className = 'scroll-fade';
  el.style.setProperty('--scroll-fade-top', fadeTop);
  Object.defineProperty(el, 'scrollHeight', { value: scrollable ? 900 : 300 });
  Object.defineProperty(el, 'clientHeight', { value: 300 });
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resetStaleScrollFades', () => {
  it('resets a box that no longer scrolls but still shows a fade', () => {
    box('24px', false);
    expect(resetStaleScrollFades()).toBe(1);
  });

  it('leaves scrolling boxes and boxes without a fade alone', () => {
    box('24px', true); // still scrolled down: the fade is right
    box('0px', false);
    box('', false);
    expect(resetStaleScrollFades()).toBe(0);
  });
});
