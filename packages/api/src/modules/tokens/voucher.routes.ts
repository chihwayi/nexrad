import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { listTokens } from './token.service.js'
import { generateVoucherPdf } from './voucher.service.js'
import { queryOne } from '../../db/mysql.js'

const VoucherQuerySchema = z.object({
  batchId: z.string().uuid().optional(),
  planId: z.string().optional(),
  branchId: z.string().optional(),
  status: z.enum(['used', 'unused', 'all']).default('unused'),
  showPrice: z.string().default('true'),
  limit: z.string().default('50'),
})

export async function voucherRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/vouchers/pdf', async (req, reply) => {
    const q = VoucherQuerySchema.parse(req.query)
    const user = req.user!
    const orgId = user.orgId
    if (!orgId) return reply.status(403).send({ error: 'Organization context required' })

    const { tokens } = await listTokens({
      orgId,
      batchId: q.batchId,
      planId: q.planId ? Number(q.planId) : undefined,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      status: q.status,
      pageSize: Number(q.limit),
    })

    if (!tokens.length) {
      return reply.status(400).send({ error: 'No tokens match the filter' })
    }

    const org = await queryOne<{ name: string; voucher_footer: string | null; currency: string }>(
      'SELECT name, voucher_footer, currency FROM nx_organizations WHERE id = ?',
      [orgId]
    )

    const pdf = await generateVoucherPdf({
      tokens,
      orgName: org?.name ?? 'NexRAD',
      orgFooter: org?.voucher_footer ?? undefined,
      showPrice: q.showPrice === 'true',
      currency: org?.currency ?? 'USD',
    })

    return reply
      .status(200)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="vouchers.pdf"`)
      .send(Buffer.from(pdf))
  })
}
