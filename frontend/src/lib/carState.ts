import { CLOCK } from './dates'
import { messages } from './i18n'
import { intlTag } from './locale'
import type { Fact } from './types'

/**
 * Reading a shared car's state (backend: app/carstate.py) for the screen:
 * the status sheet (components/CarStatus.tsx) and the line under the car's
 * name on the driver card (components/CarDetail.tsx).
 */

/** "Tue 3 Mar, 17:40" for a report's time. */
export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(intlTag(), { weekday: 'short', day: 'numeric', month: 'short', ...CLOCK })
}

/** One fact as a line: the value (with "about" for a guess) and who noted it when. */
export function factText<T>(fact: Fact<T>, format: (v: T) => string): { value: string; sub: string | null; guessed: boolean } {
  const t = messages()
  if (fact.value === null) return { value: t.carState.unknown, sub: null, guessed: false }
  const text = format(fact.value)
  return {
    value: fact.estimated ? t.carState.about(text) : text,
    sub: fact.by && fact.at ? t.carState.noted(fact.by, fmtWhen(fact.at)) : null,
    guessed: fact.estimated,
  }
}
