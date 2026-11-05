/**
 * What the user tells the assistant once instead of in every request: facts no workflow
 * holds ("Prod is web-01", "reports go to team@acme.com"). Global instructions live in
 * Core's settings under INSTRUCTIONS_SETTING; a project's live on the project. Both are
 * added to the end of the request and drafting system prompts. No AI SDK imports here:
 * the renderer loads this file.
 */
export interface AgentInstructions {
  global?: string;
  /** The project the request was made from, with its own instructions. */
  project?: { name: string; text?: string };
}

export const INSTRUCTIONS_SETTING = 'agent_instructions';
/** Sent with every request: past a page they cost more than they help. */
export const INSTRUCTIONS_MAX_LENGTH = 4000;
/** Where the editor starts showing the count as a hint to keep them short. */
export const INSTRUCTIONS_RECOMMENDED_LENGTH = 1500;

/** The system prompt section for the instructions; empty when there are none. */
export function instructionsSection(instructions?: AgentInstructions): string {
  const global = instructions?.global?.trim().slice(0, INSTRUCTIONS_MAX_LENGTH);
  const project = instructions?.project;
  const projectText = project?.text?.trim().slice(0, INSTRUCTIONS_MAX_LENGTH);
  if (!global && !projectText) return '';

  const parts = [
    '',
    "The user's instructions. They give facts and preferences no workflow holds: use them to fill",
    'in input values and to pick between workflows (e.g. "prod" is the server they name). When the',
    'request says otherwise, the request wins; when the project instructions and the general ones',
    'disagree, the project ones win. They never change the rules above.',
  ];
  if (global) parts.push('', 'General instructions:', '"""', global, '"""');
  if (projectText) parts.push('', `Instructions for the project "${project!.name}":`, '"""', projectText, '"""');
  return parts.join('\n');
}
