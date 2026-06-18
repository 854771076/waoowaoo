import { redirect } from 'next/navigation'
import { requireAdminServerSide } from '@/lib/admin/auth'

export default async function ConfigCenterPage() {
  await requireAdminServerSide()
  redirect('/admin/config-center/prompts')
}
