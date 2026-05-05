import { Server as SocketServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { redis } from '../db/redis.js'
import { verifyAccessToken } from '../services/auth.service.js'
import type { AuthUser } from '@nexrad/shared'

export let io: SocketServer

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', credentials: true },
    transports: ['websocket', 'polling'],
  })

  // Auth middleware — validates JWT on handshake
  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '')

    if (!token) return next(new Error('Unauthorized'))

    try {
      const user = verifyAccessToken(token)
      socket.data.user = user
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const user: AuthUser = socket.data.user
    console.info(`WS connected: user=${user.username} role=${user.role}`)

    // Join org room — broadcasts scoped to org
    socket.join(`org:${user.orgId}`)

    // Branch operators join their branch room
    if (user.role === 'branchmanager' || user.role === 'operator') {
      if (user.branchIp) socket.join(`branch:${user.branchIp}`)
    }

    socket.on('subscribe:stats', () => {
      socket.emit('stats:subscribed', { message: 'Streaming live stats' })
    })

    socket.on('disconnect', () => {
      console.info(`WS disconnected: user=${user.username}`)
    })
  })

  // Subscribe to Redis pub/sub for cross-process events
  subscribeToRedisEvents().catch((err) => {
    console.error('Redis pub/sub subscription failed:', err)
    process.exit(1)
  })

  return io
}

async function subscribeToRedisEvents() {
  const subscriber = redis.duplicate()
  await subscriber.connect()

  await subscriber.subscribe('session:start', (message) => {
    const data = JSON.parse(message)
    io.to(`org:${data.orgId}`).emit('session:started', data)
    if (data.nasIp) io.to(`branch:${data.nasIp}`).emit('session:started', data)
  })

  await subscriber.subscribe('session:stop', (message) => {
    const data = JSON.parse(message)
    io.to(`org:${data.orgId}`).emit('session:stopped', data)
    if (data.nasIp) io.to(`branch:${data.nasIp}`).emit('session:stopped', data)
  })

  await subscriber.subscribe('stats:update', (message) => {
    const data = JSON.parse(message)
    io.to(`org:${data.orgId}`).emit('stats:update', data)
  })
}
