# Writing Workflows the Assistant Can Find

The assistant only knows a workflow by its name, its description, its tags, its inputs and its outputs. Write these well and requests like "views and visits for Northfield last month" or "top IPs from April to September" find the right workflow on the first try, with the form already filled in. Leave them vague and the assistant guesses, asks you which one you mean, or says nothing does it.

This page covers what the assistant reads, how to write names, descriptions, tags, inputs and outputs for it, and how to get [better answers](#better-answers) after a run. A [checklist](#checklist) at the end sums it up.

## What the assistant reads

| When | What it sees | What it doesn't see |
|------|--------------|---------------------|
| Choosing a workflow | The name, the identifier, the **first paragraph** of the description, the tags, each public or protected input's name, type, label, description, whether it's required, and its default, and each public or protected [output](#outputs)'s name, type, label and description | The steps, the rest of the description, the values of anything |
| Writing the answer after a run | Your request, the workflow's name and description (about the first 1,500 characters), and its outputs (or its public variables when it marks none) with their labels and descriptions, the values cut to about 4 KB | Private and secret variables, files, run logs |

Two things follow from this:

- Everything that helps the assistant pick a workflow has to be in the name, the first paragraph, the tags, the inputs or the outputs.
- Everything that helps it answer has to be in small, well-described outputs.

## How the search works

The assistant turns your request into a few keywords and searches with them. It's a plain word search, not a search by meaning:

- **Each keyword is looked for as text** in the name (worth the most), the tags, the first paragraph of the description and the inputs and outputs (worth the least). Workflows with the most points come first; the assistant sees the top 10 by default.
- **Words that differ only in ending match each other**: "reports" finds "report", "deployment" finds "deploy".
- **There are no synonyms.** "Sessions" doesn't find "visits", and "disk" doesn't find "file system". Put the other words people use in the [tags](#tags).
- **Words of one or two letters are ignored**, so "IP", "DB" and "FS" don't count. Write "IP addresses", "database" and "file system" in full.
- **If no keyword matches anything,** the assistant gets the first 25 workflows by name and picks by meaning. With a bigger library, a workflow it can't find by a keyword may not be among them.
- **If two to four workflows fit about equally,** it asks you which one you mean and remembers your answer. See [When several workflows fit](/assistant/#when-several-workflows-fit).

## Plan the workflows

### One workflow per question

Build a workflow for each question people ask again and again, worded the way they ask it:

- "What were the views and visits for this customer by month?"
- "Which IP addresses send this customer the most traffic, and are they bots?"
- "How full is this application's file system compared to what the customer pays for?"

Some rules:

- **The time period is an input, not a separate workflow.** "Last month", "April" and "April to September" are all the same workflow with `dateFrom` and `dateTo` dates.
- **A choice is an input when only a filter changes.** Views, visits or requests give the same kind of result, so one workflow with a `metric` input is fine. The input decides what the workflow fetches; the outputs keep the same names whatever was chosen. See [One set of outputs for every choice](#one-set-of-outputs-for-every-choice).
- **Different answers are different workflows.** "Top IP addresses" and "file system usage" return different things. One workflow that does both behind a `mode` input is hard to pick and hard to fill in.

### Helper workflows and question workflows

Most questions read the same sources: a dataset, an API, the output of a command. Split the work into two kinds of workflows:

| | Helper workflow | Question workflow |
|---|---|---|
| **Does** | Gets data from one source, or looks one thing up | Answers one question people ask |
| **Examples** | Fetch the customers dataset; fetch a ticket's comments; call the orders API; find a customer's id by name | Top IP addresses for a customer; open tickets older than a week; orders not shipped yet |
| **Returns** | The data as the source gives it, or the id it looked up | A short answer: totals, a top 10, a `summary` |
| **Run by** | Other workflows, through a [sub-workflow step](/actions/subtask) | People and the assistant |

The question workflow calls a helper, then filters, totals and sorts what the helper returned.

This pays off quickly:

- **Each source is set up and fixed in one place.** When an API changes its address, its sign-in or its paging, you fix one helper and every question workflow that uses it keeps working.
- **Question workflows stay short.** They only hold the part that is specific to the question.
- **Inputs and outputs match.** Every workflow that needs a customer calls the same lookup, so they all take `customer` as a name and get the same `customerId` back.
- **The assistant reuses them.** When it [drafts a new workflow](/assistant/#drafts), it searches your workflows first and calls the helpers it finds instead of rebuilding the API calls.

::: tip Not just for one kind of work
This works for any work where several questions read the same few sources: support tickets, sales figures, server checks, files on disk. If you only have one or two workflows per source, keep them whole and split them out when a second question needs the same data.
:::

Mark each helper with `helper: true` (in Desktop, **Helper workflow** in the **Edit** dialog). The assistant then never offers it as the answer to a request, even when its name shares every word with the request. A helper called `Data: Views and visits API` would otherwise compete with `Traffic: Views and visits by month` for "views and visits for Northfield", and the helper returns every row, not an answer. Helpers stay in the search for [drafts](/assistant/#drafts), which reuse them as steps, and you can still run one yourself.

Name helpers by what they get, and start the description with what they are:

```yaml
name: 'Customers: Find customer by name'
description: |
  Helper: looks up a customer's id from part of their name. Used by other workflows.
helper: true
```

A helper that only calls an API for other workflows can use `Data:` as its prefix instead of a topic, such as `Data: Traffic API for a customer application`. Nobody asks for it by name, and the prefix keeps all of these together in the list.

`examples/workflows/traffic-api/` puts this together:

| Workflow | What it does |
|---|---|
| `Data: Traffic API for a customer application` | Calls the API once for a customer application and dates, caches the call for an hour, and returns `views`, `visits`, `topPaths` and `topIps` as outputs. Marked `helper: true`. |
| `Entitlements: Views vs entitlement for a customer application` | Takes only `views` and compares it with what the customer pays for. |
| `Traffic: Top paths and IP addresses for a customer application` | Takes `topPaths` and `topIps` and counts the likely bots. |

Run both question workflows for the same customer and dates, and the API is called once. The example answers with made-up figures; the HTTP request to use instead is in a comment in the `Data:` workflow. The question workflows call the helper by file (`path`), so the folder runs as it is. Installing a question workflow installs the helper with it and switches the step to the helper's identifier.

## Names

The name is worth the most in the search, and it's what people see in every list.

**Use the format `<Topic>: <what it does> [for what]`**:

```
Traffic: Views and visits by month for a customer
Traffic: Top IP addresses and bots for a customer
Traffic: Spikes in requests for a customer
Usage: File system usage vs entitlement for an application
Tickets: Open tickets for a customer
Reports: Monthly customer report
Meetings: Draft agenda for a customer meeting
```

- **Make the prefix a topic, not a team or role.** People look for workflows by topic, and a team name only helps the search when someone types that team's name. Who wrote a workflow goes in `author`. A workflow meant for one team gets that team's name as a [tag](#tags).
- **Use the words people type.** "Views and visits" rather than "Traffic metrics"; "file system" rather than "FS".
- **Say what comes back, not that it gets something.** Write `Traffic: Top paths and IP addresses for a customer application`, not `Traffic: Get customer app traffic`. Almost every workflow gets something, so "get", "fetch", "show" or "check" add no points that set one workflow apart, and they take the place of the words that would: what it returns (top paths, IP addresses) and for what (a customer application).
- **Avoid names that say nothing on their own:** "Get data", "Run tool", "Check", "Test 2", "Copy of …". The **Search tips** tab on the [Assistant page](/assistant/#the-assistant-page) flags these.
- **The identifier doesn't count.** Tipeline gives each workflow a random identifier when it's installed, and the search leaves it out.

## Description

Only the **first paragraph** reaches the assistant. The first paragraph ends at the first blank line; single line breaks inside it are joined into one paragraph.

**In one to three sentences, say:**

1. what question it answers,
2. for what (a customer, an application, a ticket) and over what period,
3. where the data comes from,
4. **what it returns.**

The last one matters because what a workflow returns is how the assistant, and people, tell apart workflows that sound alike, like "Traffic by month" and "Traffic spikes". Marking [outputs](#outputs) shows the assistant what comes back too, but the first paragraph is what people read in lists and what the search scores higher.

```yaml
description: |
  Top IP addresses sending requests to a customer's sites between two dates, from the web server access logs. Returns the request count, share of traffic and a likely-bot flag for each IP, and a short summary.

  Notes for people: the access logs keep 13 months. Anything after the first paragraph, like this, is not read by the assistant.
```

- **There's no length limit, but keep it to about 150–300 characters.** The same text is the one-line summary in lists and the CLI. And because every matching word scores, a long first paragraph also matches requests it has nothing to do with.
- **Periods and short sentences are fine.** They read better and make no difference to the search.
- **Write details for people after the first paragraph:** how an app uses it, limits of the data, who to ask.
- **Write each paragraph as one long line.** A workflow's Overview shows every line break inside a paragraph, so a description wrapped to fit your editor looks broken there.

## Tags

Tags are worth more than the description and are the place for **the other words people use**:

```yaml
tags: [traffic, views, visits, pageviews, sessions, bots, crawlers, ip-addresses]
```

- Add the synonyms and short forms of what the name says.
- Add the team that uses it when it's meant for one team (`support`, `sales`).
- Leave out tags that don't help anyone search, like `test` or `v2`.

## Inputs

The assistant fills in inputs from the request using each input's **type** and **description**, then shows you the form. Good inputs are what make "for Northfield last month" end up in the right fields.

### Use the same names everywhere

When every workflow calls the same thing by the same name, the assistant fills it the same way each time and one workflow's outputs fit the next one's inputs:

| Input | Type | Description to start from |
|-------|------|---------------------------|
| `customer` | string | Customer name, e.g. Northfield University. Part of the name is enough. |
| `application` | string | Application name, e.g. www. Empty = all applications. |
| `environment` | string | One of: prod, stage, dev. Empty = prod. |
| `dateFrom` | date | First day included. Empty = today. |
| `dateTo` | date | Last day included. Empty = today. |
| `ticket` | string | Ticket number, e.g. 01234567. |

### Take names, not ids

People say "Northfield", not the id a system gave the customer. If the input only takes the id, every request ends with someone looking it up and pasting it into the form.

Take the **name** instead and look the id up inside the workflow:

1. A `customer` input: "Customer name, e.g. Northfield University. Part of the name is enough."
2. A first step that searches a list holding both names and ids for names that contain the text, ignoring case.
3. **One match:** use its id in the rest of the workflow.
4. **None or several:** stop with a message that says what was found, e.g. *3 customers match "north": Northfield University, North Bay Health, Northstar Inc. Use the full name.*

Write that lookup once as a helper workflow and call it from every workflow that needs a customer:

In the builder, pick the helper in the sub-workflow step and its identifier is filled in for you. In YAML it looks like this, with the identifier Tipeline gave the helper:

```yaml
- group: subtask
  name: exec
  params:
    identifier: Xq3vT8kLm2PzR7wYc0aNe   # Customers: Find customer by name
    props:
      name: '{{ customer }}'
    outputs:
      customerId: customerId   # this workflow ← the helper
```

### List the choices

The assistant can't see a list of allowed values, only the description. Write the choices into it: "One of: views, visits, requests." Say what an empty value means too: "Empty = views."

### Dates

- Give period inputs the `date` type. The assistant turns "April" into April 1 to April 30 of this year, and "last month" or "last week" into real dates.
- Don't fix the period inside the steps ("always last month"). Take `dateFrom` and `dateTo`.
- A `date` input is never empty: with no value it's today, and it can't be `required` (a required input needs a placeholder value, like `value: ''` for text, and a date has none). Say "Empty = today" in the description. If you need a different default, such as the first day of last month, use a `string` input and work the date out in the workflow, and say what the default is in the description.

### Other rules

- **Mark what's needed as `required: true`.** The form then asks for whatever the request didn't give, and Run stays off until it's filled in.
- **Give every input a `label`.** It's shown on the form and it's searched.
- **Keep credentials out of inputs.** Use `secret: true`, `valueFromGlobal` or `valueFromEnv`. The assistant never sees those variables, and never sees their values.
- **Avoid object and array inputs** in workflows people start by asking. The assistant fills them in poorly. Take plain values and build the object in a step.
- **Always write `visibility` on every variable.** `public` for inputs people fill in on the overview, `protected` for settings only the assistant, apps and other workflows should pass, `private` for everything else. A variable without one is private, so the assistant never sees it.
- **Outputs can be `public` or `protected`.** Both reach the assistant. Pick `protected` when only callers need the value.

## Outputs

**Mark each variable the workflow fills in with `output: true`.** An output is never asked for: it isn't on run forms, the assistant doesn't fill it in, and apps and parent workflows can't set it. See [Outputs](/workflows/files#outputs) for the full rules.

```yaml
- name: total
  type: number
  label: Total visits
  description: Visits in the chosen period, all applications together.
  visibility: public
  output: true
```

Outputs are shown under the assistant's answer, used by apps, and read by the AI to write its answer, up to about 4 KB. Long text is cut and long lists keep only their first items.

Once a workflow marks any outputs, a run started by the assistant returns **only those**, so **mark everything you want back**: the summary, the data, and anything the answer should mention, such as the customer or the period. A workflow that marks none still returns all its public variables (not its protected ones), as before.

Outputs aren't only for the assistant. Everywhere a workflow runs, an output is never asked for before the run and is returned after it: forms leave it out, apps and parent workflows can read it but not set it.

Plan them in three layers:

| Variable | Visibility | What it holds |
|----------|------------|---------------|
| `summary` (`output: true`) | public | The answer in a few lines of Markdown, worked out in the workflow. The assistant always gets it in full, so its answer is right even when the data below is cut. |
| Compact data (`output: true`), e.g. `topIps`, `total` | public | Already worked out: totals, KPIs, the top 10–20 rows. Not every row of the source. This is also what an app shows in a table or chart. |
| Working data, e.g. `logRows` | private | What the steps fetch and work through. Never an input, never sent to the assistant. |

The summary is a variable, not a setting of the workflow, because it holds this run's numbers: steps write it like any other value, and apps can show it.

### How the answer is written

Nothing picks one output over another. After a run:

- The assistant shows **every** returned output under its answer, by its label. Hover a label for the name and description.
- To write the answer, the AI gets the original request, the workflow's name and description, and the returned outputs with their values, labels and descriptions. It writes two to four sentences with the figures that answer the request.

So the request decides which numbers the answer mentions, and the output **names, labels and descriptions** are how the AI finds them and reads them right. Call outputs what they hold (`visits`, `topIps`, `total`), not `data` or `result2`, and say in the description what the value is, with its unit: "Visits in millions." keeps the AI from reporting 46.1 as 46 visits.

### One set of outputs for every choice

When an input picks what to measure, such as `metric` (views, visits or requests), don't make a separate output per choice. Keep the same outputs and fill them with the chosen measure:

| Variable | What it holds |
|----------|---------------|
| `metric` (input) | One of: views, visits, requests. |
| `summary` | "Northfield had **312K visits** in September, up 4%." |
| `monthly` | `[{ month: 2026-09, value: 312000 }, …]` for the chosen metric. |
| `total` | The total for the chosen metric. |

The outputs then hold exactly what was asked for, the 4 KB the AI reads goes to one measure instead of three, and an app can use the same chart for every choice.

If the workflow should always return all of them, as a dashboard might, drop the input instead: name it "Views, visits and requests by month" and return `views`, `visits` and `requests`. The AI picks the one the request asks about when it writes the answer.

## Better answers

The AI can only say what's in the outputs. These make the difference between "The workflow finished" and "Northfield had **312K visits** in September, up 4% from August, 78% of its entitlement":

1. **Write the facts into `summary` yourself.** Put the key figures, the comparison and the conclusion in the summary output. The AI then repeats them correctly instead of working them out.
2. **Do the math in the workflow.** Change vs. last month, % of the entitlement, "over the limit: yes", the busiest day. The AI shouldn't add up a list, especially one that may have been cut short.
3. **Give units and scale.** The AI can't tell whether `46.1` means 46.1 views or 46.1 million. Say it in the output's description ("In millions."), put it in the name (`viewsMillions`, `diskUsedGb`), or return text that already has it ("46.1M").
4. **Return what the run covered.** Outputs like `customerName` ("Northfield University") and `period` ("2026-09-01 to 2026-09-30") let the answer say which customer and which dates it's about. This matters most when the workflow looked a customer up from part of a name.
5. **Put the most important thing first.** When outputs are too big, lists are cut to their first 20, then 5, then 3 items. Sort the top results first, and keep all outputs together under about 4 KB so nothing is cut.
6. **Write clear error messages.** When a run fails, its error is sent to the AI. *Found 3 customers matching "north": …* turns into a useful next step; *Cannot read property id of undefined* doesn't.
7. **Use a clear name and description.** Both are sent with the outputs and tell the AI what the numbers are about. Notes past the first paragraph, such as "Figures are in millions" or "The logs keep 13 months", reach the answer too.

## A complete example

```yaml
name: 'Traffic: Top IP addresses and bots for a customer'
description: |
  Top IP addresses sending requests to a customer's sites between two dates, from the web server access logs. Returns the request count, share of traffic and a likely-bot flag for each IP, and a short summary.

  Uses "Customers: Find customer by name" to turn the name into an id. The access logs keep 13 months.
author: web-team
version: 1.0.0
tags: [traffic, ip-addresses, bots, crawlers, access-logs, requests]

pipeline:
  variables:
    # Inputs
    - name: customer
      type: string
      label: Customer
      description: Customer name, e.g. Northfield University. Part of the name is enough.
      required: true
      value: ''
      visibility: public
    - name: dateFrom
      type: date
      label: From
      description: First day included. Empty = today.
      visibility: public
    - name: dateTo
      type: date
      label: To
      description: Last day included. Empty = today.
      visibility: public

    # Outputs
    - name: summary
      type: string
      label: Summary
      description: The answer in a few lines of Markdown, with the customer and the dates.
      visibility: public
      output: true
    - name: topIps
      type: array
      label: Top IP addresses
      description: Top 20 IPs, busiest first, with requests, share of all requests (%) and likely bot.
      visibility: public
      output: true

    # Working data
    - name: customerId
      type: string
      visibility: private
    - name: logRows
      type: array
      visibility: private

  actions:
    - group: subtask
      name: exec
      params:
        identifier: customers-find-customer-by-name
        props:
          name: '{{ customer }}'
        outputs:
          customerId: customerId

    # ... steps that read the access logs for customerId into logRows ...

    - group: script
      name: runScript
      params:
        context:
          rows: '{= logRows =}'
        code: |
          const counts = {};
          for (const row of rows) {
            if (!counts[row.ip]) counts[row.ip] = { ip: row.ip, requests: 0, bot: false };
            const entry = counts[row.ip];
            entry.requests += 1;
            if (/bot|crawler|spider/i.test(row.userAgent ?? '')) entry.bot = true;
          }
          const total = rows.length || 1;
          return Object.values(counts)
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 20)
            .map((e) => ({ ...e, share: Math.round((e.requests / total) * 1000) / 10 }));
      destination: topIps

    - group: script
      name: runScript
      params:
        context:
          customer: '{{ customer }}'
          dateFrom: '{= dateFrom =}'
          dateTo: '{= dateTo =}'
          top: '{= topIps =}'
        code: |
          const day = (d) => new Date(d).toISOString().slice(0, 10);
          const from = day(dateFrom);
          const to = day(dateTo);
          if (top.length === 0) return `No requests for **${customer}** from ${from} to ${to}.`;
          const first = top[0];
          const bots = top.filter((e) => e.bot).length;
          return [
            `**${customer}**, ${from} to ${to}.`,
            `Top IP ${first.ip}: ${first.share}% of requests${first.bot ? ' (likely a bot)' : ''}.`,
            `${bots} of the top ${top.length} IPs look like bots.`,
          ].join('\n');
      destination: summary
```

## Check your work

- **Search tips.** The **Search tips** tab on the [Assistant page](/assistant/#the-assistant-page) lists workflows that are hard to find, and why: no description, a name that doesn't say what it does, no tags, inputs without a label or description, still a draft.
- **Ask three ways.** Before you call a workflow done, try it in the assistant with:
  1. a plain request: "views and visits for Northfield last month",
  2. other words: "pageviews and sessions for Northfield",
  3. a period: "top IPs for Meridian from April to September".

  If the second one misses, add tags. If the third fills in the wrong dates, sharpen the input descriptions. If the assistant keeps asking "Which one do you mean?" between two workflows, make their names and first paragraphs say how they differ.

## Checklist

- [ ] One workflow per question; the period and the subject are inputs.
- [ ] Data from a shared source comes from a helper workflow, named and described as a helper, and marked `helper: true`.
- [ ] The name is `<Topic>: <what it does> [for what]`, in the words people type, saying what it returns.
- [ ] The first paragraph of the description says what it answers, for what, from where, and **what it returns**, in one to three sentences.
- [ ] Tags hold the synonyms and short forms.
- [ ] Inputs use the shared names, take names instead of ids, list their choices, use `date` for periods, and say what an empty value means.
- [ ] Every variable has a `visibility`: inputs `public` (or `protected` when they stay off the overview), outputs `public` or `protected`, everything else `private`.
- [ ] Every variable the workflow fills in is marked `output: true`, with a label and a description that gives its unit.
- [ ] Credentials come from secrets, globals or the environment.
- [ ] A `summary` output with the answer, compact output data worked out in the workflow, private working data.
- [ ] Error messages say what went wrong and what to do.
- [ ] Tried in the assistant three ways.
