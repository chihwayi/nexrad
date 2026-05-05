import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../app.js'

describe('POST /api/auth/login', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('returns 401 for wrong credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns tokens for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'superadmin', password: 'admin123' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toHaveProperty('accessToken')
    expect(body.data).toHaveProperty('refreshToken')
  })
})
