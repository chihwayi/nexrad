import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, ShieldCheck, UserX } from 'lucide-react'

const ROLES = ['orgadmin', 'branchmanager', 'operator', 'readonly'] as const

export default function Users() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data as any[]),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive: !isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      superadmin: 'badge-error',
      orgadmin: 'badge-warning',
      branchmanager: 'badge-online',
      operator: 'badge-info',
      readonly: 'text-muted-foreground text-xs',
    }
    return <span className={map[role] ?? 'text-xs'}>{role}</span>
  }

  const columns = [
    {
      key: 'username',
      header: 'Username',
      cell: (row: any) => <span className="font-medium">{row.username}</span>,
    },
    { key: 'email', header: 'Email', cell: (row: any) => row.email ?? '—' },
    { key: 'role', header: 'Role', cell: (row: any) => roleBadge(row.role) },
    {
      key: 'isActive',
      header: 'Status',
      cell: (row: any) =>
        row.isActive ? (
          <span className="badge-online">Active</span>
        ) : (
          <span className="badge-offline">Inactive</span>
        ),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      cell: (row: any) => (row.lastLogin ? new Date(row.lastLogin).toLocaleString() : 'Never'),
    },
    {
      key: 'id',
      header: '',
      cell: (row: any) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleMutation.mutate({ id: row.id, isActive: row.isActive })}
          title={row.isActive ? 'Deactivate user' : 'Activate user'}
        >
          {row.isActive ? (
            <UserX className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-success" />
          )}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage team access and roles"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add User
          </Button>
        }
      />
      <DataTable
        data={users}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No users found."
      />
      <AddUserDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['users'] })
          setShowAdd(false)
        }}
      />
    </div>
  )
}

function AddUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'operator' as string,
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', data).then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to create user'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Username *</Label>
            <Input
              placeholder="jsmith"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="j@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <Label>Password *</Label>
            <Input
              type="password"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div>
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.username || !form.password}
            >
              {mutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
