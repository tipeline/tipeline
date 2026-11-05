import type { InputComponents } from './interface'
import AutoFormFieldArray from './AutoFormFieldArray.vue'
import AutoFormFieldBoolean from './AutoFormFieldBoolean.vue'
import AutoFormFieldBrowserSelect from './AutoFormFieldBrowserSelect.vue'
import AutoFormFieldCodeMirror from './AutoFormFieldCodeMirror.vue'
import AutoFormFieldCodeMirrorTemplate from './AutoFormFieldCodeMirrorTemplate.vue'
import AutoFormFieldDate from './AutoFormFieldDate.vue'
import AutoFormFieldDateString from './AutoFormFieldDateString.vue'
import AutoFormFieldDatetime from './AutoFormFieldDatetime.vue'
import AutoFormFieldEnum from './AutoFormFieldEnum.vue'
import AutoFormFieldFile from './AutoFormFieldFile.vue'
import AutoFormFieldInput from './AutoFormFieldInput.vue'
import AutoFormFieldNumber from './AutoFormFieldNumber.vue'
import AutoFormFieldObject from './AutoFormFieldObject.vue'
import AutoFormFieldPathSelect from './AutoFormFieldPathSelect.vue'
import AutoFormFieldRecord from './AutoFormFieldRecord.vue'
import AutoFormFieldTaskSelect from './AutoFormFieldTaskSelect.vue'
import AutoFormFieldTextareaVariable from './AutoFormFieldTextareaVariable.vue'
import AutoFormFieldVariableSelect from './AutoFormFieldVariableSelect.vue'

export const INPUT_COMPONENTS: InputComponents = {
  date: AutoFormFieldDate,
  datestring: AutoFormFieldDateString,
  datetime: AutoFormFieldDatetime,
  select: AutoFormFieldEnum,
  radio: AutoFormFieldEnum,
  checkbox: AutoFormFieldBoolean,
  switch: AutoFormFieldBoolean,
  textarea: AutoFormFieldInput,
  number: AutoFormFieldNumber,
  string: AutoFormFieldInput,
  file: AutoFormFieldFile,
  array: AutoFormFieldArray,
  object: AutoFormFieldObject,
  record: AutoFormFieldRecord,
  codemirror: AutoFormFieldCodeMirror,
  'codemirror-template': AutoFormFieldCodeMirrorTemplate,
  'task-select': AutoFormFieldTaskSelect,
  'browser-select': AutoFormFieldBrowserSelect,
  'path-select': AutoFormFieldPathSelect,
  'textarea-variable': AutoFormFieldTextareaVariable,
  'variable-select': AutoFormFieldVariableSelect,
}

/**
 * Define handlers for specific Zod types.
 * You can expand this object to support more types.
 */
export const DEFAULT_ZOD_HANDLERS: {
  [key: string]: keyof typeof INPUT_COMPONENTS
} = {
  ZodString: 'string',
  ZodBoolean: 'checkbox',
  ZodDate: 'date',
  ZodEnum: 'select',
  ZodNativeEnum: 'select',
  ZodNumber: 'number',
  ZodArray: 'array',
  ZodObject: 'object',
  ZodRecord: 'record',
  ZodAny: 'textarea',
  ZodUnknown: 'textarea',
}
