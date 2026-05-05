import type { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import type { JwtPayload, UserRole } from '@nexrad/shared'

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ success: false, error: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(auth.slice(7), config.jwt.secret) as unknown as JwtPayload
    req.user = payload
  } catch {
    return reply.code(401).send({ success: false, error: 'Token expired or invalid' })
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (reply.sent) return
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ success: false, error: 'Insufficient permissions' })
    }
  }
}

export function requireOrg() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (reply.sent) return
    if (req.user.role === 'superadmin') return
    const paramOrgId = (req.params as Record<string, string | undefined>).orgId
    if (paramOrgId && Number(paramOrgId) !== req.user.orgId) {
      return reply.code(403).send({ success: false, error: 'Access denied to this organization' })
    }
  }
}

export function requireBranchAccess() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (reply.sent) return
    const { role, branchIp } = req.user
    if (['superadmin', 'orgadmin'].includes(role)) return
    if (role === 'branchmanager' || role === 'operator') {
      const params = req.params as Record<string, string | undefined>
      const qs = req.query as Record<string, string | undefined>
      const paramIp = params.branchIp || qs.branchIp
      if (paramIp && paramIp !== branchIp) {
        return reply.code(403).send({ success: false, error: 'Access denied to this branch' })
      }
    }
  }
}
