import { defineAsyncComponent } from 'vue';
import type { Component } from 'vue';
import type { AppComponent, AppComponentFrame, AppComponentType } from '@tipeline/schemas';
import TextWidget from './TextWidget.vue';
import ImageWidget from './ImageWidget.vue';
import BadgeWidget from './BadgeWidget.vue';
import ButtonWidget from './ButtonWidget.vue';
import KpiWidget from './KpiWidget.vue';
import KeyValueWidget from './KeyValueWidget.vue';
import JsonWidget from './JsonWidget.vue';
import PdfWidget from './PdfWidget.vue';
import ProgressWidget from './ProgressWidget.vue';
import ButtonGroupWidget from './ButtonGroupWidget.vue';
import ChatWidget from './ChatWidget.vue';
import MapWidget from './MapWidget.vue';
import EmbedWidget from './EmbedWidget.vue';
import KanbanWidget from './KanbanWidget.vue';
import TimelineWidget from './TimelineWidget.vue';
import MediaWidget from './MediaWidget.vue';
import CustomWidget from './CustomWidget.vue';
import DividerWidget from './DividerWidget.vue';
import GalleryWidget from './GalleryWidget.vue';
import BreadcrumbsWidget from './BreadcrumbsWidget.vue';
import PaginationWidget from './PaginationWidget.vue';
import AvatarWidget from './AvatarWidget.vue';
import TreeWidget from './TreeWidget.vue';
// FullCalendar is big: the calendar loads only when one is shown.
const CalendarWidget = defineAsyncComponent(() => import('./CalendarWidget.vue'));
import TimerWidget from './TimerWidget.vue';
import FileDropWidget from './FileDropWidget.vue';
import TableWidget from './TableWidget.vue';
import InputWidget from './InputWidget.vue';
import SelectWidget from './SelectWidget.vue';
import CheckboxWidget from './CheckboxWidget.vue';
import DateRangeWidget from './DateRangeWidget.vue';
import FormWidget from './FormWidget.vue';
import AlertWidget from './AlertWidget.vue';
import ChartWidget from './ChartWidget.vue';
import RunConsoleWidget from './RunConsoleWidget.vue';
import ApprovalsWidget from './ApprovalsWidget.vue';
import RunsWidget from './RunsWidget.vue';
import ContainerWidget from './ContainerWidget.vue';
import ListViewWidget from './ListViewWidget.vue';
import TabsWidget from './TabsWidget.vue';

/** One editable prop in the builder's Properties panel. `label` is an i18n key under builder.props. */
export interface PropField {
  key: string;
  label: string;
  // switch: boolean; fields: the form-fields editor; tabs: the tabs editor
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'json'
    | 'switch'
    | 'fields'
    | 'tabs'
    // data: JSON written in (an array / object), or one binding to it
    | 'data'
    // code: a code editor (in `language`), kept as written — never a binding
    | 'code';
  options?: string[];
  /** type code: its language (highlighting). */
  language?: string;
  /**
   * Holds a name (an identifier), not text — no {{ }} / {= =} binding. Every other
   * text, textarea and JSON prop can bind: the runtime resolves bindings in every
   * string prop, so the builder edits them all with the binding field.
   */
  plain?: boolean;
  /** Text that is purely numeric is stored as a number (a binding stays text). */
  numeric?: boolean;
  /** Shown only when this holds for the component's props (e.g. a setting of one input type). */
  when?: (props: Record<string, any>) => boolean;
  /** type switch: what an unset prop means (default off). */
  default?: boolean;
}

const inputTypeIs =
  (...types: string[]) =>
  (p: Record<string, any>) =>
    types.includes(p.inputType ?? 'text');

/** Whether a prop takes {{ }} / {= =} bindings: text, textarea and JSON, unless `plain`. */
export function isBindable(field: PropField): boolean {
  return (
    !field.plain &&
    (field.type === 'text' || field.type === 'textarea' || field.type === 'json' || field.type === 'data')
  );
}

export interface WidgetDefinition {
  type: AppComponentType;
  /** lucide icon name */
  icon: string;
  /** Default size: w in the 12 columns, h in 10px rows (APP_GRID_ROW_HEIGHT). */
  size: { w: number; h: number };
  defaultProps: Record<string, unknown>;
  /** How its grid cell is drawn when the component sets no `frame`. Omitted: a card. */
  frame?: AppComponentFrame;
  fields: PropField[];
  component: Component;
}

