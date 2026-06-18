import { requireAdminServerSide } from '@/lib/admin/auth'
import Navbar from '@/components/Navbar'
import ConfigCenterTabs from '../components/ConfigCenterTabs'
import ArtStyleLibraryPanel from '../components/ArtStyleLibraryPanel'

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
