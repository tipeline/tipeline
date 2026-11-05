# Assistant in the Terminal

`tipeline assistant prompt` (or `tipeline agent prompt`) does what the Desktop
[assistant](/assistant/) does, from a terminal or a script: it finds the workflow, fills in
what it can from your request, asks for the rest, and runs it once you confirm.

```bash
tipeline assistant prompt "give me the sales report for April"
#   Monthly sales report  sales-report
#   Month              2026-04-01  from your request
#   Format             needed
#   Format: pdf
#   Run "Monthly sales report"? [Y/n]
```

- When several workflows fit, it lists them and asks you to pick a number. Your pick is
  remembered, and shared with the Desktop app.
- A workflow from a hub is installed first, after you confirm.
- When nothing fits, it shows the workflow it would draft and asks whether to draft it. The
  draft is saved for you to test in the Desktop builder; it isn't run.
- When you say how often (*"run the random numbers every 40 seconds"*), it shows the timing
  under **Runs on its own** and asks `Create this schedule for "Random Numbers"? [Y/n]`
  instead of running it. The values you give are used for every scheduled run. For a
  workflow it drafts, the timing becomes the draft's proposed schedule, which you turn on
  when you mark the draft ready in the Desktop app. See [Schedules](/assistant/#schedules).
- A question it can answer without running anything is answered directly.

## Options

| Option | Description |
|--------|-------------|
| `-y, --yes` | Run, create the schedule, install from a hub, or draft without asking for confirmation. Still asks for missing values. |
| `-p, --project <name>` | Also follow this project's [instructions](/assistant/instructions), on top of the global ones. Its name or identifier. |

## In scripts and CI

Without a terminal to ask in, it stops — and runs nothing — when a required value is
missing, when it would have to ask which workflow you mean, or when it would have to install
or draft something without `--yes`.

| Exit code | Meaning |
|-----------|---------|
| `0` | The run finished, the schedule was created, the question was answered, or you chose not to run |
| `1` | The run failed or was canceled, a value was missing, or something went wrong (no API key, Core not running, …) |
| `2` | The run paused, waiting for an approval |

## Configuration

By default the CLI uses what's set in the Desktop app under **Settings → Assistant** — it's
the same Core and the same settings. Environment variables override them:

| Variable | Overrides |
|----------|-----------|
| `TIPELINE_AGENT_PROVIDER` | Provider: `anthropic`, `deepseek`, `gemini` or `openai` |
| `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | That provider's API key |
| `TIPELINE_AGENT_MODEL` | Model name |
| `TIPELINE_AGENT_BASE_URL` | Base URL, for an OpenAI-compatible proxy |
| `TIPELINE_MCP_URL` | Core's MCP address (default `http://127.0.0.1:4002/mcp`) |
| `TIPELINE_MCP_TOKEN` | Token for that MCP server (default: Core's own API token) |

::: warning Set the provider together with its key
An API key variable is only read for the provider named in `TIPELINE_AGENT_PROVIDER`, or for
DeepSeek when that isn't set. To use a key from the environment, set both:

```bash
export TIPELINE_AGENT_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
```
:::
