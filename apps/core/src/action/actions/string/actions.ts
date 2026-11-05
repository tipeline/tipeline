import qs from 'qs';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { renderLiquid } from '@utils/parseParams';

type CamelCaseParams = z.infer<typeof validations.string.camelCase.runtime.schema>;
type CapitalizeParams = z.infer<typeof validations.string.capitalize.runtime.schema>;
type EndsWithParams = z.infer<typeof validations.string.endsWith.runtime.schema>;
type EncodeHTMLEntitiesParams = z.infer<
  typeof validations.string.encodeHTMLEntities.runtime.schema
>;
type DecodeHTMLEntitiesParams = z.infer<
  typeof validations.string.decodeHTMLEntities.runtime.schema
>;
type IncludesParams = z.infer<typeof validations.string.includes.runtime.schema>;
type IndexOfParams = z.infer<typeof validations.string.indexOf.runtime.schema>;
type KebabCaseParams = z.infer<typeof validations.string.kebabCase.runtime.schema>;
type LowerFirstParams = z.infer<typeof validations.string.lowerFirst.runtime.schema>;
type MatchParams = z.infer<typeof validations.string.match.runtime.schema>;
type ReplaceParams = z.infer<typeof validations.string.replace.runtime.schema>;
type ReplaceAllParams = z.infer<typeof validations.string.replaceAll.runtime.schema>;
type SearchParams = z.infer<typeof validations.string.search.runtime.schema>;
type SliceParams = z.infer<typeof validations.string.slice.runtime.schema>;
type SnakeCaseParams = z.infer<typeof validations.string.snakeCase.runtime.schema>;
type SplitParams = z.infer<typeof validations.string.split.runtime.schema>;
type StartCaseParams = z.infer<typeof validations.string.startCase.runtime.schema>;
type StartsWithParams = z.infer<typeof validations.string.startsWith.runtime.schema>;
type ToLowerCaseParams = z.infer<typeof validations.string.toLowerCase.runtime.schema>;
type ToUpperCaseParams = z.infer<typeof validations.string.toUpperCase.runtime.schema>;
type UpperFirstParams = z.infer<typeof validations.string.upperFirst.runtime.schema>;
type TrimParams = z.infer<typeof validations.string.trim.runtime.schema>;
type TrimEndParams = z.infer<typeof validations.string.trimEnd.runtime.schema>;
type TrimStartParams = z.infer<typeof validations.string.trimStart.runtime.schema>;
type WordsParams = z.infer<typeof validations.string.words.runtime.schema>;
type LenParams = z.infer<typeof validations.string.len.runtime.schema>;
type SubstringParams = z.infer<typeof validations.string.substring.runtime.schema>;
type StringifyParams = z.infer<typeof validations.string.stringify.runtime.schema>;
type ContainsRegexParams = z.infer<typeof validations.string.containsRegex.runtime.schema>;
type FormatParams = z.infer<typeof validations.string.format.runtime.schema>;
type ParseQueryStringParams = z.infer<typeof validations.string.parseQueryString.runtime.schema>;
type StringifyQueryObjectParams = z.infer<
  typeof validations.string.stringifyQueryObject.runtime.schema
>;
type EncodeURIComponentParams = z.infer<
  typeof validations.string.encodeURIComponent.runtime.schema
>;
type DecodeURIComponentParams = z.infer<
  typeof validations.string.decodeURIComponent.runtime.schema
>;
type SlugifyParams = z.infer<typeof validations.string.slugify.runtime.schema>;
type RenderTemplateParams = z.infer<typeof validations.string.renderTemplate.runtime.schema>;
type TemplateParams = z.infer<typeof validations.string.template.runtime.schema>;

/**
 * @group Actions
 */
export class GroupString {
  // --------------------------------------------------
  // Casing
  // --------------------------------------------------

