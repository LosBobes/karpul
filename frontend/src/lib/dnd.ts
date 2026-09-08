/** Native HTML5 drag-and-drop helpers for moving a passenger between cars. */

export const PASSENGER_MIME = 'application/x-karpul-passenger'

export interface PassengerDrag {
  name: string
  /** Ride the passenger is currently booked on, if any. */
  fromRideId: number | null
  bookingId: number | null
}

export function setPassengerDrag(e: React.DragEvent, data: PassengerDrag) {
  e.dataTransfer.setData(PASSENGER_MIME, JSON.stringify(data))
  e.dataTransfer.setData('text/plain', data.name)
  e.dataTransfer.effectAllowed = 'move'
}

export function isPassengerDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(PASSENGER_MIME)
}

export function readPassengerDrag(e: React.DragEvent): PassengerDrag | null {
  const raw = e.dataTransfer.getData(PASSENGER_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PassengerDrag
  } catch {
    return null
  }
}
