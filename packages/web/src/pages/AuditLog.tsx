import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AuditLog() {
  const [filter, setFilter] = useState({ action: '', resource: '' })
  const [page] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filter, page],
    queryFn: () => api.get('/audit', { params: { ...filter, page } }).then((r) => r.data as any),
  })

  const columns = [
    {
      key: 'createdAt',
      header: 'Time',
      cell: (row: any) => new Date(row.createdAt).toLocaleString(),
    },
    { key: 'username', header: 'User', cell: (row: any) => row.username ?? 'System' },
    {
      key: 'action',
      header: 'Action',
      cell: (row: any) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{row.action}</span>
      ),
    },
    { key: 'resource', header: 'Resource', cell: (row: any) => row.resource ?? '—' },
    { key: 'resourceId', header: 'Resource ID', cell: (row: any) => row.resourceId ?? '—' },
    { key: 'ipAddress', header: 'IP', cell: (row: any) => row.ipAddress ?? '—' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Track all admin actions in the system" />

      <div className="flex gap-3">
        <div>
          <Label className="text-xs mb-1 block">Filter by action</Label>
          <Input
            className="w-44"
            placeholder="e.g. auth.login"
            value={filter.action}
            onChange={(e) => setFilter((f) => ({ ...f, action: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Resource</Label>
          <Input
            className="w-32"
            placeholder="e.g. branch"
            value={filter.resource}
            onChange={(e) => setFilter((f) => ({ ...f, resource: e.target.value }))}
          />
        </div>
      </div>

      <DataTable
        data={data?.entries ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No audit entries found."
      />
    </div>
  )
}
