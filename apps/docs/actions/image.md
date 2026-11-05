<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Image Actions

## General

### `load`

Loads an image from disk and returns a Sharp instance ready for chaining.

**Returns:** A Sharp image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | File path of the image to load. |

```yaml
# Load a JPEG from disk — store the instance for use in subsequent image actions
- group: image
  name: load
  params:
    path: '{{ inputPath }}'
  destination: imageInstance
```

## I/O

### `resize`

Resizes an image to the specified width and/or height.

**Returns:** The resized image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to resize. |
| `width` | number |  | — | Target width in pixels (optional, preserves aspect ratio if only one dimension given). |
| `height` | number |  | — | Target height in pixels (optional, preserves aspect ratio if only one dimension given). |

```yaml
# Resize to a fixed 800×600 thumbnail — useful for email attachments
- group: image
  name: resize
  params:
    image: '{= imageInstance =}'
    width: 800
    height: 600
  destination: imageInstance
```

## Transform

### `rotate`

Rotates an image by the given angle in degrees.

**Returns:** The rotated image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to rotate. |
| `angle` | number | ✓ | — | Rotation angle in degrees (clockwise). |

```yaml
# Rotate 90 degrees clockwise — corrects orientation from some camera scans
- group: image
  name: rotate
  params:
    image: '{= imageInstance =}'
    angle: 90
  destination: imageInstance
```

### `flip`

Flips an image vertically (top-to-bottom mirror).

**Returns:** The flipped image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to flip vertically. |

```yaml
# Flip vertically — useful when source image is upside-down
- group: image
  name: flip
  params:
    image: '{= imageInstance =}'
  destination: imageInstance
```

### `flop`

Flops an image horizontally (left-to-right mirror).

**Returns:** The flopped image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to flip horizontally. |

```yaml
# Flop horizontally — mirrors the image along the vertical axis
- group: image
  name: flop
  params:
    image: '{= imageInstance =}'
  destination: imageInstance
```

### `crop`

Crops an image to the specified rectangle region.

**Returns:** The cropped image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to crop. |
| `left` | number | ✓ | — | Left offset in pixels from the image origin. |
| `top` | number | ✓ | — | Top offset in pixels from the image origin. |
| `width` | number | ✓ | — | Width of the crop area in pixels. |
| `height` | number | ✓ | — | Height of the crop area in pixels. |

```yaml
# Crop a 400×300 region starting at (100, 80) — extract a subject from a photo
- group: image
  name: crop
  params:
    image: '{= imageInstance =}'
    left: 100
    top: 80
    width: 400
    height: 300
  destination: imageInstance
```

### `grayscale`

Converts an image to grayscale.

**Returns:** The grayscale image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to convert to grayscale. |

```yaml
# Convert to grayscale — useful for document scans or receipt images
- group: image
  name: grayscale
  params:
    image: '{= imageInstance =}'
  destination: imageInstance
```

## Appearance

### `blur`

Applies a Gaussian blur to an image with the given sigma radius.

**Returns:** The blurred image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to blur. |
| `sigma` | number | ✓ | — | Blur radius (0.3–1000). Higher values produce stronger blur. |

```yaml
# Apply a light blur (sigma 3) — smooths out compression artefacts before OCR
- group: image
  name: blur
  params:
    image: '{= imageInstance =}'
    sigma: 3
  destination: imageInstance
```

### `sharpen`

Sharpens an image to enhance edges and fine detail.

**Returns:** The sharpened image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to sharpen. |

```yaml
# Sharpen the image — improves readability of small text in scanned documents
- group: image
  name: sharpen
  params:
    image: '{= imageInstance =}'
  destination: imageInstance
```

### `negate`

Inverts the colors of an image (color negative effect).

**Returns:** The negated image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to invert colors on. |

```yaml
# Invert colors — useful for creating a negative of a document scan
- group: image
  name: negate
  params:
    image: '{= imageInstance =}'
  destination: imageInstance
```

### `tint`

Applies an RGB tint overlay to an image.

**Returns:** The tinted image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to tint. |
| `r` | number | ✓ | — | Red channel value (0–255). |
| `g` | number | ✓ | — | Green channel value (0–255). |
| `b` | number | ✓ | — | Blue channel value (0–255). |

```yaml
# Apply a warm tint — shift colors toward a reddish tone
- group: image
  name: tint
  params:
    image: '{= imageInstance =}'
    r: 255
    g: 200
    b: 150
  destination: imageInstance
```

