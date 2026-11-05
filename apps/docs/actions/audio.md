<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Audio Actions

## General

### `load`

Loads an audio file into an Audio object for further processing.

**Returns:** An Audio instance pointing to the given input file.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `input` | string | ✓ | — | File path or URL of the audio to load. |

```yaml
# Load an audio file to begin an editing pipeline
- group: audio
  name: load
  params:
    input: '/recordings/interview.mp3'
```

## Load

### `convertFormat`

Queues a format conversion to be applied when the audio is exported.

**Returns:** The updated Audio instance with the target format queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to transcode. |
| `format` | `mp3` \| `aac` \| `flac` \| `wav` \| `ogg` \| `opus` \| `ac3` \| `ipod` \| `adts` \| `alaw` \| `mulaw` | ✓ | — | Target output format. |

```yaml
# Convert an MP3 to WAV before processing with an external tool
- group: audio
  name: convertFormat
  params:
    audio: '{{ audio }}'
    format: 'wav'
```

## Conversion & Encoding

### `compress`

Queues a bitrate constraint to reduce the audio file size on export.

**Returns:** The updated Audio instance with the bitrate limit queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to compress. |
| `bitrate` | string | ✓ | — | Target bitrate (e.g. 64k, 128k, 320k). |

```yaml
# Compress a podcast episode to 96k for web delivery
- group: audio
  name: compress
  params:
    audio: '{{ audio }}'
    bitrate: '96k'
```

### `trim`

Queues a time-based trim to extract a segment from the audio on export.

**Returns:** The updated Audio instance with the trim range queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to trim. |
| `start` | string | ✓ | — | Start timestamp of the segment (HH:MM:SS or HH:MM:SS.ms). |
| `duration` | string | ✓ | — | Length of the segment to keep (HH:MM:SS or HH:MM:SS.ms). |

```yaml
# Extract the first 30 seconds of an intro recording
- group: audio
  name: trim
  params:
    audio: '{{ audio }}'
    start: '00:00:00'
    duration: '00:00:30'
```

## Editing

### `concatenate`

Concatenates one or more additional audio files onto the end of the current audio.

The current audio state is written to a temp file first, then all inputs are joined
via ffmpeg's concat filter. The Audio instance is reset to point at the merged output.

**Returns:** The updated Audio instance pointing at the concatenated result.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The base audio object to append onto. |
| `inputs` | string[] | ✓ | — | List of file paths to append in order. |

```yaml
# Join an intro jingle, a main recording, and an outro into one file
- group: audio
  name: concatenate
  params:
    audio: '{{ audio }}'
    inputs:
      - '/assets/intro.mp3'
      - '/assets/outro.mp3'
```

### `changeVolume`

Queues a volume adjustment to be applied when the audio is exported.

Accepts a multiplier (e.g. `0.5` for half volume, `2.0` for double) or a dB value
(e.g. `10dB`).

**Returns:** The updated Audio instance with the volume filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to adjust. |
| `volume` | number | ✓ | — | Volume multiplier (e.g. 0.5 = half, 2.0 = double). |

```yaml
# Reduce volume to 80% before mixing with background music
- group: audio
  name: changeVolume
  params:
    audio: '{{ audio }}'
    volume: 0.8
```

### `fadeIn`

Queues a fade-in effect to be applied when the audio is exported.

**Returns:** The updated Audio instance with the fade-in filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to apply the fade to. |
| `duration` | number | ✓ | — | Length of the fade in seconds. |
| `start` | number |  | 0 | Timestamp (seconds) where the fade begins. Defaults to 0. |

```yaml
# Fade in over the first 2 seconds
- group: audio
  name: fadeIn
  params:
    audio: '{= audio =}'
    duration: 2
```

### `fadeOut`

Queues a fade-out effect to be applied when the audio is exported.

`start` is the timestamp (in seconds) in the audio where the fade begins.
For a 10-second clip with a 2-second fade at the end, use `start: 8, duration: 2`.

