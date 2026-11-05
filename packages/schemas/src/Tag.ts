import { z } from 'zod';

/**
 * Tags are lowercase letters (any language), numbers, single spaces and hyphens. Turns
 * any text into that: "Heart  Rate!" is `heart rate`, "testasd@$@#$" is `testasd`;
 * nothing left means no tag (empty string).
 */
export function normalizeTagLabel(raw: string): string {
  return raw
    .normalize('NFC') // "é" typed as e + accent mark is one letter
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} -]+/gu, '')
    .replace(/ {2,}/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[ -]+|[ -]+$/g, '');
}

/**
 * normalizeTagLabel on each label, dropping empties and repeats, so "Urgent", " urgent"
 * and "URGENT!" are all the one tag `urgent`. Used wherever tags come in (forms,
 * workflow files, hub installs, restores) so nothing has to fail on them.
 */
export function normalizeTagLabels(labels: unknown[]): string[] {
  const result: string[] = [];
  for (const raw of labels) {
    if (typeof raw !== 'string') continue;
    const label = normalizeTagLabel(raw);
    if (label && !result.includes(label)) result.push(label);
  }
  return result;
}

export const tagLabelSchema = z
  .string({
    required_error: 'tag.label.required',
    invalid_type_error: 'tag.label.invalid',
  })
  .transform(normalizeTagLabel)
  .pipe(z.string().min(1, 'tag.label.required').max(50, 'tag.label.tooLong'));

export const tagCreationSchema = z.object({
  label: tagLabelSchema,
});

export const tagRenameSchema = z.object({
  id: z.number(),
  label: tagLabelSchema,
});
