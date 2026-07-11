import cron from 'node-cron';
import { StellarService } from '../services/stellar.service';
import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';

const stellar = new StellarService();

export function startPriceUpdateCron(): void {
  logger.info('Price update cron scheduled', { schedule: config.PRICE_UPDATE_CRON });

  cron.schedule(config.PRICE_UPDATE_CRON, async () => {
    // Load tracked pairs dynamically from registered pools every cycle so
    // newly added pools are picked up without a restart.
    let pairs: Array<{ base: string; quote: string }>;
    try {
      const pools = await prisma.registeredPool.findMany({
        where: { active: true },
        select: { tokenA: true, tokenB: true },
      });
      pairs = pools.map(p => ({ base: p.tokenA, quote: p.tokenB }));
    } catch (err: any) {
      logger.warn('Price job: failed to load pairs from DB', { err: err.message });
      return;
    }

    if (!pairs.length) {
      logger.debug('Price job: no active pools to price');
      return;
    }

    for (const { base, quote } of pairs) {
      try {
        const twap = await stellar.getOracleTwap(base, quote);
        if (twap > 0) {
          await prisma.priceSnapshot.create({
            data: {
              baseToken: base,
              quoteToken: quote,
              price: twap,
              twapPrice: twap,
              reporter: 'system-bot',
            },
          });
        }
      } catch (err: any) {
        logger.warn('Price update failed for pair', {
          base: base.slice(0, 8),
          quote: quote.slice(0, 8),
          err: err.message,
        });
      }
    }

    logger.debug('Price job complete', { pairsUpdated: pairs.length });
  });
}
