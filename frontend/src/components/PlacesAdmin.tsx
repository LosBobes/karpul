import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { messages, useT } from '../lib/i18n'
import type { KnownPlace } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { KebabIcon, PencilIcon, PinIcon, TrashIcon } from './icons'
import { MapPicker } from './MapPicker'
import { MapView } from './MapView'
import { Menu } from './Menu'
import { Sheet } from './Sheet'

interface Props {
  onNotice: (text: string) => void
  onClose: () => void
}

/**
 * The places Karpul knows (backend: app/geo.py, `/api/admin/places`): the
 * offices, where the shared cars are kept, and the places people pinned on
 * their rides, which are suggested to everyone. An admin puts an office where
 * it really is (the rides to it are pinned from there on), renames a learned
 * place or forgets one that should not be suggested, a colleague's front door
 * say. The rides already pinned keep their pins.
 */
export function PlacesAdmin({ onNotice, onClose }: Props) {
  const t = useT()
  const [places, setPlaces] = useState<KnownPlace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [moving, setMoving] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [doomed, setDoomed] = useState<KnownPlace | null>(null)

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong), [])

  useEffect(() => {
    let live = true
    api
      .knownPlaces()
      .then((list) => live && setPlaces(list))
      .catch((e) => live && fail(e))
    return () => {
      live = false
    }
  }, [fail])

  async function change(id: number, patch: Parameters<typeof api.updateKnownPlace>[1]) {
    setBusyId(id)
    setError(null)
    try {
      const saved = await api.updateKnownPlace(id, patch)
      setPlaces((ps) => ps?.map((p) => (p.id === id ? saved : p)) ?? null)
      onNotice(t.map.saved(saved.name))
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  async function forget(place: KnownPlace) {
    setBusyId(place.id)
    try {
      await api.deleteKnownPlace(place.id)
      setPlaces((ps) => ps?.filter((p) => p.id !== place.id) ?? null)
      setDoomed(null)
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  const kind = (k: KnownPlace['kind']) => (k === 'office' ? t.map.kindOffice : k === 'car_home' ? t.map.kindCarHome : t.map.kindLearned)

  return (
    <Sheet id="places-admin-title" className="places-admin" title={t.map.places} onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {places === null && !error && <p className="hint">{t.common.loading}</p>}
      {places && places.length === 0 && <p className="hint">{t.map.noPlaces}</p>}
      {places && places.length > 0 && (
        <MapView
          className="places-map"
          label={t.map.places}
          pins={places.map((p) => ({ point: { lat: p.lat, lng: p.lng }, label: p.name, kind: p.kind === 'learned' ? 'stop' : 'spot' }))}
          onPinClick={(i) => setMoving(places[i].id)}
        />
      )}
      <ul className="admin-list">
        {places?.map((p) => (
          <li key={p.id} className="admin-row">
            <span className="admin-car-icon" aria-hidden="true">
              <PinIcon size={16} />
            </span>
            {renaming?.id === p.id ? (
              <form
                className="pax-add admin-row-text"
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = renaming.name.trim()
                  setRenaming(null)
                  if (name && name !== p.name) void change(p.id, { name })
                }}
              >
                <input autoFocus aria-label={t.map.placeName} maxLength={120} value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} />
                <button type="submit" className="btn btn-primary">
                  {t.common.save}
                </button>
              </form>
            ) : (
              <span className="admin-row-text">
                <strong>{p.name}</strong>
                <span>
                  {kind(p.kind)}
                  {p.kind === 'learned' && <> · {t.map.uses(p.uses)}</>}
                </span>
              </span>
            )}
            <Menu
              trigger={<KebabIcon />}
              label={p.name}
              items={[
                { label: t.map.move, icon: <PinIcon size={18} />, onSelect: () => setMoving(p.id), disabled: busyId === p.id },
                { label: t.map.rename, icon: <PencilIcon size={18} />, onSelect: () => setRenaming({ id: p.id, name: p.name }), disabled: busyId === p.id },
                { label: t.map.forget, icon: <TrashIcon size={18} />, onSelect: () => setDoomed(p), danger: true, disabled: busyId === p.id },
              ]}
            />
            {moving === p.id && (
              <MapPicker
                initial={{ lat: p.lat, lng: p.lng }}
                onCancel={() => setMoving(null)}
                onPick={(point) => {
                  setMoving(null)
                  void change(p.id, { point })
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {doomed && (
        <ConfirmDialog
          title={`${t.map.forget}: ${doomed.name}`}
          body={t.map.forgetHint}
          confirmLabel={t.map.forget}
          busy={busyId === doomed.id}
          onConfirm={() => void forget(doomed)}
          onCancel={() => setDoomed(null)}
        />
      )}
    </Sheet>
  )
}
