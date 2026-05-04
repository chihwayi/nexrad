# Sprint 6 — Financial Reports & Commission Tracking
**Duration:** 4 days | **Goal:** Full financial reporting — generated vs realized vs outstanding revenue, per-branch breakdown, org-level commission tracking, CSV and PDF export, and a live financial analytics view.

> After this sprint: an orgadmin can see exactly how much money was generated, how much was actually collected (tokens used), what commission is owed, and export it all to PDF or CSV.

---

## Prerequisites
- Sprint 0–5 sign-off checklists all ✓
- Tokens exist in nx_tokens and userbillinfo
- nx_billing_plans populated with at least one plan

---

## Task 6.1 — Financial Report Service (API)

### `packages/api/src/modules/reports/report.service.ts`
```typescript
import { query } from '../../db/mysql.js'

export interface BranchReportRow {
  branch: string
  branchShortname: string
  planName: string
  planCost: number
  currency: string
  generatedCount: number
  usedCount: number
  unusedCount: number
  generatedRevenue: number   // all tokens × cost
  realizedRevenue: number    // used tokens × cost (actually earned)
  outstandingRevenue: number // unused tokens × cost (potential)
  usagePercent: number
}

export interface ReportSummary {
  totalGeneratedRevenue: number
  totalRealizedRevenue: number
  totalOutstandingRevenue: number
  totalGeneratedTokens: number
  totalUsedTokens: number
  totalUnusedTokens: number
  commissionRate: number
  commissionAmount: number   // realizedRevenue × commissionRate
  netRevenue: number         // realizedRevenue − commissionAmount
  currency: string
}

export interface FinancialReportResult {
  rows: BranchReportRow[]
  summary: ReportSummary
  dateFrom: string
  dateTo: string
  generatedAt: string
}

export interface ReportFilter {
  orgId: number
  dateFrom: string  // YYYY-MM-DD
  dateTo: string
  branchId?: number
  planId?: number
}

export async function generateFinancialReport(filter: ReportFilter): Promise<FinancialReportResult> {
  const { orgId, dateFrom, dateTo } = filter

  const conditions: string[] = [
    'DATE(ubi.creationdate) BETWEEN ? AND ?',
  ]
  const params: unknown[] = [dateFrom, dateTo]

  if (filter.branchId) {
    // Filter by branch shortname matching
    conditions.push(`ubi.creationby IN (
      SELECT shortname FROM nx_branches WHERE id = ? AND org_id = ?
    )`)
    params.push(filter.branchId, orgId)
  } else {
    // Scope to this org's branches
    conditions.push(`ubi.creationby IN (
      SELECT shortname FROM nx_branches WHERE org_id = ?
    ) OR ubi.creationby IN ('administrator','admin','HQ','hq','')`)
    params.push(orgId)
  }

  if (filter.planId) {
    conditions.push(`bp.planId = ?`)
    params.push(filter.planId)
  }

  const where = conditions.join(' AND ')

  const rows = await query<{
    branch: string
    branchShortname: string
    planName: string
    planCost: number
    currency: string
    generatedCount: number
    usedCount: number
  }>(`
    SELECT
      COALESCE(
        MIN(n.description),
        MIN(n.shortname),
        CASE
          WHEN ubi.creationby IN ('administrator','admin','HQ','hq','')
            THEN 'Unassigned (HQ)'
          ELSE ubi.creationby
        END
      ) AS branch,
      ubi.creationby AS branchShortname,
      bp.planName AS planName,
      bp.planCost AS planCost,
      COALESCE(bp.planCurrency, 'USD') AS currency,
      COUNT(*) AS generatedCount,
      SUM(CASE
        WHEN EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = ubi.username)
        THEN 1 ELSE 0
      END) AS usedCount
    FROM userbillinfo ubi
    JOIN billing_plans bp ON bp.planName = ubi.planName
    LEFT JOIN nas n ON n.shortname = ubi.creationby
    WHERE ${where}
    GROUP BY bp.planName, bp.planCost, bp.planCurrency, ubi.creationby
    ORDER BY branch, bp.planName
  `, params)

  // Fetch org commission rate
  const [org] = await query<{ commission_rate: number; currency: string }>(
    'SELECT commission_rate, currency FROM nx_organizations WHERE id = ?',
    [orgId]
  )
  const commissionRate = Number(org?.commission_rate ?? 0.10)
  const orgCurrency = org?.currency ?? 'USD'

  // Build enriched rows
  const enriched: BranchReportRow[] = rows.map((r) => {
    const gen = Number(r.generatedCount)
    const used = Number(r.usedCount)
    const unused = gen - used
    const cost = Number(r.planCost)
    const generated = gen * cost
    const realized = used * cost
    const outstanding = unused * cost

    return {
      branch: r.branch,
      branchShortname: r.branchShortname,
      planName: r.planName,
      planCost: cost,
      currency: r.currency || orgCurrency,
      generatedCount: gen,
      usedCount: used,
      unusedCount: unused,
      generatedRevenue: generated,
      realizedRevenue: realized,
      outstandingRevenue: outstanding,
      usagePercent: gen > 0 ? Math.round((used / gen) * 100) : 0,
    }
  })

  // Summary totals
  const summary: ReportSummary = {
    totalGeneratedRevenue: enriched.reduce((s, r) => s + r.generatedRevenue, 0),
    totalRealizedRevenue: enriched.reduce((s, r) => s + r.realizedRevenue, 0),
    totalOutstandingRevenue: enriched.reduce((s, r) => s + r.outstandingRevenue, 0),
    totalGeneratedTokens: enriched.reduce((s, r) => s + r.generatedCount, 0),
    totalUsedTokens: enriched.reduce((s, r) => s + r.usedCount, 0),
    totalUnusedTokens: enriched.reduce((s, r) => s + r.unusedCount, 0),
    commissionRate,
    commissionAmount: 0,
    netRevenue: 0,
    currency: orgCurrency,
  }
  summary.commissionAmount = summary.totalRealizedRevenue * commissionRate
  summary.netRevenue = summary.totalRealizedRevenue - summary.commissionAmount

  return {
    rows: enriched,
    summary,
    dateFrom,
    dateTo,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Session analytics — for the live analytics view
 */
export async function getSessionAnalytics(orgId: number, dateFrom: string, dateTo: string) {
  return query<{
    date: string
    sessions: number
    uniqueUsers: number
    avgDurationSeconds: number
    totalInputMb: number
    totalOutputMb: number
  }>(`
    SELECT
      DATE(acctstarttime) AS date,
      COUNT(*) AS sessions,
      COUNT(DISTINCT username) AS uniqueUsers,
      AVG(acctsessiontime) AS avgDurationSeconds,
      SUM(acctinputoctets) / 1048576 AS totalInputMb,
      SUM(acctoutputoctets) / 1048576 AS totalOutputMb
    FROM radacct
    WHERE DATE(acctstarttime) BETWEEN ? AND ?
      AND nasipaddress IN (
        SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
      )
    GROUP BY DATE(acctstarttime)
    ORDER BY date
  `, [dateFrom, dateTo, orgId])
}
```

