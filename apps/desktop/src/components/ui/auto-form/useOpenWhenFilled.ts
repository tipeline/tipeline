import type { Ref } from 'vue'
import { ref, watch } from 'vue'

/** True when a group field holds something worth showing: text, list items or object entries. */
export function hasContent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value).some(hasContent)
  return true
}

/**
 * Open state for a collapsible group field (list, object, key/value): starts
 * open when the field already has a value, so saved bindings aren't hidden
 * behind a click. Form values can arrive after mount, so it also opens the
 * first time a value shows up — but never again once the user has toggled it.
 */
export function useOpenWhenFilled(value: Ref<unknown>) {
  const open = ref(hasContent(value.value))
  let touched = false

  const stop = watch(value, (v) => {
    if (touched || open.value) return stop()
    if (hasContent(v)) {
      open.value = true
      stop()
    }
  }, { deep: true })

  function setOpen(next: boolean) {
    touched = true
    open.value = next
  }

  return { open, setOpen }
}
