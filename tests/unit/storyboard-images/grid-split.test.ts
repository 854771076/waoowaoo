import { describe, expect, it } from 'vitest'
import {
  buildGridVideoSourceImageContext,
  buildGridSplitImagesContext,
  computeAllGridCellCrops,
  computeGridCellCrop,
  cropGridImageBufferForVideo,
  extractGridSplitImages,
  extractGridVideoSourceImage,
  selectReusableGridSplitImages,
} from '@/lib/storyboard-images/grid-split'

describe('grid split helpers', () => {
  it('computes the first cell crop for a 3x3 grid', () => {
    expect(computeGridCellCrop({
      width: 900,
      height: 600,
      panelGridSize: 9,
      cellIndex: 1,
    })).toEqual({
      left: 0,
      top: 0,
      width: 300,
      height: 200,
    })
  })

  it('computes the last used cell crop with edge-safe dimensions', () => {
    expect(computeGridCellCrop({
      width: 1000,
      height: 701,
      panelGridSize: 4,
      cellIndex: 4,
    })).toEqual({
      left: 0,
      top: 350,
      width: 333,
      height: 351,
    })
  })

  it('stores and extracts cached grid video source image from context JSON', () => {
    const contextJson = buildGridVideoSourceImageContext(
      JSON.stringify({ source: 'pre_image_grid_prompt' }),
      {
        imageUrl: 'images/grid-video-source-panel-1.jpg',
        cellIndex: 1,
        panelGridSize: 9,
      },
    )

    expect(extractGridVideoSourceImage(contextJson)).toEqual({
      imageUrl: 'images/grid-video-source-panel-1.jpg',
      cellIndex: 1,
      panelGridSize: 9,
    })
  })

  it('computes all used cell crops in panel order', () => {
    expect(computeAllGridCellCrops({
      width: 900,
      height: 600,
      panelGridSize: 5,
    })).toEqual([
      { cellIndex: 1, left: 0, top: 0, width: 300, height: 300 },
      { cellIndex: 2, left: 300, top: 0, width: 300, height: 300 },
      { cellIndex: 3, left: 600, top: 0, width: 300, height: 300 },
      { cellIndex: 4, left: 0, top: 300, width: 300, height: 300 },
      { cellIndex: 5, left: 300, top: 300, width: 300, height: 300 },
    ])
  })

  it('stores and extracts all split grid images from context JSON', () => {
    const contextJson = buildGridSplitImagesContext(null, {
      panelGridSize: 4,
      sourceGridImageUrl: 'images/grid-original.jpg',
      images: [
        { imageUrl: 'images/grid-cell-1.jpg', cellIndex: 1, panelGridSize: 4 },
        { imageUrl: 'images/grid-cell-2.jpg', cellIndex: 2, panelGridSize: 4 },
      ],
    })

    expect(extractGridSplitImages(contextJson)).toEqual([
      { imageUrl: 'images/grid-cell-1.jpg', cellIndex: 1, panelGridSize: 4 },
      { imageUrl: 'images/grid-cell-2.jpg', cellIndex: 2, panelGridSize: 4 },
    ])
  })

  it('reuses cached split images only when source image, grid size, and cell count match', () => {
    const contextJson = buildGridSplitImagesContext(null, {
      panelGridSize: 2,
      sourceGridImageUrl: 'images/grid-original.jpg',
      images: [
        { imageUrl: 'images/grid-cell-1.jpg', cellIndex: 1, panelGridSize: 2 },
        { imageUrl: 'images/grid-cell-2.jpg', cellIndex: 2, panelGridSize: 2 },
      ],
    })

    expect(selectReusableGridSplitImages(contextJson, {
      panelGridSize: 2,
      sourceGridImageUrl: 'images/grid-original.jpg',
    })).toHaveLength(2)

    expect(selectReusableGridSplitImages(contextJson, {
      panelGridSize: 2,
      sourceGridImageUrl: 'images/new-grid-original.jpg',
    })).toEqual([])

    expect(selectReusableGridSplitImages(contextJson, {
      panelGridSize: 3,
      sourceGridImageUrl: 'images/grid-original.jpg',
    })).toEqual([])
  })

  it('upscales a cropped grid cell to the requested minimum width', async () => {
    const sharp = (await import('sharp')).default
    const source = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: '#ffffff',
      },
    }).jpeg().toBuffer()

    const cropped = await cropGridImageBufferForVideo({
      imageBuffer: source,
      panelGridSize: 9,
      cellIndex: 1,
      minOutputWidth: 256,
    })
    const metadata = await sharp(cropped).metadata()

    expect(metadata.width).toBe(256)
    expect(metadata.height).toBe(256)
  })
})
