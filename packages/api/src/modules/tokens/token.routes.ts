import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { generateTokens, listTokens, deleteToken, getTokenBatches } from './token.service.js'

const GenerateSchema = z.object({
  planId: z.number().int().positive(),
  branchId: z.number().int().positive().optional(),
  count: z.number().int().min(1).max(500),
  prefix: z
    .string()
    .max(10)
    .regex(/^[A-Za-z0-9]*$/)
    .optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(255).optional(),
})

export async function tokenRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // List tokens (with filters)
  app.get('/tokens', async (req, reply) => {
    const q = req.query as Record<string, string>
    const orgId = req.user!.orgId ?? (req.user!.role === 'superadmin' ? 1 : null)
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })

    return listTokens({
      orgId,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      planId: q.planId ? Number(q.planId) : undefined,
      status: (q.status as any) || 'all',
      search: q.search,
      batchId: q.batchId,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
    })
  })

  // Generate tokens
  app.post('/tokens/generate', { preHandler: requireRole('operator') }, async (req, reply) => {
    const body = GenerateSchema.parse(req.body)
    const orgId = req.user!.orgId
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })

    const result = await generateTokens({
      ...body,
      orgId,
      createdBy: req.user!.sub,
    })
    return reply.status(201).send(result)
  })

  // Get batch list
  app.get('/tokens/batches', async (req, reply) => {
    const orgId = req.user!.orgId
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })
    return getTokenBatches(orgId)
  })

  // Delete single token
  app.delete<{ Params: { username: string } }>(
    '/tokens/:username',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const orgId = req.user!.orgId
      if (!orgId) return reply.status(403).send({ error: 'Organization context required' })
      await deleteToken(orgId, req.params.username)
      return reply.status(204).send()
    }
  )
}
