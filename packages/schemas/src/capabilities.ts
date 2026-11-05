// --------------------------------------------------
// Capabilities: what a workflow can do outside the run itself
// --------------------------------------------------
//
// A label, not a sandbox: it's read from the saved steps, so a path built from an
// expression still counts, and nothing is blocked. It's shown on a workflow's
// Overview and before installing one from a hub.
//
// Review capabilities are the ones worth a second look before trusting someone
// else's workflow; the rest are listed but not highlighted.

export type Capability =
  | 'programs'
  | 'remote'
  | 'files.write'
  | 'addon'
  | 'network.send'
  | 'files.read'
  | 'script';

/** Display order: review ones first. */
export const CAPABILITIES: readonly Capability[] = [
  'programs',
  'remote',
  'files.write',
  'addon',
  'network.send',
  'files.read',
  'script',
];

export const REVIEW_CAPABILITIES: readonly Capability[] = [
  'programs',
  'remote',
  'files.write',
  'addon',
];

const READ: Capability[] = ['files.read'];
const WRITE: Capability[] = ['files.write'];
const SEND: Capability[] = ['network.send'];

// group → what its actions can do. `other` covers every action not listed under
// `actions` — `[]` for steps that only work on data. Every built-in group has an
// entry (a test checks), so a new group has to be classified.
export const CAPABILITY_RULES: Record<
  string,
  { other: Capability[]; actions?: Record<string, Capability[]> }
> = {
  ai: { other: SEND },
  api: { other: [], actions: { auth: SEND, request: SEND, load: SEND, invoke: SEND } },
  approval: { other: [] },
  array: { other: [] },
  audio: {
    other: [],
    actions: { load: READ, concatenate: READ, mixAudio: READ, export: WRITE },
  },
  browser: {
    other: [],
    actions: {
      launch: SEND,
      goTo: SEND,
      runLighthouseAudit: SEND,
      runJavaScript: ['script'],
      uploadFile: ['files.read', 'network.send'],
      downloadFile: WRITE,
      takeScreenshot: WRITE,
      takeScreenshotElement: WRITE,
      startScreencast: WRITE,
      generatePDF: WRITE,
      stopHarCapture: WRITE,
    },
  },
  compression: { other: WRITE },
  cryptography: {
    other: [],
    actions: {
      base64EncodeFile: READ,
      hashFile: READ,
      hmacFile: READ,
      base64DecodeToFile: WRITE,
      encryptToFile: WRITE,
      decryptToFile: WRITE,
    },
  },
  database: { other: [], actions: { connect: ['remote'], query: ['remote'] } },
  datetime: { other: [] },
  email: { other: SEND },
  file: {
    other: WRITE,
    actions: {
      fileExists: READ,
      read: READ,
      readCSV: READ,
      convertFileToBase64: READ,
      getFilePathPart: [],
    },
  },
  flow: { other: [] },
  folder: { other: WRITE, actions: { exists: READ, getFiles: READ, getSubfolders: READ } },
  html: { other: [] },
  http: { other: SEND, actions: { downloadFile: ['network.send', 'files.write'] } },
  image: { other: [], actions: { load: READ, composite: READ, toFile: WRITE } },
  math: { other: [] },
  network: { other: [] },
  object: { other: [] },
  ocr: { other: READ },
  pdf: {
    other: READ,
    actions: { extractImage: WRITE, merge: WRITE, splitPages: WRITE },
  },
  qrcode: { other: [], actions: { generate: WRITE, read: READ } },
  script: { other: ['script'] },
  spreadsheet: {
    other: [],
    actions: { open: READ, getSpreadsheetInfo: READ, create: WRITE, save: WRITE, delete: WRITE },
  },
  ssh: { other: [], actions: { connect: ['remote'], exec: ['remote'] } },
  string: { other: [] },
  // A sub-workflow adds what its own steps can do (see workflowCapabilities).
  subtask: { other: [] },
  system: { other: [], actions: { runApplication: ['programs'], terminateProcess: ['programs'] } },
  variable: { other: [] },
  video: {
    other: [],
    actions: {
      load: READ,
      replaceAudio: READ,
      addBackgroundMusic: READ,
      addOverlay: READ,
      addWatermark: READ,
      addSubtitles: READ,
      concatenateVideos: READ,
      export: WRITE,
      getThumbnail: WRITE,
      extractFrames: WRITE,
      extractAudio: WRITE,
      generateGif: WRITE,
    },
  },
  xml: { other: [] },
};

