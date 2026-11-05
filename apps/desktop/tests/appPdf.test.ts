import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPdfBytes, pdfSource, PdfLoadError } from '@/utils/appPdf';

const PDF = '%PDF-1.4 tiny';
const b64 = Buffer.from(PDF).toString('base64'); // starts with JVBERi0

describe('pdfSource', () => {
  it('web links, data URLs, bare base64 and files', () => {
    expect(pdfSource('https://x.test/a.pdf')).toEqual({ kind: 'url', url: 'https://x.test/a.pdf' });
    expect(pdfSource(`data:application/pdf;base64,${b64}`)).toEqual({ kind: 'data', base64: b64 });
    const bare = Buffer.from(`%PDF-1.7 ${'x'.repeat(40)}`).toString('base64'); // > 32 chars, real base64
    expect(pdfSource(bare)).toEqual({ kind: 'data', base64: bare });
    expect(pdfSource('~/Tipeline/output/invoice #2.pdf')).toEqual({
      kind: 'file',
      path: '~/Tipeline/output/invoice #2.pdf',
      url: 'tipeline-asset://~/Tipeline/output/invoice%20%232.pdf',
    });
    expect(pdfSource('output/a.pdf')).toMatchObject({ kind: 'file' });
  });

  it('nothing, and things that are not a PDF', () => {
    for (const v of ['', '   ', null, undefined, 3]) expect(pdfSource(v)).toEqual({ kind: 'none' });
    expect(pdfSource('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA')).toEqual({ kind: 'invalid' }); // a PNG
    expect(pdfSource('ftp://x.test/a.pdf')).toEqual({ kind: 'invalid' });
  });
});

describe('loadPdfBytes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes base64 without asking anyone', async () => {
    expect(new TextDecoder().decode(await loadPdfBytes({ kind: 'data', base64: b64 }))).toBe(PDF);
  });

  it('in the app a file is read by the main process (the page may not fetch tipeline-asset)', async () => {
    const invoke = vi.fn(async (_c: string, { path }: { path: string }) =>
      path.includes('missing') ? { ok: false, error: 'notFound' } : { ok: true, bytes: new TextEncoder().encode(PDF) }
    );
    vi.stubGlobal('window', { ipcRenderer: { invoke } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const bytes = await loadPdfBytes(pdfSource('~/Tipeline/output/a.pdf'), 2);
    expect(invoke).toHaveBeenCalledWith('app:read-file', { path: '~/Tipeline/output/a.pdf' });
    expect(fetch).not.toHaveBeenCalled();
    expect(new TextDecoder().decode(bytes)).toBe(PDF);
    await expect(loadPdfBytes(pdfSource('missing.pdf'))).rejects.toMatchObject({ code: 'notFound' });
  });

  it('outside the app a file comes through tipeline-asset (cache-busted after a rewrite); missing = notFound', async () => {
    const fetch = vi.fn(async (url: string) => (url.includes('missing') ? new Response(null, { status: 404 }) : new Response(PDF)));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('window', {});
    await loadPdfBytes({ kind: 'file', path: 'a.pdf', url: 'tipeline-asset://a.pdf' }, 3);
    expect(fetch).toHaveBeenCalledWith('tipeline-asset://a.pdf?v=3');
    await expect(loadPdfBytes({ kind: 'file', path: 'missing.pdf', url: 'tipeline-asset://missing.pdf' })).rejects.toMatchObject({ code: 'notFound' });
  });

  it('a web link goes through the main process in the app, and its refusals come back as codes', async () => {
    const invoke = vi.fn(async (_c: string, { url }: { url: string }) =>
      url.includes('big') ? { ok: false, error: 'tooLarge' } : { ok: true, bytes: new TextEncoder().encode(PDF) }
    );
    vi.stubGlobal('window', { ipcRenderer: { invoke } });
    const bytes = await loadPdfBytes({ kind: 'url', url: 'https://x.test/a.pdf' });
    expect(invoke).toHaveBeenCalledWith('app:fetch-url', { url: 'https://x.test/a.pdf' });
    expect(new TextDecoder().decode(bytes)).toBe(PDF);
    const error = await loadPdfBytes({ kind: 'url', url: 'https://x.test/big.pdf' }).catch((e) => e);
    expect(error).toBeInstanceOf(PdfLoadError);
    expect(error.code).toBe('tooLarge');
  });
});
