declare module 'ali-oss' {
  // Minimal surface used by src/lib/storage/providers/oss.ts
  type OssPutOptions = {
    mime?: string
    headers?: Record<string, string>
  }
  type OssDeleteMultiOptions = { quiet?: boolean }
  type OssGetResult = { content: Buffer; res?: { status: number; headers: Record<string, string> } }
  type OssDeleteMultiResult = { deleted?: Array<{ key: string } | string> }
  type OssSignatureUrlOptions = {
    expires?: number
    method?: string
    'Content-Type'?: string
    process?: string
    headers?: Record<string, string>
    subResource?: Record<string, string>
    response?: Record<string, string>
  }

  class OSS {
    constructor(options: {
      region: string
      accessKeyId: string
      accessKeySecret: string
      bucket: string
      endpoint?: string
      internal?: boolean
      cname?: boolean
      secure?: boolean
      timeout?: string | number
      [key: string]: unknown
    })
    put(name: string, file: string | Buffer, options?: OssPutOptions): Promise<unknown>
    get(name: string, options?: unknown): Promise<OssGetResult>
    getStream(name: string, options?: unknown): Promise<{ stream: NodeJS.ReadableStream }>
    delete(name: string, options?: unknown): Promise<unknown>
    deleteMulti(names: string[], options?: OssDeleteMultiOptions): Promise<OssDeleteMultiResult>
    signatureUrl(name: string, options?: OssSignatureUrlOptions): string
  }
  export default OSS
}
