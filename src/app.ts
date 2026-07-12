import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { validateEnv } from './env';
import { config } from './config';
import { requestId, errorHandler } from './middleware/errors';
import routeRouter from './routes/route.routes';
import vaultRouter from './routes/vault.routes';
import poolRouter from './routes/pool.routes';
import oracleRouter from './routes/oracle.routes';

validateEnv();

const app = express();
app.use(requestId);
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGINS }));
app.use(morgan('combined'));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true }));

app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'yield-routes',
    version: '0.1.0',
    network: config.STELLAR_NETWORK,
    ts: Date.now(),
  })
);

app.get('/api/v1/network', (_req, res) =>
  res.json({
    network: config.STELLAR_NETWORK,
    rpcUrl: config.STELLAR_RPC_URL,
    passphrase: config.STELLAR_NETWORK_PASSPHRASE,
    contracts: {
      routeAggregator: config.ROUTE_AGGREGATOR_ID || null,
      yieldVault: config.YIELD_VAULT_ID || null,
      feeDistributor: config.FEE_DISTRIBUTOR_ID || null,
      priceOracle: config.PRICE_ORACLE_ID || null,
    },
  })
);

app.use('/api/v1/routes',  routeRouter);
app.use('/api/v1/vault',   vaultRouter);
app.use('/api/v1/pools',   poolRouter);
app.use('/api/v1/oracle',  oracleRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));
app.use(errorHandler);

export default app;
