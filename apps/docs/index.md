---
layout: home
title: Tipeline
titleTemplate: Workflow Automation & Orchestration
---

<HomeHero />

<section class="tl-section">
  <div class="tl-section-head">
    <span class="tl-eyebrow">Platform</span>
    <h2 class="tl-h2">Everything a workflow needs,<br />built in.</h2>
    <p class="tl-section-lead">30+ action groups, real flow control and a run history you can resume from. No glue code, no plugin hunting for the basics.</p>
  </div>
  <div class="tl-grid">
    <div class="tl-cell">
      <svg class="tl-icon" viewBox="0 0 24 24"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>
      <h3>30+ action groups</h3>
      <p>Browser automation with Puppeteer, AI prompts, SSH, email, OCR, PDF, spreadsheets, databases and more.</p>
    </div>
    <div class="tl-cell">
      <svg class="tl-icon" viewBox="0 0 24 24"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
      <h3>Pipeline orchestration</h3>
      <p>Chain steps with loops, conditions and approvals. Every step's result flows into the next through variables.</p>
    </div>
    <div class="tl-cell">
      <svg class="tl-icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      <h3>Resume and debug</h3>
      <p>Each step's result is saved to SQLite. Resume a failed run from the step that failed, or step through one action at a time.</p>
    </div>
    <div class="tl-cell">
      <svg class="tl-icon" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 4v4"/><path d="M10 4v4"/></svg>
      <h3>Apps on your workflows</h3>
      <p>Dashboards, forms and tools with tables, charts, kanban boards, calendars and chat. No front end to write.</p>
    </div>
    <div class="tl-cell">
      <svg class="tl-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <h3>Ask in plain language</h3>
      <p>The Assistant finds the right workflow, fills in its inputs from your request and runs it once you confirm.</p>
    </div>
    <div class="tl-cell">
      <svg class="tl-icon" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <h3>Live streaming</h3>
      <p>Watch a run as it happens. Each step's result streams back as soon as it finishes, in the Desktop app, the CLI or over WebSocket.</p>
    </div>
  </div>
</section>

<section class="tl-section tl-split">
  <div class="tl-split-text">
    <span class="tl-eyebrow">Workflows as code</span>
    <h2 class="tl-h2">One YAML file.<br />Runs anywhere.</h2>
    <p class="tl-section-lead">A workflow is a plain YAML file you can read, diff and share. The same file runs the same way from the CLI, the Desktop app, an app, a schedule or the Assistant.</p>
    <ul class="tl-list">
      <li><code v-pre>{{ name }}</code><span>inserts a value as text</span></li>
      <li><code v-pre>{= name =}</code><span>passes objects and handles as they are</span></li>
      <li><code v-pre>{{ _env.KEY }}</code><span>reads environment files</span></li>
      <li><code v-pre>{{ _global.name }}</code><span>reads global variables</span></li>
    </ul>
    <a class="tl-link" href="/workflows/files">Read about workflow files →</a>
  </div>
  <div class="tl-split-code">

```yaml
name: Price Monitor
description: Alerts when a product's price drops.

pipeline:
  variables:
    - name: url
      type: string
      required: true
      visibility: public
    - name: threshold
      type: number
      value: 50
    - name: browser
      type: browser
    - name: price
      type: string

  actions:
    - group: browser
      name: launch
      params: { headless: true }
      destination: browser

    - group: browser
      name: goTo
      params:
        browser: "{= browser =}"
        url: "{{ url }}"

    - group: browser
      name: getElement
      params:
        browser: "{= browser =}"
        selector: ".price"
        attribute: text
      destination: price

    - group: flow
      name: ifConditional
      params:
        firstOperand: "{= price =}"
        compareAs: number
        operator: lte
        secondOperand: "{= threshold =}"
        actions:
          - group: system
            name: message
            params:
              text: "Price dropped to {{ price }}"
```

  </div>
</section>

<section class="tl-section">
  <div class="tl-section-head">
    <span class="tl-eyebrow">Interfaces</span>
    <h2 class="tl-h2">One engine. Every way in.</h2>
    <p class="tl-section-lead">The Desktop app, the CLI, Tipeline Server and AI tools all talk to the same Core engine. Use whichever fits the moment.</p>
  </div>
  <div class="tl-ways">
    <a class="tl-way" href="/desktop/overview">
      <svg class="tl-icon" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
      <h3>Desktop</h3>
      <p>Build workflows and apps visually, watch runs live and manage schedules.</p>
      <span class="tl-way-more">Desktop guide →</span>
    </a>
    <a class="tl-way" href="/cli/commands">
      <svg class="tl-icon" viewBox="0 0 24 24"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>
      <h3>CLI</h3>
      <p>Run workflows, inspect pipelines and control the engine from any terminal or CI job.</p>
      <span class="tl-way-more">CLI commands →</span>
    </a>
    <a class="tl-way" href="/server/">
      <svg class="tl-icon" viewBox="0 0 24 24"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/></svg>
      <h3>Server</h3>
      <p>Share one Core with your team: accounts, roles, webhooks and an audit log.</p>
      <span class="tl-way-more">Tipeline Server →</span>
    </a>
    <a class="tl-way" href="/assistant/">
      <svg class="tl-icon" viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
      <h3>Assistant &amp; MCP</h3>
      <p>Ask in plain language, or let Claude and other MCP clients find and run your workflows.</p>
      <span class="tl-way-more">Assistant →</span>
    </a>
  </div>
</section>

<section class="tl-cta">
  <h2 class="tl-h2">Start automating today.</h2>
  <p class="tl-section-lead">Download the Desktop app to build visually, or install the CLI to work from the terminal.</p>
  <div class="tl-hero-actions">
    <a class="tl-btn tl-btn-primary" href="/guide/installation">Download Tipeline</a>
    <a class="tl-btn tl-btn-ghost" href="/guide/quick-start">Quick start <span>→</span></a>
  </div>
</section>
