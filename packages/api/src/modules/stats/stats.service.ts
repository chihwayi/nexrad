import { query } from '../../db/mysql.js'

export interface GlobalStats {
  activeSessions: number
  todaySessions: number
  uniqueUsersToday: number
  realizedRevenueToday: number
  totalTokens: number
  usedTokens: number
  unusedTokens: number
}

export interface BranchStats {
  nasIp: string
  shortname: string
  name: string
  activeSessions: number
  todaySessions: number
  realizedRevenue: number
  lastSeen: string | null
  status: 'online' | 'recent' | 'inactive'
}

export async function getGlobalStats(orgId: number): Promise<GlobalStats> {
  const empty: GlobalStats = {
    activeSessions: 0,
    todaySessions: 0,
    uniqueUsersToday: 0,
    realizedRevenueToday: 0,
    totalTokens: 0,
    usedTokens: 0,
    unusedTokens: 0,
  }

  try {
    const [active] = await query<{ count: number }>(
      `
    SELECT COUNT(*) AS count
    FROM radacct
    WHERE acctstoptime IS NULL
      AND nasipaddress IN (
        SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
      )
  `,
      [orgId]
    )

    const [today] = await query<{ count: number; unique_count: number }>(
      `
    SELECT COUNT(*) AS count, COUNT(DISTINCT username) AS unique_count
    FROM radacct
    WHERE DATE(acctstarttime) = CURDATE()
      AND nasipaddress IN (
        SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
      )
  `,
      [orgId]
    )

    const [revenue] = await query<{ total: number }>(
      `
    SELECT COALESCE(SUM(bp.planCost), 0) AS total
    FROM userbillinfo ubi
    JOIN billing_plans bp ON bp.planName = ubi.planName
    WHERE DATE(ubi.creationdate) = CURDATE()
      AND EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = ubi.username)
      AND ubi.creationby IN (
        SELECT shortname FROM nx_branches WHERE org_id = ?
      )
  `,
      [orgId]
    )

    const [tokens] = await query<{ total: number; used: number }>(
      `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM radacct ra WHERE ra.username = ubi.username
      ) THEN 1 ELSE 0 END) AS used
    FROM userbillinfo ubi
    WHERE ubi.creationby IN (
      SELECT shortname FROM nx_branches WHERE org_id = ?
    )
  `,
      [orgId]
    )

    return {
      activeSessions: Number(active?.count ?? 0),
      todaySessions: Number(today?.count ?? 0),
      uniqueUsersToday: Number(today?.unique_count ?? 0),
      realizedRevenueToday: Number(revenue?.total ?? 0),
      totalTokens: Number(tokens?.total ?? 0),
      usedTokens: Number(tokens?.used ?? 0),
      unusedTokens: Number(tokens?.total ?? 0) - Number(tokens?.used ?? 0),
    }
  } catch {
    return empty
  }
}

export async function getBranchStats(orgId: number): Promise<BranchStats[]> {
  try {
    const branches = await query<{
      nas_ip: string
      shortname: string
      name: string
    }>(
      `
    SELECT nas_ip, shortname, name
    FROM nx_branches WHERE org_id = ? AND is_active = 1
    ORDER BY name
  `,
      [orgId]
    )

    const results: BranchStats[] = []

    for (const branch of branches) {
      const [active] = await query<{ count: number }>(
        `
      SELECT COUNT(*) AS count FROM radacct
      WHERE acctstoptime IS NULL AND nasipaddress = ?
    `,
        [branch.nas_ip]
      )

      const [today] = await query<{ count: number }>(
        `
      SELECT COUNT(*) AS count FROM radacct
      WHERE DATE(acctstarttime) = CURDATE() AND nasipaddress = ?
    `,
        [branch.nas_ip]
      )

      const [revenue] = await query<{ total: number }>(
        `
      SELECT COALESCE(SUM(bp.planCost), 0) AS total
      FROM userbillinfo ubi
      JOIN billing_plans bp ON bp.planName = ubi.planName
      WHERE ubi.creationby = ?
        AND DATE(ubi.creationdate) = CURDATE()
        AND EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = ubi.username)
    `,
        [branch.shortname]
      )

      const [lastActivity] = await query<{ last_seen: string | null }>(
        `
      SELECT MAX(acctstarttime) AS last_seen FROM radacct
      WHERE nasipaddress = ?
    `,
        [branch.nas_ip]
      )

      const lastSeen = lastActivity?.last_seen ?? null
      const minutesAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 60000 : Infinity

      const status: BranchStats['status'] =
        minutesAgo < 5 ? 'online' : minutesAgo < 60 ? 'recent' : 'inactive'

      results.push({
        nasIp: branch.nas_ip,
        shortname: branch.shortname,
        name: branch.name,
        activeSessions: Number(active?.count ?? 0),
        todaySessions: Number(today?.count ?? 0),
        realizedRevenue: Number(revenue?.total ?? 0),
        lastSeen,
        status,
      })
    }

    return results
  } catch {
    return []
  }
}

export async function getLiveSessions(orgId: number, limit = 50) {
  try {
    return await query<{
      username: string
      nasipaddress: string
      framedipaddress: string
      acctstarttime: string
      acctsessiontime: number
      acctinputoctets: number
      acctoutputoctets: number
      calledstationid: string
    }>(
      `
      SELECT
        ra.username,
        ra.nasipaddress,
        ra.framedipaddress,
        ra.acctstarttime,
        ra.acctsessiontime,
        ra.acctinputoctets,
        ra.acctoutputoctets,
        ra.calledstationid
      FROM radacct ra
      WHERE ra.acctstoptime IS NULL
        AND ra.nasipaddress IN (
          SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
        )
      ORDER BY ra.acctstarttime DESC
      LIMIT ?
    `,
      [orgId, limit]
    )
  } catch {
    return []
  }
}
