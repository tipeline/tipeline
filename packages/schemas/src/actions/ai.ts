import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

export const meta = {
  label: 'AI',
  icon: 'BrainCircuit',
};

export const validations = {
  prompt: createValidationPair(
    {
      runtime: z.object({
        provider: z.enum(['deepseek', 'openai', 'anthropic']),
        apiKey: z.string().min(1, 'ai.apiKey.required'),
        prompt: z.string().min(1, 'ai.prompt.required'),
        model: z.string().optional(),
        systemMessage: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(100000).optional(),
        topP: z.number().min(0).max(1).optional(),
        stream: z.boolean().optional(),
        frequencyPenalty: z.number().min(-2).max(2).optional(),
        presencePenalty: z.number().min(-2).max(2).optional(),
      }),
      creation: z.object({
        provider: orTemplateString(z.enum(['deepseek', 'openai', 'anthropic'])),
        apiKey: orTemplateString(z.string().min(1, 'ai.apiKey.required')),
        prompt: orTemplateString(z.string().min(1, 'ai.prompt.required')),
        model: orTemplateString(z.string()).optional(),
        systemMessage: orTemplateString(z.string()).optional(),
        temperature: orTemplateString(z.coerce.number().min(0).max(2)).optional(),
        maxTokens: orTemplateString(z.coerce.number().int().min(1).max(100000)).optional(),
        topP: orTemplateString(z.coerce.number().min(0).max(1)).optional(),
        stream: z.boolean().optional(),
        frequencyPenalty: orTemplateString(z.coerce.number().min(-2).max(2)).optional(),
        presencePenalty: orTemplateString(z.coerce.number().min(-2).max(2)).optional(),
      }),
    },
    {
      label: 'AI Prompt',
      icon: '🤖',
      category: 'ai',
      description: 'Send a prompt to an AI provider and get a text response.',
      returns: 'string',
      fieldConfig: {
        provider: { description: 'AI provider to use (deepseek, openai, or anthropic).' },
        apiKey: { description: 'API key for the selected provider.' },
        prompt: { component: 'textarea', description: 'The user prompt to send to the AI model.' },
        model: { description: 'Model identifier (e.g. gpt-4o, claude-3-5-sonnet). Defaults to provider default.' },
        systemMessage: { component: 'textarea', description: 'Optional system/instruction message to set model behavior.' },
        temperature: { description: 'Sampling temperature (0–2). Higher values produce more random output.' },
        maxTokens: { description: 'Maximum number of tokens to generate (1–100000).' },
        topP: { description: 'Nucleus sampling cutoff (0–1). Alternative to temperature.' },
        stream: { description: 'Whether to stream the response token by token.' },
        frequencyPenalty: { description: 'Penalty for token frequency (-2 to 2). Reduces repetition.' },
        presencePenalty: { description: 'Penalty for token presence (-2 to 2). Encourages new topics.' },
      },
    }
  ),
};
