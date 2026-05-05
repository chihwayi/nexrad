import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { listOrgs, getOrg, createOrg, updateOrg } from './org.service.js'

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  commissionRate: z.number().min(0).max(1).default(0.1),
  currency: z.string().length(3).default('USD'),
  timezone: z.string().default('UTC'),
  adminUsername: z.string().min(3).max(50),
  adminPassword: z.string().min(8),
  adminEmail: z.string().email().optional(),
})

const UpdateOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
  voucherFooter: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
})

export async function orgRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/orgs', { preHandler: requireRole('superadmin') }, async () => {
    return listOrgs()
  })

  app.get<{ Params: { id: string } }>(
    '/orgs/:id',
    { preHandler: requireRole('superadmin') },
    async (req, reply) => {
      const org = await getOrg(Number(req.params.id))
      if (!org) return reply.status(404).send({ error: 'Organization not found' })
      return org
    }
  )

  app.post('/orgs', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const body = CreateOrgSchema.parse(req.body)
    const org = await createOrg(body)
    return reply.status(201).send(org)
  })

  app.patch<{ Params: { id: string } }>(
    '/orgs/:id',
    { preHandler: requireRole('superadmin') },
    async (req, reply) => {
      const updates = UpdateOrgSchema.parse(req.body)
      const org = await updateOrg(Number(req.params.id), updates)
      if (!org) return reply.status(404).send({ error: 'Organization not found' })
      return org
    }
  )

  app.patch('/orgs/me', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const allowed = UpdateOrgSchema.pick({
      name: true,
      timezone: true,
      currency: true,
      voucherFooter: true,
    }).parse(req.body)
    if (!req.user!.orgId) return reply.status(403).send({ error: 'Organization context required' })
    const org = await updateOrg(req.user!.orgId, allowed)
    return org
  })

  app.get('/orgs/me', async (req, reply) => {
    if (!req.user!.orgId) return reply.status(403).send({ error: 'Organization context required' })
    return getOrg(req.user!.orgId)
  })
}
