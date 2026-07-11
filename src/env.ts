import { z } from 'zod';

// Validates all required env vars at startup.
// The app exits immediately with a clear message if anything is missing
// rather than silently producing broken behaviour at runtime.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  STELLAR_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  HARVEST_CRON: z.string().default('0 */6 * * *'),
  PRICE_UPDATE_CRON: z.string().default('*/5 * * * *'),
  INDEXER_STARTING_LEDGER: z.coerce.number().int().nonnegative().default(0),
  // Contract IDs are optional — app runs in stub mode without them
  ROUTE_AGGREGATOR_ID: z.string().default(''),
  YIELD_VAULT_ID: z.string().default(''),
  FEE_DISTRIBUTOR_ID: z.string().default(''),
  PRICE_ORACLE_ID: z.string().default(''),
  VAULT_UNDERLYING_ASSET: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error('❌  Environment validation failed:\n' + issues);
    process.exit(1);
  }
  const missing = ['ROUTE_AGGREGATOR_ID', 'YIELD_VAULT_ID', 'PRICE_ORACLE_ID']
    .filter(k => !result.data[k as keyof Env]);
  if (missing.length) {
    console.warn(`⚠️   Contract IDs not set — running in stub mode: ${missing.join(', ')}`);
  }
  return result.data;
}
