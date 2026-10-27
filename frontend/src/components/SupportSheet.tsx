import { useT } from '../lib/i18n'
import { mailHref, SUPPORT, telHref } from '../lib/support'
import { BugIcon, MailIcon, PhoneIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  onFeedback: () => void
  onClose: () => void
}

/**
 * Who to ask, by kind of trouble (the list is `SUPPORT` in lib/support.ts):
 * each with a call button where there is a number and a mail button. From the
 * drawer, and from the foot of the shared car guide for when a step there does
 * not work. The foot opens the bug and idea form.
 */
export function SupportSheet({ onFeedback, onClose }: Props) {
  const t = useT()
  return (
    <Sheet
      id="support-title"
      title={t.support.title}
      onClose={onClose}
      className="support"
      footer={
        <button type="button" className="btn btn-soft btn-block" onClick={onFeedback}>
          <BugIcon size={18} /> {t.feedback.title}
        </button>
      }
    >
      {SUPPORT.map((c) => (
        <section key={c.topic} className="support-card" aria-labelledby={`support-${c.topic}`}>
          <h3 id={`support-${c.topic}`} className="support-topic">
            {t.support.topics[c.topic].title}
          </h3>
          <p className="support-what">{t.support.topics[c.topic].body}</p>
          <div className="support-actions">
            {c.phone && (
              <a className="btn btn-primary btn-block support-link" href={telHref(c.phone)}>
                <PhoneIcon size={18} />
                <span className="support-link-text">
                  {t.support.call}
                  <span className="support-link-value">{c.phone}</span>
                </span>
              </a>
            )}
            <a className="btn btn-soft btn-block support-link" href={mailHref(c.email, 'Karpul')}>
              <MailIcon size={18} />
              <span className="support-link-text">
                {t.support.email}
                <span className="support-link-value">{c.email}</span>
              </span>
            </a>
          </div>
        </section>
      ))}
    </Sheet>
  )
}
