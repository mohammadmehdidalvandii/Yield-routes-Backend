import { Router } from 'express';
import * as c from '../controllers/vault.controller';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const DepositSchema = z.object({ depositor: z.string().length(56), amount: z.number().positive() });
const RedeemSchema  = z.object({ depositor: z.string().length(56), shares: z.number().positive() });
const HarvestSchema = z.object({ grossYield: z.number().positive() });

router.get ('/',                  c.getVaultStats);
router.get ('/share-price',       c.getSharePrice);
router.get ('/preview-deposit',   c.previewDeposit);  // ?assets=1000
router.get ('/preview-redeem',    c.previewRedeem);   // ?shares=1000
router.get ('/deposits',          c.listDeposits);
router.get ('/withdrawals',       c.listWithdrawals);
router.get ('/harvests',          c.listHarvests);
router.get ('/depositor/:address',c.getDepositorInfo);
router.post('/deposit',  validateBody(DepositSchema),  c.deposit);
router.post('/redeem',   validateBody(RedeemSchema),   c.redeem);
router.post('/withdraw', validateBody(DepositSchema),  c.withdraw); // SEP-56 withdraw(assets,...)
router.post('/harvest',  validateBody(HarvestSchema),  c.triggerHarvest);

export default router;
