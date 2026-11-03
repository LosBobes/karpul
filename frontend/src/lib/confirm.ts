import type { ReactNode } from 'react'

/** A pending "are you sure?" — the confirm card owns the wording, the caller the action. */
export interface Confirm {
  title: string
  body: ReactNode
  label: string
  onConfirm: () => void
}