  /**
   * Converts a string to camelCase format.
   *
   * @param params - The input parameters.
   * @returns The camelCase version of the input string.
   * @example
   * ```yaml
   * # Convert task name to camelCase — useful for generating variable identifiers
   * - group: string
   *   name: camelCase
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static camelCase(params: CamelCaseParams): string {
    const { string } = validations.string.camelCase.runtime.validate(params);
    return String(string)
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word, i) =>
        i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');
  }

  /**
   * Capitalizes the first character of a string and lowercases the rest.
   *
   * @param params - The input parameters.
   * @returns The capitalized string.
   * @example
   * ```yaml
   * # Capitalize action label — useful for display in UI headings
   * - group: string
   *   name: capitalize
   *   params:
   *     string: '{{ actionLabel }}'
   * ```
   */
  static capitalize(params: CapitalizeParams): string {
    const { string } = validations.string.capitalize.runtime.validate(params);
    const str = String(string);
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Converts a string to kebab-case format.
   *
   * @param params - The input parameters.
   * @returns The kebab-case version of the input string.
   * @example
   * ```yaml
   * # Convert task name to kebab-case — useful for URL slugs and CLI flags
   * - group: string
   *   name: kebabCase
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static kebabCase(params: KebabCaseParams): string {
    const { string } = validations.string.kebabCase.runtime.validate(params);
    return String(string)
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word) => word.toLowerCase())
      .join('-');
  }

  /**
   * Lowercases the first character of a string, leaving the rest unchanged.
   *
   * @param params - The input parameters.
   * @returns The string with its first character in lowercase.
   * @example
   * ```yaml
   * # Lowercase only the first character — useful when class names need camelCase normalization
   * - group: string
   *   name: lowerFirst
   *   params:
   *     string: 'SendDailyReport'
   * ```
   */
  static lowerFirst(params: LowerFirstParams): string {
    const { string } = validations.string.lowerFirst.runtime.validate(params);
    const str = String(string);
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  /**
   * Converts a string to snake_case format.
   *
   * @param params - The input parameters.
   * @returns The snake_case version of the input string.
   * @example
   * ```yaml
   * # Convert task name to snake_case — useful for database column names or file identifiers
   * - group: string
   *   name: snakeCase
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static snakeCase(params: SnakeCaseParams): string {
    const { string } = validations.string.snakeCase.runtime.validate(params);
    return String(string)
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word) => word.toLowerCase())
      .join('_');
  }

  /**
   * Converts a string to Start Case format, capitalizing the first letter of each word.
   *
   * @param params - The input parameters.
   * @returns The Start Case version of the input string.
   * @example
   * ```yaml
   * # Convert to Start Case — useful for rendering task names in report titles
   * - group: string
   *   name: startCase
   *   params:
   *     string: '{{ actionLabel }}'
   * ```
   */
  static startCase(params: StartCaseParams): string {
    const { string } = validations.string.startCase.runtime.validate(params);
    return String(string)
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Converts a string to lowercase.
   *
   * @param params - The input parameters.
   * @returns The lowercase version of the input string.
   * @example
   * ```yaml
   * # Lowercase the entire string — useful for normalizing status values before comparison
   * - group: string
   *   name: toLowerCase
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static toLowerCase(params: ToLowerCaseParams): string {
    const { string } = validations.string.toLowerCase.runtime.validate(params);
    return String(string).toLowerCase();
  }

  /**
   * Converts a string to uppercase.
   *
   * @param params - The input parameters.
   * @returns The uppercase version of the input string.
   * @example
   * ```yaml
   * # Uppercase the entire string — useful for log-level labels and status badges
   * - group: string
   *   name: toUpperCase
   *   params:
   *     string: 'running'
   * ```
   */
  static toUpperCase(params: ToUpperCaseParams): string {
    const { string } = validations.string.toUpperCase.runtime.validate(params);
    return String(string).toUpperCase();
  }

  /**
   * Uppercases only the first character of a string, leaving the rest unchanged.
   *
   * @param params - The input parameters.
   * @returns The string with its first character in uppercase.
   * @example
   * ```yaml
   * # Uppercase only the first character — useful for sentence-casing dynamic messages
   * - group: string
   *   name: upperFirst
   *   params:
   *     string: '{{ actionLabel }}'
   * ```
   */
  static upperFirst(params: UpperFirstParams): string {
    const { string } = validations.string.upperFirst.runtime.validate(params);
    const str = String(string);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // --------------------------------------------------
  // Search
  // --------------------------------------------------

  /**
   * Checks if a string ends with the specified substring.
   *
   * @param params - The input parameters.
   * @returns `true` if the string ends with the search value, otherwise `false`.
   * @example
   * ```yaml
   * # Check if a task name ends with a known suffix
   * - group: string
   *   name: endsWith
   *   params:
   *     string: '{{ taskName }}'
   *     search: 'Pipeline'
   * ```
   */
  static endsWith(params: EndsWithParams): boolean {
    const { string, search, position } = validations.string.endsWith.runtime.validate(params);
    return position !== undefined
      ? String(string).endsWith(search, position)
      : String(string).endsWith(search);
  }

  /**
   * Checks if a string contains the specified substring.
   *
   * @param params - The input parameters.
   * @returns `true` if the string contains the search value, otherwise `false`.
   * @example
   * ```yaml
   * # Check whether the task name contains a keyword
   * - group: string
   *   name: includes
   *   params:
   *     string: '{{ taskName }}'
   *     search: 'Report'
   * ```
   */
  static includes(params: IncludesParams): boolean {
    const { string, search, position } = validations.string.includes.runtime.validate(params);
    return String(string).includes(search, position ?? 0);
  }

  /**
   * Returns the index of the first occurrence of a substring within a string.
   *
   * @param params - The input parameters.
   * @returns The zero-based index of the first occurrence, or `-1` if not found.
   * @example
   * ```yaml
   * # Find the position of a keyword inside the task name
   * - group: string
   *   name: indexOf
   *   params:
   *     string: '{{ taskName }}'
   *     search: 'Sales'
   * ```
   */
  static indexOf(params: IndexOfParams): number {
    const { string, search, position } = validations.string.indexOf.runtime.validate(params);
    return String(string).indexOf(search, position ?? 0);
  }

  /**
   * Checks if a string starts with the specified substring.
   *
   * @param params - The input parameters.
   * @returns `true` if the string starts with the target value, otherwise `false`.
   * @example
   * ```yaml
   * # Check if the task name begins with the expected prefix
   * - group: string
   *   name: startsWith
   *   params:
   *     string: '{{ taskName }}'
   *     target: 'Send'
   * ```
   */
  static startsWith(params: StartsWithParams): boolean {
    const { string, target, position } = validations.string.startsWith.runtime.validate(params);
    return String(string).startsWith(target, position ?? 0);
  }

  // --------------------------------------------------
  // Regex
  // --------------------------------------------------

  /**
   * Tests whether a regular expression pattern exists within a string.
   *
   * @param params - The input parameters.
   * @returns `true` if the pattern matches, otherwise `false`.
   * @example
   * ```yaml
   * # Test whether the action label contains only lowercase words
   * - group: string
   *   name: containsRegex
   *   params:
   *     string: '{{ actionLabel }}'
   *     pattern: "^[a-z\\s]+"
   * ```
   */
  static containsRegex(params: ContainsRegexParams): boolean {
    const { string, pattern } = validations.string.containsRegex.runtime.validate(params);
    const regex = new RegExp(pattern);
    return regex.test(String(string));
  }

  /**
   * Matches a string against a regular expression, returning all matches.
   *
   * @param params - The input parameters.
   * @returns An array of matches, or `null` if no match is found.
   * @example
   * ```yaml
   * # Extract all capitalized words from the task name
   * - group: string
   *   name: match
   *   params:
   *     string: '{{ taskName }}'
   *     pattern: '[A-Z][a-z]+'
   *     flag: g
   * ```
   */
  static match(params: MatchParams): Array<string> | null {
    const { string, pattern, flag } = validations.string.match.runtime.validate(params);
    const regex = new RegExp(pattern, flag);
    return String(string).match(regex);
  }

  /**
   * Searches a string for a regex or substring match and returns the index of the first match.
   *
   * @param params - The input parameters.
   * @returns The index of the first match, or `-1` if not found.
   * @example
   * ```yaml
   * # Return the index of the first digit sequence in a pipeline ID string
   * - group: string
   *   name: search
   *   params:
   *     string: 'pipeline-run-00427-completed'
   *     pattern: '\d+'
   * ```
   */
  static search(params: SearchParams): number {
    const { string, pattern } = validations.string.search.runtime.validate(params);
    return String(string).search(pattern);
  }

  // --------------------------------------------------
  // Replace
  // --------------------------------------------------

  /**
   * Replaces the first occurrence of a pattern within a string.
   *
   * @param params - The input parameters.
   * @returns The string with the first match replaced.
   * @example
   * ```yaml
   * # Replace the first occurrence of a status keyword
   * - group: string
   *   name: replace
   *   params:
   *     string: 'Pipeline status: pending. Retry pending.'
   *     pattern: 'pending'
   *     replacement: 'running'
   * ```
   */
  static replace(params: ReplaceParams): string {
    const { string, pattern, replacement } = validations.string.replace.runtime.validate(params);
    return String(string).replace(pattern, replacement ?? '');
  }

  /**
   * Replaces all occurrences of a pattern within a string.
   *
   * @param params - The input parameters.
   * @returns The string with all matches replaced.
   * @example
   * ```yaml
   * # Replace every occurrence of a placeholder token in a template
   * - group: string
   *   name: replaceAll
   *   params:
   *     string: 'task.name, task.status, task.owner'
   *     pattern: 'task.'
   *     replacement: 'pipeline.'
   * ```
   */
  static replaceAll(params: ReplaceAllParams): string {
    const { string, pattern, replacement } = validations.string.replaceAll.runtime.validate(params);
    return String(string).replaceAll(pattern, replacement ?? '');
  }

  // --------------------------------------------------
  // Slice & Tokenize
  // --------------------------------------------------

  /**
   * Extracts a portion of a string using start and optional end indices.
   *
   * @param params - The input parameters.
   * @returns The extracted substring.
   * @example
   * ```yaml
   * # Extract the action type from a dot-separated action identifier
   * - group: string
   *   name: slice
   *   params:
   *     string: 'string.camelCase'
   *     start: 7
   * ```
   */
  static slice(params: SliceParams): string {
    const { string, start, end } = validations.string.slice.runtime.validate(params);
    return end !== undefined ? String(string).slice(start, end) : String(string).slice(start);
  }

  /**
   * Splits a string into an array of substrings using a separator.
   *
   * @param params - The input parameters.
   * @returns An array of substrings.
   * @example
   * ```yaml
   * # Split a comma-separated list of pipeline tags into an array
   * - group: string
   *   name: split
   *   params:
   *     string: 'pdf,invoice,ocr,email'
   *     separator: ','
   * ```
   */
  static split(params: SplitParams): Array<string> {
    const { string, separator, limit } = validations.string.split.runtime.validate(params);
    return limit !== undefined
      ? String(string).split(separator, limit)
      : String(string).split(separator);
  }

  /**
   * Extracts a substring between the given start and end indices.
   *
   * @param params - The input parameters.
   * @returns The extracted substring.
   * @example
   * ```yaml
   * # Extract a substring by fixed indices — e.g., pull the group prefix from an action ID
   * - group: string
   *   name: substring
   *   params:
   *     string: 'string.camelCase'
   *     start: 0
   *     end: 6
   * ```
   */
  static substring(params: SubstringParams): string {
    const { string, start, end } = validations.string.substring.runtime.validate(params);
    return String(string).substring(start, end);
  }

  /**
   * Splits a string into an array of words using an optional pattern.
   *
   * @param params - The input parameters.
   * @returns An array of word tokens.
   * @example
   * ```yaml
   * # Tokenize a task name into individual words
   * - group: string
   *   name: words
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static words(params: WordsParams): Array<string> {
    const { string, pattern } = validations.string.words.runtime.validate(params);
    const str = String(string);
    const resolvedPattern = pattern ?? /[^\s]+/g;
    return str.match(resolvedPattern) ?? [];
  }

  // --------------------------------------------------
  // Whitespace
  // --------------------------------------------------

  /**
   * Removes whitespace from both ends of a string.
   *
   * @param params - The input parameters.
   * @returns The trimmed string.
   * @example
   * ```yaml
   * # Strip leading and trailing whitespace from user-submitted input
   * - group: string
   *   name: trim
   *   params:
   *     string: '  Send Daily Report  '
   * ```
   */
  static trim(params: TrimParams): string {
    const { string } = validations.string.trim.runtime.validate(params);
    return String(string).trim();
  }

  /**
   * Removes whitespace from the end of a string.
   *
   * @param params - The input parameters.
   * @returns The string with trailing whitespace removed.
   * @example
   * ```yaml
   * # Remove trailing whitespace only — e.g., after log line formatting
   * - group: string
   *   name: trimEnd
   *   params:
   *     string: 'Pipeline completed   '
   * ```
   */
  static trimEnd(params: TrimEndParams): string {
    const { string } = validations.string.trimEnd.runtime.validate(params);
    return String(string).trimEnd();
  }

  /**
   * Removes whitespace from the start of a string.
   *
   * @param params - The input parameters.
   * @returns The string with leading whitespace removed.
   * @example
   * ```yaml
   * # Remove leading whitespace only — e.g., after YAML indentation read
   * - group: string
   *   name: trimStart
   *   params:
   *     string: '   extract invoice data'
   * ```
   */
  static trimStart(params: TrimStartParams): string {
    const { string } = validations.string.trimStart.runtime.validate(params);
    return String(string).trimStart();
  }

  // --------------------------------------------------
  // Utility
  // --------------------------------------------------

  /**
   * Returns the number of characters in a string.
   *
   * @param params - The input parameters.
   * @returns The length of the string.
   * @example
   * ```yaml
   * # Get the character length of a task name for validation or truncation checks
   * - group: string
   *   name: len
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static len(params: LenParams): number {
    const { string } = validations.string.len.runtime.validate(params);
    return String(string).length;
  }

  /**
   * Converts any value to its string representation.
   *
   * @param params - The input parameters.
   * @returns The string representation of the value.
   * @example
   * ```yaml
   * # Serialize a pipeline result object for logging or storing as a variable
   * - group: string
   *   name: stringify
   *   params:
   *     value:
   *       task: 'send-daily-report'
   *       status: 'completed'
   *       duration: 4821
   *     pretty: true
   * ```
   */
  static stringify(params: StringifyParams): string {
    const {
      value,
      pretty = false,
      indent = 2,
    } = validations.string.stringify.runtime.validate(params);

    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'object') {
      return pretty ? JSON.stringify(value, null, indent) : JSON.stringify(value);
    }
    return String(value);
  }

  // --------------------------------------------------
  // Template & Encoding
  // --------------------------------------------------

  /**
   * Interpolates values into a template string using `{key}` placeholders.
   *
   * @param params - The input parameters.
   * @returns The interpolated string.
   * @example
   * ```yaml
   * # Interpolate dynamic values into a notification message template
   * - group: string
   *   name: format
   *   params:
   *     template: 'Task "{task}" finished with status {status} in {duration}ms.'
   *     values:
   *       task: 'Send Daily Report'
   *       status: 'completed'
   *       duration: 4821
   * ```
   */
  static format(params: FormatParams): string {
    const { template, values } = validations.string.format.runtime.validate(params);
    return Object.entries(values).reduce((result, [key, value]) => {
      return result.replaceAll(`{${key}}`, String(value));
    }, template);
  }

  /**
   * Escapes special HTML characters in a string to their entity equivalents.
   *
   * @param params - The input parameters.
   * @returns The HTML-encoded string.
   * @example
   * ```yaml
   * # Escape HTML in pipeline output before embedding it in an email body
   * - group: string
   *   name: encodeHTMLEntities
   *   params:
   *     string: '{{ htmlContent }}'
   * ```
   */
  static encodeHTMLEntities(params: EncodeHTMLEntitiesParams): string {
    const { string } = validations.string.encodeHTMLEntities.runtime.validate(params);
    return String(string)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Converts HTML entities back to their original characters.
   *
   * @param params - The input parameters.
   * @returns The decoded string.
   * @example
   * ```yaml
   * # Decode HTML entities received from an external API response
   * - group: string
   *   name: decodeHTMLEntities
   *   params:
   *     string: '{{ encodedHtml }}'
   * ```
   */
  static decodeHTMLEntities(params: DecodeHTMLEntitiesParams): string {
    const { string } = validations.string.decodeHTMLEntities.runtime.validate(params);
    return String(string)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  /**
   * Percent-encodes a string for safe use as a URI component.
   *
   * @param params - The input parameters.
   * @returns The percent-encoded URI component.
   * @example
   * ```yaml
   * # Encode a task name for safe inclusion in a URL query parameter
   * - group: string
   *   name: encodeURIComponent
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static encodeURIComponent(params: EncodeURIComponentParams): string {
    const { string } = validations.string.encodeURIComponent.runtime.validate(params);
    return encodeURIComponent(string);
  }

  /**
   * Decodes a percent-encoded URI component back to its original string.
   *
   * @param params - The input parameters.
   * @returns The decoded string.
   * @example
   * ```yaml
   * # Decode a percent-encoded query parameter back to its original value
   * - group: string
   *   name: decodeURIComponent
   *   params:
   *     string: 'Send%20Daily%20Report%20-%20Sales%20Pipeline'
   * ```
   */
  static decodeURIComponent(params: DecodeURIComponentParams): string {
    const { string } = validations.string.decodeURIComponent.runtime.validate(params);
    return decodeURIComponent(string);
  }

  // --------------------------------------------------
  // Query String
  // --------------------------------------------------

  /**
   * Parses a URL query string into a key-value object.
   *
   * @param params - The input parameters.
   * @returns A parsed object representation of the query string.
   * @example
   * ```yaml
   * # Parse a webhook query string into a structured object
   * - group: string
   *   name: parseQueryString
   *   params:
   *     string: 'status=running&tags[]=pdf&tags[]=invoice&limit=10'
   * ```
   */
  static parseQueryString(params: ParseQueryStringParams): any {
    const { string } = validations.string.parseQueryString.runtime.validate(params);
    return qs.parse(string);
  }

  /**
   * Serializes a key-value object into a URL query string.
   *
   * @param params - The input parameters.
   * @returns The query string representation of the object.
   * @example
   * ```yaml
   * # Serialize pipeline filter options into a query string for an HTTP request
   * - group: string
   *   name: stringifyQueryObject
   *   params:
   *     object:
   *       status: 'completed'
   *       tags:
   *         - pdf
   *         - invoice
   *       limit: 10
   * ```
   */
  static stringifyQueryObject(params: StringifyQueryObjectParams): string {
    const { object } = validations.string.stringifyQueryObject.runtime.validate(params);
    return qs.stringify(object, {
      arrayFormat: 'repeat',
    });
  }

  // --------------------------------------------------
  // Slug
  // --------------------------------------------------

  /**
   * Converts a string into a URL-friendly slug.
   *
   * Strips accents, replaces non-alphanumeric characters with hyphens, and lowercases.
   *
   * @param params - The input parameters.
   * @returns The slugified string.
   * @example
   * ```yaml
   * # Generate a URL-friendly slug from a task name (strips accents and special characters)
   * - group: string
   *   name: slugify
   *   params:
   *     string: '{{ taskName }}'
   * ```
   */
  static slugify(params: SlugifyParams): string {
    const { string } = validations.string.slugify.runtime.validate(params);
    return String(string)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  /**
   * Returns a multi-line string with `{{ variable }}` placeholders already resolved
   * by the pipeline before this action runs.
   *
   * @example
   * ```yaml
   * - group: string
   *   name: template
   *   params:
   *     format: html
   *     content: |
   *       <h1>Hello {{ name }}</h1>
   *       <p>Your order {{ order_id }} is ready.</p>
   *   output: email_body
   * ```
   */
  static template(params: TemplateParams): string {
    const { content } = validations.string.template.runtime.validate(params);
    return content;
  }

  /**
   * Renders a Liquid template kept as data — a variable, a database row, a file read
   * earlier — with the values in `data`. Step params only fill in `{{ }}` typed into the
   * step itself and leave the contents of variables alone, so a stored template needs
   * this step to be filled in. Loops (`{% for %}`), conditions (`{% if %}`) and filters
   * (`date`, `join`, `truncate`…) all work; `include`, `render` and `layout` don't.
   *
   * @param params - The input parameters.
   * @returns The rendered text.
   * @example
   * ```yaml
   * # Fill in a page template saved in the CMS with one article's values
   * - group: string
   *   name: renderTemplate
   *   params:
   *     template: '{= articleTemplate =}'
   *     data:
   *       node: '{= node =}'
   *       site: '{= site =}'
   *   destination: html
   * ```
   */
  static renderTemplate(params: RenderTemplateParams): string {
    const { template, data } = validations.string.renderTemplate.runtime.validate(params);
    try {
      return renderLiquid(template, data as Record<string, unknown>);
    } catch (error: any) {
      throw new Error(`Template error: ${String(error?.message ?? error).split('\n')[0]}`);
    }
  }
}
