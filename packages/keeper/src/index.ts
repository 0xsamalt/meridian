import 'dotenv/config'
import { env } from './config.js'
import pino from 'pino'
import cron from 'node-cron'
import express from 'express'
import { readChainState } from './chain/vault.js'
import { runCycle, makeInitialCycleState } from './cycle.js'
import type { CycleState } from './cycle.js'

const log = pino({
  transport: { target: 'pino-pretty', options: { colorize: true } },
})

let cycleState: CycleState = makeInitialCycleState()
let lastCycleAt: Date | null = null

async function tick() {
  log.info('--- keeper cycle start ---')
  const { result, state } = await runCycle(cycleState, log)
  cycleState = state
  lastCycleAt = new Date()
  log.info({ result }, '--- keeper cycle end ---')
}

// Express
const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    lastCycle: lastCycleAt?.toISOString() ?? null,
    nextCycle:
      lastCycleAt !== null
        ? new Date(lastCycleAt.getTime() + env.REBALANCE_INTERVAL_SECONDS * 1000).toISOString()
        : 'pending first cycle',
  })
})

app.post('/trigger', (req, res) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${env.ADMIN_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  log.info('manual trigger received')
  tick()
    .then(() => res.json({ ok: true, lastCycle: lastCycleAt?.toISOString() }))
    .catch((err: unknown) => {
      log.error({ err }, 'manual trigger failed')
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    })
})

// Cron
const intervalMinutes = Math.max(1, Math.floor(env.REBALANCE_INTERVAL_SECONDS / 60))
cron.schedule(`*/${intervalMinutes} * * * *`, () => {
  tick().catch((err: unknown) => log.error({ err }, 'scheduled tick failed'))
})

const PORT = process.env['PORT'] ?? 3001
app.listen(PORT, () => {
  log.info({ port: PORT }, 'Meridian keeper started')
  log.info(
    {
      vault: env.VAULT_ADDRESS,
      registry: env.REGISTRY_ADDRESS,
      intervalMinutes,
    },
    'config',
  )

  readChainState()
    .then((state) => {
      log.info(
        {
          totalAssets: state.totalAssets.toString(),
          strategies: state.strategies.map((s) => ({
            key: s.key,
            balance: s.balanceMeth.toString(),
            apyBps: Number(s.apyBps),
          })),
        },
        'startup chain state',
      )
    })
    .catch((err: unknown) => log.warn({ err }, 'could not read chain state on startup'))
})
