import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import sharp from 'sharp';
import PDFMerger from 'pdf-merger-js';
import { extractText, extractImages, getDocumentProxy } from 'unpdf';
import { GroupPDF } from '@/action/actions/pdf/actions';

vi.mock('unpdf', () => ({
  extractText: vi.fn(),
  extractImages: vi.fn(),
  getDocumentProxy: vi.fn(),
  definePDFJSModule: vi.fn(),
}));

vi.mock('fs-extra', () => ({
  default: {
    readFile: vi.fn(),
    ensureDir: vi.fn(),
  },
}));

vi.mock('sharp', () => {
  const toFile = vi.fn().mockResolvedValue(undefined);
  const pngFn = vi.fn(() => ({ toFile }));
  const sharpFn = vi.fn(() => ({ png: pngFn }));
  return { default: sharpFn };
});

vi.mock('pdf-merger-js', () => {
  const instances: any[] = [];
  const ctor = vi.fn().mockImplementation(function () {
    const instance = {
      add: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    };
    instances.push(instance);
    return instance;
  });
  (ctor as any).__instances = instances;
  return { default: ctor };
});

const fakePdfDoc = { numPages: 3 };

describe('GroupPDF', () => {
  beforeEach(() => {
    (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('%PDF-1.4'));
    (fs.ensureDir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getDocumentProxy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakePdfDoc);
    (extractText as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: 'Hello from the PDF',
    });
    (extractImages as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    ((PDFMerger as any).__instances as any[]).length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
    ((PDFMerger as any).__instances as any[]).length = 0;
  });

  describe('extractText', () => {
    it('reads the file, builds a document proxy, and returns the merged text', async () => {
      const result = await GroupPDF.extractText({ path: '/tmp/invoice.pdf' });

      expect(fs.readFile).toHaveBeenCalledWith('/tmp/invoice.pdf');
      expect(getDocumentProxy).toHaveBeenCalledWith(expect.any(Uint8Array));
      expect(extractText).toHaveBeenCalledWith(fakePdfDoc, { mergePages: true });
      expect(result).toBe('Hello from the PDF');
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupPDF.extractText({} as any)).rejects.toThrow();
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('propagates a rejection when the file cannot be read', async () => {
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('ENOENT: no such file or directory')
      );

      await expect(GroupPDF.extractText({ path: '/tmp/missing.pdf' })).rejects.toThrow(
        'ENOENT'
      );
    });

    it('propagates a rejection from the unpdf extraction call', async () => {
      (extractText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Corrupted PDF structure')
      );

      await expect(GroupPDF.extractText({ path: '/tmp/invoice.pdf' })).rejects.toThrow(
        'Corrupted PDF structure'
      );
    });
  });

  describe('extractImage', () => {
    it('extracts images from the first page and saves each as a PNG', async () => {
      (extractImages as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { data: Buffer.from([1, 2, 3]), width: 10, height: 10, channels: 3 },
        { data: Buffer.from([4, 5, 6]), width: 20, height: 20, channels: 4 },
      ]);

      const result = await GroupPDF.extractImage({ path: '/tmp/doc.pdf', output: '/tmp/out' });

      expect(extractImages).toHaveBeenCalledWith(fakePdfDoc, 1);
      expect(fs.ensureDir).toHaveBeenCalledWith('/tmp/out');
      expect(sharp).toHaveBeenCalledTimes(2);
      expect(sharp).toHaveBeenNthCalledWith(1, Buffer.from([1, 2, 3]), {
        raw: { width: 10, height: 10, channels: 3 },
      });
      expect(result).toEqual([
        expect.stringContaining('image-1.png'),
        expect.stringContaining('image-2.png'),
      ]);
    });

    it('returns an empty array when the PDF has no images (edge case)', async () => {
      (extractImages as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const result = await GroupPDF.extractImage({ path: '/tmp/doc.pdf', output: '/tmp/out' });
      expect(result).toEqual([]);
      expect(sharp).not.toHaveBeenCalled();
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupPDF.extractImage({ output: '/tmp/out' } as any)).rejects.toThrow();
    });

    it('propagates a rejection when saving an image to disk fails', async () => {
      (extractImages as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { data: Buffer.from([1]), width: 1, height: 1, channels: 3 },
      ]);
      // sharp()/png()/toFile() are shared mock references regardless of call args,
      // so grabbing them once is enough to force the next toFile() call to reject.
      const sharpMock = sharp as unknown as ReturnType<typeof vi.fn>;
      const toFileMock = sharpMock({} as any, {} as any).png().toFile as ReturnType<typeof vi.fn>;
      toFileMock.mockRejectedValueOnce(new Error('disk full'));

      await expect(
        GroupPDF.extractImage({ path: '/tmp/doc.pdf', output: '/tmp/out' })
      ).rejects.toThrow('disk full');
    });
  });

  describe('merge', () => {
    it('adds every input file in order and saves to the output path', async () => {
      const result = await GroupPDF.merge({
        input: ['/tmp/a.pdf', '/tmp/b.pdf'],
        output: '/tmp/merged/out.pdf',
      });

      const instance = (PDFMerger as any).__instances[0];
      expect(instance.add).toHaveBeenNthCalledWith(1, '/tmp/a.pdf');
      expect(instance.add).toHaveBeenNthCalledWith(2, '/tmp/b.pdf');
      expect(fs.ensureDir).toHaveBeenCalledWith('/tmp/merged');
      expect(instance.save).toHaveBeenCalledWith('/tmp/merged/out.pdf');
      expect(result).toBe('/tmp/merged/out.pdf');
    });

    it('rejects with a validation error when input is an empty array', async () => {
      await expect(
        GroupPDF.merge({ input: [], output: '/tmp/out.pdf' } as any)
      ).rejects.toThrow();
    });

    it('rejects with a validation error when output is missing', async () => {
      await expect(GroupPDF.merge({ input: ['/tmp/a.pdf'] } as any)).rejects.toThrow();
    });

    it('propagates a rejection when a merge input file cannot be added', async () => {
      const ctor = PDFMerger as unknown as ReturnType<typeof vi.fn>;
      ctor.mockImplementationOnce(function () {
        return {
          add: vi.fn().mockRejectedValue(new Error('Invalid PDF file')),
          save: vi.fn().mockResolvedValue(undefined),
        };
      });

      await expect(
        GroupPDF.merge({ input: ['/tmp/bad.pdf'], output: '/tmp/out.pdf' })
      ).rejects.toThrow('Invalid PDF file');
    });
  });

  describe('getPageCount', () => {
    it('returns the numPages from the document proxy', async () => {
      const result = await GroupPDF.getPageCount({ path: '/tmp/doc.pdf' });
      expect(result).toBe(3);
    });

    it('returns 0 for an empty document (edge case)', async () => {
      (getDocumentProxy as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        numPages: 0,
      });
      const result = await GroupPDF.getPageCount({ path: '/tmp/empty.pdf' });
      expect(result).toBe(0);
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupPDF.getPageCount({} as any)).rejects.toThrow();
    });

    it('propagates a rejection when the document proxy cannot be built', async () => {
      (getDocumentProxy as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Invalid PDF structure')
      );
      await expect(GroupPDF.getPageCount({ path: '/tmp/bad.pdf' })).rejects.toThrow(
        'Invalid PDF structure'
      );
    });
  });

  describe('splitPages', () => {
    it('creates one merger per page and saves each with the default prefix', async () => {
      const result = await GroupPDF.splitPages({ path: '/tmp/doc.pdf', output: '/tmp/split' });

      expect(fs.ensureDir).toHaveBeenCalledWith('/tmp/split');
      const instances = (PDFMerger as any).__instances as any[];
      expect(instances).toHaveLength(3);
      expect(instances[0].add).toHaveBeenCalledWith('/tmp/doc.pdf', ['1']);
      expect(instances[0].save).toHaveBeenCalledWith('/tmp/split/page-1.pdf');
      expect(instances[2].save).toHaveBeenCalledWith('/tmp/split/page-3.pdf');
      expect(result).toEqual([
        '/tmp/split/page-1.pdf',
        '/tmp/split/page-2.pdf',
        '/tmp/split/page-3.pdf',
      ]);
    });

    it('uses a custom prefix when provided (edge case)', async () => {
      (getDocumentProxy as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        numPages: 1,
      });
      const result = await GroupPDF.splitPages({
        path: '/tmp/doc.pdf',
        output: '/tmp/split',
        prefix: 'invoice',
      });
      expect(result).toEqual(['/tmp/split/invoice-1.pdf']);
    });

    it('rejects with a validation error when output is missing', async () => {
      await expect(GroupPDF.splitPages({ path: '/tmp/doc.pdf' } as any)).rejects.toThrow();
    });

    it('propagates a rejection when a page merger fails to save', async () => {
      (getDocumentProxy as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        numPages: 1,
      });
      const ctor = PDFMerger as unknown as ReturnType<typeof vi.fn>;
      ctor.mockImplementationOnce(function () {
        return {
          add: vi.fn().mockResolvedValue(undefined),
          save: vi.fn().mockRejectedValue(new Error('write failed')),
        };
      });

      await expect(
        GroupPDF.splitPages({ path: '/tmp/doc.pdf', output: '/tmp/split' })
      ).rejects.toThrow('write failed');
    });
  });
});
