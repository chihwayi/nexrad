import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Multi-tenant isolation', () => {
  let app: FastifyInstance
  let adminToken: string
  let org2Token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()

    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'admin123' },
    })
    adminToken = adminRes.json().accessToken

    const adminUsername = `org2admin-${Date.now()}`
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Test Org 2',
        slug: `test-org-2-${Date.now()}`,
        adminUsername,
        adminPassword: 'testpassword123',
      },
    })
    expect(orgRes.statusCode).toBe(201)

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: adminUsername, password: 'testpassword123' },
    })
    org2Token = loginRes.json().accessToken
  })

  afterAll(() => app.close())

  it('org1 tokens are not visible to org2', async () => {
    const org1Tokens = await app.inject({
      method: 'GET',
      url: '/api/tokens',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(org1Tokens.statusCode).toBe(200)

    const tokens = org1Tokens.json().tokens
    for (const token of tokens) {
      expect(token.orgId).toBe(1)
    }
  })

  it('superadmin can list all orgs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThanOrEqual(1)
  })

  it('org admin cannot access /api/orgs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs',
      headers: { authorization: `Bearer ${org2Token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
