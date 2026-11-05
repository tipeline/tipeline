import { ValidationFormatError } from '@utils/errors';
import type { ZodTypeAny } from 'zod';
import { coreValidations, getValidation, isCacheableAction, uncacheableSteps } from '@tipeline/schemas';
import { PluginSchemaRegistry } from '@/plugin/PluginSchemaRegistry';
import { readableValidationError } from '@utils/readableError';
import { isPluginActionCacheable } from '@/plugin/PluginCacheableRegistry';
import { ActionFactory } from '@action/ActionFactory';

export class TaskValidator {
  /**
   * Validate the entire task structure (outer object)
   */
  static validateFormat(data: unknown) {
    try {
      // Use the validate method which throws on error
      const task = coreValidations.taskObject.validations.task.creation.validate(data);

      // Validate variables if they exist
      if (task.pipeline?.variables) {
        const seenNames = new Map<string, number>();
        task.pipeline.variables.forEach((variable: any, index: number) => {
          TaskValidator.validateVariableShape(variable, `pipeline.variables[${index}]`);

          if (variable?.name) {
            const firstIndex = seenNames.get(variable.name);
            if (firstIndex !== undefined) {
              throw new ValidationFormatError(
                `Duplicate variable name "${variable.name}" at pipeline.variables[${index}] (already defined at pipeline.variables[${firstIndex}]).`
              );
            }
            seenNames.set(variable.name, index);
          }
        });
      }

      // Recursively validate all actions structure (including nested ones)
      if (task.pipeline?.actions) {
        task.pipeline.actions.forEach((action: any, index: number) => {
          TaskValidator.validateActionShape(action, `pipeline.actions[${index}]`);
        });
      }

      // A cached workflow skips every step on a hit, so each one must be safe to skip.
      if ((task as any).cache) {
        const blocking = uncacheableSteps(task.pipeline?.actions ?? [], isPluginActionCacheable);
        if (blocking.length > 0) {
          throw new ValidationFormatError(
            `This workflow can't be cached: these steps change things outside the run or can't be reused — ${blocking.join(', ')}.`
          );
        }
      }

      return task;
    } catch (error: any) {
      // Handle Zod validation errors
      if (error.issues) {
        const message = error.issues.map((e: any) => e.message).join('\n');

        throw new Error(`task.validationFailed\n${message}`);
      }

      // Re-throw if it's not a Zod error
      throw error;
    }
  }

  /**
   * Validate the shape of a variable using Zod
   */

  static validateVariableShape(variable: any, path = '') {
    try {
      // Use the validate method which throws on error
      const result = coreValidations.variableObject.validations.create.creation.validate(variable);
      return result;
    } catch (error: any) {
      // Handle Zod validation errors
      if (error.issues) {
        const message = error.issues.map((e: any) => e.message).join('\n');

        throw new ValidationFormatError(`Invalid variable at ${path}:\n${message}`);
      }

      // Re-throw if it's not a Zod error
      throw error;
    }
  }

