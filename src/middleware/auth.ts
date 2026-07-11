import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../logger';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();

  if (!config.adminApiKey) {
    return next();
  }

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== config.adminApiKey) {
    logger.warn({ requestId, path: req.path }, 'missing or invalid API key');
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'missing or invalid API key', requestId },
    });
    return;
  }

  next();
}
