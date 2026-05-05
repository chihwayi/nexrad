import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { getAuditLog } from './audit.service.js'

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/audit', { preHandler: requireRole('orgadmin') }, async (req) => {
    const q = req.query as Record<string, string>
    return getAuditLog(req.user!.orgId!, {
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
      action: q.action,
      userId: q.userId ? Number(q.userId) : undefined,
      resource: q.resource,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    })
  })
}
