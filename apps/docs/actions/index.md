# Actions Overview

Tipeline ships with **30 action categories** covering automation, data manipulation, file handling, integrations, and flow control. Each action is identified by a `group` and a `name`.

## Action Anatomy

Every action in a workflow YAML has the same structure:

```yaml
- group: string       # action category (e.g. browser, string, http)
  name: string        # specific action within the group (e.g. goTo, replace, request)
  params:             # action-specific parameters
    key: value
  destination: string # optional — variable name to store the result
  onError: throw      # 'throw' (default) | 'continue'
  disabled: false     # set to true to skip this action
```

## Action Categories

### Automation

| Category | Actions | Description |
|----------|---------|-------------|
| [Browser](/actions/browser) | 56 | Full browser automation via Playwright |
| [HTTP](/actions/http) | 2 | HTTP/HTTPS requests via Axios |
| [SSH](/actions/ssh) | 3 | Remote command execution over SSH |
| [Script](/actions/script) | 1 | Execute arbitrary shell scripts |
| [Sub-workflow](/actions/subtask) | 1 | Invoke another workflow as a sub-pipeline |

### Data Manipulation

| Category | Actions | Description |
|----------|---------|-------------|
| [String](/actions/string) | 35 | Case conversion, search, replace, templates, URL encoding |
| [Array](/actions/array) | 20 | Parse, join, filter, sort, chunk, flatten, set operations |
| [Object](/actions/object) | 12 | Get/set properties, merge, pick, omit, clone |
| [Math](/actions/math) | 25 | Arithmetic, rounding, statistics, random, range |
| [DateTime](/actions/datetime) | 15 | Parse, format, add/subtract, compare, validate |
| [Spreadsheet](/actions/spreadsheet) | 36 | Excel/CSV read, write, formulas, ranges, sheets |
| [HTML](/actions/html) | 10 | Query, extract, parse HTML documents |
| [Variable](/actions/variable) | 1 | Set a pipeline variable programmatically |

### File & Media

| Category | Actions | Description |
|----------|---------|-------------|
| [File](/actions/file) | 12 | Read, write, copy, move, CSV, base64 |
| [Folder](/actions/folder) | 9 | Create, delete, copy, list files |
| [Image](/actions/image) | 18 | Resize, rotate, crop, filters, format conversion |
| [Audio](/actions/audio) | 15 | Convert, trim, mix, compress, normalize |
| [Video](/actions/video) | 24 | Trim, resize, convert, watermark, subtitles, GIF |
| [PDF](/actions/pdf) | 5 | Extract text/images, merge, split, page count |
| [Compression](/actions/compression) | 2 | Create and extract zip/tar archives |
| [OCR](/actions/ocr) | 1 | Optical character recognition |
| [QR Code](/actions/qrcode) | 2 | Generate and read QR codes |

### Integrations

| Category | Actions | Description |
|----------|---------|-------------|
| [AI](/actions/ai) | 1 | LLM prompts — OpenAI, Anthropic, DeepSeek |
| [Email](/actions/email) | 1 | Send email via SMTP |
| [Database](/actions/database) | 3 | Connect, query, and close SQL databases |
| [Network](/actions/network) | 6 | DNS, ping, port check, TLS certificate |
| [Cryptography](/actions/cryptography) | 12 | Hash, HMAC, encrypt, base64 |

### Flow Control

| Category | Actions | Description |
|----------|---------|-------------|
| [Flow](/actions/flow) | 8 | If/else, switch, loops, wait |
| [Approval](/actions/approval) | 1 | Pause a run until someone approves or rejects it |
| [System](/actions/system) | 6 | Log messages, run processes, env vars |
| [API](/actions/api) | — | Generic API integration |

## Parameter Templates

Action parameters support two template syntaxes:

```yaml
# String interpolation (result is always a string)
message: "Hello, {{ username }}!"
url: "{{ baseUrl }}/api/{{ version }}/users"

# Raw injection (preserves original type)
data: "{= parsedObject =}"
browser: "{= browserHandle =}"
count: "{= itemCount =}"
```

See the [Variable System](/internals/variable-system) for full details.

## Error Handling

```yaml
- group: http
  name: request
  params:
    url: "{{ url }}"
  onError: continue  # go on even if the request fails
  destination: response
```

| Value | Behaviour |
|-------|----------|
| `throw` | Stop the run and mark it failed (default) |
| `continue` | Ignore the error and go on to the next step; the step's result is empty |
