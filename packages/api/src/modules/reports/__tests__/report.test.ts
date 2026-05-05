import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Report endpoints', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'admin123' },
    })
    token = res.json().accessToken
  })

  afterAll(() => app.close())

  it('GET /api/reports/financial returns report shape', async () => {
    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/financial?dateFrom=${monthAgo}&dateTo=${today}&format=json`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.rows)).toBe(true)
    expect(typeof body.summary).toBe('object')
    expect(typeof body.summary.totalRealizedRevenue).toBe('number')
    expect(typeof body.summary.commissionAmount).toBe('number')
    expect(body.summary.commissionAmount).toBe(
      body.summary.totalRealizedRevenue * body.summary.commissionRate
    )
  })

  it('GET /api/reports/financial?format=pdf returns PDF', async () => {
    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/financial?dateFrom=${monthAgo}&dateTo=${today}&format=pdf`,
      headers: { authorization: `Bearer ${token}` },
    })
    // Acceptable: 200 (PDF) or 400 (no data rows in test DB)
    expect([200, 400]).toContain(res.statusCode)
    if (res.statusCode === 200) {
      expect(res.headers['content-type']).toContain('application/pdf')
    }
  })

  it('GET /api/reports/sessions returns array', async () => {
    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/sessions?dateFrom=${monthAgo}&dateTo=${today}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('returns 401 without token', async () => {
    const today = new Date().toISOString().split('T')[0]
    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/financial?dateFrom=${today}&dateTo=${today}`,
    })
    expect(res.statusCode).toBe(401)
  })
})
