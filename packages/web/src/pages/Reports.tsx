import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Download,
  FileText,
  Printer,
  TrendingUp,
  DollarSign,
  AlertCircle,
  BarChart3,
} from 'lucide-react'
import type { FinancialReportResult, BranchReportRow, ReportSummary } from '@nexrad/shared'

interface Branch {
  id: number
  name: string
}

interface BranchSummary {
  branch: string
  branchShortname: string
  generatedCount: number
  usedCount: number
  unusedCount: number
  generatedRevenue: number
  realizedRevenue: number
  outstandingRevenue: number
  currency: string
}

function getDefaultDates() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    dateFrom: firstDay.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  }
}

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function openPrintReport(report: FinancialReportResult, dateFrom: string, dateTo: string) {
  const { summary, rows } = report
  const cr = summary.commissionRate
  const crPct = (cr * 100).toFixed(0)
  const fmt = (n: number) => n.toFixed(2)
  const money = (n: number) => `${summary.currency} ${fmt(n)}`

  // Aggregate branch summary
  const branchMap = new Map<string, BranchSummary>()
  for (const r of rows) {
    const key = r.branchShortname || r.branch
    const b = branchMap.get(key) ?? {
      branch: r.branch,
      branchShortname: r.branchShortname,
      generatedCount: 0,
      usedCount: 0,
      unusedCount: 0,
      generatedRevenue: 0,
      realizedRevenue: 0,
      outstandingRevenue: 0,
      currency: r.currency,
    }
    b.generatedCount += r.generatedCount
    b.usedCount += r.usedCount
    b.unusedCount += r.unusedCount
    b.generatedRevenue += r.generatedRevenue
    b.realizedRevenue += r.realizedRevenue
    b.outstandingRevenue += r.outstandingRevenue
    branchMap.set(key, b)
  }
  const branchRows = [...branchMap.values()].sort((a, b) => b.realizedRevenue - a.realizedRevenue)

  const usagePct =
    summary.totalGeneratedTokens > 0
      ? Math.round((summary.totalUsedTokens / summary.totalGeneratedTokens) * 100)
      : 0

  const pctBar = (pct: number) =>
    `<div style="height:5px;border-radius:3px;background:#e5e7eb;margin-top:3px;min-width:50px"><div style="height:5px;border-radius:3px;background:#22c55e;width:${pct}%"></div></div>`

  const badge = (val: number, color: string) =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.75rem;font-weight:700;background:${color === 'green' ? '#dcfce7' : '#ffedd5'};color:${color === 'green' ? '#166534' : '#9a3412'}">${val}</span>`

  // Package × Branch rows
  const pkgRowsHtml = rows
    .map((r) => {
      const comm = r.realizedRevenue * cr
      const net = r.realizedRevenue - comm
      const pct = r.generatedCount > 0 ? Math.round((r.usedCount / r.generatedCount) * 100) : 0
      return `<tr>
        <td><strong>${esc(r.planName)}</strong><br><span style="color:#888;font-size:.78rem">${esc(r.currency)} ${fmt(r.planCost)}</span></td>
        <td>${esc(r.branch)}</td>
        <td style="text-align:center">${r.generatedCount}</td>
        <td style="text-align:center">${badge(r.usedCount, 'green')}</td>
        <td style="text-align:center">${badge(r.unusedCount, 'orange')}</td>
        <td style="text-align:center">${pct}%${pctBar(pct)}</td>
        <td style="text-align:right;color:#166534;font-weight:600">${money(r.realizedRevenue)}</td>
        <td style="text-align:right;color:#9a3412">${money(r.outstandingRevenue)}</td>
        <td style="text-align:right;color:#dc2626;font-weight:600">${money(comm)}</td>
        <td style="text-align:right;color:#166534;font-weight:700">${money(net)}</td>
      </tr>`
    })
    .join('')

  const pkgTotalHtml = `<tr style="background:#dcfce7!important;font-weight:700;border-top:2px solid #22c55e">
    <td colspan="2">TOTALS</td>
    <td style="text-align:center">${summary.totalGeneratedTokens}</td>
    <td style="text-align:center">${summary.totalUsedTokens}</td>
    <td style="text-align:center">${summary.totalUnusedTokens}</td>
    <td style="text-align:center">${usagePct}%</td>
    <td style="text-align:right;color:#166534">${money(summary.totalRealizedRevenue)}</td>
    <td style="text-align:right;color:#9a3412">${money(summary.totalOutstandingRevenue)}</td>
    <td style="text-align:right;color:#dc2626">${money(summary.commissionAmount)}</td>
    <td style="text-align:right;color:#166534">${money(summary.netRevenue)}</td>
  </tr>`

  // Branch summary rows
  const branchRowsHtml = branchRows
    .map((b) => {
      const comm = b.realizedRevenue * cr
      const net = b.realizedRevenue - comm
      const pct = b.generatedCount > 0 ? Math.round((b.usedCount / b.generatedCount) * 100) : 0
      return `<tr>
        <td><strong>${esc(b.branch)}</strong></td>
        <td style="text-align:center">${b.generatedCount}</td>
        <td style="text-align:center">${badge(b.usedCount, 'green')}</td>
        <td style="text-align:center">${badge(b.unusedCount, 'orange')}</td>
        <td style="text-align:center">${pct}%${pctBar(pct)}</td>
        <td style="text-align:right;color:#166534;font-weight:600">${money(b.realizedRevenue)}</td>
        <td style="text-align:right;color:#9a3412">${money(b.outstandingRevenue)}</td>
        <td style="text-align:right;color:#dc2626;font-weight:600">${money(comm)}</td>
        <td style="text-align:right;color:#166534;font-weight:700">${money(net)}</td>
      </tr>`
    })
    .join('')

  const branchTotalHtml = `<tr style="background:#dcfce7!important;font-weight:700;border-top:2px solid #22c55e">
    <td>TOTALS</td>
    <td style="text-align:center">${summary.totalGeneratedTokens}</td>
    <td style="text-align:center">${summary.totalUsedTokens}</td>
    <td style="text-align:center">${summary.totalUnusedTokens}</td>
    <td style="text-align:center">${usagePct}%</td>
    <td style="text-align:right;color:#166534">${money(summary.totalRealizedRevenue)}</td>
    <td style="text-align:right;color:#9a3412">${money(summary.totalOutstandingRevenue)}</td>
    <td style="text-align:right;color:#dc2626">${money(summary.commissionAmount)}</td>
    <td style="text-align:right;color:#166534">${money(summary.netRevenue)}</td>
  </tr>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NexRAD Financial Report ${dateFrom} – ${dateTo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f8;color:#222;font-size:14px}
.page{max-width:1300px;margin:0 auto;padding:24px}
.report-header{background:linear-gradient(135deg,#6366f1,#4338ca);color:white;border-radius:12px;padding:28px 32px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.report-header h1{font-size:1.6rem;font-weight:700}
.meta{font-size:.9rem;opacity:.85;margin-top:4px}
.badge-rate{background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.5);border-radius:50px;padding:8px 20px;font-size:1.1rem;font-weight:700}
.no-print-btn{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:13px;font-weight:600;margin-left:8px}
.no-print-btn:hover{background:rgba(255,255,255,.35)}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:24px}
.kpi{background:white;border-radius:10px;padding:18px 20px;box-shadow:0 1px 6px rgba(0,0,0,.08);border-top:4px solid #ccc}
.kpi.green{border-color:#22c55e}.kpi.blue{border-color:#3b82f6}.kpi.orange{border-color:#f97316}.kpi.purple{border-color:#8b5cf6}
.kpi-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:6px}
.kpi-value{font-size:1.45rem;font-weight:800;color:#1a1a2e}
.kpi-sub{font-size:.78rem;color:#999;margin-top:4px}
.commission-box{background:linear-gradient(135deg,#f97316,#ea580c);color:white;border-radius:12px;padding:24px 32px;margin-bottom:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;text-align:center}
.cb-label{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-bottom:6px}
.cb-value{font-size:1.6rem;font-weight:800}
.cb-sub{font-size:.8rem;opacity:.8;margin-top:2px}
.section-title{font-size:1.05rem;font-weight:700;color:#444;margin:28px 0 12px;padding-left:6px;border-left:4px solid #6366f1}
.tbl-wrap{overflow-x:auto;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08);margin-bottom:8px}
table{border-collapse:collapse;width:100%;background:white}
th{background:#6366f1;color:white;padding:10px 12px;text-align:left;font-size:.8rem;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;font-size:.85rem}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f7f8ff}
.footer-note{margin-top:24px;font-size:.82rem;color:#aaa}
@media print{
  body{background:white}
  .no-print{display:none!important}
  .page{padding:0}
  .report-header{border-radius:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .commission-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .kpi{box-shadow:none;border:1px solid #eee;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .tbl-wrap{box-shadow:none}
  th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div>
      <h1>NexRAD — Financial Report &amp; Commission Statement</h1>
      <div class="meta">Period: ${dateFrom} &mdash; ${dateTo} &nbsp;·&nbsp; Generated ${new Date().toLocaleString()}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="badge-rate">${crPct}% Commission Rate</div>
      <button class="no-print-btn no-print" onclick="window.print()">🖨 Print / PDF</button>
      <button class="no-print-btn no-print" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi blue"><div class="kpi-label">Tokens Generated</div><div class="kpi-value">${summary.totalGeneratedTokens}</div><div class="kpi-sub">Issued in period</div></div>
    <div class="kpi green"><div class="kpi-label">Tokens Used / Sold</div><div class="kpi-value">${summary.totalUsedTokens}</div><div class="kpi-sub">${usagePct}% usage rate</div></div>
    <div class="kpi orange"><div class="kpi-label">Tokens Unused</div><div class="kpi-value">${summary.totalUnusedTokens}</div><div class="kpi-sub">Outstanding / not yet used</div></div>
    <div class="kpi green"><div class="kpi-label">Realized Revenue</div><div class="kpi-value">${money(summary.totalRealizedRevenue)}</div><div class="kpi-sub">From used tokens</div></div>
    <div class="kpi orange"><div class="kpi-label">Outstanding Revenue</div><div class="kpi-value">${money(summary.totalOutstandingRevenue)}</div><div class="kpi-sub">From unused tokens</div></div>
    <div class="kpi blue"><div class="kpi-label">Total Generated Value</div><div class="kpi-value">${money(summary.totalGeneratedRevenue)}</div><div class="kpi-sub">All tokens × price</div></div>
  </div>

  <div class="commission-box">
    <div><div class="cb-label">Realized Revenue</div><div class="cb-value">${money(summary.totalRealizedRevenue)}</div><div class="cb-sub">From ${summary.totalUsedTokens} used tokens</div></div>
    <div><div class="cb-label">Commission @ ${crPct}%</div><div class="cb-value">${money(summary.commissionAmount)}</div><div class="cb-sub">Platform share</div></div>
    <div><div class="cb-label">Net to Operator</div><div class="cb-value">${money(summary.netRevenue)}</div><div class="cb-sub">After commission deducted</div></div>
    <div><div class="cb-label">Potential (incl. unused)</div><div class="cb-value">${money(summary.totalGeneratedRevenue)}</div><div class="cb-sub">If all tokens are used</div></div>
  </div>

  <div class="section-title">Revenue Breakdown by Package &amp; Branch</div>
  <div class="tbl-wrap">
  <table>
    <thead><tr>
      <th>Package</th><th>Branch</th>
      <th style="text-align:center">Generated</th><th style="text-align:center">Used</th><th style="text-align:center">Unused</th><th style="text-align:center">Usage %</th>
      <th style="text-align:right">Realized Revenue</th><th style="text-align:right">Outstanding</th>
      <th style="text-align:right">Commission (${crPct}%)</th><th style="text-align:right">Net to Operator</th>
    </tr></thead>
    <tbody>${pkgRowsHtml}${pkgTotalHtml}</tbody>
  </table>
  </div>

  <div class="section-title">Revenue by Branch</div>
  <div class="tbl-wrap">
  <table>
    <thead><tr>
      <th>Branch</th>
      <th style="text-align:center">Generated</th><th style="text-align:center">Used</th><th style="text-align:center">Unused</th><th style="text-align:center">Usage %</th>
      <th style="text-align:right">Realized Revenue</th><th style="text-align:right">Outstanding</th>
      <th style="text-align:right">Commission (${crPct}%)</th><th style="text-align:right">Net to Operator</th>
    </tr></thead>
    <tbody>${branchRowsHtml}${branchTotalHtml}</tbody>
  </table>
  </div>

  <p class="footer-note">
    Commission is applied to <strong>realized revenue only</strong> (tokens that have been used).
    Outstanding revenue reflects tokens generated but not yet activated by any customer.
  </p>
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=1280,height=900')
  if (!w) {
    alert('Please allow pop-ups for this site to open the print report.')
    return
  }
  w.document.write(html)
  w.document.close()
}

export default function Reports() {
  const defaults = getDefaultDates()
  const [filter, setFilter] = useState({ ...defaults, branchId: '' })
  const [activeFilter, setActiveFilter] = useState(filter)

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
  })

  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['report', activeFilter],
    queryFn: () =>
      api
        .get<FinancialReportResult>('/reports/financial', {
          params: {
            dateFrom: activeFilter.dateFrom,
            dateTo: activeFilter.dateTo,
            branchId: activeFilter.branchId || undefined,
          },
        })
        .then((r) => r.data),
    enabled: !!activeFilter.dateFrom && !!activeFilter.dateTo,
  })

  // Branch-level summary aggregated client-side from package rows
  const branchSummary = useMemo<BranchSummary[]>(() => {
    if (!report?.rows) return []
    const map = new Map<string, BranchSummary>()
    for (const r of report.rows) {
      const key = r.branchShortname || r.branch
      const b = map.get(key) ?? {
        branch: r.branch,
        branchShortname: r.branchShortname,
        generatedCount: 0,
        usedCount: 0,
        unusedCount: 0,
        generatedRevenue: 0,
        realizedRevenue: 0,
        outstandingRevenue: 0,
        currency: r.currency,
      }
      b.generatedCount += r.generatedCount
      b.usedCount += r.usedCount
      b.unusedCount += r.unusedCount
      b.generatedRevenue += r.generatedRevenue
      b.realizedRevenue += r.realizedRevenue
      b.outstandingRevenue += r.outstandingRevenue
      map.set(key, b)
    }
    return [...map.values()].sort((a, b) => b.realizedRevenue - a.realizedRevenue)
  }, [report?.rows])

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
  const cr = summary?.commissionRate ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        subtitle="Generated vs realized revenue with commission tracking"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                report && openPrintReport(report, activeFilter.dateFrom, activeFilter.dateTo)
              }
              disabled={!report}
            >
              <Printer className="h-4 w-4 mr-2" /> Print Report
            </Button>
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
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setActiveFilter(filter)}>Generate Report</Button>
      </div>

      {/* KPI Cards — 6 cards matching the PHP */}
      {summary && (
        <>
          <div className="kpi-grid">
            <StatCard
              label="Tokens Generated"
              value={String(summary.totalGeneratedTokens)}
              icon={BarChart3}
              colour="default"
              sub="Issued in period"
            />
            <StatCard
              label="Tokens Used / Sold"
              value={String(summary.totalUsedTokens)}
              icon={TrendingUp}
              colour="green"
              sub={`${summary.totalGeneratedTokens > 0 ? Math.round((summary.totalUsedTokens / summary.totalGeneratedTokens) * 100) : 0}% usage rate`}
            />
            <StatCard
              label="Tokens Unused"
              value={String(summary.totalUnusedTokens)}
              icon={AlertCircle}
              colour="amber"
              sub="Outstanding / not yet used"
            />
            <StatCard
              label="Realized Revenue"
              value={`${summary.currency} ${summary.totalRealizedRevenue.toFixed(2)}`}
              icon={DollarSign}
              colour="green"
              sub="From used tokens"
            />
            <StatCard
              label="Outstanding Revenue"
              value={`${summary.currency} ${summary.totalOutstandingRevenue.toFixed(2)}`}
              icon={AlertCircle}
              colour="amber"
              sub="From unused tokens"
            />
            <StatCard
              label="Total Generated Value"
              value={`${summary.currency} ${summary.totalGeneratedRevenue.toFixed(2)}`}
              icon={TrendingUp}
              colour="default"
              sub="All tokens × price"
            />
          </div>

          {/* Commission highlight */}
          <div className="rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 p-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-white">
            {[
              {
                label: 'Realized Revenue',
                value: `${summary.currency} ${summary.totalRealizedRevenue.toFixed(2)}`,
                sub: `From ${summary.totalUsedTokens} used tokens`,
              },
              {
                label: `Commission @ ${(cr * 100).toFixed(0)}%`,
                value: `${summary.currency} ${summary.commissionAmount.toFixed(2)}`,
                sub: 'Platform share',
              },
              {
                label: 'Net to Operator',
                value: `${summary.currency} ${summary.netRevenue.toFixed(2)}`,
                sub: 'After commission deducted',
              },
              {
                label: 'Potential (incl. unused)',
                value: `${summary.currency} ${summary.totalGeneratedRevenue.toFixed(2)}`,
                sub: 'If all tokens are used',
              },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-xs font-bold uppercase tracking-wide opacity-80 mb-1">
                  {item.label}
                </div>
                <div className="text-2xl font-extrabold">{item.value}</div>
                <div className="text-xs opacity-75 mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Package × Branch table */}
      {(isLoading || (report?.rows?.length ?? 0) > 0) && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pl-1 border-l-4 border-primary pl-3">
            Revenue by Package &amp; Branch
          </h3>
          <ReportTable
            rows={report?.rows ?? []}
            summary={summary}
            commissionRate={cr}
            loading={isLoading}
            mode="package"
          />

          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pl-1 border-l-4 border-primary pl-3">
            Revenue by Branch
          </h3>
          <ReportTable
            rows={branchSummary}
            summary={summary}
            commissionRate={cr}
            loading={isLoading}
            mode="branch"
          />
        </>
      )}

      {!isLoading && !report && !error && (
        <p className="text-center py-12 text-muted-foreground text-sm">
          Select a date range and click Generate Report.
        </p>
      )}

      {error && (
        <p className="text-center py-12 text-destructive text-sm">
          Error loading report. Check date range and try again.
        </p>
      )}

      {report && (
        <p className="text-xs text-muted-foreground text-right">
          Report generated at {new Date(report.generatedAt).toLocaleString()}
          &nbsp;·&nbsp;{report.rows.length} package rows
        </p>
      )}
    </div>
  )
}

// ── Report table with Commission + Net columns and a Totals row ──────────────

function ReportTable({
  rows,
  summary,
  commissionRate,
  loading,
  mode,
}: {
  rows: (BranchReportRow | BranchSummary)[]
  summary: ReportSummary | undefined
  commissionRate: number
  loading: boolean
  mode: 'package' | 'branch'
}) {
  const cr = commissionRate
  const cur = summary?.currency ?? 'USD'
  const money = (n: number) => `${cur} ${n.toFixed(2)}`

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="data-table w-full">
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: mode === 'package' ? 10 : 9 }).map((_, j) => (
                  <td key={j}>
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="data-table w-full text-sm">
        <thead>
          <tr>
            {mode === 'package' && <th>Package</th>}
            <th>Branch</th>
            <th className="text-center">Generated</th>
            <th className="text-center">Used</th>
            <th className="text-center">Unused</th>
            <th className="text-center">Usage %</th>
            <th className="text-right">Realized</th>
            <th className="text-right">Outstanding</th>
            <th className="text-right">Commission</th>
            <th className="text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const comm = row.realizedRevenue * cr
            const net = row.realizedRevenue - comm
            const pct =
              row.generatedCount > 0 ? Math.round((row.usedCount / row.generatedCount) * 100) : 0

            return (
              <tr key={i}>
                {mode === 'package' && 'planName' in row && (
                  <td>
                    <span className="font-semibold">{row.planName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.currency} {(row.planCost as number).toFixed(2)}
                    </span>
                  </td>
                )}
                <td>{row.branch}</td>
                <td className="text-center">{row.generatedCount}</td>
                <td className="text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    {row.usedCount}
                  </span>
                </td>
                <td className="text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                    {row.unusedCount}
                  </span>
                </td>
                <td className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-12 bg-muted rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs">{pct}%</span>
                  </div>
                </td>
                <td className="text-right font-semibold text-green-700 dark:text-green-400">
                  {money(row.realizedRevenue)}
                </td>
                <td className="text-right text-orange-700 dark:text-orange-400">
                  {money(row.outstandingRevenue)}
                </td>
                <td className="text-right font-semibold text-red-600 dark:text-red-400">
                  {money(comm)}
                </td>
                <td className="text-right font-bold text-green-800 dark:text-green-300">
                  {money(net)}
                </td>
              </tr>
            )
          })}

          {/* Totals row */}
          {summary && rows.length > 0 && (
            <tr className="bg-green-50 dark:bg-green-950/30 font-bold border-t-2 border-green-500">
              {mode === 'package' && <td>TOTALS</td>}
              <td>{mode === 'branch' ? 'TOTALS' : ''}</td>
              <td className="text-center">{summary.totalGeneratedTokens}</td>
              <td className="text-center">{summary.totalUsedTokens}</td>
              <td className="text-center">{summary.totalUnusedTokens}</td>
              <td className="text-center">
                {summary.totalGeneratedTokens > 0
                  ? Math.round((summary.totalUsedTokens / summary.totalGeneratedTokens) * 100)
                  : 0}
                %
              </td>
              <td className="text-right text-green-700 dark:text-green-400">
                {money(summary.totalRealizedRevenue)}
              </td>
              <td className="text-right text-orange-700 dark:text-orange-400">
                {money(summary.totalOutstandingRevenue)}
              </td>
              <td className="text-right text-red-600 dark:text-red-400">
                {money(summary.commissionAmount)}
              </td>
              <td className="text-right text-green-800 dark:text-green-300">
                {money(summary.netRevenue)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
