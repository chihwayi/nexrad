export interface Token {
  id: number
  username: string
  planName: string
  planCost: number
  currency: string
  createdBy: string
  branchName: string | null
  batchId: string | null
  prefix: string | null
  createdAt: string
  expiresAt: string | null
  isUsed: boolean
  sessionCount: number
  firstUse: string | null
  lastUse: string | null
}

export interface GenerateTokensRequest {
  planId: number
  quantity: number
  prefix: string
  branchIp?: string
  expiresInDays?: number
  notes?: string
}

export interface GenerateTokensResponse {
  batchId: string
  tokens: GeneratedToken[]
  count: number
}

export interface GeneratedToken {
  username: string
  password: string
  planName: string
  planCost: number
  currency: string
}

export interface TokenFilters {
  status?: 'used' | 'unused' | 'expired'
  branchIp?: string
  planId?: number
  batchId?: string
  dateFrom?: string
  dateTo?: string
}
