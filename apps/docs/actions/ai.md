<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# AI Actions

## General

### `prompt`

Sends a prompt to an AI provider and returns the generated response text.

Supported providers: `deepseek`, `openai`, `anthropic`.
`frequencyPenalty` and `presencePenalty` are only supported by OpenAI and DeepSeek.

**Returns:** The AI-generated response text.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `provider` | `deepseek` \| `openai` \| `anthropic` | ✓ | — | AI provider to use (deepseek, openai, or anthropic). |
| `apiKey` | string | ✓ | — | API key for the selected provider. |
| `prompt` | string | ✓ | — | The user prompt to send to the AI model. |
| `model` | string |  | — | Model identifier (e.g. gpt-4o, claude-3-5-sonnet). Defaults to provider default. |
| `systemMessage` | string |  | — | Optional system/instruction message to set model behavior. |
| `temperature` | number |  | — | Sampling temperature (0–2). Higher values produce more random output. |
| `maxTokens` | number |  | — | Maximum number of tokens to generate (1–100000). |
| `topP` | number |  | — | Nucleus sampling cutoff (0–1). Alternative to temperature. |
| `stream` | boolean |  | — | Whether to stream the response token by token. |
| `frequencyPenalty` | number |  | — | Penalty for token frequency (-2 to 2). Reduces repetition. |
| `presencePenalty` | number |  | — | Penalty for token presence (-2 to 2). Encourages new topics. |

```yaml
# Summarize a document with DeepSeek using a system message and moderate temperature
- group: ai
  name: prompt
  params:
    provider: deepseek
    apiKey: '{{ deepseekKey }}'
    prompt: 'Summarize the following document: {{ documentText }}'
    systemMessage: 'You are a concise technical writer. Return plain text only.'
    temperature: 0.5
    maxTokens: 300
```
