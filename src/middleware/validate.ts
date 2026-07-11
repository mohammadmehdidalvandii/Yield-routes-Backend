import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validateBody = (s: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const r = s.safeParse(req.body);
    if (!r.success) return res.status(400).json({ error: 'Validation failed', details: r.error.flatten() });
    req.body = r.data; next();
  };

export const validateParams = (s: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const r = s.safeParse(req.params);
    if (!r.success) return res.status(400).json({ error: 'Invalid params' });
    next();
  };

export const validateQuery = (s: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const r = s.safeParse(req.query);
    if (!r.success) return res.status(400).json({ error: 'Invalid query' });
    req.query = r.data; next();
  };
