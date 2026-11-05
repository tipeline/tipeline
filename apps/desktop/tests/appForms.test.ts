import { describe, expect, it } from 'vitest';
import { fieldsFromVariables } from '@/utils/formFromWorkflow';
import { formFields, validateForm } from '@/utils/appForm';

describe('fieldsFromVariables', () => {
  it('skips outputs: the workflow fills them in', () => {
    const fields = fieldsFromVariables([
      { name: 'customer', type: 'string', visibility: 'public' },
      { name: 'summary', type: 'string', visibility: 'public', output: true },
    ]);
    expect(fields.map((f) => f.name)).toEqual(['customer']);
  });

  it('maps settable variables to fields and skips the rest', () => {
    const fields = fieldsFromVariables([
      {
        name: 'customerName',
        type: 'string',
        visibility: 'public',
        required: true,
        description: 'Who',
      },
      { name: 'amount', type: 'number', visibility: 'protected', value: 10 },
      { name: 'urgent', type: 'boolean', visibility: 'public' },
      {
        name: 'dueDate',
        type: 'date',
        visibility: 'public',
        value: '2026-10-01T00:00:00.000Z',
      },
      { name: 'tags', type: 'array', visibility: 'public', value: ['a'] },
      { name: 'invoicePath', type: 'string', visibility: 'public' },
      { name: 'internal', type: 'string' }, // private by default
      { name: 'browser', type: 'browser', visibility: 'public' },
      {
        name: 'token',
        type: 'string',
        visibility: 'public',
        valueFromEnv: 'TOKEN',
      },
      {
        name: 'company',
        type: 'string',
        visibility: 'public',
        valueFromGlobal: 'company',
      },
    ]);

    expect(fields).toEqual([
      {
        name: 'customerName',
        type: 'text',
        label: 'Customer Name',
        description: 'Who',
        required: true,
      },
      { name: 'amount', type: 'number', label: 'Amount', default: 10 },
      { name: 'urgent', type: 'checkbox', label: 'Urgent' },
      {
        name: 'dueDate',
        type: 'date',
        label: 'Due Date',
        default: '2026-10-01',
      },
      { name: 'tags', type: 'textarea', label: 'Tags', default: '["a"]' },
      { name: 'invoicePath', type: 'file', label: 'Invoice Path' },
    ]);
  });
});

describe('validateForm', () => {
  const fields = [
    { name: 'email', type: 'text' as const, required: true },
    { name: 'count', type: 'number' as const },
    { name: 'agree', type: 'checkbox' as const, required: true },
    { name: 'tags', type: 'multiselect' as const, required: true },
  ];

  it('reports missing required values and non-numbers', () => {
    expect(
      validateForm(fields, { email: '', count: 'abc', agree: false, tags: [] })
    ).toEqual({
      email: 'required',
      count: 'notANumber',
      agree: 'required',
      tags: 'required',
    });
  });

  it('passes a complete form', () => {
    expect(
      validateForm(fields, {
        email: 'a@b.c',
        count: 3,
        agree: true,
        tags: ['x'],
      })
    ).toEqual({});
    expect(
      validateForm(fields, {
        email: 'a@b.c',
        count: null,
        agree: true,
        tags: ['x'],
      })
    ).toEqual({});
  });
});

describe('formFields', () => {
  it('keeps valid fields, fills in their type, and leaves out the rest', () => {
    expect(
      formFields([
        { name: 'title', label: 'Title', required: true },
        { name: 'count', type: 'number', default: 2 },
        { name: 'title', type: 'textarea' }, // name used already
        { name: 'bad name', type: 'text' },
        { name: 'kind', type: 'unknown' },
        { name: 'extra', type: 'text', nope: 1 }, // unknown setting
        null,
        'text',
      ])
    ).toEqual([
      { name: 'title', label: 'Title', required: true, type: 'text' },
      { name: 'count', type: 'number', default: 2 },
    ]);
  });

  it('is empty for anything but a list (a binding not resolved yet, nothing)', () => {
    expect(formFields(undefined)).toEqual([]);
    expect(formFields('{= runnables.type.outputs.fields =}')).toEqual([]);
    expect(formFields({ name: 'title' })).toEqual([]);
  });
});
