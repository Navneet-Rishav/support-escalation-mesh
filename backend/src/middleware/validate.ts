import type { z } from 'zod';
import { AppError } from '../lib/errors.js';

/**
 * Validates untrusted input (body, query or params) with a Zod schema.
 * Returns typed data, or throws a 400 VALIDATION_ERROR listing each problem field.
 */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
