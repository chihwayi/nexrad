import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { DataTable } from '@/components/shared/DataTable'
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
import { Download, FileText, TrendingUp, DollarSign, AlertCircle, Percent } from 'lucide-react'
import type { FinancialReportResult, BranchReportRow } from '@nexrad/shared'

interface Branch {
  id: number
  name: string
}

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
    {
      key: 'planCost',
      header: 'Price',
      cell: (r: BranchReportRow) => `${r.currency} ${r.planCost.toFixed(2)}`,
    },
    { key: 'generatedCount', header: 'Generated' },
    { key: 'usedCount', header: 'Used' },
    { key: 'unusedCount', header: 'Unused' },
    {
      key: 'realizedRevenue',
      header: 'Realized',
      cell: (r: BranchReportRow) => (
        <span className="text-success font-semibold">
          {r.currency} {r.realizedRevenue.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'outstandingRevenue',
      header: 'Outstanding',
      cell: (r: BranchReportRow) => (
        <span className="text-warning">
          {r.currency} {r.outstandingRevenue.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'usagePercent',
      header: 'Usage',
      cell: (r: BranchReportRow) => (
        <div className="flex items-center gap-2">
          <div className="w-16 bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full"
              style={{ width: `${r.usagePercent}%` }}
            />
          </div>
          <span className="text-xs">{r.usagePercent}%</span>
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
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setActiveFilter(filter)}>Generate Report</Button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <>
          <div className="kpi-grid">
            <StatCard
              label="Realized Revenue"
              value={`${summary.currency} ${summary.totalRealizedRevenue.toFixed(2)}`}
              icon={DollarSign}
              colour="green"
              sub="Tokens actually used"
            />
            <StatCard
              label="Outstanding Revenue"
              value={`${summary.currency} ${summary.totalOutstandingRevenue.toFixed(2)}`}
              icon={AlertCircle}
              colour="amber"
              sub="Unused tokens (potential)"
            />
            <StatCard
              label="Commission Due"
              value={`${summary.currency} ${summary.commissionAmount.toFixed(2)}`}
              icon={Percent}
              colour="default"
              sub={`${(summary.commissionRate * 100).toFixed(0)}% of realized`}
            />
            <StatCard
              label="Net Revenue"
              value={`${summary.currency} ${summary.netRevenue.toFixed(2)}`}
              icon={TrendingUp}
              colour="green"
              sub="After commission"
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
                  Commission Summary — {(summary.commissionRate * 100).toFixed(0)}% on realized
                  revenue
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {summary.currency} {summary.totalRealizedRevenue.toFixed(2)} realized ×{' '}
                  {(summary.commissionRate * 100).toFixed(0)}% ={' '}
                  <strong>
                    {summary.currency} {summary.commissionAmount.toFixed(2)}
                  </strong>{' '}
                  commission. &nbsp;Net to keep:{' '}
                  <strong>
                    {summary.currency} {summary.netRevenue.toFixed(2)}
                  </strong>
                  . &nbsp;Commission applies only to tokens that have been used — not generated
                  tokens.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail Table */}
      <DataTable
        data={report?.rows ?? []}
        columns={columns}
        rowKey={(row) => `${row.branchShortname}-${row.planName}`}
        loading={isLoading}
        emptyText={
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
