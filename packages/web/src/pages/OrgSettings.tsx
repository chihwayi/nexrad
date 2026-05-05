import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTable } from '@/components/shared/DataTable'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Copy, Check } from 'lucide-react'

interface Org {
  name?: string
  timezone?: string
  currency?: string
  voucherFooter?: string
}

interface ApiKey {
  id: number
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsed: string | null
}

export default function OrgSettings() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState<{ rawKey: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: org } = useQuery({
    queryKey: ['org-me'],
    queryFn: () => api.get<Org>('/orgs/me').then((r) => r.data),
  })

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKey[]>('/api-keys').then((r) => r.data),
  })

  const [form, setForm] = useState({ name: '', timezone: '', currency: '', voucherFooter: '' })

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name ?? '',
        timezone: org.timezone ?? 'UTC',
        currency: org.currency ?? 'USD',
        voucherFooter: org.voucherFooter ?? '',
      })
    }
  }, [org])

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.patch('/orgs/me', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-me'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const createKeyMutation = useMutation({
    mutationFn: (data: { name: string; scopes: string[] }) =>
      api.post('/api-keys', data).then((r) => r.data as ApiKey & { rawKey: string }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      setNewKeyResult({ rawKey: data.rawKey, name: data.name })
    },
  })

  const revokeKeyMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const copyKey = () => {
    if (!newKeyResult) return
    navigator.clipboard.writeText(newKeyResult.rawKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const keyColumns = [
    { key: 'name', header: 'Name' },
    {
      key: 'keyPrefix',
      header: 'Prefix',
      cell: (row: ApiKey) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          nxk_{row.keyPrefix}_...
        </span>
      ),
    },
    {
      key: 'scopes',
      header: 'Scopes',
      cell: (row: ApiKey) => (
        <div className="flex gap-1 flex-wrap">
          {(row.scopes ?? []).map((s) => (
            <span key={s} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              {s}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'lastUsed',
      header: 'Last Used',
      cell: (row: ApiKey) => (row.lastUsed ? new Date(row.lastUsed).toLocaleString() : 'Never'),
    },
    {
      key: 'id',
      header: '',
      cell: (row: ApiKey) => (
        <Button variant="ghost" size="sm" onClick={() => revokeKeyMutation.mutate(row.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Organization Settings" subtitle="Manage your org profile and API access" />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Organization Profile
        </h2>
        <div className="kpi-card space-y-4 max-w-lg">
          <div>
            <Label>Organization Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Input
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input
                value={form.timezone}
                placeholder="UTC"
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Voucher Footer Text</Label>
            <Textarea
              placeholder="Powered by NexRAD — support@yourcompany.com"
              value={form.voucherFooter}
              onChange={(e) => setForm((f) => ({ ...f, voucherFooter: e.target.value }))}
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Appears at the bottom of printed vouchers.
            </p>
          </div>
          <Button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
            {saved ? '✓ Saved' : updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            API Keys
          </h2>
          <Button
            size="sm"
            onClick={() =>
              createKeyMutation.mutate({
                name: `Key ${new Date().toLocaleDateString()}`,
                scopes: ['tokens:read', 'sessions:read', 'branches:read', 'reports:read'],
              })
            }
            disabled={createKeyMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" /> Generate Key
          </Button>
        </div>

        {newKeyResult && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-warning">
              Save this key now — it will not be shown again!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted rounded px-3 py-2 text-sm font-mono break-all">
                {newKeyResult.rawKey}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewKeyResult(null)}>
              I've saved it, dismiss
            </Button>
          </div>
        )}

        <DataTable
          data={apiKeys}
          columns={keyColumns}
          rowKey={(row) => row.id}
          loading={false}
          emptyText="No API keys. Generate one to integrate with external systems."
        />

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Usage:</strong> Pass the key as{' '}
            <code className="bg-muted px-1 rounded">Authorization: Bearer nxk_...</code>
          </p>
          <p>
            <strong>Base URL:</strong> <code className="bg-muted px-1 rounded">/api/v1/</code>
          </p>
          <p>
            Available endpoints: <code className="bg-muted px-1 rounded">GET /v1/tokens</code>,{' '}
            <code className="bg-muted px-1 rounded">POST /v1/tokens</code>,{' '}
            <code className="bg-muted px-1 rounded">GET /v1/stats</code>,{' '}
            <code className="bg-muted px-1 rounded">GET /v1/sessions</code>,{' '}
            <code className="bg-muted px-1 rounded">GET /v1/branches</code>
          </p>
        </div>
      </section>
    </div>
  )
}
