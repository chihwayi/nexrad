import { redis } from '../db/redis.js'
import { getGlobalStats, getBranchStats } from '../modules/stats/stats.service.js'
import { query } from '../db/mysql.js'

/**
 * Every 10 seconds: fetch global stats per org and publish to Redis.
 * Socket.io subscribers will forward to connected clients.
 */
export async function startStatsJob() {
  const broadcastStats = async () => {
    try {
      const orgs = await query<{ id: number }>(
        'SELECT id FROM nx_organizations WHERE is_active = 1'
      )

      for (const org of orgs) {
        const [global, branches] = await Promise.all([
          getGlobalStats(org.id),
          getBranchStats(org.id),
        ])

        await redis.publish(
          'stats:update',
          JSON.stringify({ orgId: org.id, global, branches, timestamp: new Date().toISOString() })
        )
      }
    } catch (err) {
      console.error('Stats job error:', err)
    }
  }

  // Initial broadcast
  await broadcastStats()

  // Every 10 seconds
  setInterval(broadcastStats, 10_000)
  console.info('Stats broadcast job started (10s interval)')
}
