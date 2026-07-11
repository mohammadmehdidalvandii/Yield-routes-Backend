import { Router } from 'express';
import * as c from '../controllers/pool.controller';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const RegisterSchema = z.object({
  tokenA: z.string().length(56),
  tokenB: z.string().length(56),
  poolAddress: z.string().length(56),
});

router.get ('/',                      c.listPools);
router.get ('/:tokenA/:tokenB',       c.getPool);
router.post('/register', validateBody(RegisterSchema), c.registerPool);
router.delete('/:id',                 c.deregisterPool);

export default router;
