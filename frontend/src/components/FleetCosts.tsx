import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { carPowertrain } from '../lib/carModels'
import { addDays, fmtShortDate, parseISODate, todayISO, toISODate } from '../lib/dates'
import { fmtPrice, fmtRsd, litresCost } from '../lib/fleet'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import type { CarCost, CorporateCar, CostKind, FleetOverview, Fuel, FuelPrice } from '../lib/types'
import { DatePicker } from './DatePicker'
import { PlusIcon, PumpIcon, TrashIcon } from './icons'
import { SegThumb } from './Segmented'
import { Select } from './Select'

interface Props {
  cars: CorporateCar[]
  onNotice: (text: string) => void
}

const KINDS: CostKind[] = ['fuel', 'charging', 'toll', 'parking', 'wash', 'service', 'other']
const WINDOWS = [30, 90, 365] as const
const errText = (e: unknown) => messages().apiError(e instanceof Error ? e.message : String(e))

/**
 * The fleet manager's money tab of *Shared cars*: the official fuel price
 * (Serbia caps it every Friday; the app ships with the ministry's figure and
 * an admin adds each new week's), what each car cost over a window with its
 * dinars a km from the odometer, the km nobody logged between rides, and the
 * costs themselves, entered from the receipts. Backend: routers/fleet.py.
 */