**Returns:** The updated Audio instance with the fade-out filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to apply the fade to. |
| `duration` | number | ✓ | — | Length of the fade in seconds. |
| `start` | number | ✓ | — | Timestamp (seconds) in the audio where the fade begins. |

```yaml
# Fade out over the last 3 seconds of a 30-second clip
- group: audio
  name: fadeOut
  params:
    audio: '{= audio =}'
    start: 27
    duration: 3
```

### `changeSpeed`

Queues a pitch-preserving speed change to be applied when the audio is exported.

Uses ffmpeg's `atempo` filter (range 0.5–2.0 per stage). For speeds outside that
range, multiple atempo stages are chained automatically — e.g. 3.0x becomes
`atempo=2.0,atempo=1.5`.

**Returns:** The updated Audio instance with the speed filter(s) queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to speed up or slow down. |
| `speed` | number | ✓ | — | Speed multiplier between 0.25 and 4.0 (1.0 = original speed). |

```yaml
# Speed up audio 1.5x without changing pitch
- group: audio
  name: changeSpeed
  params:
    audio: '{= audio =}'
    speed: 1.5
```

### `addSilence`

Queues silence padding at the start or end of the audio to be applied on export.

Calling with `position: 'start'` and `position: 'end'` independently queues both.
Calling the same position twice overrides the previous value.

**Returns:** The updated Audio instance with the silence filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to pad. |
| `duration` | number | ✓ | — | Duration of silence to add in seconds. |
| `position` | `start` \| `end` | ✓ | — | Where to insert the silence: at the start or end. |

```yaml
# Add 1 second of silence before the audio begins
- group: audio
  name: addSilence
  params:
    audio: '{= audio =}'
    duration: 1
    position: start
```

### `mixAudio`

Overlays a second audio track onto the current audio and resets the pipeline state.

This is an eager operation — like `concatenate`, it flushes all queued operations
to a temp file first, then runs the mix. The Audio instance is reset to point at
the mixed result with a clean queue.

`volume` controls the level of the mixed-in track (default `1.0`). The main track
always plays at full volume.

**Returns:** The updated Audio instance pointing at the mixed output.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The base audio object to mix onto. |
| `input` | string | ✓ | — | File path of the audio track to overlay. |
| `volume` | number |  | — | Volume of the overlaid track (default 1.0). The base track is always at full volume. |

```yaml
# Overlay background music at 30% volume under a voice recording
- group: audio
  name: mixAudio
  params:
    audio: '{= audio =}'
    input: '/assets/background.mp3'
    volume: 0.3
```

### `getInfo`

Returns format and stream metadata for the audio file using ffprobe.

The current audio state is written to a temp file before probing so that any
queued operations are reflected in the reported metadata.

**Returns:** A parsed JSON object containing format and stream details.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to probe. |

```yaml
# Read duration and codec info before deciding whether to transcode
- group: audio
  name: getInfo
  params:
    audio: '{{ audio }}'
```

## Analysis

### `normalize`

Queues an EBU R128 loudness normalization filter to be applied on export.

**Returns:** The updated Audio instance with the loudnorm filter queued.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to normalize. |

```yaml
# Normalize loudness before publishing a podcast episode
- group: audio
  name: normalize
  params:
    audio: '{{ audio }}'
```

## Save and Apply

### `export`

Writes the final audio output to disk and deletes all temporary files created
during the pipeline.

This is the intended last step in any audio pipeline. For intermediate saves that
keep the pipeline alive, use `save`.

**Returns:** A promise that resolves when the file has been written and temps cleaned up.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `audio` | any | ✓ | — | The audio object to export. |
| `output` | string | ✓ | — | Destination file path (e.g. /output/final.mp3). |

```yaml
# Export the finished audio and clean up all temp files
- group: audio
  name: export
  params:
    audio: '{{ audio }}'
    output: '/output/final-episode.mp3'
```
