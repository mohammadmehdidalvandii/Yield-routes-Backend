import { Router } from 'express';
import * as c from '../controllers/route.controller';
import { validateBody, validateQuery } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const QuoteSchema = z.object({
  tokenIn: z.string().length(56),
  tokenOut: z.string().length(56),
  amountIn: z.number().positive(),
  maxHops: z.number().int().min(1).max(6).default(3),
});

const ExecuteSchema = z.object({
  quoteId: z.string().uuid(),
  sender: z.string().length(56),
  minOut: z.number().nonnegative().default(0),
});

router.get ('/',           c.listRouteQuotes);
router.get ('/stats',      c.getRouteStats);
router.post('/quote',      validateBody(QuoteSchema),   c.getQuote);
router.post('/execute',    validateBody(ExecuteSchema),  c.executeRoute);
router.get ('/:id',        c.getRouteQuote);

export default router;
