<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Video Actions

## General

### `load`

Loads a video from a local file path into a mutable Video object.

**Returns:** A new Video instance ready for chaining operations.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `input` | string | ✓ | — | File path or URL of the video to load. |

```yaml
# Load a video file — must be the first step before any transformation
- group: video
  name: load
  params:
    input: '{{ inputVideo }}'
  destination: videoObject
```

## I/O

### `trim`

Queues a segment cut on the video using start time and duration.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the trim queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to trim. |
| `start` | string | ✓ | — | Start timestamp of the segment (HH:MM:SS or HH:MM:SS.ms). |
| `duration` | string | ✓ | — | Duration of the segment to keep (HH:MM:SS or HH:MM:SS.ms). |

```yaml
# Cut a 30-second segment starting at 10 seconds — useful for isolating a clip
- group: video
  name: trim
  params:
    video: '{= videoObject =}'
    start: '00:00:10'
    duration: '00:00:30'
  destination: videoObject
```

## Editing & Transformation

### `changeResolution`

Queues a resolution change (scale filter) on the video.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the scale filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to resize. |
| `width` | number | ✓ | — | Target width in pixels. |
| `height` | number | ✓ | — | Target height in pixels. |

```yaml
# Resize to 1280×720 — useful for standardizing resolution before encoding
- group: video
  name: changeResolution
  params:
    video: '{= videoObject =}'
    width: 1280
    height: 720
  destination: videoObject
```

### `crop`

Queues a crop filter to cut a rectangular region from the video frame.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the crop filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to crop. |
| `width` | number | ✓ | — | Width of the crop area in pixels. |
| `height` | number | ✓ | — | Height of the crop area in pixels. |
| `x` | number | ✓ | — | Horizontal offset from the left edge in pixels. |
| `y` | number | ✓ | — | Vertical offset from the top edge in pixels. |

```yaml
# Crop a 500×300 region starting at pixel (100, 50) — useful for removing borders
- group: video
  name: crop
  params:
    video: '{= videoObject =}'
    width: 500
    height: 300
    x: 100
    y: 50
  destination: videoObject
```

### `rotate`

Queues a transpose filter to rotate or flip the video.

Transpose values: `0` = 90° CCW + flip, `1` = 90° CW, `2` = 90° CCW, `3` = 90° CW + flip.
This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the transpose filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to rotate. |
| `transpose` | `0` \| `1` \| `2` \| `3` | ✓ | — | Transpose mode: 0=90°CCW+flip, 1=90°CW, 2=90°CCW, 3=90°CW+flip. |

```yaml
# Rotate 90° clockwise — useful for correcting portrait-mode recordings
- group: video
  name: rotate
  params:
    video: '{= videoObject =}'
    transpose: '1'
  destination: videoObject
```

### `changeFramerate`

Queues a framerate change using the `fps` filter.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the fps filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to change the frame rate of. |
| `fps` | number | ✓ | — | Target frames per second. |

```yaml
# Reduce framerate to 24 fps — useful for lowering file size before distribution
- group: video
  name: changeFramerate
  params:
    video: '{= videoObject =}'
    fps: 24
  destination: videoObject
```

### `changeVolume`

Queues a volume adjustment using the `volume` audio filter.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the volume filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to adjust audio volume for. |
| `volume` | number | ✓ | — | Volume multiplier (e.g. 0.5 = half, 2.0 = double). |

```yaml
# Reduce volume to 70% — useful for background narration clips
- group: video
  name: changeVolume
  params:
    video: '{= videoObject =}'
    volume: 0.7
  destination: videoObject
```

## Audio

### `mute`

Queues a volume=0 filter to silence all audio on the video.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the mute filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to mute. |

```yaml
# Silence the video — useful before adding a replacement audio track
- group: video
  name: mute
  params:
    video: '{= videoObject =}'
  destination: videoObject
```

### `replaceAudio`

Replaces the existing audio track with an external audio file.

This is an eager operation — it runs FFmpeg immediately, writes a temp file,
and resets the Video's source to that file.

**Returns:** The same Video instance pointing to the updated temp file.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to replace the audio of. |
| `audio` | string | ✓ | — | File path of the audio track to use as replacement. |

```yaml
# Replace audio with a voiceover file — useful for dubbing or re-scoring
- group: video
  name: replaceAudio
  params:
    video: '{= videoObject =}'
    audio: '{{ videoFolder }}voiceover.mp3'
  destination: videoObject
```

### `addBackgroundMusic`

Mixes background music into the existing audio track at a specified volume.

This is an eager operation — it runs FFmpeg immediately, writes a temp file,
and resets the Video's source to that file.

**Returns:** The same Video instance pointing to the updated temp file.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to add background music to. |
| `music` | string | ✓ | — | File path of the background music audio track. |
| `musicVolume` | number |  | — | Volume of the background music track (default 1.0). |

