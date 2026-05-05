import Fastify from 'fastify'
import crypto from 'crypto'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { pool } from './db/mysql.js'
import { redis } from './db/redis.js'
import { authRoutes } from './routes/auth.js'
import { organizationRoutes } from './routes/organizations.js'
import { statsRoutes } from './modules/stats/stats.routes.js'
import { branchRoutes } from './modules/branches/branch.routes.js'
import { tokenRoutes } from './modules/tokens/token.routes.js'
import { voucherRoutes } from './modules/tokens/voucher.routes.js'
import { planRoutes } from './modules/plans/plan.routes.js'
import { reportRoutes } from './modules/reports/report.routes.js'
import { userRoutes } from './modules/users/user.routes.js'
import { sessionRoutes } from './modules/sessions/session.routes.js'
import { auditRoutes } from './modules/audit/audit.routes.js'
import { orgRoutes } from './modules/organizations/org.routes.js'
import { apikeyRoutes } from './modules/apikeys/apikey.routes.js'
import { publicApiRoutes } from './modules/public/public.routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  })

  await app.register(helmet)
  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? process.env.APP_URL : true,
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(organizationRoutes, { prefix: '/api' })
  await app.register(statsRoutes, { prefix: '/api' })
  await app.register(branchRoutes, { prefix: '/api' })
  await app.register(tokenRoutes, { prefix: '/api' })
  await app.register(voucherRoutes, { prefix: '/api' })
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(reportRoutes, { prefix: '/api' })
  await app.register(userRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api' })
  await app.register(auditRoutes, { prefix: '/api' })
  await app.register(orgRoutes, { prefix: '/api' })
  await app.register(apikeyRoutes, { prefix: '/api' })
  await app.register(publicApiRoutes, { prefix: '/api' })

  app.get('/health', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {}

    try {
      await pool.query('SELECT 1')
      checks.mysql = 'ok'
    } catch {
      checks.mysql = 'error'
    }

    try {
      await redis.ping()
      checks.redis = 'ok'
    } catch {
      checks.redis = 'error'
    }

    const allOk = Object.values(checks).every((v) => v === 'ok')

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
      uptime: Math.round(process.uptime()),
    })
  })

  return app
}
