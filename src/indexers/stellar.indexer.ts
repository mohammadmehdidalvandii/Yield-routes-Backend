import { SorobanRpc } from '@stellar/stellar-sdk';

import { config } from '../config';
import { logger } from '../logger';

import { prisma } from '../prisma';

export async function startIndexer(): Promise<void> {
  const server = new SorobanRpc.Server(config.STELLAR_RPC_URL);
  const ids = [
    config.ROUTE_AGGREGATOR_ID,
    config.YIELD_VAULT_ID,
    config.FEE_DISTRIBUTOR_ID,
    config.PRICE_ORACLE_ID,
  ].filter(Boolean);

  logger.info('YieldRoutes indexer started', { contractCount: ids.length });

  const cursorRec = await prisma.indexerCursor.findUnique({ where: { id: 1 } });
  let cursor = cursorRec?.ledger ?? config.INDEXER_STARTING_LEDGER;

  while (true) {
    try {
      if (!ids.length) { await sleep(5000); continue; }
      const events = await server.getEvents({
        startLedger: cursor,
        filters: [{ type: 'contract', contractIds: ids }],
      });
      for (const ev of events.events) await processEvent(ev);
      if (events.events.length > 0) {
        cursor = Math.max(...events.events.map(e => e.ledger)) + 1;
        await prisma.indexerCursor.upsert({
          where: { id: 1 }, create: { id: 1, ledger: cursor }, update: { ledger: cursor },
        });
        logger.debug('Events indexed', { count: events.events.length, cursor });
      }
    } catch (err: any) {
      logger.warn('Indexer error', { message: err.message });
    }
    await sleep(2000);
  }
}

async function processEvent(ev: any): Promise<void> {
  const topic = ev.topic?.[0]?.toString() ?? '';
  switch (topic) {
    // RouteAggregator
    case 'quote_created':
      logger.debug('Route quote created on-chain', { ledger: ev.ledger }); break;
    case 'route_executed':
      logger.info('Route executed on-chain', { ledger: ev.ledger }); break;
    case 'pool_registered':
      logger.info('AMM pool registered on-chain', { ledger: ev.ledger }); break;
    case 'pool_deregistered':
      logger.info('AMM pool deregistered on-chain', { ledger: ev.ledger }); break;

    // YieldVault (SEP-56 event names — no past tense, matches SEP-56 convention)
    case 'deposit':
      logger.info('Vault deposit on-chain (SEP-56)', { ledger: ev.ledger }); break;
    case 'withdraw':
      logger.info('Vault withdraw/redeem on-chain (SEP-56)', { ledger: ev.ledger }); break;
    case 'harvested':
      logger.info('Yield harvested on-chain', { ledger: ev.ledger }); break;
    case 'transfer':
      logger.debug('Vault share transfer on-chain', { ledger: ev.ledger }); break;
    case 'approve':
      logger.debug('Vault share allowance set on-chain', { ledger: ev.ledger }); break;

    // FeeDistributor
    case 'distributed':
      logger.info('Fees distributed on-chain', { ledger: ev.ledger }); break;

    // PriceOracle
    case 'price_submitted':
      logger.debug('Oracle price submitted', { ledger: ev.ledger }); break;
    case 'reporter_added':
      logger.info('Oracle reporter added', { ledger: ev.ledger }); break;

    default:
      break;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
