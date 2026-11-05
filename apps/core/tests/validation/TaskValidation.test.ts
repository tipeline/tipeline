import { describe, expect, it } from 'vitest';
import { TaskValidator } from '@validation/TaskValidation';
import { ValidationFormatError } from '@utils/errors';

function validTask() {
  return {
    name: 'Test Task',
    description: 'A test description',
    pipeline: {
      actions: [{ group: 'math', name: 'abs', params: {} }],
      variables: [{ type: 'string', name: 'foo', value: 'bar' }],
    },
  };
}

describe('TaskValidator', () => {
  describe('validateFormat', () => {
    it('returns the parsed task for a valid minimal task object', () => {
      const task = TaskValidator.validateFormat(validTask());

      expect(task.name).toBe('Test Task');
      expect(task.description).toBe('A test description');
      expect(task.pipeline.actions).toHaveLength(1);
    });

    it('throws a plain Error with the translation keys for a missing field', () => {
      const invalid = validTask();
      // @ts-expect-error - intentionally invalid fixture
      delete invalid.name;

      let thrown: any;
      try {
        TaskValidator.validateFormat(invalid);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(ValidationFormatError);
      expect(thrown.message).toContain('task.validationFailed');
      expect(thrown.message).toContain('task.name.required');
    });

    it('joins the keys when several fields are invalid', () => {
      const invalid: any = validTask();
      delete invalid.name;
      delete invalid.description;

      let thrown: any;
      try {
        TaskValidator.validateFormat(invalid);
      } catch (e) {
        thrown = e;
      }

      expect(thrown.message).toContain('task.name.required');
      expect(thrown.message).toContain('task.description.required');
    });

    it('throws when pipeline.actions is missing', () => {
      const invalid: any = validTask();
      delete invalid.pipeline.actions;

      expect(() => TaskValidator.validateFormat(invalid)).toThrow('task.validationFailed');
    });

    it('re-validates nested variable shapes and rejects an invalid one', () => {
      const invalid: any = validTask();
      invalid.pipeline.variables = [{ type: 'string', name: '' }];

      expect(() => TaskValidator.validateFormat(invalid)).toThrow(ValidationFormatError);
    });

    it('re-validates nested action shapes and rejects an invalid one', () => {
      const invalid: any = validTask();
      invalid.pipeline.actions = [{ group: 'math' }]; // missing "name"

      expect(() => TaskValidator.validateFormat(invalid)).toThrow(ValidationFormatError);
    });
  });

  describe('validateVariableShape', () => {
    it('returns the parsed variable for a valid variable', () => {
      const result = TaskValidator.validateVariableShape({ type: 'string', name: 'x', value: 'y' });
      expect(result.name).toBe('x');
      expect(result.value).toBe('y');
    });

    it('throws ValidationFormatError for an invalid variable name', () => {
      expect(() =>
        TaskValidator.validateVariableShape({ type: 'string', name: '' }, 'variables[0]')
      ).toThrow(ValidationFormatError);
    });

    it('includes the given path in the error message', () => {
      try {
        TaskValidator.validateVariableShape({ type: 'string', name: '' }, 'pipeline.variables[2]');
        throw new Error('expected validateVariableShape to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ValidationFormatError);
        expect(e.message).toContain('Invalid variable at pipeline.variables[2]');
      }
    });
  });

  describe('validateActionShape', () => {
    it('passes for a valid action', () => {
      expect(() =>
        TaskValidator.validateActionShape({ group: 'math', name: 'abs', params: {} })
      ).not.toThrow();
    });

    it('throws ValidationFormatError for a missing "name"', () => {
      expect(() => TaskValidator.validateActionShape({ group: 'math' })).toThrow(
        ValidationFormatError
      );
    });

    it('recursively validates nested actions under params.actions (e.g. loops)', () => {
      const action = {
        group: 'flow',
        name: 'loop',
        params: {
          actions: [
            { group: 'math', name: 'abs', params: {} },
            { group: 'bad' }, // missing "name"
          ],
        },
      };

      expect(() => TaskValidator.validateActionShape(action, 'pipeline.actions[0]')).toThrow(
        ValidationFormatError
      );
    });

    it('recursively validates nested actions under params.statements[].actions (e.g. conditionals)', () => {
      const action = {
        group: 'flow',
        name: 'if',
        params: {
          statements: [{ actions: [{ group: 'bad' }] }],
        },
      };

      expect(() => TaskValidator.validateActionShape(action, 'pipeline.actions[0]')).toThrow(
        ValidationFormatError
      );
    });

    it('recursively validates nested variables under params.variables', () => {
      const action = {
        group: 'subtask',
        name: 'run',
        params: {
          variables: [{ type: 'string', name: '' }],
        },
      };

      expect(() => TaskValidator.validateActionShape(action, 'pipeline.actions[0]')).toThrow(
        ValidationFormatError
      );
    });

    it('does not throw when nested actions/statements/variables are all valid', () => {
      const action = {
        group: 'flow',
        name: 'loop',
        params: {
          actions: [{ group: 'math', name: 'abs', params: {} }],
          statements: [{ actions: [{ group: 'math', name: 'abs', params: {} }] }],
          variables: [{ type: 'string', name: 'x', value: 'y' }],
        },
      };

      expect(() => TaskValidator.validateActionShape(action)).not.toThrow();
    });
  });

  describe('validateVariables', () => {
    it('throws ValidationFormatError when given a non-array', () => {
      expect(() => TaskValidator.validateVariables({} as any)).toThrow(ValidationFormatError);
      expect(() => TaskValidator.validateVariables({} as any)).toThrow(
        'Expected array at variables, got object'
      );
    });

    it('validates each entry in the array and returns the parsed results', () => {
      const result = TaskValidator.validateVariables([
        { type: 'string', name: 'a', value: 'x' },
        { type: 'number', name: 'b', value: 1 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('a');
      expect(result[1].name).toBe('b');
    });

    it('throws ValidationFormatError when one entry in the array is invalid', () => {
      expect(() =>
        TaskValidator.validateVariables([
          { type: 'string', name: 'a', value: 'x' },
          { type: 'string', name: '' },
        ])
      ).toThrow(ValidationFormatError);
    });
  });
});
