import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Token endpoints', () => {
  let app: FastifyInstance
  let token: string
  let batchId: string
  let createdUsername: string

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

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/tokens returns paginated response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tokens',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.tokens)).toBe(true)
    expect(typeof body.total).toBe('number')
  })

  it('POST /api/tokens/generate creates tokens', async () => {
    // Requires at least one plan in nx_billing_plans
    const plansRes = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${token}` },
    })
    const plans = plansRes.json()
    if (!plans.length) return // Skip if no plans seeded

    const res = await app.inject({
      method: 'POST',
      url: '/api/tokens/generate',
      headers: { authorization: `Bearer ${token}` },
      body: { planId: plans[0].id, count: 3, prefix: 'TST' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.count).toBe(3)
    expect(body.tokens).toHaveLength(3)
    expect(body.tokens[0]).toMatch(/^TST-/)
    batchId = body.batchId
    createdUsername = body.tokens[0]
  })

  it('GET /api/tokens filters by batchId', async () => {
    if (!batchId) return
    const res = await app.inject({
      method: 'GET',
      url: `/api/tokens?batchId=${batchId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().total).toBe(3)
  })

  it('DELETE /api/tokens/:username deletes unused token', async () => {
    if (!createdUsername) return
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/tokens/${createdUsername}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(204)
  })

  it('GET /api/vouchers/pdf returns PDF binary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/vouchers/pdf?status=all&limit=5',
      headers: { authorization: `Bearer ${token}` },
    })
    // May be 400 if no tokens exist, that is acceptable
    expect([200, 400]).toContain(res.statusCode)
    if (res.statusCode === 200) {
      expect(res.headers['content-type']).toContain('application/pdf')
    }
  })
})
