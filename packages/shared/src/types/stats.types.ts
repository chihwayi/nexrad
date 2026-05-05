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

export interface WsStatsUpdate {
  orgId: number
  global: GlobalStats
  branches: BranchStats[]
  timestamp: string
}
