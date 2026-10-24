import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { useMe } from '../lib/me'
import type { AdminUser } from '../lib/types'
import { Avatar } from './Avatar'
import { CopyIcon, KebabIcon, KeyIcon, SearchIcon, ShieldIcon, XIcon } from './icons'
import { Menu } from './Menu'
import { Sheet } from './Sheet'

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** "Sat 26 Oct, 14:05": when a reset link stops working. */
function until(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  return d.toLocaleString(intlTag(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

interface Props {
  /** A line for the board's toast. */
  onNotice: (text: string) => void
  onClose: () => void
}

/**
 * Everyone with an account, for an admin: who is an admin (and who is one by
 * the server's KARPUL_ADMINS, which only the server can change), making
 * someone an admin or not, and a one-time password reset link for whoever
 * forgot theirs. Karpul sends no email, so the link is shown here once for the
 * admin to pass on, and copied to the clipboard.
 */
export function PeopleAdmin({ onNotice, onClose }: Props) {
  const t = useT()
  const me = useMe()
  const [people, setPeople] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [link, setLink] = useState<{ userId: number; url: string; expires: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong), [])

  useEffect(() => {
    let live = true
    api
      .users()
      .then((us) => live && setPeople(us))
      .catch((e) => live && fail(e))
    return () => {
      live = false
    }
  }, [fail])

  async function toggleAdmin(u: AdminUser) {
    setBusyId(u.id)
    setError(null)
    try {
      const updated = await api.setAdmin(u.id, !u.is_admin)
      setPeople((ps) => ps?.map((p) => (p.id === u.id ? updated : p)) ?? null)
      onNotice(updated.is_admin ? messages().toasts.madeAdmin(u.display_name) : messages().toasts.removedAdmin(u.display_name))
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the link is on screen to select by hand */
    }
  }

  async function makeLink(u: AdminUser) {
    setBusyId(u.id)
    setError(null)
    setCopied(false)
    try {
      const { path, expires_at } = await api.resetLink(u.id)
      const url = new URL(path, window.location.origin).href
      setLink({ userId: u.id, url, expires: expires_at })
      void copy(url)
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  const q = fold(query.trim())
  const shown = (people ?? []).filter((p) => !q || fold(`${p.display_name} ${p.username} ${p.email ?? ''}`).includes(q))

  return (
    <Sheet id="people-title" title={t.people.title} onClose={onClose}>
      <p className="hint">{t.people.hint}</p>
      {people && people.length > 6 && (
        <label className="input-icon search">
          <SearchIcon size={16} />
          <input type="search" placeholder={t.people.search} aria-label={t.people.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="icon-btn icon-btn-sm input-clear" aria-label={t.common.close} onClick={() => setQuery('')}>
              <XIcon size={16} />
            </button>
          )}
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {people === null && !error && <p className="hint">{t.common.loading}</p>}
      {people && <p className="section-meta people-count">{t.people.count(people.length)}</p>}

      <ul className="admin-list">
        {shown.map((u) => {
          const self = u.id === me.id
          return (
            <li key={u.id} className="admin-row">
              <Avatar name={u.display_name} size="sm" />
              <span className="admin-row-text">
                <strong>
                  {u.display_name}
                  {self && <span className="tag">{t.people.you}</span>}
                  {u.is_admin && (
                    <span className="tag tag-green tag-icon" title={u.admin_by_config ? t.people.adminByConfigHint : undefined}>
                      <ShieldIcon size={12} /> {u.admin_by_config ? t.people.adminByConfig : t.people.admin}
                    </span>
                  )}
                </strong>
                <span>
                  @{u.username}
                  {u.email && ` · ${u.email}`}
                </span>
              </span>
              <Menu
                trigger={<KebabIcon />}
                label={t.people.optionsFor(u.display_name)}
                items={[
                  {
                    label: u.is_admin ? t.people.removeAdmin : t.people.makeAdmin,
                    icon: <ShieldIcon size={18} />,
                    onSelect: () => void toggleAdmin(u),
                    // An admin by the server's setting stays one; the server says so too.
                    disabled: busyId === u.id || u.admin_by_config,
                  },
                  {
                    label: t.people.resetLink,
                    icon: <KeyIcon size={18} />,
                    onSelect: () => void makeLink(u),
                    disabled: busyId === u.id,
                  },
                ]}
              />
              {link?.userId === u.id && (
                <div className="admin-editor reset-link">
                  <span className="field-label">{t.people.resetLinkFor(u.display_name)}</span>
                  <div className="feed-row">
                    <KeyIcon size={18} />
                    <code className="feed-url">{link.url}</code>
                    <button type="button" className="btn btn-soft" onClick={() => void copy(link.url)}>
                      <CopyIcon size={16} /> {copied ? t.toasts.linkCopied : t.common.copy}
                    </button>
                  </div>
                  <p className="hint hint-tight">{t.people.resetLinkHint(until(link.expires))}</p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