  /**
   * Recursively validate the shape of a action (including nested actions) using Zod
   */
  static validateActionShape(action: any, path = '') {
    try {
      // Use the validate method from coreValidations
      coreValidations.taskObject.validations.actionShape.creation.validate(action);
    } catch (error: any) {
      // Handle Zod validation errors
      if (error.issues) {
        const message = error.issues.map((e: any) => e.message).join('\n');

        throw new ValidationFormatError(`Invalid action at ${path}:\n${message}`);
      }

      // Re-throw if it's not a Zod error
      throw error;
    }

    if (action?.cache) {
      const cacheable =
        action.source === 'plugin'
          ? isPluginActionCacheable(action.group, action.name)
          : isCacheableAction(action.group, action.name);
      if (!cacheable) {
        throw new ValidationFormatError(
          `Invalid action at ${path}: ${action.group}.${action.name} can't be cached — it changes things outside the run, or its result can't be reused.`
        );
      }
    }

    // actionShape.creation only validates generic shape (params is z.record(z.any())),
    // not each action type's own schema — so the http action's allowPrivateNetwork being
    // a plain boolean in packages/schemas doesn't by itself stop someone from writing
    // `allowPrivateNetwork: '{= someVariable =}'` in raw task source; parseParams resolves
    // template strings on every param regardless of its declared type. Catch that case
    // explicitly, here, against the pristine pre-substitution source: this flag must be a
    // security decision the task author made directly, not something a runtime variable
    // (webhook payload, a previous step's result) can end up controlling.
    if (
      action?.group === 'http' &&
      (action?.name === 'request' || action?.name === 'downloadFile') &&
      'allowPrivateNetwork' in (action?.params ?? {}) &&
      typeof action.params.allowPrivateNetwork !== 'boolean'
    ) {
      throw new ValidationFormatError(
        `Invalid action at ${path}: allowPrivateNetwork must be a literal true/false — it cannot reference a variable or template.`
      );
    }

    // Case 1: Nested actions directly under params.actions (e.g., loops)
    if (action.params?.actions && Array.isArray(action.params.actions)) {
      action.params.actions.forEach((nestedAction: any, idx: number) => {
        TaskValidator.validateActionShape(nestedAction, `${path}.params.actions[${idx}]`);
      });
    }

    // Case 2: Nested actions inside params.statements[].actions (e.g., conditionals)
    if (Array.isArray(action.params?.statements)) {
      action.params.statements.forEach((statement: any, stmtIdx: number) => {
        if (Array.isArray(statement.actions)) {
          statement.actions.forEach((nestedAction: any, idx: number) => {
            TaskValidator.validateActionShape(
              nestedAction,
              `${path}.params.statements[${stmtIdx}].actions[${idx}]`
            );
          });
        }
      });
    }

    // Case 3: Variables nested in actions (if actions can have their own variables)
    if (action.params?.variables && Array.isArray(action.params.variables)) {
      action.params.variables.forEach((variable: any, idx: number) => {
        TaskValidator.validateVariableShape(variable, `${path}.params.variables[${idx}]`);
      });
    }
  }

  /**
   * Recursively checks that every action's group/name refers to a real
   * built-in or plugin action, using the same registry ActionFactory.create
   * enforces at execution time — the one check validateFormat/validateActionShape
   * don't do, since they only validate structure (params.actions/statements are
   * generic records, not a check against what's actually registered). Returns
   * one message per bad action instead of throwing, so a caller can report all
   * of them at once.
   */
  static async validateActionTypes(
    actions: any[],
    path = 'pipeline.actions',
    options: { params?: boolean } = {}
  ): Promise<string[]> {
    const errors: string[] = [];
    if (!Array.isArray(actions)) return errors;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionPath = `${path}[${i}]`;

      if (action?.group && action?.name) {
        const known = await ActionFactory.actionTypeIsKnown(action.group, action.name, action.source);
        if (!known) {
          errors.push(`Unknown action "${action.group}.${action.name}" at ${actionPath}.`);
        } else if (options.params) {
          let schema: ZodTypeAny | null = null;
          try {
            schema = getValidation(action.group as any, action.name, 'creation').schema;
          } catch {
            schema = PluginSchemaRegistry[action.group]?.[action.name] ?? null;
          }
          const result = schema?.safeParse(action.params ?? {});
          if (result && !result.success) {
            errors.push(
              `${action.group}.${action.name} at ${actionPath}: ${readableValidationError(JSON.stringify(result.error.issues))}`
            );
          }
        }
      }

      if (Array.isArray(action?.params?.actions)) {
        errors.push(
          ...(await TaskValidator.validateActionTypes(action.params.actions, `${actionPath}.params.actions`, options))
        );
      }

      if (Array.isArray(action?.params?.statements)) {
        for (let s = 0; s < action.params.statements.length; s++) {
          const statement = action.params.statements[s];
          if (Array.isArray(statement?.actions)) {
            errors.push(
              ...(await TaskValidator.validateActionTypes(
                statement.actions,
                `${actionPath}.params.statements[${s}].actions`,
                options
              ))
            );
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate multiple variables at once
   */
  static validateVariables(variables: any[], path = 'variables') {
    if (!Array.isArray(variables)) {
      throw new ValidationFormatError(`Expected array at ${path}, got ${typeof variables}`);
    }

    return variables.map((variable, index) => {
      return TaskValidator.validateVariableShape(variable, `${path}[${index}]`);
    });
  }
}
