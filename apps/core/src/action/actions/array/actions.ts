import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { ConditionError, evaluateCondition, type Condition } from '@tipeline/utils';

import {
  uniq,
  compact,
  chunk,
  intersection,
  union,
  difference,
  orderBy,
  groupBy as groupByFn,
  keyBy as keyByFn,
  shuffle as shuffleFn,
  sample as sampleFn,
} from 'es-toolkit';
import { get } from 'es-toolkit/compat';

type ParseParams = z.infer<typeof validations.array.parse.runtime.schema>;
type ToStringParams = z.infer<typeof validations.array.toString.runtime.schema>;
type LengthParams = z.infer<typeof validations.array.length.runtime.schema>;
type ContainsParams = z.infer<typeof validations.array.contains.runtime.schema>;
type GetParams = z.infer<typeof validations.array.get.runtime.schema>;
type PushParams = z.infer<typeof validations.array.push.runtime.schema>;
type RemoveParams = z.infer<typeof validations.array.remove.runtime.schema>;
type UniqueParams = z.infer<typeof validations.array.unique.runtime.schema>;
type CompactParams = z.infer<typeof validations.array.compact.runtime.schema>;
type FindParams = z.infer<typeof validations.array.find.runtime.schema>;
type FilterParams = z.infer<typeof validations.array.filter.runtime.schema>;
type SomeParams = z.infer<typeof validations.array.some.runtime.schema>;
type EveryParams = z.infer<typeof validations.array.every.runtime.schema>;
type CountParams = z.infer<typeof validations.array.count.runtime.schema>;
type PluckParams = z.infer<typeof validations.array.pluck.runtime.schema>;
type GroupByParams = z.infer<typeof validations.array.groupBy.runtime.schema>;
type KeyByParams = z.infer<typeof validations.array.keyBy.runtime.schema>;
type ShuffleParams = z.infer<typeof validations.array.shuffle.runtime.schema>;
type SampleParams = z.infer<typeof validations.array.sample.runtime.schema>;
type ChunkParams = z.infer<typeof validations.array.chunk.runtime.schema>;
type FlattenParams = z.infer<typeof validations.array.flatten.runtime.schema>;
type IntersectionParams = z.infer<typeof validations.array.intersection.runtime.schema>;
type UnionParams = z.infer<typeof validations.array.union.runtime.schema>;
type DifferenceParams = z.infer<typeof validations.array.difference.runtime.schema>;
type SortParams = z.infer<typeof validations.array.sort.runtime.schema>;
type ReverseParams = z.infer<typeof validations.array.reverse.runtime.schema>;
type SliceParams = z.infer<typeof validations.array.slice.runtime.schema>;
type ConcatParams = z.infer<typeof validations.array.concat.runtime.schema>;
type IndexOfParams = z.infer<typeof validations.array.indexOf.runtime.schema>;
type JoinParams = z.infer<typeof validations.array.join.runtime.schema>;
type SetParams = z.infer<typeof validations.array.set.runtime.schema>;

/**
 * @group Actions
 */
export class GroupArray {
  // --------------------------------------------------
  // Parsing
  // --------------------------------------------------

  /**
   * Parses a delimited string or JSON string into an array.
   *
   * @param params - The input parameters.
   * @returns The parsed array.
   * @example
   * ```yaml
   * # Parse a comma-separated tag list from a pipeline variable
   * - group: array
   *   name: parse
   *   params:
   *     text: '{{ csvData }}'
   *     type: csv
   *     trim: true
   * ```
   */
  static parse(params: ParseParams): any[] {
    const { text, separator, type, trim, elementType } =
      validations.array.parse.runtime.validate(params);

    let array: any[];

    try {
      switch (type) {
        case 'json':
          array = GroupArray.parseJSON(text);
          break;

        case 'csv':
          array = GroupArray.parseCSV(text, trim);
          break;

        case 'lines':
          array = GroupArray.parseLines(text, trim);
          break;

        case 'custom':
          array = GroupArray.parseCustom(text, separator, trim);
          break;

        default:
          throw new Error(`Unknown parse type: ${type}`);
      }

      if (elementType !== 'string') {
        array = array.map((item) => GroupArray.convertElement(item, elementType));
      }

      return array;
    } catch (error) {
      throw new Error(`Failed to parse text to array: ${(error as Error).message}`);
    }
  }

