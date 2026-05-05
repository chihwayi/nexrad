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
import { Plus, Building2, Users2, GitBranch, Ticket } from 'lucide-react'

interface Org {
  id: number
  name: string
  slug: string
  commissionRate: number
  currency: string
  isActive: boolean
  userCount: number
  branchCount: number
  tokenCount: number
  createdAt: string
}

export default function Tenants() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.get<Org[]>('/orgs').then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/orgs/${id}`, { isActive: !isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  })

  const columns = [
    {
      key: 'name',
      header: 'Organization',
      cell: (row: Org) => (
        <div>
          <p className="font-semibold">{row.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'commissionRate',
      header: 'Commission',
      cell: (row: Org) => `${(row.commissionRate * 100).toFixed(0)}%`,
    },
    { key: 'currency', header: 'Currency' },
    {
      key: 'userCount',
      header: 'Users',
      cell: (row: Org) => (
        <span className="flex items-center gap-1.5 text-sm">
          <Users2 className="h-3.5 w-3.5 text-muted-foreground" /> {row.userCount}
        </span>
      ),
    },
    {
      key: 'branchCount',
      header: 'Branches',
      cell: (row: Org) => (
        <span className="flex items-center gap-1.5 text-sm">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" /> {row.branchCount}
        </span>
      ),
    },
    {
      key: 'tokenCount',
      header: 'Tokens',
      cell: (row: Org) => (
        <span className="flex items-center gap-1.5 text-sm">
          <Ticket className="h-3.5 w-3.5 text-muted-foreground" /> {row.tokenCount}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (row: Org) => (
        <Button
          variant="ghost"
          onClick={() => toggleMutation.mutate({ id: row.id, isActive: row.isActive })}
          className={cn(
            row.isActive ? 'badge-online' : 'badge-offline',
            'h-auto py-0.5 px-2 cursor-pointer hover:opacity-80 hover:bg-transparent'
          )}
        >
          {row.isActive ? 'Active' : 'Suspended'}
        </Button>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      cell: (row: Org) => new Date(row.createdAt).toLocaleDateString(),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        subtitle={`${orgs.length} organizations on this instance`}
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Tenant
          </Button>
        }
      />

      <div className="kpi-grid">
        <div className="kpi-card">
          <Building2 className="h-6 w-6 text-primary mb-2" />
          <p className="kpi-value">{orgs.length}</p>
          <p className="kpi-label">Total Orgs</p>
        </div>
        <div className="kpi-card">
          <Building2 className="h-6 w-6 text-success mb-2" />
          <p className="kpi-value">{orgs.filter((o) => o.isActive).length}</p>
          <p className="kpi-label">Active</p>
        </div>
        <div className="kpi-card">
          <Users2 className="h-6 w-6 text-info mb-2" />
          <p className="kpi-value">{orgs.reduce((s, o) => s + o.userCount, 0)}</p>
          <p className="kpi-label">Total Users</p>
        </div>
        <div className="kpi-card">
          <Ticket className="h-6 w-6 text-warning mb-2" />
          <p className="kpi-value">{orgs.reduce((s, o) => s + o.tokenCount, 0)}</p>
          <p className="kpi-label">Total Tokens</p>
        </div>
      </div>

      <DataTable
        data={orgs}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No tenants. Create the first organization."
      />

      <AddTenantDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['orgs'] })
          setShowAdd(false)
        }}
      />
    </div>
  )
}

function AddTenantDialog({
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
    slug: '',
    currency: 'USD',
    commissionRate: '0.10',
    adminUsername: '',
    adminPassword: '',
    adminEmail: '',
  })
  const [error, setError] = useState<string | null>(null)

  const autoSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api
        .post('/orgs', {
          name: data.name,
          slug: data.slug,
          currency: data.currency,
          commissionRate: Number(data.commissionRate),
          adminUsername: data.adminUsername,
          adminPassword: data.adminPassword,
          adminEmail: data.adminEmail || undefined,
        })
        .then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: { response?: { data?: { message?: string; error?: string } } }) =>
      setError(e.response?.data?.message ?? e.response?.data?.error ?? 'Failed to create tenant'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Tenant Organization</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Organization Name *</Label>
            <Input
              placeholder="Acme WiFi Ltd"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))
              }
            />
          </div>
          <div>
            <Label>Slug * (URL-safe)</Label>
            <Input
              placeholder="acme-wifi"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Input
                value={form.currency}
                maxLength={3}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <Label>Commission Rate</Label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={form.commissionRate}
                onChange={(e) => setForm((f) => ({ ...f, commissionRate: e.target.value }))}
              />
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Initial Admin Account</p>
            <div className="space-y-2">
              <Input
                placeholder="Admin username *"
                value={form.adminUsername}
                onChange={(e) => setForm((f) => ({ ...f, adminUsername: e.target.value }))}
              />
              <Input
                type="password"
                placeholder="Admin password * (min 8)"
                value={form.adminPassword}
                onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
              />
              <Input
                type="email"
                placeholder="Admin email (optional)"
                value={form.adminEmail}
                onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={
                mutation.isPending || !form.name || !form.adminUsername || !form.adminPassword
              }
            >
              {mutation.isPending ? 'Creating...' : 'Create Tenant'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
