import { Request, Response } from 'express';

import { StellarService } from '../services/stellar.service';
import { logger } from '../logger';

import { prisma } from '../prisma';
const stellar = new StellarService();

export const getQuote = async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amountIn, maxHops } = req.body;
    const quote = await stellar.getRouteQuote(tokenIn, tokenOut, amountIn, maxHops);
    const saved = await prisma.routeQuote.create({
      data: {
        tokenIn, tokenOut, amountIn,
        expectedOut: quote.expectedOut,
        priceImpactBps: quote.priceImpactBps,
        protocolFee: quote.protocolFee,
        validUntil: new Date(Date.now() + 60_000), // 60s
      },
    });
    res.json({ ...saved, legs: quote.legs });
  } catch (err: any) {
    logger.error('getQuote error', { err: err.message });
    res.status(500).json({ error: 'Quote failed', detail: err.message });
  }
};

export const executeRoute = async (req: Request, res: Response) => {
  try {
    const { quoteId, sender, minOut } = req.body;
    const quote = await prisma.routeQuote.findUnique({ where: { id: quoteId } });
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (quote.executed) return res.status(409).json({ error: 'Quote already executed' });
    if (new Date() > quote.validUntil) return res.status(410).json({ error: 'Quote expired' });

    const result = await stellar.executeRoute(quote.onChainId, sender, minOut);
    const updated = await prisma.routeQuote.update({
      where: { id: quoteId },
      data: { executed: true, executedOut: result.actualOut },
    });
    res.json({ ...updated, txResult: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Execution failed', detail: err.message });
  }
};

export const listRouteQuotes = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string ?? '1',  10));
    const limit = Math.min(100, parseInt(req.query.limit as string ?? '20', 10));
    const [data, total] = await Promise.all([
      prisma.routeQuote.findMany({ skip: (page-1)*limit, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.routeQuote.count(),
    ]);
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
  } catch { res.status(500).json({ error: 'List failed' }); }
};

export const getRouteQuote = async (req: Request, res: Response) => {
  try {
    const q = await prisma.routeQuote.findUnique({ where: { id: req.params.id } });
    if (!q) return res.status(404).json({ error: 'Not found' });
    res.json(q);
  } catch { res.status(500).json({ error: 'Fetch failed' }); }
};

export const getRouteStats = async (_req: Request, res: Response) => {
  try {
    const [total, executed, volumeAgg] = await Promise.all([
      prisma.routeQuote.count(),
      prisma.routeQuote.count({ where: { executed: true } }),
      prisma.routeQuote.aggregate({ where: { executed: true }, _sum: { amountIn: true, executedOut: true } }),
    ]);
    res.json({
      totalQuotes: total,
      executedQuotes: executed,
      totalVolumeIn:  volumeAgg._sum.amountIn  ?? 0,
      totalVolumeOut: volumeAgg._sum.executedOut ?? 0,
    });
  } catch { res.status(500).json({ error: 'Stats failed' }); }
};
