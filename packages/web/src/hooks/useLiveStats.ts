import { useEffect, useState } from 'react'
import { getSocket } from './useSocket'
import { api } from '@/lib/api'
import type { GlobalStats, BranchStats } from '@nexrad/shared'

interface LiveStatsState {
  global: GlobalStats | null
  branches: BranchStats[]
  loading: boolean
  lastUpdated: string | null
}

export function useLiveStats() {
  const [state, setState] = useState<LiveStatsState>({
    global: null,
    branches: [],
    loading: true,
    lastUpdated: null,
  })

  // Initial HTTP fetch
  useEffect(() => {
    Promise.all([api.get<GlobalStats>('/stats/global'), api.get<BranchStats[]>('/stats/branches')])
      .then(([globalRes, branchRes]) => {
        setState((s) => ({
          ...s,
          global: globalRes.data,
          branches: branchRes.data,
          loading: false,
          lastUpdated: new Date().toISOString(),
        }))
      })
      .catch(() => setState((s) => ({ ...s, loading: false })))
  }, [])

  // WebSocket real-time updates
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const handleUpdate = (data: {
      global: GlobalStats
      branches: BranchStats[]
      timestamp: string
    }) => {
      setState({
        global: data.global,
        branches: data.branches,
        loading: false,
        lastUpdated: data.timestamp,
      })
    }

    socket.on('stats:update', handleUpdate)
    socket.emit('subscribe:stats')

    return () => {
      socket.off('stats:update', handleUpdate)
    }
  }, [])

  return state
}
