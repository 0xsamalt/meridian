import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv({ path: '../../.env' })

const hexKey64 = z
  .string()
  .transform((v) => (v.startsWith('0x') ? v : `0x${v}`))
  .pipe(z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 32-byte hex private key'))

const envSchema = z.object({
  MANTLE_SEPOLIA_RPC: z.string().url(),
  KEEPER_PRIVATE_KEY: hexKey64,

  VAULT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  CMETH_STRATEGY: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  AAVE_STRATEGY: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  USDY_STRATEGY: z.string().regex(/^0x[0-9a-fA-F]{40}$/),

  NANSEN_API_KEY: z.string().min(1),
  ELFA_API_KEY: z.string().min(1),

  PINATA_JWT: z.string().min(1),
  ADMIN_SECRET: z.string().min(1),

  REBALANCE_INTERVAL_SECONDS: z
    .string()
    .optional()
    .transform((v) => Number(v ?? '3600')),
  MIN_REBALANCE_DELTA_BPS: z
    .string()
    .optional()
    .transform((v) => Number(v ?? '300')),
  COOLDOWN_SECONDS: z
    .string()
    .optional()
    .transform((v) => Number(v ?? '3600')),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Keeper config invalid:\n${missing}`)
  }
  return result.data
}

export const env = parseEnv()

export type Env = typeof env
