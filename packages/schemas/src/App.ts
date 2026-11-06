import { z } from 'zod';
import { migrateAppSourceV1, migrateAppSourceV2, migrateAppSourceV3 } from './AppMigration';
import { compareAsSchema, conditionOperatorSchema, refineCondition } from './condition';

const semverRegex = /^\d+\.\d+\.\d+$/;

// -----------------------------------------------------
// New App Schema
// -----------------------------------------------------
export const appMetaSchema = z.object({
  name: z
    .string({
      required_error: 'app.name.required',
      invalid_type_error: 'app.name.invalid',
    })
    .min(1, 'app.name.required'),
  description: z
    .string({
      required_error: 'app.description.required',
      invalid_type_error: 'app.description.invalid',
    })
    .min(1, 'app.description.required'),
  author: z
    .string({
      required_error: 'app.author.required',
      invalid_type_error: 'app.author.invalid',
    })
    .min(1, 'app.author.required')
    .optional(),
  version: z
    .string({
      required_error: 'app.version.required',
      invalid_type_error: 'app.version.invalid',
    })
    .regex(semverRegex, 'app.version.invalid'),
  tags: z
    .array(
      z.string().min(1, 'app.tags.item.required'),
      {
        invalid_type_error: 'app.tags.invalid',
      }
    )
    .optional(),
  platform: z
    .string({
      invalid_type_error: 'app.platform.invalid',
    })
    .min(1, 'app.platform.required')
    .optional(),
  // Relative path under `~/.tipeline` (e.g. "assets/apps/<id>.png"), populated by the
  // image-upload IPC channel once the app already has an identifier — never submitted
  // directly by a form, hence omitted from appMetaCreationSchema below.
  image: z.string().optional(),
});

export const appMetaCreationFieldConfig = {
  description: {
    component: 'textarea' as const,
    inputProps: {
      style: "height: 120px"
    },
  },
};

export const appMetaCreationSchema = appMetaSchema.omit({ version: true, image: true });

// -----------------------------------------------------
// App source — schema version 3
// -----------------------------------------------------
//
// An App is a set of pages. Each page has:
//   - components  — what is drawn on the 12-column grid, in rows of
//                   APP_GRID_ROW_HEIGHT px (`layout.y` / `layout.h` count rows)
//   - runnables   — named calls to a workflow, either running it (`mode: run`) or
//                   reading results of its past runs (`mode: history`)
//   - events      — page-level event handlers (`load`)
//
// Workflows are never referenced by raw identifier inside pages: the app declares
// them once under `workflows` as aliases (alias → identifier) and runnables use the
// alias. Core only runs workflows an app declares, and a future hub install can
// remap aliases to the local identifiers without touching any page.
//
// Values in `props`, runnable `inputs`, a history runnable's `filter`, `setState.value`
// and toast messages may be bindings, evaluated by the desktop at runtime with the same syntax workflows use:
//   {{ expr }}  — LiquidJS, always renders to a string (filters, conditionals…)
//   {= path =}  — raw reference, keeps the value's type; must be the whole value
// Binding roots: `state`, `runnables.<name>`, `page.params`, any component id on
// the page (e.g. `{{ invoiceTable.selectedRow.id }}`), and inside onSuccess /
// onPaused / onError handlers `result` / `error`.

export const APP_SCHEMA_VERSION = 4;

/** Height of one grid row in px. v2 rows were 70px; v3 rows are 10px so components
 * (containers especially) can be sized to fit their content. */
export const APP_GRID_ROW_HEIGHT = 10;

/** Names usable as binding roots: component ids, runnable names, workflow aliases, state keys. */
export const bindingNameSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'must start with a letter and contain only letters, digits and _');

/** Binding roots reserved by the runtime — a component id can't shadow them. */
export const RESERVED_BINDING_NAMES = ['state', 'runnables', 'page', 'result', 'error'] as const;

/** A literal of the given type, or a binding string resolved at runtime. */
const bindable = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.string()]);

// ---------------- Actions (event handlers) ----------------

/** The states a workflow run can be in (a Runs component's `statuses`). */
export const APP_RUN_STATUSES = ['pending', 'running', 'paused', 'completed', 'failed', 'canceled'] as const;

/** What `openFile` does with the file. */
export const APP_OPEN_FILE_MODES = ['open', 'reveal', 'save'] as const;

/** A calendar component's views. */
export const APP_CALENDAR_VIEWS = ['month', 'week', 'day', 'list'] as const;

/** How `openModal` shows a page. */
export const APP_MODAL_DISPLAYS = ['dialog', 'drawer'] as const;
export const APP_MODAL_SIZES = ['sm', 'md', 'lg', 'xl'] as const;

export const appActionSchema = z.discriminatedUnion('type', [
  // refresh: run the workflow even when its outputs are cached (a refresh button).
  z.object({ type: z.literal('run'), runnable: bindingNameSchema, refresh: z.boolean().optional() }).strict(),
  z
    .object({
      type: z.literal('navigate'),
      page: z.string().min(1),
      params: z.record(z.unknown()).optional(),
    })
    .strict(),
  z.object({ type: z.literal('setState'), key: bindingNameSchema, value: z.unknown() }).strict(),
  z
    .object({
      type: z.literal('toast'),
      message: z.string().min(1),
      variant: z.enum(['default', 'success', 'error']).default('default'),
    })
    .strict(),
  // Shows a page as a dialog — or as a drawer sliding in from the side. The action
  // finishes when it closes: the rest of the list runs if it was closed with
  // `closeModal`, and stops if it was dismissed.
  z
    .object({
      type: z.literal('openModal'),
      page: z.string().min(1),
      params: z.record(z.unknown()).optional(),
      /** dialog (default): centered. drawer: a full-height panel at the side. */
      display: z.enum(APP_MODAL_DISPLAYS).optional(),
      /** Drawers: which side it slides in from (default right). */
      side: z.enum(['right', 'left']).optional(),
      /** Width (default md). */
      size: z.enum(APP_MODAL_SIZES).optional(),
    })
    .strict(),
  // Closes the dialog this page is shown in (no-op on a page that isn't in a dialog).
  z.object({ type: z.literal('closeModal') }).strict(),
  // Puts an input or form back to its default value(s).
  z.object({ type: z.literal('reset'), component: bindingNameSchema }).strict(),
  // Opens a web or mail link (http, https, mailto) in the browser / mail app.
  z.object({ type: z.literal('openUrl'), url: z.string().min(1) }).strict(),
  // A file a workflow wrote (a path; may be a binding). open: with its default app —
  // only files inside ~/Tipeline, never programs. reveal: shows it in its folder.
  // save: "Save as…" — the user picks where a copy goes (a download).
  z
    .object({
      type: z.literal('openFile'),
      path: z.string().min(1),
      mode: z.enum(APP_OPEN_FILE_MODES).default('open'),
    })
    .strict(),
]);
export type AppAction = z.infer<typeof appActionSchema>;

const actionListSchema = z.array(appActionSchema).default([]);

// ---------------- Runnables ----------------

const runnableBase = {
  workflow: bindingNameSchema,
  trigger: z.enum(['load', 'manual']).default('manual'),
  onSuccess: actionListSchema,
  onError: actionListSchema,
};

export const appRunRunnableSchema = z
  .object({
    mode: z.literal('run'),
    ...runnableBase,
    /** Workflow variable name → value or binding. Only non-private variables can be set. */
    inputs: z.record(z.unknown()).default({}),
    /** Workflow variables whose final values are returned (secret ones never are). */
    outputs: z.array(z.string().min(1)).default([]),
    /** false = run without writing pipeline history (use for read-only lookups). */
    persist: z.boolean().default(true),
    /** Confirmation prompt shown before running; may contain bindings. */
    confirm: z.string().min(1).optional(),
    /**
     * Runs instead of onSuccess when the workflow stopped at an approval step (it
     * continues once someone decides). `result.pipelineIdentifier` is the waiting run.
     */
    onPaused: actionListSchema,
  })
  .strict();

export const appHistoryRunnableSchema = z
  .object({
    mode: z.literal('history'),
    ...runnableBase,
    trigger: z.enum(['load', 'manual']).default('load'),
    source: z.enum(['actionResults', 'variables']).default('actionResults'),
    filter: z
      .object({
        mode: z.enum(['latest', 'range', 'byId', 'dateRange']).default('latest'),
        count: bindable(z.number().int().positive()).optional(),
        pipelineIdentifier: z.string().optional(),
        /**
         * A date ("2026-10-01", the whole day in the user's timezone), an ISO instant,
         * or a binding — e.g. `{= period.from =}` from a date range component.
         */
        dateFrom: z.string().optional(),
        /** Like dateFrom; a date includes that whole day. */
        dateTo: z.string().optional(),
      })
      .strict()
      .default({}),
    /** actionResults only: limit to one action of the workflow. */
    actionIdentifier: z.string().optional(),
    /** variables only: limit to one variable. */
    variableName: z.string().optional(),
  })
  .strict();

export const appRunnableSchema = z.discriminatedUnion('mode', [
  appRunRunnableSchema,
  appHistoryRunnableSchema,
]);
export type AppRunnable = z.infer<typeof appRunnableSchema>;

// ---------------- Components ----------------

export const appLayoutSchema = z
  .object({
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1),
  })
  .strict()
  .refine((l) => l.x + l.w <= 12, 'x + w must not exceed the 12 grid columns');

