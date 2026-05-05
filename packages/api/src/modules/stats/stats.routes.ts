import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/auth.js'
import { getGlobalStats, getBranchStats, getLiveSessions } from './stats.service.js'

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/stats/global', async (req) => {
    const user = req.user
    const stats = await getGlobalStats(Number(user.orgId))
    return stats
  })

  app.get('/stats/branches', async (req) => {
    const user = req.user
    const stats = await getBranchStats(Number(user.orgId))
    return stats
  })

  app.get('/stats/sessions/live', async (req) => {
    const user = req.user
    const sessions = await getLiveSessions(Number(user.orgId))
    return sessions
  })
}
