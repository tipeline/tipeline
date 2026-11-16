import { nativeImage, type NativeImage } from 'electron';

// The Tipeline mark (three bars, see src/assets/logo.svg) drawn in code for the menu bar /
// tray, so there are no icon files to keep in step with the logo, and the "needs you" dot
// can be added on platforms whose tray can't show a number next to the icon.

// The mark's bars in its own 46×48 box: x, y, width, height (corner radius 2).
const BARS: Array<[number, number, number, number]> = [
  [0, 5, 46, 11.5],
  [9.2, 18.8, 27.6, 11.5],
  [13.8, 32.6, 18.4, 11.5],
];
const MARK_W = 46;
const MARK_H = 48;
const RADIUS = 2;
const SAMPLES = 4; // per axis, for smooth edges

export interface TrayIconOptions {
  /** [r, g, b] of the mark. */
  color: [number, number, number];
  /** Adds a red dot at the top right (Windows / Linux: something needs you). */
  dot?: boolean;
}

const DOT_COLOR: [number, number, number] = [220, 38, 38];

function insideBar(px: number, py: number): boolean {
  for (const [x, y, w, h] of BARS) {
    if (px < x || px > x + w || py < y || py > y + h) continue;
    // Rounded corners: outside the corner circle counts as outside.
    const cx = px < x + RADIUS ? x + RADIUS : px > x + w - RADIUS ? x + w - RADIUS : px;
    const cy = py < y + RADIUS ? y + RADIUS : py > y + h - RADIUS ? y + h - RADIUS : py;
    if ((px - cx) ** 2 + (py - cy) ** 2 <= RADIUS * RADIUS) return true;
  }
  return false;
}

/**
 * The icon's pixels at `size`×`size`, as premultiplied BGRA (what
 * nativeImage.createFromBitmap expects). The mark fills the square with a little padding;
 * the dot sits over its top right corner.
 */
export function renderTrayIconBitmap(size: number, options: TrayIconOptions): Buffer {
  const buffer = Buffer.alloc(size * size * 4);
  // Fit the mark's 48-unit height into the square, 1 px of padding at 16 px.
  const scale = (size * 0.94) / MARK_H;
  const offsetX = (size - MARK_W * scale) / 2;
  const offsetY = (size - MARK_H * scale) / 2;
  const dotR = size * 0.2;
  const dotCx = size - dotR - size * 0.02;
  const dotCy = dotR + size * 0.02;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let markHits = 0;
      let dotHits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          if (options.dot && (px - dotCx) ** 2 + (py - dotCy) ** 2 <= dotR * dotR) {
            dotHits++;
          } else if (insideBar((px - offsetX) / scale, (py - offsetY) / scale)) {
            markHits++;
          }
        }
      }
      const total = SAMPLES * SAMPLES;
      const markA = markHits / total;
      const dotA = dotHits / total;
      const alpha = markA + dotA;
      if (alpha === 0) continue;
      // Premultiplied: each channel is its colour times its coverage.
      const [r, g, b] = [0, 1, 2].map((i) => options.color[i] * markA + DOT_COLOR[i] * dotA);
      const i = (y * size + x) * 4;
      buffer[i] = Math.round(b);
      buffer[i + 1] = Math.round(g);
      buffer[i + 2] = Math.round(r);
      buffer[i + 3] = Math.round(alpha * 255);
    }
  }
  return buffer;
}

/** The tray image at 1×, 1.5× and 2× of `baseSize` (16 px on every platform). */
export function trayImage(options: TrayIconOptions & { template?: boolean }, baseSize = 16): NativeImage {
  const image = nativeImage.createEmpty();
  for (const scaleFactor of [1, 1.5, 2]) {
    const size = Math.round(baseSize * scaleFactor);
    image.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      buffer: renderTrayIconBitmap(size, options),
    });
  }
  // macOS draws a template image in the menu bar's own colour (light or dark, selected).
  if (options.template) image.setTemplateImage(true);
  return image;
}
