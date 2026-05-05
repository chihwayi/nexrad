import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Download, Key, Copy, Check, Wifi, Trash2, ShieldAlert } from 'lucide-react'
import type { Branch } from '@nexrad/shared'

export default function Branches() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [provision, setProvision] = useState<Branch | null>(null)
  const [activating, setActivating] = useState<Branch | null>(null)

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const columns = [
    { key: 'name', header: 'Branch Name' },
    { key: 'shortname', header: 'Shortname' },
    {
      key: 'tunnelIp',
      header: 'Tunnel IP',
      cell: (row: Branch) => <span className="font-mono text-sm">{row.tunnelIp ?? '—'}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      cell: (row: Branch) => row.location ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'wgPubkey',
      header: 'WireGuard',
      cell: (row: Branch) => {
        if (!row.wgPubkey) {
          return (
            <Button
              variant="ghost"
              className="h-auto p-0 text-warning text-sm hover:bg-transparent hover:text-warning hover:underline gap-1"
              onClick={() => setActivating(row)}
            >
              <ShieldAlert className="h-4 w-4" /> Pending activation
            </Button>
          )
        }
        return (
          <span className="flex items-center gap-1 text-success text-sm">
            <Wifi className="h-4 w-4" />
            <span className="font-mono text-xs">{row.wgPubkey.slice(0, 10)}…</span>
          </span>
        )
      },
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (row: Branch) =>
        row.isActive ? (
          <span className="badge-online">Active</span>
        ) : (
          <span className="badge-offline">Inactive</span>
        ),
    },
    {
      key: 'id',
      header: '',
      cell: (row: Branch) => (
        <div className="flex gap-2 justify-end">
          {!row.wgPubkey && (
            <Button variant="outline" size="sm" onClick={() => setProvision(row)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Script
            </Button>
          )}
          <DeleteButton
            branch={row}
            onDeleted={() => qc.invalidateQueries({ queryKey: ['branches'] })}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        subtitle="Manage branch locations and WireGuard VPN connections"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Branch
          </Button>
        }
      />

      <DataTable
        data={branches}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No branches yet. Add your first branch to get started."
      />

      <AddBranchDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(branch) => {
          qc.invalidateQueries({ queryKey: ['branches'] })
          setShowAdd(false)
          setProvision(branch)
        }}
      />

      {provision && <ProvisionDialog branch={provision} onClose={() => setProvision(null)} />}

      {activating && (
        <ActivateDialog
          branch={activating}
          onActivated={() => {
            qc.invalidateQueries({ queryKey: ['branches'] })
            setActivating(null)
          }}
          onClose={() => setActivating(null)}
        />
      )}
    </div>
  )
}

function AddBranchDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (branch: Branch) => void
}) {
  const [form, setForm] = useState({ name: '', shortname: '', location: '' })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post<Branch>('/branches', data).then((r) => r.data),
    onSuccess: (branch) => {
      setForm({ name: '', shortname: '', location: '' })
      onCreated(branch)
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Failed to create branch'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Branch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="name">Branch Name</Label>
            <Input
              id="name"
              placeholder="Harare Central"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="shortname">Shortname</Label>
            <Input
              id="shortname"
              placeholder="hre-central"
              value={form.shortname}
              onChange={(e) => setForm((f) => ({ ...f, shortname: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Letters, numbers, hyphens only. Used in reports and voucher labels.
            </p>
          </div>
          <div>
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              placeholder="123 Samora Machel Ave"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            NexRAD will assign a tunnel IP and generate a RADIUS secret automatically. After
            creation, download the RouterOS provisioning script.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.name || !form.shortname}
            >
              {mutation.isPending ? 'Creating…' : 'Create Branch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProvisionDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const downloadScript = async () => {
    try {
      const res = await api.get(`/branches/${branch.id}/provision/script`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${branch.shortname}-provision.rsc`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download script')
    }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(branch.radiusSecret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Provision — {branch.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="kpi-card py-3">
              <p className="text-xs text-muted-foreground">Tunnel IP</p>
              <p className="font-mono font-semibold mt-1">{branch.tunnelIp}</p>
            </div>
            <div className="kpi-card py-3">
              <p className="text-xs text-muted-foreground">RADIUS Secret</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-mono font-semibold">
                  {showSecret ? branch.radiusSecret : '••••••••••••'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  <Key className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={copySecret}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-3 text-sm space-y-1.5">
            <p className="font-semibold">Deployment steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Download the RouterOS script below</li>
              <li>
                Factory reset the MikroTik:
                <br />
                <code className="text-xs bg-background px-1 rounded">
                  /system reset-configuration skip-backup=yes
                </code>
              </li>
              <li>Reconnect via WinBox Neighbors tab</li>
              <li>
                Drag the <code className="text-xs bg-background px-1 rounded">.rsc</code> file into
                WinBox Files panel
              </li>
              <li>
                In terminal:{' '}
                <code className="text-xs bg-background px-1 rounded">
                  /import {branch.shortname}-provision.rsc
                </code>
              </li>
              <li>Wait ~60s — the router self-registers and goes live</li>
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            The script self-registers the WireGuard key automatically. If the callback fails (e.g.
            no internet on ether1 yet), use the "Activate manually" button on the Branches page and
            paste the public key shown in the WinBox terminal.
          </p>

          <Button onClick={downloadScript} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Download RouterOS Script (.rsc)
          </Button>
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActivateDialog({
  branch,
  onActivated,
  onClose,
}: {
  branch: Branch
  onActivated: () => void
  onClose: () => void
}) {
  const [pubkey, setPubkey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.post(`/branches/${branch.id}/activate`, { wgPubkey: pubkey.trim() }),
    onSuccess: () => {
      toast.success('Branch activated')
      onActivated()
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      setError(e.response?.data?.error ?? 'Activation failed'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Activate — {branch.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Auto-registration failed. Run the provisioning script on the MikroTik and copy the
            public key printed at the end of the terminal output.
          </p>
          <div>
            <Label htmlFor="pubkey">WireGuard Public Key</Label>
            <Input
              id="pubkey"
              placeholder="LKMStk1/IpcOy/codwE9dqkAaqzajock..."
              value={pubkey}
              onChange={(e) => setPubkey(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || pubkey.trim().length < 40}
            >
              {mutation.isPending ? 'Activating…' : 'Activate Branch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteButton({ branch, onDeleted }: { branch: Branch; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.delete(`/branches/${branch.id}`),
    onSuccess: () => {
      toast.success(`Branch "${branch.name}" deleted`)
      onDeleted()
    },
    onError: () => toast.error('Failed to delete branch'),
  })

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete "${branch.name}"?`}
        description="This removes the WireGuard peer and RADIUS NAS entry. The router will stop authenticating users."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          mutation.mutate()
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
