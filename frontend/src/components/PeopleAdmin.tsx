import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { CLOCK } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { useMe } from '../lib/me'
import { loadPhotos, photoFor, usePhotos } from '../lib/photos'
import type { AdminUser, AdminUserPatch } from '../lib/types'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { CopyIcon, KebabIcon, KeyIcon, LogoutIcon, PencilIcon, SearchIcon, ShieldIcon, TrashIcon, XIcon } from './icons'
import { Select } from './Select'
import { Menu } from './Menu'
import { Sheet } from './Sheet'

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** "Sat 26 Oct, 14:05": when a reset link stops working. */
function until(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  return d.toLocaleString(intlTag(), { weekday: 'short', day: 'numeric', month: 'short', ...CLOCK })
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
 * admin to pass on, and copied to the clipboard. And deleting an account, behind
 * a confirmation.
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
  const [doomed, setDoomed] = useState<AdminUser | null>(null)
  const [leaving, setLeaving] = useState<AdminUser | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const photos = usePhotos()

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

  async function update(u: AdminUser, patch: AdminUserPatch, done: string) {
    setBusyId(u.id)
    setError(null)
    try {
      const updated = await api.updateUser(u.id, patch)
      setPeople((ps) => ps?.map((p) => (p.id === u.id ? updated : p)) ?? null)
      onNotice(done)
      setEditing(null)
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
      setLeaving(null)
    }
  }

  async function remove(u: AdminUser) {
    setBusyId(u.id)
    setError(null)
    try {
      await api.deleteUser(u.id)
      setPeople((ps) => ps?.filter((p) => p.id !== u.id) ?? null)
      setLink((l) => (l?.userId === u.id ? null : l))
      onNotice(messages().toasts.deletedAccount(u.display_name))
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
      setDoomed(null)
    }
  }

  async function takePhotoDown(u: AdminUser) {
    setBusyId(u.id)
    setError(null)
    try {
      await api.removePhoto(u.id)
      await loadPhotos()
      onNotice(messages().toasts.photoRemoved(u.display_name))
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
  const shown = (people ?? []).filter((p) => !q || fold(`${p.display_name} ${p.username} ${p.department}`).includes(q))
  const departments = [...new Set((people ?? []).map((p) => p.department).filter(Boolean))].sort()

  return (
    <Sheet id="people-title" title={t.people.title} onClose={onClose}>
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
            <li key={u.id} className={u.disabled ? 'admin-row admin-row-retired' : 'admin-row'}>
              <Avatar name={u.display_name} size="sm" />
              <span className="admin-row-text">
                <strong>
                  {u.display_name}
                  {self && <span className="tag">{t.people.you}</span>}
                  {u.is_admin && (
                    <span className="tag tag-green tag-icon" title={u.admin_by_config ? t.people.adminByConfigHint : undefined}>
                      <ShieldIcon size={12} /> {t.people.admin}
                    </span>
                  )}
                </strong>
                <span>
                  @{u.username}
                  {u.department && ` · ${u.department}`}
                </span>
                {(u.disabled || u.shared_per_week !== null) && (
                  <span className="people-tags">
                    {u.disabled && <span className="tag">{t.people.switchedOff}</span>}
                    {u.shared_per_week !== null && <span className="tag">{t.people.ownShare(u.shared_per_week)}</span>}
                  </span>
                )}
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
                    label: t.people.details,
                    icon: <PencilIcon size={18} />,
                    onSelect: () => setEditing(editing === u.id ? null : u.id),
                    disabled: busyId === u.id,
                  },
                  {
                    label: t.people.resetLink,
                    icon: <KeyIcon size={18} />,
                    onSelect: () => void makeLink(u),
                    disabled: busyId === u.id,
                  },
                  ...(photoFor(photos, u.display_name)
                    ? [
                        {
                          label: t.people.removePhoto,
                          icon: <XIcon size={18} />,
                          onSelect: () => void takePhotoDown(u),
                          disabled: busyId === u.id,
                        },
                      ]
                    : []),
                  {
                    label: u.disabled ? t.people.switchOn : t.people.switchOff,
                    icon: <LogoutIcon size={18} />,
                    onSelect: () => (u.disabled ? void update(u, { disabled: false }, messages().people.switchedOn(u.display_name)) : setLeaving(u)),
                    disabled: busyId === u.id || self || u.admin_by_config,
                  },
                  {
                    label: t.people.deleteAccount,
                    icon: <TrashIcon size={18} />,
                    onSelect: () => setDoomed(u),
                    danger: true,
                    // Not yourself, and not an admin the server's setting keeps one.
                    disabled: busyId === u.id || self || u.admin_by_config,
                  },
                ]}
              />
              {editing === u.id && (
                <PersonEditor
                  person={u}
                  departments={departments}
                  busy={busyId === u.id}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => void update(u, patch, messages().people.saved(u.display_name))}
                />
              )}
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
      {leaving && (
        <ConfirmDialog
          title={t.people.switchOffTitle(leaving.display_name)}
          body={t.people.switchOffBody}
          confirmLabel={t.people.switchOff}
          busy={busyId === leaving.id}
          onConfirm={() => void update(leaving, { disabled: true }, messages().people.switchedOffDone(leaving.display_name))}
          onCancel={() => setLeaving(null)}
        />
      )}
      {doomed && (
        <ConfirmDialog
          title={t.people.deleteTitle(doomed.display_name)}
          body={t.people.deleteBody}
          confirmLabel={t.people.deleteAccount}
          busy={busyId === doomed.id}
          onConfirm={() => void remove(doomed)}
          onCancel={() => setDoomed(null)}
        />
      )}
    </Sheet>
  )
}

/** An account's department and its own week of shared cars ('office': the office's share). */
function PersonEditor({
  person,
  departments,
  busy,
  onSave,
  onCancel,
}: {
  person: AdminUser
  departments: string[]
  busy: boolean
  onSave: (patch: AdminUserPatch) => void
  onCancel: () => void
}) {
  const t = useT()
  const [department, setDepartment] = useState(person.department)
  const [share, setShare] = useState<string>(person.shared_per_week === null ? 'office' : String(person.shared_per_week))
  const listId = `departments-${person.id}`
  return (
    <div className="admin-editor">
      <label className="field">
        <span className="field-label">{t.people.department}</span>
        <input list={listId} maxLength={60} placeholder={t.people.departmentPlaceholder} value={department} onChange={(e) => setDepartment(e.target.value)} />
        <datalist id={listId}>
          {departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      <div className="field">
        <span className="field-label">{t.people.share}</span>
        <Select<string>
          label={t.people.share}
          value={share}
          onChange={setShare}
          options={[{ value: 'office', label: t.people.officeShare }, ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: t.people.ownShare(n) }))]}
        />
      </div>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onSave({ department: department.trim(), shared_per_week: share === 'office' ? null : Number(share) })}
        >
          {busy ? t.common.saving : t.common.save}
        </button>
      </div>
    </div>
  )
}
