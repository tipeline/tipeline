import { describe, expect, it } from 'vitest';
import {
  TaskError,
  YAMLParsingError,
  ValidationFormatError,
  ActionExecutionError,
  TaskLoadError,
} from '@utils/errors';

describe('errors', () => {
  describe('TaskError', () => {
    it('extends Error and sets the message', () => {
      const error = new TaskError('base failure');

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('base failure');
      expect(error.name).toBe('TaskError');
    });
  });

  describe('YAMLParsingError', () => {
    it('extends TaskError/Error and sets name to its own class name', () => {
      const error = new YAMLParsingError('bad yaml');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TaskError);
      expect(error).toBeInstanceOf(YAMLParsingError);
      expect(error.name).toBe('YAMLParsingError');
      expect(error.message).toBe('bad yaml');
    });
  });

  describe('ValidationFormatError', () => {
    it('extends TaskError/Error and sets name to its own class name', () => {
      const error = new ValidationFormatError('bad shape');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TaskError);
      expect(error).toBeInstanceOf(ValidationFormatError);
      expect(error.name).toBe('ValidationFormatError');
      expect(error.message).toBe('bad shape');
    });
  });

  describe('ActionExecutionError', () => {
    it('extends TaskError/Error and sets name to its own class name', () => {
      const error = new ActionExecutionError('action failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TaskError);
      expect(error).toBeInstanceOf(ActionExecutionError);
      expect(error.name).toBe('ActionExecutionError');
      expect(error.message).toBe('action failed');
    });
  });

  describe('TaskLoadError', () => {
    it('extends TaskError/Error and sets name to its own class name', () => {
      const error = new TaskLoadError('load failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TaskError);
      expect(error).toBeInstanceOf(TaskLoadError);
      expect(error.name).toBe('TaskLoadError');
      expect(error.message).toBe('load failed');
    });
  });
});
