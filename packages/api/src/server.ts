import { buildApp } from './app.js'
import { connectRedis } from './db/redis.js'
import { pool } from './db/mysql.js'
import { config } from './config.js'

async function start() {
  try {
    // Test DB connection
    await pool.query('SELECT 1')
    console.info('MySQL connected')

    await connectRedis()

    const app = await buildApp()
    await app.listen({ port: config.port, host: config.host })
    console.info(`API listening on http://${config.host}:${config.port}`)
  } catch (err) {
    console.error('Fatal startup error:', err)
    process.exit(1)
  }
}

start()