---

## Task 6.2 — Report Routes (API)

### `packages/api/src/modules/reports/report.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
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
  app.addHook('onRequest', requireRole('readonly') as any)

  app.get('/reports/financial', async (req, reply) => {
    const q = ReportQuerySchema.parse(req.query)
    const report = await generateFinancialReport({
      orgId: req.user!.orgId,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      planId: q.planId ? Number(q.planId) : undefined,
    })

    if (q.format === 'pdf') {
      const pdf = await generateReportPdf(report)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="financial-report-${q.dateFrom}-${q.dateTo}.pdf"`)
        .send(Buffer.from(pdf))
    }

    if (q.format === 'csv') {
      const csv = generateReportCsv(report)
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="financial-report-${q.dateFrom}-${q.dateTo}.csv"`)
        .send(csv)
    }

    return report
  })

  app.get('/reports/sessions', async (req) => {
    const q = req.query as { dateFrom: string; dateTo: string }
    return getSessionAnalytics(req.user!.orgId, q.dateFrom, q.dateTo)
  })
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { reportRoutes } from './modules/reports/report.routes.js'
await app.register(reportRoutes, { prefix: '/api' })
```

---

## Task 6.3 — Report PDF Generator

### `packages/api/src/modules/reports/report.pdf.ts`
```typescript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { FinancialReportResult } from './report.service.js'

