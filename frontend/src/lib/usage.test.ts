import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSession } from './auth'
import { flush, pendingKeys, track } from './usage'

afterEach(() => {
  vi.unstubAllGlobals()
  setSession(null)
})

describe('track', () => {
  it('keeps only screen names', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    track('view.week')
    track('sheet.myRides')
    track('Ana Anić')
    track('sheet.')
    track('view.week/../x')
    expect(pendingKeys()).toEqual(['view.week', 'sheet.myRides'])
    flush()
  })

  it('sends the batch with the token, and nothing signed out', () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    track('view.day')
    flush()
    expect(fetch).not.toHaveBeenCalled()
    expect(pendingKeys()).toEqual([])

    setSession({ token: 'tok', expires_at: '', user: { id: 1, username: 'ana', display_name: 'Ana A' } as never })
    track('view.day')
    flush()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
