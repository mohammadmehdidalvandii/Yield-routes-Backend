import request from 'supertest';
import app from '../index';

jest.mock('@prisma/client', () => {
  const mockPrisma = {
    routeQuote: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'uuid-1', onChainId: 1, tokenIn: 'G'.repeat(56), tokenOut: 'G'.repeat(56),
        amountIn: 1000, expectedOut: 997, priceImpactBps: 5, protocolFee: 0.1,
        validUntil: new Date(Date.now() + 60000), executed: false, createdAt: new Date(),
      }),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountIn: 0, executedOut: 0 } }),
    },
    vaultDeposit: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    vaultWithdrawal: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    harvestEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { yieldAmount: 0 } }),
    },
    priceSnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    registeredPool: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    indexerCursor: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('../services/stellar.service', () => ({
  StellarService: jest.fn().mockImplementation(() => ({
    getRouteQuote: jest.fn().mockResolvedValue({ expectedOut: 997, priceImpactBps: 5, protocolFee: 1, legs: [] }),
    executeRoute: jest.fn().mockResolvedValue({ actualOut: 997, slippageBps: 0, txHash: 'tx' }),
    getVaultTotalAssets: jest.fn().mockResolvedValue(0),
    getVaultTotalShares: jest.fn().mockResolvedValue(0),
    getVaultSharePrice: jest.fn().mockResolvedValue(1_000_000_000),
    getVaultHarvestCount: jest.fn().mockResolvedValue(0),
    getVaultShares: jest.fn().mockResolvedValue(0),
    vaultDeposit: jest.fn().mockResolvedValue({ tokenId: 'USDC', sharesIssued: 1000, txHash: 'tx' }),
    vaultWithdraw: jest.fn().mockResolvedValue({ amountOut: 1000, txHash: 'tx' }),
    harvestVault: jest.fn().mockResolvedValue({ yieldAmount: 50, totalAssets: 1050, sharePrice: 1_050_000_000, txHash: 'tx' }),
    getOracleTwap: jest.fn().mockResolvedValue(0),
  })),
}));

describe('GET /health', () => {
  it('returns yield-routes health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('yield-routes');
  });
});

describe('POST /api/v1/routes/quote — validation', () => {
  const validQuote = {
    tokenIn: 'G'.repeat(56),
    tokenOut: 'G'.repeat(56),
    amountIn: 1000,
    maxHops: 3,
  };

  it('returns a route quote for valid input', async () => {
    const res = await request(app).post('/api/v1/routes/quote').send(validQuote);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('expectedOut');
    expect(res.body).toHaveProperty('validUntil');
  });

  it('rejects invalid tokenIn address', async () => {
    const res = await request(app).post('/api/v1/routes/quote').send({ ...validQuote, tokenIn: 'SHORT' });
    expect(res.status).toBe(400);
  });

  it('rejects zero amountIn', async () => {
    const res = await request(app).post('/api/v1/routes/quote').send({ ...validQuote, amountIn: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects maxHops > 6', async () => {
    const res = await request(app).post('/api/v1/routes/quote').send({ ...validQuote, maxHops: 7 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/routes/stats', () => {
  it('returns route statistics', async () => {
    const res = await request(app).get('/api/v1/routes/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalQuotes');
    expect(res.body).toHaveProperty('executedQuotes');
    expect(res.body).toHaveProperty('totalVolumeIn');
  });
});

describe('GET /api/v1/vault', () => {
  it('returns vault stats', async () => {
    const res = await request(app).get('/api/v1/vault');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalAssets');
    expect(res.body).toHaveProperty('sharePrice');
  });
});

describe('GET /api/v1/vault/share-price', () => {
  it('returns current share price', async () => {
    const res = await request(app).get('/api/v1/vault/share-price');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sharePrice');
    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.sharePrice).toBe('number');
  });
});

describe('POST /api/v1/vault/deposit — validation', () => {
  it('rejects invalid depositor address', async () => {
    const res = await request(app)
      .post('/api/v1/vault/deposit')
      .send({ depositor: 'SHORT', amount: 1000 });
    expect(res.status).toBe(400);
  });

  it('rejects zero amount', async () => {
    const res = await request(app)
      .post('/api/v1/vault/deposit')
      .send({ depositor: 'G'.repeat(56), amount: 0 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/pools', () => {
  it('returns pool list', async () => {
    const res = await request(app).get('/api/v1/pools');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/v1/pools/register — validation', () => {
  it('rejects invalid pool address', async () => {
    const res = await request(app)
      .post('/api/v1/pools/register')
      .send({ tokenA: 'G'.repeat(56), tokenB: 'G'.repeat(56), poolAddress: 'SHORT' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/oracle', () => {
  it('returns latest prices', async () => {
    const res = await request(app).get('/api/v1/oracle');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/v1/vault/preview-deposit', () => {
  it('returns shares for given asset amount', async () => {
    const res = await request(app).get('/api/v1/vault/preview-deposit?assets=1000');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('assets');
    expect(res.body).toHaveProperty('shares');
    expect(res.body.assets).toBe(1000);
  });
});

describe('GET /api/v1/vault/preview-redeem', () => {
  it('returns assets for given share amount', async () => {
    const res = await request(app).get('/api/v1/vault/preview-redeem?shares=1000');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('shares');
    expect(res.body).toHaveProperty('assets');
    expect(res.body.shares).toBe(1000);
  });
});

describe('POST /api/v1/vault/redeem — validation (SEP-56)', () => {
  it('rejects invalid depositor address', async () => {
    const res = await request(app).post('/api/v1/vault/redeem')
      .send({ depositor: 'SHORT', shares: 1000 });
    expect(res.status).toBe(400);
  });

  it('rejects zero shares', async () => {
    const res = await request(app).post('/api/v1/vault/redeem')
      .send({ depositor: 'G'.repeat(56), shares: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/vault/harvest', () => {
  it('rejects zero gross yield', async () => {
    const res = await request(app).post('/api/v1/vault/harvest')
      .send({ grossYield: 0 });
    expect(res.status).toBe(400);
  });

  it('accepts positive yield amount', async () => {
    const res = await request(app).post('/api/v1/vault/harvest')
      .send({ grossYield: 500 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('yieldAmount');
  });
});
