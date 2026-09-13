import { z } from 'zod';

export const codePointLength = (value: string) => [...value].length;
export const text = (minimum: number, maximum: number) => z.string().trim()
  .refine(value => codePointLength(value) >= minimum && codePointLength(value) <= maximum,
    `Enter ${minimum}–${maximum} characters.`);
export const unsignedInteger = (maximum: bigint) => z.string().regex(/^(0|[1-9][0-9]*)$/u, 'Enter a whole number.')
  .refine(value => value.length <= maximum.toString().length && BigInt(value) <= maximum, 'Amount exceeds the supported limit.');
export const money = unsignedInteger(100_000_000n);
export const profileCompletionSchema = z.strictObject({ displayName: text(1, 80) });

export function rupeesToPaisa(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/u.test(value)) throw new Error('Enter rupees with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const paisa = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return money.parse(paisa.toString());
}
