import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../../middleware/auth.js'
import {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  getProvisionScript,
  activateBranch,
  registerPeer,
} from './branch.service.js'
import { getWgStatus } from '../wireguard/wg.service.js'

const CreateBranchSchema = z.object({
  name: z.string().min(2).max(100),
  shortname: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  location: z.string().max(255).optional(),
})

const UpdateBranchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  location: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
})

const ActivateSchema = z.object({
  wgPubkey: z.string().min(40).max(50),
})

const RegisterPeerSchema = z.object({
  token: z.string().length(64),
  publicKey: z.string().min(40).max(50),
})

export async function branchRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // List branches
  app.get('/branches', async (req) => {
    return listBranches(Number(req.user.orgId))
  })

  // Get single branch
  app.get<{ Params: { id: string } }>('/branches/:id', async (req, reply) => {
    const branch = await getBranch(Number(req.user.orgId), Number(req.params.id))
    if (!branch) return reply.status(404).send({ error: 'Branch not found' })
    return branch
  })

  // Create branch (orgadmin+)
  app.post('/branches', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const body = CreateBranchSchema.parse(req.body)
    const branch = await createBranch({ ...body, orgId: Number(req.user.orgId) })
    return reply.status(201).send(branch)
  })

  // Update branch (orgadmin+)
  app.patch<{ Params: { id: string } }>(
    '/branches/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const updates = UpdateBranchSchema.parse(req.body)
      const branch = await updateBranch(Number(req.user.orgId), Number(req.params.id), updates)
      if (!branch) return reply.status(404).send({ error: 'Branch not found' })
      return branch
    }
  )

  // Delete branch (orgadmin+)
  app.delete<{ Params: { id: string } }>(
    '/branches/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      await deleteBranch(Number(req.user.orgId), Number(req.params.id))
      return reply.status(204).send()
    }
  )

  // Download RouterOS provisioning script (.rsc)
  app.get<{ Params: { id: string } }>(
    '/branches/:id/provision/script',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const branch = await getBranch(Number(req.user.orgId), Number(req.params.id))
      if (!branch) return reply.status(404).send({ error: 'Branch not found' })

      let script: string
      try {
        script = await getProvisionScript(branch)
      } catch (e) {
        return reply.status(400).send({ error: e instanceof Error ? e.message : 'Failed' })
      }

      const filename = `${branch.shortname}-provision.rsc`
      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(script)
    }
  )

  // Manual activation fallback — admin pastes public key when auto-registration fails
  app.post<{ Params: { id: string } }>(
    '/branches/:id/activate',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const { wgPubkey } = ActivateSchema.parse(req.body)
      try {
        const branch = await activateBranch(Number(req.user.orgId), Number(req.params.id), wgPubkey)
        return branch
      } catch (e) {
        const err = e as Error & { statusCode?: number }
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    }
  )

  // Self-registration endpoint — called by MikroTik RouterOS script via /tool fetch.
  // No authentication required (token IS the auth — it's a 256-bit random secret).
  // Rate-limited to 10 req/min in production (add fastify-rate-limit if available).
  app.post('/branches/register-peer', { config: { skipAuth: true } }, async (req, reply) => {
    const { token, publicKey } = RegisterPeerSchema.parse(req.body)
    try {
      const branch = await registerPeer(token, publicKey)
      return reply.status(200).send({ ok: true, branchName: branch.name })
    } catch (e) {
      const err = e as Error & { statusCode?: number }
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // WireGuard live peer status (superadmin/orgadmin)
  app.get('/branches/wireguard/status', { preHandler: requireRole('orgadmin') }, async () => {
    const peers = getWgStatus()
    return { peers }
  })
}