```yaml
# Add background music at 40% volume — useful for promotional videos
- group: video
  name: addBackgroundMusic
  params:
    video: '{= videoObject =}'
    music: '{{ videoFolder }}background.mp3'
    musicVolume: 0.4
  destination: videoObject
```

### `convertFormat`

Queues a container format change for the output file.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the format option queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to transcode. |
| `format` | string | ✓ | — | Target container format (e.g. "mp4", "webm", "mov"). |

```yaml
# Transcode to mp4 container — useful when the source is mkv or webm
- group: video
  name: convertFormat
  params:
    video: '{= videoObject =}'
    format: mp4
  destination: videoObject
```

## Conversion & Compression

### `compress`

Queues H.264 compression with a CRF quality value and encoding preset.

CRF ranges from 0 (lossless) to 51 (worst). Presets range from
`ultrafast` (larger file, faster) to `veryslow` (smaller file, slower).
This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with compression options queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to compress. |
| `crf` | number | ✓ | — | Constant Rate Factor (0–51). Lower = better quality, higher = smaller file. Typical: 18–28. |
| `preset` | `ultrafast` \| `superfast` \| `veryfast` \| `faster` \| `fast` \| `medium` \| `slow` \| `slower` \| `veryslow` | ✓ | — | Encoding speed preset (ultrafast to veryslow). Slower presets yield better compression. |

```yaml
# Compress with CRF 28 at medium preset — good balance of quality and file size
- group: video
  name: compress
  params:
    video: '{= videoObject =}'
    crf: 28
    preset: medium
  destination: videoObject
```

### `addOverlay`

Overlays an image or video on top of the base video at a specified position.

Optionally scales the overlay before compositing. This is an eager operation —
it runs FFmpeg immediately, writes a temp file, and resets the Video's source.

**Returns:** The same Video instance pointing to the updated temp file.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The base video object. |
| `overlay` | string | ✓ | — | File path of the image or video to overlay. |
| `x` | number |  | — | Horizontal position of the overlay in pixels (default 0). |
| `y` | number |  | — | Vertical position of the overlay in pixels (default 0). |
| `width` | number |  | — | Width to scale the overlay to in pixels (optional). |
| `height` | number |  | — | Height to scale the overlay to in pixels (optional). |

```yaml
# Overlay a lower-third graphic at position (20, 20) scaled to 400×60
- group: video
  name: addOverlay
  params:
    video: '{= videoObject =}'
    overlay: '{{ videoFolder }}lower_third.png'
    x: 20
    y: 20
    width: 400
    height: 60
  destination: videoObject
```

## Composition & Overlay

### `addWatermark`

Burns a static image watermark onto the video at a specified position.

Optionally scales the watermark before compositing. This is an eager operation —
it runs FFmpeg immediately, writes a temp file, and resets the Video's source.

**Returns:** The same Video instance pointing to the updated temp file.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The base video object. |
| `image` | string | ✓ | — | File path of the watermark image. |
| `x` | number |  | — | Horizontal position of the watermark in pixels (default 0). |
| `y` | number |  | — | Vertical position of the watermark in pixels (default 0). |
| `width` | number |  | — | Width to scale the watermark to in pixels (optional). |
| `height` | number |  | — | Height to scale the watermark to in pixels (optional). |

```yaml
# Burn a 120×40 logo watermark in the top-right corner
- group: video
  name: addWatermark
  params:
    video: '{= videoObject =}'
    image: '{{ videoFolder }}logo.png'
    x: 10
    y: 10
    width: 120
    height: 40
  destination: videoObject
```

### `addSubtitles`

Queues a subtitle burn-in filter using the `subtitles` FFmpeg filter.

This is a lazy operation — it accumulates on the Video object and
is only applied to disk when `export` is called.

**Returns:** The same Video instance with the subtitle filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to add subtitles to. |
| `subtitle` | string | ✓ | — | File path to the subtitle file (e.g. .srt or .ass). |

```yaml
# Burn in SRT subtitles — useful for accessibility or social media exports
- group: video
  name: addSubtitles
  params:
    video: '{= videoObject =}'
    subtitle: '{{ videoFolder }}captions.srt'
  destination: videoObject
```

### `getInfo`

Probes the video with `ffprobe` and returns full format and stream metadata.

Flushes any pending lazy filters to a temp file before probing.

**Returns:** A parsed JSON object containing format and stream details.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to probe. |

```yaml
# Retrieve codec, resolution, bitrate, and container info
- group: video
  name: getInfo
  params:
    video: '{= videoObject =}'
  destination: videoInfo
```

## Analysis & Metadata

### `getDuration`

Returns the total duration of the video in seconds.

Flushes any pending lazy filters to a temp file before probing.

**Returns:** The video duration as a floating-point number of seconds.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to get duration from. |

```yaml
# Get duration in seconds — useful for calculating segment counts
- group: video
  name: getDuration
  params:
    video: '{= videoObject =}'
  destination: videoDuration
```

