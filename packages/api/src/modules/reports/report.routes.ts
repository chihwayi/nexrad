import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { generateFinancialReport, getSessionAnalytics } from './report.service.js'
import { generateReportPdf } from './report.pdf.js'
import { generateReportCsv } from './report.csv.js'

const ReportQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().optional(),
  planId: z.string().optional(),
  format: z.enum(['json', 'pdf', 'csv']).default('json'),
})

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook(
    'onRequest',
    requireRole('readonly', 'operator', 'branchmanager', 'orgadmin', 'superadmin') as any
  )

  app.get('/reports/financial', async (req, reply) => {
    const q = ReportQuerySchema.parse(req.query)
    const report = await generateFinancialReport({
      orgId: req.user!.orgId!,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      planId: q.planId ? Number(q.planId) : undefined,
    })

    if (q.format === 'pdf') {
      const pdf = await generateReportPdf(report)
      return reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="financial-report-${q.dateFrom}-${q.dateTo}.pdf"`
        )
        .send(Buffer.from(pdf))
    }

    if (q.format === 'csv') {
      const csv = generateReportCsv(report)
      return reply
        .header('Content-Type', 'text/csv')
        .header(
          'Content-Disposition',
          `attachment; filename="financial-report-${q.dateFrom}-${q.dateTo}.csv"`
        )
        .send(csv)
    }

    return report
  })

  app.get('/reports/sessions', async (req) => {
    const q = req.query as { dateFrom: string; dateTo: string }
    return getSessionAnalytics(req.user!.orgId!, q.dateFrom, q.dateTo)
  })
}
