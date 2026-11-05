// registry.ts
import * as aiGroup from './actions/ai';
import * as apiGroup from './actions/api';
import * as approvalGroup from './actions/approval';
import * as arrayGroup from './actions/array';
import * as audioGroup from './actions/audio';
import * as browserGroup from './actions/browser';
import * as compressionGroup from './actions/compression';
import * as cryptographyGroup from './actions/cryptography';
import * as databaseGroup from './actions/database';
import * as datetimeGroup from './actions/datetime';
import * as emailGroup from './actions/email';
import * as fileGroup from './actions/file';
import * as flowGroup from './actions/flow';
import * as folderGroup from './actions/folder';
import * as htmlGroup from './actions/html';
import * as httpGroup from './actions/http';
import * as imageGroup from './actions/image';
import * as mathGroup from './actions/math';
import * as networkGroup from './actions/network';
import * as objectGroup from './actions/object';
import * as ocrGroup from './actions/ocr';
import * as pdfGroup from './actions/pdf';
import * as qrcodeGroup from './actions/qrcode';
import * as scriptGroup from './actions/script';
import * as sshGroup from './actions/ssh';
import * as spreadsheetGroup from './actions/spreadsheet';
import * as stringGroup from './actions/string';
import * as subtaskGroup from './actions/subtask';
import * as systemGroup from './actions/system';
import * as variableGroup from './actions/variable';
import * as videoGroup from './actions/video';
import * as xmlGroup from './actions/xml';
// ------
import * as variableObject from './Variable';
import * as varObject from './Var';
import * as taskObject from './Task';
import * as appObject from './App';
export type {
  AppSource,
  AppPage,
  AppComponent,
  AppComponentParent,
  AppComponentFrame,
  AppComponentType,
  AppRunnable,
  AppAction,
  AppFormField,
  AppTab,
} from './App';
import * as hubObject from './Hub';

const registry = {
  ai: aiGroup,
  api: apiGroup,
  approval: approvalGroup,
  array: arrayGroup,
  audio: audioGroup,
  browser: browserGroup,
  compression: compressionGroup,
  cryptography: cryptographyGroup,
  database: databaseGroup,
  datetime: datetimeGroup,
  email: emailGroup,
  file: fileGroup,
  flow: flowGroup,
  folder: folderGroup,
  html: htmlGroup,
  http: httpGroup,
  image: imageGroup,
  math: mathGroup,
  network: networkGroup,
  object: objectGroup,
  ocr: ocrGroup,
  pdf: pdfGroup,
  qrcode: qrcodeGroup,
  script: scriptGroup,
  ssh: sshGroup,
  spreadsheet: spreadsheetGroup,
  string: stringGroup,
  subtask: subtaskGroup,
  system: systemGroup,
  variable: variableGroup,
  video: videoGroup,
  xml: xmlGroup,
} as const;

// Separate registry for core validations
export { parseApprovalTimeout } from './actions/approval';
export {
  isCacheableAction,
  isCacheableCall,
  parseTtl,
  uncacheableSteps,
  stepCacheSchema,
  workflowCacheSchema,
  MAX_CACHE_TTL_SECONDS,
} from './cache';
export type { StepCacheConfig, WorkflowCacheConfig, CacheMode } from './cache';
export {
  CAPABILITIES,
  REVIEW_CAPABILITIES,
  CAPABILITY_RULES,
  stepCapabilities,
  workflowCapabilities,
} from './capabilities';
export type { Capability, CapabilityStep, WorkflowCapability, WorkflowCapabilities } from './capabilities';

export const coreValidations = {
  variableObject: variableObject,
  varObject: varObject,
  taskObject: taskObject,
  appObject: appObject,
  hubObject: hubObject,
} as const;

type Group = keyof typeof registry;
type Name<G extends Group> = keyof (typeof registry)[G];

// ------------------------------------------------------------
// VALIDATION EXPORTS
// ------------------------------------------------------------

export function getGroupMeta<G extends Group>(group: G) {
  const groupModule = registry[group];

  if (!groupModule || typeof groupModule !== 'object') {
    throw new Error(`Group "${group}" not found`);
  }

  if ('meta' in groupModule) {
    return (groupModule as any).meta;
  }

  throw new Error(`Meta not found in group "${group}"`);
}

/**
 * Get validation schema for a specific action
 * @param group - The group name (e.g., 'math', 'string')
 * @param action - The action name (e.g., 'add', 'concat')
 * @param type - The validation type ('runtime' or 'creation')
 * @returns The validation object with schema, meta, and methods
 */
