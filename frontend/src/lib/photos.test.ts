import { describe, expect, it } from 'vitest'
import { currentPhotos, photoFor, setPhotos } from './photos'

describe('photos', () => {
  it('finds a photo by name the way names are compared everywhere', () => {
    setPhotos([{ user_id: 1, name: 'Ana Petrović', url: '/api/avatars/abc' }])
    expect(photoFor(currentPhotos(), '  ana   petrović ')).toBe('/api/avatars/abc')
    expect(photoFor(currentPhotos(), 'Marko')).toBeNull()
    expect(photoFor(currentPhotos(), null)).toBeNull()
    setPhotos([])
    expect(photoFor(currentPhotos(), 'Ana Petrović')).toBeNull()
  })
})
