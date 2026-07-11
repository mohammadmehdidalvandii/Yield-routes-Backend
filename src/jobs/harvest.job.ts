import cron from 'node-cron';

import { StellarService } from '../services/stellar.service';
import { config } from '../config';
import { logger } from '../logger';

import { prisma } from '../prisma';
const stellar = new StellarService();

export function startHarvestCron(): void {
  logger.info('Harvest cron scheduled', { schedule: config.HARVEST_CRON });

  cron.schedule(config.HARVEST_CRON, async () => {
    logger.info('Running scheduled harvest...');
    try {
      const result = await stellar.harvestVault();
      if (result.yieldAmount > 0) {
        await prisma.harvestEvent.create({
          data: {
            yieldAmount: result.yieldAmount,
            totalAssets: result.totalAssets,
            sharePrice: result.sharePrice,
            txHash: result.txHash,
          },
        });
        logger.info('Harvest complete', { yieldAmount: result.yieldAmount });
      } else {
        logger.info('Harvest: no yield to collect this cycle');
      }
    } catch (err: any) {
      logger.error('Harvest cron failed', { err: err.message });
    }
  });
}
