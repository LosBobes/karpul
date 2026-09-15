import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { setSession } from '../lib/auth'
import { messages, useT } from '../lib/i18n'
import { slideClass, useSlideDir } from '../lib/motion'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { SegThumb } from './Segmented'

type Mode = 'in' | 'up'
const MODES: Mode[] = ['in', 'up']

/**
 * The door. Nothing of the board is drawn until somebody is signed in, so this
 * is the whole screen: sign in with a username (or the email) and a password,
 * or register, which signs the new account in straight away.
 *
 * The two tabs slide the way the other switched views do (lib/motion.ts), and
 * the language switch sits at the foot because a newcomer meets this screen
 * before the menu, exactly as they used to meet the name sheet.
 */
export function AuthGate() {
  const t = useT()
  const [mode, setMode] = useState<Mode>('in')
  const [login, setLogin] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dir = useSlideDir(mode, (m) => MODES.indexOf(m as Mode))

  const ready =
    mode === 'in'
      ? login.trim().length > 0 && password.length > 0
      : [username, email, firstName, lastName].every((v) => v.trim().length > 0) && password.length > 0

  function pick(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const session =
        mode === 'in'
          ? await api.login(login.trim(), password)
          : await api.register({
              username: username.trim(),
              email: email.trim(),
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              password,
            })
      // The board is behind this: App re-renders the moment the store changes.
      setSession(session)
    } catch (err) {
      const m = messages()
      setError(err instanceof ApiError ? m.apiError(err.message) : m.common.somethingWrong)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card card">
        <h1 className="auth-title">
          <Logo /> Karpul
        </h1>
        <p className="auth-tagline">{t.auth.tagline}</p>

        <div className="segmented" role="tablist" aria-label={t.auth.signIn}>
          <SegThumb count={MODES.length} index={MODES.indexOf(mode)} />
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === mode}
              className={m === mode ? 'seg seg-on' : 'seg'}
              onClick={() => pick(m)}
            >
              {m === 'in' ? t.auth.signInTab : t.auth.signUpTab}
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div key={mode} className={['stack', slideClass(dir)].filter(Boolean).join(' ')}>
            {mode === 'in' ? (
              <label className="field">
                <span className="field-label">{t.auth.login}</span>
                <input
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={200}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </label>
            ) : (
              <>
                <div className="grid-2">
                  <label className="field">
                    <span className="field-label">{t.auth.firstName}</span>
                    <input
                      autoFocus
                      autoComplete="given-name"
                      maxLength={40}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">{t.auth.lastName}</span>
                    <input
                      autoComplete="family-name"
                      maxLength={40}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </label>
                </div>
                <p className="hint">{t.auth.nameHint}</p>
                <label className="field">
                  <span className="field-label">{t.auth.username}</span>
                  <input
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={32}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <p className="hint">{t.auth.usernameHint}</p>
                <label className="field">
                  <span className="field-label">{t.auth.email}</span>
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
              </>
            )}

            <label className="field">
              <span className="field-label">{t.auth.password}</span>
              <input
                type="password"
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                maxLength={200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {mode === 'up' && <p className="hint">{t.auth.passwordHint}</p>}
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={!ready || busy}>
            {busy ? t.auth.working : mode === 'in' ? t.auth.submitSignIn : t.auth.submitSignUp}
          </button>
          <button type="button" className="link auth-switch" onClick={() => pick(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? t.auth.switchToSignUp : t.auth.switchToSignIn}
          </button>
        </form>
      </div>

      <LanguageSwitch compact />
    </div>
  )
}