  // --------------------------------------------------
  // Conversion
  // --------------------------------------------------

  /**
   * Converts an array to a string using a specified format.
   *
   * @param params - The input parameters.
   * @returns The string representation of the array.
   * @example
   * ```yaml
   * # Convert a tag array to a comma-separated string for inclusion in a report header
   * - group: array
   *   name: toString
   *   params:
   *     array: '{= tags =}'
   *     format: csv
   * ```
   */
  static toString(params: ToStringParams): string {
    const { array, separator, format } = validations.array.toString.runtime.validate(params);

    switch (format) {
      case 'json':
        return JSON.stringify(array);

      case 'lines':
        return array.join('\n');

      default:
        return array.join(separator);
    }
  }

  /**
   * Joins array elements into a single string with a separator.
   *
   * @param params - The input parameters.
   * @returns The joined string.
   * @example
   * ```yaml
   * # Join pipeline tags with a pipe separator for display in a dashboard label
   * - group: array
   *   name: join
   *   params:
   *     array: '{= tags =}'
   *     separator: ' | '
   * ```
   */
  static join(params: JoinParams): string {
    const { array, separator } = validations.array.join.runtime.validate(params);
    return array.join(separator);
  }

  // --------------------------------------------------
  // Inspection
  // --------------------------------------------------

  /**
   * Returns the number of elements in an array.
   *
   * @param params - The input parameters.
   * @returns The number of elements.
   * @example
   * ```yaml
   * # Count pipeline tags for a length check before pagination
   * - group: array
   *   name: length
   *   params:
   *     array: '{= tags =}'
   * ```
   */
  static length(params: LengthParams): number {
    const { array } = validations.array.length.runtime.validate(params);
    return array.length;
  }

  /**
   * Checks if an array contains a specific value.
   *
   * @param params - The input parameters.
   * @returns `true` if the value is found, otherwise `false`.
   * @example
   * ```yaml
   * # Check whether the tag list includes 'pdf' before running OCR steps
   * - group: array
   *   name: contains
   *   params:
   *     array: '{= tags =}'
   *     value: 'pdf'
   * ```
   */
  static contains(params: ContainsParams): boolean {
    const { array, value } = validations.array.contains.runtime.validate(params);
    return array.includes(value);
  }

  /**
   * Finds the index of the first occurrence of a value in an array.
   *
   * @param params - The input parameters.
   * @returns The zero-based index, or `-1` if not found.
   * @example
   * ```yaml
   * # Find the position of 'ocr' in the processing stage list
   * - group: array
   *   name: indexOf
   *   params:
   *     array: '{= tags =}'
   *     value: 'ocr'
   * ```
   */
  static indexOf(params: IndexOfParams): number {
    const { array, value } = validations.array.indexOf.runtime.validate(params);
    return array.indexOf(value);
  }

  /**
   * Retrieves the element at a specific index, supporting negative indices from the end.
   *
   * @param params - The input parameters.
   * @returns The element at the index, or `defaultValue` if out of bounds.
   * @example
   * ```yaml
   * # Get the last tag in the list using a negative index
   * - group: array
   *   name: get
   *   params:
   *     array: '{= tags =}'
   *     index: -1
   * ```
   */
  static get(params: GetParams): any {
    const { array, index, defaultValue } = validations.array.get.runtime.validate(params);
    const actualIndex = index < 0 ? array.length + index : index;

    if (actualIndex < 0 || actualIndex >= array.length) {
      return defaultValue;
    }

    return array[actualIndex];
  }

  // --------------------------------------------------
  // Modification
  // --------------------------------------------------

