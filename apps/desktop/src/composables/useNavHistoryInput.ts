import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { canGoBack, canGoForward } from '@/router/navHistory';

/**
 * Back/forward from the keyboard (⌘[ / ⌘], Ctrl on Windows and Linux) and from the mouse's
 * side buttons, on every page. Inside text fields and code editors ⌘[ / ⌘] keep their own
 * meaning (outdent/indent).
 */
export function useNavHistoryInput() {
  const router = useRouter();

  useKeyboardShortcuts([
    { key: '[', meta: true, skipWhenEditable: true, enabled: canGoBack, handler: () => router.back() },
    {
      key: ']',
      meta: true,
      skipWhenEditable: true,
      enabled: canGoForward,
      handler: () => router.forward(),
    },
  ]);

  // Mouse buttons 3 and 4 are the side "back" and "forward" buttons.
  function onMouseUp(e: MouseEvent) {
    if (e.button === 3 && canGoBack()) {
      e.preventDefault();
      router.back();
    } else if (e.button === 4 && canGoForward()) {
      e.preventDefault();
      router.forward();
    }
  }

  onMounted(() => window.addEventListener('mouseup', onMouseUp));
  onUnmounted(() => window.removeEventListener('mouseup', onMouseUp));
}