export function FleetCosts({ cars, onNotice }: Props) {
  const t = useT()
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(90)
  const [version, setVersion] = useState(0)
  const [costs, setCosts] = useState<CarCost[] | null>(null)
  const [overview, setOverview] = useState<FleetOverview | null>(null)
  const [prices, setPrices] = useState<FuelPrice[]>([])
  const [adding, setAdding] = useState(false)
  const [addingPrice, setAddingPrice] = useState(false)
  const to = todayISO()
  const from = toISODate(addDays(parseISODate(to), -(days - 1)))
  const byId = new Map(cars.map((c) => [c.id, c]))

  useEffect(() => {
    let live = true
    Promise.all([api.costs(from, to), api.fleetOverview(from, to), api.fuelPrices()])
      .then(([c, o, p]) => {
        if (!live) return
        setCosts(c)
        setOverview(o)
        setPrices(p)
      })
      .catch((e) => live && onNotice(errText(e)))
    return () => {
      live = false
    }
  }, [from, to, version, onNotice])

  const latest = prices[0] ?? null
  const reload = () => setVersion((v) => v + 1)

  async function remove(cost: CarCost) {
    try {
      await api.removeCost(cost.id)
      reload()
    } catch (e) {
      onNotice(errText(e))
    }
  }

  const n = (v: number) => v.toLocaleString(intlTag())

  return (
    <div className="fleet-costs">
      <section className="card fuel-card" aria-label={t.fleet.fuelPrice}>
        <h4 className="fleet-sub">
          <PumpIcon size={16} /> {t.fleet.fuelPrice}
        </h4>
        {latest ? (
          <>
            <p className="fuel-prices">
              <span>
                {t.fleet.diesel} <strong className="mono">{fmtPrice(latest.diesel)}</strong>
              </span>
              <span>
                {t.fleet.petrol} <strong className="mono">{fmtPrice(latest.petrol)}</strong>
              </span>
              <span className="hint-inline">{t.fleet.perLitre}</span>
            </p>
            <p className="hint hint-tight">
              {t.fleet.validFrom(fmtShortDate(latest.valid_from))}
              {latest.source && ` · ${latest.source}`}
            </p>
          </>
        ) : (
          <p className="hint hint-tight">{t.fleet.noPrice}</p>
        )}
        {addingPrice ? (
          <PriceForm
            last={latest}
            onCancel={() => setAddingPrice(false)}
            onSave={async (input) => {
              try {
                await api.addFuelPrice(input)
                setAddingPrice(false)
                reload()
              } catch (e) {
                onNotice(errText(e))
              }
            }}
          />
        ) : (
          <button type="button" className="add-row" onClick={() => setAddingPrice(true)}>
            <PlusIcon size={18} /> {t.fleet.newPrice}
          </button>
        )}
      </section>

      <div className="segmented admin-tabs" role="radiogroup" aria-label={t.fleet.window}>
        <SegThumb count={WINDOWS.length} index={WINDOWS.indexOf(days)} />
        {WINDOWS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'seg seg-on' : 'seg'} onClick={() => setDays(d)}>
            {t.usage.window(d)}
          </button>
        ))}
      </div>

      {overview && overview.cars.length > 0 && (
        <div className="log-scroll" tabIndex={0} aria-label={t.fleet.perCar}>
          <table className="log-table">
            <thead>
              <tr>
                <th scope="col" className="log-date">{t.fleet.col.car}</th>
                <th scope="col" className="log-num">{t.fleet.col.total}</th>
                <th scope="col" className="log-num">{t.fleet.col.km}</th>
                <th scope="col" className="log-num">{t.fleet.col.perKm}</th>
                <th scope="col" className="log-num">{t.fleet.col.unlogged}</th>
              </tr>
            </thead>
            <tbody>
              {overview.cars.map((c) => (
                <tr key={c.car_id}>
                  <th scope="row" className="log-date">
                    {c.car}
                    <span className="log-sub mono">{c.plate}</span>
                  </th>
                  <td className="log-num mono">{c.total ? fmtRsd(c.total) : ''}</td>
                  <td className="log-num mono">{c.km ? n(c.km) : ''}</td>
                  <td className="log-num mono">{c.per_km !== null ? fmtRsd(c.per_km) : ''}</td>
                  <td className={c.unlogged_km ? 'log-num mono log-gap' : 'log-num mono'}>{c.unlogged_km ? n(c.unlogged_km) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <CostForm
          cars={cars.filter((c) => c.active)}
          prices={latest}
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            try {
              await api.addCost(input)
              setAdding(false)
              onNotice(t.fleet.costAdded)
              reload()
            } catch (e) {
              onNotice(errText(e))
            }
          }}
        />
      ) : (
        <button type="button" className="add-row" onClick={() => setAdding(true)}>
          <PlusIcon size={18} /> {t.fleet.addCost}
        </button>
      )}

      {costs === null && <p className="hint">{t.common.loading}</p>}
      {costs?.length === 0 && <p className="hint">{t.fleet.noCosts}</p>}
      {costs && costs.length > 0 && (
        <ul className="admin-list">
          {costs.map((c) => (
            <li key={c.id} className="admin-row">
              <span className="admin-row-text">
                <strong>
                  {t.fleet.kind[c.kind]} · {fmtRsd(c.amount)}
                </strong>
                <span>
                  {fmtShortDate(c.day)} · {byId.get(c.car_id)?.name ?? '?'}
                  {c.litres != null && ` · ${n(c.litres)} l`}
                  {c.note && ` · ${c.note}`}
                </span>
              </span>
              <button type="button" className="icon-btn" aria-label={t.fleet.removeCost} title={t.fleet.removeCost} onClick={() => void remove(c)}>
                <TrashIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PriceForm({ last, onSave, onCancel }: { last: FuelPrice | null; onSave: (input: { valid_from: string; diesel: number; petrol: number; source: string }) => void; onCancel: () => void }) {
  const t = useT()
  const [day, setDay] = useState(todayISO())
  const [diesel, setDiesel] = useState(last ? String(last.diesel) : '')
  const [petrol, setPetrol] = useState(last ? String(last.petrol) : '')
  const [source, setSource] = useState('')
  const num = (v: string) => Number(v.replace(',', '.'))
  const ok = num(diesel) > 0 && num(petrol) > 0
  return (
    <div className="admin-editor">
      <div className="field">
        <span className="field-label">{t.fleet.from}</span>
        <DatePicker label={t.fleet.from} value={day} onChange={setDay} />
      </div>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">{t.fleet.diesel}</span>
          <input inputMode="decimal" value={diesel} onChange={(e) => setDiesel(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t.fleet.petrol}</span>
          <input inputMode="decimal" value={petrol} onChange={(e) => setPetrol(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">{t.fleet.source}</span>
        <input maxLength={200} value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => onSave({ valid_from: day, diesel: num(diesel), petrol: num(petrol), source: source.trim() })}>
          {t.common.save}
        </button>
      </div>
    </div>
  )
}

function CostForm({
  cars,
  prices,
  onSave,
  onCancel,
}: {
  cars: CorporateCar[]
  prices: FuelPrice | null
  onSave: (input: { car_id: number; day: string; kind: CostKind; amount: number; litres: number | null; note: string }) => void
  onCancel: () => void
}) {
  const t = useT()
  const [carId, setCarId] = useState<number | null>(cars[0]?.id ?? null)
  const [day, setDay] = useState(todayISO())
  const [kind, setKind] = useState<CostKind>('fuel')
  const [litres, setLitres] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const car = cars.find((c) => c.id === carId)
  const fuel: Fuel = car && carPowertrain(car.name) === 'diesel' ? 'diesel' : 'petrol'
  const num = (v: string) => Number(v.replace(',', '.'))
  // The receipt's amount, or what the litres come to at the official price.
  const suggested = kind === 'fuel' ? litresCost(num(litres), prices ? prices[fuel] : null) : null
  const total = amount !== '' ? num(amount) : suggested
  const ok = carId !== null && total !== null && total > 0

  return (
    <div className="admin-editor">
      <div className="grid-2">
        <div className="field">
          <span className="field-label">{t.fleet.col.car}</span>
          <Select<number> label={t.fleet.col.car} value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: c.name, hint: c.plate }))} />
        </div>
        <div className="field">
          <span className="field-label">{t.fleet.day}</span>
          <DatePicker label={t.fleet.day} value={day} onChange={setDay} />
        </div>
      </div>
      <div className="field">
        <span className="field-label">{t.fleet.what}</span>
        <Select<CostKind> label={t.fleet.what} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t.fleet.kind[k] }))} />
      </div>
      <div className="grid-2">
        {kind === 'fuel' && (
          <label className="field">
            <span className="field-label">{t.fleet.litres}</span>
            <input inputMode="decimal" value={litres} onChange={(e) => setLitres(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="field-label">{t.fleet.amount}</span>
          <input inputMode="decimal" placeholder={suggested !== null ? String(suggested) : ''} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>
      {suggested !== null && amount === '' && prices && <p className="hint hint-tight">{t.fleet.atOfficial(fuel === 'diesel' ? t.fleet.diesel : t.fleet.petrol, fmtPrice(prices[fuel]))}</p>}
      <label className="field">
        <span className="field-label">{t.fleet.note}</span>
        <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ok}
          onClick={() => ok && onSave({ car_id: carId!, day, kind, amount: total!, litres: kind === 'fuel' && litres ? num(litres) : null, note: note.trim() })}
        >
          {t.common.save}
        </button>
      </div>
    </div>
  )
}
