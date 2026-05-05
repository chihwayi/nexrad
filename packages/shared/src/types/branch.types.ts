export type BranchStatus = 'online' | 'recent' | 'inactive' | 'pending'

export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null // null until MikroTik self-registers
  tunnelIp: string | null
  radiusSecret: string // shown in the Provision dialog
  isActive: boolean
  createdAt: string
  updatedAt: string
  status?: BranchStatus
  activeSessions?: number
}

export interface CreateBranchDto {
  name: string
  shortname: string
  location?: string
}
