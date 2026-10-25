import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtDayDate, fmtDayLabel, fmtShortDate, fmtTime, toISODate } from '../lib/dates'
import { useT, type Messages } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import type { AdminAction } from '../lib/types'
import { Avatar } from './Avatar'
import { ArrowRightIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  /** The ride a line is about, opened on the board (when it still exists). */
  onOpenRide: (rideId: number) => void
  onClose: () => void
}

const TIME_FIELDS = new Set(['departure_time', 'return_time'])

/** A value from the log in the app's words: clock times and days the locale's way. */
function value(t: Messages, field: string, v: string): string {
  if (v === '') return t.adminLog.none
  if (TIME_FIELDS.has(field)) return fmtTime(v)
  if (field === 'ride_date') return fmtShortDate(v)
  if (v === 'yes') return t.adminLog.yes
  if (v === 'no') return t.adminLog.no
  return v.replace(/\n/g, ', ')
}

/**
 * What the admins did, newest first, a heading per day (backend: app/audit.py,
 * GET /api/admin/log). Each line says who did what to whose ride, car or
 * account, then what changed, before and after. A line about a ride that
 * still exists opens it. Only admins get here: the drawer offers it to them
 * and the server refuses everyone else.
 */
export function AdminLog({ onOpenRide, onClose }: Props) {
  const t = useT()
  const [lines, setLines] = useState<AdminAction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    api
      .adminLog()
      .then((page) => {
        setLines(page)
        setMore(page.length >= 100)
      })
      .catch((e) => setError(t.apiError(e instanceof Error ? e.message : String(e))))
  }, [t])

  const older = async () => {
    if (!lines?.length) return
    setLoadingMore(true)
    try {
      const page = await api.adminLog(lines[lines.length - 1].id)
      setLines([...lines, ...page])
      setMore(page.length >= 100)
    } catch (e) {
      setError(t.apiError(e instanceof Error ? e.message : String(e)))
    } finally {
      setLoadingMore(false)
    }
  }

  // A heading per local day.
  const days: { date: string; lines: AdminAction[] }[] = []
  for (const line of lines ?? []) {
    const date = toISODate(new Date(line.at))
    const last = days[days.length - 1]
    if (last?.date === date) last.lines.push(line)
    else days.push({ date, lines: [line] })
  }

  return (
    <Sheet id="admin-log-title" title={t.adminLog.title} className="admin-log" onClose={onClose}>
      <p className="hint">{t.adminLog.intro}</p>
      {error && <p className="error">{error}</p>}
      {lines === null && !error && <p className="hint">{t.common.loading}</p>}
      {lines?.length === 0 && <div className="card empty-card empty-card-short">{t.adminLog.empty}</div>}
      {days.map((day) => (
        <section key={day.date} className="log-day">
          <h3 className="section-title">
            {fmtDayLabel(day.date)}
            <span className="section-count">{fmtDayDate(day.date)}</span>
          </h3>
          <ol className="log-list">
            {day.lines.map((line) => {
              const opens = line.ride_id !== null && line.action !== 'ride_removed'
              const body = (
                <>
                  <span className="log-when">
                    {new Date(line.at).toLocaleTimeString(intlTag(), { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="log-what">
                    <span className="log-line">{t.adminLog.line(line.action, line.admin_name, line.subject)}</span>
                    {line.ride_date && (
                      <span className="log-ride">
                        {fmtShortDate(line.ride_date)} · {line.ride_label}
                      </span>
                    )}
                    {line.changes.length > 0 && (
                      <span className="log-changes">
                        {line.changes.map(([field, before, after]) => (
                          <span key={field} className="log-change">
                            <span className="log-field">{t.adminLog.fields[field] ?? field}</span>
                            {before !== '' && <s>{value(t, field, before)}</s>}
                            {before !== '' && after !== '' && <ArrowRightIcon size={12} />}
                            {after !== '' ? <span>{value(t, field, after)}</span> : before === '' && <span>{t.adminLog.none}</span>}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </>
              )
              return (
                <li key={line.id} className="log-item">
                  <Avatar name={line.admin_name} size="sm" />
                  {opens ? (
                    <button type="button" className="log-body log-body-link" title={t.adminLog.openRide} onClick={() => onOpenRide(line.ride_id!)}>
                      {body}
                    </button>
                  ) : (
                    <div className="log-body">{body}</div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {more && (
        <button type="button" className="btn btn-soft btn-block" disabled={loadingMore} onClick={() => void older()}>
          {loadingMore ? t.common.loading : t.adminLog.older}
        </button>
      )}
    </Sheet>
  )
}
