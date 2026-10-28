import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SlideSwitch } from './SlideSwitch'
import type { SlideDir } from '../lib/motion'

// React's act() needs this flag outside a test renderer.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mount: HTMLDivElement
let root: Root

const render = (id: string, dir: SlideDir) =>
  act(() => {
    root.render(createElement(SlideSwitch, { id, dir, children: createElement('p', null, id) }))
  })

const host = () => mount.firstElementChild as HTMLElement

beforeEach(() => {
  mount = document.createElement('div')
  document.body.appendChild(mount)
  root = createRoot(mount)
})
afterEach(() => {
  act(() => root.unmount())
  mount.remove()
})

describe('SlideSwitch', () => {
  it('lays a snapshot of the leaving content in the host and holds the entering content back', () => {
    render('a', null)
    expect(host().children).toHaveLength(1)
    expect(host().querySelector('[data-after]')).toBeNull()

    render('b', 'right')
    const children = Array.from(host().children) as HTMLElement[]
    expect(children).toHaveLength(2)
    const snap = children.find((el) => el.classList.contains('swap-leave'))!
    const entering = children.find((el) => el !== snap)!
    // The old content, as it was, going the way the new one is not coming from.
    expect(snap.textContent).toBe('a')
    expect(snap.classList.contains('swap-leave-left')).toBe(true)
    expect(snap.getAttribute('aria-hidden')).toBe('true')
    expect(snap.hasAttribute('inert')).toBe(true)
    // The new content, stepping in from the right once the snapshot is gone.
    expect(entering.textContent).toBe('b')
    expect(entering.classList.contains('swap-right')).toBe(true)
    expect(entering.hasAttribute('data-after')).toBe(true)
  })

  it('does not hand the mark on to the next snapshot', () => {
    render('a', null)
    render('b', 'right')
    host().querySelector('.swap-leave')!.dispatchEvent(new Event('animationend'))
    render('c', 'right')
    const snap = host().querySelector('.swap-leave')!
    expect(snap.textContent).toBe('b')
    expect(snap.hasAttribute('data-after')).toBe(false)
    expect(host().querySelectorAll('[data-after]')).toHaveLength(1)
  })

  it('swaps on the spot with no direction', () => {
    render('a', null)
    render('b', null)
    expect(host().children).toHaveLength(1)
    expect(host().textContent).toBe('b')
    expect(host().querySelector('[data-after]')).toBeNull()
  })

  it('drops the snapshot when its exit ends', () => {
    render('a', null)
    render('b', 'left')
    const snap = host().querySelector('.swap-leave')!
    expect(snap.classList.contains('swap-leave-right')).toBe(true)
    snap.dispatchEvent(new Event('animationend'))
    expect(host().querySelector('.swap-leave')).toBeNull()
    expect(host().children).toHaveLength(1)
  })
})
