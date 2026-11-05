import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Parser } from '@utils/Parser';
import { YAMLParsingError } from '@utils/errors';

describe('Parser', () => {
  const tempPaths: string[] = [];

  function makeTempPath(name: string): string {
    const p = path.join(os.tmpdir(), `tipeline-parser-test-${Date.now()}-${Math.random()}`, name);
    tempPaths.push(p);
    return p;
  }

  afterEach(() => {
    while (tempPaths.length) {
      const p = tempPaths.pop()!;
      try {
        const dir = path.dirname(p);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup errors
      }
    }
  });

  describe('importFromString / exportToString', () => {
    it('round-trips a plain object through exportToString + importFromString', () => {
      const data = { name: 'task', count: 3, active: true, tags: ['a', 'b'] };

      const yamlStr = Parser.exportToString(data);
      expect(typeof yamlStr).toBe('string');

      const parsed = Parser.importFromString(yamlStr);
      expect(parsed).toEqual(data);
    });

    it('parses valid YAML content directly', () => {
      const yamlStr = 'name: task\ncount: 3\nactive: true\n';
      const parsed = Parser.importFromString(yamlStr) as any;

      expect(parsed).toEqual({ name: 'task', count: 3, active: true });
    });

    it('throws YAMLParsingError for invalid YAML structure', () => {
      const invalidYaml = 'name: "unterminated string\n  bad: [1, 2';

      expect(() => Parser.importFromString(invalidYaml)).toThrow(YAMLParsingError);
      expect(() => Parser.importFromString(invalidYaml)).toThrow('Invalid YAML');
    });
  });

  describe('exportToFile / importFromFile', () => {
    it('round-trips a plain object through a real temp file', () => {
      const data = { name: 'task', nested: { a: 1, b: [1, 2, 3] } };
      const filePath = makeTempPath('task.yaml');

      Parser.exportToFile(filePath, data);
      expect(fs.existsSync(filePath)).toBe(true);

      const imported = Parser.importFromFile(filePath);
      expect(imported).toEqual(data);
    });

    it('creates intermediate directories when exporting', () => {
      const filePath = makeTempPath('nested/dir/task.yaml');

      expect(() => Parser.exportToFile(filePath, { a: 1 })).not.toThrow();
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('wraps a file read error (missing file) in YAMLParsingError', () => {
      const missingPath = path.join(os.tmpdir(), `tipeline-does-not-exist-${Date.now()}.yaml`);

      expect(() => Parser.importFromFile(missingPath)).toThrow(YAMLParsingError);
      expect(() => Parser.importFromFile(missingPath)).toThrow(/File Reading Error/);
    });

    it('throws YAMLParsingError for a file containing invalid YAML', () => {
      const filePath = makeTempPath('invalid.yaml');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'name: "unterminated\n  bad: [1, 2', 'utf8');

      expect(() => Parser.importFromFile(filePath)).toThrow(YAMLParsingError);
      expect(() => Parser.importFromFile(filePath)).toThrow('Invalid YAML');
    });
  });
});
