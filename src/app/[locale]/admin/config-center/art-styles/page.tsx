import { requireAdminServerSide } from '@/lib/admin/auth'
import Navbar from '@/components/Navbar'
import ConfigCenterTabs from '../components/ConfigCenterTabs'

// TODO: Task 2 - Implement ArtStyleLibraryPanel content
function ArtStyleLibraryPanel() {
  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold text-[var(--glass-text-primary)] mb-4">
        艺术风格配置
      </h2>
      <p className="text-[var(--glass-text-secondary)]">
        艺术风格配置页面开发中...
      </p>
    </div>
  )
}

export default async function ArtStylesPage() {
  await requireAdminServerSide()

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <ConfigCenterTabs />
        <ArtStyleLibraryPanel />
      </main>
    </div>
  )
}
