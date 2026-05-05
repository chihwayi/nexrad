import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '@/stores/auth.store'

let socketInstance: Socket | null = null

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      autoConnect: false,
      transports: ['websocket'],
    })
  }
  return socketInstance
}

export function useSocket() {
  const token = useAuth((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!token) return

    const socket = getSocket()
    socket.auth = { token }
    socket.connect()
    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketInstance = null
    }
  }, [token])

  return socketRef.current
}
