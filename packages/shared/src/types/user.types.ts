export interface User {
  id: number
  orgId: number | null
  username: string
  email: string | null
  role: import('./auth.types').UserRole
  branchIp: string | null
  isActive: boolean
  lastLogin: string | null
  createdAt: string
}

export interface CreateUserRequest {
  username: string
  email?: string
  password: string
  role: import('./auth.types').UserRole
  branchIp?: string
}

export interface UpdateUserRequest {
  email?: string
  password?: string
  role?: import('./auth.types').UserRole
  branchIp?: string
  isActive?: boolean
}
