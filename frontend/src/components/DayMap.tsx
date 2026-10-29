import { initials } from '../lib/dates'
import { useT } from '../lib/i18n'
import { routeStops } from '../lib/maps'
import { avatarTone } from '../lib/tone'
import type { Point, Ride } from '../lib/types'
import { MapView, type MapPath, type MapPin } from './MapView'

interface Props {
  rides: Ride[]
  dayLabel: string
  onSelect: (rideId: number) => void
}

/**
 * The day's rides on one map, for whoever schedules the cars: each ride's
 * pinned route as a line in its driver's colour, the start as the driver's
 * initials and every pickup point a dot of the same colour, so who passes
 * whom reads at a glance. A tap on a pin opens that ride. Rides nobody pinned
 * are not on it; the timeline still has them.
 */
export function DayMap({ rides, dayLabel, onSelect }: Props) {
  const t = useT()
  const pins: MapPin[] = []
  const owners: number[] = []
  const paths: MapPath[] = []
  for (const ride of rides) {
    const tone = avatarTone(ride.driver_name)
    const stops = routeStops(ride).filter((s) => s.point)
    if (!stops.length) continue
    paths.push({ line: stops.map((s) => [s.point!.lat, s.point!.lng] as [number, number]), dashed: true, tone })
    for (const s of stops) {
      pins.push({
        point: s.point as Point,
        label: `${s.place} · ${ride.driver_name}`,
        kind: s.role === 'start' ? 'start' : s.role === 'end' ? 'end' : 'stop',
        text: s.role === 'start' ? initials(ride.driver_name) : '',
        tone,
      })
      owners.push(ride.id)
    }
  }
  if (!pins.length) {
    return (
      <div className="card empty-card empty-card-short">
        <strong>{t.map.dayEmpty}</strong>
      </div>
    )
  }
  return (
    <div className="card plan-board plan-board-map">
      <MapView className="day-map" label={t.map.dayLabel(dayLabel)} pins={pins} paths={paths} onPinClick={(i) => onSelect(owners[i])} />
    </div>
  )
}