/** How a table column or details field shows its value (`badge`: a colored status pill). */
export const APP_VALUE_FORMATS = ['text', 'number', 'currency', 'percent', 'date', 'datetime', 'badge', 'color'] as const;

/** Table columns can also show a link or an image thumbnail. */
export const APP_COLUMN_FORMATS = [...APP_VALUE_FORMATS, 'link', 'image', 'avatar'] as const;

/**
 * Colors a cell when its value matches (the first rule that matches wins), e.g.
 * `{ compareAs: number, operator: gt, value: 1000, color: green }`. The same
 * conditions as a workflow's If (see @tipeline/utils conditions); a cell that
 * can't be read as `compareAs` simply doesn't match.
 */
export const appHighlightRuleSchema = refineCondition(
  z
    .object({
      compareAs: compareAsSchema,
      operator: conditionOperatorSchema,
      /** What to compare with (not used by empty / notEmpty / isTrue …). */
      value: z.unknown().optional(),
      ignoreCase: z.boolean().optional(),
      color: z.lazy(() => z.enum(APP_BADGE_COLORS)),
    })
    .strict(),
  'value'
);

/** Colors a status badge can have. */
export const APP_BADGE_COLORS = ['gray', 'blue', 'green', 'amber', 'red', 'purple'] as const;

/**
 * Which color each value's badge gets, e.g. { active: green, closed: gray }. Values not
 * listed get a color of their own (common status words the expected one).
 */
export const appBadgeColorsSchema = z.record(z.enum(APP_BADGE_COLORS));

/** A badge color name or a hex color ("#039be5") — calendar events. */
export const appEventColorSchema = z.union([
  z.enum(APP_BADGE_COLORS),
  z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'a badge color or a hex color like #039be5'),
]);

/** One field of a details (key-value) component. */
export const appDetailFieldSchema = z
  .object({
    /** Key of the shown object; `a.b` reaches into nested objects. */
    key: z.string().min(1),
    /** Shown instead of the key. */
    label: z.string().optional(),
    format: z.enum(APP_VALUE_FORMATS).optional(),
    currency: z.string().length(3).optional(),
    /** `format: badge` — each value's color. */
    colors: appBadgeColorsSchema.optional(),
  })
  .strict();

/** How an editable table cell is edited. */
export const APP_TABLE_EDITORS = ['text', 'number', 'date', 'checkbox', 'select'] as const;

export const appTableColumnSchema = z
  .object({
    key: z.string().min(1),
    header: z.string().optional(),
    sortable: z.boolean().optional(),
    format: z.enum(APP_COLUMN_FORMATS).optional(),
    /** `format: link` — the same text for every link (e.g. "Open"); else the URL. */
    linkText: z.string().optional(),
    /** `format: avatar` — the row's key holding the person's picture (else their initials show). */
    srcKey: z.string().optional(),
    /** A filter above the table for this column: text (contains), select (one of its values), date. */
    filter: z.enum(['text', 'select', 'date']).optional(),
    /** A button on each cell (shown on hover) that copies its raw value; objects as JSON. */
    copy: z.boolean().optional(),
    /** Colors a cell by its value, e.g. [{ compareAs: number, operator: gt, value: 1000, color: green }]. */
    highlight: z.array(appHighlightRuleSchema).optional(),
    currency: z.string().length(3).optional(),
    /** `format: badge` — each value's color. */
    colors: appBadgeColorsSchema.optional(),
    /** Cells of this column can be changed in place (see the table's `changes`). */
    editable: z.boolean().optional(),
    /** How a cell is edited. Defaults from `format`: number for number/currency/percent, date for date/datetime, else text. */
    editor: z.enum(APP_TABLE_EDITORS).optional(),
    /** Choices of a `select` editor: strings, { label, value }, or a binding to such an array. */
    options: z.lazy(() => appOptionsSchema).optional(),
    /** An edited or added row can't be saved while this cell is empty. */
    required: z.boolean().optional(),
    /** Value of this cell in a row added with "Add row" (may be a binding). */
    default: z.unknown().optional(),
    /** Exactly this many pixels wide. */
    width: z.number().int().positive().optional(),
    /** Never narrower than this many pixels — past it the table scrolls sideways. */
    minWidth: z.number().int().positive().optional(),
  })
  .strict();

/**
 * How a table's columns fit its width. scroll (default): as wide as their content,
 * scrolling sideways. wrap: they share the width and long values wrap. truncate:
 * they share it by how much they hold, long values end in "…" (full text on hover).
 */
export const APP_TABLE_FITS = ['scroll', 'wrap', 'truncate'] as const;

export const appRowActionSchema = z
  .object({
    id: bindingNameSchema,
    label: z.string().min(1),
    variant: z.enum(['default', 'outline', 'ghost', 'destructive', 'secondary', 'link']).optional(),
  })
  .strict();

/** One button of a button group (or one entry of its menu); fires `action:<id>`. */
export const appButtonItemSchema = z
  .object({
    id: bindingNameSchema,
    label: z.string().min(1),
    /** A Lucide icon name, e.g. Download. */
    icon: z.string().optional(),
    variant: z.enum(['default', 'outline', 'ghost', 'destructive', 'secondary', 'link']).optional(),
    /** Greyed out when this resolves to true / "true". */
    disabled: bindable(z.boolean()).optional(),
  })
  .strict();

/** Options of a select: strings, { label, value } objects, or a binding to such an array. */
export const appOptionsSchema = bindable(
  z.array(z.union([z.string(), z.object({ label: z.string(), value: z.unknown() }).strict()]))
);

export const APP_FORM_FIELD_TYPES = [
  'text',
  'number',
  'textarea',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'file',
  'email',
  'password',
  'phone',
  'currency',
  'time',
  'datetime',
  'code',
  'richtext',
  'slider',
  'color',
] as const;

/** A code input's languages (highlighting; json is also checked). text: none. */
export const APP_CODE_LANGUAGES = ['json', 'javascript', 'sql', 'python', 'yaml', 'html', 'css', 'markdown', 'text'] as const;

/**
 * An Input component's types. email / phone are checked loosely; password is hidden
 * (mark the workflow variable it fills `secret`, or a run that keeps history stores
 * it); currency is a number shown with the `currency` symbol; time is "HH:MM";
 * datetime is "YYYY-MM-DDTHH:MM" (local time); code is text in a code editor
 * highlighted for `language` (json must parse); richtext is formatted text from a
 * toolbar editor, kept as HTML or Markdown (`format`); slider is a number picked by
 * dragging (or [from, to] with `range`, see appSliderSettings); color is hex text
 * ("#rrggbb") picked from a palette (see appColorSettings).
 */
export const APP_INPUT_TYPES = [
  'text',
  'number',
  'textarea',
  'date',
  'file',
  'email',
  'password',
  'phone',
  'currency',
  'time',
  'datetime',
  'code',
  'richtext',
  'slider',
  'color',
] as const;

/**
 * Settings of a color (Input / form field type `color`). Its value is lower-case hex,
 * "#rrggbb" — with `alpha` an opacity strip too, and "#rrggbbaa" when see-through.
 * `swatches`: colors offered with one click (hex or rgb() text).
 */
const appColorSettings = {
  alpha: z.boolean().optional(),
  swatches: bindable(z.array(z.string())).optional(),
};

/**
 * Settings of a slider (Input / form field type `slider`). Its value is a number
 * between min and max on the step — or, with `range`, two: [from, to]. Without a
 * default it starts at min (a range: min..max). `unit` follows the shown number
 * (`currency` shows it as money instead).
 */
const appSliderSettings = {
  min: bindable(z.number()).optional(),
  max: bindable(z.number()).optional(),
  step: bindable(z.number().positive()).optional(),
  range: z.boolean().optional(),
  unit: z.string().optional(),
};

/**
 * How a select shows its options. dropdown (single only, the default): a menu. list:
 * radio buttons — tick boxes when several can be picked (the multiple default).
 * buttons: a row of buttons, one (or several) pressed.
 */
export const APP_SELECT_DISPLAYS = ['dropdown', 'list', 'buttons'] as const;

/** One field of a form. Its value is `<formId>.values.<name>`. */
export const appFormFieldSchema = z
  .object({
    name: bindingNameSchema,
    label: z.string().optional(),
    type: z.enum(APP_FORM_FIELD_TYPES).default('text'),
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    options: appOptionsSchema.optional(),
    default: z.unknown().optional(),
    /** type currency: the ISO code of its symbol (default USD). */
    currency: z.string().length(3).optional(),
    /** type code: its language (default text). */
    language: z.enum(APP_CODE_LANGUAGES).optional(),
    /** type richtext: the value as html (default) or markdown. */
    format: z.enum(['html', 'markdown']).optional(),
    ...appSliderSettings,
    /** type color: see appColorSettings. */
    ...appColorSettings,
    /**
     * How the field is drawn. checkbox: switch (default) or checkbox (a tick box).
     * select / multiselect: see APP_SELECT_DISPLAYS.
     */
    display: z.enum(['switch', 'checkbox', 'dropdown', 'list', 'buttons']).optional(),
  })
  .strict();
export type AppFormField = z.infer<typeof appFormFieldSchema>;

/** One tab of a `tabs` component. Children name it in `parent.tab`; the tabs' `activeTab` is its id. */
export const appTabSchema = z
  .object({
    id: bindingNameSchema,
    label: z.string().min(1),
  })
  .strict();
export type AppTab = z.infer<typeof appTabSchema>;

