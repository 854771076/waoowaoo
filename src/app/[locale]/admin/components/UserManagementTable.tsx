'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'
import { GlassModalShell } from '@/components/ui/primitives'
import { GlassButton } from '@/components/ui/primitives'

interface User {
  id: string
  name: string
  role: string
  isDisabled: boolean
  balance: number
  totalSpent: number
  projectCount: number
  createdAt: string
}

interface UserStats {
  totalUsers: number
  totalBalance: number
  totalSpent: number
}

interface CreateUserRequest {
  name: string
  password: string
  role: string
  initialBalance: number
  isDisabled: boolean
}

export default function UserManagementTable() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    password: string
    role: string
    balance: number
    isDisabled: boolean
  }>({
    name: '',
    password: '',
    role: 'user',
    balance: 0,
    isDisabled: false,
  })
  const [newUser, setNewUser] = useState<CreateUserRequest>({
    name: '',
    password: '',
    role: 'user',
    initialBalance: 0,
    isDisabled: false,
  })
  const [actionLoading, setActionLoading] = useState(false)
  const [stats, setStats] = useState<UserStats | null>(null)

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/admin/users')
      const data = await res.json()
      setUsers(data.users)
      setStats(data.stats)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.password) {
      alert(t('fillRequiredFields'))
      return
    }
    setActionLoading(true)
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      setShowCreateDialog(false)
      setNewUser({
        name: '',
        password: '',
        role: 'user',
        initialBalance: 0,
        isDisabled: false,
      })
      await fetchUsers()
    } catch (error) {
      console.error('Failed to create user:', error)
      alert(t('createUserFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleDisable = async (user: User) => {
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDisabled: !user.isDisabled }),
      })
      await fetchUsers()
    } catch (error) {
      console.error('Failed to update user:', error)
      alert(t('updateUserFailed'))
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })
      setConfirmDeleteId(null)
      await fetchUsers()
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert(t('deleteUserFailed'))
    }
  }

  const handleEditClick = (user: User) => {
    setEditingUser(user)
    setEditForm({
      name: user.name,
      password: '',
      role: user.role,
      balance: user.balance,
      isDisabled: user.isDisabled,
    })
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    if (!editForm.name) {
      alert(t('fillRequiredFields'))
      return
    }
    setActionLoading(true)
    try {
      await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      setShowEditDialog(false)
      setEditingUser(null)
      await fetchUsers()
    } catch (error) {
      console.error('Failed to edit user:', error)
      alert(t('editUserFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--glass-text-secondary)]">
        {tc('loading')}
      </div>
    )
  }

  return (
    <div>
      {/* Create User Button */}
      <div className="mb-4 flex justify-end">
        <GlassButton
          onClick={() => setShowCreateDialog(true)}
          variant="primary"
        >
          <AppIcon name="plus" className="mr-2 h-4 w-4" />
          {t('createUser')}
        </GlassButton>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-4">
            <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('statsTotalUsers')}</div>
            <div className="mt-1 text-2xl font-bold text-[var(--glass-text-primary)]">{stats.totalUsers}</div>
          </div>
          <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-4">
            <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('statsTotalBalance')}</div>
            <div className="mt-1 text-2xl font-bold text-[var(--glass-text-primary)]">{stats.totalBalance.toFixed(2)}</div>
          </div>
          <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-4">
            <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('statsTotalSpent')}</div>
            <div className="mt-1 text-2xl font-bold text-[var(--glass-text-primary)]">{stats.totalSpent.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--glass-stroke-base)]">
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('username')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('role')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('status')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('balance')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('totalSpent')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('projects')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('created')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-muted)]/30"
              >
                <td className="px-4 py-3 text-sm text-[var(--glass-text-primary)]">
                  {user.name}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-secondary)]">
                  {user.role}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      !user.isDisabled
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : 'bg-red-500/10 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {user.isDisabled ? t('disabled') : t('enabled')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-primary)]">
                  {user.balance.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-primary)]">
                  {user.totalSpent.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-secondary)]">
                  {user.projectCount}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--glass-text-secondary)]">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditClick(user)}
                      className="rounded bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-500/20"
                    >
                      {t('edit')}
                    </button>
                    <button
                      onClick={() => handleToggleDisable(user)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        !user.isDisabled
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                          : 'bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                      }`}
                    >
                      {user.isDisabled ? t('enable') : t('disable')}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(user.id)}
                      className="rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-500/20"
                    >
                      {t('delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-12 text-center text-[var(--glass-text-secondary)]">
            {t('noUsers')}
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      <GlassModalShell
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title={t('createUser')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('username')}
            </label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
              placeholder={t('usernamePlaceholder')}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('password')}
            </label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
              placeholder={t('passwordPlaceholder')}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('role')}
            </label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="glass-select-base w-full cursor-pointer appearance-none px-3 py-2.5 pr-8 text-sm"
            >
              <option value="user">{t('roleUser')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('initialBalance')}
            </label>
            <input
              type="number"
              step="0.01"
              value={newUser.initialBalance}
              onChange={(e) => setNewUser({ ...newUser, initialBalance: parseFloat(e.target.value) || 0 })}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDisabled"
              checked={newUser.isDisabled}
              onChange={(e) => setNewUser({ ...newUser, isDisabled: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]"
            />
            <label htmlFor="isDisabled" className="text-sm text-[var(--glass-text-primary)]">
              {t('disabled')}
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <GlassButton
            onClick={() => setShowCreateDialog(false)}
            variant="secondary"
            disabled={actionLoading}
          >
            {tc('cancel')}
          </GlassButton>
          <GlassButton
            onClick={handleCreateUser}
            variant="primary"
            disabled={actionLoading}
          >
            {actionLoading ? tc('loading') : t('createUser')}
          </GlassButton>
        </div>
      </GlassModalShell>

      {/* Edit User Dialog */}
      <GlassModalShell
        open={showEditDialog}
        onClose={() => {
          setShowEditDialog(false)
          setEditingUser(null)
        }}
        title={t('editUser')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('username')}
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
              placeholder={t('usernamePlaceholder')}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('password')}
            </label>
            <input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
              placeholder={t('passwordOptional')}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('role')}
            </label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              className="glass-select-base w-full cursor-pointer appearance-none px-3 py-2.5 pr-8 text-sm"
            >
              <option value="user">{t('roleUser')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('balance')}
            </label>
            <input
              type="number"
              step="0.01"
              value={editForm.balance}
              onChange={(e) => setEditForm({ ...editForm, balance: parseFloat(e.target.value) || 0 })}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="editIsDisabled"
              checked={editForm.isDisabled}
              onChange={(e) => setEditForm({ ...editForm, isDisabled: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]"
            />
            <label htmlFor="editIsDisabled" className="text-sm text-[var(--glass-text-primary)]">
              {t('disabled')}
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <GlassButton
            onClick={() => {
              setShowEditDialog(false)
              setEditingUser(null)
            }}
            variant="secondary"
            disabled={actionLoading}
          >
            {tc('cancel')}
          </GlassButton>
          <GlassButton
            onClick={handleSaveEdit}
            variant="primary"
            disabled={actionLoading}
          >
            {actionLoading ? tc('loading') : t('saveChanges')}
          </GlassButton>
        </div>
      </GlassModalShell>

      {/* Confirm Delete Dialog */}
      <GlassModalShell
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title={t('confirmDeleteTitle')}
        description={t('confirmDeleteDescription')}
        size="sm"
      >
        <div className="mt-4 flex justify-end gap-2">
          <GlassButton
            onClick={() => setConfirmDeleteId(null)}
            variant="secondary"
          >
            {tc('cancel')}
          </GlassButton>
          <GlassButton
            onClick={() => confirmDeleteId && handleDeleteUser(confirmDeleteId)}
            variant="danger"
          >
            {t('delete')}
          </GlassButton>
        </div>
      </GlassModalShell>
    </div>
  )
}
