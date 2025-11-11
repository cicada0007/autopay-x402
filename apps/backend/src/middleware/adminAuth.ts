import type { Request, Response, NextFunction } from 'express';

import { env } from '@config/env';

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  if (typeof req.query.token === 'string') {
    return req.query.token;
  }

  if (typeof req.headers['x-api-key'] === 'string') {
    return req.headers['x-api-key'];
  }

  return undefined;
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (token && token === env.ADMIN_API_KEY) {
    next();
    return;
  }

  res.status(401).json({
    message: 'Unauthorized'
  });
}