// Palette order. Types listed here are exactly the types the app schema accepts.
export const WIDGETS: WidgetDefinition[] = [
  {
    type: 'text',
    icon: 'Type',
    size: { w: 6, h: 14 },
    defaultProps: { content: 'Add your text here' },
    component: TextWidget,
    fields: [
      { key: 'content', label: 'content', type: 'textarea' },
      { key: 'markdown', label: 'markdown', type: 'switch' },
      { key: 'fontSize', label: 'fontSize', type: 'number' },
      {
        key: 'fontWeight',
        label: 'fontWeight',
        type: 'select',
        options: ['normal', 'medium', 'semibold', 'bold'],
      },
      { key: 'color', label: 'color', type: 'text' },
    ],
  },
  {
    type: 'image',
    icon: 'Image',
    size: { w: 4, h: 24 },
    defaultProps: {},
    frame: 'none',
    component: ImageWidget,
    fields: [
      { key: 'src', label: 'imageSrc', type: 'text' },
      { key: 'alt', label: 'alt', type: 'text' },
      { key: 'fit', label: 'fit', type: 'select', options: ['contain', 'cover', 'fill', 'none'] },
      { key: 'caption', label: 'caption', type: 'text' },
      { key: 'zoomable', label: 'zoomable', type: 'switch' },
    ],
  },
  {
    type: 'divider',
    icon: 'SeparatorHorizontal',
    size: { w: 12, h: 4 },
    defaultProps: {},
    frame: 'none',
    component: DividerWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'align', label: 'dividerAlign', type: 'select', options: ['start', 'center', 'end'] },
      { key: 'orientation', label: 'dividerOrientation', type: 'select', options: ['horizontal', 'vertical'] },
      { key: 'lineStyle', label: 'dividerLineStyle', type: 'select', options: ['solid', 'dashed', 'dotted', 'none'] },
      { key: 'thickness', label: 'dividerThickness', type: 'number' },
      { key: 'color', label: 'dividerColor', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'visible', label: 'visible', type: 'text' },
    ],
  },
  {
    type: 'tree',
    icon: 'ListTree',
    size: { w: 4, h: 45 },
    defaultProps: { title: 'Tree' },
    component: TreeWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'selection', label: 'treeSelection', type: 'select', options: ['single', 'multiple'] },
      { key: 'defaultChecked', label: 'treeDefaultChecked', type: 'json' },
      { key: 'search', label: 'treeSearch', type: 'switch' },
      { key: 'searchPlaceholder', label: 'placeholder', type: 'text' },
      { key: 'expandDepth', label: 'expandDepth', type: 'number' },
      { key: 'idKey', label: 'treeIdKey', type: 'text', plain: true },
      { key: 'labelKey', label: 'treeLabelKey', type: 'text', plain: true },
      { key: 'childrenKey', label: 'treeChildrenKey', type: 'text', plain: true },
      { key: 'parentKey', label: 'treeParentKey', type: 'text', plain: true },
      { key: 'iconKey', label: 'timelineIconKey', type: 'text', plain: true },
      { key: 'countKey', label: 'treeCountKey', type: 'text', plain: true },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'avatar',
    icon: 'CircleUserRound',
    size: { w: 3, h: 7 },
    defaultProps: { name: 'Ada Lovelace' },
    frame: 'none',
    component: AvatarWidget,
    fields: [
      { key: 'name', label: 'avatarName', type: 'text' },
      { key: 'src', label: 'avatarSrc', type: 'text' },
      { key: 'subtitle', label: 'avatarSubtitle', type: 'text' },
      { key: 'showName', label: 'avatarShowName', type: 'switch' },
      { key: 'status', label: 'avatarStatus', type: 'text' },
      { key: 'color', label: 'avatarColor', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'size', label: 'size', type: 'select', options: ['sm', 'md', 'lg', 'xl'] },
      { key: 'shape', label: 'avatarShape', type: 'select', options: ['circle', 'square'] },
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'avatarData', type: 'data' },
      { key: 'display', label: 'avatarDisplay', type: 'select', options: ['stack', 'list'] },
      { key: 'max', label: 'avatarMax', type: 'number' },
      { key: 'nameKey', label: 'avatarNameKey', type: 'text', plain: true },
      { key: 'srcKey', label: 'avatarSrcKey', type: 'text', plain: true },
      { key: 'subtitleKey', label: 'avatarSubtitleKey', type: 'text', plain: true },
      { key: 'statusKey', label: 'avatarStatusKey', type: 'text', plain: true },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'breadcrumbs',
    icon: 'ChevronsRight',
    size: { w: 8, h: 5 },
    defaultProps: { items: [{ label: 'Home' }, { label: 'Here' }] },
    frame: 'none',
    component: BreadcrumbsWidget,
    fields: [
      { key: 'items', label: 'breadcrumbItems', type: 'json' },
      { key: 'homeIcon', label: 'breadcrumbHomeIcon', type: 'switch' },
    ],
  },
  {
    type: 'pagination',
    icon: 'ArrowLeftRight',
    size: { w: 12, h: 5 },
    defaultProps: { total: 0, pageSize: 10 },
    frame: 'none',
    component: PaginationWidget,
    fields: [
      { key: 'total', label: 'paginationTotal', type: 'text', numeric: true },
      { key: 'pageSize', label: 'pageSize', type: 'number' },
      { key: 'pageSizes', label: 'paginationPageSizes', type: 'json' },
      { key: 'compact', label: 'paginationCompact', type: 'switch' },
      { key: 'hideSummary', label: 'paginationHideSummary', type: 'switch' },
    ],
  },
  {
    type: 'gallery',
    icon: 'Images',
    size: { w: 8, h: 40 },
    defaultProps: { title: 'Gallery', zoomable: true },
    component: GalleryWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'srcKey', label: 'gallerySrcKey', type: 'text', plain: true },
      { key: 'captionKey', label: 'galleryCaptionKey', type: 'text', plain: true },
      { key: 'display', label: 'display', type: 'select', options: ['grid', 'carousel'] },
      { key: 'columns', label: 'galleryColumns', type: 'number' },
      { key: 'fit', label: 'fit', type: 'select', options: ['cover', 'contain', 'fill'] },
      { key: 'autoplay', label: 'galleryAutoplay', type: 'number' },
      { key: 'zoomable', label: 'zoomable', type: 'switch' },
      { key: 'hideCaptions', label: 'galleryHideCaptions', type: 'switch' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'badge',
    icon: 'Tag',
    size: { w: 3, h: 7 },
    defaultProps: { value: 'active' },
    frame: 'none',
    component: BadgeWidget,
    fields: [
      { key: 'value', label: 'badgeValue', type: 'text' },
      { key: 'label', label: 'label', type: 'text' },
      { key: 'colors', label: 'badgeColors', type: 'json' },
      { key: 'defaultColor', label: 'defaultColor', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'size', label: 'size', type: 'select', options: ['sm', 'md'] },
    ],
  },
  {
    type: 'button',
    icon: 'MousePointerClick',
    size: { w: 3, h: 7 },
    defaultProps: { label: 'Button' },
    frame: 'none',
    component: ButtonWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'icon', label: 'buttonIcon', type: 'text' },
      {
        key: 'variant',
        label: 'variant',
        type: 'select',
        options: [
          'default',
          'outline',
          'ghost',
          'destructive',
          'secondary',
          'link',
        ],
      },
      { key: 'disabled', label: 'disabled', type: 'text' },
    ],
  },
  {
    type: 'kpi',
    icon: 'TrendingUp',
    size: { w: 3, h: 14 },
    defaultProps: { label: 'Metric', value: null },
    component: KpiWidget,
    fields: [
      { key: 'label', label: 'metricName', type: 'text' },
      {
        key: 'value',
        label: 'value',
        type: 'text',
        numeric: true,
      },
      {
        key: 'format',
        label: 'format',
        type: 'select',
        options: ['text', 'number', 'currency', 'percent'],
      },
      { key: 'currency', label: 'currency', type: 'text' },
      {
        key: 'trend',
        label: 'trend',
        type: 'text',
        numeric: true,
      },
      {
        key: 'trendDirection',
        label: 'trendDirection',
        type: 'select',
        options: ['up', 'down', 'neutral'],
      },
      { key: 'spark', label: 'spark', type: 'data' },
      { key: 'sparkKey', label: 'sparkKey', type: 'text' },
      { key: 'linkText', label: 'linkText', type: 'text' },
      { key: 'color', label: 'color', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'colorRules', label: 'kpiColorRules', type: 'json' },
    ],
  },
  {
    type: 'keyValue',
    icon: 'TableProperties',
    size: { w: 4, h: 28 },
    defaultProps: { title: 'Details' },
    component: KeyValueWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'fields', label: 'detailFields', type: 'json' },
      { key: 'display', label: 'display', type: 'select', options: ['list', 'grid'] },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
      { key: 'hideEmpty', label: 'hideEmpty', type: 'switch' },
      { key: 'copyable', label: 'copyable', type: 'switch' },
    ],
  },
  {
    type: 'fileDrop',
    icon: 'Upload',
    size: { w: 6, h: 22 },
    defaultProps: { label: 'Files' },
    component: FileDropWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'placeholder', label: 'placeholder', type: 'text' },
      { key: 'description', label: 'description', type: 'text' },
      { key: 'multiple', label: 'multipleFiles', type: 'switch' },
      { key: 'accept', label: 'accept', type: 'text' },
      { key: 'maxSizeMb', label: 'maxSizeMb', type: 'number' },
      { key: 'maxFiles', label: 'maxFiles', type: 'number' },
      { key: 'required', label: 'required', type: 'switch' },
    ],
  },
  {
    type: 'timer',
    icon: 'Timer',
    size: { w: 4, h: 6 },
    defaultProps: { label: 'Auto-refresh', interval: 30 },
    frame: 'none',
    component: TimerWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'interval', label: 'intervalSeconds', type: 'text', numeric: true },
      { key: 'running', label: 'running', type: 'text' },
      { key: 'repeat', label: 'repeat', type: 'switch' },
      { key: 'hideControls', label: 'hideControls', type: 'switch' },
      { key: 'visible', label: 'visible', type: 'text' },
    ],
  },
  {
    type: 'calendar',
    icon: 'CalendarDays',
    size: { w: 8, h: 56 },
    defaultProps: { title: 'Calendar' },
    component: CalendarWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'titleKey', label: 'calTitleKey', type: 'text', plain: true },
      { key: 'startKey', label: 'calStartKey', type: 'text', plain: true },
      { key: 'endKey', label: 'calEndKey', type: 'text', plain: true },
      { key: 'colorKey', label: 'mapColorKey', type: 'text', plain: true },
      { key: 'colors', label: 'badgeColors', type: 'json' },
      { key: 'defaultColor', label: 'defaultColor', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'view', label: 'calView', type: 'select', options: ['month', 'week', 'day', 'list'] },
      { key: 'views', label: 'calViews', type: 'json' },
      { key: 'initialDate', label: 'calInitialDate', type: 'text' },
    ],
  },
  {
    type: 'map',
    icon: 'MapPinned',
    size: { w: 6, h: 40 },
    defaultProps: { title: 'Map' },
    component: MapWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'labelKey', label: 'mapLabelKey', type: 'text', plain: true },
      { key: 'latKey', label: 'mapLatKey', type: 'text', plain: true },
      { key: 'lngKey', label: 'mapLngKey', type: 'text', plain: true },
      { key: 'colorKey', label: 'mapColorKey', type: 'text', plain: true },
      { key: 'colors', label: 'badgeColors', type: 'json' },
      { key: 'defaultColor', label: 'defaultColor', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'popupFields', label: 'mapPopupFields', type: 'json' },
      { key: 'center', label: 'mapCenter', type: 'json' },
      { key: 'zoom', label: 'mapZoom', type: 'text', numeric: true },
      { key: 'tiles', label: 'mapTiles', type: 'text', plain: true },
      { key: 'attribution', label: 'mapAttribution', type: 'text' },
    ],
  },
  {
    type: 'custom',
    icon: 'Code2',
    size: { w: 6, h: 30 },
    defaultProps: {
      code: '<button id="hello">Say hello</button>\n\n<script>\n  // tipeline.data is the Data prop; tipeline.emit fires an event the app can react to.\n  document.getElementById("hello").onclick = () => tipeline.emit("hello", { at: Date.now() });\n</script>\n',
      eventNames: ['hello'],
    },
    component: CustomWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'code', label: 'customCode', type: 'code', language: 'html' },
      { key: 'data', label: 'customData', type: 'data' },
      { key: 'eventNames', label: 'customEventNames', type: 'json' },
    ],
  },
  {
    type: 'media',
    icon: 'Clapperboard',
    size: { w: 6, h: 36 },
    defaultProps: {},
    component: MediaWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'src', label: 'mediaSrc', type: 'text' },
      { key: 'kind', label: 'mediaKind', type: 'select', options: ['video', 'audio'] },
      { key: 'poster', label: 'mediaPoster', type: 'text' },
      { key: 'autoplay', label: 'mediaAutoplay', type: 'switch' },
      { key: 'loop', label: 'mediaLoop', type: 'switch' },
      { key: 'muted', label: 'mediaMuted', type: 'switch' },
      { key: 'hideControls', label: 'mediaHideControls', type: 'switch' },
      { key: 'startAt', label: 'mediaStartAt', type: 'text', numeric: true },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'timeline',
    icon: 'GitCommitVertical',
    size: { w: 4, h: 45 },
    defaultProps: { title: 'Timeline', sort: 'newest' },
    component: TimelineWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'timeKey', label: 'timelineTimeKey', type: 'text', plain: true },
      { key: 'titleKey', label: 'timelineTitleKey', type: 'text', plain: true },
      { key: 'descriptionKey', label: 'timelineDescriptionKey', type: 'text', plain: true },
      { key: 'fields', label: 'kanbanFields', type: 'json' },
      { key: 'colorKey', label: 'mapColorKey', type: 'text', plain: true },
      { key: 'colors', label: 'badgeColors', type: 'json' },
      { key: 'iconKey', label: 'timelineIconKey', type: 'text', plain: true },
      { key: 'sort', label: 'timelineSort', type: 'select', options: ['newest', 'oldest', 'none'] },
      { key: 'groupByDay', label: 'timelineGroupByDay', type: 'switch' },
      { key: 'timeFormat', label: 'timelineTimeFormat', type: 'select', options: ['datetime', 'date', 'time', 'relative'] },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'kanban',
    icon: 'SquareKanban',
    size: { w: 12, h: 50 },
    defaultProps: { title: 'Board' },
    component: KanbanWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'groupKey', label: 'kanbanGroupKey', type: 'text', plain: true },
      { key: 'columns', label: 'kanbanColumns', type: 'json' },
      { key: 'titleKey', label: 'kanbanTitleKey', type: 'text', plain: true },
      { key: 'fields', label: 'kanbanFields', type: 'json' },
      { key: 'colorKey', label: 'mapColorKey', type: 'text', plain: true },
      { key: 'colors', label: 'badgeColors', type: 'json' },
      { key: 'rowKey', label: 'rowKey', type: 'text', plain: true },
      { key: 'readOnly', label: 'kanbanReadOnly', type: 'switch' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'embed',
    icon: 'AppWindow',
    size: { w: 6, h: 45 },
    defaultProps: { title: 'Web page' },
    component: EmbedWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'src', label: 'embedSrc', type: 'text' },
      { key: 'html', label: 'embedHtml', type: 'textarea' },
      { key: 'blockScripts', label: 'embedBlockScripts', type: 'switch' },
      { key: 'hideToolbar', label: 'hideToolbar', type: 'switch' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'chat',
    icon: 'MessagesSquare',
    size: { w: 6, h: 50 },
    defaultProps: { title: 'Assistant', welcome: 'Hi! How can I help?' },
    component: ChatWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'runnable', label: 'chatRunnable', type: 'text', plain: true },
      { key: 'reply', label: 'chatReply', type: 'text', plain: true },
      { key: 'welcome', label: 'chatWelcome', type: 'textarea' },
      { key: 'placeholder', label: 'placeholder', type: 'text' },
      { key: 'suggestions', label: 'chatSuggestions', type: 'json' },
    ],
  },
  {
    type: 'buttonGroup',
    icon: 'Rows3',
    size: { w: 6, h: 6 },
    defaultProps: {
      items: [
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second', variant: 'outline' },
      ],
    },
    frame: 'none',
    component: ButtonGroupWidget,
    fields: [
      { key: 'items', label: 'buttonItems', type: 'json' },
      { key: 'display', label: 'display', type: 'select', options: ['row', 'menu'] },
      { key: 'label', label: 'menuLabel', type: 'text' },
      { key: 'icon', label: 'buttonIcon', type: 'text' },
      { key: 'variant', label: 'variant', type: 'select', options: ['default', 'outline', 'ghost', 'destructive', 'secondary', 'link'] },
    ],
  },
  {
    type: 'progress',
    icon: 'Gauge',
    size: { w: 4, h: 8 },
    defaultProps: { label: 'Progress', value: 40 },
    component: ProgressWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'value', label: 'progressValue', type: 'text', numeric: true },
      { key: 'max', label: 'progressMax', type: 'text', numeric: true },
      { key: 'display', label: 'display', type: 'select', options: ['bar', 'circle'] },
      { key: 'showValue', label: 'showValue', type: 'select', options: ['percent', 'value', 'none'] },
      { key: 'color', label: 'color', type: 'select', options: ['gray', 'blue', 'green', 'amber', 'red', 'purple'] },
      { key: 'colorRules', label: 'colorRules', type: 'json' },
      { key: 'description', label: 'description', type: 'text' },
    ],
  },
  {
    type: 'pdf',
    icon: 'FileText',
    size: { w: 6, h: 60 },
    defaultProps: {},
    component: PdfWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'src', label: 'pdfSrc', type: 'text' },
      { key: 'page', label: 'pdfPage', type: 'text', numeric: true },
      { key: 'hideToolbar', label: 'hideToolbar', type: 'switch' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'json',
    icon: 'Braces',
    size: { w: 6, h: 30 },
    defaultProps: { title: 'JSON' },
    component: JsonWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'expandDepth', label: 'expandDepth', type: 'number' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'table',
    icon: 'Table',
    size: { w: 12, h: 35 },
    // New tables fit their width; a table without `fit` scrolls sideways (as before).
    defaultProps: { fit: 'truncate' },
    component: TableWidget,
    fields: [
      { key: 'data', label: 'data', type: 'data' },
      { key: 'columns', label: 'columns', type: 'json' },
      { key: 'fit', label: 'columnFit', type: 'select', options: ['scroll', 'wrap', 'truncate'] },
      { key: 'rowActions', label: 'rowActions', type: 'json' },
      { key: 'multiSelect', label: 'multiSelect', type: 'switch' },
      { key: 'bulkActions', label: 'bulkActions', type: 'json' },
      { key: 'searchable', label: 'searchable', type: 'switch' },
      { key: 'exportable', label: 'exportable', type: 'switch' },
      // Headers sort unless `sortable: false` (on the table, or on a column).
      { key: 'sortable', label: 'sortable', type: 'switch', default: true },
      { key: 'sortBy', label: 'sortBy', type: 'text', plain: true },
      { key: 'sortOrder', label: 'sortOrder', type: 'select', options: ['asc', 'desc'] },
      { key: 'pageSize', label: 'pageSize', type: 'number' },
      {
        key: 'pagination',
        label: 'pagination',
        type: 'select',
        options: ['client', 'server'],
      },
      {
        key: 'total',
        label: 'total',
        type: 'text',
        numeric: true,
      },
      { key: 'expandable', label: 'expandable', type: 'switch' },
      { key: 'detailFields', label: 'expandedFields', type: 'json' },
      { key: 'rowKey', label: 'rowKey', type: 'text', plain: true },
      { key: 'allowAdd', label: 'allowAdd', type: 'switch' },
      { key: 'allowDelete', label: 'allowDelete', type: 'switch' },
      { key: 'saveLabel', label: 'saveLabel', type: 'text' },
    ],
  },
  {
    type: 'chart',
    icon: 'ChartColumn',
    size: { w: 6, h: 28 },
    defaultProps: { chartType: 'bar' },
    component: ChartWidget,
    fields: [
      {
        key: 'chartType',
        label: 'chartType',
        type: 'select',
        options: ['bar', 'hbar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'funnel', 'heatmap'],
      },
      { key: 'title', label: 'title', type: 'text' },
      { key: 'data', label: 'data', type: 'data' },
      { key: 'xKey', label: 'xKey', type: 'text' },
      { key: 'yKey', label: 'yKey', type: 'text' },
      { key: 'labelKey', label: 'pointLabelKey', type: 'text' },
      { key: 'series', label: 'series', type: 'json' },
      { key: 'stacked', label: 'stacked', type: 'switch' },
      {
        key: 'format',
        label: 'format',
        type: 'select',
        options: ['number', 'currency', 'percent'],
      },
      { key: 'currency', label: 'currency', type: 'text' },
    ],
  },
  {
    type: 'runConsole',
    icon: 'Terminal',
    size: { w: 6, h: 28 },
    defaultProps: { runnable: '' },
    component: RunConsoleWidget,
    fields: [
      { key: 'runnable', label: 'runnable', type: 'text', plain: true },
      { key: 'title', label: 'title', type: 'text' },
    ],
  },
  {
    type: 'approvals',
    icon: 'ShieldCheck',
    size: { w: 6, h: 35 },
    defaultProps: {},
    component: ApprovalsWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'workflows', label: 'workflows', type: 'json' },
    ],
  },
  {
    type: 'runs',
    icon: 'History',
    size: { w: 6, h: 35 },
    defaultProps: {},
    component: RunsWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'workflows', label: 'workflows', type: 'json' },
      { key: 'statuses', label: 'runStatuses', type: 'json' },
      { key: 'limit', label: 'runLimit', type: 'number' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
      { key: 'hideCancel', label: 'hideCancel', type: 'switch' },
      { key: 'hideOpen', label: 'hideOpen', type: 'switch' },
    ],
  },
  {
    type: 'form',
    icon: 'ClipboardList',
    size: { w: 6, h: 42 },
    defaultProps: { fields: [], submitLabel: 'Submit' },
    component: FormWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'fields', label: 'fields', type: 'fields' },
      { key: 'submitLabel', label: 'submitLabel', type: 'text' },
      { key: 'resetLabel', label: 'resetLabel', type: 'text' },
    ],
  },
  {
    type: 'input',
    icon: 'TextCursorInput',
    size: { w: 4, h: 12 },
    defaultProps: { inputType: 'text', label: 'Label' },
    component: InputWidget,
    fields: [
      {
        key: 'inputType',
        label: 'inputType',
        type: 'select',
        options: ['text', 'number', 'textarea', 'date', 'file', 'email', 'password', 'phone', 'currency', 'time', 'datetime', 'code', 'richtext', 'slider', 'color'],
      },
      { key: 'min', label: 'slider_min', type: 'text', numeric: true, when: inputTypeIs('slider') },
      { key: 'max', label: 'slider_max', type: 'text', numeric: true, when: inputTypeIs('slider') },
      { key: 'step', label: 'slider_step', type: 'text', numeric: true, when: inputTypeIs('slider') },
      { key: 'range', label: 'sliderRange', type: 'switch', when: inputTypeIs('slider') },
      { key: 'unit', label: 'sliderUnit', type: 'text', when: inputTypeIs('slider') },
      { key: 'currency', label: 'currency', type: 'text', when: inputTypeIs('currency', 'slider') },
      { key: 'alpha', label: 'colorAlpha', type: 'switch', when: inputTypeIs('color') },
      { key: 'swatches', label: 'colorSwatches', type: 'json', when: inputTypeIs('color') },
      { key: 'language', label: 'codeLanguage', type: 'select', options: ['text', 'json', 'javascript', 'sql', 'python', 'yaml', 'html', 'css', 'markdown'], when: inputTypeIs('code') },
      { key: 'preview', label: 'codePreview', type: 'switch', when: inputTypeIs('code') },
      { key: 'previewHtml', label: 'codePreviewHtml', type: 'text', when: (p) => p.inputType === 'code' && p.preview === true },
      { key: 'variables', label: 'codeVariables', type: 'data', when: inputTypeIs('code') },
      { key: 'format', label: 'richTextFormat', type: 'select', options: ['html', 'markdown'], when: inputTypeIs('richtext') },
      { key: 'label', label: 'label', type: 'text' },
      { key: 'placeholder', label: 'placeholder', type: 'text' },
      { key: 'description', label: 'description', type: 'text' },
      { key: 'required', label: 'required', type: 'switch' },
      { key: 'default', label: 'default', type: 'text' },
    ],
  },
  {
    type: 'select',
    icon: 'ListFilter',
    size: { w: 4, h: 12 },
    defaultProps: { label: 'Label', options: ['Option 1', 'Option 2'] },
    component: SelectWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'options', label: 'options', type: 'json' },
      { key: 'multiple', label: 'multiple', type: 'switch' },
      { key: 'display', label: 'display', type: 'select', options: ['dropdown', 'list', 'buttons'] },
      { key: 'search', label: 'search', type: 'select', options: ['off', 'local', 'remote'] },
      { key: 'placeholder', label: 'placeholder', type: 'text' },
      { key: 'description', label: 'description', type: 'text' },
      { key: 'required', label: 'required', type: 'switch' },
      { key: 'default', label: 'default', type: 'text' },
    ],
  },
  {
    type: 'checkbox',
    icon: 'ToggleLeft',
    size: { w: 3, h: 6 },
    defaultProps: { label: 'Label' },
    component: CheckboxWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'description', label: 'description', type: 'text' },
      { key: 'default', label: 'default', type: 'text' },
      { key: 'display', label: 'display', type: 'select', options: ['switch', 'checkbox'] },
    ],
  },
  {
    type: 'dateRange',
    icon: 'CalendarRange',
    size: { w: 4, h: 10 },
    defaultProps: { label: 'Period', default: 'last7Days' },
    component: DateRangeWidget,
    fields: [
      { key: 'label', label: 'label', type: 'text' },
      { key: 'placeholder', label: 'placeholder', type: 'text' },
      { key: 'description', label: 'description', type: 'text' },
      { key: 'default', label: 'defaultRange', type: 'text' },
      { key: 'required', label: 'required', type: 'switch' },
      { key: 'hidePresets', label: 'hidePresets', type: 'switch' },
    ],
  },
  {
    type: 'alert',
    icon: 'MessageSquareWarning',
    size: { w: 12, h: 7 },
    defaultProps: { message: 'Message', variant: 'info' },
    component: AlertWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'message', label: 'message', type: 'textarea' },
      {
        key: 'variant',
        label: 'variant',
        type: 'select',
        options: ['info', 'success', 'warning', 'error'],
      },
      { key: 'visible', label: 'visible', type: 'text' },
    ],
  },
  {
    type: 'listView',
    icon: 'LayoutList',
    size: { w: 12, h: 40 },
    defaultProps: {},
    component: ListViewWidget,
    fields: [
      { key: 'data', label: 'data', type: 'data' },
      { key: 'itemName', label: 'itemName', type: 'text', plain: true },
      { key: 'indexName', label: 'indexName', type: 'text', plain: true },
      { key: 'itemKey', label: 'itemKey', type: 'text', plain: true },
      { key: 'itemsPerRow', label: 'itemsPerRow', type: 'number' },
      { key: 'emptyText', label: 'emptyText', type: 'text' },
    ],
  },
  {
    type: 'container',
    icon: 'SquareDashed',
    size: { w: 6, h: 28 },
    defaultProps: { title: 'Container' },
    component: ContainerWidget,
    fields: [
      { key: 'title', label: 'title', type: 'text' },
      { key: 'description', label: 'description', type: 'text' },
      { key: 'visible', label: 'visible', type: 'text' },
    ],
  },
  {
    type: 'tabs',
    icon: 'PanelsTopLeft',
    size: { w: 12, h: 35 },
    defaultProps: {
      tabs: [
        { id: 'tab1', label: 'Tab 1' },
        { id: 'tab2', label: 'Tab 2' },
      ],
    },
    component: TabsWidget,
    fields: [
      { key: 'tabs', label: 'tabs', type: 'tabs' },
      { key: 'display', label: 'display', type: 'select', options: ['tabs', 'steps', 'accordion'] },
      { key: 'defaultTab', label: 'defaultTab', type: 'text' },
      { key: 'backLabel', label: 'backLabel', type: 'text' },
      { key: 'nextLabel', label: 'nextLabel', type: 'text' },
      { key: 'finishLabel', label: 'finishLabel', type: 'text' },
      { key: 'visible', label: 'visible', type: 'text' },
    ],
  },
];

