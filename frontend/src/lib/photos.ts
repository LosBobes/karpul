import { useSyncExternalStore } from 'react'
import { api, apiUrl } from './api'
import { normName } from './dates'
import type { Photo } from './types'

/**
 * Profile photos, by name. The board draws an avatar wherever a name is shown
 * (a driver, a passenger, a thread, the admin's log), and every one of those
 * places knows the name rather than the account, so the whole list is fetched
 * once (`GET /api/avatars`) and `Avatar` looks its name up here. Names are
 * unique per account (`User.name_key`), so a name is as good as an id; a
 * name with no account simply has no photo. An external store like the theme:
 * `useBoard` refetches it on every (re)connect and on `photos.changed`.
 */
let byName: ReadonlyMap<string, string> = new Map()
const listeners = new Set<() => void>()

export function setPhotos(photos: Photo[]): void {
  byName = new Map(photos.map((p) => [normName(p.name), apiUrl(p.url)]))
  listeners.forEach((fn) => fn())
}

let seq = 0

/** Fetch the list again; an answer overtaken by a newer request is dropped. */
export async function loadPhotos(): Promise<void> {
  const mine = ++seq
  const photos = await api.photos()
  if (mine === seq) setPhotos(photos)
}

export function photoFor(photos: ReadonlyMap<string, string>, name: string | null | undefined): string | null {
  return photos.get(normName(name)) ?? null
}

export function currentPhotos(): ReadonlyMap<string, string> {
  return byName
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Every photo, keyed by the normalised name. */
export function usePhotos(): ReadonlyMap<string, string> {
  return useSyncExternalStore(subscribe, currentPhotos, currentPhotos)
}

/** The address of this person's photo, or null for the initials. */
export function usePhoto(name: string | null | undefined): string | null {
  return photoFor(usePhotos(), name)
}

/** The side of the square a photo is stored at: twice the biggest avatar, for sharp screens. */
export const PHOTO_PX = 256

/** A square of the picture in its own pixels: what ends up as the photo. */
export interface Crop {
  x: number
  y: number
  side: number
}

/** How far in the cropper zooms: a quarter of the short side across. */
export const MAX_ZOOM = 4

/**
 * The square kept inside the picture: no wider than the short side, no
 * narrower than MAX_ZOOM allows, and moved back in from any edge it overhangs.
 */
export function fitCrop(width: number, height: number, c: Crop): Crop {
  const short = Math.min(width, height)
  const side = Math.min(short, Math.max(short / MAX_ZOOM, c.side))
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
  return { x: clamp(c.x, width - side), y: clamp(c.y, height - side), side }
}

/** The middle square, all of the short side: where the cropper starts. */
export function middleSquare(width: number, height: number): Crop {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, side }
}

/** The square at `zoom` (1 is the whole short side), around the same centre. */
export function zoomCrop(width: number, height: number, c: Crop, zoom: number): Crop {
  const side = Math.min(width, height) / Math.min(MAX_ZOOM, Math.max(1, zoom))
  const cx = c.x + c.side / 2
  const cy = c.y + c.side / 2
  return fitCrop(width, height, { x: cx - side / 2, y: cy - side / 2, side })
}

/** How far in a crop is: 1 for the whole short side, up to MAX_ZOOM. */
export function cropZoom(width: number, height: number, c: Crop): number {
  return Math.min(width, height) / c.side
}

/**
 * A picked file as the server takes it: the square `crop` of the picture (the
 * middle one when none is given), PHOTO_PX across, as WebP (JPEG where the
 * browser cannot write WebP, which older Safari answers by handing back a
 * PNG). Drawing through an `<img>` applies the camera's EXIF rotation, so a
 * phone portrait stays upright, and the crop is in those upright pixels.
 * Rejects when the file is not a picture the browser can read.
 */
export async function squarePhoto(file: Blob, crop?: Crop): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) throw new Error('empty image')
    const c = fitCrop(w, h, crop ?? middleSquare(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PHOTO_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, c.x, c.y, c.side, c.side, 0, 0, PHOTO_PX, PHOTO_PX)
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
    const webp = await encode('image/webp')
    if (webp && webp.type === 'image/webp') return webp
    const jpeg = await encode('image/jpeg')
    if (!jpeg) throw new Error('could not encode')
    return jpeg
  } finally {
    URL.revokeObjectURL(url)
  }
}