export function getValidation<G extends Group>(
  group: G,
  action: string,
  type: 'runtime' | 'creation' = 'runtime'
) {
  const groupModule = registry[group];

  if (!groupModule || typeof groupModule !== 'object') {
    throw new Error(`Group "${group}" not found`);
  }

  // Handle the new validation structure
  if ('validations' in groupModule) {
    const validations = (groupModule as any).validations;
    if (validations && validations[action]) {
      return validations[action][type];
    }
  }

  throw new Error(`Action "${action}" not found in group "${group}"`);
}

/**
 * Get all validations for a specific group
 * @param group - The group name
 * @returns Object containing all validations for the group
 */
export function getGroupValidations<G extends Group>(group: G) {
  const groupModule = registry[group];

  if (!groupModule || typeof groupModule !== 'object') {
    return {};
  }

  // Handle new validation structure
  if ('validations' in groupModule) {
    return (groupModule as any).validations;
  }
}

/**
 * Get all validations across all groups
 * @returns Nested object with all validations organized by group and action
 */
export function getAllValidations() {
  const groups = getAvailableGroups();
  const allValidations: Record<string, any> = {};

  for (const group of groups) {
    allValidations[group] = getGroupValidations(group as Group);
  }

  return allValidations;
}

/**
 * Export validations as a flat structure for easier access
 * @returns Flat object with keys as "group.action" and values as validation objects
 */
export function getFlatValidations() {
  const groups = getAvailableGroups();
  const flatValidations: Record<string, any> = {};

  for (const group of groups) {
    const groupValidations = getGroupValidations(group as Group);

    for (const [action, validation] of Object.entries(groupValidations)) {
      flatValidations[`${group}.${action}`] = validation;
    }
  }

  return flatValidations;
}

// ------------------------------------------------------------
// EXISTING FUNCTIONS (Updated)
// ------------------------------------------------------------

export function getValidationSync<G extends Group, N extends Name<G>>(group: G, name: N) {
  return registry[group][name];
}

export function getGroupActions<G extends Group>(group: G): string[] {
  const groupModule = registry[group];

  if (groupModule && typeof groupModule === 'object') {
    // Check new structure
    if ('validations' in groupModule) {
      const validations = (groupModule as any).validations;
      return Object.keys(validations);
    }
  }

  return [];
}

export function getAvailableGroups(): string[] {
  return Object.keys(registry);
}

export function getGroupActionsMap(): Record<string, string[]> {
  const groups = getAvailableGroups();
  const map: Record<string, string[]> = {};

  for (const group of groups) {
    map[group] = getGroupActions(group as Group);
  }

  return map;
}

// ------------------------------------------------------------
// DIRECT EXPORTS FOR COMMON USE CASES
// ------------------------------------------------------------

// Export pre-built validation collections for direct import
export const validations = {
  ai: aiGroup.validations,
  api: apiGroup.validations,
  approval: approvalGroup.validations,
  array: arrayGroup.validations,
  audio: audioGroup.validations,
  browser: browserGroup.validations,
  compression: compressionGroup.validations,
  cryptography: cryptographyGroup.validations,
  database: databaseGroup.validations,
  datetime: datetimeGroup.validations,
  email: emailGroup.validations,
  file: fileGroup.validations,
  flow: flowGroup.validations,
  folder: folderGroup.validations,
  html: htmlGroup.validations,
  http: httpGroup.validations,
  image: imageGroup.validations,
  math: mathGroup.validations,
  network: networkGroup.validations,
  object: objectGroup.validations,
  ocr: ocrGroup.validations,
  pdf: pdfGroup.validations,
  qrcode: qrcodeGroup.validations,
  script: scriptGroup.validations,
  ssh: sshGroup.validations,
  spreadsheet: spreadsheetGroup.validations,
  string: stringGroup.validations,
  subtask: subtaskGroup.validations,
  system: systemGroup.validations,
  variable: variableGroup.validations,
  video: videoGroup.validations,
  xml: xmlGroup.validations,
};
export const flatValidations = getFlatValidations();

export { taskSchema, actionShapeSchema } from './Task';
export { hubSchema, hubCreationSchema, hubUpdateSchema } from './Hub';
export { projectSchema, projectCreationSchema, projectUpdateSchema } from './Project';
export { tagLabelSchema, tagCreationSchema, tagRenameSchema, normalizeTagLabel, normalizeTagLabels } from './Tag';
export { FormFieldConfig, NON_EDITABLE_FIELD_TYPES, createFormSchema, createFieldConfig, processFormData, isExternallySourced } from './Form';
export { buildPluginSchema } from './plugin/buildPluginSchema';
