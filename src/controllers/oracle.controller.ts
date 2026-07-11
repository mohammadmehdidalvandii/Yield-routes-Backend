import { Request, Response } from 'express';

import { StellarService } from '../services/stellar.service';
import { logger } from '../logger';

import { prisma } from '../prisma';
const stellar = new StellarService();

export const listLatestPrices = async (_req: Request, res: Response) => {
  try {
    const latest = await prisma.priceSnapshot.findMany({
      distinct: ['baseToken', 'quoteToken'],
      orderBy: { recordedAt: 'desc' },
    });
    res.json(latest);
  } catch { res.status(500).json({ error: 'List failed' }); }
};

export const getPrice = async (req: Request, res: Response) => {
  try {
    const { baseToken, quoteToken } = req.params;
    const snap = await prisma.priceSnapshot.findFirst({
      where: { baseToken, quoteToken },
      orderBy: { recordedAt: 'desc' },
    });
    if (!snap) return res.status(404).json({ error: 'No price data' });
    res.json(snap);
  } catch { res.status(500).json({ error: 'Fetch failed' }); }
};

export const getPriceHistory = async (req: Request, res: Response) => {
  try {
    const { baseToken, quoteToken } = req.params;
    const hours = Math.min(72, parseInt(req.query.hours as string ?? '24', 10));
    const since = new Date(Date.now() - hours * 3_600_000);
    const history = await prisma.priceSnapshot.findMany({
      where: { baseToken, quoteToken, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
    res.json(history);
  } catch { res.status(500).json({ error: 'History failed' }); }
};

export const submitPrice = async (req: Request, res: Response) => {
  try {
    const { baseToken, quoteToken, price, reporter } = req.body;
    const twapPrice = await stellar.getOracleTwap(baseToken, quoteToken);
    const snap = await prisma.priceSnapshot.create({
      data: { baseToken, quoteToken, price, twapPrice, reporter },
    });
    logger.debug('Price submitted', { baseToken: baseToken.slice(0,8), price });
    res.status(201).json(snap);
  } catch (err: any) {
    res.status(500).json({ error: 'Submit failed', detail: err.message });
  }
};
