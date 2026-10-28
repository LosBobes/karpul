import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { messages, useT } from '../lib/i18n'
import { usePush } from '../lib/push'
import { setUpdateNotices, useUpdateNotices } from '../lib/pwa'
import { PUSH_CATEGORIES, REMIND_CHOICES, type PushCategory, type PushPreferences, type RemindBefore } from '../lib/types'
import { ApprovalIcon, BellIcon, BoltIcon, CarIcon, ClockIcon, HandIcon, MessageIcon, RouteIcon, UsersIcon } from './icons'
import { SegThumb } from './Segmented'
import { Sheet } from './Sheet'

interface Props {
  onChanged: (on: boolean) => void
  onClose: () => void
}

/** Each kind on its own tinted tile, the way the drawer reads by shape and colour. */
const KIND_LOOK: Record<PushCategory, { icon: ReactNode; tone: string }> = {
  seats: { icon: <UsersIcon size={18} />, tone: 'teal' },
  changes: { icon: <RouteIcon size={18} />, tone: 'blue' },
  reminders: { icon: <ClockIcon size={18} />, tone: 'amber' },
  messages: { icon: <MessageIcon size={18} />, tone: 'violet' },
  requests: { icon: <HandIcon size={18} />, tone: 'orange' },
  approvals: { icon: <ApprovalIcon size={18} />, tone: 'rose' },
  cars: { icon: <CarIcon size={18} />, tone: 'green' },
}

const errMsg = (e: unknown) => messages().apiError(e instanceof Error ? e.message : String(e))

/**
 * The notification centre. On top, the push switch for this browser: what it
 * can offer depends on the browser (Push API and a service worker), the server
 * (a VAPID key) and the person (the permission); `usePush` works that out and
 * the card says it in words. Under it, the kinds of push, each its own switch,
 * kept per account on the server (`/api/push/preferences`), so they hold in
 * every browser; under the reminders, how long before departure it comes
 * (15, 30 or 60 minutes, backend: app/reminders.py). Last, this device's "a
 * new version is ready" card, which is a local matter (`lib/pwa.ts`).
 */
export function NotificationsSheet({ onChanged, onClose }: Props) {
  const t = useT()
  const { state, error, enable, disable } = usePush()
  const canToggle = state === 'on' || state === 'off'
  const on = state === 'on'
  const updateNotices = useUpdateNotices()
  const [prefs, setPrefs] = useState<PushPreferences | null>(null)
  const [prefError, setPrefError] = useState<string | null>(null)
  const muted = prefs?.muted ?? null

  useEffect(() => {
    let live = true
    api
      .pushPreferences()
      .then((p) => live && setPrefs(p))
      .catch((e) => live && setPrefError(errMsg(e)))
    return () => {
      live = false
    }
  }, [])

  /** Save a change, keeping the one before should it fail. */
  const save = (next: PushPreferences) => {
    const before = prefs
    setPrefs(next)
    setPrefError(null)
    api.setPushPreferences(next).then(setPrefs, (e) => {
      setPrefs(before)
      setPrefError(errMsg(e))
    })
  }

  const toggleKind = (kind: PushCategory, wanted: boolean) => {
    if (prefs === null) return
    save({ ...prefs, muted: wanted ? prefs.muted.filter((k) => k !== kind) : [...prefs.muted, kind] })
  }
  const setLead = (minutes: RemindBefore) => prefs !== null && save({ ...prefs, remind_before: minutes })

  const status =
    state === 'unsupported'
      ? t.notif.unsupported
      : state === 'unavailable'
        ? t.notif.unavailable
        : state === 'denied'
          ? t.notif.denied
          : on
            ? t.notif.on
            : state === 'off'
              ? t.notif.off
              : t.common.loading

  const flip = () =>
    void (on ? disable() : enable()).then(() => {
      if (on) onChanged(false)
    })

  return (
    <Sheet id="notif-title" title={t.notif.title} onClose={onClose}>
      <div className={on ? 'notif-hero notif-hero-on' : 'notif-hero'}>
        <span className="notif-hero-mark" aria-hidden="true">
          <BellIcon size={24} />
        </span>
        <span className="notif-hero-text">
          <strong>{t.notif.push}</strong>
          <span>{status}</span>
        </span>
        <label className="notif-switch">
          <span className="sr-only">{on ? t.notif.disable : t.notif.enable}</span>
          <input type="checkbox" role="switch" checked={on} disabled={!canToggle} onChange={flip} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="notif-section" aria-labelledby="notif-kinds">
        <h3 id="notif-kinds" className="notif-section-title">
          {t.notif.kinds}
        </h3>
        <ul className={on ? 'notif-list' : 'notif-list notif-list-idle'}>
          {PUSH_CATEGORIES.map((kind) => {
            const [title, desc] = t.notif.category[kind]
            const look = KIND_LOOK[kind]
            return (
              <li key={kind}>
                <label className="notif-row">
                  <span className={`notif-row-mark drawer-tone-${look.tone}`} aria-hidden="true">
                    {look.icon}
                  </span>
                  <span className="notif-row-text">
                    <span className="notif-row-title">{title}</span>
                    <span className="notif-row-desc">{desc}</span>
                  </span>
                  <span className="notif-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={muted !== null && !muted.includes(kind)}
                      disabled={muted === null}
                      onChange={(e) => toggleKind(kind, e.target.checked)}
                    />
                  </span>
                </label>
                {kind === 'reminders' && prefs !== null && !prefs.muted.includes('reminders') && (
                  <div className="notif-lead">
                    <span className="notif-lead-label">{t.notif.lead}</span>
                    <div className="segmented segmented-sm" role="radiogroup" aria-label={t.notif.lead}>
                      <SegThumb count={REMIND_CHOICES.length} index={REMIND_CHOICES.indexOf(prefs.remind_before)} />
                      {REMIND_CHOICES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={prefs.remind_before === m}
                          className={prefs.remind_before === m ? 'seg seg-on' : 'seg'}
                          onClick={() => setLead(m)}
                        >
                          {t.notif.leadChoice(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {!on && state !== 'loading' && <p className="hint">{t.notif.kindsOff}</p>}
        {prefError && <p className="error">{prefError}</p>}
      </section>

      <section className="notif-section" aria-labelledby="notif-device">
        <h3 id="notif-device" className="notif-section-title">
          {t.notif.device}
        </h3>
        <ul className="notif-list">
          <li>
            <label className="notif-row">
              <span className="notif-row-mark notif-row-mark-bolt" aria-hidden="true">
                <BoltIcon size={18} />
              </span>
              <span className="notif-row-text">
                <span className="notif-row-title">{t.notif.updates}</span>
                <span className="notif-row-desc">{t.notif.updatesHint}</span>
              </span>
              <span className="notif-switch">
                <input type="checkbox" role="switch" checked={updateNotices} onChange={(e) => setUpdateNotices(e.target.checked)} />
              </span>
            </label>
          </li>
        </ul>
      </section>
    </Sheet>
  )
}