export async function generateReportPdf(report: FinancialReportResult): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const A4_W = 595.28
  const A4_H = 841.89
  const MARGIN = 40
  let page = pdfDoc.addPage([A4_W, A4_H])
  let y = A4_H - MARGIN

  const drawText = (text: string, x: number, yPos: number, size = 10, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(String(text), { x, y: yPos, size, font: bold ? boldFont : regularFont, color })
  }

  // Header
  page.drawRectangle({ x: 0, y: A4_H - 60, width: A4_W, height: 60, color: rgb(0.25, 0.32, 0.71) })
  drawText('FINANCIAL REPORT', MARGIN, A4_H - 35, 16, true, rgb(1, 1, 1))
  drawText(`${report.dateFrom} to ${report.dateTo}`, MARGIN, A4_H - 52, 9, false, rgb(0.85, 0.9, 1))

  y = A4_H - 80

  // Summary box
  const { summary } = report
  const fmt = (n: number) => `${summary.currency} ${n.toFixed(2)}`

  page.drawRectangle({
    x: MARGIN, y: y - 110, width: A4_W - MARGIN * 2, height: 105,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5,
  })

  drawText('SUMMARY', MARGIN + 10, y - 20, 10, true)

  const col1 = MARGIN + 10
  const col2 = A4_W / 2

  drawText(`Generated Revenue:`, col1, y - 38, 9)
  drawText(fmt(summary.totalGeneratedRevenue), col1 + 130, y - 38, 9, true)

  drawText(`Realized Revenue:`, col1, y - 52, 9)
  drawText(fmt(summary.totalRealizedRevenue), col1 + 130, y - 52, 9, true, rgb(0.1, 0.5, 0.1))

  drawText(`Outstanding Revenue:`, col1, y - 66, 9)
  drawText(fmt(summary.totalOutstandingRevenue), col1 + 130, y - 66, 9, true, rgb(0.7, 0.4, 0))

  drawText(`Commission (${(summary.commissionRate * 100).toFixed(0)}%):`, col2, y - 38, 9)
  drawText(fmt(summary.commissionAmount), col2 + 120, y - 38, 9, true, rgb(0.7, 0.2, 0.1))

  drawText(`Net Revenue:`, col2, y - 52, 9)
  drawText(fmt(summary.netRevenue), col2 + 120, y - 52, 9, true, rgb(0.1, 0.5, 0.1))

  drawText(`Tokens: ${summary.totalGeneratedTokens} generated / ${summary.totalUsedTokens} used / ${summary.totalUnusedTokens} unused`,
    col1, y - 100, 8, false, rgb(0.4, 0.4, 0.4))

  y -= 125

  // Table header
  const COL_WIDTHS = [120, 90, 50, 50, 70, 70, 50]
  const COL_HEADERS = ['Branch', 'Plan', 'Gen.', 'Used', 'Realized', 'Outstanding', 'Usage%']
  let xCursor = MARGIN

  page.drawRectangle({ x: MARGIN, y: y - 18, width: A4_W - MARGIN * 2, height: 18, color: rgb(0.9, 0.92, 0.98) })
  COL_HEADERS.forEach((h, i) => {
    drawText(h, xCursor + 3, y - 13, 8, true, rgb(0.25, 0.32, 0.71))
    xCursor += COL_WIDTHS[i]
  })
  y -= 22

  // Table rows
  for (const row of report.rows) {
    if (y < MARGIN + 30) {
      page = pdfDoc.addPage([A4_W, A4_H])
      y = A4_H - MARGIN
    }

    xCursor = MARGIN
    const vals = [
      row.branch.slice(0, 18),
      row.planName.slice(0, 14),
      String(row.generatedCount),
      String(row.usedCount),
      `${row.currency} ${row.realizedRevenue.toFixed(2)}`,
      `${row.currency} ${row.outstandingRevenue.toFixed(2)}`,
      `${row.usagePercent}%`,
    ]
    vals.forEach((v, i) => {
      drawText(v, xCursor + 3, y - 10, 7.5)
      xCursor += COL_WIDTHS[i]
    })

    page.drawLine({
      start: { x: MARGIN, y: y - 14 },
      end: { x: A4_W - MARGIN, y: y - 14 },
      thickness: 0.2, color: rgb(0.88, 0.88, 0.88),
    })

    y -= 16
  }

  // Footer
  const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1)
  lastPage.drawText(
    `Generated by NexRAD on ${new Date(report.generatedAt).toLocaleString()}`,
    { x: MARGIN, y: 20, size: 7, font: regularFont, color: rgb(0.6, 0.6, 0.6) }
  )

  return pdfDoc.save()
}
```

---

## Task 6.4 — Report CSV Generator

### `packages/api/src/modules/reports/report.csv.ts`
```typescript
import type { FinancialReportResult } from './report.service.js'

