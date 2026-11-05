import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorker } from 'tesseract.js';
import { GroupOCR } from '@/action/actions/ocr/actions';

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(),
}));

describe('GroupOCR', () => {
  let recognizeMock: ReturnType<typeof vi.fn>;
  let terminateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recognizeMock = vi.fn().mockResolvedValue({
      data: { text: 'Invoice #1234\nTotal: $50.00', confidence: 92.5 },
    });
    terminateMock = vi.fn().mockResolvedValue(undefined);

    (createWorker as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      recognize: recognizeMock,
      terminate: terminateMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recognize', () => {
    it('creates a worker for the requested language', async () => {
      await GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' });
      expect(createWorker).toHaveBeenCalledWith('eng');
    });

    it('calls recognize with the given source', async () => {
      await GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' });
      expect(recognizeMock).toHaveBeenCalledWith('/tmp/invoice.png');
    });

    it('terminates the worker after recognition completes', async () => {
      await GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' });
      expect(terminateMock).toHaveBeenCalledTimes(1);
    });

    it('returns the extracted text and confidence from the mocked response', async () => {
      const result = await GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' });
      expect(result).toEqual({
        text: 'Invoice #1234\nTotal: $50.00',
        confidence: 92.5,
      });
    });

    it('supports a different language code (edge case)', async () => {
      await GroupOCR.recognize({ source: '/tmp/facture.png', language: 'fra' });
      expect(createWorker).toHaveBeenCalledWith('fra');
    });

    it('handles a zero-confidence, empty-text result', async () => {
      recognizeMock.mockResolvedValueOnce({ data: { text: '', confidence: 0 } });
      const result = await GroupOCR.recognize({ source: '/tmp/blank.png', language: 'eng' });
      expect(result).toEqual({ text: '', confidence: 0 });
    });

    it('rejects with a validation error when source is missing', async () => {
      await expect(GroupOCR.recognize({ language: 'eng' } as any)).rejects.toThrow();
      expect(createWorker).not.toHaveBeenCalled();
    });

    it('rejects with a validation error when language is missing', async () => {
      await expect(GroupOCR.recognize({ source: '/tmp/invoice.png' } as any)).rejects.toThrow();
      expect(createWorker).not.toHaveBeenCalled();
    });

    it('propagates a rejection from worker.recognize', async () => {
      const ocrError = new Error('Unsupported image format');
      recognizeMock.mockRejectedValueOnce(ocrError);

      await expect(
        GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' })
      ).rejects.toThrow('Unsupported image format');
    });

    it('still terminates the worker when recognize rejects', async () => {
      recognizeMock.mockRejectedValueOnce(new Error('boom'));

      await expect(
        GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' })
      ).rejects.toThrow();
      expect(terminateMock).toHaveBeenCalledTimes(1);
    });

    it('propagates a rejection from createWorker itself', async () => {
      (createWorker as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to load tesseract core')
      );

      await expect(
        GroupOCR.recognize({ source: '/tmp/invoice.png', language: 'eng' })
      ).rejects.toThrow('Failed to load tesseract core');
    });
  });
});
