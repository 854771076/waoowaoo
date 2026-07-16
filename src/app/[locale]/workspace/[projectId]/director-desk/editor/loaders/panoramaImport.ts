'use client'

import type { PanoramaProjectionMode } from '@/lib/director-desk/schema'

const PANORAMA_IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp)$/i
const PANORAMA_RATIO = 2
const PANORAMA_RATIO_TOLERANCE = 0.02
const PANORAMA_MIN_WIDTH = 2048
const PANORAMA_MAX_WIDTH = 4096

function isPanoramaRatio(width: number, height: number) {
  return Math.abs(width / height - PANORAMA_RATIO) <= PANORAMA_RATIO_TOLERANCE
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundToEven(value: number) {
  const rounded = Math.round(value)
  return rounded % 2 === 0 ? rounded : rounded + 1
}

function getCoverPlacement(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  }
}

function createPanoramaCanvasSize(sourceWidth: number, sourceHeight: number) {
  const desiredWidth = Math.max(sourceWidth, sourceHeight * PANORAMA_RATIO, PANORAMA_MIN_WIDTH)
  const width = roundToEven(clamp(desiredWidth, PANORAMA_MIN_WIDTH, PANORAMA_MAX_WIDTH))
  return { width, height: width / PANORAMA_RATIO }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('全景图读取失败'))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('全景图读取失败')))
    reader.readAsDataURL(file)
  })
}

async function readImage(file: File) {
  const dataUrl = await readFileAsDataUrl(file)
  return await new Promise<{ image: HTMLImageElement; dataUrl: string }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ image, dataUrl })
    image.onerror = () => reject(new Error('无法读取全景图尺寸，请重新选择图片'))
    image.src = dataUrl
  })
}

async function buildPanoramaAsset(file: File): Promise<{ url: string; projectionMode: PanoramaProjectionMode }> {
  const { image, dataUrl } = await readImage(file)
  if (isPanoramaRatio(image.width, image.height)) {
    return { url: dataUrl, projectionMode: 'equirectangular' }
  }

  const { width, height } = createPanoramaCanvasSize(image.width, image.height)
  const placement = getCoverPlacement(image.width, image.height, width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境无法生成全景图，请稍后重试')

  context.fillStyle = '#06080D'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, placement.x, placement.y, placement.width, placement.height)
  return { url: canvas.toDataURL('image/jpeg', 0.9), projectionMode: 'backdrop' }
}

export async function readPanoramaFile(file: File) {
  if (!PANORAMA_IMAGE_EXTENSION_RE.test(file.name)) {
    throw new Error('当前全景图仅支持 JPG / PNG / WEBP')
  }
  const result = await buildPanoramaAsset(file)
  return {
    fileName: file.name,
    name: file.name,
    projectionMode: result.projectionMode,
    url: result.url,
  }
}
