// Task tags come back from the core as either a real array or a JSON-encoded
// string, depending on the call site — normalize to an array everywhere we
// read them for display (matches the parsing already done in TasksList.vue).
export function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Tags are lowercase letters, numbers, spaces and hyphens (see normalizeTagLabel) — an
// input handler that turns the text into that as it's typed or pasted, keeping the cursor
// where it was. Spaces at the ends stay while typing; they go when the tag is saved. It
// fires `input` again so a v-model that already read the typed text gets the clean one.
const cleanTagText = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N} -]+/gu, '');

export function tagInput(event: Event) {
  if ((event as InputEvent).isComposing) return;
  const input = event.target as HTMLInputElement;
  const clean = cleanTagText(input.value);
  if (clean === input.value) return;
  const cursor = cleanTagText(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
  input.value = clean;
  input.setSelectionRange(cursor, cursor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
