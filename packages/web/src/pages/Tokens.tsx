import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Printer, MessageCircle, Trash2, RefreshCw } from 'lucide-react'
import type { Token } from '@nexrad/shared'

interface Plan {
  id: number
  name: string
  cost: number
  currency: string
}
interface Branch {
  id: number
  name: string
  shortname: string
}

export default function Tokens() {
  const qc = useQueryClient()
  const [showGenerate, setShowGenerate] = useState(false)
  const [filter, setFilter] = useState({ status: 'all', search: '', branchId: '', planId: '' })
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['tokens', filter, page],
    queryFn: () =>
      api
        .get('/tokens', {
          params: { ...filter, page, pageSize: 50 },
        })
        .then((r) => r.data as { tokens: Token[]; total: number; page: number }),
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans').then((r) => r.data),
  })

  const printVouchers = (batchId?: string) => {
    const params = new URLSearchParams({ status: 'unused', limit: '500' })
    if (batchId) params.set('batchId', batchId)
    if (filter.branchId) params.set('branchId', filter.branchId)
    if (filter.planId) params.set('planId', filter.planId)
    window.open(`/api/vouchers/pdf?${params}`, '_blank')
  }

  const shareWhatsApp = (token: Token) => {
    const text = encodeURIComponent(
      `🌐 WiFi Voucher\nUsername: ${token.username}\nPassword: ${token.username}\nPlan: ${token.planName ?? ''}\n\nConnect to WiFi and use these credentials.`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const columns = [
    {
      key: 'username',
      header: 'Token / Username',
      cell: (row: Token) => <span className="font-mono font-semibold text-sm">{row.username}</span>,
    },
    { key: 'planName', header: 'Plan', cell: (row: Token) => row.planName ?? '—' },
    { key: 'branchName', header: 'Branch', cell: (row: Token) => row.branchName ?? '—' },
    {
      key: 'isUsed',
      header: 'Status',
      cell: (row: Token) =>
        row.isUsed ? (
          <span className="badge-offline">Used</span>
        ) : (
          <span className="badge-online">Available</span>
        ),
    },
    {
      key: 'sessionStart',
      header: 'First Used',
      cell: (row: Token) => (row.sessionStart ? new Date(row.sessionStart).toLocaleString() : '—'),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      cell: (row: Token) => (row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '—'),
    },
    {
      key: 'id',
      header: '',
      cell: (row: Token) => (
        <div className="flex gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            title="Share via WhatsApp"
            onClick={() => shareWhatsApp(row)}
          >
            <MessageCircle className="h-4 w-4 text-green-500" />
          </Button>
          {!row.isUsed && (
            <DeleteTokenButton
              username={row.username}
              onDeleted={() => qc.invalidateQueries({ queryKey: ['tokens'] })}
            />
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokens"
        subtitle={`${data?.total ?? 0} tokens total`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => printVouchers()}>
              <Printer className="h-4 w-4 mr-2" /> Print Vouchers
            </Button>
            <Button onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Generate Tokens
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select
            value={filter.status}
            onValueChange={(v) => setFilter((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unused">Available</SelectItem>
              <SelectItem value="used">Used</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Branch</Label>
          <Select
            value={filter.branchId || 'all'}
            onValueChange={(v) => setFilter((f) => ({ ...f, branchId: v === 'all' ? '' : v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Search</Label>
          <Input
            className="w-48"
            placeholder="Search token..."
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['tokens'] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <DataTable
        data={data?.tokens ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No tokens found. Generate some tokens to get started."
      />

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= data.total}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <GenerateDialog
        open={showGenerate}
        plans={plans}
        branches={branches}
        onClose={() => setShowGenerate(false)}
        onGenerated={(batchId) => {
          qc.invalidateQueries({ queryKey: ['tokens'] })
          setShowGenerate(false)
          toast.success('Tokens generated!', 'Click "Print Vouchers" to download the PDF.')
          printVouchers(batchId)
        }}
      />
    </div>
  )
}

function GenerateDialog({
  open,
  plans,
  branches,
  onClose,
  onGenerated,
}: {
  open: boolean
  plans: Plan[]
  branches: Branch[]
  onClose: () => void
  onGenerated: (batchId: string) => void
}) {
  const [form, setForm] = useState({
    planId: '',
    branchId: '',
    count: 10,
    prefix: '',
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api
        .post('/tokens/generate', {
          planId: Number(data.planId),
          branchId: data.branchId ? Number(data.branchId) : undefined,
          count: data.count,
          prefix: data.prefix || undefined,
          notes: data.notes || undefined,
        })
        .then((r) => r.data),
    onSuccess: (data) => onGenerated(data.batchId),
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to generate tokens'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Tokens</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Billing Plan *</Label>
            <Select
              value={form.planId}
              onValueChange={(v) => setForm((f) => ({ ...f, planId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a plan..." />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} — {p.currency} {p.cost}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch (optional)</Label>
            <Select
              value={form.branchId || 'none'}
              onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === 'none' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All / Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned (HQ)</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Prefix (optional)</Label>
            <Input
              placeholder="e.g. HRE"
              maxLength={10}
              value={form.prefix}
              onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tokens will look like: HRE-A3B7C2D1
            </p>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              placeholder="Batch for weekend promotion..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.planId || form.count < 1}
            >
              {mutation.isPending ? 'Generating...' : `Generate ${form.count} Tokens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteTokenButton({ username, onDeleted }: { username: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const mutation = useMutation({
    mutationFn: () => api.delete(`/tokens/${username}`),
    onSuccess: onDeleted,
  })

  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          Delete
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    )
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )
}
