import type { FastifyReply, FastifyRequest } from 'fastify'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { validateApiKey } from '../apikeys/apikey.service.js'

export { authenticate, requireRole }

export async function authenticateAny(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization ?? ''

  if (authHeader.startsWith('Bearer nxk_')) {
    const rawKey = authHeader.replace('Bearer ', '')
    const result = await validateApiKey(rawKey)
    if (!result) return reply.status(401).send({ error: 'Invalid or expired API key' })

    request.user = {
      sub: 0,
      id: 0,
      orgId: result.orgId,
      username: 'api-key',
      role: 'operator',
      branchIp: null,
      apiKeyScopes: result.scopes,
      iat: 0,
      exp: 0,
    } as never
    return
  }

  return authenticate(request, reply)
}

export function requireScope(scope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const scopes = (request.user as { apiKeyScopes?: string[] })?.apiKeyScopes
    if (scopes && !scopes.includes(scope) && !scopes.includes('*')) {
      return reply.status(403).send({ error: `API key missing required scope: ${scope}` })
    }
  }
}
