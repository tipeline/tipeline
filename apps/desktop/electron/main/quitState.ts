// Whether the app is really quitting. Closing the main window only hides it while
// Tipeline keeps running in the menu bar / tray, so the close handler has to tell a real
// quit (menu Quit, ⌘Q, installing an update) apart from the window's close button.
let quitting = false;

export function markQuitting(): void {
  quitting = true;
}

export function isQuitting(): boolean {
  return quitting;
}
