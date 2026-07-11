/**
 * YieldRoutes demo data seeder
 * Usage: npx ts-node src/scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USDC = 'GABC' + 'X'.repeat(52);
const XLM  = 'GDEF' + 'X'.repeat(52);
const USDT = 'GHIJ' + 'X'.repeat(52);

async function main() {
  console.log('🌱  Seeding YieldRoutes demo data...');

  // Seed registered pools
  const pools = [
    { tokenA: USDC, tokenB: XLM,  poolAddress: 'POOL'+'X'.repeat(52), active: true },
    { tokenA: USDC, tokenB: USDT, poolAddress: 'POOL'+'Y'.repeat(52), active: true },
  ];
  for (const pool of pools) {
    await prisma.registeredPool.upsert({
      where: { tokenA_tokenB: { tokenA: pool.tokenA, tokenB: pool.tokenB } },
      create: pool,
      update: {},
    });
    console.log(`  ✓ Pool: ${pool.tokenA.slice(0,8)}… / ${pool.tokenB.slice(0,8)}…`);
  }

  // Seed price snapshots
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const price = 1_050_000_000 + Math.floor(Math.random() * 10_000_000 - 5_000_000);
    await prisma.priceSnapshot.create({
      data: {
        baseToken: USDC, quoteToken: XLM,
        price, twapPrice: 1_050_000_000,
        reporter: 'system-bot',
        recordedAt: new Date(now - i * 300_000),
      },
    });
  }
  console.log('  ✓ Price snapshots: 12 samples (1h history)');

  // Seed vault deposits
  const depositors = [
    { depositor: 'GKLM'+'X'.repeat(52), amount: 10_000, sharesIssued: 10_000_000_000 },
    { depositor: 'GNOP'+'X'.repeat(52), amount: 25_000, sharesIssued: 25_000_000_000 },
    { depositor: 'GQRS'+'X'.repeat(52), amount: 5_000,  sharesIssued:  5_000_000_000 },
  ];
  for (const d of depositors) {
    await prisma.vaultDeposit.create({
      data: { ...d, tokenId: USDC },
    });
    console.log(`  ✓ Deposit: ${d.depositor.slice(0,8)}… — $${d.amount.toLocaleString()} USDC`);
  }

  // Seed harvest events
  const harvests = [
    { yieldAmount: 120, totalAssets: 40_120, sharePrice: 1_003_000_000, harvestedAt: new Date(now - 86_400_000) },
    { yieldAmount: 118, totalAssets: 40_238, sharePrice: 1_005_950_000, harvestedAt: new Date(now - 43_200_000) },
    { yieldAmount: 122, totalAssets: 40_360, sharePrice: 1_009_000_000, harvestedAt: new Date(now - 21_600_000) },
  ];
  for (const h of harvests) {
    await prisma.harvestEvent.create({ data: h });
    console.log(`  ✓ Harvest: +${h.yieldAmount} USDC at share price ${(h.sharePrice/1e9).toFixed(6)}`);
  }

  console.log('');
  console.log('✅  Seed complete! Run the frontend to see demo data.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
