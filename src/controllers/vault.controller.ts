import { Request, Response } from 'express';

import { StellarService } from '../services/stellar.service';
import { logger } from '../logger';

import { prisma } from '../prisma';
const stellar = new StellarService();

/**
 * Vault endpoints implement SEP-56 Tokenized Vault Standard semantics:
 *   deposit(assets, receiver) → shares
 *   redeem(shares, receiver, owner) → assets
 *   withdraw(assets, receiver, owner) → shares
 */

export const getVaultStats = async (_req: Request, res: Response) => {
  try {
    const [totalAssets, totalShares, harvestCount, isPaused, asset] = await Promise.all([
      stellar.totalAssets(),
      stellar.totalShares(),
      stellar.getHarvestCount(),
      stellar.isVaultPaused(),
      stellar.queryAsset(),
    ]);
    const [depositCount, withdrawCount, yieldSum] = await Promise.all([
      prisma.vaultDeposit.count(),
      prisma.vaultWithdrawal.count(),
      prisma.harvestEvent.aggregate({ _sum: { yieldAmount: true } }),
    ]);
    const sharePrice = totalShares > 0 ? totalAssets / totalShares : 1;
    res.json({
      asset, totalAssets, totalShares, sharePrice, harvestCount, isPaused,
      depositCount, withdrawCount,
      totalYieldHarvested: yieldSum._sum.yieldAmount ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Vault stats failed', detail: err.message });
  }
};

export const getSharePrice = async (_req: Request, res: Response) => {
  try {
    const [totalAssets, totalShares] = await Promise.all([stellar.totalAssets(), stellar.totalShares()]);
    const sharePrice = totalShares > 0 ? totalAssets / totalShares : 1;
    res.json({ sharePrice, totalAssets, totalShares, timestamp: Date.now() });
  } catch { res.status(500).json({ error: 'Share price failed' }); }
};

export const previewDeposit = async (req: Request, res: Response) => {
  try {
    const assets = Number(req.query.assets);
    const shares = await stellar.previewDeposit(assets);
    res.json({ assets, shares });
  } catch { res.status(500).json({ error: 'Preview failed' }); }
};

export const previewRedeem = async (req: Request, res: Response) => {
  try {
    const shares = Number(req.query.shares);
    const assets = await stellar.previewRedeem(shares);
    res.json({ shares, assets });
  } catch { res.status(500).json({ error: 'Preview failed' }); }
};

export const listDeposits = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit as string ?? '20', 10));
    const [data, total] = await Promise.all([
      prisma.vaultDeposit.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.vaultDeposit.count(),
    ]);
    res.json({ data, pagination: { page, limit, total } });
  } catch { res.status(500).json({ error: 'List failed' }); }
};

export const listWithdrawals = async (req: Request, res: Response) => {
  try {
    const data = await prisma.vaultWithdrawal.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(data);
  } catch { res.status(500).json({ error: 'List failed' }); }
};

export const listHarvests = async (_req: Request, res: Response) => {
  try {
    const data = await prisma.harvestEvent.findMany({ orderBy: { harvestedAt: 'desc' }, take: 50 });
    res.json(data);
  } catch { res.status(500).json({ error: 'List failed' }); }
};

export const getDepositorInfo = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const [deposits, shares, totalAssets, totalShares] = await Promise.all([
      prisma.vaultDeposit.findMany({ where: { depositor: address }, orderBy: { createdAt: 'desc' } }),
      stellar.sharesBalance(address),
      stellar.totalAssets(),
      stellar.totalShares(),
    ]);
    const estimatedValue = totalShares > 0 ? (shares * totalAssets) / totalShares : 0;
    res.json({ depositor: address, shares, estimatedValue, deposits });
  } catch { res.status(500).json({ error: 'Depositor info failed' }); }
};

/** SEP-56 deposit(assets, receiver, from) */
export const deposit = async (req: Request, res: Response) => {
  try {
    const { depositor, amount } = req.body; // amount = assets, depositor = receiver = from
    const result = await stellar.vaultDeposit(amount, depositor, depositor);
    const asset = await stellar.queryAsset();
    const record = await prisma.vaultDeposit.create({
      data: { depositor, tokenId: asset, amount, sharesIssued: result.sharesIssued, txHash: result.txHash },
    });
    logger.info('Vault deposit (SEP-56)', { depositor: depositor.slice(0, 8), amount });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: 'Deposit failed', detail: err.message });
  }
};

/** SEP-56 redeem(shares, receiver, owner, operator) */
export const redeem = async (req: Request, res: Response) => {
  try {
    const { depositor, shares } = req.body;
    const result = await stellar.vaultRedeem(shares, depositor, depositor, depositor);
    const record = await prisma.vaultWithdrawal.create({
      data: { depositor, shares, amountOut: result.assetsOut, txHash: result.txHash },
    });
    logger.info('Vault redeem (SEP-56)', { depositor: depositor.slice(0, 8), shares });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: 'Redeem failed', detail: err.message });
  }
};

/** Kept for backward compatibility — same as redeem but parameterised by assets */
export const withdraw = async (req: Request, res: Response) => {
  try {
    const { depositor, amount } = req.body;
    const result = await stellar.vaultWithdraw(amount, depositor, depositor, depositor);
    const record = await prisma.vaultWithdrawal.create({
      data: { depositor, shares: result.sharesBurned, amountOut: amount, txHash: result.txHash },
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: 'Withdraw failed', detail: err.message });
  }
};

export const triggerHarvest = async (req: Request, res: Response) => {
  try {
    const grossYield = Number(req.body.grossYield ?? 0);
    const result = await stellar.harvestVault(grossYield);
    const record = await prisma.harvestEvent.create({
      data: { yieldAmount: result.netYield, totalAssets: result.totalAssets, sharePrice: 0, txHash: result.txHash },
    });
    logger.info('Harvest triggered', { netYield: result.netYield });
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: 'Harvest failed', detail: err.message });
  }
};
