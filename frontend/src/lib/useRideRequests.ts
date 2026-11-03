import { useCallback, useState } from 'react'
import { api } from './api'
import { errMsg } from './errors'
import { useT } from './i18n'
import { useKept } from './keep'
import type { RideRequest, RideRequestInput } from './types'

interface Deps {
  /** The board's busy wrapper (a request is busy under its negated id): toasts and reloads on failure. */
  withBusy: (id: number, fn: () => Promise<void>) => Promise<void>
  upsertRequest: (request: RideRequest) => void
  removeRequest: (id: number) => void
  notice: (text: string) => void
}

/**
 * "Ask for a ride" (components/RequestForm.tsx, backend: routers/requests.py):
 * the day the form is open on (kept across a reload, lib/keep.ts), its error
 * and its submit, and withdrawing your own request.
 */
export function useRideRequests({ withBusy, upsertRequest, removeRequest, notice }: Deps) {
  const t = useT()
  const [askDate, setAskDate] = useKept<string | null>('board.ask', null)
  const [askError, setAskError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const openAsk = (date: string) => {
    setAskError(null)
    setAskDate(date)
  }
  const closeAsk = useCallback(() => setAskDate(null), [setAskDate])

  async function onSubmitAsk(input: RideRequestInput) {
    setSubmitting(true)
    setAskError(null)
    try {
      upsertRequest(await api.createRequest(input))
      setAskDate(null)
      notice(t.toasts.requestAdded)
    } catch (e) {
      setAskError(errMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  const onWithdraw = (request: RideRequest) =>
    withBusy(-request.id, async () => {
      await api.deleteRequest(request.id)
      removeRequest(request.id)
      notice(t.toasts.requestWithdrawn)
    })

  return { askDate, askError, submitting, openAsk, closeAsk, onSubmitAsk, onWithdraw }
}
