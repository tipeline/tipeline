import { z } from 'zod';
import { Task } from '@task/Task';
import { Action } from '@action/Action';
import { ActionFactory } from '@/action/ActionFactory';
import { Variable } from '@/variable/Variable';
import { parseStepParams } from '@utils/parseParams';
import { safeClone } from '@utils/safeClone';
import { validations } from '@tipeline/schemas';
import { evaluateCondition, type Condition } from '@tipeline/utils';

type IfConditionalParams = z.infer<typeof validations.flow.ifConditional.runtime.schema>;
type ElseIfConditionalParams = z.infer<typeof validations.flow.elseIfConditional.runtime.schema>;
type ElseConditionalParams = z.infer<typeof validations.flow.elseConditional.runtime.schema>;
type SwitchConditionalParams = z.infer<typeof validations.flow.switchConditional.runtime.schema>;
type CaseConditionalParams = z.infer<typeof validations.flow.caseConditional.runtime.schema>;
type DefaultConditionalParams = z.infer<typeof validations.flow.defaultConditional.runtime.schema>;
type SimpleLoopParams = z.infer<typeof validations.flow.simpleLoop.runtime.schema>;
type ForEachLoopParams = z.infer<typeof validations.flow.forEachLoop.runtime.schema>;
type WaitParams = z.infer<typeof validations.flow.wait.runtime.schema>;

interface SwitchState {
  __switch: true;
  expression: string;
  matched: boolean;
}

/**
 * @group Actions
 */
export class GroupFlow {
  // --------------------------------------------------
  // Conditionals
  // --------------------------------------------------

  /**
   * Runs the if-branch when the condition is met.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @returns true if the condition matched and the branch ran, false otherwise.
   * @example
   * ```yaml
   * # Run a branch when a value equals a string
   * - group: flow
   *   name: ifConditional
   *   params:
   *     firstOperand: '{{ status }}'
   *     compareAs: string
   *     operator: eq
   *     secondOperand: active
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: Status is active
   * ```
   */
  static async ifConditional(params: IfConditionalParams, task: Task): Promise<boolean> {
    const parsed = validations.flow.ifConditional.runtime.validate(params);

    if (GroupFlow.conditionHolds(parsed)) {
      const block = await task.getPipeline().createChildBlock(await GroupFlow.buildActons(parsed.actions ?? []));
      await block.run();
      return true;
    }

    return false;
  }

  /**
   * Evaluates an additional condition only when no prior branch has fired.
   * Propagates the "branch taken" flag so downstream else/else-if actions skip correctly.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @param lastResult - Whether a prior branch (if or else-if) already matched.
   * @returns true if any branch has now fired (prior or this one), false if none have.
   * @example
   * ```yaml
   * # Chain after ifConditional — runs only when the if-branch did not match
   * - group: flow
   *   name: elseIfConditional
   *   params:
   *     firstOperand: '{{ status }}'
   *     compareAs: string
   *     operator: eq
   *     secondOperand: pending
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: Status is pending
   * ```
   */
  static async elseIfConditional(
    params: ElseIfConditionalParams,
    task: Task,
    lastResult: boolean
  ): Promise<boolean> {
    if (!lastResult) {
      return await GroupFlow.ifConditional(params, task);
    }
    return true; // propagate: a prior branch already fired
  }

  /**
   * Runs the else-branch only when no prior branch has fired.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @param lastResult - Whether a prior branch (if or else-if) already matched.
   * @returns true always — the chain is resolved either way.
   * @example
   * ```yaml
   * # Fallback when no if/else-if condition matched
   * - group: flow
   *   name: elseConditional
   *   params:
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: No condition matched
   * ```
   */
  static async elseConditional(
    params: ElseConditionalParams,
    task: Task,
    lastResult: boolean
  ): Promise<boolean> {
    if (!lastResult) {
      const parsed = validations.flow.elseConditional.runtime.validate(params);
      const block = await task.getPipeline().createChildBlock(await GroupFlow.buildActons(parsed.actions ?? []));
      await block.run();
    }
    return true;
  }

