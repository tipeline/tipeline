import { assertNoLocalFiles } from '@utils/localFileReferences';
import { Task } from '@task/Task';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';
import { coerceVariableValue } from '@utils/coerceVariableValue';
import dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';

export class TaskFactory {
  static async fromFile(
    taskPath: string,
    identifier: string,
    correlationId: string,
    variableOverrides: Record<string, any> = {}
  ): Promise<Task> {
    const absolutePath = path.resolve(taskPath);
    TaskFactory.loadEnvFiles(path.dirname(absolutePath));
    const parsedTask: any = Parser.importFromFile(absolutePath);
    if (
      Object.keys(variableOverrides).length > 0 &&
      Array.isArray(parsedTask?.pipeline?.variables)
    ) {
      for (const variable of parsedTask.pipeline.variables) {
        if (Object.prototype.hasOwnProperty.call(variableOverrides, variable.name)) {
          // Coerce to the variable's declared type — see JobExecutor.ts's
          // applyVariableOverrides for why this matters (loosely-typed overrides,
          // e.g. from Desktop's subtask.exec props editor, would otherwise fail
          // TaskValidator's type-strict schema check below).
          variable.value = coerceVariableValue(variableOverrides[variable.name], variable.type, variable.name);
        }
      }
    }
    const task = await TaskFactory.createTask(parsedTask, identifier, correlationId);
    task.setFilePath(absolutePath);
    return task;
  }

  /** A workflow sent as its contents, from a client on another machine. */
  static async fromContent(
    content: string,
    identifier: string,
    correlationId: string,
    variableOverrides: Record<string, any> = {}
  ): Promise<Task> {
    TaskFactory.loadEnvFiles();
    const parsedTask: any = Parser.importFromString(content);
    assertNoLocalFiles(parsedTask);
    for (const variable of parsedTask?.pipeline?.variables ?? []) {
      if (Object.prototype.hasOwnProperty.call(variableOverrides, variable.name)) {
        variable.value = coerceVariableValue(variableOverrides[variable.name], variable.type, variable.name);
      }
    }
    return await TaskFactory.createTask(parsedTask, identifier, correlationId);
  }

  static async fromSource(source: any, identifier: string, correlationId: string): Promise<Task> {
    TaskFactory.loadEnvFiles();
    return await TaskFactory.createTask(source, identifier, correlationId);
  }

  // Loads .env from the task's directory first (higher precedence), then ~/.tipeline/.env.
  // dotenv.config skips keys already set in process.env, so local always wins.
  private static loadEnvFiles(taskDir?: string): void {
    if (taskDir) {
      dotenv.config({ path: path.join(taskDir, '.env') });
    }
    dotenv.config({ path: path.join(os.homedir(), '.tipeline', '.env') });
  }

  private static async createTask(parsedTask: any, identifier: string, correlationId: string) {
    const validatedTask = TaskValidator.validateFormat(parsedTask);

    const { variables, actions } = validatedTask.pipeline;

    const task = new Task();

    task.setIdentifier(identifier);
    task.setCorrelationId(correlationId);
    task.setName(validatedTask.name);
    task.setDescription(validatedTask.description);

    if (variables) {
      await task.loadVariables(variables);
    }

    await task.loadActions(actions);

    return task;
  }
}
