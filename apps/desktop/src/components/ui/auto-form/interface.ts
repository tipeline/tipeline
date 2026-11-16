import type { Component, InputHTMLAttributes } from 'vue'
import type { z, ZodAny } from 'zod'
import type { INPUT_COMPONENTS } from './constant'

export interface FieldProps {
  fieldName: string
  label?: string
  required?: boolean
  config?: ConfigItem
  disabled?: boolean
  /** Holds any value, not text: references picked into it keep their type (`{= x =}`). */
  valueField?: boolean
}

export interface Shape {
  type: string
  default?: any
  required?: boolean
  options?: string[]
  schema?: ZodAny
}

export interface InputComponents {
  date: Component
  datestring: Component
  datetime: Component
  select: Component
  radio: Component
  checkbox: Component
  switch: Component
  textarea: Component
  number: Component
  string: Component
  file: Component
  array: Component
  object: Component
  record: Component
  codemirror: Component
  'codemirror-template': Component
  'task-select': Component
  'browser-select': Component
  'path-select': Component
  'textarea-variable': Component
  'variable-select': Component
}

export interface ConfigItem {
  /** Value for the `FormLabel` */
  label?: string
  /** Value for the `FormDescription` */
  description?: string
  /** Pick which component to be rendered. */
  component?: keyof typeof INPUT_COMPONENTS | Component
  /** Hide `FormLabel`. */
  hideLabel?: boolean
  inputProps?: InputHTMLAttributes
  /** For `path-select` fields: whether Browse opens a native Open or Save dialog. */
  dialogMode?: 'open' | 'save'
  /** Friendly label per enum value, e.g. `{ eq: 'Equals' }`. Falls back to `beautifyObjectName` when absent. */
  optionLabels?: Record<string, string>
  /** For `variable-select` fields: restricts the picker to variables of this type. Omit to allow any type. */
  variableType?: string
  /** For `variable-select` fields: base name suggested when creating a new variable inline (e.g. "index"). */
  suggestedName?: string
  /** For `codemirror` fields: adds a Run button + Output tab that runs the code as a `script.runScript` step. */
  scriptPreview?: boolean
  /** For `codemirror` fields: syntax highlighting language. Defaults to JavaScript. */
  language?: 'javascript' | 'sql'
  /** For `record` fields: holds any value (a request body) — Raw JSON also takes arrays/scalars/text, and it opens there. */
  anyJson?: boolean
}

// Define a type to unwrap an array
type UnwrapArray<T> = T extends (infer U)[] ? U : never

export type Config<SchemaType extends object> = {
  // If SchemaType.key is an object, create a nested Config, otherwise ConfigItem
  [Key in keyof SchemaType]?:
  SchemaType[Key] extends any[]
    ? UnwrapArray<Config<SchemaType[Key]>>
    : SchemaType[Key] extends object
      ? Config<SchemaType[Key]>
      : ConfigItem;
}

export enum DependencyType {
  DISABLES,
  REQUIRES,
  HIDES,
  SETS_OPTIONS,
  SETS_LABEL,
}

interface BaseDependency<SchemaType extends z.infer<z.ZodObject<any, any>>> {
  sourceField: keyof SchemaType
  type: DependencyType
  targetField: keyof SchemaType
  when: (sourceFieldValue: any, targetFieldValue: any) => boolean
}

export type ValueDependency<SchemaType extends z.infer<z.ZodObject<any, any>>> =
  BaseDependency<SchemaType> & {
    type:
      | DependencyType.DISABLES
      | DependencyType.REQUIRES
      | DependencyType.HIDES
  }

export type EnumValues = readonly [string, ...string[]]

export type OptionsDependency<
  SchemaType extends z.infer<z.ZodObject<any, any>>,
> = BaseDependency<SchemaType> & {
  type: DependencyType.SETS_OPTIONS

  // Partial array of values from sourceField that will trigger the dependency
  options: EnumValues
}

export type LabelDependency<SchemaType extends z.infer<z.ZodObject<any, any>>> =
  BaseDependency<SchemaType> & {
    type: DependencyType.SETS_LABEL

    // Label to show on targetField while the condition holds
    label: string
  }

export type Dependency<SchemaType extends z.infer<z.ZodObject<any, any>>> =
  | ValueDependency<SchemaType>
  | OptionsDependency<SchemaType>
  | LabelDependency<SchemaType>
