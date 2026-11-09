/**
 * The first-login tour (components/Tour.tsx): three cards over a dimmed
 * screen, each opening a ringed hole round the control it is about, shown
 * once to a new account in a browser. *Take the tour* in the drawer's Help
 * group shows it again.
 */

export const TOUR_STEPS = ['find', 'offer', 'cars'] as const
export type TourStep = (typeof TOUR_STEPS)[number]

/** An account this new (in days) is offered the tour; older ones know the app. */
export const TOUR_NEW_DAYS = 14

/** The element each step opens its hole round, on a phone and on a wide screen. */
const TARGETS: Record<TourStep, [phone: string, wide: string]> = {
  find: ['.tabbar', '.topbar-center'],
  offer: ['.fab', '.toolbar-add'],
  cars: ['.topbar-menu', '[data-tour="sharedCars"]'],
}

export function tourTarget(step: TourStep, wide: boolean): string {
  return TARGETS[step][wide ? 1 : 0]
}

/** Is an account made at `createdAt` (ISO) new enough for the tour? */
export function newAccount(createdAt: string, now = new Date()): boolean {
  const made = Date.parse(createdAt)
  if (Number.isNaN(made)) return false
  return now.getTime() - made < TOUR_NEW_DAYS * 86_400_000
}

const key = (userId: number) => `karpul.tourDone.${userId}`

export function tourDone(userId: number): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    // No storage: never nag on every visit.
    return true
  }
}

export function setTourDone(userId: number, done: boolean): void {
  try {
    if (done) localStorage.setItem(key(userId), '1')
    else localStorage.removeItem(key(userId))
  } catch {
    /* private mode */
  }
}
