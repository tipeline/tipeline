import type { Component } from 'vue';
import {
  Code,
  FilePen,
  FileText,
  Globe,
  Package,
  Server,
  Terminal,
} from 'lucide-vue-next';
import type { Capability } from '@tipeline/schemas';

/** Mirrors CapabilityReport in apps/core/src/engine/WorkflowCapabilities.ts. */
export interface CapabilityStep {
  action: string;
  label: string;
  workflow?: string;
}
export interface WorkflowCapability {
  capability: Capability;
  review: boolean;
  steps: CapabilityStep[];
}
export interface CapabilityReport {
  capabilities: WorkflowCapability[];
  unknownWorkflows: string[];
}

export const CAPABILITY_ICON: Record<Capability, Component> = {
  programs: Terminal,
  remote: Server,
  'files.write': FilePen,
  addon: Package,
  'network.send': Globe,
  'files.read': FileText,
  script: Code,
};

/** The i18n key under `capabilities.label` / `capabilities.can` ('files.write' → 'filesWrite'). */
export const capabilityKey = (capability: Capability) =>
  capability.replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase());

/** "Remove, SSH exec (in Upload to NAS)": each distinct step once, in order. */
export function stepNames(
  steps: CapabilityStep[],
  inWorkflow: (workflow: string) => string
): string {
  const names = steps.map((step) =>
    step.workflow ? `${step.label} (${inWorkflow(step.workflow)})` : step.label
  );
  return [...new Set(names)].join(', ');
}
