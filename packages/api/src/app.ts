import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { authRoutes } from './routes/auth.js'
import { organizationRoutes } from './routes/organizations.js'

export async function buildApp() {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: true,
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

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  }))

  return app
}
