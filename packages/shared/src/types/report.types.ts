export interface FinancialReport {
  period: { from: string; to: string }
  commissionRate: number
  totals: ReportTotals
  byPackage: PackageRow[]
  byBranch: BranchRow[]
}

export interface ReportTotals {
  tokensGenerated: number
  tokensUsed: number
  tokensUnused: number
  usagePercent: number
  generatedRevenue: number
  realizedRevenue: number
  outstandingRevenue: number
  commission: number
  netRevenue: number
}

export interface PackageRow {
  planName: string
  planCost: number
  currency: string
  branch: string
  tokensGenerated: number
  tokensUsed: number
  tokensUnused: number
  usagePercent: number
  realizedRevenue: number
  outstandingRevenue: number
  commission: number
  netRevenue: number
}

export interface BranchRow {
  branch: string
  nasIp: string
  tokensGenerated: number
  tokensUsed: number
  tokensUnused: number
  usagePercent: number
  realizedRevenue: number
  outstandingRevenue: number
  commission: number
  netRevenue: number
}

export interface ReportFilters {
  from: string
  to: string
  branchIp?: string
  planId?: number
}
