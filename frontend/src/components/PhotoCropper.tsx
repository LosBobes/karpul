import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useT } from '../lib/i18n'
import { cropZoom, fitCrop, MAX_ZOOM, middleSquare, zoomCrop, type Crop } from '../lib/photos'

/** The margin of picture shown dimmed round the crop, as a share of its side: context to aim by. */
const MARGIN = 0.14
const SPAN = 1 + 2 * MARGIN

interface Props {
  file: Blob
  busy: boolean
  /** The square the person settled on, in the picture's own (upright) pixels. */
  onDone: (crop: Crop) => void
  onCancel: () => void
  /** The browser could not read the file as a picture. */
  onUnreadable: () => void
}

/**
 * The picked picture before it goes up: the square outline is what is saved,
 * the circle inside it is how the avatar shows it, and the picture around them
 * is dimmed. Drag (or the arrow keys) moves it, the slider, a pinch, the wheel
 * or + / − zoom. Inline in the account sheet rather than a sheet of its own,
 * so there is no second overlay to close.
 */
export function PhotoCropper({ file, busy, onDone, onCancel, onUnreadable }: Props) {
  const t = useT()
  const [url, setUrl] = useState<string | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; side: number } | null>(null)

  useEffect(() => {
    // An object URL is an external resource: made here so the cleanup can revoke it.
    const u = URL.createObjectURL(file)
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  // A wheel listener has to be non-passive to keep the sheet from scrolling,
  // which React's onWheel cannot be.
  useEffect(() => {
    const el = stage.current
    if (!el || !size) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setCrop((c) => c && zoomCrop(size.w, size.h, c, cropZoom(size.w, size.h, c) * Math.exp(-e.deltaY * 0.002)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [size])

  /** Picture pixels per screen pixel on the stage. */
  function perPx(c: Crop): number {
    return (c.side * SPAN) / (stage.current?.clientWidth || 1)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    pinch.current = null
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !size || !crop) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)
    const all = [...pointers.current.values()]
    if (all.length >= 2) {
      const dist = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y)
      if (!pinch.current) pinch.current = { dist, side: crop.side }
      else if (dist > 0) {
        const { dist: d0, side: s0 } = pinch.current
        setCrop(zoomCrop(size.w, size.h, crop, (Math.min(size.w, size.h) / s0) * (dist / d0)))
      }
      return
    }
    const k = perPx(crop)
    setCrop(fitCrop(size.w, size.h, { ...crop, x: crop.x - (next.x - prev.x) * k, y: crop.y - (next.y - prev.y) * k }))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    pinch.current = null
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!size || !crop) return
    const step = crop.side * 0.05
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    let next: Crop | null = null
    if (move) next = fitCrop(size.w, size.h, { ...crop, x: crop.x + move[0], y: crop.y + move[1] })
    else if (e.key === '+' || e.key === '=') next = zoomCrop(size.w, size.h, crop, cropZoom(size.w, size.h, crop) * 1.1)
    else if (e.key === '-') next = zoomCrop(size.w, size.h, crop, cropZoom(size.w, size.h, crop) / 1.1)
    if (!next) return
    e.preventDefault()
    setCrop(next)
  }

  // The stage shows the crop plus MARGIN of its side on every edge.
  const view = crop && { x: crop.x - MARGIN * crop.side, y: crop.y - MARGIN * crop.side, side: crop.side * SPAN }
  const zoom = size && crop ? cropZoom(size.w, size.h, crop) : 1

  return (
    <div className="cropper">
      <div
        ref={stage}
        className="cropper-stage"
        tabIndex={0}
        role="group"
        aria-label={t.account.cropArea}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            className="cropper-img"
            style={
              size && view
                ? {
                    left: `${(-view.x / view.side) * 100}%`,
                    top: `${(-view.y / view.side) * 100}%`,
                    width: `${(size.w / view.side) * 100}%`,
                  }
                : { visibility: 'hidden' }
            }
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (!w || !h) return onUnreadable()
              setSize({ w, h })
              setCrop(middleSquare(w, h))
            }}
            onError={onUnreadable}
          />
        )}
        <div className="cropper-frame" style={{ inset: `${(MARGIN / SPAN) * 100}%` }} aria-hidden="true">
          <div className="cropper-circle" />
        </div>
      </div>

      <input
        type="range"
        className="cropper-zoom"
        aria-label={t.account.cropZoom}
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        disabled={!size}
        onChange={(e) => size && crop && setCrop(zoomCrop(size.w, size.h, crop, Number(e.target.value)))}
      />
      <p className="hint">{t.account.cropHint}</p>

      <div className="photo-row">
        <button type="button" className="btn btn-primary" disabled={busy || !crop} onClick={() => crop && onDone(crop)}>
          {busy ? t.account.photoSaving : t.account.usePhoto}
        </button>
        <button type="button" className="btn btn-soft" disabled={busy} onClick={onCancel}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}
