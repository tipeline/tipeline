import { afterEach, describe, expect, it } from 'vitest';
import { runScriptPreview } from '@/action/actions/script/preview';

describe('runScriptPreview', () => {
  afterEach(() => {
    delete process.env.TIPELINE_PREVIEW_TEST_KEY;
  });

  it('returns the script result and how long it took', async () => {
    const out = await runScriptPreview({ code: 'return 1 + 1;' });
    expect(out).toMatchObject({ ok: true, hasResult: true, result: 2, logs: [] });
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('flags a script that returns nothing', async () => {
    const out = await runScriptPreview({ code: 'const x = 1;' });
    expect(out.ok).toBe(true);
    expect(out.hasResult).toBe(false);
  });

  it('resolves {{ }} context expressions against the given variables', async () => {
    const out = await runScriptPreview({
      code: 'return firstName + " " + lastName;',
      context: { firstName: '{{ first }}', lastName: 'Lovelace' },
      variables: { first: 'Ada' },
    });
    expect(out.result).toBe('Ada Lovelace');
    expect(out.context).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('keeps the original type for {= =} expressions', async () => {
    const out = await runScriptPreview({
      code: 'return items.length;',
      context: { items: '{= rows =}' },
      variables: { rows: [{ id: 1 }, { id: 2 }] },
    });
    expect(out.result).toBe(2);
    expect(out.context.items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('resolves _global references from the given globals', async () => {
    const out = await runScriptPreview(
      { code: 'return region;', context: { region: '{{ _global.region }}' } },
      [{ name: 'region', value: 'eu-west' }]
    );
    expect(out.result).toBe('eu-west');
  });

  it('does not change the caller’s context object', async () => {
    const context = { name: '{{ who }}' };
    await runScriptPreview({ code: 'return name;', context, variables: { who: 'Ada' } });
    expect(context.name).toBe('{{ who }}');
  });

  it('collects log() output instead of printing it', async () => {
    const out = await runScriptPreview({ code: 'log("hello", 42, { a: 1 }); log(); return true;' });
    expect(out.logs).toEqual(['hello 42 {"a":1}', '']);
  });

  it('returns the error together with the logs written before it', async () => {
    const out = await runScriptPreview({ code: 'log("before"); throw new Error("boom");' });
    expect(out.ok).toBe(false);
    expect(out.error).toContain('boom');
    expect(out.logs).toEqual(['before']);
  });

  it('reports a bad context expression without running the script', async () => {
    const out = await runScriptPreview({
      code: 'log("ran"); return 1;',
      context: { bad: 'prefix {= x =}' },
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/^Context:/);
    expect(out.logs).toEqual([]);
  });

  it('stops an await that never settles', async () => {
    const out = await runScriptPreview({ code: 'await new Promise(() => {});' });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/didn't finish/);
  }, 10_000);

  it('blanks secret global values out of the result, logs and context', async () => {
    const out = await runScriptPreview(
      { code: 'log(token); return { token };', context: { token: '{{ _global.apiToken }}' } },
      [{ name: 'apiToken', value: 'sk-very-secret', secret: true }]
    );
    expect(out.result).toEqual({ token: '[REDACTED]' });
    expect(out.logs).toEqual(['[REDACTED]']);
    expect(out.context.token).toBe('[REDACTED]');
  });

  it('blanks referenced _env values out of the output', async () => {
    process.env.TIPELINE_PREVIEW_TEST_KEY = 'env-secret-value';
    const out = await runScriptPreview({
      code: 'return "key=" + key;',
      context: { key: '{{ _env.TIPELINE_PREVIEW_TEST_KEY }}' },
    });
    expect(out.result).toBe('key=[REDACTED]');
  });

  it('leaves non-secret globals visible', async () => {
    const out = await runScriptPreview(
      { code: 'return region;', context: { region: '{{ _global.region }}' } },
      [{ name: 'region', value: 'eu-west', secret: false }]
    );
    expect(out.result).toBe('eu-west');
  });
});
