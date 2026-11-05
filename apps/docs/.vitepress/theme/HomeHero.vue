<script setup lang="ts">
const nav = [
  { group: 'Build', items: ['Workflows', 'Apps', 'Projects'] },
  { group: 'Operate', items: ['Runs', 'Schedules', 'Approvals'] },
  { group: 'Resources', items: ['Variables', 'Hub'] },
];

const steps = [
  { group: 'browser', name: 'launch', detail: 'headless', time: '412 ms', state: 'done' },
  { group: 'browser', name: 'goTo', detail: 'shop.example.com/item/42', time: '1.2 s', state: 'done' },
  { group: 'browser', name: 'getElement', detail: '.price → price', time: '86 ms', state: 'done' },
  { group: 'flow', name: 'ifConditional', detail: 'price ≤ threshold', time: '', state: 'running' },
  { group: 'system', name: 'message', detail: 'Price dropped to {{ price }}', time: '', state: 'pending' },
];

const variables = [
  { name: 'url', value: 'shop.example.com/item/42' },
  { name: 'threshold', value: '50' },
  { name: 'price', value: '47.99' },
  { name: 'browser', value: '<Browser>' },
];
</script>

<template>
  <section class="tl-hero">
    <div class="tl-hero-glow" aria-hidden="true" />
    <div class="tl-hero-inner">
      <a class="tl-pill" href="/assistant/">
        <span class="tl-pill-tag">New</span>
        <span class="tl-pill-text">The Assistant drafts workflows from plain language</span>
        <span class="tl-pill-arrow">→</span>
      </a>
      <h1 class="tl-hero-title">Automate the work.<br />Keep the control.</h1>
      <p class="tl-hero-lead">
        Tipeline runs browser, file, AI, SSH, email, OCR and database steps from one YAML file.
        Build it in the Desktop app, then run it from the CLI, a schedule, an app or your team's
        server.
      </p>
      <div class="tl-hero-actions">
        <a class="tl-btn tl-btn-primary" href="/guide/introduction">Get started</a>
        <a class="tl-btn tl-btn-ghost" href="/actions/">Browse actions <span>→</span></a>
      </div>
    </div>

    <div class="tl-mock-wrap">
      <div class="tl-mock" role="img" aria-label="Tipeline Desktop running a workflow">
        <div class="tl-mock-bar">
          <span class="tl-dot" /><span class="tl-dot" /><span class="tl-dot" />
          <span class="tl-mock-title">Price Monitor</span>
        </div>
        <div class="tl-mock-body">
          <aside class="tl-mock-side">
            <div class="tl-mock-brand">
              <span class="tl-mock-logo" />
              Tipeline
            </div>
            <div v-for="section in nav" :key="section.group" class="tl-mock-group">
              <div class="tl-mock-group-label">{{ section.group }}</div>
              <div
                v-for="item in section.items"
                :key="item"
                class="tl-mock-nav"
                :class="{ active: item === 'Runs' }"
              >
                <span class="tl-mock-nav-icon" />{{ item }}
              </div>
            </div>
          </aside>

          <main class="tl-mock-main">
            <div class="tl-mock-head">
              <div>
                <div class="tl-mock-crumb">Runs / Price Monitor</div>
                <div class="tl-mock-h">Run #1284</div>
              </div>
              <span class="tl-status">
                <span class="tl-status-dot" />
                Running
              </span>
            </div>
            <ol class="tl-steps">
              <li v-for="(step, i) in steps" :key="i" class="tl-step" :class="step.state">
                <span class="tl-step-marker" />
                <span class="tl-step-name">
                  <span class="tl-step-group">{{ step.group }}</span>.{{ step.name }}
                </span>
                <span class="tl-step-detail">{{ step.detail }}</span>
                <span class="tl-step-time">{{ step.time }}</span>
              </li>
            </ol>
          </main>

          <aside class="tl-mock-vars">
            <div class="tl-mock-group-label">Variables</div>
            <div v-for="v in variables" :key="v.name" class="tl-var">
              <span class="tl-var-name">{{ v.name }}</span>
              <span class="tl-var-value">{{ v.value }}</span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>
