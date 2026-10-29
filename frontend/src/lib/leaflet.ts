import type * as Leaflet from 'leaflet'

export type L = typeof Leaflet

let loading: Promise<L> | null = null

/**
 * Leaflet is fetched the first time a map is drawn, never with the board: most
 * people open a ride far more often than its map, and the library and its
 * stylesheet are a bundle of their own.
 */
export function loadLeaflet(): Promise<L> {
  loading ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
    .then(([mod]) => (mod as unknown as { default?: L }).default ?? (mod as unknown as L))
    .catch((e) => {
      loading = null
      throw e
    })
  return loading
}
