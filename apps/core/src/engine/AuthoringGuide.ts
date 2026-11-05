/**
 * How to write a Tipeline workflow, for the assistant when it drafts one. Served
 * by the MCP tool `authoring_guide`. The examples are checked by a test against
 * the same validator a draft goes through, so they can't drift from the schemas.
 */

export const GUIDE_EXAMPLES: Array<{ title: string; yaml: string }> = [
  {
    title: 'The whole workflow for "convert Hello world to uppercase": one input, one step, one output',
    yaml: `version: 1.0.0
name: Uppercase Text
description: Converts text to upper case.
author: Tipeline Assistant
tags: [text]
pipeline:
  variables:
    - type: string
      name: text
      label: Text
      description: The text to convert, e.g. Hello world
      required: true
      value: Hello world
      visibility: public
    - type: string
      name: result
      label: Result
      description: The text in upper case.
      value: ''
      visibility: public
      output: true
  actions:
    - group: string
      name: toUpperCase
      params:
        string: '{{ text }}'
      destination: result
`,
  },
  {
    title: 'Inputs, steps that store results, and an output',
    yaml: `version: 1.0.0
name: Order Total
description: Works out an order's total with tax.
author: Tipeline Assistant
tags: [orders]
pipeline:
  variables:
    - type: number
      name: subtotal
      label: Subtotal
      description: Order amount before tax
      required: true
      value: 0
      visibility: public
    - type: number
      name: taxRate
      label: Tax rate (%)
      description: Percentage added as tax
      value: 21
      visibility: public
    - type: number
      name: tax
      value: 0
      visibility: private
    - type: number
      name: total
      label: Total
      description: Order total with tax, in the order's currency.
      value: 0
      visibility: public
      output: true
  actions:
    - group: math
      name: multiply
      label: Tax before dividing
      params:
        multiplier: '{= subtotal =}'
        multiplicand: '{= taxRate =}'
      destination: tax
    - group: math
      name: divide
      label: Tax amount
      params:
        dividend: '{= tax =}'
        divisor: 100
      destination: tax
    - group: math
      name: add
      label: Total with tax
      params:
        augend: '{= subtotal =}'
        addend: '{= tax =}'
      destination: total
    - group: system
      name: message
      params:
        text: 'Total with tax: {{ total }}'
`,
  },
  {
    title: 'A loop with a condition inside it',
    yaml: `version: 1.0.0
name: Large Orders
description: Lists the orders above an amount.
author: Tipeline Assistant
tags: [orders]
pipeline:
  variables:
    - type: array
      name: orders
      label: Orders
      description: 'Orders as a list of { id, amount }'
      required: true
      value: []
      visibility: public
    - type: number
      name: threshold
      label: Minimum amount
      value: 100
      visibility: public
    - type: object
      name: order
      value: {}
      visibility: private
    - type: array
      name: large
      label: Large orders
      description: 'The orders above the minimum amount, as { id, amount }.'
      value: []
      visibility: public
      output: true
  actions:
    - group: flow
      name: forEachLoop
      params:
        iterable: '{= orders =}'
        currentItem: order
        actions:
          - group: flow
            name: ifConditional
            params:
              firstOperand: '{= order.amount =}'
              compareAs: number
              operator: gt
              secondOperand: '{= threshold =}'
              actions:
                - group: array
                  name: push
                  params:
                    array: '{= large =}'
                    value: '{= order =}'
                  destination: large
`,
  },
];

