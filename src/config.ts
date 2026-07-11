import dotenv from 'dotenv';
dotenv.config();

// ─── Stellar network presets ─────────────────────────────────────────────────
export type StellarNetwork = 'testnet' | 'mainnet';

const NETWORK_PRESETS: Record<StellarNetwork, { rpcUrl: string; passphrase: string }> = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://mainnet.stellar.validationcloud.io/v1/YOUR_KEY',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

// Resolve network — STELLAR_NETWORK wins; explicit RPC/passphrase overrides take effect after
const rawNetwork = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
const STELLAR_NETWORK: StellarNetwork = rawNetwork === 'mainnet' ? 'mainnet' : 'testnet';
const preset = NETWORK_PRESETS[STELLAR_NETWORK];

export const config = {
  PORT: parseInt(process.env.PORT ?? '3004', 10),
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  // Network — set STELLAR_NETWORK=mainnet to switch everything at once.
  // Individual overrides (STELLAR_RPC_URL / STELLAR_NETWORK_PASSPHRASE) still
  // take precedence so custom RPC providers work on both networks.
  STELLAR_NETWORK,
  STELLAR_RPC_URL:
    process.env.STELLAR_RPC_URL ?? preset.rpcUrl,
  STELLAR_NETWORK_PASSPHRASE:
    process.env.STELLAR_NETWORK_PASSPHRASE ?? preset.passphrase,

  // Contract IDs — must be set for the chosen network
  ROUTE_AGGREGATOR_ID: process.env.ROUTE_AGGREGATOR_ID ?? '',
  YIELD_VAULT_ID: process.env.YIELD_VAULT_ID ?? '',
  FEE_DISTRIBUTOR_ID: process.env.FEE_DISTRIBUTOR_ID ?? '',
  PRICE_ORACLE_ID: process.env.PRICE_ORACLE_ID ?? '',
  VAULT_UNDERLYING_ASSET: process.env.VAULT_UNDERLYING_ASSET ?? '',

  INDEXER_STARTING_LEDGER: parseInt(process.env.INDEXER_STARTING_LEDGER ?? '0', 10),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  HARVEST_CRON: process.env.HARVEST_CRON ?? '0 */6 * * *',
  PRICE_UPDATE_CRON: process.env.PRICE_UPDATE_CRON ?? '*/5 * * * *',
} as const;
