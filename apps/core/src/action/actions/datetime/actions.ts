import {
  format,
  add,
  sub,
  isAfter,
  isBefore,
  isEqual,
  isValid as isValidDate,
  parse,
  differenceInMilliseconds,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  endOfDay,
  endOfWeek,
  endOfMonth,
  endOfYear,
} from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { AppSettings } from '@engine/AppSettings';

type FormatParams = z.infer<typeof validations.datetime.format.runtime.schema>;
type AddParams = z.infer<typeof validations.datetime.add.runtime.schema>;
type SubtractParams = z.infer<typeof validations.datetime.subtract.runtime.schema>;
type DifferenceParams = z.infer<typeof validations.datetime.difference.runtime.schema>;
type ParseDateParams = z.infer<typeof validations.datetime.parseDate.runtime.schema>;
type ToTimestampParams = z.infer<typeof validations.datetime.toTimestamp.runtime.schema>;
type FromTimestampParams = z.infer<typeof validations.datetime.fromTimestamp.runtime.schema>;
type StartOfParams = z.infer<typeof validations.datetime.startOf.runtime.schema>;
type EndOfParams = z.infer<typeof validations.datetime.endOf.runtime.schema>;
type IsValidParams = z.infer<typeof validations.datetime.isValid.runtime.schema>;
type IsAfterParams = z.infer<typeof validations.datetime.isAfter.runtime.schema>;
type IsBeforeParams = z.infer<typeof validations.datetime.isBefore.runtime.schema>;
type IsEqualParams = z.infer<typeof validations.datetime.isEqual.runtime.schema>;

/**
 * @group Actions
 */
export class GroupDateTime {
  // --------------------------------------------------
  // Current Time
  // --------------------------------------------------