/**
 * Where a component sits. Omitted: on the page's grid. Otherwise inside the grid of
 * the container (or one tab of the tabs component) with that id; its `layout` is then
 * relative to that grid, which has 12 columns like the page.
 */
export const appComponentParentSchema = z
  .object({
    id: bindingNameSchema,
    /** Required when the parent is a `tabs` component; never set for a `container`. */
    tab: bindingNameSchema.optional(),
  })
  .strict();
export type AppComponentParent = z.infer<typeof appComponentParentSchema>;

/** Props per component type. Every value may also be a binding string. */
export const appComponentPropsSchemas = {
  text: z
    .object({
      content: z.string().default(''),
      fontSize: bindable(z.number().positive()).optional(),
      fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
      color: z.string().optional(),
      /**
       * Render `content` as Markdown (headings, emphasis, lists, links, tables…).
       * Raw HTML is shown as text, links open in the browser.
       */
      markdown: z.boolean().optional(),
    })
    .strict(),
  button: z
    .object({
      label: z.string().default('Button'),
      variant: z.enum(['default', 'outline', 'ghost', 'destructive', 'secondary', 'link']).optional(),
      disabled: bindable(z.boolean()).optional(),
      /** A Lucide icon name before the label, e.g. Download, ExternalLink. */
      icon: z.string().optional(),
    })
    .strict(),
  calendar: z
    .object({
      title: z.string().optional(),
      /** Rows with a start (a date, or a date and time) — one event each; usually a binding. */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /** Where the title, start and end are (defaults: title / name, start / date, end). */
      titleKey: z.string().optional(),
      startKey: z.string().optional(),
      endKey: z.string().optional(),
      /**
       * A key whose value colors the event, as a badge's (active → green…). A hex value
       * ("#039be5", e.g. each Google calendar's color) is used as is; `colors` and
       * `defaultColor` take hex colors too.
       */
      colorKey: z.string().optional(),
      colors: z.record(appEventColorSchema).optional(),
      defaultColor: appEventColorSchema.optional(),
      /** The view it opens in (default month), and the views offered (default all). */
      view: z.enum(APP_CALENDAR_VIEWS).optional(),
      views: z.array(z.enum(APP_CALENDAR_VIEWS)).optional(),
      /** The date it opens at, "YYYY-MM-DD" (default today); may be a binding. */
      initialDate: z.string().optional(),
      /** 1: weeks start on Monday (default: the language's custom). */
      firstDay: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .strict(),
  map: z
    .object({
      title: z.string().optional(),
      /** Rows with a latitude and longitude (usually a binding); one marker each. */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /** Where the coordinates are (default: lat / latitude, lng / lon / longitude). */
      latKey: z.string().optional(),
      lngKey: z.string().optional(),
      /** The marker's name (default: name / title / label). */
      labelKey: z.string().optional(),
      /** A key whose value colors the marker, as a badge's (active → green…). */
      colorKey: z.string().optional(),
      colors: z.record(z.enum(APP_BADGE_COLORS)).optional(),
      defaultColor: z.enum(APP_BADGE_COLORS).optional(),
      /** Keys listed in a marker's popup. */
      popupFields: z.array(z.string().min(1)).optional(),
      /** Where to look, [lat, lng] (default: all markers in view), and how close (1–19). */
      center: bindable(z.tuple([z.number(), z.number()])).optional(),
      zoom: bindable(z.number().int().min(1).max(19)).optional(),
      /** Another tile server: a {z}/{x}/{y} URL template (default OpenStreetMap), and its credit. */
      tiles: z.string().regex(/^https?:\/\//, 'tiles must be an http(s) URL template').optional(),
      attribution: z.string().optional(),
    })
    .strict(),
  custom: z
    .object({
      title: z.string().optional(),
      /**
       * The component's own HTML, with its <style> and <script> — kept exactly as
       * written (never read for bindings: `{{ }}` in it is the code's own). It runs in a
       * sandbox and talks to the app through `tipeline`: `tipeline.data` /
       * `tipeline.onData(fn)` (the `data` prop, live), `tipeline.emit(name, payload)` (fires
       * `event:<name>` — name it in `eventNames`) and `tipeline.setValue(v)` (`<id>.value`).
       */
      code: z.string().default(''),
      /** What the code gets as `tipeline.data` — any value, usually a binding. */
      data: z.unknown().optional(),
      /** The events the code may fire; each is `event:<name>` ("On <name>" in the builder). */
      eventNames: z.array(bindingNameSchema).optional(),
    })
    .strict(),
  media: z
    .object({
      title: z.string().optional(),
      /**
       * What plays: a web link (http / https), a data URL (data:audio/… or data:video/…),
       * or the path of a file a workflow wrote (same rules as an Image's file). Usually
       * a binding such as `{{ runnables.record.outputs.path }}`.
       */
      src: z.string().optional(),
      /** video or audio (default: by the file's type). */
      kind: z.enum(['video', 'audio']).optional(),
      /** A video's picture before it plays: a web link or a data URL. */
      poster: z.string().optional(),
      autoplay: z.boolean().optional(),
      loop: z.boolean().optional(),
      muted: z.boolean().optional(),
      /** No play / volume / seek bar (e.g. a looping background video). */
      hideControls: z.boolean().optional(),
      /** Where it starts, in seconds. */
      startAt: bindable(z.number().min(0)).optional(),
      emptyText: z.string().optional(),
    })
    .strict(),
  timeline: z
    .object({
      title: z.string().optional(),
      /** The events: rows (usually a binding). */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /**
       * Where an event's time, title and description are (default: time / date / at /
       * timestamp / createdAt, title / name / event / label, description / detail /
       * message / note).
       */
      timeKey: z.string().optional(),
      titleKey: z.string().optional(),
      descriptionKey: z.string().optional(),
      /** More of each event, as a details field's (key, label, format…). */
      fields: z.array(appDetailFieldSchema).optional(),
      /** A key whose value colors the event's dot, as a badge's. */
      colorKey: z.string().optional(),
      colors: appBadgeColorsSchema.optional(),
      /** A key holding a Lucide icon name, shown instead of the dot. */
      iconKey: z.string().optional(),
      /** newest / oldest first (default: in the order given). */
      sort: z.enum(['newest', 'oldest', 'none']).optional(),
      /** Day headers (Today, Yesterday, the date); times then show as clock times. */
      groupByDay: z.boolean().optional(),
      /** How times show (default datetime; time with groupByDay). relative: "3 hours ago". */
      timeFormat: z.enum(['relative', 'datetime', 'date', 'time']).optional(),
      emptyText: z.string().optional(),
    })
    .strict(),
  kanban: z
    .object({
      title: z.string().optional(),
      /** The cards: rows (usually a binding). */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /** The key whose value puts a card in a column (default status). */
      groupKey: z.string().optional(),
      /**
       * The columns, in order: values, or { value, label, color, limit } (a count past
       * `limit` turns red). Default: the values the rows have, first seen first.
       */
      columns: bindable(
        z.array(
          z.union([
            z.string(),
            z.number(),
            z
              .object({
                value: z.union([z.string(), z.number(), z.boolean()]),
                label: z.string().optional(),
                color: z.enum(APP_BADGE_COLORS).optional(),
                limit: z.number().int().positive().optional(),
              })
              .strict(),
          ])
        )
      ).optional(),
      /** A card's heading (default: name / title / label). */
      titleKey: z.string().optional(),
      /** More of each card, as a details field's (key, label, format…). */
      fields: z.array(appDetailFieldSchema).optional(),
      /** A key whose value colors the card's edge, as a badge's. */
      colorKey: z.string().optional(),
      colors: appBadgeColorsSchema.optional(),
      /** What tells cards apart (default id). */
      rowKey: z.string().optional(),
      /** Cards can't be moved. */
      readOnly: z.boolean().optional(),
      /** Shown in an empty column. */
      emptyText: z.string().optional(),
    })
    .strict(),
  embed: z
    .object({
      title: z.string().optional(),
      /**
       * A web page (http / https), or the path of an HTML file a workflow wrote (same
       * rules as an Image: inside ~/Tipeline unless the app is trusted). Usually a binding.
       */
      src: z.string().optional(),
      /** HTML to show instead (e.g. a workflow's report); wins over src. */
      html: z.string().optional(),
      /** The page's scripts don't run (by default they do, fenced in a sandbox). */
      blockScripts: z.boolean().optional(),
      /** No bar with the title, Reload and Open in browser. */
      hideToolbar: z.boolean().optional(),
      /** Shown while there's nothing to show yet. */
      emptyText: z.string().optional(),
    })
    .strict(),
  chat: z
    .object({
      title: z.string().optional(),
      /**
       * The page's runnable (mode run) that answers each message. It can read
       * `<id>.message` (the text just sent) and `<id>.messages` (the conversation,
       * { role: user | assistant | error, text, at } each).
       */
      runnable: bindingNameSchema.optional(),
      /** The runnable's output holding the answer (default `reply`); shown as Markdown. */
      reply: z.string().optional(),
      /** The assistant's first message (may be a binding). */
      welcome: z.string().optional(),
      placeholder: z.string().optional(),
      /** Messages offered as buttons while the conversation is empty. */
      suggestions: z.array(z.string().min(1)).optional(),
    })
    .strict(),
  buttonGroup: z
    .object({
      /** The buttons (or menu entries), in order; each fires `action:<id>`. */
      items: z.array(appButtonItemSchema).min(1, 'a button group needs at least one button').default([
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second', variant: 'outline' },
      ]),
      /** row (default): the buttons side by side. menu: one button opening them as a list. */
      display: z.enum(['row', 'menu']).optional(),
      /** menu: the button's text (default "Actions") and icon. */
      label: z.string().optional(),
      icon: z.string().optional(),
      /** menu: the button's style. */
      variant: z.enum(['default', 'outline', 'ghost', 'destructive', 'secondary', 'link']).optional(),
    })
    .strict(),
  progress: z
    .object({
      label: z.string().optional(),
      /** How far along: a number (or numeric text), usually a binding. */
      value: bindable(z.union([z.number(), z.null()])).optional(),
      /** What counts as done (default 100). */
      max: bindable(z.number().positive()).optional(),
      /** bar (default) or circle (a ring with the number in the middle). */
      display: z.enum(['bar', 'circle']).optional(),
      /** percent (default): "74%"; value: "37 / 50"; none. */
      showValue: z.enum(['percent', 'value', 'none']).optional(),
      /** Fill color (default: the theme's primary). */
      color: z.enum(APP_BADGE_COLORS).optional(),
      /** As a table column's highlight, checked against the percentage (past 100 over max): the first match colors it. */
      colorRules: z.array(appHighlightRuleSchema).optional(),
      description: z.string().optional(),
    })
    .strict(),
  kpi: z
    .object({
      label: z.string().default(''),
      value: bindable(z.union([z.number(), z.null()])).optional(),
      format: z.enum(['text', 'number', 'currency', 'percent']).optional(),
      currency: z.string().length(3).optional(),
      trend: bindable(z.union([z.number(), z.null()])).optional(),
      trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
      /** A small trend line under the value: numbers, or rows with `sparkKey`. */
      spark: bindable(z.array(z.unknown())).optional(),
      sparkKey: z.string().optional(),
      /** The link line under the value, shown when `click` has actions ("View details →" when empty). */
      linkText: z.string().optional(),
      /** The value's color (default: the text color). */
      color: z.enum(APP_BADGE_COLORS).optional(),
      /** As a table column's highlight, checked against the raw value (0.5, not 50%): the first match colors it. */
      colorRules: z.array(appHighlightRuleSchema).optional(),
    })
    .strict(),
  table: z
    .object({
      /** Rows: an array literal, or a binding such as `{= runnables.invoices.data =}`. */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /** Omit to show every key of the first row. */
      columns: z.array(appTableColumnSchema).optional(),
      /** How the columns fit the width (see APP_TABLE_FITS). */
      fit: z.enum(APP_TABLE_FITS).optional(),
      /** One button per row; each fires its own `action:<id>` event with the row selected. */
      rowActions: z.array(appRowActionSchema).optional(),
      /**
       * A checkbox on every row (and one in the header for every row the search
       * shows); the checked rows are `selectedRows`. On by itself with bulkActions.
       */
      multiSelect: z.boolean().optional(),
      /** Buttons for the checked rows; each fires its own `bulk:<id>` event with `selectedRows`. */
      bulkActions: z.array(appRowActionSchema).optional(),
      /** Search box filtering the visible rows. */
      searchable: z.boolean().optional(),
      /** "Export CSV" button for the visible rows. */
      exportable: z.boolean().optional(),
      /** false: headers don't sort on a click (on unless false; columns can opt out too). */
      sortable: z.boolean().optional(),
      /** The column (`key`) the rows start sorted by. */
      sortBy: z.string().optional(),
      /** sortBy's direction (default asc). */
      sortOrder: z.enum(['asc', 'desc']).optional(),
      /** Rows per page; shows a pager. Omit for one scrolling list. */
      pageSize: z.number().int().positive().optional(),
      /**
       * client (default): every row is loaded and the table pages through them.
       * server: `data` is just the current page — the table exposes `page` / `pageSize`
       * and fires `pageChange`, so a runnable can fetch that page; `total` is the
       * row count across all pages.
       */
      pagination: z.enum(['client', 'server']).optional(),
      total: bindable(z.union([z.number(), z.null()])).optional(),
      /**
       * Column that identifies a row (e.g. "id"). Edits follow the row through
       * sorting and searching either way; without it a row is known by its position
       * in `data`.
       */
      rowKey: z.string().optional(),
      /**
       * A chevron on each row that shows its fields underneath (all of them, or
       * `detailFields`) — for what doesn't fit in the columns.
       */
      expandable: z.boolean().optional(),
      /** What an expanded row shows, like a Details component's fields. */
      detailFields: z.array(appDetailFieldSchema).optional(),
      /** "Add row" button; new rows start with each column's `default`. */
      allowAdd: z.boolean().optional(),
      /** A delete button on every row (undone with Discard, or per row). */
      allowDelete: z.boolean().optional(),
      /** Label of the button that fires `save` while there are unsaved changes. */
      saveLabel: z.string().optional(),
    })
    .strict(),
  input: z
    .object({
      inputType: z.enum(APP_INPUT_TYPES).default('text'),
      /** inputType currency: the ISO code of its symbol (default USD). */
      currency: z.string().length(3).optional(),
      /** inputType code: its language (default text). */
      language: z.enum(APP_CODE_LANGUAGES).optional(),
      /** inputType richtext: the value as html (default) or markdown. */
      format: z.enum(['html', 'markdown']).optional(),
      /** inputType slider: see appSliderSettings. */
      ...appSliderSettings,
      /** inputType color: see appColorSettings. */
      ...appColorSettings,
      label: z.string().optional(),
      placeholder: z.string().optional(),
      description: z.string().optional(),
      required: z.boolean().optional(),
      /** Initial value (may be a binding — resolved when the page opens or on reset). */
      default: z.unknown().optional(),
      /**
       * inputType code: a Code | Preview switch (and a preview beside the full-screen
       * editor) showing `previewHtml`. Opening it fires `preview`, so a runnable can make
       * that HTML from the text, e.g. a workflow rendering a template.
       */
      preview: z.boolean().optional(),
      previewHtml: z.string().optional(),
      /** inputType code: names the { } button inserts at the cursor, as {{ name }}. */
      variables: bindable(z.array(z.string())).optional(),
    })
    .strict(),
  select: z
    .object({
      label: z.string().optional(),
      placeholder: z.string().optional(),
      description: z.string().optional(),
      required: z.boolean().optional(),
      /** Choices: strings or { label, value }, or a binding to an array of them. */
      options: appOptionsSchema.optional(),
      multiple: z.boolean().optional(),
      default: z.unknown().optional(),
      /** dropdown (default), list (radio buttons / tick boxes) or buttons (see APP_SELECT_DISPLAYS). */
      display: z.enum(APP_SELECT_DISPLAYS).optional(),
      /**
       * A search box in the dropdown (single or multiple; not with list / buttons).
       * local: typing filters the options. remote: typing fires `search` (after a
       * short pause; the text is `<id>.search`) and the options are shown as given —
       * bind them to what a workflow run from that event returns.
       */
      search: z.enum(['off', 'local', 'remote']).optional(),
    })
    .strict(),
  dateRange: z
    .object({
      label: z.string().optional(),
      placeholder: z.string().optional(),
      description: z.string().optional(),
      /** No "clear" button: a range is always picked (set a `default`). */
      required: z.boolean().optional(),
      /**
       * Initial range: a preset name (today, yesterday, last7Days, last30Days,
       * thisMonth, lastMonth, thisYear), { from, to } days ("YYYY-MM-DD"), or a
       * binding to either. Resolved when the page opens and on reset.
       */
      default: z.unknown().optional(),
      /** Leaves out the quick presets next to the calendar. */
      hidePresets: z.boolean().optional(),
    })
    .strict(),
  checkbox: z
    .object({
      label: z.string().optional(),
      description: z.string().optional(),
      default: z.unknown().optional(),
      /** Drawn as a switch (default) or a tick box — same true/false value either way. */
      display: z.enum(['switch', 'checkbox']).optional(),
    })
    .strict(),
  form: z
    .object({
      title: z.string().optional(),
      /**
       * The fields, written out — or one binding to a list of them (e.g. a workflow's
       * output), checked when the page runs: entries that aren't valid fields are left out.
       */
      fields: bindable(z.array(appFormFieldSchema)).default([]),
      submitLabel: z.string().optional(),
      /** Shows a Reset button when set. */
      resetLabel: z.string().optional(),
    })
    .strict(),
  chart: z
    .object({
      /**
       * hbar: bars sideways. scatter: xKey and each series are numbers. funnel: one bar
       * per stage (row), centered, with its share of the first. heatmap: a grid of
       * cells, xKey × yKey, shaded by the first series (rows sharing a cell add up).
       */
      chartType: z.enum(['bar', 'hbar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'funnel', 'heatmap']).default('bar'),
      title: z.string().optional(),
      /** Rows: an array literal or a binding such as `{= runnables.sales.outputs.rows =}`. */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /** Row key for the category axis (or the slice names of a pie). */
      xKey: z.string().optional(),
      /** heatmap: the row key for its rows (xKey gives its columns). */
      yKey: z.string().optional(),
      /** scatter: a row key naming each point in its tooltip. */
      labelKey: z.string().optional(),
      /** One series per numeric row key; a pie uses the first. Colors follow this order. */
      series: z.array(z.object({ key: z.string().min(1), label: z.string().optional() }).strict()).optional(),
      stacked: z.boolean().optional(),
      format: z.enum(['number', 'currency', 'percent']).optional(),
      currency: z.string().length(3).optional(),
    })
    .strict(),
  runConsole: z
    .object({
      /** The runnable (on this page) whose latest run is shown. */
      runnable: bindingNameSchema,
      title: z.string().optional(),
    })
    .strict(),
  approvals: z
    .object({
      title: z.string().optional(),
      /** Workflow aliases whose pending approvals are listed; all of the app's when empty. */
      workflows: z.array(bindingNameSchema).optional(),
    })
    .strict(),
  runs: z
    .object({
      title: z.string().optional(),
      /** Workflow aliases whose runs are listed; all of the app's when empty. */
      workflows: z.array(bindingNameSchema).optional(),
      /** Only runs in these states (all when empty). */
      statuses: z.array(z.enum(APP_RUN_STATUSES)).optional(),
      /** How many of the newest runs (default 20, at most 200). */
      limit: z.number().int().min(1).max(200).optional(),
      /** Shown when there are no runs yet. */
      emptyText: z.string().optional(),
      /** No cancel button on running / waiting runs. */
      hideCancel: z.boolean().optional(),
      /** No button opening a run in its own window. */
      hideOpen: z.boolean().optional(),
    })
    .strict(),
  alert: z
    .object({
      title: z.string().optional(),
      message: z.string().default(''),
      variant: z.enum(['info', 'success', 'warning', 'error']).optional(),
      /** Hidden when this resolves to false, "false" or empty. */
      visible: bindable(z.boolean()).optional(),
    })
    .strict(),
  tree: z
    .object({
      title: z.string().optional(),
      /** Rows holding their `children` — or a flat list where each row names its parent (`parentId`). */
      data: bindable(z.array(z.record(z.unknown()))).optional(),
      /** Where a row's id, label, children, parent, icon and count are (defaults: id, label / name / title, children, parentId). */
      idKey: z.string().optional(),
      labelKey: z.string().optional(),
      childrenKey: z.string().optional(),
      parentKey: z.string().optional(),
      /** A key holding a Lucide icon name per node, e.g. Folder. */
      iconKey: z.string().optional(),
      /** A key whose value shows as a small count on the right, e.g. 12. */
      countKey: z.string().optional(),
      /** single (default): a click selects a node. multiple: tick boxes, a parent ticks all its leaves. */
      selection: z.enum(['single', 'multiple']).optional(),
      /** Ids ticked at the start (multiple; may be a binding). */
      defaultChecked: bindable(z.array(z.union([z.string(), z.number()]))).optional(),
      /** Levels open at the start (default 1: the top nodes open; 0: all closed). */
      expandDepth: z.number().int().min(0).optional(),
      /** A box that filters the tree by label. */
      search: z.boolean().optional(),
      searchPlaceholder: z.string().optional(),
      emptyText: z.string().optional(),
    })
    .strict(),
  breadcrumbs: z
    .object({
      /**
       * The trail, first to last (the last is where you are). A step with a `page` is a
       * link there (with its `params`, like a Navigate action); one without is plain
       * text. Labels may be bindings, e.g. "#{{ page.params.id }}".
       */
      items: bindable(
        z.array(
          z
            .object({
              label: z.string().optional(),
              page: z.string().min(1).optional(),
              params: z.record(z.unknown()).optional(),
            })
            .strict()
        )
      ).default([{ label: 'Home' }, { label: 'Here' }]),
      /** A house icon on the first step. */
      homeIcon: z.boolean().optional(),
    })
    .strict(),
  pagination: z
    .object({
      /** How many rows there are in all (usually a binding to a workflow's count). */
      total: bindable(z.number().int().min(0)).optional(),
      /** Rows per page (default 10). */
      pageSize: z.number().int().positive().optional(),
      /** Page sizes to choose from, e.g. [10, 25, 50] (none: no choice). */
      pageSizes: z.array(z.number().int().positive()).optional(),
      /** Fewer numbers: only the first, the last and the current page. */
      compact: z.boolean().optional(),
      /** No "1–10 of 57". */
      hideSummary: z.boolean().optional(),
    })
    .strict(),
  avatar: z
    .object({
      title: z.string().optional(),
      /** One person: their name (initials and color come from it) and picture (any image src, as an Image's). */
      name: z.string().optional(),
      src: z.string().optional(),
      subtitle: z.string().optional(),
      /** The name and subtitle beside the avatar. */
      showName: bindable(z.boolean()).optional(),
      /** A dot in the corner: online, away, busy, offline — or any status word (colored as badges). */
      status: z.string().optional(),
      /** The initials' color instead of one picked from the name. */
      color: z.enum(APP_BADGE_COLORS).optional(),
      size: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
      shape: z.enum(['circle', 'square']).optional(),
      /** A group: people rows (or plain names). Keys default to name / src (avatar, photo…) / status. */
      data: bindable(z.array(z.unknown())).optional(),
      nameKey: z.string().optional(),
      srcKey: z.string().optional(),
      subtitleKey: z.string().optional(),
      statusKey: z.string().optional(),
      /** stack (default): overlapping, up to `max` and "+N". list: one row per person, with their name. */
      display: z.enum(['stack', 'list']).optional(),
      max: z.number().int().min(1).optional(),
      emptyText: z.string().optional(),
    })
    .strict(),
  gallery: z
    .object({
      title: z.string().optional(),
      /**
       * The pictures: rows, or just their srcs — each a web link, a data URL, base64 or
       * the path of a file a workflow wrote (as an Image's `src`). Usually a binding.
       */
      data: bindable(z.array(z.unknown())).optional(),
      /** A row's picture and caption (default: src / url / image / path…, caption / title / name…). */
      srcKey: z.string().optional(),
      captionKey: z.string().optional(),
      /** grid (default): thumbnails. carousel: one at a time, with arrows and dots. */
      display: z.enum(['grid', 'carousel']).optional(),
      /** Grid: pictures per row, 1–6 (default 3). */
      columns: z.number().int().min(1).max(6).optional(),
      /** How a picture fills its box (default: cover in a grid, contain in a carousel). */
      fit: z.enum(['cover', 'contain', 'fill']).optional(),
      /** Carousel: turns by itself every N seconds (paused while the pointer is on it). */
      autoplay: z.number().positive().optional(),
      /** A click opens the picture big, with previous / next (as an Image's `zoomable`). */
      zoomable: z.boolean().optional(),
      hideCaptions: z.boolean().optional(),
      emptyText: z.string().optional(),
    })
    .strict(),
  divider: z
    .object({
      /** Text in the line, e.g. "Billing" (may be a binding). */
      label: z.string().optional(),
      /** Where the label sits on the line (default center). */
      align: z.enum(['start', 'center', 'end']).optional(),
      /** Across the page (default) or up and down, between columns. */
      orientation: z.enum(['horizontal', 'vertical']).optional(),
      /** solid (default), dashed or dotted — or none: a spacer, empty room. */
      lineStyle: z.enum(['solid', 'dashed', 'dotted', 'none']).optional(),
      /** Line width in px, 1–8 (default 1). */
      thickness: z.number().int().min(1).max(8).optional(),
      /** A badge color for the line (default: the border color). */
      color: z.enum(APP_BADGE_COLORS).optional(),
      /** Hidden when this resolves to false, "false" or empty. */
      visible: bindable(z.boolean()).optional(),
    })
    .strict(),
  badge: z
    .object({
      /** The status — or a list of them (tags). Usually a binding. */
      value: z.unknown().optional(),
      /** Small caption above, e.g. "Status". */
      label: z.string().optional(),
      colors: appBadgeColorsSchema.optional(),
      /** Color for values `colors` doesn't list (instead of one picked from the value). */
      defaultColor: z.enum(APP_BADGE_COLORS).optional(),
      size: z.enum(['sm', 'md']).optional(),
    })
    .strict(),
  image: z
    .object({
      /**
       * The image: a web URL, a data URL, bare base64, or the path of a file inside
       * ~/Tipeline (absolute, `~/…` or relative to it) — e.g. a screenshot a
       * workflow saved. Usually a binding.
       */
      src: z.string().optional(),
      alt: z.string().optional(),
      /** How it fills its box: contain (default, whole image), cover (crop to fill), fill, none (actual size). */
      fit: z.enum(['contain', 'cover', 'fill', 'none']).optional(),
      /** Small text under the image. */
      caption: z.string().optional(),
      /** Clicking shows it full size. */
      zoomable: z.boolean().optional(),
    })
    .strict(),
  keyValue: z
    .object({
      title: z.string().optional(),
      /** The object shown, usually a binding such as `{= recordsTable.selectedRow =}`. */
      data: bindable(z.record(z.unknown())).optional(),
      /** Omit to show every key of `data`, in its order. */
      fields: z.array(appDetailFieldSchema).optional(),
      /** list: label beside value, one per line. grid: label above value, several per line. */
      display: z.enum(['list', 'grid']).optional(),
      /** Shown while `data` is empty (e.g. "Select a record"). */
      emptyText: z.string().optional(),
      /** Leaves out fields without a value. */
      hideEmpty: z.boolean().optional(),
      /** A copy button on each value. */
      copyable: z.boolean().optional(),
    })
    .strict(),
  fileDrop: z
    .object({
      label: z.string().optional(),
      description: z.string().optional(),
      /** Text in the drop zone (default "Drop files here or click to browse"). */
      placeholder: z.string().optional(),
      /**
       * Several files (default): the value is a list of paths. false: one file, the
       * value is its path — a new one replaces it.
       */
      multiple: z.boolean().optional(),
      /** Kinds taken, as an <input accept>: ".pdf, .png, image/*" (or a list of them). */
      accept: z.union([z.string(), z.array(z.string())]).optional(),
      /** Largest file taken, in MB. */
      maxSizeMb: z.number().positive().optional(),
      /** Most files kept at once (with `multiple`). */
      maxFiles: z.number().int().positive().optional(),
      /** A stepper's Next won't go on without a file. */
      required: z.boolean().optional(),
    })
    .strict(),
  timer: z
    .object({
      /** Text before the countdown, e.g. "Refreshing". */
      label: z.string().optional(),
      /** Seconds between ticks (at least 1; default 30). */
      interval: bindable(z.number().min(1)).optional(),
      /**
       * Counting down unless this resolves to false / "false" (default on). Bind it
       * (e.g. `{{ state.autoRefresh }}`) to pause and resume it from elsewhere; the
       * widget's own pause button works too.
       */
      running: bindable(z.boolean()).optional(),
      /** false: tick once, then stop (a countdown). Default true. */
      repeat: z.boolean().optional(),
      /** Leaves out the pause and "run now" buttons. */
      hideControls: z.boolean().optional(),
      /** Hidden when this resolves to false, "false" or empty — it still ticks. */
      visible: bindable(z.boolean()).optional(),
    })
    .strict(),
  pdf: z
    .object({
      title: z.string().optional(),
      /**
       * The PDF: a web link, a file a workflow wrote (inside ~/Tipeline), a data URL or
       * bare base64 — usually a binding such as `{{ runnables.invoice.outputs.path }}`.
       */
      src: z.string().optional(),
      /** The page it opens at (default 1). */
      page: bindable(z.number().int().positive()).optional(),
      /** No toolbar (pages, zoom). */
      hideToolbar: z.boolean().optional(),
      /** Shown while there's no PDF yet. */
      emptyText: z.string().optional(),
    })
    .strict(),
  json: z
    .object({
      title: z.string().optional(),
      /**
       * The value shown as a tree — any JSON value, usually a binding such as
       * `{= runnables.fetch.outputs.response =}`. A string holding JSON is parsed.
       */
      data: z.unknown().optional(),
      /** How many levels start open (default 1; 0 starts closed). */
      expandDepth: bindable(z.number().int().min(0).max(20)).optional(),
      /** Shown while `data` is empty. */
      emptyText: z.string().optional(),
    })
    .strict(),
  listView: z
    .object({
      /** The items: an array, or a binding such as `{= runnables.records.outputs.records =}`. */
      data: bindable(z.array(z.unknown())).optional(),
      /** How many items sit side by side (a card grid); 1 is a plain list. */
      itemsPerRow: bindable(z.number().int().min(1).max(6)).optional(),
      /** Shown when there are no items. */
      emptyText: z.string().optional(),
      /**
       * The name the item template uses for the current element (default `item`) —
       * e.g. `record`, then `{{ record.name }}`. Like a forEach loop's currentItem.
       */
      itemName: bindingNameSchema.optional(),
      /** The name for the item's position, from 0 (default `index`). */
      indexName: bindingNameSchema.optional(),
      /**
       * Field that identifies an item (e.g. "id"): when the data reloads, the selected
       * item is found again by it (and dropped if it's gone). Without it, by position.
       */
      itemKey: z.string().optional(),
    })
    .strict(),
  container: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      /** Hidden (with everything inside) when this resolves to false, "false" or empty. */
      visible: bindable(z.boolean()).optional(),
    })
    .strict(),
  tabs: z
    .object({
      tabs: z.array(appTabSchema).min(1, 'tabs need at least one tab').default([{ id: 'tab1', label: 'Tab 1' }]),
      /** Tab shown when the page opens (and on `reset`) — a tab id, or a binding to one. */
      defaultTab: z.string().optional(),
      /**
       * tabs (default): a row of tabs, any one opens. steps: a wizard — numbered
       * steps with Back / Next, and Finish (the `finish` event) on the last one. Next
       * and Finish first check the step: required inputs, selects and date ranges
       * must have a value and forms must be valid. Earlier steps can be reopened from
       * the header; later ones only through Next. accordion: sections stacked under
       * each other, one open at a time, filling the rest of the box.
       */
      display: z.enum(['tabs', 'steps', 'accordion']).optional(),
      /** Steps only: button labels (defaults: Back, Next, Finish). */
      backLabel: z.string().optional(),
      nextLabel: z.string().optional(),
      finishLabel: z.string().optional(),
      /** Hidden (with everything inside) when this resolves to false, "false" or empty. */
      visible: bindable(z.boolean()).optional(),
    })
    .strict(),
} as const;

export type AppComponentType = keyof typeof appComponentPropsSchemas;
export const APP_COMPONENT_TYPES = Object.keys(appComponentPropsSchemas) as AppComponentType[];

/** Component types that hold other components (named by the children's `parent`). */
export const APP_CONTAINER_TYPES: readonly AppComponentType[] = ['container', 'tabs', 'listView'];

/**
 * What a list view's item template may hold: components without a value of their own.
 * An input, table, form… would be one component shared by every item.
 */
export const APP_LIST_ITEM_TYPES: readonly AppComponentType[] = [
  'text',
  'image',
  'badge',
  'button',
  'buttonGroup',
  'kpi',
  'alert',
  'keyValue',
  'json',
  'progress',
  'chart',
  'container',
];

/**
 * How a component's grid cell is drawn: `card` (background and border) or `none`
 * (the component sits straight on the page). Omitted: the type's default — small,
 * inline components (badge, button, image) are frameless, the rest are cards.
 */
export const APP_COMPONENT_FRAMES = ['card', 'none'] as const;
export type AppComponentFrame = (typeof APP_COMPONENT_FRAMES)[number];

/** Events each component type can fire. */
// A table additionally fires `action:<id>` for each of its row actions and
// `bulk:<id>` for each bulk action (see appRowActionSchema); those names are checked
// against its rowActions / bulkActions on the app.
export const APP_COMPONENT_EVENTS: Record<AppComponentType, readonly string[]> = {
  text: [],
  button: ['click'],
  // `click`: the card was clicked — with actions, it shows a link line (`linkText`).
  kpi: ['click'],
  table: ['rowClick', 'pageChange', 'save', 'selectionChange'],
  // `preview`: a code input's Preview opened, or its text changed while it shows (payload: value).
  input: ['change', 'preview'],
  // `search`: remote search typed (see the select's `search`).
  select: ['change', 'search'],
  checkbox: ['change'],
  dateRange: ['change'],
  form: ['submit'],
  alert: [],
  chart: ['pointClick'],
  runConsole: [],
  approvals: ['decided'],
  // `rowClick`: a run was clicked (state: selectedRun).
  runs: ['rowClick'],
  keyValue: [],
  json: [],
  progress: [],
  // Only `action:<id>`, one per item (state: clicked — the id of the last one).
  buttonGroup: [],
  // `send`: a message was sent (`<id>.message`); `reply`: the answer came (`<id>.reply`).
  chat: ['send', 'reply'],
  // `markerClick`: a marker was clicked (state: selectedMarker — its row, selectedIndex).
  map: ['markerClick'],
  // `message`: the embedded page posted a message to the app (state: message — its data).
  embed: ['message'],
  // cardClick: selectedCard (its row), selectedIndex. cardMove: a card was moved —
  // lastMove { card, from, to, fromIndex, index } (it stays moved until the data is read again).
  kanban: ['cardClick', 'cardMove'],
  // itemClick: an event was clicked (state: selectedItem — its row, selectedIndex).
  timeline: ['itemClick'],
  // State: playing, currentTime (seconds, about every second), duration, ended.
  media: ['play', 'pause', 'ended'],
  // Only `event:<name>`, one per name in `eventNames` (state: lastEvent { name, payload }, value).
  custom: [],
  divider: [],
  // itemClick: selectedItem (its row), selectedIndex. change: the carousel turned (state: index).
  gallery: ['itemClick', 'change'],
  // click: one person's avatar. itemClick: someone in a group (state: selectedItem — their row, selectedIndex).
  avatar: ['click', 'itemClick'],
  // None: a step with a page goes there by itself.
  breadcrumbs: [],
  // itemClick: a node was clicked (state: selectedNode — its row, selectedId).
  // change: ticks changed (state: checked — ids of fully ticked nodes, checkedLeaves — the ticked leaves' rows).
  tree: ['itemClick', 'change'],
  // change: another page or page size (state: page, pageSize, offset, from, to).
  pagination: ['change'],
  // eventClick: selectedEvent (its row). dateSelect: selectedDate / selectedStart / selectedEnd.
  // rangeChange: the visible days changed (from / to — also on first showing).
  calendar: ['eventClick', 'dateSelect', 'rangeChange'],
  // `pageChange`: the page mostly in view changed (state: page, pages).
  pdf: ['pageChange'],
  // `tick`: every `interval` seconds while running (state: running, ticks, lastTick, nextAt).
  timer: ['tick'],
  // `change`: files added or removed (payload: value, files).
  fileDrop: ['change'],
  badge: [],
  image: ['click'],
  listView: ['itemClick'],
  container: [],
  // `finish`: the last step's Finish, once the step checks out (display: steps).
  tabs: ['change', 'finish'],
};

/** Component types whose value can be put back to its default with a `reset` action. */
// A tabs component goes back to its `defaultTab`, so binding that to state and
// resetting the tabs switches tab from an event handler.
// A table drops its unsaved edits and unchecks its rows.
// A list view forgets which item was clicked.
// A timer starts its count again (running as its `running` prop says).
// A file dropzone lets go of its files.
// A chat starts over (its welcome message only).
// A pagination goes back to page 1 (e.g. after a filter changed).
// A tree forgets its selection and goes back to its default ticks.
export const APP_RESETTABLE_TYPES: readonly AppComponentType[] = ['input', 'select', 'checkbox', 'dateRange', 'form', 'tabs', 'table', 'listView', 'timer', 'fileDrop', 'chat', 'pagination', 'tree'];

const ROW_ACTION_EVENT = /^(action|bulk):[a-zA-Z][a-zA-Z0-9_]*$/;
const ITEM_EVENT = /^action:[a-zA-Z][a-zA-Z0-9_]*$/;
const CUSTOM_EVENT = /^event:[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Props kept exactly as written: not resolved as bindings, not checked for them, and
 * left alone when a component or runnable is renamed (a custom component's code).
 */
export const APP_LITERAL_PROPS: Partial<Record<AppComponentType, readonly string[]>> = { custom: ['code'] };

const eventsSchemaFor = (type: AppComponentType) => {
  const events = APP_COMPONENT_EVENTS[type];
  if (type === 'buttonGroup') {
    return z
      .record(
        z.string().refine((e) => ITEM_EVENT.test(e), { message: 'unknown button group event (use action:<itemId>)' }),
        actionListSchema
      )
      .default({});
  }
  if (type === 'custom') {
    return z
      .record(
        z.string().refine((e) => CUSTOM_EVENT.test(e), { message: 'unknown custom component event (use event:<name>)' }),
        actionListSchema
      )
      .default({});
  }
  if (type === 'table') {
    return z
      .record(
        z.string().refine((e) => events.includes(e) || ROW_ACTION_EVENT.test(e), {
          message:
            'unknown table event (use rowClick, pageChange, save, selectionChange, action:<rowActionId> or bulk:<bulkActionId>)',
        }),
        actionListSchema
      )
      .default({});
  }
  return events.length === 0
    ? z.object({}).strict().default({})
    : z.record(z.enum(events as [string, ...string[]]), actionListSchema).default({});
};

const componentOf = <T extends AppComponentType, P extends z.AnyZodObject>(type: T, props: P) =>
  z
    .object({
      id: bindingNameSchema,
      type: z.literal(type),
      name: z.string().min(1),
      layout: appLayoutSchema,
      parent: appComponentParentSchema.optional(),
      frame: z.enum(APP_COMPONENT_FRAMES).optional(),
      /**
       * Stretch down to the bottom of the page, container or tab when nothing sits
       * below it in its columns (never shorter than `layout.h`). In dialogs, whose
       * height follows their content, it reaches the lowest component instead.
       */
      fill: z.boolean().optional(),
      props: props.default({}),
      events: eventsSchemaFor(type),
    })
    .strict();

export const appComponentSchema = z.discriminatedUnion('type', [
  componentOf('text', appComponentPropsSchemas.text),
  componentOf('button', appComponentPropsSchemas.button),
  componentOf('kpi', appComponentPropsSchemas.kpi),
  componentOf('table', appComponentPropsSchemas.table),
  componentOf('input', appComponentPropsSchemas.input),
  componentOf('select', appComponentPropsSchemas.select),
  componentOf('checkbox', appComponentPropsSchemas.checkbox),
  componentOf('dateRange', appComponentPropsSchemas.dateRange),
  componentOf('form', appComponentPropsSchemas.form),
  componentOf('alert', appComponentPropsSchemas.alert),
  componentOf('chart', appComponentPropsSchemas.chart),
  componentOf('runConsole', appComponentPropsSchemas.runConsole),
  componentOf('approvals', appComponentPropsSchemas.approvals),
  componentOf('runs', appComponentPropsSchemas.runs),
  componentOf('keyValue', appComponentPropsSchemas.keyValue),
  componentOf('json', appComponentPropsSchemas.json),
  componentOf('pdf', appComponentPropsSchemas.pdf),
  componentOf('progress', appComponentPropsSchemas.progress),
  componentOf('buttonGroup', appComponentPropsSchemas.buttonGroup),
  componentOf('chat', appComponentPropsSchemas.chat),
  componentOf('map', appComponentPropsSchemas.map),
  componentOf('embed', appComponentPropsSchemas.embed),
  componentOf('kanban', appComponentPropsSchemas.kanban),
  componentOf('timeline', appComponentPropsSchemas.timeline),
  componentOf('media', appComponentPropsSchemas.media),
  componentOf('custom', appComponentPropsSchemas.custom),
  componentOf('divider', appComponentPropsSchemas.divider),
  componentOf('gallery', appComponentPropsSchemas.gallery),
  componentOf('avatar', appComponentPropsSchemas.avatar),
  componentOf('breadcrumbs', appComponentPropsSchemas.breadcrumbs),
  componentOf('tree', appComponentPropsSchemas.tree),
  componentOf('pagination', appComponentPropsSchemas.pagination),
  componentOf('calendar', appComponentPropsSchemas.calendar),
  componentOf('timer', appComponentPropsSchemas.timer),
  componentOf('fileDrop', appComponentPropsSchemas.fileDrop),
  componentOf('image', appComponentPropsSchemas.image),
  componentOf('badge', appComponentPropsSchemas.badge),
  componentOf('listView', appComponentPropsSchemas.listView),
  componentOf('container', appComponentPropsSchemas.container),
  componentOf('tabs', appComponentPropsSchemas.tabs),
]);
export type AppComponent = z.infer<typeof appComponentSchema>;

// ---------------- Pages & app ----------------

export const appPageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    icon: z.string().optional(),
    showInMenu: z.boolean().default(true),
    runnables: z.record(bindingNameSchema, appRunnableSchema).default({}),
    events: z.object({ load: actionListSchema.optional() }).strict().default({}),
    components: z.array(appComponentSchema).default([]),
  })
  .strict();
export type AppPage = z.infer<typeof appPageSchema>;

export const appSourceSchema = z
  .object({
    schemaVersion: z.literal(APP_SCHEMA_VERSION),
    version: z.string().optional(),
    workflows: z.record(bindingNameSchema, z.object({ identifier: z.string().min(1) }).strict()).default({}),
    state: z.record(bindingNameSchema, z.unknown()).default({}),
    pages: z.array(appPageSchema).min(1, 'an app needs at least one page'),
  })
  .strict()
  .superRefine((app, ctx) => {
    const pageIds = new Set<string>();
    app.pages.forEach((page, p) => {
      const at = (...path: (string | number)[]) => ['pages', p, ...path];
      if (pageIds.has(page.id)) {
        ctx.addIssue({ code: 'custom', path: at('id'), message: `duplicate page id "${page.id}"` });
      }
      pageIds.add(page.id);
    });

    app.pages.forEach((page, p) => {
      const at = (...path: (string | number)[]) => ['pages', p, ...path];
      const checkActions = (actions: AppAction[] | undefined, path: (string | number)[]) =>
        (actions ?? []).forEach((action, i) => {
          if (action.type === 'run' && !page.runnables[action.runnable]) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, i, 'runnable'],
              message: `unknown runnable "${action.runnable}" on page "${page.id}"`,
            });
          }
          if ((action.type === 'navigate' || action.type === 'openModal') && !pageIds.has(action.page)) {
            ctx.addIssue({ code: 'custom', path: [...path, i, 'page'], message: `unknown page "${action.page}"` });
          }
          if (action.type === 'reset') {
            const target = page.components.find((c) => c.id === action.component);
            if (!target || !APP_RESETTABLE_TYPES.includes(target.type)) {
              ctx.addIssue({
                code: 'custom',
                path: [...path, i, 'component'],
                message: `"${action.component}" is not an input or form on page "${page.id}"`,
              });
            }
          }
        });

      for (const [name, runnable] of Object.entries(page.runnables)) {
        if (!app.workflows[runnable.workflow]) {
          ctx.addIssue({
            code: 'custom',
            path: at('runnables', name, 'workflow'),
            message: `unknown workflow alias "${runnable.workflow}" — declare it under workflows`,
          });
        }
        checkActions(runnable.onSuccess, at('runnables', name, 'onSuccess'));
        checkActions(runnable.onError, at('runnables', name, 'onError'));
        if (runnable.mode === 'run') checkActions(runnable.onPaused, at('runnables', name, 'onPaused'));
      }
      checkActions(page.events.load, at('events', 'load'));

      const componentIds = new Set<string>();
      page.components.forEach((component, c) => {
        if (componentIds.has(component.id)) {
          ctx.addIssue({ code: 'custom', path: at('components', c, 'id'), message: `duplicate component id "${component.id}"` });
        }
        if ((RESERVED_BINDING_NAMES as readonly string[]).includes(component.id)) {
          ctx.addIssue({ code: 'custom', path: at('components', c, 'id'), message: `"${component.id}" is a reserved name` });
        }
        componentIds.add(component.id);
        if (component.type === 'table' && component.props.pagination === 'server' && !component.props.pageSize) {
          ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'pageSize'), message: 'server pagination needs a pageSize' });
        }
        if (component.type === 'approvals' || component.type === 'runs') {
          for (const alias of component.props.workflows ?? []) {
            if (!app.workflows[alias]) {
              ctx.addIssue({
                code: 'custom',
                path: at('components', c, 'props', 'workflows'),
                message: `unknown workflow alias "${alias}" — declare it under workflows`,
              });
            }
          }
        }
        if (component.type === 'table') {
          const actionIds = new Set((component.props.rowActions ?? []).map((a) => a.id));
          if (actionIds.size !== (component.props.rowActions ?? []).length) {
            ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'rowActions'), message: 'duplicate row action id' });
          }
          const bulkIds = new Set((component.props.bulkActions ?? []).map((a) => a.id));
          if (bulkIds.size !== (component.props.bulkActions ?? []).length) {
            ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'bulkActions'), message: 'duplicate bulk action id' });
          }
          for (const event of Object.keys(component.events ?? {})) {
            if (event.startsWith('action:') && !actionIds.has(event.slice('action:'.length))) {
              ctx.addIssue({
                code: 'custom',
                path: at('components', c, 'events', event),
                message: `no row action "${event.slice('action:'.length)}" on this table`,
              });
            }
            if (event.startsWith('bulk:') && !bulkIds.has(event.slice('bulk:'.length))) {
              ctx.addIssue({
                code: 'custom',
                path: at('components', c, 'events', event),
                message: `no bulk action "${event.slice('bulk:'.length)}" on this table`,
              });
            }
          }
        }
        if (component.type === 'chat' && component.props.runnable) {
          const runnable = page.runnables[component.props.runnable];
          if (!runnable || runnable.mode !== 'run') {
            ctx.addIssue({
              code: 'custom',
              path: at('components', c, 'props', 'runnable'),
              message: runnable
                ? `"${component.props.runnable}" reads history — a chat needs a runnable that runs a workflow`
                : `unknown runnable "${component.props.runnable}" on page "${page.id}"`,
            });
          }
        }
        if (component.type === 'breadcrumbs' && Array.isArray(component.props.items)) {
          component.props.items.forEach((step, s) => {
            if (step.page && !pageIds.has(step.page)) {
              ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'items', s, 'page'), message: `unknown page "${step.page}"` });
            }
          });
        }
        if (component.type === 'custom') {
          const names = new Set(component.props.eventNames ?? []);
          for (const event of Object.keys(component.events ?? {})) {
            if (!names.has(event.slice('event:'.length))) {
              ctx.addIssue({
                code: 'custom',
                path: at('components', c, 'events', event),
                message: `"${event.slice('event:'.length)}" isn't in this component's eventNames`,
              });
            }
          }
        }
        if (component.type === 'buttonGroup') {
          const itemIds = new Set(component.props.items.map((i) => i.id));
          if (itemIds.size !== component.props.items.length) {
            ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'items'), message: 'duplicate button id' });
          }
          for (const event of Object.keys(component.events ?? {})) {
            if (!itemIds.has(event.slice('action:'.length))) {
              ctx.addIssue({
                code: 'custom',
                path: at('components', c, 'events', event),
                message: `no button "${event.slice('action:'.length)}" in this group`,
              });
            }
          }
        }
        if (component.type === 'listView') {
          // The names its template binds to: not taken by the runtime, the other name,
          // or a component on the page (inside the template it would be hidden).
          const names = { itemName: component.props.itemName ?? 'item', indexName: component.props.indexName ?? 'index' };
          for (const [prop, name] of Object.entries(names)) {
            const path = at('components', c, 'props', prop);
            if ((RESERVED_BINDING_NAMES as readonly string[]).includes(name)) {
              ctx.addIssue({ code: 'custom', path, message: `"${name}" is a reserved name` });
            } else if (page.components.some((other) => other.id === name)) {
              ctx.addIssue({ code: 'custom', path, message: `"${name}" is also a component id on page "${page.id}"` });
            }
          }
          if (names.itemName === names.indexName) {
            ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'indexName'), message: 'the item and index names must differ' });
          }
        }
        if (component.type === 'tabs') {
          const ids = component.props.tabs.map((tab) => tab.id);
          if (new Set(ids).size !== ids.length) {
            ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'tabs'), message: 'duplicate tab id' });
          }
        }
        if (component.parent) {
          const parentPath = at('components', c, 'parent');
          const parent = page.components.find((p) => p.id === component.parent!.id);
          if (!parent || !APP_CONTAINER_TYPES.includes(parent.type)) {
            ctx.addIssue({
              code: 'custom',
              path: [...parentPath, 'id'],
              message: `"${component.parent.id}" is not a container or tabs component on page "${page.id}"`,
            });
          } else if (parent.type === 'tabs') {
            const tab = component.parent.tab;
            if (!tab || !parent.props.tabs.some((t) => t.id === tab)) {
              ctx.addIssue({
                code: 'custom',
                path: [...parentPath, 'tab'],
                message: tab ? `no tab "${tab}" in "${parent.id}"` : `a component inside tabs "${parent.id}" needs a tab`,
              });
            }
          } else if (component.parent.tab !== undefined) {
            ctx.addIssue({ code: 'custom', path: [...parentPath, 'tab'], message: 'only a component inside tabs has a tab' });
          }
          // Walk up: a component can't end up inside itself.
          const seen = new Set([component.id]);
          let up = parent && APP_CONTAINER_TYPES.includes(parent.type) ? parent : undefined;
          while (up?.parent) {
            if (seen.has(up.id)) {
              ctx.addIssue({ code: 'custom', path: [...parentPath, 'id'], message: 'a component cannot be inside itself' });
              break;
            }
            seen.add(up.id);
            up = page.components.find((p) => p.id === up!.parent!.id);
          }
          // Anywhere inside a list view's item template, only value-less components.
          const inList = (() => {
            const visited = new Set<string>();
            for (let a = parent; a && !visited.has(a.id); a = page.components.find((p) => p.id === a!.parent?.id)) {
              visited.add(a.id);
              if (a.type === 'listView') return a;
            }
            return undefined;
          })();
          if (inList && !APP_LIST_ITEM_TYPES.includes(component.type)) {
            ctx.addIssue({
              code: 'custom',
              path: at('components', c, 'type'),
              message: `"${component.type}" can't be inside list view "${inList.id}": every item would share its value`,
            });
          }
        }
        if (
          component.type === 'select' &&
          component.props.search &&
          component.props.search !== 'off' &&
          component.props.display &&
          component.props.display !== 'dropdown'
        ) {
          ctx.addIssue({
            code: 'custom',
            path: at('components', c, 'props', 'search'),
            message: `a search box needs the dropdown display, not "${component.props.display}"`,
          });
        }
        // Bound fields are only known when the page runs (see formFields in the desktop).
        if (component.type === 'form' && Array.isArray(component.props.fields)) {
          const names = component.props.fields.map((f) => f.name);
          if (new Set(names).size !== names.length) {
            ctx.addIssue({ code: 'custom', path: at('components', c, 'props', 'fields'), message: 'duplicate field name' });
          }
          // A field's display has to suit its type.
          component.props.fields.forEach((field, f) => {
            if (!field.display) return;
            const fits =
              field.type === 'checkbox'
                ? field.display === 'switch' || field.display === 'checkbox'
                : field.type === 'select'
                  ? (APP_SELECT_DISPLAYS as readonly string[]).includes(field.display)
                  : field.type === 'multiselect'
                    ? field.display === 'list' || field.display === 'buttons'
                    : false;
            if (!fits) {
              ctx.addIssue({
                code: 'custom',
                path: at('components', c, 'props', 'fields', f, 'display'),
                message: `a ${field.type ?? 'text'} field can't be displayed as "${field.display}"`,
              });
            }
          });
        }
        for (const [event, actions] of Object.entries(component.events ?? {})) {
          checkActions(actions as AppAction[], at('components', c, 'events', event));
        }
      });
    });
  });
