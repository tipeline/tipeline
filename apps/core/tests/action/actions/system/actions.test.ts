import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// child_process is mocked so runApplication never actually spawns a real process.
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { GroupSystem } from '@/action/actions/system/actions';

type FakeChildOptions = {
  pid?: number;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  emitError?: Error;
};

function createFakeChild(options: FakeChildOptions = {}) {
  const { pid = 4242, stdout = '', stderr = '', exitCode = 0, emitError } = options;
  const child: any = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    if (emitError) {
      child.emit('error', emitError);
    } else {
      child.emit('close', exitCode, null);
    }
  });

  return child;
}

describe('GroupSystem', () => {
  describe('message', () => {
    it('returns the given text', () => {
      expect(GroupSystem.message({ text: 'hello world' })).toBe('hello world');
    });

    it('throws a validation error when text is empty', () => {
      expect(() => GroupSystem.message({ text: '' })).toThrow();
    });

    it('throws a validation error when text is missing', () => {
      expect(() => GroupSystem.message({} as any)).toThrow();
    });
  });

  describe('runApplication', () => {
    beforeEach(() => {
      vi.mocked(spawn).mockReset();
    });

    it('resolves with trimmed stdout when the command exits with code 0', async () => {
      vi.mocked(spawn).mockReturnValue(createFakeChild({ stdout: '  hello output  \n' }) as any);

      const result = await GroupSystem.runApplication({ command: 'echo hello' } as any);
      expect(result).toBe('hello output');
    });

    it('splits a plain command and runs it without a shell', async () => {
      vi.mocked(spawn).mockReturnValue(createFakeChild({ stdout: 'ok' }) as any);

      await GroupSystem.runApplication({ command: 'echo ok' } as any);

      expect(spawn).toHaveBeenCalledWith(
        'echo',
        ['ok'],
        expect.objectContaining({ shell: false, stdio: 'pipe' })
      );
    });

    it('runs with explicit args and shell disabled by default', async () => {
      vi.mocked(spawn).mockReturnValue(createFakeChild({ stdout: 'ok' }) as any);

      await GroupSystem.runApplication({ command: 'echo', args: ['hello'] });

      expect(spawn).toHaveBeenCalledWith(
        'echo',
        ['hello'],
        expect.objectContaining({ shell: false, stdio: 'pipe' })
      );
    });

    it('rejects with stderr content when the process exits with a non-zero code', async () => {
      vi.mocked(spawn).mockReturnValue(
        createFakeChild({ exitCode: 1, stderr: 'boom failure' }) as any
      );

      await expect(GroupSystem.runApplication({ command: 'false' } as any)).rejects.toThrow(
        'boom failure'
      );
    });

    it('rejects when the child process emits an error event', async () => {
      vi.mocked(spawn).mockReturnValue(
        createFakeChild({ emitError: new Error('spawn ENOENT') }) as any
      );

      await expect(GroupSystem.runApplication({ command: 'does-not-exist' } as any)).rejects.toThrow(
        'spawn ENOENT'
      );
    });

    it('throws a validation error when command is missing', async () => {
      await expect(GroupSystem.runApplication({} as any)).rejects.toThrow();
    });
  });

  describe('terminateProcess', () => {
    let killSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    });

    afterEach(() => {
      killSpy.mockRestore();
    });

    it('sends SIGTERM by default', () => {
      expect(GroupSystem.terminateProcess({ pid: 999 })).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(999, 'SIGTERM');
    });

    it('sends the given signal', () => {
      GroupSystem.terminateProcess({ pid: 999, signal: 'SIGKILL' });
      expect(killSpy).toHaveBeenCalledWith(999, 'SIGKILL');
    });

    it('coerces a numeric-string pid to a number', () => {
      GroupSystem.terminateProcess({ pid: '999' as any });
      expect(killSpy).toHaveBeenCalledWith(999, 'SIGTERM');
    });

    it('throws a validation error when pid is not numeric', () => {
      expect(() => GroupSystem.terminateProcess({ pid: 'not-a-pid' } as any)).toThrow();
    });
  });

  describe('environment variables', () => {
    const key = 'TIPELINE_TEST_SYSTEM_VAR';

    afterEach(() => {
      delete process.env[key];
    });

    it('setEnvVariable sets a value in process.env', () => {
      expect(GroupSystem.setEnvVariable({ key, value: 'abc' })).toBe(true);
      expect(process.env[key]).toBe('abc');
    });

    it('getEnvVariable reads a previously set value', () => {
      process.env[key] = 'stored-value';
      expect(GroupSystem.getEnvVariable({ key })).toBe('stored-value');
    });

    it('getEnvVariable returns null for an unset variable', () => {
      expect(GroupSystem.getEnvVariable({ key: 'TIPELINE_TEST_DOES_NOT_EXIST' })).toBeNull();
    });

    it('deleteEnvVariable removes the variable', () => {
      process.env[key] = 'to-delete';
      expect(GroupSystem.deleteEnvVariable({ key })).toBe(true);
      expect(process.env[key]).toBeUndefined();
    });

    it('throws a validation error when key is missing', () => {
      expect(() => GroupSystem.setEnvVariable({ value: 'x' } as any)).toThrow();
      expect(() => GroupSystem.getEnvVariable({} as any)).toThrow();
      expect(() => GroupSystem.deleteEnvVariable({} as any)).toThrow();
    });
  });
});