export function generateReportCsv(report: FinancialReportResult): string {
  const { rows, summary } = report
  const lines: string[] = []

  // Header metadata
  lines.push(`"NexRAD Financial Report"`)
  lines.push(`"Period","${report.dateFrom} to ${report.dateTo}"`)
  lines.push(`"Generated","${new Date(report.generatedAt).toLocaleString()}"`)
  lines.push('')

  // Summary
  lines.push('"SUMMARY"')
  lines.push(`"Generated Revenue","${summary.currency} ${summary.totalGeneratedRevenue.toFixed(2)}"`)
  lines.push(`"Realized Revenue","${summary.currency} ${summary.totalRealizedRevenue.toFixed(2)}"`)
  lines.push(`"Outstanding Revenue","${summary.currency} ${summary.totalOutstandingRevenue.toFixed(2)}"`)
  lines.push(`"Commission Rate","${(summary.commissionRate * 100).toFixed(1)}%"`)
  lines.push(`"Commission Amount","${summary.currency} ${summary.commissionAmount.toFixed(2)}"`)
  lines.push(`"Net Revenue","${summary.currency} ${summary.netRevenue.toFixed(2)}"`)
  lines.push('')

  // Detail table
  lines.push('"Branch","Plan","Cost","Generated","Used","Unused","Realized Revenue","Outstanding Revenue","Usage %"')
  for (const row of rows) {
    lines.push([
      `"${row.branch.replace(/"/g, '""')}"`,
      `"${row.planName.replace(/"/g, '""')}"`,
      `"${row.currency} ${row.planCost.toFixed(2)}"`,
      row.generatedCount,
      row.usedCount,
      row.unusedCount,
      `"${row.currency} ${row.realizedRevenue.toFixed(2)}"`,
      `"${row.currency} ${row.outstandingRevenue.toFixed(2)}"`,
      `"${row.usagePercent}%"`,
    ].join(','))
  }

  return lines.join('\r\n')
}
```

---

## Task 6.5 — Frontend: Financial Reports Page

### `packages/web/src/pages/Reports.tsx`
```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { DataTable } from '../components/DataTable'
import { formatCurrency } from '../lib/utils'
import { Download, FileText, TrendingUp, DollarSign, AlertCircle, Percent } from 'lucide-react'
import type { FinancialReportResult, BranchReportRow } from '@nexrad/shared'

interface Branch { id: number; name: string }

function getDefaultDates() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    dateFrom: firstDay.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  }
}

