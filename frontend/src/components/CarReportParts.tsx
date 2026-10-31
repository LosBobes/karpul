import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { addIssue, odoNudge, odoWheels, rangeKm, socAt, socHue, socStep } from '../lib/carReport'
import { useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { OFFICE_TRIPS } from '../lib/offices'
import { BoltIcon, DropIcon, InfoIcon, PlusIcon, RoadIcon, XIcon } from './icons'

/**
 * The parts of a car report, shared by the report window over Shared cars
 * (components/CarReportSheet.tsx) and "Car is back" on a ride's odometer
 * (components/Odometer.tsx): the odometer as a drum of rolling wheels, the
 * battery as a battery, the car clean or muddy as a picture, and what is
 * wrong. Put them under an element with `report-parts` (and `report-idle`
 * from `useIdle` in lib/useIdle.ts, for the fidgets).
 */

export type Cleanness = '' | 'clean' | 'dirty'
const CLEANNESS: Cleanness[] = ['clean', 'dirty', '']
const NUDGES = [10, 100]

const km = (n: number) => n.toLocaleString(intlTag())

/* --- Odometer -------------------------------------------------------------- */

/**
 * The reading as an odometer's drum: one wheel per digit that rolls to its
 * number. The wheels are a picture of a real input laid over them, so typing
 * works as anywhere else; with nothing typed they show `last` (what the car
 * likely reads), faded. The chips put a figure on it, each on top of what is
 * typed, else of `base` (the last real reading): `driven` first, in green,
 * when there is one (what the rides since add up to, or this ride's length),
 * then a trip between the offices and a round number.
 */
export function OdometerWheels({
  value,
  last,
  base,
  driven,
  chips = true,
  invalid = false,
  onChange,
}: {
  value: string
  last: number | null
  base: number | null
  driven: { km: number; label: string } | null
  /** Off where there is nothing to add to yet (the first reading of a ride). */
  chips?: boolean
  invalid?: boolean
  onChange: (v: string) => void
}) {
  const t = useT()
  const id = useId()
  const num = value === '' ? null : Number(value)
  const wheels = odoWheels(num ?? last)
  // The zeros in front of the first real digit are dimmed, like a worn drum.
  const lead = num === null ? wheels.length : Math.max(0, wheels.length - String(num).length)
  const add = (by: number) => onChange(String(odoNudge(num, base, by)))
  const roundTrip = OFFICE_TRIPS.reduce((sum, trip) => sum + trip.km, 0)
  return (
    <section className="report-part">
      <div className="report-part-head">
        <label htmlFor={id} className="report-part-title">
          <RoadIcon size={16} /> {t.carState.odometerField}
        </label>
        {value !== '' && (
          <button type="button" className="icon-btn icon-btn-sm" aria-label={t.carState.clearField(t.carState.odometer)} onClick={() => onChange('')}>
            <XIcon size={16} />
          </button>
        )}
      </div>
      <div className={['odo-drum', num === null && 'odo-drum-ghost', invalid && 'odo-drum-invalid'].filter(Boolean).join(' ')}>
        <div className="odo-wheels" aria-hidden="true">
          {wheels.map((d, i) => (
            <span key={wheels.length - i} className={i < lead ? 'odo-wheel odo-wheel-lead' : 'odo-wheel'}>
              <span className="odo-strip" style={{ transform: `translateY(${-d * 10}%)` }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          ))}
          <span className="odo-unit">km</span>
        </div>
        <input
          id={id}
          className="odo-drum-input"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={7}
          autoComplete="off"
          placeholder={last !== null ? String(last) : '0'}
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
        />
      </div>
      {base !== null && <span className="report-note">{t.carState.lastRead(t.carState.km(km(base)))}</span>}
      {chips && (
        <div className="report-chip-row report-chip-wrap">
          {driven && base !== null && (
            <button type="button" className="chip report-chip report-chip-main" onClick={() => onChange(String(base + driven.km))}>
              <PlusIcon size={12} /> {driven.label}
            </button>
          )}
          {OFFICE_TRIPS.map((trip, i) => (
            <button
              key={trip.from}
              type="button"
              className={!driven && i === 0 ? 'chip report-chip report-chip-main' : 'chip report-chip'}
              aria-label={t.carState.addTrip(km(trip.km), trip.from, trip.to)}
              onClick={() => add(trip.km)}
            >
              <PlusIcon size={12} /> {km(trip.km)} <small>{trip.from} → {trip.to}</small>
            </button>
          ))}
          <button type="button" className="chip report-chip" aria-label={t.carState.addKm(roundTrip)} onClick={() => add(roundTrip)}>
            <PlusIcon size={12} /> {km(roundTrip)} <small>{t.carState.thereAndBack}</small>
          </button>
          {NUDGES.map((n) => (
            <button key={n} type="button" className="chip report-chip" aria-label={t.carState.addKm(n)} onClick={() => add(n)}>
              <PlusIcon size={12} /> {km(n)}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* --- Battery --------------------------------------------------------------- */

/**
 * The charge as a battery: press or drag along it to fill it, arrow keys step
 * it (Page Up / Down by ten), or tap the figure in the middle and type it. Its colour slides from red when empty through
 * amber to green when full (`socHue`); the last known charge stays as a
 * faint tick.
 */
export function BatteryGauge({ value, last, electric, onChange }: { value: number | null; last: number | null; electric: boolean; onChange: (v: number | null) => void }) {
  const t = useT()
  const labelId = useId()
  const cell = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  // The figure being typed: its own text, so the field may stand empty for a moment.
  const [typed, setTyped] = useState<string | null>(null)

  function type(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 3)
    setTyped(digits)
    onChange(digits === '' ? null : Math.min(100, Number(digits)))
  }

  function at(e: PointerEvent<HTMLDivElement>) {
    const box = cell.current?.getBoundingClientRect()
    if (box) onChange(socAt(e.clientX, box.left, box.width))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key]
    if (by !== undefined) onChange(socStep(value, by))
    else if (e.key === 'Home') onChange(0)
    else if (e.key === 'End') onChange(100)
    else if (e.key === 'Delete' || e.key === 'Backspace') onChange(null)
    else return
    e.preventDefault()
  }

  return (
    <section className="report-part">
      <div className="report-part-head">
        <span className="report-part-title" id={labelId}>
          <BoltIcon size={16} /> {t.odo.soc}
        </span>
        {value !== null && (
          <button type="button" className="icon-btn icon-btn-sm" aria-label={t.carState.clearField(t.carState.battery)} onClick={() => onChange(null)}>
            <XIcon size={16} />
          </button>
        )}
      </div>
      <div
        className={['battery', value === null && 'battery-none', dragging && 'battery-dragging'].filter(Boolean).join(' ')}
        style={value === null ? undefined : ({ '--charge-hue': socHue(value) } as CSSProperties)}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? t.carState.notRead : t.carState.pct(value)}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          at(e)
        }}
        onPointerMove={(e) => dragging && at(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div className="battery-cell" ref={cell}>
          <span className="battery-fill" style={{ width: `${value ?? 0}%` }} />
          {last !== null && <span className="battery-last" style={{ left: `${last}%` }} title={t.carState.lastSoc(last)} />}
          <span className="battery-ticks" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="battery-read">
            {typed !== null ? (
              <span className="battery-typing" onPointerDown={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  className="battery-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  aria-label={t.carState.typeSoc}
                  value={typed}
                  onChange={(e) => type(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => setTyped(null)}
                />
                <small>%</small>
              </span>
            ) : (
              <button
                type="button"
                className="battery-figure"
                aria-label={t.carState.typeSoc}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={() => setTyped(value === null ? '' : String(value))}
              >
                {value === null ? (
                  <span className="battery-empty">{t.carState.notRead}</span>
                ) : (
                  <>
                    <strong>{value}</strong>
                    <small>%</small>
                  </>
                )}
              </button>
            )}
          </span>
        </div>
        <span className="battery-cap" aria-hidden="true" />
      </div>
      <div className="report-chips">
        {last !== null && <span className="report-note">{t.carState.lastSoc(last)}</span>}
        {electric && value !== null && (
          <span className="report-note report-note-strong" style={{ '--charge-hue': socHue(value) } as CSSProperties}>
            {t.carState.range(rangeKm(value))}
          </span>
        )}
      </div>
    </section>
  )
}

/* --- Clean or dirty --------------------------------------------------------- */

export function CleanPicker({ value, onChange }: { value: Cleanness; onChange: (v: Cleanness) => void }) {
  const t = useT()
  const labelId = useId()
  const label = { clean: t.odo.clean, dirty: t.odo.dirty, '': t.odo.notChecked }
  return (
    <section className="report-part">
      <div className="report-part-head">
        <span className="report-part-title" id={labelId}>
          <DropIcon size={16} /> {t.odo.cleanness}
        </span>
      </div>
      <div className="wash-pick" role="radiogroup" aria-labelledby={labelId}>
        {CLEANNESS.map((c) => (
          <button
            key={c || 'unknown'}
            type="button"
            role="radio"
            aria-checked={value === c}
            className={`wash-card wash-${c || 'unknown'}${value === c ? ' wash-card-on' : ''}`}
            onClick={() => onChange(c)}
          >
            <WashArt kind={c} />
            <span>{label[c]}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const BODY =
  'M8 38Q6.5 30.5 12 29.3L30 25.6Q40 15 54 14H76Q89 14.6 99 24.3L109 26Q116 27 116 33V37.5Q116 41 112.5 41H100A10 10 0 0 0 80 41H40A10 10 0 0 0 20 41H11Q8.3 41 8 38Z'

/**
 * A car side-on in three moods, each with a loop of its own going on all the
 * time: gleaming, with sparkles that twinkle and a shine across the paint;
 * caked in mud, with stink rising off it, a cloud of dust and two buzzing
 * flies; or not there at all, a dotted outline where the car should be with
 * question marks floating up out of it.
 */
function WashArt({ kind }: { kind: Cleanness }) {
  const id = useId()
  const u = (n: string) => `url(#${CSS.escape(id + n)})`
  const dirty = kind === 'dirty'
  return (
    <svg className="wash-art" viewBox="0 0 124 56" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}paint`} x1="0" y1="14" x2="0" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor={dirty ? '#d9d2c3' : '#ffffff'} />
          <stop offset=".6" stopColor={dirty ? '#c8bea9' : '#eef2f5'} />
          <stop offset="1" stopColor={dirty ? '#9e917a' : '#c5cdd5'} />
        </linearGradient>
        <linearGradient id={`${id}glass`} x1="36" y1="16" x2="96" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor={dirty ? '#7d7466' : '#5b6b7c'} />
          <stop offset="1" stopColor={dirty ? '#4a4338' : '#26303a'} />
        </linearGradient>
        <linearGradient id={`${id}shine`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}body`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <ellipse cx="62" cy="50" rx="56" ry="3" className="wash-shadow" />
      {dirty && (
        <g className="wash-dust">
          <circle cx="112" cy="44" r="5" />
          <circle cx="118" cy="40" r="3.5" />
          <circle cx="106" cy="47" r="3" />
        </g>
      )}
      {kind === '' ? (
        <g className="wash-car wash-missing">
          <path d={BODY} />
          <path d="M37 25.4Q44 17.6 54 17H63.5V25Z" />
          <path d="M67.5 17H76Q86 17.6 93.5 25H67.5Z" />
          <circle cx="30" cy="42" r="7.5" />
          <circle cx="90" cy="42" r="7.5" />
        </g>
      ) : (
      <g className="wash-car">
        <path d={BODY} fill={u('paint')} />
        <path d="M37 25.4Q44 17.6 54 17H63.5V25Z" fill={u('glass')} />
        <path d="M67.5 17H76Q86 17.6 93.5 25H67.5Z" fill={u('glass')} />
        <path d="M10 31.2 16 30V32L10.6 33.4Z" className="wash-lamp" />
        <path d="M110.5 28.4 115 29.2V31L110.8 30.4Z" fill="#e0475a" />
        <path d="M44 30H50M74 30H80" stroke="#8c97a2" strokeWidth="1" strokeLinecap="round" opacity=".7" />
        {kind === 'clean' && (
          <g clipPath={u('body')}>
            <rect className="wash-sweep" x="-30" y="10" width="22" height="34" fill={u('shine')} transform="skewX(-20)" />
          </g>
        )}
        {dirty && (
          <g clipPath={u('body')} className="wash-mud">
            <path d="M8 34Q20 31 30 35T52 33T76 36T100 33T118 35V42H8Z" />
            <ellipse cx="60" cy="24" rx="4" ry="2.4" />
            <ellipse cx="88" cy="28" rx="3" ry="1.8" />
            <ellipse cx="22" cy="31" rx="2.4" ry="1.5" />
            <circle cx="68" cy="31" r="1.4" />
            <circle cx="47" cy="22" r="1" />
            <path d="M40 18Q46 21 44 26" className="wash-smear" />
          </g>
        )}
        <Wheel cx={30} dirty={dirty} />
        <Wheel cx={90} dirty={dirty} />
      </g>
      )}
      {kind === 'clean' && (
        <g className="wash-sparkles">
          <Sparkle x={26} y={12} s={5} d={0} />
          <Sparkle x={100} y={14} s={4} d={0.6} />
          <Sparkle x={64} y={6} s={3.2} d={1.1} />
          <Sparkle x={116} y={24} s={2.6} d={1.6} />
        </g>
      )}
      {dirty && (
        <g className="wash-stink">
          <path d="M44 14C41 11 47 9 44 6S47 1 44 -2" />
          <path d="M62 12C59 9 65 7 62 4S65 -1 62 -4" style={{ animationDelay: '0.7s' }} />
          <path d="M80 14C77 11 83 9 80 6S83 1 80 -2" style={{ animationDelay: '1.4s' }} />
        </g>
      )}
      {dirty && (
        <g className="wash-flies">
          <Fly x={56} y={8} className="wash-fly wash-fly-a" />
          <Fly x={72} y={4} className="wash-fly wash-fly-b" />
        </g>
      )}
      {kind === '' && (
        <g className="wash-ask">
          <text className="wash-q" x="48" y="30" style={{ animationDelay: '0s' }}>
            ?
          </text>
          <text className="wash-q wash-q-big" x="62" y="30" style={{ animationDelay: '0.9s' }}>
            ?
          </text>
          <text className="wash-q" x="76" y="30" style={{ animationDelay: '1.8s' }}>
            ?
          </text>
        </g>
      )}
    </svg>
  )
}

/** A fly: a dark body and two pale wings that beat. */
function Fly({ x, y, className }: { x: number; y: number; className: string }) {
  return (
    <g className={className}>
      <ellipse className="wash-wing" cx={x - 1.2} cy={y - 1.4} rx="1.4" ry="0.8" style={{ transformOrigin: `${x}px ${y}px` }} />
      <ellipse className="wash-wing" cx={x + 1.2} cy={y - 1.4} rx="1.4" ry="0.8" style={{ transformOrigin: `${x}px ${y}px` }} />
      <ellipse cx={x} cy={y} rx="1.4" ry="1" className="wash-fly-body" />
    </g>
  )
}

function Wheel({ cx, dirty }: { cx: number; dirty: boolean }) {
  return (
    <g>
      <circle cx={cx} cy="42" r="8" fill="#20262d" />
      <circle cx={cx} cy="42" r="4.4" fill={dirty ? '#7a6d58' : '#9aa4ae'} />
      <circle cx={cx} cy="42" r="1.4" fill="#20262d" />
    </g>
  )
}

/** A four-pointed glint, twinkling a beat `d` seconds after the first. */
function Sparkle({ x, y, s, d }: { x: number; y: number; s: number; d: number }) {
  const w = s * 0.28
  return (
    <path
      className="wash-sparkle"
      style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y - s}Q${x + w} ${y - w} ${x + s} ${y}Q${x + w} ${y + w} ${x} ${y + s}Q${x - w} ${y + w} ${x - s} ${y}Q${x - w} ${y - w} ${x} ${y - s}Z`}
    />
  )
}

/* --- Anything wrong -------------------------------------------------------- */

export function IssuesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  const id = useId()
  return (
    <section className="report-part">
      <div className="report-part-head">
        <label htmlFor={id} className="report-part-title">
          <InfoIcon size={16} /> {t.odo.issues}
        </label>
      </div>
      <div className="report-chip-row report-chip-wrap">
        {t.carState.quickIssues.map((q) => (
          <button key={q} type="button" className="chip report-chip" onClick={() => onChange(addIssue(value, q))}>
            <PlusIcon size={12} /> {q}
          </button>
        ))}
      </div>
      <textarea id={id} rows={2} maxLength={300} placeholder={t.odo.issuesPlaceholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </section>
  )
}
