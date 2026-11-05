import type {
  VariableObject,
  VariableType,
  VariableScope,
  VariableVisibility,
} from '@tipeline/types';

import { coreValidations } from '@tipeline/schemas';
import { coerceVariableValue } from '@utils/coerceVariableValue';

export class Variable {
  private type: VariableType;
  private name: string;
  private value: any;
  private description?: string;
  private readonly: boolean;
  private required: boolean;
  private scope: VariableScope;
  private secret: boolean;
  private visibility: VariableVisibility;
  private output: boolean;

  constructor(variableObject: VariableObject) {
    // Action 1: Set the value or default
    let value: any;
    if (variableObject.value === undefined || variableObject.value === null) {
      if (variableObject.required) {
        throw new Error(`Variable "${variableObject.name}" is required but has no value.`);
      } else {
        value = this.getDefaultValueForType(variableObject.type);
      }
    } else {
      value = variableObject.value;
    }

    // Action 2: Coerce value to correct type before validation
    const preprocessed = this.preprocessVariable({
      ...variableObject,
      value,
    });

    // Action 3: Validate using schema
    const parsed =
      coreValidations.variableObject.validations.create.creation.validate(preprocessed);

    // Action 4: Assign all parsed fields
    this.type = parsed.type;
    this.name = parsed.name;
    this.description = parsed.description;
    this.readonly = parsed.readonly ?? false;
    this.required = parsed.required ?? false;
    this.scope = parsed.scope ?? 'task';
    this.secret = parsed.secret ?? false;
    this.visibility = parsed.visibility ?? 'private';
    this.output = parsed.output ?? false;
    this.value = parsed.value;
  }

  private preprocessVariable(obj: any): any {
    return {
      ...obj,
      value: coerceVariableValue(obj.value, obj.type, obj.name),
    };
  }

  private getDefaultValueForType(type: VariableType): any {
    switch (type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      case 'date':
        return new Date().toISOString();
      // For complex types: dbConnection, sshConnection, browser, etc.
      default:
        return null; // intentionally no default
    }
  }

  public getName() {
    return this.name;
  }

  public getValue() {
    return this.value;
  }

  public setValue(value: any): void {
    if (this.readonly) {
      throw new Error(`Variable "${this.name}" is readonly and cannot be modified.`);
    }

    // Validate the new value
    coreValidations.variableObject.validations.setValue.runtime.validate({ value });

    // Don't coerce complex types, only primitives
    const processedValue = this.shouldCoerceType(this.type)
      ? coerceVariableValue(value, this.type, this.name)
      : value;

    const prev = this.value;
    this.value = processedValue;
    try {
      this.validate();
    } catch (e) {
      this.value = prev;
      throw e;
    }
  }

  private shouldCoerceType(type: VariableType): boolean {
    return ['string', 'number', 'boolean', 'date', 'array', 'object'].includes(type);
  }

  public async cleanup(): Promise<void> {
    if ((this.type === 'video' || this.type === 'audio') && typeof this.value?.cleanup === 'function') {
      this.value.cleanup();
    } else if (this.type === 'browser' && typeof this.value?.close === 'function') {
      try {
        await this.value.close();
      } catch {
        // browser may already be closed/crashed; nothing more we can do
      }
    }
  }

  private validate() {
    return coreValidations.variableObject.validations.validate.runtime.validate({
      type: this.type,
      name: this.name,
      value: this.value,
      description: this.description,
      readonly: this.readonly,
      required: this.required,
      scope: this.scope,
      secret: this.secret,
      visibility: this.visibility,
      output: this.output,
    });
  }

  public toObject(): VariableObject {
    return {
      type: this.type,
      name: this.name,
      value: this.value,
      description: this.description,
      readonly: this.readonly,
      required: this.required,
      scope: this.scope,
      secret: this.secret,
      visibility: this.visibility,
      ...(this.output ? { output: true } : {}),
    };
  }

  public getType() {
    return this.type;
  }

  public getDescription() {
    return this.description;
  }

  public isReadonly() {
    return this.readonly;
  }

  public isRequired() {
    return this.required;
  }

  public getScope(): VariableScope {
    return this.scope;
  }

  public isSecret() {
    return this.secret;
  }

  public getVisibility() {
    return this.visibility;
  }

  public isOutput() {
    return this.output;
  }

  // Static methods for common operations
  static create(variableObject: VariableObject): Variable {
    return new Variable(variableObject);
  }

  static validate(variableObject: VariableObject): boolean {
    try {
      coreValidations.variableObject.validations.validate.runtime.validate(variableObject);
      return true;
    } catch {
      return false;
    }
  }
}
