import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

/** Turns every error into the same JSON shape and never leaks stack traces to clients. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appErr: AppError;
  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof SyntaxError && 'body' in (err as object)) {
    appErr = new AppError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
  } else if ((err as { type?: string }).type === 'entity.too.large') {
    appErr = new AppError(413, 'VALIDATION_ERROR', 'Request body is too large');
  } else if (err instanceof mongoose.Error.ValidationError) {
    appErr = new AppError(400, 'VALIDATION_ERROR', err.message);
  } else if ((err as { code?: number }).code === 11000) {
    appErr = new AppError(409, 'CONFLICT', 'A record with these details already exists');
  } else {
    logger.error({ err, requestId: req.id }, 'unhandled error');
    appErr = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  res.status(appErr.status).json({
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
      requestId: req.id,
    },
  });
}
