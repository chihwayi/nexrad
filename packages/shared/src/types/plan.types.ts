export interface BillingPlan {
  id: number
  orgId: number
  name: string
  displayName: string | null
  timeBankHours: number
  dataLimitMb: number | null
  cost: number
  currency: string
  frGroupName: string | null
  isActive: boolean
  createdAt: string
  tokenCount?: number
}

export interface CreatePlanRequest {
  name: string
  displayName?: string
  timeBankHours: number
  dataLimitMb?: number
  cost: number
  currency: string
  frGroupName?: string
}
