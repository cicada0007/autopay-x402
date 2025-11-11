import type { Request, Response, NextFunction } from 'express';

import { env } from '@config/env';

export function enforceHttps(req: Request, res: Response, next: NextFunction) {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    next();
    return;
  }

  const proto = req.get('x-forwarded-proto');
  if (req.secure || proto === 'https') {
    next();
    return;
  }

  const host = req.get('host');
  if (!host) {
    res.status(400).json({ message: 'HTTPS required' });
    return;
  }

  res.redirect(301, `https://${host}${req.originalUrl}`);
}