/**
 * What one step can do. A plugin step, or any group Tipeline doesn't ship, runs
 * add-on code: there's no way to know more from here.
 */
export function stepCapabilities(group: string, name: string, source?: string): Capability[] {
  const rule = source === 'plugin' ? undefined : CAPABILITY_RULES[group];
  if (!rule) return ['addon'];
  return rule.actions?.[name] ?? rule.other;
}

export interface CapabilityStep {
  /** `group.name` of the step. */
  action: string;
  /** The sub-workflow the step is in, by name; absent for the workflow's own steps. */
  workflow?: string;
}

export interface WorkflowCapability {
  capability: Capability;
  review: boolean;
  steps: CapabilityStep[];
}

export interface WorkflowCapabilities {
  capabilities: WorkflowCapability[];
  /** Sub-workflows that couldn't be looked at (not installed, or named by an expression or a file path). */
  unknownWorkflows: string[];
}

type LoadWorkflow = (
  identifier: string
) => Promise<{ name?: string; pipeline?: { actions?: any[] } } | null>;

/**
 * What a workflow can do, with the steps that cause each capability — its own
 * and those of the sub-workflows it runs, all the way down. Disabled steps don't
 * count. `loadWorkflow` returns an installed workflow's source by identifier.
 */
export async function workflowCapabilities(
  source: { pipeline?: { actions?: any[] } } | null | undefined,
  loadWorkflow: LoadWorkflow
): Promise<WorkflowCapabilities> {
  const found = new Map<Capability, CapabilityStep[]>();
  const unknown = new Set<string>();
  const visited = new Set<string>();

  const walk = async (list: any[], workflow?: string) => {
    for (const action of list ?? []) {
      if (!action?.group || !action?.name || action.disabled) continue;
      const step: CapabilityStep = {
        action: `${action.group}.${action.name}`,
        ...(workflow ? { workflow } : {}),
      };
      for (const capability of stepCapabilities(action.group, action.name, action.source)) {
        if (!found.has(capability)) found.set(capability, []);
        found.get(capability)!.push(step);
      }
      if (action.group === 'subtask' && action.name === 'exec' && action.source !== 'plugin') {
        await visit(action.params ?? {});
      }
      if (Array.isArray(action.params?.actions)) await walk(action.params.actions, workflow);
      if (Array.isArray(action.params?.statements)) {
        for (const statement of action.params.statements) {
          if (Array.isArray(statement?.actions)) await walk(statement.actions, workflow);
        }
      }
    }
  };

  const visit = async (params: { identifier?: unknown; path?: unknown }) => {
    const identifier = typeof params.identifier === 'string' ? params.identifier.trim() : '';
    if (!identifier || /\{\{|\{=/.test(identifier)) {
      const named = identifier || (typeof params.path === 'string' ? params.path : '');
      if (named) unknown.add(named);
      return;
    }
    if (visited.has(identifier)) return;
    visited.add(identifier);
    const child = await loadWorkflow(identifier).catch(() => null);
    if (!child) {
      unknown.add(identifier);
      return;
    }
    await walk(child.pipeline?.actions ?? [], child.name || identifier);
  };

  await walk(source?.pipeline?.actions ?? []);

  return {
    capabilities: CAPABILITIES.filter((capability) => found.has(capability)).map((capability) => ({
      capability,
      review: REVIEW_CAPABILITIES.includes(capability),
      steps: found.get(capability)!,
    })),
    unknownWorkflows: [...unknown],
  };
}