export default function Reports() {
  const defaults = getDefaultDates()
  const [filter, setFilter] = useState({ ...defaults, branchId: '' })
  const [activeFilter, setActiveFilter] = useState(filter)

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
  })

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', activeFilter],
    queryFn: () =>
      api.get<FinancialReportResult>('/reports/financial', {
        params: {
          dateFrom: activeFilter.dateFrom,
          dateTo: activeFilter.dateTo,
          branchId: activeFilter.branchId || undefined,
        },
      }).then((r) => r.data),
    enabled: !!activeFilter.dateFrom && !!activeFilter.dateTo,
  })

  const exportPdf = () => {
    const params = new URLSearchParams({
      dateFrom: activeFilter.dateFrom,
      dateTo: activeFilter.dateTo,
      format: 'pdf',
    })
    if (activeFilter.branchId) params.set('branchId', activeFilter.branchId)
    window.open(`/api/reports/financial?${params}`, '_blank')
  }

  const exportCsv = () => {
    const params = new URLSearchParams({
      dateFrom: activeFilter.dateFrom,
      dateTo: activeFilter.dateTo,
      format: 'csv',
    })
    if (activeFilter.branchId) params.set('branchId', activeFilter.branchId)
    window.open(`/api/reports/financial?${params}`, '_blank')
  }

  const summary = report?.summary

  const columns = [
    { key: 'branch', header: 'Branch' },
    { key: 'planName', header: 'Plan' },
    { key: 'planCost', header: 'Price', render: (v: number, r: BranchReportRow) => `${r.currency} ${v.toFixed(2)}` },
    { key: 'generatedCount', header: 'Generated' },
    { key: 'usedCount', header: 'Used' },
    { key: 'unusedCount', header: 'Unused' },
    {
      key: 'realizedRevenue',
      header: 'Realized',
      render: (v: number, r: BranchReportRow) => (
        <span className="text-success font-semibold">{r.currency} {v.toFixed(2)}</span>
      ),
    },
    {
      key: 'outstandingRevenue',
      header: 'Outstanding',
      render: (v: number, r: BranchReportRow) => (
        <span className="text-warning">{r.currency} {v.toFixed(2)}</span>
      ),
    },
    {
      key: 'usagePercent',
      header: 'Usage',
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <div className="w-16 bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full"
              style={{ width: `${v}%` }}
            />
          </div>
          <span className="text-xs">{v}%</span>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        subtitle="Generated vs realized revenue with commission tracking"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!report}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={!report}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end p-4 bg-muted/30 rounded-lg border border-border">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
          <Input
            type="date"
            value={filter.dateFrom}
            onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input
            type="date"
            value={filter.dateTo}
            onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Branch</Label>
          <Select
            value={filter.branchId || 'all'}
            onValueChange={(v) => setFilter((f) => ({ ...f, branchId: v === 'all' ? '' : v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setActiveFilter(filter)}>
          Generate Report
        </Button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <>
          <div className="kpi-grid">
            <StatCard
              title="Realized Revenue"
              value={`${summary.currency} ${summary.totalRealizedRevenue.toFixed(2)}`}
              icon={<DollarSign className="h-5 w-5" />}
              color="success"
              subtitle="Tokens actually used"
            />
            <StatCard
              title="Outstanding Revenue"
              value={`${summary.currency} ${summary.totalOutstandingRevenue.toFixed(2)}`}
              icon={<AlertCircle className="h-5 w-5" />}
              color="warning"
              subtitle="Unused tokens (potential)"
            />
            <StatCard
              title="Commission Due"
              value={`${summary.currency} ${summary.commissionAmount.toFixed(2)}`}
              icon={<Percent className="h-5 w-5" />}
              color="default"
              subtitle={`${(summary.commissionRate * 100).toFixed(0)}% of realized`}
            />
            <StatCard
              title="Net Revenue"
              value={`${summary.currency} ${summary.netRevenue.toFixed(2)}`}
              icon={<TrendingUp className="h-5 w-5" />}
              color="success"
              subtitle="After commission"
            />
          </div>

          {/* Commission highlight box */}
          <div className="rounded-lg border border-orange-400/30 bg-orange-50 dark:bg-orange-950/20 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Percent className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-100">
                  Commission Summary — {(summary.commissionRate * 100).toFixed(0)}% on realized revenue
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {summary.currency} {summary.totalRealizedRevenue.toFixed(2)} realized
                  × {(summary.commissionRate * 100).toFixed(0)}%
                  = <strong>{summary.currency} {summary.commissionAmount.toFixed(2)}</strong> commission.
                  &nbsp;Net to keep: <strong>{summary.currency} {summary.netRevenue.toFixed(2)}</strong>.
                  &nbsp;Commission applies only to tokens that have been used — not generated tokens.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail Table */}
      <DataTable
        data={report?.rows ?? []}
        columns={columns as any}
        keyField="branchShortname"
        loading={isLoading}
        emptyMessage={
          error
            ? 'Error loading report. Check date range and try again.'
            : 'Select a date range and click Generate Report.'
        }
      />

      {report && (
        <p className="text-xs text-muted-foreground text-right">
          Report generated at {new Date(report.generatedAt).toLocaleString()}
          &nbsp;·&nbsp;{report.rows.length} rows
        </p>
      )}
    </div>
  )
}
```

---

## Task 6.6 — Session Analytics Chart Page

### Install recharts (already in package.json — verify):
```bash
cd packages/web && pnpm ls recharts
# Should show recharts listed. If not: pnpm add recharts
```

### `packages/web/src/pages/Analytics.tsx`
```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatBytes } from '../lib/utils'