export const AUTHORING_GUIDE = `# Writing a Tipeline workflow

A workflow is YAML with these top-level keys, all required except tags:
version (e.g. 1.0.0), name, description (Markdown; the first sentence is the summary),
author, tags (a list), pipeline (variables and actions).
The description says what the workflow does with its inputs, never their default values:
whoever searches for a workflow reads it, and a default named there looks fixed.

## Variables (pipeline.variables)
Every value a step reads or writes is a declared variable:
- type: string, number, boolean, date, array or object for plain values; browser,
  sshConnection, dbConnection, workbook, oauthToken, image, audio or video for what
  actions open or load (a browser from browser.launch, a connection from ssh.connect).
- A step's destination must have the type in the action's "returns" from describe_actions:
  browser.launch returns browser, so its destination is declared with type: browser.
  When "returns" is any or missing, pick the type that fits the value.
- name: letters, digits and underscores; no spaces.
- value: the starting value. Use '' for text, 0 for numbers, [] for lists, {} for objects.
  Leave value out for the opened or loaded types: a step fills them in.
- visibility: always set it.
  - public: an input the user fills in before a run, or an output they see after it.
    Give inputs a label and a description that says what to enter, with an example.
    Mark inputs the workflow can't run without as required: true.
  - protected: a setting kept off the user's run form that other workflows, apps and the
    assistant may still set or read.
  - private: working values only the workflow uses.
- Outputs are public or protected variables that steps write to, marked output: true so nobody is asked
  to fill them in. Give each a label and a description of what the value is, with its unit
  if it has one ("Total with tax, in euros"): whoever reads the result sees them.
  Never mark an output required.

## Steps (pipeline.actions)
Each step is { group, name, params, destination?, label? }:
- group.name must be an action from list_actions; read its fields with describe_actions first.
- params holds the action's fields. Fill every required field.
- destination is the name of a declared variable that receives the step's result.
- label is a short name for the step, shown in the builder.

## Using variables in fields
- '{{ name }}' inserts a variable into text: 'Hello {{ person }}', '{{ baseUrl }}/users'.
- '{= name =}' passes a variable's value as it is: numbers, booleans, lists, objects,
  connections. Use it whenever a field expects anything other than text, and the field
  must contain only that token.
- Dots read inside objects: '{{ order.id }}', '{= response.data =}'.
- Quote any value that starts with { in YAML.

## Loops and conditions (group flow)
- Steps run inside another step go under its params.actions.
- forEachLoop: iterable '{= list =}', currentItem names a declared variable that holds
  each item; its params.actions run once per item.
- ifConditional: firstOperand, compareAs (string, number, date, boolean, array, object),
  operator (eq, neq, gt, lt, contains, empty, ...), secondOperand, and params.actions.
  elseIfConditional (same fields) and elseConditional (only params.actions) must come
  right after an ifConditional or elseIfConditional at the same level, as steps of their
  own: never as a key of the ifConditional.
- Steps inside a branch or loop run one after another and see what the steps before them set.

## Reusing workflows the user already has
When search_workflows finds an installed workflow that does part of the request, run it as
a step instead of rebuilding it from actions. Use only workflows without a \`hub\` field.
Workflows marked helper: true are made for this: they fetch data or look something up for
other workflows. Leave helper out of the workflow you write: people run it themselves.
\`\`\`yaml
- group: subtask
  name: exec
  label: Get PHP version
  params:
    identifier: get-php-version   # the identifier from search_workflows
    props:                        # its inputs, keyed by input name
      server: '{{ server }}'
    outputs:                      # this workflow's variable: the other workflow's output
      phpVersion: version
\`\`\`
- props sets the other workflow's inputs: only names from its inputs. Set every required
  input that has no default: from a fixed value, an input of this workflow, or an output of
  an earlier step.
- Match each input's type: '{{ name }}' for text inputs, '{= name =}' to pass a number,
  true/false, list or object as it is. Read a value into a variable of the same type.
- outputs reads values back once it finishes. Each key is a variable you declare in this
  workflow (usually private), each value is one of the other workflow's outputs.
- Steps after it use those variables as usual: 'PHP {{ phpVersion }}'.
- Several workflows chain the same way: read one's outputs, pass them as the next one's props.

## File paths
'~/Documents/report.txt' means the user's home folder. Use a path starting with ~/ or /,
never a relative one: a relative path depends on where Tipeline Core happens to run.

## Credentials and secrets
Never write a password, API key or token into a workflow. Read it from a global
variable: '{= _global.SERVICE_API_KEY =}' (or '{{ _global.NAME }}' inside text), and add
"Create the global variable SERVICE_API_KEY on the Variables page" to the to-do list.
check_workflow warns about a global that doesn't exist yet: with that to-do it's fine, the
warning stays until someone creates it. A run stops at the first step that reads a missing one.
Environment values are '{{ _env.NAME }}'.

## Units
http.request's timeout is in milliseconds: 5 seconds is 5000. Name a variable
for what it holds: timeoutMs. Check a field's description in describe_actions before filling
in a number with a unit.

## Do only what was asked
Write the smallest workflow that does exactly what the request says.
- The values in the request become inputs, with those values as defaults.
- What the request asks to do stays fixed. "To uppercase" is one toUpperCase step: don't
  add a choice of cases, a switch, extra outputs or checks nobody asked for.
- When one action does the job, the workflow has one step (see the first example).
- Use built-in actions over scripts. Use script.runScript only when no action does the work.
  A script is plain JavaScript in a sandbox: no require or import (no fs, path, os), no process,
  no files, network or timers, and it only sees the values passed in its context. Read, list,
  rename or move files with the file and folder actions, and run commands with
  system.runApplication; a script only computes values from what earlier steps found.

${GUIDE_EXAMPLES.map((example) => `## Example: ${example.title}\n\n\`\`\`yaml\n${example.yaml}\`\`\``).join('\n\n')}
`;
