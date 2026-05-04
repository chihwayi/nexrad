export interface Organization {
  id: number
  name: string
  slug: string
  commissionRate: number
  logoUrl: string | null
  settings: OrgSettings
  createdAt: string
  branchCount?: number
  userCount?: number
}

export interface OrgSettings {
  currency: string
  timezone: string
  voucherFooter: string
  theme: 'light' | 'dark' | 'system'
  smtpConfigured: boolean
  whatsappConfigured: boolean
}

export interface CreateOrganizationRequest {
  name: string
  slug: string
  commissionRate: number
  adminUsername: string
  adminPassword: string
  adminEmail: string
}
