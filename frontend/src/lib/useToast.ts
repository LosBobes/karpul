import { useCallback, useEffect, useState } from 'react'

export interface Toast {
  kind: 'error' | 'ok'
  text: string
}

/**
 * The board's one toast: a line of ink that comes and goes (App.tsx renders
 * it, and an always-mounted live region reads it out). An error stays longer
 * than a confirmation.
 */
export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), toast.kind === 'ok' ? 2500 : 6000)
    return () => clearTimeout(id)
  }, [toast])
  const notice = useCallback((text: string) => setToast({ kind: 'ok', text }), [])
  const failure = useCallback((text: string) => setToast({ kind: 'error', text }), [])
  return { toast, setToast, notice, failure }
}
