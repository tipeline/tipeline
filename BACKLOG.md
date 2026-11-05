# Backlog

Features and improvements deferred for future releases.

---

## Action error handling

### Retry on error
Allow an action to automatically retry a configurable number of times before
giving up. Useful for transient failures like network timeouts or flaky APIs.

Proposed config:
```yaml
- group: api
  name: request
  onError: retry
  retryCount: 3
  retryDelay: 2000   # ms between attempts
  params:
    url: https://example.com/endpoint
```

### Error sub-block (on-error branch)
Allow an action to define a list of sub-actions that execute only when that
action fails, before deciding whether to halt or continue the pipeline.
Similar to a try/catch block at the action level.

Proposed config:
```yaml
- group: file
  name: read
  params:
    path: /tmp/data.txt
  onErrorActions:
    - group: notification
      name: send
      params:
        message: "File read failed, using default"
    - group: variable
      name: set
      params:
        name: fileContent
        value: ""
```

---

## PDF actions

New actions to round out `apps/core/src/action/actions/pdf`, currently
limited to extractText, extractImage, merge, getPageCount, and splitPages.

- rotate — fix scanned-page orientation
- extractPages — pull an arbitrary page range (not just single-page split)
- watermark / addText — stamp pages (common for invoices/approvals)
- encrypt / decrypt — password-protect or unlock PDFs
- toImages — render whole pages as images (thumbnails/previews), distinct
  from extractImage which only pulls embedded raster images
- fromImages — build a PDF from a set of images (scan-to-PDF workflows)

Likely needs `pdf-lib` as a dependency for page manipulation (rotate,
extractPages, watermark, encrypt/decrypt) since `unpdf` and
`pdf-merger-js` don't support it.

---

## App components

### Camera / barcode scanner (roadmap #35)
An app component that uses the computer's camera to take a photo or scan a
barcode / QR code, and hands the result to the app (`<id>.value`, a `scan` or
`capture` event) — e.g. scan a product code, then run a lookup workflow.

Things to settle first:
- **Permissions.** Since #34, embedded frames are denied camera access; the app's
  own window still may ask. On macOS the packaged app also needs
  `NSCameraUsageDescription` and `systemPreferences.askForMediaAccess('camera')`,
  and the user can refuse — the component must say so and offer a retry.
- **Decoding.** Chromium's `BarcodeDetector` exists on macOS but not on Windows /
  Linux, so a library (e.g. ZXing) is needed for the same behaviour everywhere.
- **Photos.** Where a captured photo goes: a data URL in state (small), or a file
  under `~/Tipeline` handed to the workflow as a path (like the file dropzone).
- **Remote workspaces.** The camera is on this computer; a photo must be sent to
  the server rather than referenced by a local path.
- **Fallback.** A text box to type the code when there is no camera.

### Signature pad (roadmap #39)
An input to draw a signature (mouse, trackpad or pen) and hand it to a workflow —
e.g. a delivery confirmation or an approval with a signature on the PDF.

Things to settle first:
- **Value.** A PNG data URL in `<id>.value` (small enough for a signature), or a
  file under `~/Tipeline` like the file dropzone; and an "empty" check for `required`.
- **Same as other inputs.** Standalone Input type and form field type (`signature`),
  with Clear, and the stepper / form checks treating an empty pad as missing.
- **Ink.** Pen pressure and smoothing (pointer events), stroke color/width, and how it
  looks in dark mode (the saved image should stay dark ink on transparent/white).
- **Records.** Whether to keep who signed and when next to the image.

### Rating (roadmap #40)
Stars (or another icon) to pick a score — feedback forms, reviews, priorities.

Things to settle first:
- **Where.** An Input / form field type (`rating`) like the slider (#33), so forms get
  it too; `max` (default 5), half steps, and an icon choice (star, heart, circle).
- **Read-only display.** Showing a score in a table column or Details field
  (`format: rating`) may be the more common need than picking one.
- **Keyboard.** Arrow keys and clearing back to "no rating" (0 vs empty for `required`).

### Microphone / voice recorder (roadmap #44)
An input that records audio from the microphone and hands it to a workflow — a voice
note, a dictated message for an AI action to transcribe, a spoken inspection report.

Things to settle first:
- **Permissions.** Since #34 only Tipeline's own window may ask for the microphone
  (embedded pages can't); on macOS the packaged app needs `NSMicrophoneUsageDescription`
  and `systemPreferences.askForMediaAccess('microphone')`, and a refusal must be explained
  with a way to retry.
- **Value.** The recording as a file under `~/Tipeline` (like the file dropzone; the
  workflow gets a path) rather than a data URL in state — recordings get large. Format:
  `webm/opus` from MediaRecorder, or convert to `wav`/`mp3` for workflows (ffmpeg is
  already used by the audio actions).
- **Same as other inputs.** Input / form field type `audio` with record, stop, play back
  (the Video / audio player from #38), re-record and clear; `required`; a max length.
- **Remote workspaces.** The recording is made here; it has to be uploaded to the server
  rather than referenced by a local path.

### QR code display (roadmap #49)
A component that draws a QR code (or a barcode) from a value — a ticket, a payment link,
a Wi-Fi login, a record's id for a label — without a workflow having to make an image.
Today the QR Code Maker example does it with a workflow and an Image component.

Things to settle first:
- **Library.** Core already has `qrcode`; the desktop would need it too (or a lighter
  encoder) — SVG output, so it stays sharp at any size and in dark mode (quiet zone and
  dark modules on white, since scanners need the contrast).
- **Props.** `value` (bindable), error correction level, size / fit, colors, an optional
  logo in the middle, and a caption.
- **Barcodes.** Whether Code 128 / EAN belong in the same component (`kind`), which needs
  another library.
- **Getting it out.** Copy as image / save as PNG or SVG, and printing labels — or a
  workflow output with the same drawing for PDFs.
