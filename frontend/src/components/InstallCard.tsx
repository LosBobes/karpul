import { useT } from '../lib/i18n'
import { promptInstall, setInstallDismissed, type InstallMode } from '../lib/install'
import { ShareIcon, PlusIcon, XIcon } from './icons'
import { Logo } from './Logo'

interface Props {
  mode: Exclude<InstallMode, null>
  /** A wide screen floats the card in the corner instead of above the board. */
  floating?: boolean
  onInstalled: () => void
}

/**
 * The first-visit offer to put Karpul on the home screen (lib/install.ts):
 * the browser's own install dialog behind one button where there is one, the
 * two taps through Safari's Share menu on an iPhone or iPad. Put away, it
 * stays away in this browser; *Install the app* in the drawer brings it back.
 */
export function InstallCard({ mode, floating, onInstalled }: Props) {
  const t = useT()
  const later = () => setInstallDismissed(true)
  const install = async () => {
    if (await promptInstall()) onInstalled()
  }
  return (
    <section className={floating ? 'card install-card install-card-float' : 'card install-card'} aria-labelledby="install-title">
      <div className="install-head">
        <Logo size={40} />
        <div className="install-text">
          <h2 id="install-title">{t.install.title}</h2>
          <p>{t.install.body}</p>
        </div>
        <button type="button" className="icon-btn install-close" aria-label={t.install.later} onClick={later}>
          <XIcon size={18} />
        </button>
      </div>
      {mode === 'ios' ? (
        <>
          <ol className="install-steps">
            <li>
              <span className="install-step-icon">
                <ShareIcon size={18} />
              </span>
              {t.install.iosShare}
            </li>
            <li>
              <span className="install-step-icon">
                <PlusIcon size={18} />
              </span>
              {t.install.iosAdd}
            </li>
          </ol>
          <div className="install-actions">
            <button type="button" className="btn" onClick={later}>
              {t.install.gotIt}
            </button>
          </div>
        </>
      ) : (
        <div className="install-actions">
          <button type="button" className="btn" onClick={later}>
            {t.install.later}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void install()}>
            {t.install.go}
          </button>
        </div>
      )}
    </section>
  )
}
