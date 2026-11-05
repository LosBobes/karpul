import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { messages, useT } from '../lib/i18n'
import type { FleetSettings } from '../lib/types'
import { MinusIcon, PlusIcon } from './icons'

/**
 * The shared-car share as the admins set it (backend: fleet.DEFAULTS, read by
 * services.over_shared_car_share): rides a week and a day, and hours in a
 * row. Past it a ride needs an approval. A person's own week is set under
 * *People*. At the top of *Shared cars* → *Usage*, next to how the cars are used.
 */
export function ShareRules({ onNotice }: { onNotice: (text: string) => void }) {
  const t = useT()
  const [settings, setSettings] = useState<FleetSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.fleetSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  if (!settings) return null

  async function set(patch: Partial<FleetSettings>) {
    if (!settings) return
    setBusy(true)
    try {
      setSettings(await api.setFleetSettings({ ...settings, ...patch }))
      onNotice(t.fleet.rulesSaved)
    } catch (e) {
      onNotice(messages().apiError(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const stepper = (key: 'share_per_week' | 'share_per_day' | 'share_max_hours', label: string, min: number, max: number, step = 1) => (
    <div className="field">
      <span className="field-label" id={`rule-${key}`}>
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={`rule-${key}`}>
        <button type="button" aria-label={t.form.fewer} disabled={busy || settings[key] <= min} onClick={() => void set({ [key]: Math.max(min, settings[key] - step) })}>
          <MinusIcon />
        </button>
        <output>{settings[key]}</output>
        <button type="button" aria-label={t.form.more} disabled={busy || settings[key] >= max} onClick={() => void set({ [key]: Math.min(max, settings[key] + step) })}>
          <PlusIcon />
        </button>
      </div>
    </div>
  )

  return (
    <section className="card share-rules" aria-label={t.fleet.rules}>
      <h4 className="fleet-sub">{t.fleet.rules}</h4>
      <div className="grid-3">
        {stepper('share_per_week', t.fleet.perWeek, 1, 7)}
        {stepper('share_per_day', t.fleet.perDay, 1, 3)}
        {stepper('share_max_hours', t.fleet.maxHours, 4, 72, 4)}
      </div>
      <p className="hint hint-tight">{t.fleet.rulesHint}</p>
    </section>
  )
}
