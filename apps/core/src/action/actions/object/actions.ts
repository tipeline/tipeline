import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { set, has, get, unset, cloneDeep, omit, merge, pick } from 'es-toolkit/compat';

type ParseParams = z.infer<typeof validations.object.parse.runtime.schema>;
type SetPropertyParams = z.infer<typeof validations.object.setProperty.runtime.schema>;
type HasPropertyParams = z.infer<typeof validations.object.hasProperty.runtime.schema>;
type GetPropertyParams = z.infer<typeof validations.object.getProperty.runtime.schema>;
type KeysParams = z.infer<typeof validations.object.keys.runtime.schema>;
type ValuesParams = z.infer<typeof validations.object.values.runtime.schema>;
type MergeParams = z.infer<typeof validations.object.merge.runtime.schema>;
type PickParams = z.infer<typeof validations.object.pick.runtime.schema>;
type OmitParams = z.infer<typeof validations.object.omit.runtime.schema>;
type CloneParams = z.infer<typeof validations.object.clone.runtime.schema>;
type EntriesParams = z.infer<typeof validations.object.entries.runtime.schema>;
type DeletePropertyParams = z.infer<typeof validations.object.deleteProperty.runtime.schema>;

/**
 * @group Actions
 */
export class GroupObject {
  // --------------------------------------------------
  // Parsing
  // --------------------------------------------------

  /**
   * Parses a JSON string into an object.
   *
   * @param params - The input parameters.
   * @returns The parsed object.
   * @throws If the input is not valid JSON or resolves to an array instead of an object.
   * @example
   * ```yaml
   * # Deserialize an API response body stored as a string into a workable object
   * - group: object
   *   name: parse
   *   params:
   *     text: '{{ responseBody }}'
   * ```
   */
  static async parse(params: ParseParams): Promise<Record<string, any>> {
    const { text } = validations.object.parse.runtime.validate(params);
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      throw new Error('Expected an object, but received an array');
    }

