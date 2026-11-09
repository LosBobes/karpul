import type { ReactNode } from 'react'

interface Props {
  first: ReactNode
  second: ReactNode
  showSecond: boolean
}

/**
 * Two labels in one grid cell, only one visible: a button holding it is as
 * wide as the longer one whichever shows, so Next turning into Done (the tour,
 * What's new) does not resize it or shift what is next to it. The hidden one
 * is out of the accessible name.
 */
export function StackedLabel({ first, second, showSecond }: Props) {
  return (
    <span className="one-cell one-cell-label">
      <span className={showSecond ? 'is-ghost' : undefined} aria-hidden={showSecond || undefined}>
        {first}
      </span>
      <span className={showSecond ? undefined : 'is-ghost'} aria-hidden={showSecond ? undefined : true}>
        {second}
      </span>
    </span>
  )
}
