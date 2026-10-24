import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, isNetworkError, NETWORK_ERROR } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('a call that gets no answer', () => {
  it('fails with one sentence whatever the browser said', async () => {
    for (const said of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(said)))
      const e = await api.corporateCars().catch((err: unknown) => err)
      expect(isNetworkError(e)).toBe(true)
      expect((e as Error).message).toBe(NETWORK_ERROR)
    }
  })

  it('is not confused with an answer from the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Ride not found' }), { status: 404 })))
    const e = await api.ride(1).catch((err: unknown) => err)
    expect(isNetworkError(e)).toBe(false)
    expect((e as Error).message).toBe('Ride not found')
  })
})
