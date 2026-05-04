export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  meta?: PaginationMeta
}

export interface PaginationMeta {
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface PaginationQuery {
  page?: number
  perPage?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}
