import { useEffect, useState } from 'react'
import { getSocket } from './useSocket'
import { api } from '@/lib/api'

export interface LiveSession {
  username: string
  nasipaddress: string
  framedipaddress: string
  acctstarttime: string
  acctsessiontime: number
  acctinputoctets: number
  acctoutputoctets: number
  calledstationid: string
}

export function useLiveSessions() {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<LiveSession[]>('/stats/sessions/live').then((res) => {
      setSessions(res.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    socket.on('session:started', (session: LiveSession) => {
      setSessions((prev) => [session, ...prev].slice(0, 100))
    })

    socket.on('session:stopped', ({ username }: { username: string }) => {
      setSessions((prev) => prev.filter((s) => s.username !== username))
    })

    return () => {
      socket.off('session:started')
      socket.off('session:stopped')
    }
  }, [])

  return { sessions, loading }
}
