import { describe, expect, it } from 'vitest';
import { imageSource, withVersion } from '@/utils/appImage';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('imageSource', () => {
  it('passes web and data URLs through', () => {
    expect(imageSource('https://example.com/a.png')).toEqual({ kind: 'url', url: 'https://example.com/a.png' });
    expect(imageSource(`data:image/png;base64,${PNG}`).kind).toBe('data');
  });

  it('recognizes bare base64 by its first bytes (image.toBuffer)', () => {
    expect(imageSource(PNG)).toEqual({ kind: 'base64', url: `data:image/png;base64,${PNG}` });
    expect(imageSource('QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=').kind).toBe('invalid'); // base64, but not an image
  });

  it('serves files through tipeline-asset, encoded', () => {
    expect(imageSource('/Users/ana/Tipeline/output/shot 1.png')).toEqual({
      kind: 'file',
      url: 'tipeline-asset:///Users/ana/Tipeline/output/shot%201.png',
    });
    expect(imageSource('~/Tipeline/output/qr.png').kind).toBe('file');
    expect(imageSource('output/qr.png').url).toBe('tipeline-asset://output/qr.png');
    expect(imageSource('C:\\\\Users\\\\ana\\\\Tipeline\\\\a.png').kind).toBe('file');
    expect(imageSource('/tmp/what?.png').url).toBe('tipeline-asset:///tmp/what%3F.png');
  });

  it('nothing, or nothing it can show', () => {
    expect(imageSource('')).toEqual({ kind: 'none' });
    expect(imageSource(null)).toEqual({ kind: 'none' });
    expect(imageSource('ftp://x/y.png')).toEqual({ kind: 'invalid' });
  });

  it('only files get a cache-busting version', () => {
    expect(withVersion(imageSource('output/qr.png'), 3)).toBe('tipeline-asset://output/qr.png?v=3');
    expect(withVersion(imageSource('output/qr.png'), 0)).toBe('tipeline-asset://output/qr.png');
    expect(withVersion(imageSource('https://x.com/a.png'), 3)).toBe('https://x.com/a.png');
    expect(withVersion(imageSource(''), 3)).toBeNull();
  });
});
