import { useEffect, useRef, useState } from 'react'
import { grabPassenger, type DropTarget, type PassengerDrag } from './dnd'

interface Handlers {
  /** The chip landed on a car. */
  onDropOnRide: (rideId: number, drag: PassengerDrag) => void
  /** The chip landed on the "You" tray: get out of the car it came from. */
  onDropOnTray: (drag: PassengerDrag) => void
}

/**
 * The passenger chip in flight (lib/dnd.ts): what is being dragged, what it
 * hovers over, and the drop. The drop goes through a ref, because the board
 * can change under a drag (live updates) and the handlers read the rides as
 * they are at drop time.
 */
export function usePassengerDrag({ onDropOnRide, onDropOnTray }: Handlers) {
  const [drag, setDrag] = useState<PassengerDrag | null>(null)
  const [dragOver, setDragOver] = useState<DropTarget | null>(null)

  const drop = (dragged: PassengerDrag, target: DropTarget) => {
    if (target.kind === 'tray') onDropOnTray(dragged)
    else onDropOnRide(target.rideId, dragged)
  }
  const dropRef = useRef(drop)
  useEffect(() => {
    dropRef.current = drop
  })

  const onGrab = (e: React.PointerEvent<HTMLElement>, d: PassengerDrag) =>
    grabPassenger(e, d, {
      onStart: setDrag,
      onOver: setDragOver,
      onEnd: (dropped, target) => {
        setDrag(null)
        setDragOver(null)
        if (target) dropRef.current(dropped, target)
      },
    })

  return { drag, dragOver, onGrab }
}
