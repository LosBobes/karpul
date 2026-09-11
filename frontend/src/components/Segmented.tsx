import type { CSSProperties } from 'react'

/**
 * The white pill that marks the chosen segment of a `.segmented` control and
 * slides to the next one when the choice changes. It is one element behind
 * the buttons, positioned by two custom properties: how many segments there
 * are and which one is on. The buttons keep their own `seg-on` for colour.
 */
export function SegThumb({ count, index }: { count: number; index: number }) {
  return <span className="seg-thumb" aria-hidden="true" style={{ '--seg-n': count, '--seg-i': index } as CSSProperties} />
}
