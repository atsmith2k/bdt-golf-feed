export interface AppError extends Error {
  code: string;
  status?: number;
  details?: unknown;
}

function makeError(code: string, message: string, status?: number, details?: unknown): AppError {
  const err = new Error(message) as AppError;
  err.code = code;
  err.status = status;
  err.details = details;
  return err;
}

export function createExternalServiceError(
  service: string,
  message: string,
  details?: unknown,
): AppError {
  return makeError('EXTERNAL_SERVICE_ERROR', `[${service}] ${message}`, 502, details);
}

export function createGhinApiError(message: string, details?: unknown): AppError {
  return makeError('GHIN_API_ERROR', message, 502, details);
}

export function createValidationError(message: string, details?: unknown): AppError {
  return makeError('VALIDATION_ERROR', message, 400, details);
}

export function createUnauthorizedError(message = 'Unauthorized'): AppError {
  return makeError('UNAUTHORIZED', message, 401);
}

export function createNotFoundError(message = 'Not found'): AppError {
  return makeError('NOT_FOUND', message, 404);
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof Error && typeof (err as AppError).code === 'string';
}
