import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../logger';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();

  if (!config.ADMIN_API_KEY) {
    return next();
  }

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== config.ADMIN_API_KEY) {
    logger.warn('missing or invalid API key', { requestId, path: req.path });
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'missing or invalid API key', requestId },
    });
    return;
  }

  next();
}
