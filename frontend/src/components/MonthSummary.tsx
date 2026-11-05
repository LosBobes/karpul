import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { byDepartment, fmtMonth, fmtPrice, fmtRsd, shiftMonth, summaryCsv, thisMonth } from '../lib/fleet'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { save } from '../lib/saveFile'
import type { FleetSettings, Fuel, MonthSummary } from '../lib/types'
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from './icons'
import { Select } from './Select'

/**
 * *All rides*' second tab, for the office manager: a month per person, by
 * department. Shared-car rides and the km driven in them, own-car rides and
 * their km, the rides along, and what the own-car km come to under the Serbian
 * allowance rule at the official fuel price (backend: fleet.month_summary).
 * The fuel it is reckoned in and the monthly cap are settings, changed here.
 */
export function MonthSummaryView() {
  const t = useT()
  const [month, setMonth] = useState(() => thisMonth())
  const [loaded, setLoaded] = useState<{ month: string; data: MonthSummary | null; error: string | null } | null>(null)
  const [settings, setSettings] = useState<FleetSettings | null>(null)
  const [version, setVersion] = useState(0)
  const current = loaded?.month === month ? loaded : null
  const data = current?.data ?? null

  useEffect(() => {
    let live = true
    api
      .monthSummary(month)
      .then((d) => live && setLoaded({ month, data: d, error: null }))
      .catch((e) => live && setLoaded({ month, data: null, error: messages().apiError(e instanceof Error ? e.message : String(e)) }))
    return () => {
      live = false
    }
  }, [month, version])

  useEffect(() => {
    api.fleetSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  async function change(patch: Partial<FleetSettings>) {
    if (!settings) return
    try {
      setSettings(await api.setFleetSettings({ ...settings, ...patch }))
      setVersion((v) => v + 1)
    } catch {
      /* the figures stay as they were */
    }
  }

  const n = (v: number) => v.toLocaleString(intlTag(), { maximumFractionDigits: 1 })
  const s = t.summary
  const later = month < thisMonth()

  return (
    <div className="month-summary">
      <div className="log-tools">
        <div className="month-pick" role="group" aria-label={s.month}>
          <button type="button" className="icon-btn" aria-label={s.prev} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeftIcon size={18} />
          </button>
          <strong className="month-name">{fmtMonth(month)}</strong>
          <button type="button" className="icon-btn" aria-label={s.next} disabled={!later} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
        {settings && (
          <>
            <div className="subfield">
              <span className="subfield-label">{s.fuel}</span>
              <Select<Fuel>
                label={s.fuel}
                value={settings.allowance_fuel}
                onChange={(fuel) => void change({ allowance_fuel: fuel })}
                options={[
                  { value: 'petrol', label: t.fleet.petrol },
                  { value: 'diesel', label: t.fleet.diesel },
                ]}
              />
            </div>
            <label className="subfield">
              <span className="subfield-label">{s.cap}</span>
              <input
                className="control mono"
                inputMode="numeric"
                defaultValue={settings.allowance_cap}
                key={settings.allowance_cap}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, ''))
                  if (Number.isFinite(v) && v !== settings.allowance_cap) void change({ allowance_cap: v })
                }}
              />
            </label>
          </>
        )}
      </div>

      {current?.error && <p className="error">{current.error}</p>}
      {!current && <p className="hint">{t.common.loading}</p>}

      {data && (
        <>
          <div className="log-summary">
            <p className="section-meta">
              {data.fuel_price !== null ? s.rule(Math.round(data.allowance_share * 100), data.fuel === 'diesel' ? t.fleet.diesel : t.fleet.petrol, fmtPrice(data.fuel_price)) : s.noPrice}
            </p>
            <button
              type="button"
              className="btn btn-soft"
              disabled={data.people.length === 0}
              onClick={() => save(summaryCsv(data), `karpul-month-${data.month}.csv`)}
            >
              <DownloadIcon size={16} /> {t.rideLog.download}
            </button>
          </div>
          {data.people.length === 0 && <p className="hint">{s.empty}</p>}
          {data.people.length > 0 && (
            <div className="log-scroll" tabIndex={0} aria-label={s.tab}>
              <table className="log-table summary-table">
                <thead>
                  <tr>
                    <th scope="col" className="log-date">{s.col.name}</th>
                    <th scope="col" className="log-num">{s.col.sharedRides}</th>
                    <th scope="col" className="log-num">{s.col.sharedKm}</th>
                    <th scope="col" className="log-num">{s.col.ownRides}</th>
                    <th scope="col" className="log-num">{s.col.ownKm}</th>
                    <th scope="col" className="log-num">{s.col.passengerRides}</th>
                    <th scope="col" className="log-num">{s.col.passengerKm}</th>
                    <th scope="col" className="log-num">{s.col.allowance}</th>
                  </tr>
                </thead>
                {byDepartment(data.people).map((g) => (
                  <tbody key={g.department || '-'}>
                    <tr className="summary-group">
                      <th scope="colgroup" colSpan={8}>{g.department || s.noDepartment}</th>
                    </tr>
                    {g.people.map((p) => (
                      <tr key={`${p.user_id ?? p.name}`}>
                        <th scope="row" className="log-date">{p.name}</th>
                        <td className="log-num mono">{p.shared_rides || ''}</td>
                        <td className="log-num mono">{p.shared_km ? n(p.shared_km) : ''}</td>
                        <td className="log-num mono">{p.own_rides || ''}</td>
                        <td className="log-num mono">{p.own_km ? n(p.own_km) : ''}</td>
                        <td className="log-num mono">{p.passenger_rides || ''}</td>
                        <td className="log-num mono">{p.passenger_km ? n(p.passenger_km) : ''}</td>
                        <td className="log-num mono">
                          {p.allowance ? fmtRsd(p.allowance) : ''}
                          {p.over_cap && <span className="log-sub log-gap">{s.overCap(fmtRsd(data.allowance_cap))}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
