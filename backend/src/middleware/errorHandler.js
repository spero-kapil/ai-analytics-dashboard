import { HttpError } from '../utils/HttpError.js';

const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
]);

const isDatabaseError = (err) => typeof err.sqlState === 'string' || err.code?.startsWith('ER_');

const toHttpError = (err) => {
  if (err instanceof HttpError) return err;

  // Errors raised by express.json() while reading the body.
  if (err.type === 'entity.parse.failed') return new HttpError(400, 'Malformed JSON in request body');
  if (err.type === 'entity.too.large') return new HttpError(413, 'Request body is too large');
  if (err.status >= 400 && err.status < 500) return new HttpError(err.status, err.message);

  if (DB_UNAVAILABLE_CODES.has(err.code)) return new HttpError(503, 'Database unavailable');
  if (isDatabaseError(err)) return new HttpError(500, 'Database error');

  return new HttpError(500, 'Internal server error');
};

export const notFound = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  const httpError = toHttpError(err);

  if (httpError.status >= 500) {
    console.error(err);
  }

  res.status(httpError.status).json({
    success: false,
    error: {
      message: httpError.message,
      ...(httpError.details && { details: httpError.details }),
    },
  });
};
