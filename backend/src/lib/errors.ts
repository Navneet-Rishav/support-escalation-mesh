/**
 * Typed application errors. Every error the API returns has the same JSON shape:
 *   { "error": { "code": "NOT_FOUND", "message": "...", "details"?: ..., "requestId": "..." } }
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', msg);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const invalidState = (msg: string) => new AppError(409, 'INVALID_STATE', msg);
