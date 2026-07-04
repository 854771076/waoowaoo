/**
 * OSS smoke test: uploads a tiny buffer, signs a URL, GETs it back, deletes it.
 * Run: npx tsx scripts/test-oss.ts
 *
 * Reads OSS_* from .env directly; does NOT require STORAGE_TYPE=oss.
 */
import 'dotenv/config'
import { OssStorageProvider } from '@/lib/storage/providers/oss'

async function main() {
  const provider = new OssStorageProvider()
  const key = `smoke-test/oss-probe-${Date.now()}.txt`
  const body = Buffer.from(`vvicat oss smoke test @ ${new Date().toISOString()}`)

  console.log('[1/5] upload:', key)
  const up = await provider.uploadObject({ key, body, contentType: 'text/plain' })
  console.log('      ok key =', up.key)

  console.log('[2/5] signed URL (60s):')
  const signed = await provider.getSignedObjectUrl({ key, expiresInSeconds: 60 })
  console.log('     ', signed)

  console.log('[3/5] fetch via signed URL...')
  const resp = await fetch(signed)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GET failed ${resp.status}: ${text.slice(0, 300)}`)
  }
  const text = await resp.text()
  console.log('      ok body =', JSON.stringify(text))
  if (text !== body.toString()) {
    throw new Error('round-trip mismatch')
  }

  console.log('[4/5] getObjectBuffer...')
  const buf = await provider.getObjectBuffer(key)
  console.log('      ok length =', buf.length)

  console.log('[5/5] delete...')
  await provider.deleteObject(key)
  console.log('      ok')

  console.log('\nALL GOOD ✅')
}

main().catch((err) => {
  console.error('OSS SMOKE FAILED ❌')
  console.error(err)
  process.exit(1)
})
