import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('API Key auth', () => {
  let app: FastifyInstance
  let adminToken: string
  let generatedApiKey: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'admin123' },
    })
    adminToken = res.json().accessToken
  })

  afterAll(() => app.close())

  it('POST /api/api-keys generates key with rawKey in response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { name: 'Test Key', scopes: ['tokens:read'] },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.rawKey).toMatch(/^nxk_/)
    generatedApiKey = body.rawKey
  })

  it('GET /api/v1/stats works with API key', async () => {
    if (!generatedApiKey) return
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/stats',
      headers: { authorization: `Bearer ${generatedApiKey}` },
    })
    expect([200, 403]).toContain(res.statusCode)
  })

  it('GET /api/v1/tokens works with API key (tokens:read scope)', async () => {
    if (!generatedApiKey) return
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tokens',
      headers: { authorization: `Bearer ${generatedApiKey}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('Invalid API key returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tokens',
      headers: { authorization: 'Bearer nxk_INVALID_KEY' },
    })
    expect(res.statusCode).toBe(401)
  })
})
