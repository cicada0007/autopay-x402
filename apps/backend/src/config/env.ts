import path from 'path';

import dotenv from 'dotenv';
import { z } from 'zod';

const rootEnvPath = path.resolve(process.cwd(), '..', '..', '..', 'config', 'env.local');
dotenv.config({ path: rootEnvPath, override: false });
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  PHANTOM_WALLET_PUBLIC_KEY: z.string().default('AutoPayDevnetWallet'),
  PHANTOM_SESSION_PRIVATE_KEY: z.string().min(1).optional(),
  PHANTOM_SESSION_EXPIRY_SECONDS: z.coerce.number().default(3600),
  BALANCE_THRESHOLD: z.coerce.number().default(0.05),
  SESSION_MAX_SIGNATURES: z.coerce.number().default(3),
  SESSION_REFRESH_GRACE_SECONDS: z.coerce.number().default(300),
  PAYMENT_RECIPIENT_PUBLIC_KEY: z.string().default('FacilitatorRecipientDevnetKey'),
  COINBASE_FACILITATOR_API_KEY: z.string().default('devnet-facilitator'),
  COINBASE_FACILITATOR_SECRET: z.string().min(1).optional(),
  COINBASE_FACILITATOR_BASE_URL: z.string().url().default('https://api.sandbox.coinbase.com/x402'),
  AUDIT_LOG_PATH: z.string().default(path.resolve(process.cwd(), '../../logs/transaction-audit.json')),
  DATABASE_URL: z
    .string()
    .default(
      `file:${path.relative(process.cwd(), path.resolve(process.cwd(), 'prisma/dev.db'))}`,
    ),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export const env: AppEnv = EnvSchema.parse(process.env);

