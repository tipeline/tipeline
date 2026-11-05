# Custom Components

When no built-in component fits, write your own. A **Custom (HTML)** component (`custom`) is your own HTML, CSS and JavaScript, inside an app. It gets data from the app, and it can tell the app what happened in it.

Typical uses are a seat or room picker, a floor plan, a drawing, a special chart, or a small game.

## The smallest one

```yaml
- id: hello
  type: custom
  props:
    eventNames: [hello]
    code: |
      <button id="say">Say hello</button>
      <script>
        document.getElementById('say').onclick = () => tipeline.emit('hello', { at: Date.now() });
      </script>
  events:
    event:hello:
      - { type: toast, message: "Hello at {{ hello.lastEvent.payload.at }}" }
```

In the builder, drag **Custom (HTML)** from the palette and write the code in **Code**, which has a full-screen editor. List the events it fires in **Events it can fire**. Each event then appears under the component's events as **On “hello”**.

## The `tipeline` bridge

Your code gets one object, `tipeline`:

| | What it does |
|---|---|
| `tipeline.data` | The component's **Data** prop, as it is now: any value, usually a binding to a workflow's output. |
| `tipeline.onData(fn)` | Calls `fn(data)` right away, then again whenever the data changes. Returns a function that stops it. |
| `tipeline.emit(name, payload)` | Fires the event `event:<name>` (**On “name”**). The app reads `<id>.lastEvent.name` and `<id>.lastEvent.payload`. |
| `tipeline.setValue(value)` | Sets `<id>.value`, like an input's value. Use it for what the component "holds", such as the chosen seats. |
| `tipeline.theme` | `'light'` or `'dark'`. A `tipeline:theme` event fires on `window` when it changes. |

```js
tipeline.onData((hall) => draw(hall));            // data in, kept current
button.onclick = () => {
  tipeline.setValue(picked);                      // seatPicker.value
  tipeline.emit('pick', { seat, picked });        // On “pick”
};
```

**Data doesn't reload the page.** When the data changes (for example, a workflow ran again), your page stays and `onData` is called with the new value, so whatever the person picked or typed is kept. Only a change to the **code** reloads the page.

**Events must be listed.** An `emit` whose name isn't in **Events it can fire** is ignored, with a note in the developer console. Only listed events can have actions in the builder.

**Payloads are plain data.** Anything that can be written as JSON is fine, up to 256 KB.

## Looking like the app

The page gets the app's colors as CSS variables, and they switch with light and dark mode without reloading:

`--tl-background`, `--tl-foreground`, `--tl-muted`, `--tl-muted-foreground`, `--tl-border`, `--tl-primary`, `--tl-primary-foreground`, `--tl-accent`, `--tl-card`, `--tl-destructive`

```css
button { background: var(--tl-background); color: var(--tl-foreground); border: 1px solid var(--tl-border); }
button.picked { background: var(--tl-primary); color: var(--tl-primary-foreground); }
```

The page's background is transparent and its text uses a system font in the app's text color, so a component without any CSS already fits in.

## Bindings and your code

**Code** is kept exactly as written. `{{ … }}` in it belongs to your code, for example a template library's syntax, and is never read as a Tipeline binding. Renaming components doesn't touch it either. To get app values into the code, use **Data**: a binding there, such as `{= runnables.seats.outputs.hall =}`, arrives as `tipeline.data`.

## Rules

The code runs fenced in, like an [Embed](./embed)'s HTML:

- **Its own sandbox.** The page has no access to the app, its data or Tipeline's connection to your workflows, except through `tipeline`.
- **Inline scripts only.** `<script>` blocks in the code run; scripts loaded from the internet (a CDN) don't. Paste a small library into the code if you need one.
- **No camera, microphone, location or notifications.**
- **Nothing fires in the builder.** The builder shows the component, but its events and value only work when the app runs (**Preview**, or opening the app). In the builder, a bound **Data** is `null`.

## Example

`examples/apps/custom-component.yml` is a seat picker. A workflow gives it the taken seats (`tipeline.data`), and clicking seats fires **On “pick”**. The chosen seats come back as `seatPicker.value`, which a **Book** button sends to another workflow. After booking, the list is read again and the picker updates without reloading.
