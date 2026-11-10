import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { carMail, carMailHref } from '../lib/carMail'
import { useT } from '../lib/i18n'
import type { Person } from '../lib/people'
import type { Ride } from '../lib/types'
import { MailIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  /** The shared-car rides just added (a ride, and its way back when there is one). */
  rides: Ride[]
  /** The first of a weekly series: the last week. */
  repeatUntil?: string | null
  onClose: () => void
}

/**
 * The step after taking a shared car (lib/carMail.ts): the mail to the office
 * with every admin in copy, shown as it will go out, and a button that opens
 * it in the driver's mail app. The admins are looked up when it opens.
 */
export function CarMailSheet({ rides, repeatUntil, onClose }: Props) {
  const t = useT()
  const [admins, setAdmins] = useState<Person[] | null>(null)
  useEffect(() => {
    let live = true
    api
      .people()
      .then((people) => live && setAdmins(people.filter((p) => p.is_admin)))
      .catch(() => live && setAdmins([]))
    return () => {
      live = false
    }
  }, [])
  const mail = admins && carMail(rides, admins, repeatUntil)
  return (
    <Sheet
      id="car-mail-title"
      title={t.carMail.title}
      onClose={onClose}
      className="car-mail"
      footer={
        <div className="car-mail-actions">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            {t.carMail.skip}
          </button>
          {mail ? (
            <a className="btn btn-primary" href={carMailHref(mail)} onClick={() => setTimeout(onClose, 0)}>
              <MailIcon size={18} /> {t.carMail.open}
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              <MailIcon size={18} /> {t.carMail.open}
            </button>
          )}
        </div>
      }
    >
      {!mail ? (
        <p className="car-mail-wait">{t.carMail.loading}</p>
      ) : (
        <div className="car-mail-preview">
          <dl className="car-mail-head">
            <dt>{t.carMail.to}</dt>
            <dd>{mail.to}</dd>
            {mail.cc.length > 0 && (
              <>
                <dt>{t.carMail.cc}</dt>
                <dd>{mail.cc.join(', ')}</dd>
              </>
            )}
          </dl>
          <p className="car-mail-subject">{mail.subject}</p>
          <pre className="car-mail-body">{mail.body}</pre>
        </div>
      )}
    </Sheet>
  )
}
