export interface Session {
  id: number
  username: string
  nasIp: string
  branchName: string | null
  planName: string | null
  startTime: string
  stopTime: string | null
  duration: number
  inputOctets: number
  outputOctets: number
  isActive: boolean
}

export interface LiveStats {
  activeSessions: number
  activeLocations: number
  totalTimeToday: number
  dataGbToday: number
  newSessions5min: number
  newRevenue5min: number
}

export interface SessionsByBranch {
  [branchIp: string]: number
}

// WebSocket event payloads
export interface WsSessionStarted {
  username: string
  nasIp: string
  branchName: string | null
  planName: string | null
  startTime: string
}

export interface WsSessionEnded {
  username: string
  duration: number
  dataUsed: number
}

export interface WsLiveStatsUpdate {
  activeSessions: number
  byBranch: SessionsByBranch
  realizedRevenue: number
  usedTokens: number
  unusedTokens: number
}
