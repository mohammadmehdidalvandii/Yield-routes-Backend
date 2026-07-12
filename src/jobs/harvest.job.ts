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
      const grossYield = await stellar.estimateGrossYield();
      if (grossYield <= 0) {
        logger.info('Harvest: no yield to collect this cycle');
        return;
      }
      const result = await stellar.harvestVault(grossYield);
      await prisma.harvestEvent.create({
        data: {
          yieldAmount: result.netYield,
          totalAssets: result.totalAssets,
          sharePrice: 0,
          txHash: result.txHash,
        },
      });
      logger.info('Harvest complete', { netYield: result.netYield });
    } catch (err: any) {
      logger.error('Harvest cron failed', { err: err.message });
    }
  });
}