export type AppSource = z.infer<typeof appSourceSchema>;

/** Formats Zod issues as `path: message` lines. */
export function formatAppSourceIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? seg : `.${seg}`))
      .join('');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Turns any stored or imported app source (object or JSON string, v1 to v4) into
 * a validated v4 source. Older sources (v1 has no `schemaVersion`) are migrated first.
 * Throws an Error whose message is `app.validationFailed` followed by one
 * `path: message` line per problem.
 */
export function parseAppSource(raw: unknown): AppSource {
  let data: any = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error('app.validationFailed\nsource is not valid JSON');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('app.validationFailed\nsource must be an object');
  }
  if (data.schemaVersion === undefined) data = migrateAppSourceV1(data);
  if (data.schemaVersion === 2) data = migrateAppSourceV2(data);
  if (data.schemaVersion === 3) data = migrateAppSourceV3(data);
  if (data.schemaVersion !== APP_SCHEMA_VERSION) {
    throw new Error(`app.validationFailed\nunsupported schemaVersion ${JSON.stringify(data.schemaVersion)}`);
  }

  const result = appSourceSchema.safeParse(data);
  if (!result.success) {
    throw new Error(['app.validationFailed', ...formatAppSourceIssues(result.error)].join('\n'));
  }
  return result.data;
}

/** A new app: one empty page. */
export function createEmptyAppSource(): AppSource {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    version: '1.0.0',
    workflows: {},
    state: {},
    pages: [{ id: 'home', name: 'Home', showInMenu: true, runnables: {}, events: {}, components: [] }],
  };
}

export { migrateAppSourceV1, migrateAppSourceV2, migrateAppSourceV3 };
