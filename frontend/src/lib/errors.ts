import { ApiError } from './api'
import { messages } from './i18n'

/** An error as a toast line, in the app's language (server texts are English, see i18n). */
export function errMsg(e: unknown): string {
  const t = messages()
  if (e instanceof ApiError) return t.apiError(e.message)
  if (e instanceof Error) return e.message
  return t.common.somethingWrong
}

/**
 * Whether a failed ride is past the shared-car share, whose refusal names its own
 * way out (backend: services.LIMIT_WEEK / LIMIT_DAY / limit_stretch). A weekly
 * series puts the day that hit it at the end, "(2026-12-12)", so that may follow.
 */
export function asksApproval(e: unknown): boolean {
  return e instanceof ApiError && /An admin can approve (another|it)(?: \(\d{4}-\d{2}-\d{2}\))?$/.test(e.message)
}
