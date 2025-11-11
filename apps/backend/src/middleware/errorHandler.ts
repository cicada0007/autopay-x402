import type { Request, Response } from 'express';

type HttpError = Error & {
  status?: number;
  details?: unknown;
};

export function errorHandler(error: HttpError, _req: Request, res: Response) {
  const status = error.status ?? 500;
  const payload = {
    message: error.message ?? 'Unexpected server error',
    details: error.details ?? null
  };

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[backend] critical error', error);
  }

  res.status(status).json(payload);
}

