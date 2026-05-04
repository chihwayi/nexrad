export type BranchStatus = 'online' | 'recent' | 'inactive' | 'never'

export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null
  wgEndpoint: string | null
  isActive: boolean
  status: BranchStatus
  lastSeen: string | null
  createdAt: string
  activeSessions?: number
  todaySessions?: number
  totalRevenue?: number
}

export interface CreateBranchRequest {
  name: string
  location?: string
  wgPubkey?: string
}

export interface BranchStats {
  live: number
  today: number
  yesterday: number
  total: number
  uniqueTokens: number
  revenue: number
  lastSeen: string | null
}

export interface WireGuardPeerConfig {
  branchIp: string
  privateKey: string
  publicKey: string
  serverPublicKey: string
  serverEndpoint: string
  configText: string
  qrDataUrl: string
}
