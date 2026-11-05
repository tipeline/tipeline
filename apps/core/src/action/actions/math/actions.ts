import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type AbsParams = z.infer<typeof validations.math.abs.runtime.schema>;
type AddParams = z.infer<typeof validations.math.add.runtime.schema>;
type CeilParams = z.infer<typeof validations.math.ceil.runtime.schema>;
type ClampParams = z.infer<typeof validations.math.clamp.runtime.schema>;
type DecrementParams = z.infer<typeof validations.math.decrement.runtime.schema>;
type DivideParams = z.infer<typeof validations.math.divide.runtime.schema>;
type FloorParams = z.infer<typeof validations.math.floor.runtime.schema>;
type FormatNumberParams = z.infer<typeof validations.math.formatNumber.runtime.schema>;
type IncrementParams = z.infer<typeof validations.math.increment.runtime.schema>;
type InRangeParams = z.infer<typeof validations.math.inRange.runtime.schema>;
type MaxParams = z.infer<typeof validations.math.max.runtime.schema>;
type MeanParams = z.infer<typeof validations.math.mean.runtime.schema>;
type MedianParams = z.infer<typeof validations.math.median.runtime.schema>;
type MinParams = z.infer<typeof validations.math.min.runtime.schema>;
type ModParams = z.infer<typeof validations.math.mod.runtime.schema>;
type MultiplyParams = z.infer<typeof validations.math.multiply.runtime.schema>;
type PercentageParams = z.infer<typeof validations.math.percentage.runtime.schema>;
type PowParams = z.infer<typeof validations.math.pow.runtime.schema>;
type RandomParams = z.infer<typeof validations.math.random.runtime.schema>;
type RoundParams = z.infer<typeof validations.math.round.runtime.schema>;
type SignParams = z.infer<typeof validations.math.sign.runtime.schema>;
type SubtractParams = z.infer<typeof validations.math.subtract.runtime.schema>;
type SumParams = z.infer<typeof validations.math.sum.runtime.schema>;
type ToFixedParams = z.infer<typeof validations.math.toFixed.runtime.schema>;
type TruncParams = z.infer<typeof validations.math.trunc.runtime.schema>;

/**
 * @group Actions
 */
export class GroupMath {
  // --------------------------------------------------
  // Arithmetic
  // --------------------------------------------------

  /**
   * Returns the absolute value of a number.
   *
   * @param params - The input parameters.
   * @returns The absolute value of the input number.
   * @example
   * ```yaml
   * # Convert a negative balance to a positive magnitude
   * - group: math
   *   name: abs
   *   params:
   *     number: '{{ balance }}'
   * ```
   */
  static abs(params: AbsParams): number {
    const { number } = validations.math.abs.runtime.validate(params);
    return Math.abs(number);
  }

  /**
   * Adds two numbers.
   *
   * @param params - The input parameters.
   * @returns The sum of augend and addend.
   * @example
   * ```yaml
   * # Add a fixed shipping fee to a pipeline-produced subtotal
   * - group: math
   *   name: add
   *   params:
   *     augend: '{{ subtotal }}'
   *     addend: 5
   * ```
   */
  static add(params: AddParams): number {
    const { augend, addend } = validations.math.add.runtime.validate(params);
    return augend + addend;
  }

  /**
   * Subtracts one number from another.
   *
   * @param params - The input parameters.
   * @returns The difference of minuend minus subtrahend.
   * @example
   * ```yaml
   * # Subtract a discount from the invoice total
   * - group: math
   *   name: subtract
   *   params:
   *     minuend: '{{ invoiceTotal }}'
   *     subtrahend: '{{ discount }}'
   * ```
   */
  static subtract(params: SubtractParams): number {
    const { minuend, subtrahend } = validations.math.subtract.runtime.validate(params);
    return minuend - subtrahend;
  }

