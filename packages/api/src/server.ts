import { buildApp } from './app.js'
import { connectRedis } from './db/redis.js'
import { redis } from './db/redis.js'
import { pool } from './db/mysql.js'
import { config } from './config.js'
import { initSocket } from './ws/socket.js'
import { startStatsJob } from './jobs/stats.job.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance | null = null

async function start() {
  try {
    // Test DB connection
    await pool.query('SELECT 1')
    console.info('MySQL connected')

    await connectRedis()

    app = await buildApp()
    await app.ready()

    // Create raw HTTP server so socket.io can attach
    initSocket(app.server)
    await startStatsJob()

    app.server.listen(config.port, config.host, () => {
      console.info(`API listening on http://${config.host}:${config.port}`)
    })
  } catch (err) {
    console.error('Fatal startup error:', err)
    process.exit(1)
  }
}

start()

async function shutdown(signal: string) {
  console.info(`${signal} received — shutting down gracefully`)
  try {
    await app?.close()
    await pool.end()
    await redis.quit()
    console.info('Shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
