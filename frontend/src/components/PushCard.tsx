import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { dismissPushHint, pushHintDismissed, usePush } from '../lib/push'
import { BellIcon, XIcon } from './icons'

interface Props {
  /** A wide screen floats the card in the corner instead of above the board. */
  floating?: boolean
  /** After the browser's question: true when notifications are now on. */
  onDone: (on: boolean) => void
}

/**
 * On a phone whose notifications are off (supported here, a key on the server,
 * not blocked, just never switched on), a card above the board with the switch
 * behind one button. Put away, it waits a month (`lib/push.ts`); the
 * Notifications sheet in the drawer always has the switch.
 */
export function PushCard({ floating, onDone }: Props) {
  const t = useT()
  const { state, enable } = usePush()
  const [hidden, setHidden] = useState(pushHintDismissed)
  const asked = useRef(false)

  useEffect(() => {
    if (!asked.current || state === 'loading' || state === 'off') return
    asked.current = false
    onDone(state === 'on')
  }, [state, onDone])

  if (hidden || state !== 'off') return null
  const later = () => {
    dismissPushHint()
    setHidden(true)
  }
  const go = () => {
    asked.current = true
    void enable()
  }
  return (
    <section className={floating ? 'card install-card install-card-float push-card' : 'card install-card push-card'} aria-labelledby="push-card-title">
      <div className="install-head">
        <span className="push-card-mark" aria-hidden="true">
          <BellIcon size={22} />
        </span>
        <div className="install-text">
          <h2 id="push-card-title">{t.pushCard.title}</h2>
          <p>{t.pushCard.body}</p>
        </div>
        <button type="button" className="icon-btn install-close" aria-label={t.pushCard.later} onClick={later}>
          <XIcon size={18} />
        </button>
      </div>
      <div className="install-actions">
        <button type="button" className="btn" onClick={later}>
          {t.pushCard.later}
        </button>
        <button type="button" className="btn btn-primary" onClick={go}>
          {t.pushCard.go}
        </button>
      </div>
    </section>
  )
}
