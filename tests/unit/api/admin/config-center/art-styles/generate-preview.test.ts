import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { ArtStyle } from '@prisma/client'

// Mock dependencies
vi.mock('@/lib/admin/auth', () => ({
  requireAdminAuth: vi.fn().mockResolvedValue({ user: { id: 'test-admin-id' } }),
}))

vi.mock('@/lib/api-errors', async () => {
  const actual = await vi.importActual('@/lib/api-errors')
  return {
    ...actual,
    apiHandler: (handler: (request: NextRequest, context: { params: Promise<{ styleId: string }> }) => Promise<Response>) => handler,
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artStyle: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/generator-api', () => ({
  generateImage: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: vi.fn().mockReturnValue('test-key.png'),
  uploadObject: vi.fn().mockResolvedValue('test-key.png'),
  getSignedUrl: vi.fn((key: string) => `/api/storage/sign?key=${key}`),
  downloadAndUploadImage: vi.fn().mockImplementation(async (_url: string, key: string) => key),
  toFetchableUrl: vi.fn((url: string) => url),
}))

import { prisma } from '@/lib/prisma'
import { generateImage } from '@/lib/generator-api'

// Create a simple test helper to test the core logic
function createMockRequest(body: object, url = 'http://localhost/api/admin/config-center/art-styles/test-style-id/generate-preview'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function createMockArtStyle(overrides: Partial<ArtStyle> = {}): ArtStyle {
  return {
    id: 'test-style-id',
    name: 'Test Style',
    scope: 'system',
    previewMediaId: null,
    previewImageUrl: null,
    ownerUserId: null,
    description: null,
    prompt: '',
    enabled: true,
    sortOrder: 0,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('admin/config-center/art-styles/[styleId]/generate-preview API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear module cache before each test
    vi.resetModules()
  })

  describe('Art Style Validation', () => {
    it('should return 404 when art style does not exist', async () => {
      vi.mocked(prisma.artStyle.findUnique).mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/admin/config-center/art-styles/[styleId]/generate-preview/route')

      const request = createMockRequest({ model: 'test-model' })
      const context = { params: Promise.resolve({ styleId: 'non-existent-id' }) }

      const response = await POST(request, context)
      expect(response.status).toBe(404)

      const data = await response.json() as { error?: string }
      expect(data.error).toBe('画风不存在')
    })

    it('should proceed when art style exists', async () => {
      vi.mocked(prisma.artStyle.findUnique).mockResolvedValueOnce(createMockArtStyle())
      vi.mocked(generateImage).mockResolvedValueOnce({
        success: true,
        imageUrl: 'https://example.com/preview.png',
      })
      vi.mocked(prisma.artStyle.update).mockResolvedValueOnce(createMockArtStyle({
        previewImageUrl: '/api/storage/sign?key=test-key.png',
      }))

      const { POST } = await import('@/app/api/admin/config-center/art-styles/[styleId]/generate-preview/route')

      const request = createMockRequest({ model: 'test-model' })
      const context = { params: Promise.resolve({ styleId: 'test-style-id' }) }

      const response = await POST(request, context)
      expect(response.ok).toBe(true)
    })
  })

  describe('Preview Image Generation', () => {
    it('should generate preview image URL via storage signed link and pass model through', async () => {
      vi.mocked(prisma.artStyle.findUnique).mockResolvedValueOnce(createMockArtStyle({ prompt: 'cinematic style' }))
      vi.mocked(generateImage).mockResolvedValueOnce({
        success: true,
        imageUrl: 'https://example.com/preview.png',
      })
      vi.mocked(prisma.artStyle.update).mockResolvedValueOnce(createMockArtStyle({
        previewImageUrl: '/api/storage/sign?key=test-key.png',
        updatedByUserId: 'test-admin-id',
      }))

      const { POST } = await import('@/app/api/admin/config-center/art-styles/[styleId]/generate-preview/route')

      const request = createMockRequest({ model: 'test-model' })
      const context = { params: Promise.resolve({ styleId: 'test-style-id' }) }

      const response = await POST(request, context)
      const data = await response.json() as { previewImageUrl?: string; model?: string }

      expect(response.ok).toBe(true)
      expect(data.previewImageUrl).toBe('/api/storage/sign?key=test-key.png')
      expect(data.model).toBe('test-model')
      expect(generateImage).toHaveBeenCalledWith(
        'test-admin-id',
        'test-model',
        'cinematic style',
        expect.objectContaining({ outputFormat: 'png' }),
      )
    })

    it('should update database with generated previewImageUrl', async () => {
      vi.mocked(prisma.artStyle.findUnique).mockResolvedValueOnce(createMockArtStyle())
      vi.mocked(generateImage).mockResolvedValueOnce({
        success: true,
        imageUrl: 'https://example.com/preview.png',
      })
      vi.mocked(prisma.artStyle.update).mockResolvedValueOnce(createMockArtStyle({
        previewImageUrl: '/api/storage/sign?key=test-key.png',
        updatedByUserId: 'test-admin-id',
      }))

      const { POST } = await import('@/app/api/admin/config-center/art-styles/[styleId]/generate-preview/route')

      const request = createMockRequest({ model: 'test-model' })
      const context = { params: Promise.resolve({ styleId: 'test-style-id' }) }

      await POST(request, context)

      expect(prisma.artStyle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-style-id' },
          data: expect.objectContaining({
            previewImageUrl: expect.stringContaining('/api/storage/sign'),
            updatedByUserId: 'test-admin-id',
          }),
        }),
      )
    })

    it('should reject the request with INVALID_PARAMS when model is not provided', async () => {
      vi.mocked(prisma.artStyle.findUnique).mockResolvedValueOnce(createMockArtStyle())

      const { POST } = await import('@/app/api/admin/config-center/art-styles/[styleId]/generate-preview/route')

      const request = createMockRequest({})
      const context = { params: Promise.resolve({ styleId: 'test-style-id' }) }

      await expect(POST(request, context)).rejects.toThrow('请选择图片生成模型')
      expect(generateImage).not.toHaveBeenCalled()
    })
  })
})
