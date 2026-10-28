import { describe, expect, it } from 'vitest'
import { cropZoom, currentPhotos, fitCrop, MAX_ZOOM, middleSquare, photoFor, setPhotos, zoomCrop } from './photos'

describe('photos', () => {
  it('finds a photo by name the way names are compared everywhere', () => {
    setPhotos([{ user_id: 1, name: 'Ana Petrović', url: '/api/avatars/abc' }])
    expect(photoFor(currentPhotos(), '  ana   petrović ')).toBe('/api/avatars/abc')
    expect(photoFor(currentPhotos(), 'Marko')).toBeNull()
    expect(photoFor(currentPhotos(), null)).toBeNull()
    setPhotos([])
    expect(photoFor(currentPhotos(), 'Ana Petrović')).toBeNull()
  })

  it('starts the crop on the middle square of the short side', () => {
    expect(middleSquare(400, 300)).toEqual({ x: 50, y: 0, side: 300 })
    expect(middleSquare(300, 500)).toEqual({ x: 0, y: 100, side: 300 })
  })

  it('keeps the crop inside the picture', () => {
    expect(fitCrop(400, 300, { x: -20, y: 40, side: 100 })).toEqual({ x: 0, y: 40, side: 100 })
    expect(fitCrop(400, 300, { x: 390, y: 290, side: 100 })).toEqual({ x: 300, y: 200, side: 100 })
    // Never wider than the short side, never further in than MAX_ZOOM.
    expect(fitCrop(400, 300, { x: 0, y: 0, side: 900 }).side).toBe(300)
    expect(fitCrop(400, 300, { x: 0, y: 0, side: 1 }).side).toBe(300 / MAX_ZOOM)
  })

  it('zooms around the middle of the crop and stops at the edges', () => {
    const c = zoomCrop(400, 300, middleSquare(400, 300), 2)
    expect(c).toEqual({ x: 125, y: 75, side: 150 })
    expect(cropZoom(400, 300, c)).toBe(2)
    // Zooming back out from a corner slides the square in rather than overhang.
    expect(zoomCrop(400, 300, { x: 250, y: 150, side: 150 }, 1)).toEqual({ x: 100, y: 0, side: 300 })
    expect(cropZoom(400, 300, zoomCrop(400, 300, c, 99))).toBe(MAX_ZOOM)
  })
})
