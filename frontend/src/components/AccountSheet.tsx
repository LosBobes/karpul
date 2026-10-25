import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { clearSession, setUser, type AuthUser } from '../lib/auth'
import { intlTag } from '../lib/locale'
import { messages, useT } from '../lib/i18n'
import { forgetPushHere } from '../lib/push'
import type { ProfilePatch } from '../lib/types'
import { Avatar } from './Avatar'
import { Sheet } from './Sheet'

/** "June 2026": the month someone joined is as precise as this needs to be. */
function joined(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(intlTag(), { month: 'long', year: 'numeric' })
}

interface Props {
  user: AuthUser
  /** The name changed: the board has to be reloaded under the new one. */
  onRenamed: () => void
  onSaved: () => void
  /** A line for the board's toast ("2 browsers signed out."). */
  onNotice: (text: string) => void
  onClose: () => void
}

/**
 * Your account: who you are on the board, and the things you can change about
 * it (the mobile number and the email are optional; emptying one removes it). A new name is carried onto every ride you drive or sit in by the
 * server (`services.rename_person`), so this is also how a misspelt surname
 * gets fixed without losing your history.
 */
export function AccountSheet({ user, onRenamed, onSaved, onNotice, onClose }: Props) {
  const t = useT()
  const [firstName, setFirstName] = useState(user.first_name)
  const [lastName, setLastName] = useState(user.last_name)
  const [email, setEmail] = useState(user.email ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changed =
    firstName.trim() !== user.first_name ||
    lastName.trim() !== user.last_name ||
    email.trim() !== (user.email ?? '') ||
    phone.trim() !== (user.phone ?? '') ||
    newPassword.length > 0
  const ready = changed && firstName.trim() && lastName.trim() && (!newPassword || currentPassword)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || busy) return
    const patch: ProfilePatch = {}
    if (firstName.trim() !== user.first_name) patch.first_name = firstName.trim()
    if (lastName.trim() !== user.last_name) patch.last_name = lastName.trim()
    // An emptied box goes out as '', which removes it.
    if (email.trim() !== (user.email ?? '')) patch.email = email.trim()
    if (phone.trim() !== (user.phone ?? '')) patch.phone = phone.trim()
    if (newPassword) {
      patch.current_password = currentPassword
      patch.new_password = newPassword
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await api.updateMe(patch)
      setUser(updated)
      if (updated.display_name !== user.display_name) onRenamed()
      onSaved()
      onClose()
    } catch (err) {
      const m = messages()
      setError(err instanceof ApiError ? m.apiError(err.message) : m.common.somethingWrong)
      setBusy(false)
    }
  }

  async function signOutOthers() {
    setBusy(true)
    setError(null)
    try {
      const { ended } = await api.logoutOthers()
      onNotice(messages().account.othersSignedOut(ended))
    } catch (err) {
      const m = messages()
      setError(err instanceof ApiError ? m.apiError(err.message) : m.common.somethingWrong)
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    // Both are best effort: the token is dropped locally whatever the server says.
    await forgetPushHere().catch(() => undefined)
    try {
      await api.logout()
    } catch {
      /* offline, or the token was already gone */
    }
    clearSession()
  }

  return (
    <Sheet
      id="account-title"
      title={t.account.title}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={!ready || busy}>
          {busy ? t.common.saving : t.common.save}
        </button>
      }
    >
      <div className="account-me">
        <Avatar name={user.display_name} size="lg" />
        <span className="account-me-text">
          <span className="account-me-name">{user.display_name}</span>
          <span className="account-me-hint">{t.account.handle(user.username)}</span>
          <span className="account-me-hint">{t.account.memberSince(joined(user.created_at))}</span>
        </span>
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="field-label">{t.auth.firstName}</span>
          <input autoComplete="given-name" maxLength={40} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t.auth.lastName}</span>
          <input autoComplete="family-name" maxLength={40} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">
          {t.account.phoneSection} <span className="field-optional">{t.auth.optional}</span>
        </span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={40}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <p className="hint">{t.auth.phoneHint}</p>

      <label className="field">
        <span className="field-label">
          {t.account.emailSection} <span className="field-optional">{t.auth.optional}</span>
        </span>
        <input
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <p className="hint">{t.auth.emailHint}</p>

      <h3 className="account-section">{t.account.passwordSection}</h3>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">{t.account.currentPassword}</span>
          <input
            type="password"
            autoComplete="current-password"
            maxLength={200}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t.account.newPassword}</span>
          <input
            type="password"
            autoComplete="new-password"
            maxLength={200}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
      </div>
      <p className="hint">{t.account.passwordHint}</p>

      {error && <p className="error">{error}</p>}

      <h3 className="account-section">{t.account.otherBrowsers}</h3>
      <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={() => void signOutOthers()}>
        {t.account.signOutOthers}
      </button>

      <button type="button" className="btn btn-outline-danger btn-block" disabled={busy} onClick={() => void signOut()}>
        {t.account.signOut}
      </button>
    </Sheet>
  )
}