  /**
   * Declares the expression that subsequent caseConditional actions will match against.
   * Must be immediately followed by one or more caseConditional actions, and optionally
   * a defaultConditional. Returns a SwitchState object that caseConditional reads via
   * lastResult — the same propagation pattern used by if/elseIf/else.
   *
   * @param params - The input parameters.
   * @returns A SwitchState object carrying the resolved expression.
   * @example
   * ```yaml
   * - group: flow
   *   name: switchConditional
   *   params:
   *     expression: '{{ fruit }}'
   * - group: flow
   *   name: caseConditional
   *   params:
   *     match: banana
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: it is a banana
   * - group: flow
   *   name: defaultConditional
   *   params:
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: unknown fruit
   * ```
   */
  static async switchConditional(params: SwitchConditionalParams): Promise<SwitchState> {
    const parsed = validations.flow.switchConditional.runtime.validate(params);
    return { __switch: true, expression: parsed.expression, matched: false };
  }

  /**
   * Runs the branch when the switch expression equals the match value and no prior
   * case has already fired. Propagates the SwitchState so subsequent cases and the
   * defaultConditional know whether to skip.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @param lastResult - The SwitchState returned by the preceding switchConditional or caseConditional.
   * @returns The updated SwitchState (matched=true if this case ran, unchanged otherwise).
   * @example
   * ```yaml
   * - group: flow
   *   name: caseConditional
   *   params:
   *     match: banana
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: banana case ran
   * ```
   */
  static async caseConditional(
    params: CaseConditionalParams,
    task: Task,
    lastResult: SwitchState
  ): Promise<SwitchState> {
    const parsed = validations.flow.caseConditional.runtime.validate(params);

    if (!lastResult?.__switch || lastResult.matched) {
      return lastResult; // not in switch context or already matched — skip
    }

    if (parsed.match === lastResult.expression) {
      const block = await task.getPipeline().createChildBlock(await GroupFlow.buildActons(parsed.actions ?? []));
      await block.run();
      return { __switch: true, expression: lastResult.expression, matched: true };
    }

    return lastResult;
  }

  /**
   * Runs the fallback branch when no caseConditional matched.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @param lastResult - The SwitchState propagated from the last caseConditional.
   * @returns true always — the switch chain is resolved.
   * @example
   * ```yaml
   * - group: flow
   *   name: defaultConditional
   *   params:
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: no case matched
   * ```
   */
  static async defaultConditional(
    params: DefaultConditionalParams,
    task: Task,
    lastResult: SwitchState
  ): Promise<boolean> {
    const parsed = validations.flow.defaultConditional.runtime.validate(params);

    if (lastResult?.__switch && !lastResult.matched) {
      const block = await task.getPipeline().createChildBlock(await GroupFlow.buildActons(parsed.actions ?? []));
      await block.run();
    }

    return true;
  }

  // --------------------------------------------------
  // Loops
  // --------------------------------------------------

  /**
   * Runs the body a fixed number of times, stepping from indexValue up to (but not
   * including) indexEndValue by incrementBy.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @returns true when the loop completes.
   * @example
   * ```yaml
   * # Repeat 5 times (iterations 0 → 4)
   * - group: flow
   *   name: simpleLoop
   *   params:
   *     indexValue: 0
   *     indexEndValue: 5
   *     incrementBy: 1
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: Loop iteration
   * ```
   */
  static async simpleLoop(
    params: SimpleLoopParams,
    task: Task,
    _lastResult: any,
    action: Action
  ): Promise<boolean> {
    const variables = task.getPipeline().getVariables();
    const parsed = validations.flow.simpleLoop.runtime.validate(params);
    const raw = action.getRawParams();
    const indexVar = GroupFlow.resolveNamedVariable(variables, parsed.indexVariable, 'simpleLoop', 'indexVariable');

    for (let i = parsed.indexValue; i < parsed.indexEndValue; i += parsed.incrementBy) {
      indexVar?.setValue(i);
      const actions = await GroupFlow.resolveLoopBodyActions(raw.actions);
      const block = await task.getPipeline().createChildBlock(actions, i);
      await block.run();
    }

    return true;
  }

