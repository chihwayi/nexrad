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
  generatedRevenue: number // all tokens × cost
  realizedRevenue: number // used tokens × cost (actually earned)
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
  commissionAmount: number // realizedRevenue × commissionRate
  netRevenue: number // realizedRevenue − commissionAmount
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
  dateFrom: string // YYYY-MM-DD
  dateTo: string
  branchId?: number
  planId?: number
}

export async function generateFinancialReport(
  filter: ReportFilter
): Promise<FinancialReportResult> {
  const { orgId, dateFrom, dateTo } = filter

  const conditions: string[] = ['DATE(ubi.creationdate) BETWEEN ? AND ?']
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
  }>(
    `
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
  `,
    params
  )

  // Fetch org commission rate
  const [org] = await query<{ commission_rate: number; currency: string }>(
    'SELECT commission_rate, currency FROM nx_organizations WHERE id = ?',
    [orgId]
  )
  const commissionRate = Number(org?.commission_rate ?? 0.1)
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
  }>(
    `
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
  `,
    [dateFrom, dateTo, orgId]
  )
}
