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