### `getThumbnail`

Extracts a single frame from the video at the given timestamp and writes it as an image.

Flushes any pending lazy filters to a temp file before extracting.

**Returns:** `true` when the thumbnail file has been written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to extract a frame from. |
| `output` | string | ✓ | — | Destination file path for the thumbnail image. |
| `timestamp` | string | ✓ | — | Timestamp of the frame to capture (HH:MM:SS or HH:MM:SS.ms). |

```yaml
# Extract a thumbnail at the 5-second mark — useful for preview images
- group: video
  name: getThumbnail
  params:
    video: '{= videoObject =}'
    output: '{{ videoFolder }}thumbnail.jpg'
    timestamp: '00:00:05'
```

### `extractFrames`

Extracts individual frames from the video and writes them as image files.

Supports optional time range (`start`/`end`) and output format (`png`, `jpg`, `bmp`).
Flushes any pending lazy filters to a temp file before extracting.

**Returns:** `true` when all frame files have been written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to extract frames from. |
| `outputDir` | string | ✓ | — | Directory where frame images will be saved. |
| `fps` | number | ✓ | — | Number of frames per second to extract. |
| `format` | `png` \| `jpg` \| `bmp` |  | — | Image format for extracted frames: png, jpg, or bmp. |
| `start` | string |  | — | Start timestamp for frame extraction (optional). |
| `end` | string |  | — | End timestamp for frame extraction (optional). |

```yaml
# Extract 1 frame per second as JPG between 5 s and 20 s
- group: video
  name: extractFrames
  params:
    video: '{= videoObject =}'
    outputDir: '{{ videoFolder }}frames'
    fps: 1
    format: jpg
    start: '00:00:05'
    end: '00:00:20'
```

## Extraction & Output

### `extractAudio`

Demuxes and transcodes the audio track to a standalone audio file.

Supported output extensions: `.aac`, `.mp3`, `.ac3`, `.opus`, `.wav`.
Flushes any pending lazy filters to a temp file before extracting.

**Returns:** `true` when the audio file has been written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to extract audio from. |
| `output` | string | ✓ | — | Destination file path for the extracted audio. |

```yaml
# Extract the audio track as an MP3 file — useful for podcast or transcript workflows
- group: video
  name: extractAudio
  params:
    video: '{= videoObject =}'
    output: '{{ videoFolder }}audio.mp3'
```

### `generateGif`

Generates an animated GIF from a video segment with configurable fps and width.

Uses the lanczos scaling algorithm. Flushes pending lazy filters before generating.

**Returns:** `true` when the GIF file has been written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to create a GIF from. |
| `output` | string | ✓ | — | Destination file path for the GIF. |
| `start` | string | ✓ | — | Start timestamp of the segment (HH:MM:SS). |
| `duration` | string | ✓ | — | Duration of the GIF segment (HH:MM:SS). |
| `fps` | number |  | — | Frame rate for the GIF (optional). |
| `width` | number |  | — | Width of the GIF in pixels (optional, maintains aspect ratio). |

```yaml
# Generate a 320px-wide GIF at 10 fps from a 3-second segment starting at 2 s
- group: video
  name: generateGif
  params:
    video: '{= videoObject =}'
    output: '{{ videoFolder }}preview.gif'
    start: '00:00:02'
    duration: '3'
    fps: 10
    width: 320
```

### `blurRegion`

Blurs one or more rectangular regions for specified time intervals.

Each region defines its position, size, time range (`start`/`end` in seconds),
and optional blur strength. This is an eager operation — it runs FFmpeg immediately,
writes a temp file, and resets the Video's source.

**Returns:** The same Video instance pointing to the updated temp file.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to apply blur regions to. |
| `regions` | object[] | ✓ | — | Array of region definitions with x, y, width, height, start/end times, and optional blur strength. |

```yaml
# Blur a face region from seconds 1–7 and a screen region from 8–14
- group: video
  name: blurRegion
  params:
    video: '{= videoObject =}'
    regions:
      - x: 100
        y: 50
        width: 200
        height: 200
        blurStrength: 15
        start: 1
        end: 7
      - x: 400
        y: 300
        width: 400
        height: 300
        blurStrength: 20
        start: 8
        end: 14
  destination: videoObject
```

## Privacy & Compliance

### `export`

Finalizes the video pipeline: writes all accumulated filters to the output file
and cleans up all temporary files created during eager operations.

This should be the last action in any video pipeline.

**Returns:** A promise that resolves when the file has been written and temps cleaned up.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `video` | any | ✓ | — | The video object to export. |
| `output` | string | ✓ | — | Destination file path for the exported video. |

```yaml
# Write the final video to disk and clean up all temp files
- group: video
  name: export
  params:
    video: '{= videoObject =}'
    output: '{{ videoFolder }}output.mp4'
```
