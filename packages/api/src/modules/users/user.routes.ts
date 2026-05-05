import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { listUsers, getUser, createUser, updateUser, deleteUser } from './user.service.js'

const UserRoleEnum = z.enum(['superadmin', 'orgadmin', 'branchmanager', 'operator', 'readonly'])

const CreateUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: UserRoleEnum,
  branchIp: z.string().ip().optional(),
})

const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  role: UserRoleEnum.optional(),
  branchIp: z.string().ip().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/users', { preHandler: requireRole('orgadmin') }, async (req) => {
    return listUsers(req.user!.orgId!)
  })

  app.get<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const user = await getUser(req.user!.orgId!, Number(req.params.id))
      if (!user) return reply.status(404).send({ error: 'User not found' })
      return user
    }
  )

  app.post('/users', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const body = CreateUserSchema.parse(req.body)
    const user = await createUser({ ...body, orgId: req.user!.orgId! })
    return reply.status(201).send(user)
  })

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const updates = UpdateUserSchema.parse(req.body)
      const user = await updateUser(req.user!.orgId!, Number(req.params.id), updates)
      if (!user) return reply.status(404).send({ error: 'User not found' })
      return user
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      // Prevent self-deletion
      if (Number(req.params.id) === req.user!.sub) {
        return reply.status(400).send({ error: 'Cannot delete your own account' })
      }
      await deleteUser(req.user!.orgId!, Number(req.params.id))
      return reply.status(204).send()
    }
  )
}