  /**
   * Adds an element to the start or end of an array.
   *
   * @param params - The input parameters.
   * @returns The updated array.
   * @example
   * ```yaml
   * # Append a new processing tag to the end of the existing tag list
   * - group: array
   *   name: push
   *   params:
   *     array: '{= tags =}'
   *     value: 'xml'
   *     position: end
   * ```
   */
  static push(params: PushParams): any[] {
    const { array, value, position } = validations.array.push.runtime.validate(params);

    if (position === 'start') {
      array.unshift(value);
    } else {
      array.push(value);
    }

    return array;
  }

  /**
   * Updates the element at a specific index in an array, supporting negative indices from the end.
   *
   * @param params - The input parameters.
   * @returns The updated array.
   * @example
   * ```yaml
   * # Replace the second item in the list with a new value
   * - group: array
   *   name: set
   *   params:
   *     array: '{= items =}'
   *     index: 1
   *     value: 'updatedValue'
   * ```
   */
  static set(params: SetParams): any[] {
    const { array, index, value } = validations.array.set.runtime.validate(params);
    const actualIndex = index < 0 ? array.length + index : index;

    if (actualIndex < 0 || actualIndex >= array.length) {
      throw new Error(`Index ${index} out of bounds (array length: ${array.length})`);
    }

    array[actualIndex] = value;
    return array;
  }

  /**
   * Removes the element at a specific index from an array.
   *
   * @param params - The input parameters.
   * @returns The updated array with the element removed.
   * @example
   * ```yaml
   * # Drop the third price entry (index 2) from the scraped price list
   * - group: array
   *   name: remove
   *   params:
   *     array: '{= prices =}'
   *     index: 2
   * ```
   */
  static remove(params: RemoveParams): any[] {
    const { array, index } = validations.array.remove.runtime.validate(params);

    if (index < 0 || index >= array.length) {
      throw new Error(`Index ${index} out of bounds (array length: ${array.length})`);
    }

    array.splice(index, 1);
    return array;
  }

  // --------------------------------------------------
  // Filtering
  // --------------------------------------------------

  /**
   * Removes duplicate values from an array.
   *
   * @param params - The input parameters.
   * @returns An array with duplicate elements removed.
   * @example
   * ```yaml
   * # Deduplicate a tag list before storing to avoid redundant entries
   * - group: array
   *   name: unique
   *   params:
   *     array: ['pdf', 'invoice', 'pdf', 'ocr', 'invoice']
   * ```
   */
  static unique(params: UniqueParams): any[] {
    const { array } = validations.array.unique.runtime.validate(params);
    return uniq(array);
  }

  /**
   * Removes all falsy values (`null`, `undefined`, `false`, `0`, `""`, `NaN`) from an array.
   *
   * @param params - The input parameters.
   * @returns The compacted array.
   * @example
   * ```yaml
   * # Strip null and empty entries from a scraped result set before processing
   * - group: array
   *   name: compact
   *   params:
   *     array: ['pdf', null, '', false, 'invoice', 0, 'ocr']
   * ```
   */
  static compact(params: CompactParams): any[] {
    const { array } = validations.array.compact.runtime.validate(params);
    return compact(array);
  }

  /**
   * Finds the first element matching a condition.
   *
   * @param params - The input parameters.
   * @returns The first matching element, or `null` if none match.
   * @example
   * ```yaml
   * # Find the first line item over the approval threshold
   * - group: array
   *   name: find
   *   params:
   *     array: '{= lineItems =}'
   *     key: amount
   *     compareAs: number
   *     operator: gt
   *     value: 500
   * ```
   */
  static find(params: FindParams): any {
    const parsed = validations.array.find.runtime.validate(params);
    return parsed.array.find(GroupArray.conditionMatcher(parsed)) ?? null;
  }

  /**
   * Keeps only the elements that match a condition.
   *
   * @param params - The input parameters.
   * @returns The matching elements.
   * @example
   * ```yaml
   * # Keep only invoices that are still pending
   * - group: array
   *   name: filter
   *   params:
   *     array: '{= invoices =}'
   *     key: status
   *     compareAs: string
   *     operator: eq
   *     value: pending
   * ```
   */
  static filter(params: FilterParams): any[] {
    const parsed = validations.array.filter.runtime.validate(params);
    return parsed.array.filter(GroupArray.conditionMatcher(parsed));
  }