  /**
   * Iterates over an array, binding each element to a task variable before running the body.
   *
   * @param params - The input parameters.
   * @param task - The running task.
   * @returns true when the loop completes.
   * @example
   * ```yaml
   * # Walk an array and process each item
   * - group: flow
   *   name: forEachLoop
   *   params:
   *     iterable: '{= myArray =}'
   *     currentItem: item
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: '{{ item }}'
   * ```
   */
  static async forEachLoop(
    params: ForEachLoopParams,
    task: Task,
    _lastResult: any,
    action: Action
  ): Promise<boolean> {
    const pipeline = task.getPipeline();
    const variables = pipeline.getVariables();
    const parsed = validations.flow.forEachLoop.runtime.validate(params);
    const raw = action.getRawParams();
    const currentItemVar = GroupFlow.resolveNamedVariable(variables, parsed.currentItem, 'forEachLoop', 'currentItem');
    const indexVar = GroupFlow.resolveNamedVariable(variables, parsed.indexVariable, 'forEachLoop', 'indexVariable');

    if (Array.isArray(parsed.iterable)) {
      for (let i = 0; i < parsed.iterable.length; i++) {
        currentItemVar?.setValue(parsed.iterable[i]);
        indexVar?.setValue(i);
        // Body actions must be rebuilt from the pristine raw params on every
        // iteration — otherwise {{ currentItem }} / {= currentItem =} references get
        // baked in with whatever value the variable held before the loop started.
        const actions = await GroupFlow.resolveLoopBodyActions(raw.actions);
        const block = await task.getPipeline().createChildBlock(actions, i);
        await block.run();
      }
    } else if (typeof parsed.iterable === 'string') {
      throw new Error(
        `forEachLoop: iterable did not resolve to an array (got a string: "${parsed.iterable}"). ` +
        `Check that the iterable field references the array variable correctly (e.g. "{= myArray =}").`
      );
    }

    return true;
  }

  /**
   * Runs the body repeatedly while the condition remains true, re-evaluating against
   * live variable values on every iteration.
   *
   * The condition operands are resolved from rawParams on each pass so that mutations
   * made to variables inside the loop body are reflected in the next check.
   * Throws after 10 000 iterations as a runaway-loop safety guard.
   *
   * @param _params - Pre-resolved params (unused — loop re-resolves from rawParams each iteration).
   * @param task - The running task.
   * @param _lastResult - Not used by loops.
   * @param action - The Action instance; provides rawParams for per-iteration re-resolution.
   * @returns true when the condition becomes false and the loop exits.
   * @example
   * ```yaml
   * # Increment counter until it reaches 5
   * - group: flow
   *   name: conditionalLoop
   *   params:
   *     firstOperand: '{= counter =}'
   *     compareAs: number
   *     operator: lt
   *     secondOperand: 5
   *     actions:
   *       - group: math
   *         name: add
   *         params:
   *           augend: '{= counter =}'
   *           addend: 1
   *         destination: counter
   * ```
   */
  static async conditionalLoop(
    _params: any,
    task: Task,
    _lastResult: any,
    action: Action
  ): Promise<boolean> {
    const pipeline = task.getPipeline();
    const variables = pipeline.getVariables();

    // Pristine source — never mutated. Used to re-resolve placeholders
    // every iteration so the condition reflects current variable values.
    const raw = action.getRawParams();

    const resolveAndValidate = async () => {
      const cloned = safeClone(raw);
      parseStepParams('flow', cloned, variables);
      return validations.flow.conditionalLoop.runtime.validate(cloned);
    };

    let parsed = await resolveAndValidate();
    const indexVar = GroupFlow.resolveNamedVariable(variables, parsed.indexVariable, 'conditionalLoop', 'indexVariable');

    const MAX_ITERATIONS = 10_000;
    let iterations = 0;

    while (GroupFlow.conditionHolds(parsed)) {
      if (iterations++ >= MAX_ITERATIONS) {
        throw new Error(`conditionalLoop exceeded maximum iterations (${MAX_ITERATIONS})`);
      }

      indexVar?.setValue(iterations - 1);

      const block = await task.getPipeline().createChildBlock(await GroupFlow.buildActons(parsed.actions ?? []), iterations);
      await block.run();

      parsed = await resolveAndValidate();
    }

    return true;
  }

