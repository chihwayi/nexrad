export type UserRole = 'superadmin' | 'orgadmin' | 'branchmanager' | 'operator' | 'readonly'

export interface AuthUser {
  id: number
  orgId: number | null
  username: string
  email: string | null
  role: UserRole
  branchIp: string | null
  orgSlug: string | null
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface RefreshRequest {
  refreshToken: string
}

export interface JwtPayload {
  sub: number
  username: string
  role: UserRole
  orgId: number | null
  branchIp: string | null
  iat: number
  exp: number
}
