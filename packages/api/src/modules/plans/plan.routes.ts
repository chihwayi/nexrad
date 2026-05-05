import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { listPlans, getPlan, createPlan, updatePlan, togglePlanActive } from './plan.service.js'

const PlanSchema = z.object({
  name: z.string().min(2).max(100),
  displayName: z.string().max(100).optional(),
  timeBankHours: z.number().int().positive(),
  dataLimitMb: z.number().int().positive().optional(),
  cost: z.number().nonnegative(),
  currency: z.string().length(3),
  frGroupName: z.string().max(64).optional(),
})

export async function planRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/plans', async (req) => {
    const showAll = (req.query as any).all === 'true'
    return listPlans(req.user!.orgId!, showAll)
  })

  app.get<{ Params: { id: string } }>('/plans/:id', async (req, reply) => {
    const plan = await getPlan(req.user!.orgId!, Number(req.params.id))
    if (!plan) return reply.status(404).send({ error: 'Plan not found' })
    return plan
  })

  app.post('/plans', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const body = PlanSchema.parse(req.body)
    const plan = await createPlan({ ...body, orgId: req.user!.orgId! })
    return reply.status(201).send(plan)
  })

  app.patch<{ Params: { id: string } }>(
    '/plans/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const updates = PlanSchema.partial().parse(req.body)
      const plan = await updatePlan(req.user!.orgId!, Number(req.params.id), updates)
      if (!plan) return reply.status(404).send({ error: 'Plan not found' })
      return plan
    }
  )

  app.post<{ Params: { id: string } }>(
    '/plans/:id/toggle',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const plan = await togglePlanActive(req.user!.orgId!, Number(req.params.id))
      if (!plan) return reply.status(404).send({ error: 'Plan not found' })
      return plan
    }
  )
}
