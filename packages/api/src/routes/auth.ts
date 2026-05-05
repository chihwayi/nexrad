import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authService } from '../services/auth.service.js'
import { authenticate } from '../middleware/auth.js'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const body = loginSchema.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })
      try {
        const result = await authService.login(body.data.username, body.data.password)
        return reply.send({ success: true, data: result, ...result })
      } catch (err: unknown) {
        return reply.code(401).send({ success: false, error: (err as Error).message })
      }
    }
  )

  app.post('/auth/refresh', async (req, reply) => {
    const body = refreshSchema.safeParse(req.body)
    if (!body.success)
      return reply.code(400).send({ success: false, error: 'refreshToken required' })
    try {
      const result = await authService.refresh(body.data.refreshToken)
      return reply.send({ success: true, data: result, ...result })
    } catch (err: unknown) {
      return reply.code(401).send({ success: false, error: (err as Error).message })
    }
  })

  app.post('/auth/logout', { preHandler: [authenticate] }, async (req, reply) => {
    const body = refreshSchema.partial().parse(req.body)
    if (body.refreshToken) await authService.logout(body.refreshToken)
    return reply.send({ success: true })
  })

  app.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: req.user })
  })
}