### `modulate`

Adjusts brightness, saturation, and hue of an image.

**Returns:** The modulated image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to modulate. |
| `brightness` | number |  | — | Brightness multiplier (e.g. 1.5 = 50% brighter). |
| `saturation` | number |  | — | Saturation multiplier (e.g. 0.5 = half saturation). |
| `hue` | number |  | — | Hue rotation in degrees (0–360). |

```yaml
# Boost brightness and desaturate slightly — normalizes photos for report covers
- group: image
  name: modulate
  params:
    image: '{= imageInstance =}'
    brightness: 1.2
    saturation: 0.9
    hue: 0
  destination: imageInstance
```

### `composite`

Composites (overlays) a second image on top of the base image at a given position.

The overlay must be a file path to a supported image (PNG, JPEG, WebP, etc.).

**Returns:** The composited image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The base image object to composite onto. |
| `overlay` | string | ✓ | — | File path of the image to overlay. |
| `top` | number |  | 0 | Vertical offset from the top of the base image (pixels). |
| `left` | number |  | 0 | Horizontal offset from the left of the base image (pixels). |

```yaml
# Stamp a watermark PNG in the top-left corner of the base image
- group: image
  name: composite
  params:
    image: '{= imageInstance =}'
    overlay: '{{ overlayPath }}'
    top: 10
    left: 10
  destination: imageInstance
```

## Composition

### `extend`

Extends the canvas of an image by adding borders on each side with a background color.

**Returns:** The extended image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to extend. |
| `top` | number |  | 0 | Pixels to add to the top. |
| `bottom` | number |  | 0 | Pixels to add to the bottom. |
| `left` | number |  | 0 | Pixels to add to the left. |
| `right` | number |  | 0 | Pixels to add to the right. |
| `background` | string |  | "#FFFFFF" | Background fill color for the extended area (e.g. "#FFFFFF"). |

```yaml
# Add a 20px grey border around the image — useful for thumbnail frames
- group: image
  name: extend
  params:
    image: '{= imageInstance =}'
    top: 20
    bottom: 20
    left: 20
    right: 20
    background: '#cccccc'
  destination: imageInstance
```

### `metadata`

Reads metadata from the current image state (format, width, height, channels, etc.).
`exif` comes from the original file (transforms drop it) and is decoded into plain
tags, e.g. `exif.DateTimeOriginal` as `2026-05-14 14:30:12` (camera clock, no timezone),
`exif.Make`, `exif.Model`, `exif.GPSInfo`. It is left out when the file has none.

**Returns:** An object containing the image metadata.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to read metadata from. |

```yaml
# Read metadata after transformations — inspect final format and dimensions
- group: image
  name: metadata
  params:
    image: '{= imageInstance =}'
  destination: imageMeta
```

## Metadata

### `toFormat`

Converts an image to the specified output format.

**Returns:** The reformatted image instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to convert. |
| `format` | `jpeg` \| `png` \| `webp` \| `tiff` \| `avif` \| `gif` \| `heif` | ✓ | — | Target format: jpeg, png, webp, tiff, avif, gif, or heif. |

```yaml
# Convert to WebP for optimized web delivery
- group: image
  name: toFormat
  params:
    image: '{= imageInstance =}'
    format: webp
  destination: imageInstance
```

## Format & Output

### `toBuffer`

Renders all queued transforms and returns the image as a base64-encoded string.

**Returns:** A base64-encoded string of the final image — useful for embedding or uploading.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to render. |
| `format` | `jpeg` \| `png` \| `webp` \| `tiff` \| `avif` \| `gif` \| `heif` |  | — | Optional output format for the buffer (jpeg, png, webp, etc.). |

```yaml
# Export to a base64 WebP string — useful for embedding in JSON payloads or emails
- group: image
  name: toBuffer
  params:
    image: '{= imageInstance =}'
    format: webp
  destination: imageBase64
```

### `toFile`

Writes the final image to disk at the specified output path, creating directories as needed.

**Returns:** `true` when the file has been written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `image` | any | ✓ | — | The image object to write. |
| `output` | string | ✓ | — | Destination file path (format inferred from extension). |

```yaml
# Save the processed image to disk — output path is derived from a pipeline variable
- group: image
  name: toFile
  params:
    image: '{= imageInstance =}'
    output: '{{ outputPath }}'
```