  /**
   * Multiplies two numbers.
   *
   * @param params - The input parameters.
   * @returns The product of multiplier and multiplicand.
   * @example
   * ```yaml
   * # Calculate total price from unit price and quantity
   * - group: math
   *   name: multiply
   *   params:
   *     multiplier: '{{ unitPrice }}'
   *     multiplicand: '{{ quantity }}'
   * ```
   */
  static multiply(params: MultiplyParams): number {
    const { multiplier, multiplicand } = validations.math.multiply.runtime.validate(params);
    return multiplier * multiplicand;
  }

  /**
   * Divides one number by another.
   *
   * @param params - The input parameters.
   * @returns The quotient of dividend divided by divisor.
   * @example
   * ```yaml
   * # Calculate average order value from total revenue and order count
   * - group: math
   *   name: divide
   *   params:
   *     dividend: '{{ totalRevenue }}'
   *     divisor: '{{ orderCount }}'
   * ```
   */
  static divide(params: DivideParams): number {
    const { dividend, divisor } = validations.math.divide.runtime.validate(params);
    return dividend / divisor;
  }

  /**
   * Returns the remainder after dividing two numbers.
   *
   * @param params - The input parameters.
   * @returns The remainder after dividing dividend by divisor.
   * @example
   * ```yaml
   * # Check if a row index is even to apply alternating row formatting
   * - group: math
   *   name: mod
   *   params:
   *     dividend: '{{ rowIndex }}'
   *     divisor: 2
   * ```
   */
  static mod(params: ModParams): number {
    const { dividend, divisor } = validations.math.mod.runtime.validate(params);
    return dividend % divisor;
  }

  /**
   * Raises a base number to an exponent.
   *
   * @param params - The input parameters.
   * @returns The result of base raised to exponent.
   * @example
   * ```yaml
   * # Calculate exponential backoff — 2 to the power of the retry count
   * - group: math
   *   name: pow
   *   params:
   *     base: 2
   *     exponent: '{{ retryCount }}'
   * ```
   */
  static pow(params: PowParams): number {
    const { base, exponent } = validations.math.pow.runtime.validate(params);
    return Math.pow(base, exponent);
  }

  // --------------------------------------------------
  // Rounding
  // --------------------------------------------------

  /**
   * Rounds a number up to the nearest integer.
   *
   * @param params - The input parameters.
   * @returns The smallest integer greater than or equal to the input number.
   * @example
   * ```yaml
   * # Round up page count so all records fit — e.g., 7.33 pages → 8 pages
   * - group: math
   *   name: ceil
   *   params:
   *     number: '{{ pageCount }}'
   * ```
   */
  static ceil(params: CeilParams): number {
    const { number } = validations.math.ceil.runtime.validate(params);
    return Math.ceil(number);
  }

  /**
   * Rounds a number down to the nearest integer.
   *
   * @param params - The input parameters.
   * @returns The largest integer less than or equal to the input number.
   * @example
   * ```yaml
   * # Floor a float confidence score to its integer part for bucketing
   * - group: math
   *   name: floor
   *   params:
   *     number: '{{ confidenceScore }}'
   * ```
   */
  static floor(params: FloorParams): number {
    const { number } = validations.math.floor.runtime.validate(params);
    return Math.floor(number);
  }

  /**
   * Rounds a number to the nearest integer.
   *
   * @param params - The input parameters.
   * @returns The nearest integer to the input number.
   * @example
   * ```yaml
   * # Round a computed average to a whole number before displaying it
   * - group: math
   *   name: round
   *   params:
   *     number: '{{ averageScore }}'
   * ```
   */
  static round(params: RoundParams): number {
    const { number } = validations.math.round.runtime.validate(params);
    return Math.round(number);
  }

  /**
   * Truncates a number toward zero, removing the fractional part.
   *
   * @param params - The input parameters.
   * @returns The integer part of the number, truncated toward zero.
   * @example
   * ```yaml
   * # Truncate a negative offset toward zero — e.g., -7.9 → -7
   * - group: math
   *   name: trunc
   *   params:
   *     number: '{{ rawOffset }}'
   * ```
   */
  static trunc(params: TruncParams): number {
    const { number } = validations.math.trunc.runtime.validate(params);
    return Math.trunc(number);
  }