  /**
   * Checks if at least one element matches a condition.
   *
   * @param params - The input parameters.
   * @returns `true` if any element matches, otherwise `false`.
   * @example
   * ```yaml
   * # Check whether any tag equals 'urgent' before escalating
   * - group: array
   *   name: some
   *   params:
   *     array: '{= tags =}'
   *     compareAs: string
   *     operator: eq
   *     value: urgent
   * ```
   */
  static some(params: SomeParams): boolean {
    const parsed = validations.array.some.runtime.validate(params);
    return parsed.array.some(GroupArray.conditionMatcher(parsed));
  }

  /**
   * Checks if all elements match a condition.
   *
   * @param params - The input parameters.
   * @returns `true` if every element matches, otherwise `false`.
   * @example
   * ```yaml
   * # Confirm every invoice line item has been paid
   * - group: array
   *   name: every
   *   params:
   *     array: '{= lineItems =}'
   *     key: status
   *     compareAs: string
   *     operator: eq
   *     value: paid
   * ```
   */
  static every(params: EveryParams): boolean {
    const parsed = validations.array.every.runtime.validate(params);
    return parsed.array.every(GroupArray.conditionMatcher(parsed));
  }

  /**
   * Counts the elements that match a condition.
   *
   * @param params - The input parameters.
   * @returns The number of matching elements.
   * @example
   * ```yaml
   * # Count how many invoices are still pending
   * - group: array
   *   name: count
   *   params:
   *     array: '{= invoices =}'
   *     key: status
   *     compareAs: string
   *     operator: eq
   *     value: pending
   * ```
   */
  static count(params: CountParams): number {
    const parsed = validations.array.count.runtime.validate(params);
    return parsed.array.filter(GroupArray.conditionMatcher(parsed)).length;
  }

  // --------------------------------------------------
  // Grouping
  // --------------------------------------------------

  /**
   * Extracts a single property from each element into a new array.
   *
   * @param params - The input parameters.
   * @returns The array of extracted values.
   * @example
   * ```yaml
   * # Pull just the ids out of a list of scraped records
   * - group: array
   *   name: pluck
   *   params:
   *     array: '{= records =}'
   *     key: id
   * ```
   */
  static pluck(params: PluckParams): any[] {
    const { array, key } = validations.array.pluck.runtime.validate(params);
    return array.map((item) => get(item, key));
  }

  /**
   * Groups elements into buckets keyed by a property value.
   *
   * @param params - The input parameters.
   * @returns An object mapping each key value to its matching elements.
   * @example
   * ```yaml
   * # Bucket invoices by status before generating a summary report
   * - group: array
   *   name: groupBy
   *   params:
   *     array: '{= invoices =}'
   *     key: status
   * ```
   */
  static groupBy(params: GroupByParams): Record<string, any[]> {
    const { array, key } = validations.array.groupBy.runtime.validate(params);
    return groupByFn(array, (item) => get(item, key));
  }

  /**
   * Indexes elements into an object keyed by a property value (last element wins).
   *
   * @param params - The input parameters.
   * @returns An object mapping each key value to its matching element.
   * @example
   * ```yaml
   * # Index a list of users by id for quick lookups
   * - group: array
   *   name: keyBy
   *   params:
   *     array: '{= users =}'
   *     key: id
   * ```
   */
  static keyBy(params: KeyByParams): Record<string, any> {
    const { array, key } = validations.array.keyBy.runtime.validate(params);
    return keyByFn(array, (item) => get(item, key));
  }

  // --------------------------------------------------
  // Randomization
  // --------------------------------------------------

  /**
   * Randomizes the order of elements in an array.
   *
   * @param params - The input parameters.
   * @returns A new array with elements in random order.
   * @example
   * ```yaml
   * # Randomize processing order for a batch of pending tasks
   * - group: array
   *   name: shuffle
   *   params:
   *     array: '{= pendingTasks =}'
   * ```
   */
  static shuffle(params: ShuffleParams): any[] {
    const { array } = validations.array.shuffle.runtime.validate(params);
    return shuffleFn(array);
  }

