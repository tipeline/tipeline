// Shared by every Home section so they read as one page: the same heading row height,
// heading text and right-hand link.
export const HOME_HEADING_ROW = 'flex items-center justify-between gap-2 min-h-7 shrink-0';
export const HOME_HEADING = 'text-sm font-semibold m-0 flex items-center gap-1.5';
export const HOME_LINK = 'text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline';

// The bordered box under a heading that holds a Home list (Projects); it fills its
// space and scrolls inside. Its rows are plain, highlighted on hover.
export const HOME_CARD = 'flex-1 min-h-0 overflow-y-auto scroll-fade border border-border rounded-md bg-card p-1';
export const HOME_PANEL_ROW =
  'flex items-center gap-2.5 w-full min-w-0 px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left';
