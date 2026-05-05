import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Branch endpoints', () => {
  let app: FastifyInstance
  let token: string
  let branchId: number

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
    if (branchId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/branches/${branchId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    }
    await app.close()
  })

  it('GET /api/branches returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/branches',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('POST /api/branches creates branch with tunnel IP and RADIUS secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/branches',
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'Test Branch', shortname: 'test-branch', location: 'Test Location' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.name).toBe('Test Branch')
    expect(body.tunnelIp).toMatch(/^10\.8\.0\.\d+$/)
    expect(body.radiusSecret).toBeTruthy()
    expect(body.radiusSecret.length).toBeGreaterThanOrEqual(20)
    expect(body.wgPubkey).toBeNull() // null until MikroTik registers
    branchId = body.id
  })

  it('GET /api/branches/:id returns the branch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/branches/${branchId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Test Branch')
  })

  it('PATCH /api/branches/:id updates location', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/branches/${branchId}`,
      headers: { authorization: `Bearer ${token}` },
      body: { location: 'Updated Location' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().location).toBe('Updated Location')
  })

  it('GET /api/branches/:id/provision/script returns .rsc content when WG_SERVER_ENDPOINT is set', async () => {
    // Only runs if env is configured — skip gracefully in CI without server creds
    if (!process.env.WG_SERVER_ENDPOINT || !process.env.WG_SERVER_PUBLIC_KEY) {
      console.log('Skipping provision/script test — WG env vars not set')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: `/api/branches/${branchId}/provision/script`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('.rsc')
    expect(res.body).toContain('/interface wireguard add name=wg-radius')
    expect(res.body).toContain('/radius add')
    expect(res.body).toContain('register-peer')
  })

  it('POST /branches/register-peer rejects invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/branches/register-peer',
      body: {
        token: 'a'.repeat(64),
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/branches' })
    expect(res.statusCode).toBe(401)
  })
})