  /**
   * Picks a single random element from an array.
   *
   * @param params - The input parameters.
   * @returns A random element, or `null` if the array is empty.
   * @example
   * ```yaml
   * # Pick a random reviewer from a pool of candidates
   * - group: array
   *   name: sample
   *   params:
   *     array: '{= reviewers =}'
   * ```
   */
  static sample(params: SampleParams): any {
    const { array } = validations.array.sample.runtime.validate(params);
    return array.length === 0 ? null : sampleFn(array);
  }

  // --------------------------------------------------
  // Transformation
  // --------------------------------------------------

  /**
   * Splits an array into sub-arrays of a specified size.
   *
   * @param params - The input parameters.
   * @returns An array of chunks.
   * @example
   * ```yaml
   * # Split a tag list into groups of 2 for batch processing
   * - group: array
   *   name: chunk
   *   params:
   *     array: '{= tags =}'
   *     size: 2
   * ```
   */
  static chunk(params: ChunkParams): any[][] {
    const { array, size } = validations.array.chunk.runtime.validate(params);
    return chunk(array, size);
  }

  /**
   * Flattens nested arrays to the specified depth.
   *
   * @param params - The input parameters.
   * @returns The flattened array.
   * @example
   * ```yaml
   * # Flatten one level of nesting from a grouped result set
   * - group: array
   *   name: flatten
   *   params:
   *     array: '{= nestedData =}'
   *     depth: 1
   * ```
   */
  static flatten(params: FlattenParams): any[] {
    const { array, depth } = validations.array.flatten.runtime.validate(params);
    return array.flat(depth);
  }

  // --------------------------------------------------
  // Set Operations
  // --------------------------------------------------

  /**
   * Returns elements present in every provided array.
   *
   * @param params - The input parameters.
   * @returns An array of common elements.
   * @example
   * ```yaml
   * # Find tags shared between the current task and the reference tag list
   * - group: array
   *   name: intersection
   *   params:
   *     arrays:
   *       - '{= tags =}'
   *       - '{= extraTags =}'
   * ```
   */
  static intersection(params: IntersectionParams): any[] {
    const { arrays } = validations.array.intersection.runtime.validate(params);

    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];