    return parsed;
  }

  // --------------------------------------------------
  // Property
  // --------------------------------------------------

  /**
   * Sets a nested property on an object using a dot or bracket path.
   *
   * @param params - The input parameters.
   * @returns The mutated object with the property set.
   * @throws If the provided value is not a valid object.
   * @example
   * ```yaml
   * # Update the retry count inside a nested config object
   * - group: object
   *   name: setProperty
   *   params:
   *     object: '{= config =}'
   *     property: 'connection.retries'
   *     value: 5
   * ```
   */
  static setProperty(params: SetPropertyParams): Record<string, any> {
    const { object, property, value } = validations.object.setProperty.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      throw new Error('Invalid object provided');
    }

    set(object, property, value);

    return object;
  }

  /**
   * Checks if a property exists in an object, supporting nested dot paths.
   *
   * @param params - The input parameters.
   * @returns `true` if the property exists, otherwise `false`.
   * @example
   * ```yaml
   * # Check whether the config has a nested auth token before making an API call
   * - group: object
   *   name: hasProperty
   *   params:
   *     object: '{= config =}'
   *     property: 'auth.token'
   * ```
   */
  static hasProperty(params: HasPropertyParams): boolean {
    const { object, property } = validations.object.hasProperty.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return false;
    }

    return has(object, property);
  }

  /**
   * Gets a nested property value from an object, with an optional fallback.
   *
   * @param params - The input parameters.
   * @returns The property value, or `defaultValue` if the path is not found.
   * @example
   * ```yaml
   * # Read a nested setting from a user profile, falling back to 'en' if unset
   * - group: object
   *   name: getProperty
   *   params:
   *     object: '{= userProfile =}'
   *     property: 'settings.language'
   *     defaultValue: en
   * ```
   */
  static getProperty(params: GetPropertyParams): any {
    const {
      object,
      property,
      defaultValue = null,
    } = validations.object.getProperty.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return defaultValue;
    }

    return get(object, property, defaultValue);
  }

  // --------------------------------------------------
  // Inspection
  // --------------------------------------------------

  /**
   * Returns all top-level keys from an object.
   *
   * @param params - The input parameters.
   * @returns An array of key strings, or an empty array if the input is invalid.
   * @example
   * ```yaml
   * # List the top-level fields of a parsed API response for dynamic iteration
   * - group: object
   *   name: keys
   *   params:
   *     object: '{= responseData =}'
   * ```
   */
  static keys(params: KeysParams): string[] {
    const { object } = validations.object.keys.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return [];
    }

    return Object.keys(object);
  }

  /**
   * Returns all top-level values from an object.
   *
   * @param params - The input parameters.
   * @returns An array of values, or an empty array if the input is invalid.
   * @example
   * ```yaml
   * # Extract all config values for bulk validation before a pipeline run
   * - group: object
   *   name: values
   *   params:
   *     object: '{= config =}'
   * ```
   */
  static values(params: ValuesParams): any[] {
    const { object } = validations.object.values.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return [];
    }

    return Object.values(object);
  }

  /**
   * Returns all key-value pairs from an object as an array of `[key, value]` entries.
   *
   * @param params - The input parameters.
   * @returns An array of `[key, value]` tuples, or an empty array if the input is invalid.
   * @example
   * ```yaml
   * # Get all entries from a config object for dynamic iteration over key-value pairs
   * - group: object
   *   name: entries
   *   params:
   *     object: '{= config =}'
   * ```
   */
  static entries(params: EntriesParams): [string, any][] {
    const { object } = validations.object.entries.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return [];
    }

    return Object.entries(object);
  }

  // --------------------------------------------------
  // Transform
  // --------------------------------------------------

  /**
   * Deep-merges multiple objects into a single object.
   *
   * Later objects in the list override earlier ones at each nested level.
   *
   * @param params - The input parameters.
   * @returns The merged object, or `{}` if the input list is empty.
   * @example
   * ```yaml
   * # Merge default config with environment-specific overrides before running a task
   * - group: object
   *   name: merge
   *   params:
   *     objects:
   *       - '{= defaultConfig =}'
   *       - '{= overrides =}'
   * ```
   */
  static merge(params: MergeParams): any {
    const { objects } = validations.object.merge.runtime.validate(params);

    if (!Array.isArray(objects) || objects.length === 0) {
      return {};
    }

    return merge({}, ...objects);
  }

  /**
   * Picks a subset of properties from an object by name.
   *
   * @param params - The input parameters.
   * @returns A new object containing only the specified properties.
   * @example
   * ```yaml
   * # Extract only the fields needed before forwarding to an external API
   * - group: object
   *   name: pick
   *   params:
   *     object: '{= userProfile =}'
   *     properties:
   *       - name
   *       - email
   * ```
   */
  static pick(params: PickParams): any {
    const { object, properties } = validations.object.pick.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return {};
    }

    return pick(object, properties);
  }

  /**
   * Returns a copy of an object with the specified properties removed.
   *
   * @param params - The input parameters.
   * @returns A new object without the omitted properties.
   * @example
   * ```yaml
   * # Strip internal tracking fields before logging a pipeline result
   * - group: object
   *   name: omit
   *   params:
   *     object: '{= pipelineResult =}'
   *     properties:
   *       - _id
   *       - _createdAt
   * ```
   */
  static omit(params: OmitParams): any {
    const { object, properties } = validations.object.omit.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      return {};
    }

    return omit(object, properties);
  }

  /**
   * Deletes a nested property from an object using a dot or bracket path.
   *
   * @param params - The input parameters.
   * @returns The mutated object with the property removed.
   * @throws If the provided value is not a valid object.
   * @example
   * ```yaml
   * # Remove a nested auth token from the config before passing it to a logger
   * - group: object
   *   name: deleteProperty
   *   params:
   *     object: '{= config =}'
   *     property: 'auth.token'
   * ```
   */
  static deleteProperty(params: DeletePropertyParams): Record<string, any> {
    const { object, property } = validations.object.deleteProperty.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      throw new Error('Invalid object provided');
    }

    unset(object, property);

    return object;
  }

  /**
   * Creates a deep copy of an object.
   *
   * @param params - The input parameters.
   * @returns A new object that is a deep clone of the input.
   * @throws If the input is not a valid object.
   * @example
   * ```yaml
   * # Clone the shared config before mutating it for a specific pipeline branch
   * - group: object
   *   name: clone
   *   params:
   *     object: '{= config =}'
   * ```
   */
  static clone(params: CloneParams): any {
    const { object } = validations.object.clone.runtime.validate(params);

    if (!object || typeof object !== 'object') {
      throw new Error('Invalid object provided');
    }

    return cloneDeep(object);
  }
}
