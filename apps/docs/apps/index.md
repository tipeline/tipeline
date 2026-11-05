# Apps

Apps are dashboards you build in the desktop app. Every action in an app — loading a table, clicking a button, refreshing a KPI — runs a **workflow**. The app collects values from the page, passes them to the workflow as inputs, and shows what the workflow returns.

Apps are a desktop feature: you build them in the App Builder and open them from **Apps** in the sidebar.

## Concepts

| Concept | What it is |
|---|---|
| **Page** | A 12-column grid of components, in rows of 10px (`layout: { x, y, w, h }` — `x`/`w` in columns, `y`/`h` in rows). An app has one or more pages; a page can be hidden from the page menu and reached only by navigation. |
| **Component** | Something drawn on the page: Text, Button, KPI Card, Table. Each has an **ID** used to reference it from bindings. |
| **Runnable** | A named connection from a page to a workflow. It either **runs** the workflow (inputs in, outputs back) or **reads the history** of its past runs. |
| **Action** | What happens on an event: run a runnable, navigate, set state, show a message. Actions run in order; a failed run stops the rest. |
| **State** | App-wide values (e.g. a selected record) that survive page changes. |
| **Binding** | A value computed when the page runs, written with the same syntax as workflows. |

## Building an app

1. **Apps → New App**, give it a name.
2. Drag components from the **Components** tab onto the canvas. Drag to move, pull an edge to resize, drop on **Trash** (or use the ✕ on hover) to remove.
3. In the right sidebar, **Data** tab → **+** to add a runnable: pick the workflow, choose **Run workflow**, map inputs and tick the outputs you want back.
4. Select a component → **Properties**: set its props (bindings allowed) and its events (e.g. a button's *On click → Run*).
5. Changes save automatically (⌘/Ctrl+S saves immediately).

### Builder tools

| Tool | How |
|---|---|
| Undo / redo | ⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z, or the toolbar arrows |
| Duplicate | ⌘/Ctrl+D, or the copy icon on a component |
| Copy / paste | ⌘/Ctrl+C, ⌘/Ctrl+V — also into another page (actions pointing to things missing there are removed) |
| Delete | Delete / Backspace, the ✕ on a component, or drop it on Trash |
| Layers | Left sidebar → **Layers**: every component of the page, in reading order, indented under its container or tab |
| Autocomplete | In any field marked **fx** — every text and JSON prop, form-field and tab labels — type `{{` or `{=` (or click **{}**) to pick a state value, runnable output, field value or selected row |
| Problems | Toolbar badge: missing workflows, inputs/outputs the workflow doesn't allow, bindings to things that don't exist or aren't closed, runnables nothing runs. Click one to jump to it. The same problems show in **Properties** under the field, event or runnable they're about |
| YAML | Edit the whole app as YAML; **Apply** validates it first |
| Preview | Runs the page (with dialogs) against your real workflows — the app is saved first |

Renaming a component or a runnable updates every binding that refers to it.

## Connecting to a workflow

A workflow decides what an app may touch through **variable visibility**:

| Visibility | App can set it (input) | App can read it (output) |
|---|---|---|
| `public` | ✅ | ✅ |
| `protected` | ✅ | ✅ |
| `private` (default) | ❌ | ❌ |

Secret variables are never returned to an app. Mark the variables your app needs as `public` in the workflow.

**Keep in run history** — turn it off for read-only lookups (loading a table, filling a KPI) so they don't fill the workflow's history. Leave it on for actions that change something, so every run is auditable.

**Confirmation message** — when set, the user must confirm before the workflow runs (e.g. `Approve invoice {{ invoiceTable.selectedRow.number }}?`).

## Bindings

| Syntax | Result |
|---|---|
| `{{ expr }}` | LiquidJS template — always text; filters and `{% if %}` work |
| `{= path =}` | The value itself, with its type (array, object, number) — must be the whole value |

When you leave a field, its bindings are highlighted. A reference to something that isn't on the page gets a red (or amber) underline, and so does a malformed binding such as `{{ state.tab }` — at runtime that would show as an empty value without any error. JSON props (table columns, chart series, …) are edited in a code editor that marks invalid JSON and the bindings inside it the same way.

What you can reference:

| Reference | Meaning |
|---|---|
| `state.name` | App state |
| `runnables.NAME.outputs.VAR` | A run's returned variable |
| `runnables.NAME.data` | Rows read by a history runnable |
| `runnables.NAME.isRunning` / `.error` | Status of a runnable |
| `COMPONENT_ID.selectedRow` | The row last clicked in a table |
| `page.params.KEY` | Parameters passed when navigating to this page |
| `result` / `error.message` | Inside a runnable's *On success* / *On error* actions |

## YAML format

Apps can be installed from a YAML file (**Apps → Install App**) or from a hub.

To move apps to another computer, use **Export** on an app's page (<kbd>⌘E</kbd>) or **Export All** on the Apps list. Either one saves a zip with each app's YAML and a `workflows/` folder holding the workflows the apps use, all named after the app or workflow (`workflows/invoice-report.yml`). Unzip it and install the app's YAML; its workflows are installed with it.

```yaml
schemaVersion: 4
name: Invoice Desk
version: "1.0.0"
description: Approve pending invoices

# Workflows used by this app. Pages only use the alias (left side).
workflows:
  listInvoices: { identifier: Xk3bP-q9Lw2 }            # an installed workflow
  approveInvoice: { file: ./workflows/approve.yml }    # shipped with the app

state:
  status: pending

pages:
  - id: queue
    name: Queue
    icon: Inbox
    runnables:
      invoices:
        mode: run
        workflow: listInvoices
        trigger: load            # load | manual
        inputs: { status: "{{ state.status }}" }
        outputs: [rows, total]
        persist: false
      approve:
        mode: run
        workflow: approveInvoice
        inputs: { invoiceId: "{= invoiceTable.selectedRow.id =}" }
        confirm: "Approve invoice {{ invoiceTable.selectedRow.number }}?"
        onSuccess:
          - { type: toast, message: Approved, variant: success }
          - { type: run, runnable: invoices }
        onError:
          - { type: toast, message: "{{ error.message }}", variant: error }
    components:
      - id: invoiceTable
        type: table
        name: Invoices
        layout: { x: 0, y: 7, w: 12, h: 42 }
        props:
          data: "{= runnables.invoices.outputs.rows =}"
          columns:
            - { key: number, header: Invoice }
            - { key: amount, header: Amount, format: currency }
      - id: approveButton
        type: button
        name: Approve
        layout: { x: 0, y: 0, w: 3, h: 7 }
        props: { label: Approve selected }
        events:
          click: [{ type: run, runnable: approve }]
```

### Shipping workflows with an app

A `workflows` entry can point at a workflow file (relative to the app file) instead of an
installed workflow. Installing the app installs those workflows too and stores their
identifiers — so an app and its workflows install in one step. The app and every
referenced workflow are validated before anything is installed. Installing the same
app again reuses workflows that are already installed from the same file contents
instead of creating copies.

Apps installed from a hub use `{ hub: <catalog id> }` references instead: the hub install
installs (or reuses) each workflow from the same hub. A `hub` reference can't be installed
from a local file.

### Components

| Type | Props | Events | Exposes |
|---|---|---|---|
| `text` | `content`, `markdown`, `fontSize`, `fontWeight` (`normal`/`medium`/`semibold`/`bold`), `color` | — | — |
| `button` | `label`, `variant`, `disabled`, `icon` | `click` | — |
| `kpi` | `label`, `value`, `format` (`text`/`number`/`currency`/`percent`), `currency`, `trend`, `trendDirection`, `spark`, `sparkKey`, `linkText`, `color`, `colorRules` | `click` (with actions, the card shows a link line — `linkText`, or “View details” — and the whole card is clickable) | — |
| `table` | `data`, `columns` (`key`, `header`, `sortable`, `format`, `currency`, `colors`, `linkText`, `filter`, `copy`, `highlight`, `editable`, `editor`, `options`, `required`, `default`, `width`, `minWidth`), `fit`, `expandable`, `detailFields`, `rowActions` (`id`, `label`, `variant`), `multiSelect`, `bulkActions` (`id`, `label`, `variant`), `searchable`, `exportable`, `sortable`, `sortBy`, `sortOrder`, `pageSize`, `pagination`, `total`, `rowKey`, `allowAdd`, `allowDelete`, `saveLabel` | `rowClick`, `pageChange`, `action:<rowActionId>`, `bulk:<bulkActionId>`, `selectionChange`, `save` | `selectedRow`, `selectedRows`, `page`, `pageSize`, `changes` (`added`, `updated`, `deleted`), `hasChanges` |
| `form` | `title`, `fields` (a list, or a binding to one — see [Fields from data](#fields-from-data)), `submitLabel`, `resetLabel` | `submit` (only when valid) | `values`, `errors` |
| `input` | `inputType` (`text`/`number`/`textarea`/`date`/`file`/`email`/`password`/`phone`/`currency`/`time`/`datetime`/`code`/`richtext`/`slider`/`color`), `label`, `placeholder`, `description`, `required`, `default`; currency: `currency`; number and slider: `min`, `max`, `step`, `range`, `unit`; richtext: `format`; color: `alpha`, `swatches`; code: `language`, `preview`, `previewHtml`, `variables` (see [Code with a preview](#code-with-a-preview)) | `change`, `preview` (code) | `value` |
| `select` | `options`, `multiple`, `display` (`dropdown`/`list`/`buttons`), `search` (`off`/`local`/`remote`), `label`, `placeholder`, `description`, `required`, `default` | `change`, `search` (remote) | `value`, `selectedOptions`, `search` |
| `checkbox` | `label`, `description`, `default`, `display` (`switch`/`checkbox`) | `change` | `value` |
| `dateRange` | `label`, `placeholder`, `description`, `required`, `default` (a preset or `{ from, to }`), `hidePresets` | `change` | `value` (`{ from, to }` or null), `from`, `to` |
| `alert` | `title`, `message`, `variant` (`info`/`success`/`warning`/`error`), `visible` | — | — |
| `chart` | `chartType` (`bar`/`line`/`area`/`pie`/`doughnut`/`hbar`/`scatter`/`funnel`/`heatmap`), `title`, `data`, `xKey`, `yKey`, `labelKey`, `series` (`key`, `label`), `stacked`, `format`, `currency` | `pointClick` | `selectedPoint` |
| `runConsole` | `runnable`, `title` | — | — |
| `approvals` | `title`, `workflows` (aliases; all of the app's when empty) | `decided` | `lastDecision` (`approved`, `comment`, `title`, `workflow`, `pipelineIdentifier`) |
| `image` | `src`, `alt`, `fit` (`contain`/`cover`/`fill`/`none`), `caption`, `zoomable` | `click` | — |
| `badge` | `value` (or a list, for tags), `label`, `colors`, `defaultColor`, `size` (`sm`/`md`) | — | — |
| `keyValue` (Details) | `title`, `data`, `fields` (`key`, `label`, `format`, `currency`), `display` (`list`/`grid`), `emptyText`, `hideEmpty`, `copyable` | — | — |
| `listView` (List view) | `data`, `itemName`, `indexName`, `itemKey`, `itemsPerRow` (1–6), `emptyText` | `itemClick` | `selectedItem`, `selectedIndex` |
| `container` | `title`, `description`, `visible` | — | — |
| `tabs` | `tabs` (`id`, `label`), `defaultTab`, `display` (`tabs`/`steps`/`accordion`), `backLabel`, `nextLabel`, `finishLabel`, `visible` | `change`, `finish` (steps) | `activeTab` |
| `buttonGroup` | `items` (`id`, `label`, `icon`, `variant`), `display` (`row`/`menu`), `label`, `icon`, `variant` | `action:<itemId>` | `clicked` |
| `progress` | `label`, `value`, `max`, `display` (`bar`/`circle`), `showValue`, `color`, `colorRules`, `description` | — | — |
| `json` | `title`, `data`, `expandDepth`, `emptyText` | — | — |
| `runs` | `title`, `workflows`, `statuses`, `limit`, `emptyText`, `hideCancel`, `hideOpen` | `rowClick` | `selectedRun` (`status`, `pipelineIdentifier`, `workflowName`) |
| `fileDrop` | `label`, `description`, `placeholder`, `multiple`, `accept`, `maxSizeMb`, `maxFiles`, `required` | `change` | `value` (path or paths), `files` (`name`, `path`, `size`, `type`) |
| `timer` | `label`, `interval`, `running`, `repeat`, `hideControls`, `visible` | `tick` | `ticks`, `lastTick`, `running` |
| `chat` | `title`, `runnable`, `reply`, `welcome`, `placeholder`, `suggestions` | `send`, `reply` | `message`, `messages`, `reply` |
| `pdf` | `title`, `src`, `page`, `hideToolbar`, `emptyText` | `pageChange` | `page`, `pages` |
| `map` | `title`, `data`, `latKey`, `lngKey`, `labelKey`, `colorKey`, `colors`, `defaultColor`, `popupFields`, `center`, `zoom`, `tiles`, `attribution` | `markerClick` | `selectedMarker`, `selectedIndex` |
| `calendar` | `title`, `data`, `titleKey`, `startKey`, `endKey`, `colorKey`, `colors`, `defaultColor`, `view`, `views`, `initialDate`, `firstDay` | `eventClick`, `dateSelect`, `rangeChange` | `selectedEvent`, `selectedDate`, `selectedStart`, `selectedEnd`, `from`, `to` |
| `embed` | `title`, `src`, `html`, `blockScripts`, `hideToolbar`, `emptyText` | `message` | `message` |
| `kanban` | `title`, `data`, `groupKey`, `columns`, `titleKey`, `fields`, `colorKey`, `colors`, `rowKey`, `readOnly`, `emptyText` | `cardClick`, `cardMove` | `selectedCard`, `lastMove` (`card`, `to`, `index`) |
| `timeline` | `title`, `data`, `timeKey`, `titleKey`, `descriptionKey`, `fields`, `colorKey`, `colors`, `iconKey`, `sort`, `groupByDay`, `timeFormat`, `emptyText` | `itemClick` | `selectedItem` |
| `media` | `title`, `src`, `kind`, `poster`, `autoplay`, `loop`, `muted`, `hideControls`, `startAt`, `emptyText` | `play`, `pause`, `ended` | `playing`, `currentTime`, `duration`, `ended` |
| `custom` | `title`, `code`, `data`, `eventNames` | its own events | `value`, `lastEvent` (`name`, `payload`) |
| `divider` | `label`, `align`, `orientation`, `lineStyle`, `thickness`, `color`, `visible` | — | — |
| `gallery` | `title`, `data`, `srcKey`, `captionKey`, `display` (`grid`/`carousel`), `columns`, `fit`, `autoplay`, `zoomable`, `hideCaptions`, `emptyText` | `itemClick`, `change` | `selectedItem`, `index` |
| `avatar` | `name`, `src`, `subtitle`, `showName`, `status`, `color`, `size`, `shape`; for a group: `data`, `nameKey`, `srcKey`, `subtitleKey`, `statusKey`, `display` (`stack`/`list`), `max`, `title`, `emptyText` | `click`, `itemClick` | `selectedItem`, `selectedIndex` |
| `breadcrumbs` | `items`, `homeIcon` | — | — |
| `pagination` | `total`, `pageSize`, `pageSizes`, `compact`, `hideSummary` | `change` | `page`, `pageSize`, `offset` |
| `tree` | `title`, `data`, `idKey`, `labelKey`, `childrenKey`, `parentKey`, `iconKey`, `countKey`, `selection`, `defaultChecked`, `expandDepth`, `search`, `searchPlaceholder`, `emptyText` | `itemClick`, `change` | `selectedNode`, `selectedId`, `checked`, `checkedLeaves` |

`default` values may be bindings; they're resolved when the page opens (and on `reset`).

### Frames

Each component sits in a card (a background and a border) or straight on the page.
Pick it under **Properties → Frame**, or set `frame` next to `layout`:

```yaml
- id: status
  type: badge
  frame: card        # card | none
  layout: { x: 0, y: 0, w: 2, h: 5 }
  props:
    value: '{{ recordsTable.selectedRow.status }}'
```

Leave it out for the type's default: `badge`, `button` and `image` have no frame,
everything else is a card. In the builder a frameless component shows a faint dashed
outline so you can still select, move and resize it; the running app draws none.

### Fill to bottom

A table, chart or board at the bottom of a page usually wants the rest of the window.
Turn on **Properties → Fill to bottom**, or set `fill: true` next to `layout`:

```yaml
- id: ordersTable
  type: table
  fill: true
  layout: { x: 0, y: 10, w: 12, h: 35 }
```

When the app runs, the component grows down to the bottom of the page — or of the
container or tab it sits in, minus its padding — and follows the window as it resizes.
It only grows when nothing sits below it in its own columns: a directory list on the left
can fill while a details card and a table share the right. It never gets shorter than
its `h`, and when the page is taller than the window it reaches down to the lowest
component instead, so the page scrolls as before. In a dialog (`openModal`), whose height
follows its content, it also reaches the lowest component; drawers fill to their bottom.
The builder canvas keeps the height you set
and marks the component "Fills to bottom".

### Markdown text

Turn on `markdown` and a `text` component renders its content as Markdown: headings,
**bold** / *italic*, lists, quotes, code, tables, horizontal rules, images and links. A
single line break is kept as a break. Bindings work as anywhere else — they're filled in
first, then the result is rendered:

```yaml
- id: summary
  type: text
  props:
    markdown: true
    content: |
      ### {{ recordsTable.selectedRow.name }}
      Status: **{{ recordsTable.selectedRow.status }}** · [open the docs](https://example.com)
```

It is safe with any data: HTML in the text (or in a bound value) is shown as written,
never run; links open in the system browser (`http`, `https` and `mailto` only — others
show as plain text); images load from `https` (or inline `data:` images). `fontSize`,
`fontWeight` and `color` apply to the whole text.

### Containers and tabs

A `container` (a titled box) and `tabs` (one box per tab) each have their own 12-column
grid. In the builder, drop components straight into them; for tabs, into the tab that's
open (click a tab on the canvas to switch). Drag a component that's already on the canvas
into a container or tab, or out of one, to move it — or pick its **Location** in Properties.
Duplicating, copying or deleting a container takes everything inside it along.
`examples/apps/layout-showcase.yml` shows tabs, containers, a section shown on demand and
buttons that switch tab.

In YAML a component inside one names it in `parent`; its `layout` is then relative to that
grid. Inside tabs, `parent.tab` is the tab's `id`:

```yaml
components:
  - id: sections
    type: tabs
    layout: { x: 0, y: 0, w: 12, h: 56 }
    props:
      tabs:
        - { id: summary, label: Summary }
        - { id: details, label: Details }
      defaultTab: "{{ state.tab }}"
  - id: filters
    type: container
    parent: { id: sections, tab: details }
    layout: { x: 0, y: 0, w: 4, h: 28 }
    props: { title: Filters }
  - id: status
    type: select
    parent: { id: filters }
    layout: { x: 0, y: 0, w: 12, h: 14 }
```

`TABS_ID.activeTab` is the open tab's id, and `change` fires when the user picks another.
The page opens on `defaultTab` (the first tab when it's empty or names no tab). To switch
tab from an event handler, set the state it's bound to, then `reset` the tabs:
`[{ type: setState, key: tab, value: summary }, { type: reset, component: sections }]`.

`visible` hides a container or tabs together with everything inside them. Components keep
their values while hidden, or while their tab isn't open.

A hidden component takes no room in a running app: the rows it frees up close, and the
components below move up. An alert is also hidden while it has no `title` or `message`, so
`message: "{{ runnables.save.error }}"` shows only once there is an error.

### Forms

A form's `fields` each have a `name` (its value is `FORM_ID.values.NAME`), a `type`
(`text`, `number`, `textarea`, `date`, `select`, `multiselect`, `checkbox`, `file`, `color` and more),
and optional `label`, `required`, `placeholder`, `description`, `options`, `default`.
A `checkbox` field (like the `checkbox` component) is drawn as a switch; `display: checkbox`
makes it a tick box instead — e.g. for "I accept the terms". The value is true/false either way.

A `select` (component or field) is a dropdown; with a few options it often reads better
with all of them on screen: `display: list` shows radio buttons, `display: buttons` a row of
buttons with the chosen one pressed. With `multiple` (or a `multiselect` field) the choices
are `list` — tick boxes, the default — and `buttons`, where several can be pressed. The
value is the same in every display. `examples/apps/choice-fields.yml` shows every look side by side,
with the values live.
Submit checks required fields and numbers first; `submit` only fires when the form is valid.

While the workflow that Submit started runs, the form's footer shows how many steps have
finished, the last one, and the elapsed time. When it ends, the footer says how it went:
done (with its duration, for a few seconds), failed (naming the step and the error), or
waiting for approval. The last two stay until the next submit, and **View run** opens the
run in its own window. While the run is going (or waiting for approval), **Cancel run**
stops it — see [Cancel a run](/desktop/pipelines#cancel-a-run). A canceled run is neither
a success nor a failure: `onSuccess` and `onError` don't run, and the footer says
**Canceled**.

**Generate from workflow** (form properties in the builder) creates the fields from a
workflow's public and protected variables, adds a `FORM_IDSubmit` runnable that passes
every field as the matching input, and runs it on submit. An empty field is sent as
"not set" for non-text variables, so the workflow keeps its own default.

`file` fields open the system file picker and pass the chosen path to the workflow.

#### Fields from data

A form's fields can also come from a workflow. Instead of a list, set `fields` to one
binding to a list of fields (turn on **Fields from data** in the form's properties):

```yaml
- id: nodeForm
  type: form
  props:
    fields: "{= runnables.node.outputs.form =}"
    submitLabel: Save
```

Each entry is written like a field in the list (`name`, `label`, `type`, `default`,
`options`, …). Entries that aren't valid fields, and a second field with a name already
used, are left out. A default is taken as it is, so it can hold text such as a template.
The form is empty until the binding resolves. When it changes, a field still there with
the same type and default keeps what was typed into it, and a new or changed field starts
at its default. Because the field names are only known at runtime, references to
`FORM_ID.values.NAME` aren't checked against them.

`examples/apps/cms.yml` (Tipeline CMS) builds its content editor this way: the fields
come from the content type, filled with the node's values.

### Code with a preview

`inputType: code` is a code editor highlighted for its `language`, with a full-screen
mode. Two more settings make it a template editor, like a workflow's String template step:

- `preview: true` adds a **Code | Preview** switch. Preview shows `previewHtml`, usually a
  workflow's output, and opening it fires the input's `preview` event, so a runnable can
  make that HTML from the text as it stands. The full-screen editor shows the preview
  beside the code and asks again once you stop typing.
- `variables` (a list of names, or a binding to one) adds a **{ }** button that inserts
  `{{ name }}` at the cursor.

The app only shows the editor. The rendering stays in the workflow:

```yaml
runnables:
  preview:
    mode: run
    workflow: renderPreview
    inputs: { html: "{= templateCode.value =}" }
    outputs: [result]
components:
  - id: templateCode
    type: input
    props:
      inputType: code
      language: html
      preview: true
      previewHtml: "{= runnables.preview.outputs.result =}"
      variables: [node.title, node.body, site.name]
    events:
      preview: [{ type: run, runnable: preview }]
```

To fill in a template a workflow has stored, use the **Render Template** step
(`string.renderTemplate`). `examples/apps/cms.yml` (Tipeline CMS) edits its site
templates this way.

### Color picker

`inputType: color` on an Input (or `type: color` on a form field) picks a color. The
swatch next to the text opens the picker:
- a square for saturation and brightness, and a hue strip;
- the `swatches` you give, one click each;
- an eyedropper that takes any color from the screen.

The hex can also be typed, short (`#abc`) or as `rgb(…)`.

```yaml
- id: brand
  type: input
  props:
    inputType: color
    label: Brand color
    default: "#3b82f6"
    swatches: ["#ef4444", "#22c55e", "#3b82f6"]   # optional; may be a binding
    alpha: true                                   # optional: an opacity strip
  events:
    change: [{ type: run, runnable: palette }]
```

- **The value** is always lower-case hex, `#rrggbb`, whatever was typed. With `alpha`, a
  see-through color is `#rrggbbaa` (`#ef444480` is half see-through red).
- **On change** fires once the color settles: when you let go of a drag, a key, a swatch
  or the Enter key. A workflow then runs once, not once for every step of the drag.
- **Checks:** text that isn't a color says so when the field is left, and fires nothing.
  `required` works as on other fields.

Tables, Details, timelines and kanban cards show a color with `format: color`: a small
swatch and its hex. `examples/apps/color-palette.yml` makes shades from a picked color
and saves a label's see-through colors from a form.

### Actions

| Action | Fields |
|---|---|
| `run` | `runnable`, optional `refresh` |
| `navigate` | `page`, optional `params` |
| `openModal` | `page`, optional `params`, `display` (`dialog`/`drawer`), `side` (`right`/`left`, drawers), `size` (`sm`/`md`/`lg`/`xl`) — shows the page in a dialog or a side drawer. The rest of the list runs if it's closed with `closeModal`, and stops if it's dismissed |
| `closeModal` | — closes the dialog the page is shown in |
| `openUrl` | `url` — opens an `http`, `https` or `mailto` link in the browser or mail app |
| `openFile` | `path`, `mode` (`open`/`reveal`/`save`) — a file a workflow wrote: open it with its default app (only files inside `~/Tipeline`, never programs), show it in its folder, or **Save as…** a copy |
| `reset` | `component` — puts an input, form or tabs back to its defaults, drops a table's unsaved edits and unchecks its rows, or forgets a list view's selected item |
| `setState` | `key`, `value` |
| `toast` | `message`, `variant` (`default`/`success`/`error`) |

### List view

A `listView` repeats one item's template for every element of `data` — a card per
record. Its children (`parent: { id: <listId> }`, placed like a container's) are that
template; inside them, `item` is the element and `index` its position (from 0):

```yaml
- id: recordCards
  type: listView
  props: { data: "{= runnables.records.outputs.records =}", itemsPerRow: 2 }
- id: cardName
  type: text
  parent: { id: recordCards }
  props: { content: "{{ item.name }}" }
- id: cardClose
  type: button
  parent: { id: recordCards }
  props: { label: Close }
  events:
    click: [{ type: run, runnable: close }]   # the runnable's inputs can use item too
```

Like a forEach loop's `currentItem` / `indexVariable`, a list view can name them:
`itemName: record` and the template writes `{{ record.name }}` (`indexName` names the
position). Without them they're `item` and `index`. The names can't be a component id on
the page or a reserved name (`state`, `page`…). Renaming them in the builder updates the
template's bindings — and the page's runnables, unless another list still uses the old
name. In the builder, the template's header shows the names, and autocomplete
offers `record.<field>` once the builder knows the items' fields — from items written
into `data`, from what the list showed in **Preview** (open it once), or from the
workflow's latest saved run. The list view's properties show which fields are known and
where they came from. The builder never runs a workflow to find out.

An event inside an item — a button's click — first makes that item the list's
`selectedItem` / `selectedIndex`, then runs its handlers; they, and the inputs,
confirmation and onSuccess / onError of the runnables they start, can use `item` and
`index`. Clicking an item anywhere selects it and fires `itemClick`. When the data
reloads, the selected item is taken again from the new data, so whatever shows it stays
current: set `itemKey` to the field that identifies an item (usually `id`) and it is
found again wherever it moved (and unselected if it's gone); without it, the selection
stays on the same position. `itemsPerRow` puts
several items side by side.

The template takes text, buttons, KPIs, alerts, details, charts and containers. Inputs,
selects, tables, forms and the other components that hold a value of their own can't go
inside (every item would share one): the builder refuses the drop and saving reports it.
`examples/apps/record-cards.yml` shows records as cards with their own buttons.

### Dividers and spacers

A `divider` draws a line between parts of a page, across (default) or up and down
between columns (`orientation: vertical`), with an optional `label` in it ("Billing")
placed at the `start`, `center` or `end`. `lineStyle` is `solid`, `dashed` or `dotted`;
`thickness` (1–8 px) and `color` (a badge color) style it; `visible` hides it.

**Spacer** in the palette is a divider with `lineStyle: none`: empty room between
sections, outlined in the builder so you can find and move it, invisible when the app
runs. To hide a whole section at once, put it in a frameless container and bind the
container's `visible`. `examples/apps/page-sections.yml` is a settings page built this way.

### Status badges

A status reads faster as a colored pill. A `badge` component shows one (`value: "{= record.status =}"`)
— or one per element when the value is a list (tags) — with an optional `label` above.
Table columns and Details fields do the same with `format: badge`:

```yaml
columns:
  - { key: status, header: Status, format: badge, colors: { closed: gray, vip: purple } }
```

Colors are `gray`, `blue`, `green`, `amber`, `red` and `purple`. `colors` sets them per value
(any case); values it doesn't list keep the usual meaning of common status words — active,
done, approved, paid… green; pending, waiting, draft… amber; failed, error, rejected… red;
new, open, running… blue; closed, archived, inactive… gray — and any other value gets a
color of its own, always the same one. A badge component's `defaultColor` replaces that
for every unlisted value.

### Images

An `image` shows a picture from `src`, which can be:

- a **file** a workflow saved — its path, absolute or relative to `~/Tipeline` (or
  starting with `~/`). Files inside your Tipeline folder always show (have the workflow
  save there, e.g. `{{ _env.HOME }}/Tipeline/output/chart.png`); files elsewhere only for
  an app you trust (the app's **Edit → File access**) or a file you picked yourself;
- a **web address** (`https://…`);
- a **data URL** (`data:image/png;base64,…`) or **bare base64**, e.g. from `image.toBuffer`.

A workflow often writes the same file on every run (a screenshot, a QR code): the image
reloads whenever a run it's bound to finishes, so it always shows the latest. `fit`
decides how it fills its box (`contain` shows all of it), `caption` adds a line under
it, and `zoomable` opens it full size on click (`click` fires either way). If the file
is missing — or outside ~/Tipeline for an app you haven't trusted — the image says so. Images can also go inside a list
view's template (`src: "{{ record.photo }}"`).

On a remote workspace, files live on the server: use web addresses, data URLs or
base64 there. `examples/apps/qr-code-maker.yml` makes a QR code and shows it.

### Pagination and breadcrumbs

A **table** pages by itself. For anything else a workflow returns one page at a time —
cards in a list view, a gallery — add a `pagination` component: give it the `total`
(usually the workflow's count), and bind the runnable's inputs to its state:

```yaml
runnables:
  orders:
    mode: run
    workflow: listOrders
    inputs:
      offset: "{= pager.offset =}"
      limit: "{= pager.pageSize =}"
components:
  - id: pager
    type: pagination
    props:
      total: "{= runnables.orders.outputs.total =}"
      pageSize: 10
      pageSizes: [10, 20, 50]     # optional: lets the person choose
    events:
      change: [{ type: run, runnable: orders }]
```

The state is `page` (from 1), `pageSize`, `offset` (rows before the page), `from` and
`to`; **On change** fires on every move. **Reset** on a pagination goes back to page 1
and keeps the chosen page size — do that when a filter changes. `compact` shows fewer
numbers; `hideSummary` hides "1–10 of 57".

A `breadcrumbs` component shows where you are — "Orders › Acme › #A-1042". Each step of
`items` has a `label` (bindings allowed) and can name a `page` (and `params`): it's then a
link there, like a Navigate action. A step without a page is plain text, and the last step
is the current page. `examples/apps/orders-browser.yml` uses both.

### Gallery

A `gallery` shows many pictures from rows (or a plain list of srcs) — each picture's src
works like an Image's (file, web link, data URL or base64), found at `srcKey` or the usual
names (src / url / image / path…), with a caption from `captionKey` (caption / title /
name…).

- `display: grid` (default): thumbnails, `columns` per row (1–6, default 3).
- `display: carousel`: one at a time, with arrows and dots; `autoplay: 5` turns it every
  5 seconds (paused while the pointer is on it). The picture shown is `<id>.index`, and
  turning it fires **On change**.

A click fires **On item click** (`<id>.selectedItem`); with `zoomable` it also opens the
picture big, with previous / next and the arrow keys. `fit` (cover / contain / fill) and
`hideCaptions` change the look. Files are read again whenever a run the gallery is bound
to finishes. `examples/apps/gallery.yml` shows postcards a workflow draws as files.

### Tree view

A `tree` shows items in a hierarchy — folders, categories, departments — to pick from (to
just *look* at nested data, use the JSON viewer). Its `data` is rows that hold their
`children`, or a flat list where each row names its parent (`parentId`):

```yaml
- id: folders
  type: tree
  props:
    data: "{= runnables.documents.outputs.folders =}"
    labelKey: name        # default: label, then name, then title
    iconKey: icon         # a Lucide icon name per row, e.g. Folder
    countKey: files       # a small number on the right
    search: true          # a box that filters by label
  events:
    itemClick: [{ type: run, runnable: documents }]
```

`idKey`, `childrenKey` and `parentKey` name other keys (defaults `id`, `children`,
`parentId`); a row without an id gets its position. `expandDepth` is how many levels start
open (default 1, the top nodes; 0 for all closed) — what's open stays open when the data
comes again.

- A click selects a node: **On item click**, with `<id>.selectedNode` (its row) and
  `<id>.selectedId`.
- `selection: multiple` adds a tick box to each node. Ticking a parent ticks all the leaves
  under it, and a parent with only some ticked shows a dash. **On change** fires with
  `<id>.checked` (ids of the fully ticked nodes, parents included) and
  `<id>.checkedLeaves` (the ticked leaves' rows). `defaultChecked` ticks ids at the start —
  a parent's id ticks everything under it — and **Reset** goes back to them.

The keyboard works as in a file explorer: the arrows move, ← and → close and open, Enter
selects and Space ticks. `examples/apps/document-library.yml` has a folder tree that picks
the files a table shows, and a tick-box tree of teams.

### Avatars

An `avatar` shows a person. It uses their picture if there is one, otherwise their
initials on a color of their own (the same name always gets the same color):

```yaml
- id: lead
  type: avatar
  props:
    name: "{{ record.owner }}"      # initials and color come from it
    src: "{{ record.photo }}"       # optional: any image src, as an Image's
    status: online                  # a dot: online, away, busy, offline (or any status)
    subtitle: Team lead
    showName: true                  # the name and subtitle beside it
    size: lg                        # sm, md (default), lg, xl
```

`shape: square` and `color` (gray, blue, green, amber, red, purple) change the look. A
picture that can't load falls back to the initials. **On click** fires when it's clicked.

With `data` (rows of people, or plain names) it shows a **group**:
- `display: stack` (the default) overlaps the avatars, up to `max` (default 5), then a
  "+N" that names the rest on hover.
- `display: list` puts one person per row, with their name and `subtitleKey`.

The keys default to name / email for the name, avatar / photo / image for the picture,
and status for the dot; `nameKey`, `srcKey`, `subtitleKey` and `statusKey` name others.
Clicking someone fires **On item click**, with `<id>.selectedItem` (their row).

A table column with `format: avatar` shows the cell's name with its avatar. Its picture
comes from the row's `srcKey`. `examples/apps/team-directory.yml` shows all of these.

### Details

A `keyValue` component (**Details** in the builder) shows one object as labeled fields —
usually the row clicked in a table:

```yaml
- id: recordDetails
  type: keyValue
  props:
    data: "{= recordsTable.selectedRow =}"
    emptyText: Select a record
    fields:
      - { key: name, label: Name }
      - { key: customer.name, label: Customer }   # a path into a nested object
      - { key: amount, label: Amount, format: currency }
```

Without `fields` it shows every key of the object, in its order. `fields` use the same
`format` and `currency` as table columns; nested objects and lists show as JSON.
`display: grid` puts the label above the value and fits several fields per line (the
default, `list`, puts them side by side, one per line). `hideEmpty` leaves out fields with
no value, `copyable` adds a copy button to each value, and `emptyText` is shown while
`data` is empty (nothing selected yet).

### Writing data in

A table's, chart's, Details' or list view's **Data** takes either a binding
(`{= runnables.records.outputs.records =}`) or the data itself, written as JSON —
handy for a fixed list or to try a layout before the workflow exists:

```json
[
  { "name": "Acme", "status": "active", "amount": 1200 },
  { "name": "Globex", "status": "pending", "amount": 850 }
]
```

Data and every JSON property (columns, row actions, chart series…) have an expand button
that opens them in a full-screen editor; the change is saved when it closes.

### Table columns: links, images, colors and filters

Besides the value formats (number, currency, date, badge…), a column can be:

- `format: link` — the value is a URL, shown as a link that opens in your browser
  (`http`, `https`, `mailto`; anything else stays text). `linkText: Open` shows the same
  text on every row instead of the URL.
- `format: image` — a thumbnail of the value: a web address, a data URL, base64 or a file
  in ~/Tipeline (like the Image component).

`copy: true` adds a copy button to each cell of the column, shown when you hover it. It copies
the raw value — `1234.5`, not `$1,234.50` — and lists or objects as JSON; empty cells have none.

`highlight` colors a cell by its value — the first rule that matches wins:

```yaml
- key: amount
  format: currency
  highlight:
    - { compareAs: number, operator: lt, value: 0, color: red }
    - { compareAs: number, operator: gte, value: 5000, color: green }
- key: status
  highlight:
    - { compareAs: string, operator: eq, value: overdue, ignoreCase: true, color: red }
```

A rule is the same condition a workflow's If uses — `compareAs`, `operator`, `value` and
optional `ignoreCase` (see [Conditions](/workflows/conditions) for every operator) — plus a badge
`color`. A cell that can't be read as `compareAs` (`n/a` in a number column) simply doesn't
match. A progress bar's `colorRules` work the same way, checked against its percentage —
which goes past 100 when the value is over `max` (210 of 200 shows 105% or "210 / 200"
with a full bar), so `{ compareAs: number, operator: gt, value: 100, color: red }` flags it.
A KPI card's `colorRules` color its number and are checked against the raw value, not
what's shown: a `percent` KPI of `1.05` shows 105%, so "over 100%" is
`{ compareAs: number, operator: gt, value: 1, color: red }`. With no match it uses
`color`, if set.

Apps saved before conditions had a type (`{ when: ">", value: 0 }`) are upgraded when they
load: `compareAs` is worked out from the value, and text comparisons keep ignoring case.

`filter` adds a filter above the table for that column: `text` (contains), `select` (one of
the column's own values) or `date` (a day). With server pagination they only filter the
page that's loaded.

`expandable: true` puts a **›** on each row that shows its fields underneath — all of them,
or the ones in `detailFields` (the same shape as a Details component's `fields`, so
`format: badge` and friends work there too). Expanding doesn't click the row.
`examples/apps/table-features.yml` shows all of this, offline.

### Fitting the table's width

`fit` sets what happens when the columns don't fit across the table:

- `truncate` — the columns share the width: short values (amounts, dates, statuses)
  keep all the room they need, the columns with longer text share the rest, and a value
  that still doesn't fit ends in **…** (hover it to read all of it). Rows stay one line
  high. New tables start with this.
- `wrap` — the same column widths, but long values wrap onto more lines instead.
- `scroll` — every column is as wide as its content and the table scrolls sideways.
  Tables without a `fit` (made before it existed) work this way.

Columns are squeezed down to 56px at most; a column can also set `width` (exactly that
many pixels) or `minWidth` (never narrower — past that the table scrolls sideways
instead of squeezing it further):

```yaml
fit: truncate
columns:
  - { key: id, header: "#", width: 70 }
  - { key: customer, minWidth: 180 }
  - { key: notes }
```

### Sorting tables

Click a column's header to sort by it: once for ascending, again for descending, a
third time for the order the data came in. Shift+click adds a second column (the
numbers next to the arrows show the order). The sort uses the raw values, not the
shown text: `number` / `currency` / `percent` columns sort as numbers, `date` /
`datetime` columns by time, and text ignores case and reads numbers inside it
("Item 2" before "Item 10"). Empty cells always go last. The sort stays when the
table's data is reloaded.

`sortBy` (a column `key`) and `sortOrder` (`asc` or `desc`) set the order the table
starts with. `sortable: false` on a column keeps its header plain; on the table it
turns header sorting off (`sortBy` still orders the rows):

```yaml
sortBy: dueDate
sortOrder: desc
columns:
  - { key: id, header: "#", sortable: false }
  - { key: customer }
  - { key: dueDate, format: date }
```

Editable tables and `pagination: server` tables don't sort: rows would move while you
type in them, and only the page on screen would be in order (sort in the workflow that
fetches the page instead).

### Editable tables

A table becomes editable with any `editable` column, `allowAdd` (an **Add row** button)
or `allowDelete` (a delete button on each row). Edits stay in the table until they're
saved: changed cells turn amber, new rows are tinted and deleted rows are struck through
(the same button restores them). While there is something to save, the toolbar shows how
many changes there are, **Discard** and **Save**. Save fires `save`; it waits until every
`required` cell of a new or edited row is filled.

Each editable column picks its editor with `editor`: `text`, `number`, `date`, `checkbox`
or `select` (with `options`, like a select component's). Without one it follows `format`:
`number` for number, currency and percent, `date` for date and datetime, `text` otherwise.
New rows start with each column's `default`.

`TABLE_ID.changes` holds what would be saved, as whole rows: `added` (new rows),
`updated` (edited rows with their new values) and `deleted` (rows as loaded). Send it to
one workflow and refresh the list when it's done:

```yaml
runnables:
  save:
    mode: run
    workflow: saveChanges
    inputs: { changes: "{= recordsGrid.changes =}" }
    onSuccess: [{ type: run, runnable: records }]
components:
  - id: recordsGrid
    type: table
    props:
      data: "{= runnables.records.outputs.records =}"
      rowKey: id
      allowAdd: true
      allowDelete: true
      columns:
        - { key: name, editable: true, required: true }
        - { key: status, editable: true, editor: select, options: [active, closed], default: active }
        - { key: amount, format: currency, editable: true, default: 0 }
    events:
      save: [{ type: run, runnable: save }]
```

New `data` drops the edits, so the refresh after a successful save leaves a clean table,
while a failed save keeps them to fix and retry. `reset` drops them too. Set `rowKey` to
the column that identifies a row (usually `id`): edits then stay with their row however the
data comes back ordered; without it a row is known by its position. With server
pagination the pager waits until the changes are saved or discarded.
`examples/apps/records-grid.yml` is a complete example.

### Checking rows and bulk actions

`multiSelect` puts a checkbox on every row; the header checkbox checks every row the
search shows (or unchecks them). The checked rows are `TABLE_ID.selectedRows`, and
`selectionChange` fires when they change. `bulkActions` adds a toolbar button for each
action (and turns on the checkboxes by itself); a button fires `bulk:<id>` with the
checked rows, and is disabled while nothing is checked, while the table is busy, or while
an editable table has unsaved changes (save or discard them first). Clicking a row still
sets `selectedRow` as before; checking it doesn't.

```yaml
runnables:
  closeChecked:
    mode: run
    workflow: setStatus
    inputs: { records: "{= recordsGrid.selectedRows =}", status: closed }
    onSuccess:
      - { type: reset, component: recordsGrid }   # uncheck
      - { type: run, runnable: records }          # refresh
components:
  - id: recordsGrid
    type: table
    props:
      rowKey: id
      bulkActions:
        - { id: close, label: Close }
        - { id: remove, label: Delete, variant: destructive }
    events:
      "bulk:close": [{ type: run, runnable: closeChecked }]
```

With a `rowKey`, checked rows stay checked when the data is refreshed (with their new
values), and rows that are gone drop out. Without one, new data unchecks everything.
In an editable table, `selectedRows` shows the edited values. `reset` unchecks every row.
`examples/apps/records-grid.yml` has Mark active, Close and Delete bulk actions.

### Table pagination

`pageSize` shows a pager. With the default `pagination: client` the table pages
through all loaded rows (search and sort cover every row). With `pagination: server`
the rows are just the current page: the table exposes `TABLE_ID.page` and
`TABLE_ID.pageSize`, fires `pageChange` when the user moves, and shows
`total` (bind it to the workflow's row count):

```yaml
runnables:
  invoices:
    mode: run
    workflow: listInvoices
    trigger: load
    inputs: { page: "{= invoiceTable.page =}", pageSize: "{= invoiceTable.pageSize =}" }
    outputs: [rows, total]
    persist: false
components:
  - id: invoiceTable
    type: table
    props:
      data: "{= runnables.invoices.outputs.rows =}"
      pageSize: 25
      pagination: server
      total: "{= runnables.invoices.outputs.total =}"
    events:
      pageChange: [{ type: run, runnable: invoices }]
```

### Dialogs

Any page can be shown as a dialog with `openModal` (usually one hidden from the page
menu). The action waits for the dialog: the actions after it run when the dialog is
closed with `closeModal`, and stop if the user dismisses it. That makes "edit in a
dialog, then refresh" one list:

```yaml
events:
  "action:edit":
    - { type: openModal, page: editRecord, params: { id: "{= recordsTable.selectedRow.id =}" } }
    - { type: run, runnable: records }   # only after the dialog's Save → closeModal
```

The dialog page reads `page.params.id` and shares app `state` with the page that opened it.

### History runnables

`mode: history` reads results of a workflow's past runs instead of running it — useful for dashboards over scheduled workflows:

```yaml
recent:
  mode: history
  workflow: nightlyReport
  source: variables          # or actionResults
  filter: { mode: range, count: 7 }   # latest | range | byId | dateRange
  variableName: totals
```

Rows are available as `runnables.recent.data`. Secret variables are never included.

Filter values may be bindings, resolved each time the runnable runs. With
`mode: dateRange`, `dateFrom` / `dateTo` take a date (`2026-10-01`) or an exact time; a
date means the whole day in your timezone, so `dateTo` includes its own day. Leave one
empty for an open range.

### Date range

A `dateRange` component picks a span of days — typically to filter a history runnable.
Its button opens a two-month calendar (pick the first day, then the last) next to quick
presets: Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This year
(`hidePresets` leaves them out). `default` is one of those preset names (`today`,
`yesterday`, `last7Days`, `last30Days`, `thisMonth`, `lastMonth`, `thisYear`, counted from
the day the page opens) or `{ from, to }`. Without `required` the range can be cleared.

`DATE_ID.from` / `DATE_ID.to` are the first and last day (`YYYY-MM-DD`, or null when
cleared), and `DATE_ID.value` is both as `{ from, to }`:

```yaml
runnables:
  notes:
    mode: history
    workflow: logNote
    trigger: load
    source: actionResults
    filter: { mode: dateRange, dateFrom: "{= period.from =}", dateTo: "{= period.to =}" }
components:
  - id: period
    type: dateRange
    props: { label: Period, default: last7Days, placeholder: All time }
    events:
      change: [{ type: run, runnable: notes }]
```

`examples/apps/activity-log.yml` logs notes and lists them for the picked period.

### Charts

A chart draws rows from a binding — one series per numeric key, colored in a fixed order,
so a series keeps its color when others are filtered out. A pie or doughnut uses the first
series and shows at most 8 slices, folding the rest into "Other".

```yaml
- id: salesChart
  type: chart
  name: Sales
  layout: { x: 0, y: 0, w: 6, h: 28 }
  props:
    chartType: bar
    data: "{= runnables.sales.outputs.rows =}"
    xKey: month
    series: [{ key: revenue, label: Revenue }, { key: cost, label: Cost }]
    format: currency
    currency: USD
  events:
    pointClick: [{ type: setState, key: month, value: "{= salesChart.selectedPoint.month =}" }]
```

### More input types

`inputType` (on an Input, or a form field's `type`) also takes `email`, `password`, `phone`,
`currency` (with `currency: USD`), `time`, `datetime`, `slider`, `color`, `code` and
`richtext`. Email and phone are checked as you type; a password is masked. A **slider**
takes `min`, `max`, `step` and `unit`, fires `change` when you let go, and with
`range: true` its value is `[from, to]`. A required slider starts unanswered.
`examples/apps/input-types.yml` and `slider-filters.yml` show them all.

### Searchable selects

A select with `search: local` filters its own options as you type. With `search: remote`,
typing fires `search`: run a workflow with `<id>.search` and bind `options` to what it
returns. `<id>.selectedOptions` keeps the chosen `{ label, value }` pairs even after the
options change.

```yaml
- id: customer
  type: select
  props:
    search: remote
    options: "{= runnables.findRecords.outputs.options =}"
  events:
    search: [{ type: run, runnable: findRecords }]   # its input: "{{ customer.search }}"
```

### Steps and accordions

Tabs with `display: steps` are a wizard: **Back** / **Next** between steps, and **Finish**
(`finishLabel`) on the last one fires `finish`. **Next** won't go on while a required field
in the step is empty. `display: accordion` shows the tabs as sections that open and close.
See `examples/apps/signup-wizard.yml` and `accordion.yml`.

```yaml
- id: wizard
  type: tabs
  props:
    display: steps
    finishLabel: Create account
    tabs: [{ id: account, label: Account }, { id: details, label: Details }, { id: review, label: Review }]
  events:
    finish: [{ type: run, runnable: createAccount }]
```

### Button groups

A `buttonGroup` is a row of buttons — or, with `display: menu`, one button that opens a
menu. Each item fires `action:<itemId>`, and `<id>.clicked` holds the last one.

```yaml
- id: statusButtons
  type: buttonGroup
  props:
    items:
      - { id: activate, label: Activate, icon: CircleCheck }
      - { id: close, label: Close, icon: CircleX, variant: destructive }
  events:
    action:activate: [{ type: run, runnable: activate }]
    action:close: [{ type: run, runnable: close }]
```

### File drop

A `fileDrop` takes files dragged onto it or picked with a click. Its `value` is the list of
paths (one path with `multiple: false`), ready to pass to a workflow; `<id>.files` adds each
file's `name`, `size` and `type`. Limit it with `accept` (`image/*`, `.pdf`), `maxSizeMb`
and `maxFiles`. See `examples/apps/file-intake.yml`.

### Progress

A `progress` bar (or `display: circle`) shows `value` out of `max` (default 100), with
`showValue` and a `color` — or `colorRules` on the percentage, like a KPI's. It can go past
100%. See `examples/apps/progress-showcase.yml`.

### JSON viewer

A `json` component shows any value as a tree you can open and close; `expandDepth` sets how
many levels start open. Handy for a raw record or a workflow's whole output.

### Runs list

A `runs` component lists the latest runs of the app's workflows (or the ones in
`workflows`), live, with their status — and buttons to cancel a run or open it in its own
window (hide them with `hideCancel` / `hideOpen`). Clicking one fires `rowClick` with
`<id>.selectedRun`. Filter with `statuses` and `limit`. See `examples/apps/runs-monitor.yml`.

### Timer

A `timer` fires `tick` every `interval` seconds (default 30) — to refresh data, for
example. Bind `running` to pause it from elsewhere; `repeat: false` ticks once, as a
countdown. It keeps ticking while hidden. See `examples/apps/live-dashboard.yml`.

```yaml
- id: refresh
  type: timer
  props: { label: Auto-refresh, interval: 60 }
  events:
    tick: [{ type: run, runnable: records }]
```

### Chat

A `chat` component sends each message to a runnable, which reads `<id>.message` (the text
just sent) and `<id>.messages` (the conversation), and returns the answer in its `reply`
output — shown as Markdown. `welcome` is the first message; `suggestions` are offered as
buttons while the conversation is empty. `examples/apps/chat.yml` has an echo chat and one
that asks Claude.

```yaml
runnables:
  answer:
    mode: run
    workflow: chatAi
    inputs: { message: "{{ support.message }}", messages: "{= support.messages =}" }
    outputs: [reply]
    persist: false
components:
  - id: support
    type: chat
    props: { title: Support, runnable: answer, welcome: How can I help? }
```

### PDF viewer

A `pdf` component shows a PDF from a web link, a file a workflow wrote (inside
`~/Tipeline`), or base64 data — usually `{{ runnables.invoice.outputs.path }}`. It has
page and zoom controls (`hideToolbar` removes them); `<id>.page` and `<id>.pages` follow
along. See `examples/apps/pdf-viewer.yml`.

### Map

A `map` puts a marker on OpenStreetMap for every row with a latitude and longitude
(`lat`/`latitude`, `lng`/`lon`/`longitude`, or `latKey`/`lngKey`). `colorKey` colors markers
like badges; `popupFields` lists what a marker's popup shows. Clicking one fires
`markerClick` with `<id>.selectedMarker`. See `examples/apps/map.yml`.

### Calendar

A `calendar` shows rows as events by their `start` (and optional `end`), in month, week, day
or list view. Moving to other dates fires `rangeChange` with `<id>.from` and `<id>.to` —
run a workflow then to load just the visible days. `colorKey` colors events (hex values work
too, e.g. each Google calendar's color). See `examples/apps/calendar.yml`.

```yaml
runnables:
  bookings:
    mode: run
    workflow: listBookings
    inputs: { from: "{{ schedule.from }}", to: "{{ schedule.to }}" }
    outputs: [bookings]
components:
  - id: schedule
    type: calendar
    props:
      data: "{= runnables.bookings.outputs.bookings =}"
      colorKey: status
      colors: { confirmed: green, pending: amber, canceled: red }
    events:
      rangeChange: [{ type: run, runnable: bookings }]
```

### Custom components

When no built-in component fits, a **Custom (HTML)** component (`custom`) is your own HTML,
CSS and JavaScript. It gets **Data** as `tipeline.data`, fires its own events with
`tipeline.emit(name, payload)` (**On “name”**) and sets `<id>.value` with
`tipeline.setValue(…)`, in the app's colors. See [Custom Components](./custom).

### Video and audio

A `media` component (**Video / audio** in the builder) plays:

- a **file** a workflow wrote — e.g. `src: "{{ runnables.record.outputs.path }}"`. Same
  rule as images: inside `~/Tipeline`, or anywhere for an app you trust (**Edit → File
  access**). Files are streamed, so long recordings seek instantly, and they're played
  again from the start whenever a run they're bound to finishes;
- a **web link** to a video or audio file (`https://…/clip.mp4`). For YouTube and similar
  sites, use a [Web page](./embed) component with the site's embed address instead;
- a **data URL** (`data:audio/wav;base64,…`).

Video or audio follows the file's type unless `kind` says. `autoplay`, `loop`, `muted`,
`hideControls`, `startAt` (seconds) and `poster` (a picture before a video plays) work as
you'd expect. The player tells the app `<id>.playing`, `<id>.currentTime` (about every
second), `<id>.duration` and `<id>.ended`, and fires **On play**, **On pause** and
**On end**. `examples/apps/media.yml` plays a melody a workflow writes as a WAV file.

### Timeline

A `timeline` shows rows as events in order — a record's history, an order's steps, a
log:

```yaml
- id: history
  type: timeline
  props:
    data: "{= runnables.history.outputs.events =}"
    timeKey: at              # default: time / date / at / timestamp / createdAt
    sort: newest             # or oldest; default: as given
    groupByDay: true         # Today / Yesterday / the date, then clock times
    iconKey: icon            # a Lucide icon name per event, e.g. Truck
    colorKey: status         # colors the dot, like a badge
    fields:
      - { key: by, label: By }
```

Each event shows its time, title and description — found by `timeKey`, `titleKey` and
`descriptionKey`, or by the usual names (title / name / event, description / message /
note). `timeFormat` shows times as `datetime` (default), `date`, `time` or `relative`
("3 hours ago", kept current, with the exact time on hover). Events without a time go
last. **On item click** gives `<id>.selectedItem` (its row).
`examples/apps/order-tracking.yml` shows an order's history both ways.

### Kanban board

A `kanban` component shows rows as cards in columns — one column per value of
`groupKey` (default `status`): to do, doing, done.

```yaml
- id: taskBoard
  type: kanban
  props:
    data: "{= runnables.tasks.outputs.tasks =}"
    groupKey: status
    columns:                       # optional: order, labels, colors, limits
      - { value: todo, label: To do, color: blue }
      - { value: doing, label: Doing, color: amber, limit: 3 }
      - { value: done, label: Done, color: green }
    titleKey: title
    fields:                        # more of each card, like Details fields
      - { key: owner }
      - { key: due, format: date }
    colorKey: priority             # colors the card's edge, like a badge
  events:
    cardMove: [{ type: run, runnable: move }]
```

Without `columns`, the columns are the values the rows have, in the order they first
appear; rows whose value has no column go in an extra **Other** column. A column's
count turns red past its `limit`.

**Moving cards.** Drag a card to another column or place, or use its **⇄ Move to** menu.
The card moves at once and **On card moved** fires, with `<id>.lastMove`:
`{ card, from, to, fromIndex, index }` — e.g. a runnable with inputs
`id: "{= taskBoard.lastMove.card.id =}"` and `status: "{= taskBoard.lastMove.to =}"`.
The card stays where it was dropped until the board's data is read again; then the data
decides. So have the move's runnable read the list again **both** on success and on
error: saved, the card stays; refused, it goes back. `readOnly` turns moving off.

**On card click** gives `<id>.selectedCard` (its row). `examples/apps/task-board.yml` is a
board whose workflow refuses one move on purpose.

### Web pages and HTML

A **Web page / HTML** component (`embed`) shows a website, an HTML file a workflow
wrote, or HTML text a workflow returned, in a sandbox. The page can send data back with
`parent.postMessage(...)`: it arrives as `<id>.message` and fires the embed's
**On message from the page**. See [Embedding Pages & HTML](./embed) for the full guide.

### Run Console

A `runConsole` shows the latest run of one runnable on the page as it happens: each workflow
step with a short result, errors, and how the run ended. Useful next to long-running actions
(imports, syncs) so users can see progress. While a run is going, its header has
**Cancel run**.

### Approvals

A workflow can stop and wait for a person with an
[approval step](/workflows/approvals).

An app runnable whose workflow stops at an approval neither succeeds nor fails: its
`onSuccess`/`onError` and the rest of the action list don't run. Instead its `onPaused`
handler runs, with `result.pipelineIdentifier` set to the waiting run — use it to confirm
the submission and clear the form. Without `onPaused`, the user is told it's waiting for
approval.

```yaml
submit:
  mode: run
  workflow: submitExpense
  inputs: { amount: "{= expenseForm.values.amount =}" }
  onSuccess:
    - { type: toast, message: Approved automatically, variant: success }
    - { type: reset, component: expenseForm }
  onPaused:
    - { type: toast, message: Submitted — waiting for approval }
    - { type: reset, component: expenseForm }
```

Use the approvals component's `decided` event to refresh data after a decision:

```yaml
- id: inbox
  type: approvals
  name: Approvals
  layout: { x: 0, y: 0, w: 6, h: 35 }
  props: { workflows: [payInvoice] }
  events:
    decided: [{ type: run, runnable: invoices }]
```

`approval.request` needs run history, so the runnable must keep `persist: true`.

`examples/apps/expense-approvals.yml` puts it all together: small expenses are approved by
the workflow, larger ones wait in an Approvals inbox next to a chart of amounts per
category.

## Running an app

**Open in window** on the app's page opens it on its own, without the builder or the
Tipeline sidebar — handy for operators who only use the app. Opening it again focuses the
existing window. Switching workspace closes it (see
[Separate windows](/desktop/overview#separate-windows)).

A run belongs to Tipeline, not to the window that started it. Any window showing the same
page — the app's own window, the main one, or the same window after you navigate away and
back — shows a run that's in progress and won't start the same runnable again until it
ends. What happens after the run (`onSuccess`, `onError`, `onPaused`) only happens in the
window that started it; the others just show the result. On a server workspace this
covers the runs you started from this computer.

### Audit

Every run an app starts records which app, page and runnable started it. The workflow's
**Runs** tab shows it under **Started by**, and the Runs page marks app runs. On a remote
workspace, app runs are audited like other runs.

### Remote workspaces

Through a remote workspace, an app can only run, list history from and fetch tables for the
workflows it declares, and never hidden workflows. Viewers can open apps and read history
but can't run them. For who can decide approvals on a server, see
[Who can approve on a server](/workflows/approvals#who-can-approve-on-a-server).

## Validation

Apps are validated when saved, installed or updated from a hub — unknown components or keys, broken references (a runnable using an undeclared workflow alias, an action running a missing runnable, a navigation to a missing page), layouts outside the grid and duplicate IDs are reported with their location, e.g.:

```
App definition validation failed:
pages[0].runnables.approve.workflow: unknown workflow alias "aprove" — declare it under workflows
```

Apps from an older `schemaVersion` are migrated automatically when opened, installed or updated (version 3 switched to 10px rows — an older layout's `y` and `h` are multiplied by 7, so nothing moves; version 4 made color rules use the same conditions as a workflow's If, e.g. `{ compareAs: number, operator: gt, value: 1000 }`).

See `examples/apps/` for complete examples and a companion workflow.
