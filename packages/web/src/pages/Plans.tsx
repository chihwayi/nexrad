import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'
import type { BillingPlan } from '@nexrad/shared'

export default function Plans() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', 'all'],
    queryFn: () => api.get<BillingPlan[]>('/plans?all=true').then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.post(`/plans/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'displayName', header: 'Display Name', cell: (r: BillingPlan) => r.displayName ?? '—' },
    { key: 'timeBankHours', header: 'Hours', cell: (r: BillingPlan) => `${r.timeBankHours}h` },
    {
      key: 'dataLimitMb',
      header: 'Data Limit',
      cell: (r: BillingPlan) => (r.dataLimitMb ? `${r.dataLimitMb} MB` : 'Unlimited'),
    },
    {
      key: 'cost',
      header: 'Price',
      cell: (r: BillingPlan) => `${r.currency} ${r.cost.toFixed(2)}`,
    },
    {
      key: 'frGroupName',
      header: 'FR Group',
      cell: (r: BillingPlan) =>
        r.frGroupName ? (
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.frGroupName}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (r: BillingPlan) => (
        <Button
          variant="ghost"
          onClick={() => toggleMutation.mutate(r.id)}
          className={cn(
            r.isActive ? 'badge-online' : 'badge-offline',
            'h-auto py-0.5 px-2 cursor-pointer hover:opacity-80 hover:bg-transparent'
          )}
        >
          {r.isActive ? 'Active' : 'Inactive'}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Plans"
        subtitle="Configure WiFi plans and FreeRADIUS policy groups"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Plan
          </Button>
        }
      />
      <DataTable
        data={plans}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No billing plans. Create your first plan to start generating tokens."
      />
      <AddPlanDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['plans'] })
          setShowAdd(false)
        }}
      />
    </div>
  )
}

function AddPlanDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    displayName: '',
    timeBankHours: 1,
    dataLimitMb: '',
    cost: '',
    currency: 'USD',
    frGroupName: '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api
        .post('/plans', {
          name: data.name,
          displayName: data.displayName || undefined,
          timeBankHours: Number(data.timeBankHours),
          dataLimitMb: data.dataLimitMb ? Number(data.dataLimitMb) : undefined,
          cost: Number(data.cost),
          currency: data.currency,
          frGroupName: data.frGroupName || undefined,
        })
        .then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to create plan'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Billing Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plan Name *</Label>
              <Input
                placeholder="1Hour"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input
                placeholder="1 Hour WiFi"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Time Bank (hours) *</Label>
              <Input
                type="number"
                min={1}
                value={form.timeBankHours}
                onChange={(e) => setForm((f) => ({ ...f, timeBankHours: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Data Limit (MB)</Label>
              <Input
                type="number"
                placeholder="Leave blank = unlimited"
                value={form.dataLimitMb}
                onChange={(e) => setForm((f) => ({ ...f, dataLimitMb: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="1.00"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div>
              <Label>Currency *</Label>
              <Input
                placeholder="USD"
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>
          <div>
            <Label>FreeRADIUS Group Name</Label>
            <Input
              placeholder="1hour-group"
              value={form.frGroupName}
              onChange={(e) => setForm((f) => ({ ...f, frGroupName: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Creates radgroupcheck/radgroupreply policies automatically.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.name || !form.cost}
            >
              {mutation.isPending ? 'Creating...' : 'Create Plan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
