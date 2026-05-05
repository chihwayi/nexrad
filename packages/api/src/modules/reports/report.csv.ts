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
  lines.push(
    `"Generated Revenue","${summary.currency} ${summary.totalGeneratedRevenue.toFixed(2)}"`
  )
  lines.push(`"Realized Revenue","${summary.currency} ${summary.totalRealizedRevenue.toFixed(2)}"`)
  lines.push(
    `"Outstanding Revenue","${summary.currency} ${summary.totalOutstandingRevenue.toFixed(2)}"`
  )
  lines.push(`"Commission Rate","${(summary.commissionRate * 100).toFixed(1)}%"`)
  lines.push(`"Commission Amount","${summary.currency} ${summary.commissionAmount.toFixed(2)}"`)
  lines.push(`"Net Revenue","${summary.currency} ${summary.netRevenue.toFixed(2)}"`)
  lines.push('')

  // Detail table
  lines.push(
    '"Branch","Plan","Cost","Generated","Used","Unused","Realized Revenue","Outstanding Revenue","Usage %"'
  )
  for (const row of rows) {
    lines.push(
      [
        `"${row.branch.replace(/"/g, '""')}"`,
        `"${row.planName.replace(/"/g, '""')}"`,
        `"${row.currency} ${row.planCost.toFixed(2)}"`,
        row.generatedCount,
        row.usedCount,
        row.unusedCount,
        `"${row.currency} ${row.realizedRevenue.toFixed(2)}"`,
        `"${row.currency} ${row.outstandingRevenue.toFixed(2)}"`,
        `"${row.usagePercent}%"`,
      ].join(',')
    )
  }

  return lines.join('\r\n')
}
