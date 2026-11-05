// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import AppField from '@/components/app/widgets/AppField.vue';
import { formatError, validateForm } from '@/utils/appForm';
import { fieldsFromVariables } from '@/utils/formFromWorkflow';

describe('formatError', () => {
  it('email: loose, but needs name@domain.tld', () => {
    for (const ok of ['ana@example.com', ' a.b+c@sub.example.co ']) expect(formatError('email', ok)).toBeNull();
    for (const bad of ['ana', 'ana@', 'ana@example', 'a b@example.com']) expect(formatError('email', bad)).toBe('invalidEmail');
  });

  it('phone: separators allowed, 7 to 15 digits', () => {
    for (const ok of ['+506 8888-1234', '(555) 123.4567', '5551234']) expect(formatError('phone', ok)).toBeNull();
    for (const bad of ['123', 'call me', '+1 234 567 890 123 456', '555-12a4567']) expect(formatError('phone', bad)).toBe('invalidPhone');
  });

  it('currency is a number; empty values are left to required', () => {
    expect(formatError('currency', '12.50')).toBeNull();
    expect(formatError('currency', 'abc')).toBe('notANumber');
    for (const type of ['email', 'phone', 'currency']) expect(formatError(type, '')).toBeNull();
    expect(validateForm([{ name: 'e', type: 'email', required: true }], { e: '' })).toEqual({ e: 'required' });
    expect(validateForm([{ name: 'e', type: 'email' }, { name: 'p', type: 'phone' }], { e: 'x', p: '12' })).toEqual({
      e: 'invalidEmail',
      p: 'invalidPhone',
    });
  });
});

describe('formatError — code', () => {
  it('json code must parse; other languages are free text', () => {
    expect(formatError('code', '{"a": [1, 2]}', 'json')).toBeNull();
    expect(formatError('code', '{"a": ', 'json')).toBe('invalidJson');
    expect(formatError('code', 'SELECT * FROM t WHERE', 'sql')).toBeNull();
    expect(formatError('code', '   ', 'json')).toBeNull();
    expect(validateForm([{ name: 'q', type: 'code', language: 'json' }], { q: '[1,' })).toEqual({ q: 'invalidJson' });
  });
});

describe('fieldsFromVariables — new types', () => {
  it('secret → password (never with its stored value), emails and phones by name', () => {
    expect(
      fieldsFromVariables([
        { name: 'apiKey', type: 'string', visibility: 'public', secret: true, value: 'sk-123' },
        { name: 'customerEmail', type: 'string', visibility: 'public' },
        { name: 'mobile', type: 'string', visibility: 'public' },
      ])
    ).toEqual([
      { name: 'apiKey', type: 'password', label: 'Api Key' },
      { name: 'customerEmail', type: 'email', label: 'Customer Email' },
      { name: 'mobile', type: 'phone', label: 'Mobile' },
    ]);
  });
});

describe('AppField — new types', () => {
  const field = (props: Record<string, unknown>) =>
    mount(AppField, { props: { id: 'f', modelValue: '', ...props } as any, global: { plugins: [i18n] } });

  it('a badly formatted email says so after the field is left, not while typing', async () => {
    const w = field({ type: 'email', modelValue: 'ana@' });
    expect(w.find('input').attributes('type')).toBe('email');
    expect(w.find('[data-testid="field-error"]').exists()).toBe(false);
    await w.find('input').trigger('blur');
    expect(w.find('[data-testid="field-error"]').text()).toContain('email address');
  });

  it('password is hidden, with a button to show it', async () => {
    const w = field({ type: 'password', modelValue: 'hunter2' });
    expect(w.find('input').attributes('type')).toBe('password');
    await w.find('button[aria-label="Show password"]').trigger('click');
    expect(w.find('input').attributes('type')).toBe('text');
  });

  it('currency shows its symbol and gives back a number', async () => {
    const w = field({ type: 'currency', currency: 'EUR', modelValue: 12.5 });
    expect(w.find('[data-testid="currency-symbol"]').text()).toBe('€');
    await w.find('input').setValue('99.90');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([99.9]);
  });

  it('time uses a time box; phone the phone keyboard', () => {
    expect(field({ type: 'time' }).find('input').attributes('type')).toBe('time');
    expect(field({ type: 'phone' }).find('input').attributes('type')).toBe('tel');
  });

  it('date and date & time use Tipeline\'s calendar, showing the value in words', () => {
    const date = field({ type: 'date', modelValue: '2026-10-08' });
    expect(date.find('input').exists()).toBe(false);
    expect(date.find('[data-testid="date-trigger"]').text()).toContain('2026');
    const dt = field({ type: 'datetime', modelValue: '2026-10-08T14:30' });
    expect(dt.find('[data-testid="date-trigger"]').text()).toMatch(/2:30|14:30/);
    expect(field({ type: 'datetime' }).find('[data-testid="date-trigger"]').text()).toContain('Pick a date and time');
  });
});

describe('AppField — code', () => {
  it('draws a code editor for its language, with its text', () => {
    const w = mount(AppField, {
      props: { id: 'q', type: 'code', language: 'sql', modelValue: 'SELECT 1' } as any,
      global: { plugins: [i18n] },
    });
    const editor = w.find('[data-testid="code-editor"]');
    expect(editor.attributes('data-language')).toBe('sql');
    expect(editor.text()).toContain('SELECT 1');
    expect(w.find('button[aria-label="Edit full screen"]').exists()).toBe(true);
  });

  it('with preview: a Code | Preview switch; opening Preview asks for it and shows the HTML given', async () => {
    const w = mount(AppField, {
      props: { id: 't', type: 'code', language: 'html', modelValue: '<h1>{{ node.title }}</h1>', preview: true, previewHtml: '<h1>Hello</h1>' } as any,
      global: { plugins: [i18n] },
    });
    const tabs = w.findAll('[role="tab"]');
    expect(tabs.map((b) => b.text())).toEqual(['Code', 'Preview']);
    expect(w.find('[data-testid="code-preview"]').exists()).toBe(false);

    await tabs[1].trigger('click');
    expect(w.emitted('preview')).toEqual([['<h1>{{ node.title }}</h1>']]);
    expect(w.find('[data-testid="code-preview"]').attributes('srcdoc')).toBe('<h1>Hello</h1>');

    await w.setProps({ previewHtml: '<h1>Again</h1>' } as any);
    expect(w.find('[data-testid="code-preview"]').attributes('srcdoc')).toBe('<h1>Again</h1>');
    await w.findAll('[role="tab"]')[0].trigger('click');
    expect(w.find('[data-testid="code-preview"]').exists()).toBe(false);
  });

  it('with variables: a { } button; without preview or variables, no bar', () => {
    const withVars = mount(AppField, {
      props: { id: 't', type: 'code', modelValue: '', variables: ['node.title', 'site.name'] } as any,
      global: { plugins: [i18n] },
    });
    expect(withVars.find('button[aria-label="Insert variable"]').exists()).toBe(true);
    expect(withVars.find('[role="tab"]').exists()).toBe(false);

    const plain = mount(AppField, { props: { id: 'q', type: 'code', modelValue: '' } as any, global: { plugins: [i18n] } });
    expect(plain.find('button[aria-label="Insert variable"]').exists()).toBe(false);
    expect(plain.find('[role="tab"]').exists()).toBe(false);
  });
});
