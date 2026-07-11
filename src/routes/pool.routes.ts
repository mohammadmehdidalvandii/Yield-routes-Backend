import { Router } from 'express';
import * as c from '../controllers/pool.controller';
import { validateBody } from '../middleware/validate';
import { requireApiKey } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const RegisterSchema = z.object({
  tokenA: z.string().length(56),
  tokenB: z.string().length(56),
  poolAddress: z.string().length(56),
});

router.get ('/',                      c.listPools);
router.get ('/:tokenA/:tokenB',       c.getPool);
router.post('/register', requireApiKey, validateBody(RegisterSchema), c.registerPool);
router.delete('/:id',                 requireApiKey, c.deregisterPool);

export default router;