    return arrays.reduce((result: any, current: any) => intersection(result, current));
  }

  /**
   * Combines arrays and returns unique elements across all of them.
   *
   * @param params - The input parameters.
   * @returns An array of unique elements.
   * @example
   * ```yaml
   * # Merge two tag lists and deduplicate the combined result
   * - group: array
   *   name: union
   *   params:
   *     arrays:
   *       - '{= tags =}'
   *       - '{= extraTags =}'
   * ```
   */
  static union(params: UnionParams): any[] {
    const { arrays } = validations.array.union.runtime.validate(params);

    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];

    return arrays.reduce((result: any, current: any) => union(result, current));
  }

  /**
   * Returns elements from the first array that are not present in the second.
   *
   * @param params - The input parameters.
   * @returns An array of elements unique to the first array.
   * @example
   * ```yaml
   * # Find tags that are in the active list but not in the exclude list
   * - group: array
   *   name: difference
   *   params:
   *     array: '{= tags =}'
   *     exclude: '{= extraTags =}'
   * ```
   */
  static difference(params: DifferenceParams): any[] {
    const { array, exclude } = validations.array.difference.runtime.validate(params);
    return difference(array, exclude);
  }

  // --------------------------------------------------
  // Sorting
  // --------------------------------------------------

  /**
   * Sorts array elements by one or more keys and order directions.
   *
   * @param params - The input parameters.
   * @returns The sorted array.
   * @example
   * ```yaml
   * # Sort invoice line items by size ascending for structured report output
   * - group: array
   *   name: sort
   *   params:
   *     array:
   *       - { name: 'invoice', size: 42 }
   *       - { name: 'pdf', size: 18 }
   *       - { name: 'ocr', size: 75 }
   *     keys: ['size']
   *     orders: ['asc']
   * ```
   */
  static sort(params: SortParams): any[] {
    const { array, keys, orders } = validations.array.sort.runtime.validate(params);

    if (!keys || keys.length === 0) {
      return [...array].sort();
    }

    return orderBy(array, keys, orders);
  }

  /**
   * Reverses the order of elements in an array.
   *
   * @param params - The input parameters.
   * @returns The reversed array.
   * @example
   * ```yaml
   * # Reverse a pipeline stage list to process from last to first
   * - group: array
   *   name: reverse
   *   params:
   *     array: '{= tags =}'
   * ```
   */
  static reverse(params: ReverseParams): any[] {
    const { array } = validations.array.reverse.runtime.validate(params);
    return [...array].reverse();
  }

  // --------------------------------------------------
  // Extraction & Combining
  // --------------------------------------------------

  /**
   * Extracts a contiguous portion of an array by start and optional end index.
   *
   * @param params - The input parameters.
   * @returns The extracted sub-array.
   * @example
   * ```yaml
   * # Extract the middle two tags from a four-element tag list
   * - group: array
   *   name: slice
   *   params:
   *     array: '{= tags =}'
   *     start: 1
   *     end: 3
   * ```
   */
  static slice(params: SliceParams): any[] {
    const { array, start, end } = validations.array.slice.runtime.validate(params);
    return array.slice(start, end);
  }

  /**
   * Concatenates multiple arrays into a single array.
   *
   * @param params - The input parameters.
   * @returns The merged array.
   * @example
   * ```yaml
   * # Merge the main tag list with the extra tag list into one combined array
   * - group: array
   *   name: concat
   *   params:
   *     arrays:
   *       - '{= tags =}'
   *       - '{= extraTags =}'
   * ```
   */
  static concat(params: ConcatParams): any[] {
    const { arrays } = validations.array.concat.runtime.validate(params);
    return ([] as any[]).concat(...arrays);
  }

  // Private helper methods
  // One element's check, with the same engine as If. An element whose value can't
  // be read as `compareAs` (a missing amount, "n/a" in a number column) doesn't
  // match; a bad `value` setting is the workflow's mistake and stops the step.
  private static conditionMatcher(params: {
    key?: string;
    compareAs: string;
    operator: string;
    value?: unknown;
    ignoreCase?: boolean;
  }): (item: unknown) => boolean {
    return (item) => {
      try {
        return evaluateCondition({
          value: params.key ? get(item, params.key) : item,
          compareAs: params.compareAs as Condition['compareAs'],
          operator: params.operator as Condition['operator'],
          compareTo: params.value,
          ignoreCase: params.ignoreCase,
        });
      } catch (error) {
        if (error instanceof ConditionError && error.side === 'value') return false;
        throw error;
      }
    };
  }

  private static parseJSON(text: string): any[] {
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      throw new Error('Parsed value is not an array');
    }

    return parsed;
  }

  private static parseCSV(text: string, trim: boolean): string[] {
    return text.split(',').map((item) => (trim ? item.trim() : item));
  }

  private static parseLines(text: string, trim: boolean): string[] {
    return text
      .split(/\r?\n/)
      .map((item) => (trim ? item.trim() : item))
      .filter((item) => item.length > 0);
  }

  private static parseCustom(text: string, separator: string, trim: boolean): string[] {
    return text.split(separator).map((item) => (trim ? item.trim() : item));
  }

  private static convertElement(value: any, targetType: string): any {
    switch (targetType) {
      case 'number': {
        const num = Number(value);
        return isNaN(num) ? value : num;
      }

      case 'boolean':
        if (typeof value === 'boolean') return value;
        return value === 'true' || value === '1' || value === 1;

      case 'auto':
        if (typeof value === 'string') {
          const num = Number(value);
          if (!isNaN(num)) return num;
          if (value === 'true') return true;
          if (value === 'false') return false;
        }
        return value;

      default:
        return value;
    }
  }
}