  /**
   * Formats a number to a fixed number of decimal places.
   *
   * @param params - The input parameters.
   * @returns A string representation of the number fixed to the specified decimal places.
   * @example
   * ```yaml
   * # Format a calculated price to two decimal places for an invoice line item
   * - group: math
   *   name: toFixed
   *   params:
   *     number: '{{ lineItemTotal }}'
   *     digits: 2
   * ```
   */
  static toFixed(params: ToFixedParams): string {
    const { number, digits } = validations.math.toFixed.runtime.validate(params);
    return number.toFixed(digits);
  }

  /**
   * Formats a number using locale-aware grouping and decimal separators.
   *
   * @param params - The input parameters.
   * @returns A locale-formatted string representation of the number.
   * @example
   * ```yaml
   * # Format total revenue for display in a report — e.g., 15000 → "15,000.00"
   * - group: math
   *   name: formatNumber
   *   params:
   *     number: '{{ totalRevenue }}'
   *     locale: en-US
   *     minimumFractionDigits: 2
   *     maximumFractionDigits: 2
   * ```
   */
  static formatNumber(params: FormatNumberParams): string {
    const { number, locale, minimumFractionDigits, maximumFractionDigits } =
      validations.math.formatNumber.runtime.validate(params);
    return new Intl.NumberFormat(locale ?? 'en-US', {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(number);
  }

  // --------------------------------------------------
  // Aggregates
  // --------------------------------------------------

  /**
   * Returns the maximum value from an array of numbers.
   *
   * @param params - The input parameters.
   * @returns The largest number in the input array.
   * @example
   * ```yaml
   * # Find the highest price from a list of scraped product prices
   * - group: math
   *   name: max
   *   params:
   *     array: '{{ prices }}'
   * ```
   */
  static max(params: MaxParams): number {
    const { array } = validations.math.max.runtime.validate(params);
    return Math.max(...array);
  }

  /**
   * Returns the arithmetic mean of an array of numbers.
   *
   * @param params - The input parameters.
   * @returns The arithmetic mean of all numbers in the array.
   * @example
   * ```yaml
   * # Compute the average response time across a set of HTTP checks
   * - group: math
   *   name: mean
   *   params:
   *     array: '{{ responseTimes }}'
   * ```
   */
  static mean(params: MeanParams): number {
    const { array } = validations.math.mean.runtime.validate(params);
    return array.reduce((acc, val) => acc + val, 0) / array.length;
  }

  /**
   * Returns the minimum value from an array of numbers.
   *
   * @param params - The input parameters.
   * @returns The smallest number in the input array.
   * @example
   * ```yaml
   * # Find the lowest bid from a set of submitted prices
   * - group: math
   *   name: min
   *   params:
   *     array: '{{ bids }}'
   * ```
   */
  static min(params: MinParams): number {
    const { array } = validations.math.min.runtime.validate(params);
    return Math.min(...array);
  }

  /**
   * Returns the sum of all numbers in an array.
   *
   * @param params - The input parameters.
   * @returns The sum of all numbers in the input array.
   * @example
   * ```yaml
   * # Sum all invoice line item amounts to compute the subtotal
   * - group: math
   *   name: sum
   *   params:
   *     array: '{{ lineItems }}'
   * ```
   */
  static sum(params: SumParams): number {
    const { array } = validations.math.sum.runtime.validate(params);
    return array.reduce((acc, val) => acc + val, 0);
  }

  /**
   * Returns the median value of an array of numbers.
   *
   * @param params - The input parameters.
   * @returns The middle value of the sorted array, or the mean of the two middle values for even-length arrays.
   * @example
   * ```yaml
   * # Find the median score from a set of test results — more robust than mean when outliers exist
   * - group: math
   *   name: median
   *   params:
   *     array: '{= scores =}'
   * ```
   */
  static median(params: MedianParams): number {
    const { array } = validations.math.median.runtime.validate(params);
    const sorted = [...array].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // --------------------------------------------------
  // Utility
  // --------------------------------------------------

  /**
   * Constrains a number within a minimum and maximum range.
   *
   * @param params - The input parameters.
   * @returns The value constrained between min and max.
   * @example
   * ```yaml
   * # Ensure a retry delay never drops below 1s or exceeds 60s
   * - group: math
   *   name: clamp
   *   params:
   *     value: '{{ retryDelay }}'
   *     min: 1
   *     max: 60
   * ```
   */
  static clamp(params: ClampParams): number {
    const { value, min, max } = validations.math.clamp.runtime.validate(params);
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Calculates what percentage a value is of a total.
   *
   * @param params - The input parameters.
   * @returns The percentage that value represents of total, in the range 0–100.
   * @example
   * ```yaml
   * # Calculate completion percentage from processed and total record counts
   * - group: math
   *   name: percentage
   *   params:
   *     value: '{{ processedCount }}'
   *     total: '{{ totalCount }}'
   * ```
   */
  static percentage(params: PercentageParams): number {
    const { value, total } = validations.math.percentage.runtime.validate(params);
    return (value / total) * 100;
  }

  /**
   * Returns the sign of a number as -1, 0, or 1.
   *
   * @param params - The input parameters.
   * @returns -1 if the number is negative, 0 if zero, or 1 if positive.
   * @example
   * ```yaml
   * # Detect whether a profit delta is positive, negative, or zero
   * - group: math
   *   name: sign
   *   params:
   *     number: '{{ profitDelta }}'
   * ```
   */
  static sign(params: SignParams): number {
    const { number } = validations.math.sign.runtime.validate(params);
    return Math.sign(number);
  }

  /**
   * Increases a number by a step value.
   *
   * @param params - The input parameters.
   * @returns The number increased by step (default 1).
   * @example
   * ```yaml
   * # Advance a page counter to fetch the next batch of records
   * - group: math
   *   name: increment
   *   params:
   *     number: '{{ pageNumber }}'
   * ```
   */
  static increment(params: IncrementParams): number {
    const { number, step } = validations.math.increment.runtime.validate(params);
    return number + (step ?? 1);
  }

  /**
   * Decreases a number by a step value.
   *
   * @param params - The input parameters.
   * @returns The number decreased by step (default 1).
   * @example
   * ```yaml
   * # Count down remaining retries after each failed attempt
   * - group: math
   *   name: decrement
   *   params:
   *     number: '{{ remainingRetries }}'
   * ```
   */
  static decrement(params: DecrementParams): number {
    const { number, step } = validations.math.decrement.runtime.validate(params);
    return number - (step ?? 1);
  }

  /**
   * Checks whether a value falls within an inclusive range.
   *
   * @param params - The input parameters.
   * @returns True if min ≤ value ≤ max, false otherwise.
   * @example
   * ```yaml
   * # Check if an HTTP status code falls in the success range (200–299)
   * - group: math
   *   name: inRange
   *   params:
   *     value: '{{ httpStatusCode }}'
   *     min: 200
   *     max: 299
   * ```
   */
  static inRange(params: InRangeParams): boolean {
    const { value, min, max } = validations.math.inRange.runtime.validate(params);
    return value >= min && value <= max;
  }

  // --------------------------------------------------
  // Generators
  // --------------------------------------------------

  /**
   * Generates a random floating-point number within an optional range.
   *
   * @param params - The input parameters.
   * @returns A random floating-point number in the range [min, max).
   * @example
   * ```yaml
   * # Add random jitter to a retry delay to avoid thundering herd
   * - group: math
   *   name: random
   *   params:
   *     min: 500
   *     max: 1500
   * ```
   */
  static random(params: RandomParams): number {
    const { min, max } = validations.math.random.runtime.validate(params);
    const lo = min ?? 0;
    const hi = max ?? 1;
    return Math.random() * (hi - lo) + lo;
  }
}
