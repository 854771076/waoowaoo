'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { Session } from 'next-auth'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import UserManagementTable from './components/UserManagementTable'
import SystemConfigEditor from './components/SystemConfigEditor'
import { AppIcon } from '@/components/ui/icons'
import { GlassSurface } from '@/components/ui/primitives'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('admin')
  const tc = useTranslations('common')

  const [activeTab, setActiveTab] = useState<'users' | 'systemConfig'>('users')

  const sessionWithRole = session as Session | null

  useEffect(() => {
    if (status === 'loading') return
    if (!sessionWithRole || sessionWithRole.user?.role !== 'admin') {
      router.push({ pathname: '/' })
      return
    }
  }, [router, sessionWithRole, status])

  if (status === 'loading' || !sessionWithRole || sessionWithRole.user?.role !== 'admin') {
    return (
      <div className="glass-page flex min-h-screen items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h1>
          <p className="text-sm text-[var(--glass-text-secondary)]">{t('description')}</p>
        </div>

        <GlassSurface className="min-h-[calc(100vh-200px)]">
          {/* Tabs Navigation */}
          <div className="border-b border-[var(--glass-stroke-base)]">
            <div className="flex space-x-1 px-6">
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 px-4 py-3 -mb-px text-sm font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'border-b-2 border-[var(--glass-tone-info-fg)] text-[var(--glass-text-primary)] bg-[var(--glass-bg-muted)]/50'
                    : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-muted)]/30'
                }`}
              >
                <AppIcon name="userRoundCog" className="w-4 h-4" />
                {t('userManagement')}
              </button>
              <button
                onClick={() => setActiveTab('systemConfig')}
                className={`flex items-center gap-2 px-4 py-3 -mb-px text-sm font-medium transition-colors ${
                  activeTab === 'systemConfig'
                    ? 'border-b-2 border-[var(--glass-tone-info-fg)] text-[var(--glass-text-primary)] bg-[var(--glass-bg-muted)]/50'
                    : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-muted)]/30'
                }`}
              >
                <AppIcon name="settingsHex" className="w-4 h-4" />
                {t('globalApiConfig')}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'users' ? (
              <UserManagementTable />
            ) : (
              <SystemConfigEditor />
            )}
          </div>
        </GlassSurface>
      </main>
    </div>
  )
}
