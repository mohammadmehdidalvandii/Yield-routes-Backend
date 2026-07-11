import { Router } from 'express';
import * as c from '../controllers/oracle.controller';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const PriceSchema = z.object({
  baseToken: z.string().length(56),
  quoteToken: z.string().length(56),
  price: z.number().positive(),
  reporter: z.string().length(56),
});

router.get ('/',                        c.listLatestPrices);
router.get ('/:baseToken/:quoteToken',  c.getPrice);
router.get ('/:baseToken/:quoteToken/history', c.getPriceHistory);
router.post('/submit',  validateBody(PriceSchema), c.submitPrice);

export default router;
