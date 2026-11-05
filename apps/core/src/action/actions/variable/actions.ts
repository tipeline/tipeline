import { z } from 'zod';
import { Variable } from '@/variable/Variable';
import { Task } from '@task/Task';
import { validations } from '@tipeline/schemas';
import { GlobalVariableService } from '@/database/services/GlobalVariableService';
import { PipelineVariableService } from '@/database/services/PipelineVariableService';
import { isNonSerializableVariableType } from '@utils/nonSerializableTypes';

type SetParams = z.infer<typeof validations.variable.set.runtime.schema>;

/**
 * @group Actions
 */
export class GroupVariable {
  // --------------------------------------------------
  // Mutation
  // --------------------------------------------------

  /**
   * Sets the value of an existing pipeline variable by name.
   *
   * @param params - The input parameters.
   * @param task - The running task instance.
   * @returns `true` when the variable is updated, `undefined` if not found.
   * @example
   * ```yaml
   * # Overwrite a task variable mid-pipeline — useful for tracking loop state or computed values
   * - group: variable
   *   name: set
   *   params:
   *     name: greeting
   *     value: Hello Tipeline
   * ```
   * @example
   * ```yaml
   * # Set a variable to an object using raw injection — value must be the entire field
   * - group: variable
   *   name: set
   *   params:
   *     name: config
   *     value: '{= config =}'
   * ```
   */
  static async set(params: SetParams, task: Task): Promise<true> {
    const { name, value } = validations.variable.set.runtime.validate(params);

    if (name.startsWith('_global.')) {
      const globalName = name.slice('_global.'.length);
      const record = await GlobalVariableService.getByName(globalName);
      if (!record) throw new Error(`Global variable "${globalName}" does not exist.`);
      if (record.readonly) throw new Error(`Global variable "${globalName}" is readonly and cannot be modified.`);
      await GlobalVariableService.update({ identifier: record.identifier, value });
      return true;
    }

    const pipeline = task.getPipeline();
    const variables = pipeline.getVariables();
    const variable = GroupVariable.getVariableByName(variables, name);
    if (!variable) throw new Error(`Pipeline variable "${name}" does not exist.`);
    variable.setValue(value);

    if (task.getShouldSave()) {
      const persistedValue = isNonSerializableVariableType(variable.getType())
        ? null
        : variable.getValue();
      const [blockId] = pipeline.getCurrentContext();
      await PipelineVariableService.updateValue(
        pipeline.getId(),
        name,
        persistedValue,
        {
          blockId,
          scope: variable.getScope(),
          type: variable.getType(),
        },
        { sensitive: pipeline.containsSecret(persistedValue) }
      );
    }

    return true;
  }

  private static getVariableByName(variables: Array<Variable>, name: string) {
    return variables.find((variable) => variable.getName() == name);
  }
}
