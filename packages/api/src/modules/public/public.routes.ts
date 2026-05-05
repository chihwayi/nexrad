import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAny, requireScope } from '../auth/auth.middleware.js'
import { listTokens, generateTokens } from '../tokens/token.service.js'
import { getGlobalStats, getLiveSessions } from '../stats/stats.service.js'
import { listBranches } from '../branches/branch.service.js'

const GeneratePublicTokenSchema = z.object({
  planId: z.union([z.number(), z.string()]),
  count: z.union([z.number(), z.string()]).default(1),
  prefix: z.string().max(10).optional(),
})

export async function publicApiRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticateAny)

  app.get('/v1/tokens', { preHandler: requireScope('tokens:read') }, async (req) => {
    const q = req.query as Record<string, string>
    return listTokens({
      orgId: req.user!.orgId!,
      status: (q.status as 'used' | 'unused' | 'all') || 'all',
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Math.min(Number(q.pageSize), 100) : 20,
    })
  })

  app.post('/v1/tokens', { preHandler: requireScope('tokens:write') }, async (req, reply) => {
    const { planId, count, prefix } = GeneratePublicTokenSchema.parse(req.body)
    const result = await generateTokens({
      orgId: req.user!.orgId!,
      planId: Number(planId),
      count: Math.min(Number(count), 100),
      prefix,
      createdBy: 0,
    })
    return reply.status(201).send(result)
  })

  app.get('/v1/stats', { preHandler: requireScope('sessions:read') }, async (req) => {
    return getGlobalStats(req.user!.orgId!)
  })

  app.get('/v1/sessions', { preHandler: requireScope('sessions:read') }, async (req) => {
    return getLiveSessions(req.user!.orgId!)
  })

  app.get('/v1/branches', { preHandler: requireScope('branches:read') }, async (req) => {
    return listBranches(req.user!.orgId!)
  })
}