  // --------------------------------------------------
  // Utilities
  // --------------------------------------------------

  /**
   * Pauses execution for the specified duration.
   *
   * @param params - The input parameters.
   * @returns true after the pause completes.
   * @example
   * ```yaml
   * # Wait 2 seconds before continuing
   * - group: flow
   *   name: wait
   *   params:
   *     timeout: 2000
   * ```
   */
  static async wait(params: WaitParams): Promise<boolean> {
    const parsed = validations.flow.wait.runtime.validate(params);
    await new Promise((resolve) => setTimeout(resolve, parsed.timeout ?? 1000));
    return true;
  }

  // --------------------------------------------------
  // Private helpers
  // --------------------------------------------------

  // If / ElseIf / Conditional Loop all evaluate their condition with the shared
  // engine; a value that can't be read as `compareAs` fails the step with a message
  // naming it, rather than quietly taking the else branch.
  private static conditionHolds(params: {
    firstOperand: unknown;
    compareAs: string;
    operator: string;
    secondOperand?: unknown;
    ignoreCase?: boolean;
  }): boolean {
    return evaluateCondition({
      value: params.firstOperand,
      compareAs: params.compareAs as Condition['compareAs'],
      operator: params.operator as Condition['operator'],
      compareTo: params.secondOperand,
      ignoreCase: params.ignoreCase,
    });
  }

  private static async buildActons(raw: any[]): Promise<Action[]> {
    const result: Action[] = [];
    for (let index = 0; index < raw.length; index++) {
      result.push(await ActionFactory.create(raw[index]));
    }
    return result;
  }

  // Builds fresh Action instances from the loop's pristine raw body-action
  // configs — still carrying their unresolved {{ }} / {= =} placeholders.
  // Must be called on every iteration and must NOT pre-resolve those
  // placeholders here: each child action resolves its own params from scratch
  // in Block.updateActionParams right before it individually executes, which is
  // what lets a later action in the same iteration see an earlier action's
  // destination-variable output, not just the value the loop variable held at
  // the start of the iteration. Pre-resolving eagerly (e.g. via a single
  // upfront parseParams pass over the whole body) would bake in stale values
  // for any action after the first.
  private static async resolveLoopBodyActions(rawActions: any[] | undefined): Promise<Action[]> {
    return GroupFlow.buildActons(rawActions ?? []);
  }

  private static getVariableByName(variables: Array<Variable>, name: string) {
    return variables.find((variable) => variable.getName() == name);
  }

  // Loop actions bind a running counter/item into a variable the author names
  // in the block config (e.g. indexVariable, currentItem). An empty/omitted
  // name means the author doesn't want the binding — return undefined and
  // skip it silently. A non-empty name that isn't a declared variable is a
  // configuration mistake and must fail loudly rather than binding nothing.
  private static resolveNamedVariable(
    variables: Array<Variable>,
    name: string | undefined,
    actionName: string,
    fieldName: string
  ): Variable | undefined {
    if (!name) return undefined;

    const variable = GroupFlow.getVariableByName(variables, name);
    if (!variable) {
      throw new Error(
        `${actionName}: ${fieldName} "${name}" is not a declared variable. Create it on the Variables page first.`
      );
    }
    return variable;
  }
}
