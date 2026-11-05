# Embedding Web Pages and HTML

The **Web page / HTML** component (`embed`) shows a page inside an app. That can be a website, an HTML file a workflow wrote, or HTML text a workflow returned. The page can also **send data back to the app**: a click inside a report can fill a details card, show a message or run a workflow.

This guide covers what an embed can show, how a page talks to the app, and the safety rules that keep embedded pages fenced in.

## What an embed can show

| Set | Shows | Example |
|---|---|---|
| `html` | HTML text, usually a workflow output. It wins over `src`. | `"{{ runnables.report.outputs.html }}"` |
| `src` with a web address | A website (`http://` or `https://`). | `https://www.openstreetmap.org/export/embed.html?bbox=…` |
| `src` with a file path | An HTML file a workflow wrote. Same rules as images and PDFs: inside `~/Tipeline`, or anywhere for an app you trust (the app's **Edit → File access**). | `"{{ runnables.report.outputs.path }}"` |

```yaml
- id: reportHtml
  type: embed
  props:
    title: Monthly report
    html: "{{ runnables.report.outputs.html }}"
    emptyText: Making the report…
```

Other properties:

| Property | What it does |
|---|---|
| `title` | Shown in the bar above the page. |
| `blockScripts` | The page's scripts don't run. By default they run, fenced in (see [Safety](#safety)). |
| `hideToolbar` | No bar with the title, **Reload** and **Open in browser**. |
| `emptyText` | Shown while there's nothing to show yet. |

An HTML **file** is read again every time a run bound to it finishes. Workflows often rewrite the same report file, so the embed always shows the latest one. **Reload** reloads it by hand.

## Sending data from the page to the app

### The one line your page needs

Anywhere in the page's JavaScript:

```js
parent.postMessage({ type: 'recordClick', record: { id: 3, name: 'Initech' } }, '*');
```

`parent` is the window around the page, which is the Tipeline app. `postMessage` is the browser's standard way for a page in a frame to talk to the page around it. Tipeline adds nothing of its own to the page: there's no library to load.

You can send any plain data: an object, a list, a text or a number.

### Where it arrives

The embed showing the page catches the message. It then does two things:

1. **Keeps it as `<id>.message`**, where `<id>` is the embed's component ID. Only the latest message is kept; each new one replaces it.
2. **Fires the embed's `message` event**, listed in the builder as **On message from the page**.

So with an embed whose ID is `reportHtml`, the message above is read as:

| Binding | Value |
|---|---|
| `reportHtml.message` | `{ type: 'recordClick', record: { id: 3, name: 'Initech' } }` |
| `reportHtml.message.type` | `recordClick` |
| `reportHtml.message.record.name` | `Initech` |

::: tip The page never names the component
`reportHtml` is just the embed's **ID**, which you choose in **Properties → ID**; renaming it updates the bindings that use it. The page doesn't say which component it's talking to. Its message goes to the one embed that shows it. If the same report is shown in two embeds, `reportA` and `reportB`, a click in each lands in its own `reportA.message` or `reportB.message`.
:::

`.message` itself is fixed: it's where every embed keeps its last message, the same way an Input keeps its text in `<id>.value`.

### Using a message

There are two ways to use a message, and an app can mix them.

**React to it with the event.** Under the embed's **On message from the page**, add actions like any other event: run a workflow, set state, show a toast, open a dialog.

```yaml
events:
  message:
    - { type: setState, key: picked, value: "{= reportHtml.message.record =}" }
    - { type: run, runnable: loadRecord }
    - { type: toast, message: "Opening {{ reportHtml.message.record.name }}" }
```

**Show it with a binding.** Any component can read the last message directly and updates when a new one arrives:

```yaml
- id: clicked
  type: keyValue
  props:
    data: "{= reportHtml.message.record =}"
    emptyText: Click a row in the report
```

A runnable's inputs can use it too, for example `recordId: "{= reportHtml.message.record.id =}"`.

### Step by step: a clickable report

This is the **Embed** example app (`examples/apps/embed.yml`) with its workflow `make-html-report.yml`.

**1. The workflow builds HTML with a small script in it.** The rows carry an ID, and a click sends that row's record:

```html
<table>
  <tbody>
    <tr data-id="1"><td>Acme Corp</td><td>$1,200</td></tr>
    <tr data-id="3"><td>Initech</td><td>$3,400</td></tr>
  </tbody>
</table>
<script>
  const records = [/* the workflow writes the records here as JSON */];
  document.querySelectorAll('tbody tr').forEach((tr) =>
    tr.addEventListener('click', () => {
      const record = records.find((r) => String(r.id) === tr.dataset.id);
      parent.postMessage({ type: 'recordClick', record }, '*');
    })
  );
</script>
```

The workflow returns this HTML as an output (`html`) and also saves it as a file (`path`).

**2. The app shows it in an embed and reacts to the message:**

```yaml
runnables:
  report:
    mode: run
    workflow: makeReport
    trigger: load
    outputs: [html, path]

components:
  - id: reportHtml
    type: embed
    props:
      html: "{{ runnables.report.outputs.html }}"
    events:
      message:
        - { type: toast, message: "Clicked {{ reportHtml.message.record.name }} in the report" }

  - id: clicked
    type: keyValue
    props:
      data: "{= reportHtml.message.record =}"
      emptyText: Click a row in the report
```

**3. Run it:** click a row in the report, and the toast shows its name while the details card fills in.

### Several kinds of messages

Tipeline doesn't read `type`; it's a convention used in these examples. It helps when one page sends different things, such as `recordClick` and `exportRequested`, because whatever reads the message can tell them apart.

App actions have no conditions, so every message runs the same **On message from the page** actions. To act differently per kind:

- **Pass the whole message to a workflow** and let it decide: for example a runnable with the input `request: "{= reportHtml.message =}"` whose script switches on `request.type`.
- **Use separate embeds** when the kinds come from different pages, each with its own actions.
- **Branch in what you show**: Liquid conditions work in text bindings, for example `{% if reportHtml.message.type == 'recordClick' %}…{% endif %}`.

### Rules for messages

- **Only the embed's own page counts.** Messages from other windows, or from a frame *inside* the embedded page, are ignored. Send from the page itself.
- **Plain data only** (anything that can be written as JSON), up to **256 KB**. A message holding functions or page elements is dropped.
- **The latest message wins.** `<id>.message` holds one message, not a history. Collect them with **Set state** if you need several.
- **Scripts must be in the page.** Inline `<script>` blocks run; scripts loaded from the internet (a CDN) don't, for HTML text or files. Websites shown by address load their own scripts as usual.
- **`blockScripts` stops messages too**, because without scripts the page can't send anything.
- **Nothing is sent in the builder.** Messages arrive only when the app runs: in **Preview**, or when the app is opened.
- **One direction.** A page can send to the app; the app can't send data into a running page. To show different data, have the workflow build the HTML with it (or pass it in the address of a website).

## Safety

Embedded pages are fenced in:

- **Every page runs in a sandbox.** HTML text and files run with no origin of their own, so their scripts can't read the app, its data or Tipeline's connection to your workflows. Websites keep their own origin (they need their cookies), so an address pointing at Tipeline itself is refused.
- **No page can navigate the app away.** Links that open a new window open in your browser.
- **No camera, microphone, location or notifications.** Tipeline denies these to every embedded page, without asking.
- **Files follow the app's file access.** A file outside `~/Tipeline` is shown only if you trust the app (**Edit → File access**).

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| A website shows blank or an error | Many sites (Google, GitHub, banks…) refuse to be shown inside other apps. Use **Open in browser** in the embed's bar, or embed a page the site offers for embedding (maps, videos, dashboards often have one). |
| "This file is outside ~/Tipeline" | Have the workflow save under `~/Tipeline/output/`, or trust the app in its **Edit → File access**. |
| The page's script doesn't run | It's loaded from the internet (only inline scripts run in HTML text and files), or **Block the page's scripts** is on. |
| The message event never fires | Check the page sends with `parent.postMessage(...)` from the page itself (not a frame inside it), and that the data is plain JSON. In the builder nothing is sent: use **Preview**. |
| The builder says "Shows … when the app runs" | The embed is bound to a workflow output, which only exists when the app runs. Use **Preview** to see the page. |