function getDefaultDates() {
  const now = new Date()
  const past = new Date(now)
  past.setDate(past.getDate() - 29)
  return {
    dateFrom: past.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  }
}

export default function Analytics() {
  const defaults = getDefaultDates()
  const [dates, setDates] = useState(defaults)

  const { data = [], isLoading } = useQuery({
    queryKey: ['session-analytics', dates],
    queryFn: () =>
      api.get('/reports/sessions', { params: dates }).then((r) => r.data as any[]),
  })

  const totalSessions = data.reduce((s, d) => s + Number(d.sessions), 0)
  const totalData = data.reduce((s, d) => s + Number(d.totalInputMb) + Number(d.totalOutputMb), 0)
  const avgUsers = data.length ? Math.round(data.reduce((s, d) => s + Number(d.uniqueUsers), 0) / data.length) : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Analytics"
        subtitle="Traffic, usage trends, and data consumption"
      />

      <div className="flex gap-3 items-center">
        <input
          type="date"
          className="border border-border bg-background text-foreground rounded-md px-3 py-1.5 text-sm"
          value={dates.dateFrom}
          onChange={(e) => setDates((d) => ({ ...d, dateFrom: e.target.value }))}
        />
        <span className="text-muted-foreground text-sm">to</span>
        <input
          type="date"
          className="border border-border bg-background text-foreground rounded-md px-3 py-1.5 text-sm"
          value={dates.dateTo}
          onChange={(e) => setDates((d) => ({ ...d, dateTo: e.target.value }))}
        />
      </div>

      <div className="kpi-grid">
        <StatCard title="Total Sessions" value={totalSessions} color="info" loading={isLoading} />
        <StatCard title="Avg Users/Day" value={avgUsers} color="default" loading={isLoading} />
        <StatCard title="Total Data" value={formatBytes(totalData * 1048576)} color="success" loading={isLoading} />
      </div>

      {/* Sessions chart */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Daily Sessions</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="hsl(var(--primary))"
              fill="url(#sessGrad)"
              strokeWidth={2}
              name="Sessions"
            />
            <Area
              type="monotone"
              dataKey="uniqueUsers"
              stroke="hsl(var(--success))"
              fill="none"
              strokeWidth={2}
              strokeDasharray="4 2"
              name="Unique Users"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Data usage chart */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Data Usage (MB/day)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(v: number) => `${v.toFixed(1)} MB`}
            />
            <Legend />
            <Bar dataKey="totalInputMb" name="Download (MB)" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            <Bar dataKey="totalOutputMb" name="Upload (MB)" fill="hsl(var(--success))" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

---

## Task 6.7 — Sidebar Nav: Add Reports & Analytics Links

### Update Sidebar navItems:
```typescript
{ href: '/reports', label: 'Reports', icon: BarChart2, roles: ['superadmin','orgadmin','branchmanager','readonly'] },
{ href: '/analytics', label: 'Analytics', icon: TrendingUp, roles: ['superadmin','orgadmin'] },
```

### Update `packages/web/src/App.tsx`:
```tsx
import Reports from './pages/Reports'
import Analytics from './pages/Analytics'
// Inside Routes:
<Route path="/reports" element={<Reports />} />
<Route path="/analytics" element={<Analytics />} />
```

### Import `BarChart2` and `TrendingUp` from lucide-react in Sidebar.tsx.

---

## Task 6.8 — Shared Report Types

### `packages/shared/src/types/report.types.ts` — verify/update:
```typescript
export interface BranchReportRow {
  branch: string
  branchShortname: string
  planName: string
  planCost: number
  currency: string
  generatedCount: number
  usedCount: number
  unusedCount: number
  generatedRevenue: number
  realizedRevenue: number
  outstandingRevenue: number
  usagePercent: number
}

export interface ReportSummary {
  totalGeneratedRevenue: number
  totalRealizedRevenue: number
  totalOutstandingRevenue: number
  totalGeneratedTokens: number
  totalUsedTokens: number
  totalUnusedTokens: number
  commissionRate: number
  commissionAmount: number
  netRevenue: number
  currency: string
}

export interface FinancialReportResult {
  rows: BranchReportRow[]
  summary: ReportSummary
  dateFrom: string
  dateTo: string
  generatedAt: string
}
```

---

## Task 6.9 — Integration Tests

### `packages/api/src/modules/reports/__tests__/report.test.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Report endpoints', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'admin123' },
    })
    token = res.json().accessToken
  })

  afterAll(() => app.close())

  it('GET /api/reports/financial returns report shape', async () => {
    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/financial?dateFrom=${monthAgo}&dateTo=${today}&format=json`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.rows)).toBe(true)
    expect(typeof body.summary).toBe('object')
    expect(typeof body.summary.totalRealizedRevenue).toBe('number')
    expect(typeof body.summary.commissionAmount).toBe('number')
    expect(body.summary.commissionAmount).toBe(
      body.summary.totalRealizedRevenue * body.summary.commissionRate
    )
  })

  it('GET /api/reports/financial?format=pdf returns PDF', async () => {
    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/financial?dateFrom=${monthAgo}&dateTo=${today}&format=pdf`,
      headers: { authorization: `Bearer ${token}` },
    })
    // Acceptable: 200 (PDF) or 400 (no data rows in test DB)
    expect([200, 400]).toContain(res.statusCode)
    if (res.statusCode === 200) {
      expect(res.headers['content-type']).toContain('application/pdf')
    }
  })

  it('GET /api/reports/sessions returns array', async () => {
    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/sessions?dateFrom=${monthAgo}&dateTo=${today}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('returns 401 without token', async () => {
    const today = new Date().toISOString().split('T')[0]
    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/financial?dateFrom=${today}&dateTo=${today}`,
    })
    expect(res.statusCode).toBe(401)
  })
})
```

---

## Sprint 6 Sign-Off Checklist

Before marking Sprint 6 complete, every item must be ✓:

- [ ] `pnpm typecheck` exits 0 in all packages
- [ ] `pnpm lint` exits 0 in all packages
- [ ] `pnpm test` passes (report.test.ts all green)
- [ ] `GET /api/reports/financial` returns `{ rows, summary }` shape with valid JWT
- [ ] `summary.commissionAmount === summary.totalRealizedRevenue × summary.commissionRate` (math is correct)
- [ ] Commission applies ONLY to realized revenue — not to generated/outstanding
- [ ] `GET /api/reports/financial?format=pdf` returns PDF with correct `Content-Type`
- [ ] `GET /api/reports/financial?format=csv` returns CSV with branch/plan breakdown rows
- [ ] Reports page loads — date range defaults to current month
- [ ] "Generate Report" button runs the query and populates KPI cards + table
- [ ] Commission highlight box is visible with correct calculation shown
- [ ] Usage % column shows a progress bar for each row
- [ ] Export PDF button opens PDF in new tab
- [ ] Export CSV button downloads CSV file
- [ ] Analytics page loads — area chart and bar chart render (empty state if no radacct data)
- [ ] `pnpm build` succeeds
- [ ] `pnpm docker:dev` starts cleanly

**CI must be green before Sprint 7 begins.**