/**
 * A palette entry: a component type, or a preset of one — an existing type with other
 * defaults, for what people look for under its own name (a stepper or an accordion is
 * a tabs component shown another way). The palette item's `key` is what a drop names.
 */
export interface PaletteEntry {
  key: string;
  type: AppComponentType;
  icon: string;
  size: { w: number; h: number };
  defaultProps: Record<string, unknown>;
}

const PRESETS: PaletteEntry[] = [
  {
    key: 'spacer',
    type: 'divider',
    icon: 'Space',
    size: { w: 12, h: 4 },
    defaultProps: { lineStyle: 'none' },
  },
  {
    key: 'stepper',
    type: 'tabs',
    icon: 'Footprints',
    size: { w: 12, h: 45 },
    defaultProps: {
      display: 'steps',
      tabs: [
        { id: 'step1', label: 'Step 1' },
        { id: 'step2', label: 'Step 2' },
        { id: 'step3', label: 'Step 3' },
      ],
    },
  },
  {
    key: 'accordion',
    type: 'tabs',
    icon: 'ListCollapse',
    size: { w: 6, h: 45 },
    defaultProps: {
      display: 'accordion',
      tabs: [
        { id: 'section1', label: 'Section 1' },
        { id: 'section2', label: 'Section 2' },
        { id: 'section3', label: 'Section 3' },
      ],
    },
  },
];

// Each preset sits right after its type.
export const PALETTE: PaletteEntry[] = WIDGETS.flatMap((w) => [
  { key: w.type, type: w.type, icon: w.icon, size: w.size, defaultProps: w.defaultProps },
  ...PRESETS.filter((p) => p.type === w.type),
]);
export const PALETTE_BY_KEY = Object.fromEntries(PALETTE.map((p) => [p.key, p])) as Record<string, PaletteEntry>;

export const WIDGETS_BY_TYPE = Object.fromEntries(
  WIDGETS.map((w) => [w.type, w])
) as Record<AppComponentType, WidgetDefinition>;

/** How a component's grid cell is drawn: its own `frame`, else its type's default. */
export function frameOf(component: Pick<AppComponent, 'type' | 'frame'>): AppComponentFrame {
  return component.frame ?? WIDGETS_BY_TYPE[component.type]?.frame ?? 'card';
}
