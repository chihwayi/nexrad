import type { FastifyInstance } from 'fastify'
import type { ResultSetHeader } from 'mysql2'
import { z } from 'zod'
import { requireRole } from '../middleware/auth.js'
import { query, queryOne } from '../db/mysql.js'
import bcrypt from 'bcryptjs'

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  commissionRate: z.number().min(0).max(1).default(0.1),
  adminUsername: z.string().min(3),
  adminPassword: z.string().min(8),
  adminEmail: z.string().email().optional(),
})

export async function organizationRoutes(app: FastifyInstance) {
  // List all orgs — superadmin only
  app.get(
    '/organizations',
    {
      preHandler: [requireRole('superadmin')],
    },
    async (_req, reply) => {
      const orgs = await query(`
      SELECT o.*, COUNT(DISTINCT u.id) as user_count, COUNT(DISTINCT b.id) as branch_count
      FROM nx_organizations o
      LEFT JOIN nx_users u ON u.org_id = o.id
      LEFT JOIN nx_branches b ON b.org_id = o.id
      GROUP BY o.id ORDER BY o.name
    `)
      return reply.send({ success: true, data: orgs })
    }
  )

  // Create org — superadmin only
  app.post(
    '/organizations',
    {
      preHandler: [requireRole('superadmin')],
    },
    async (req, reply) => {
      const body = createOrgSchema.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
      const { name, slug, commissionRate, adminUsername, adminPassword, adminEmail } = body.data

      const exists = await queryOne('SELECT id FROM nx_organizations WHERE slug = ?', [slug])
      if (exists) return reply.code(409).send({ success: false, error: 'Slug already taken' })

      const [orgResult] = await query<ResultSetHeader>(
        'INSERT INTO nx_organizations (name, slug, commission_rate) VALUES (?,?,?)',
        [name, slug, commissionRate]
      )
      const orgId = orgResult.insertId
      const hash = await bcrypt.hash(adminPassword, 12)

      await query(
        `INSERT INTO nx_users (org_id, username, email, password, role)
       VALUES (?,?,?,?,'orgadmin')`,
        [orgId, adminUsername, adminEmail ?? null, hash]
      )

      return reply.code(201).send({ success: true, data: { orgId, slug } })
    }
  )

  // Get own org — orgadmin+
  app.get(
    '/organizations/me',
    {
      preHandler: [requireRole('orgadmin', 'branchmanager', 'operator', 'readonly')],
    },
    async (req, reply) => {
      const org = await queryOne('SELECT * FROM nx_organizations WHERE id = ?', [req.user.orgId])
      return reply.send({ success: true, data: org })
    }
  )
}
