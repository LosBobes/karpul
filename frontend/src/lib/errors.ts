import { ApiError } from './api'
import { messages } from './i18n'

/** An error as a toast line, in the app's language (server texts are English, see i18n). */
export function errMsg(e: unknown): string {
  const t = messages()
  if (e instanceof ApiError) return t.apiError(e.message)
  if (e instanceof Error) return e.message
  return t.common.somethingWrong
}
