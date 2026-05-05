export interface Token {
  id: number
  orgId: number
  username: string
  branchId: number | null
  planId: number | null
  prefix: string | null
  batchId: string
  createdBy: number | null
  expiresAt: string | null
  notes: string | null
  createdAt: string
  // Joined fields
  planName?: string
  planCost?: number
  branchName?: string
  isUsed?: boolean
  sessionStart?: string | null
}

export interface GenerateTokensInput {
  orgId: number
  planId: number
  branchId?: number
  count: number
  prefix?: string
  expiresAt?: string
  notes?: string
  createdBy: number
}

export interface TokenListFilter {
  orgId: number
  branchId?: number
  planId?: number
  status?: 'used' | 'unused' | 'all'
  search?: string
  batchId?: string
  page?: number
  pageSize?: number
}
