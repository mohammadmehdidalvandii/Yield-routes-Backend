import { config } from './config';
import { logger } from './logger';
import app from './app';
import { startIndexer } from './indexers/stellar.indexer';
import { startHarvestCron } from './jobs/harvest.job';
import { startPriceUpdateCron } from './jobs/price.job';

app.listen(config.PORT, () => logger.info(`YieldRoutes API on :${config.PORT}`));

startIndexer().catch(e => logger.error('Indexer crashed', { e }));
startHarvestCron();
startPriceUpdateCron();

export default app;
