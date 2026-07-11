import { Request, Response } from 'express';

import { logger } from '../logger';

import { prisma } from '../prisma';

export const listPools = async (_req: Request, res: Response) => {
  try {
    const pools = await prisma.registeredPool.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
    res.json(pools);
  } catch { res.status(500).json({ error: 'List failed' }); }
};

export const getPool = async (req: Request, res: Response) => {
  try {
    const { tokenA, tokenB } = req.params;
    const pool = await prisma.registeredPool.findFirst({
      where: { OR: [{ tokenA, tokenB }, { tokenA: tokenB, tokenB: tokenA }], active: true },
    });
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    res.json(pool);
  } catch { res.status(500).json({ error: 'Fetch failed' }); }
};

export const registerPool = async (req: Request, res: Response) => {
  try {
    const { tokenA, tokenB, poolAddress } = req.body;
    const pool = await prisma.registeredPool.upsert({
      where: { tokenA_tokenB: { tokenA, tokenB } },
      create: { tokenA, tokenB, poolAddress, active: true },
      update: { poolAddress, active: true },
    });
    logger.info('Pool registered', { tokenA: tokenA.slice(0,8), tokenB: tokenB.slice(0,8), poolAddress: poolAddress.slice(0,8) });
    res.status(201).json(pool);
  } catch (err: any) {
    res.status(500).json({ error: 'Register failed', detail: err.message });
  }
};

export const deregisterPool = async (req: Request, res: Response) => {
  try {
    const pool = await prisma.registeredPool.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json(pool);
  } catch { res.status(500).json({ error: 'Deregister failed' }); }
};
