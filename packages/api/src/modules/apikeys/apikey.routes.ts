import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { generateApiKey, listApiKeys, revokeApiKey } from './apikey.service.js'

const AVAILABLE_SCOPES = [
  'tokens:read',
  'tokens:write',
  'branches:read',
  'sessions:read',
  'reports:read',
  'users:read',
  '*',
] as const

const CreateKeySchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.enum(AVAILABLE_SCOPES)).min(1),
  expiresAt: z.string().datetime().optional(),
})

export async function apikeyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook('onRequest', requireRole('superadmin', 'orgadmin'))

  app.get('/api-keys', async (req, reply) => {
    const orgId = req.user!.orgId ?? (req.user!.role === 'superadmin' ? 1 : null)
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })
    return listApiKeys(orgId)
  })

  app.post('/api-keys', async (req, reply) => {
    const orgId = req.user!.orgId ?? (req.user!.role === 'superadmin' ? 1 : null)
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })
    const body = CreateKeySchema.parse(req.body)
    const { apiKey, rawKey } = await generateApiKey({
      ...body,
      orgId,
      createdBy: req.user!.sub,
    })
    return reply.status(201).send({ ...apiKey, rawKey })
  })

  app.delete<{ Params: { id: string } }>('/api-keys/:id', async (req, reply) => {
    const orgId = req.user!.orgId ?? (req.user!.role === 'superadmin' ? 1 : null)
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })
    await revokeApiKey(orgId, Number(req.params.id))
    return reply.status(204).send()
  })
}