  /**
   * Returns the current local date and time as a JavaScript `Date` object.
   *
   * @returns The current local `Date`.
   * @example
   * ```yaml
   * # Get the current local date/time — useful for timestamping pipeline runs
   * - group: datetime
   *   name: getCurrentDateTime
   * ```
   */
  static getCurrentDateTime(): string {
    const tzDate = new TZDate(new Date(), AppSettings.timezone);
    return format(tzDate, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  }

  /**
   * Returns the current UTC date and time as an ISO 8601 string.
   *
   * @returns The current UTC timestamp in ISO format (e.g. `2024-01-15T10:30:00.000Z`).
   * @example
   * ```yaml
   * # Get the current UTC timestamp — useful for storing event times in a normalized format
   * - group: datetime
   *   name: nowISO
   * ```
   */
  static nowISO(): string {
    return new Date().toISOString();
  }

  // --------------------------------------------------
  // Timestamp
  // --------------------------------------------------

  /**
   * Converts a date/time string to a Unix timestamp in milliseconds.
   *
   * @param params - The input parameters.
   * @returns The number of milliseconds since the Unix epoch.
   * @example
   * ```yaml
   * # Convert a pipeline timestamp to Unix ms — useful for storing in external systems
   * - group: datetime
   *   name: toTimestamp
   *   params:
   *     dateTime: '{{ pipelineStartedAt }}'
   * ```
   */
  static toTimestamp(params: ToTimestampParams): number {
    const parsed = validations.datetime.toTimestamp.runtime.validate(params);
    return new Date(parsed.dateTime).getTime();
  }

  /**
   * Converts a Unix timestamp (milliseconds since epoch) to an ISO date/time string.
   *
   * @param params - The input parameters.
   * @returns The corresponding date/time as an ISO 8601 string.
   * @example
   * ```yaml
   * # Restore a date/time string from a stored Unix timestamp
   * - group: datetime
   *   name: fromTimestamp
   *   params:
   *     timestamp: 1672574400000
   * ```
   */
  static fromTimestamp(params: FromTimestampParams): string {
    const parsed = validations.datetime.fromTimestamp.runtime.validate(params);
    return new Date(parsed.timestamp).toISOString();
  }

  // --------------------------------------------------
  // Format & Parse
  // --------------------------------------------------

  /**
   * Formats a date/time string using a date-fns pattern.
   *
   * @param params - The input parameters.
   * @returns The formatted date string.
   * @example
   * ```yaml
   * # Format a timestamp into a human-readable date for a report header
   * - group: datetime
   *   name: format
   *   params:
   *     dateTime: '{{ pipelineStartedAt }}'
   *     format: 'yyyy-MM-dd HH:mm'
   * ```
   */
  static format(params: FormatParams): string {
    const parsed = validations.datetime.format.runtime.validate(params);
    return format(new Date(parsed.dateTime), parsed.format);
  }

  /**
   * Parses a date string into a `Date` object using a date-fns format pattern.
   *
   * Uses `date-fns/parse`, which interprets the string strictly against the given format.
   * Throws if the string does not match the format (i.e. parses to an invalid date).
   *
   * @param params - The input parameters.
   * @returns The parsed date/time as an ISO 8601 string.
   * @example
   * ```yaml
   * # Parse a date string from a CSV export into an ISO string for further processing
   * - group: datetime
   *   name: parseDate
   *   params:
   *     dateString: '{{ exportedDate }}'
   *     format: 'dd/MM/yyyy'
   * ```
   */
  static parseDate(params: ParseDateParams): string {
    const parsed = validations.datetime.parseDate.runtime.validate(params);
    return parse(parsed.dateString, parsed.format, new Date()).toISOString();
  }

  // --------------------------------------------------
  // Arithmetic
  // --------------------------------------------------

  /**
   * Adds a duration to a date/time.
   *
   * @param params - The input parameters.
   * @returns The resulting date/time (ISO string) after adding the duration.
   * @example
   * ```yaml
   * # Schedule a follow-up 3 days and 2 hours after the current pipeline started
   * - group: datetime
   *   name: add
   *   params:
   *     dateTime: '{{ pipelineStartedAt }}'
   *     duration:
   *       days: 3
   *       hours: 2
   * ```
   */
  static add(params: AddParams): string {
    const parsed = validations.datetime.add.runtime.validate(params);
    return add(new Date(parsed.dateTime), parsed.duration).toISOString();
  }

  /**
   * Subtracts a duration from a date/time.
   *
   * @param params - The input parameters.
   * @returns The resulting date/time (ISO string) after subtracting the duration.
   * @example
   * ```yaml
   * # Compute the start of a look-back window 7 days before the current pipeline run
   * - group: datetime
   *   name: subtract
   *   params:
   *     dateTime: '{{ pipelineStartedAt }}'
   *     duration:
   *       days: 7
   * ```
   */
  static subtract(params: SubtractParams): string {
    const parsed = validations.datetime.subtract.runtime.validate(params);
    return sub(new Date(parsed.dateTime), parsed.duration).toISOString();
  }

  // --------------------------------------------------
  // Boundaries
  // --------------------------------------------------

  /**
   * Returns the start of a day, week, month, or year for a given date/time.
   *
   * Supported units: `day`, `week`, `month`, `year`.
   *
   * @param params - The input parameters.
   * @returns The date/time (ISO string) at the start of the requested boundary.
   * @example
   * ```yaml
   * # Get the first moment of the month containing the pipeline start
   * - group: datetime
   *   name: startOf
   *   params:
   *     dateTime: '{{ pipelineStartedAt }}'
   *     unit: month
   * ```
   */
  static startOf(params: StartOfParams): string {
    const parsed = validations.datetime.startOf.runtime.validate(params);
    const date = new Date(parsed.dateTime);
    switch (parsed.unit) {
      case 'day':
        return startOfDay(date).toISOString();
      case 'week':
        return startOfWeek(date).toISOString();
      case 'month':
        return startOfMonth(date).toISOString();
      case 'year':
        return startOfYear(date).toISOString();
    }
  }

  /**
   * Returns the end of a day, week, month, or year for a given date/time.
   *
   * Supported units: `day`, `week`, `month`, `year`.
   *
   * @param params - The input parameters.
   * @returns The date/time (ISO string) at the end of the requested boundary (last millisecond).
   * @example
   * ```yaml
   * # Get the last moment of the month for a report date range
   * - group: datetime
   *   name: endOf
   *   params:
   *     dateTime: '{{ pipelineStartedAt }}'
   *     unit: month
   * ```
   */
  static endOf(params: EndOfParams): string {
    const parsed = validations.datetime.endOf.runtime.validate(params);
    const date = new Date(parsed.dateTime);
    switch (parsed.unit) {
      case 'day':
        return endOfDay(date).toISOString();
      case 'week':
        return endOfWeek(date).toISOString();
      case 'month':
        return endOfMonth(date).toISOString();
      case 'year':
        return endOfYear(date).toISOString();
    }
  }

  // --------------------------------------------------
  // Difference
  // --------------------------------------------------

  /**
   * Computes the difference between two date/times in the specified unit.
   *
   * Supported units: `milliseconds`, `seconds`, `minutes`, `hours`, `days`.
   *
   * @param params - The input parameters.
   * @returns The numeric difference in the requested unit.
   * @example
   * ```yaml
   * # Measure pipeline execution duration in seconds
   * - group: datetime
   *   name: difference
   *   params:
   *     date1: '{{ pipelineFinishedAt }}'
   *     date2: '{{ pipelineStartedAt }}'
   *     unit: seconds
   * ```
   */
  static difference(params: DifferenceParams): number {
    const parsed = validations.datetime.difference.runtime.validate(params);
    const d1 = new Date(parsed.date1);
    const d2 = new Date(parsed.date2);

    switch (parsed.unit) {
      case 'milliseconds':
        return differenceInMilliseconds(d1, d2);
      case 'seconds':
        return differenceInSeconds(d1, d2);
      case 'minutes':
        return differenceInMinutes(d1, d2);
      case 'hours':
        return differenceInHours(d1, d2);
      case 'days':
        return differenceInDays(d1, d2);
    }
  }

  // --------------------------------------------------
  // Compare
  // --------------------------------------------------

  /**
   * Checks whether a date/time is after another.
   *
   * @param params - The input parameters.
   * @returns `true` if `dateTime` is after `dateTimeToCompare`, otherwise `false`.
   * @example
   * ```yaml
   * # Guard: only proceed if the pipeline deadline has not passed
   * - group: datetime
   *   name: isAfter
   *   params:
   *     dateTime: '{{ deadline }}'
   *     dateTimeToCompare: '{{ pipelineStartedAt }}'
   * ```
   */
  static isAfter(params: IsAfterParams): boolean {
    const parsed = validations.datetime.isAfter.runtime.validate(params);
    return isAfter(new Date(parsed.dateTime), new Date(parsed.dateTimeToCompare));
  }

  /**
   * Checks whether a date/time is before another.
   *
   * @param params - The input parameters.
   * @returns `true` if `dateTime` is before `dateTimeToCompare`, otherwise `false`.
   * @example
   * ```yaml
   * # Verify that the scheduled send time is still in the future
   * - group: datetime
   *   name: isBefore
   *   params:
   *     dateTime: '{{ scheduledSendAt }}'
   *     dateTimeToCompare: '{{ pipelineStartedAt }}'
   * ```
   */
  static isBefore(params: IsBeforeParams): boolean {
    const parsed = validations.datetime.isBefore.runtime.validate(params);
    return isBefore(new Date(parsed.dateTime), new Date(parsed.dateTimeToCompare));
  }

  /**
   * Checks whether two date/times are equal.
   *
   * @param params - The input parameters.
   * @returns `true` if both date/times represent the same instant, otherwise `false`.
   * @example
   * ```yaml
   * # Detect duplicate pipeline runs triggered at the same timestamp
   * - group: datetime
   *   name: isEqual
   *   params:
   *     dateTime: '{{ currentRunAt }}'
   *     dateTimeToCompare: '{{ previousRunAt }}'
   * ```
   */
  static isEqual(params: IsEqualParams): boolean {
    const parsed = validations.datetime.isEqual.runtime.validate(params);
    return isEqual(new Date(parsed.dateTime), new Date(parsed.dateTimeToCompare));
  }

  /**
   * Checks whether a date/time string represents a valid date.
   *
   * Returns `false` for strings like `'not-a-date'`, `'2023-13-01'` (invalid month),
   * or any value that does not parse to a real calendar date.
   *
   * @param params - The input parameters.
   * @returns `true` if the string is a valid date, otherwise `false`.
   * @example
   * ```yaml
   * # Validate user-supplied date input before processing
   * - group: datetime
   *   name: isValid
   *   params:
   *     dateTime: '{{ userInputDate }}'
   * ```
   */
  static isValid(params: IsValidParams): boolean {
    const parsed = validations.datetime.isValid.runtime.validate(params);
    return isValidDate(new Date(parsed.dateTime));
  }
}
