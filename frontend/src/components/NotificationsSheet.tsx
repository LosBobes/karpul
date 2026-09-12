import { useT } from '../lib/i18n'
import { usePush } from '../lib/push'
import { BellIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  userName: string
  onChanged: (on: boolean) => void
  onClose: () => void
}

/**
 * The push switch. What it can offer depends on the browser (Push API and a
 * service worker), the server (a VAPID key) and the person (a name and the
 * permission); `usePush` works that out and this sheet says it in words.
 */
export function NotificationsSheet({ userName, onChanged, onClose }: Props) {
  const t = useT()
  const { state, error, enable, disable } = usePush(userName)
  const canToggle = !!userName && (state === 'on' || state === 'off')

  const status =
    state === 'unsupported'
      ? t.notif.unsupported
      : state === 'unavailable'
        ? t.notif.unavailable
        : state === 'denied'
          ? t.notif.denied
          : !userName
            ? t.notif.nameFirst
            : state === 'on'
              ? t.notif.on
              : state === 'off'
                ? t.notif.off
                : t.common.loading

  return (
    <Sheet
      id="notif-title"
      title={t.notif.title}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={state === 'on' ? 'btn btn-soft btn-block' : 'btn btn-primary btn-block'}
          disabled={!canToggle}
          onClick={() =>
            void (state === 'on' ? disable() : enable()).then(() => {
              if (state === 'on') onChanged(false)
            })
          }
        >
          <BellIcon size={18} /> {state === 'on' ? t.notif.disable : t.notif.enable}
        </button>
      }
    >
      <p>{t.notif.body}</p>
      <div className={state === 'on' ? 'banner banner-ok' : 'banner'}>
        <BellIcon size={22} />
        <span>{status}</span>
      </div>
      {error && <p className="error">{error}</p>}
    </Sheet>
  )
}
