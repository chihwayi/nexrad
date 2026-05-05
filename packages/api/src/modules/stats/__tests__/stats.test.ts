import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Stats endpoints', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()

    // Login as admin to get token
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

  it('GET /api/stats/global returns stats shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/global',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.activeSessions).toBe('number')
    expect(typeof body.realizedRevenueToday).toBe('number')
    expect(typeof body.totalTokens).toBe('number')
  })

  it('GET /api/stats/branches returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/branches',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('GET /api/stats/sessions/live returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/sessions/live',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats/global' })
    expect(res.statusCode).toBe(401)
  })
})
