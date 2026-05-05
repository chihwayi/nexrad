import { createClient, type RedisClientType } from 'redis'
import { config } from '../config.js'

export const redis: RedisClientType = createClient({ url: config.redis.url })

redis.on('error', (err) => console.error('Redis error:', err))

export async function connectRedis() {
  await redis.connect()
  console.info('Redis connected')
}
