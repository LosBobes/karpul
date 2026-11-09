import type { DemoKey } from '../lib/whatsNew'

/**
 * The moving picture of each What's new entry: a small piece of the screen it
 * is about, playing out on a loop (the keyframes are `.wn-*` in
 * styles/extras.css, still under reduced motion). Drawn with the app's own
 * classes for colour, so it follows the theme. A new entry adds its demo here.
 */
export function WhatsNewArt({ demo }: { demo: DemoKey }) {
  return (
    <div className={`wn-art wn-${demo}`} aria-hidden="true">
      {demo === 'tourSpotlight' ? <TourSpotlightDemo /> : demo === 'noYou' ? <NoYouDemo /> : demo === 'pickAfter' ? <PickAfterDemo /> : demo === 'whoWhere' ? <WhoWhereDemo /> : demo === 'outOfService' ? <OutOfServiceDemo /> : demo === 'fleetUpkeep' ? <FleetUpkeepDemo /> : demo === 'monthSummary' ? <MonthSummaryDemo /> : demo === 'pickColleague' ? <PickColleagueDemo /> : demo === 'impact' ? <ImpactDemo /> : demo === 'addedBy' ? <AddedByDemo /> : demo === 'seatNotice' ? <SeatNoticeDemo /> : demo === 'carWhere' ? <CarWhereDemo /> : demo === 'carBusy' ? <CarBusyDemo /> : demo === 'prefill' ? <PrefillDemo /> : <ConsentDemo />}
    </div>
  )
}

/** The board dims, a ring lands on the tabs, then glides to the plus with its card. */
function TourSpotlightDemo() {
  return (
    <div className="wn-card wn-spot">
      <div className="wn-spot-bar">
        <span className="wn-spot-tabs">
          <span className="wn-line" />
          <span className="wn-line" />
          <span className="wn-line" />
        </span>
        <span className="wn-spot-plus">+</span>
      </div>
      <span className="wn-line" />
      <span className="wn-line wn-line-label" />
      <span className="wn-spot-hole" />
      <span className="wn-spot-tip">
        <span className="wn-line" />
        <span className="wn-line wn-line-label" />
      </span>
    </div>
  )
}

/** The You card folds away under the cars, and Ask for a ride moves up into its place. */
function NoYouDemo() {
  return (
    <div className="wn-card wn-noyou">
      <span className="wn-line wn-line-label" />
      <div className="wn-noyou-card">
        <span className="wn-pax-avatar">VB</span>
        <span className="wn-line" />
      </div>
      <div className="wn-noyou-ask">✋</div>
    </div>
  )
}

/** Get in, then the places: the button is pressed, the rows come up, the second lights. */
function PickAfterDemo() {
  return (
    <div className="wn-card wn-pick">
      <div className="wn-after-btn">+</div>
      {['wn-who-start', 'wn-who-via'].map((kind, i) => (
        <div key={kind} className={i === 1 ? 'wn-pick-row wn-pick-on' : 'wn-pick-row'} style={{ ['--i' as string]: i + 1 }}>
          <span className="wn-who-dot" />
          <span className="wn-line" />
        </div>
      ))}
    </div>
  )
}

/** A ride's route: a face pops in beside each place, yours (the second) ringed. */
function WhoWhereDemo() {
  const stops: [string, string[]][] = [
    ['wn-who-start', ['AP']],
    ['wn-who-via', ['MD', 'TI']],
    ['wn-who-end', []],
  ]
  return (
    <div className="wn-card wn-who">
      {stops.map(([kind, faces], i) => (
        <div key={kind} className={`wn-who-row ${kind}`}>
          <span className="wn-who-dot" />
          <span className="wn-line" />
          {faces.map((f, j) => (
            <span key={f} className={i === 1 && j === 0 ? 'wn-pax-avatar wn-who-face wn-who-me' : 'wn-pax-avatar wn-who-face'} style={{ ['--i' as string]: i + j }}>
              {f}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** A shared car's card: the out-of-service line slides in, and three days of the calendar turn red. */
function OutOfServiceDemo() {
  const taken = [2, 3, 4]
  return (
    <div className="wn-card">
      <div className="wn-busy-head">
        <span className="wn-line wn-line-label" />
        <span className="wn-busy-time">FIRM-002</span>
      </div>
      <div className="wn-block-line">
        <span className="wn-block-icon" />
        <span className="wn-line" />
      </div>
      <div className="wn-cal">
        {[9, 10, 11, 12, 13, 14, 15].map((d, i) => (
          <span key={d} className={taken.includes(i) ? 'wn-cal-day wn-cal-taken' : 'wn-cal-day'} style={{ ['--i' as string]: taken.indexOf(i) }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A car's upkeep: the due chips pop in, amber then red, and the official fuel price under them. */
function FleetUpkeepDemo() {
  return (
    <div className="wn-card">
      <span className="wn-line wn-line-label" />
      <div className="wn-due">
        {['7', '800 km', '!'].map((text, i) => (
          <span key={text} className={i === 2 ? 'wn-due-chip wn-due-red' : 'wn-due-chip'} style={{ ['--i' as string]: i }}>
            {text}
          </span>
        ))}
      </div>
      <div className="wn-fuel">
        <strong>236,00</strong>
        <strong>207,00</strong>
      </div>
    </div>
  )
}

/** All rides → Month: a row per person fills in, the allowance last. */
function MonthSummaryDemo() {
  const rows = [
    ['AP', '182', '10.920'],
    ['MJ', '90', '5.400'],
    ['NN', '364', '21.840'],
  ]
  return (
    <div className="wn-card wn-month">
      {rows.map(([who, km, din], i) => (
        <div key={who} className="wn-month-row" style={{ ['--i' as string]: i }}>
          <span className="wn-pax-avatar">{who}</span>
          <span className="wn-line" />
          <span className="wn-month-km">{km}</span>
          <strong className={i === 2 ? 'wn-month-din wn-month-over' : 'wn-month-din'}>{din}</strong>
        </div>
      ))}
    </div>
  )
}

/** Your rides: three green tiles come in one after another, the km, the CO₂ and the fuel. */
function ImpactDemo() {
  return (
    <div className="wn-card">
      <span className="wn-line wn-line-label" />
      <div className="wn-impact">
        {['412', '70', '29'].map((n, i) => (
          <span key={n} className="wn-impact-tile" style={{ animationDelay: `${i * 0.35}s` }}>
            <strong>{n}</strong>
            <span className="wn-line" />
          </span>
        ))}
      </div>
    </div>
  )
}

/** A driver card: the line saying which admin added the ride slides in under the driver. */
/** A few letters in the search box, the matching colleagues under it, and one picked. */
function PickColleagueDemo() {
  return (
    <div className="wn-card wn-pick">
      <div className="wn-field">
        <span className="wn-field-text">Mil</span>
      </div>
      <div className="wn-pick-row wn-pick-on" style={{ ['--i' as string]: 0 }}>
        <span className="wn-pax-avatar">MI</span>
        <span className="wn-pax-name">Mila Ilić</span>
      </div>
      <div className="wn-pick-row" style={{ ['--i' as string]: 1 }}>
        <span className="wn-pax-avatar">MM</span>
        <span className="wn-pax-name">Milan Marić</span>
      </div>
    </div>
  )
}

function AddedByDemo() {
  return (
    <div className="wn-card">
      <div className="wn-addedby-driver">
        <span className="wn-pax-avatar">M</span>
        <span className="wn-pax-name">Marko</span>
      </div>
      <span className="wn-line" />
      <div className="wn-addedby-fact">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path
            d="M8 1.75c1.6 1.2 3.3 1.8 5.25 1.85v3.9c0 3.2-2 5.5-5.25 6.75C4.75 13 2.75 10.7 2.75 7.5V3.6C4.7 3.55 6.4 2.95 8 1.75Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        <span className="wn-line wn-line-label" />
        <span className="wn-addedby-name">Ada</span>
      </div>
    </div>
  )
}

/** A passenger row goes from the car, and the card telling them so pops up over it. */
function SeatNoticeDemo() {
  return (
    <div className="wn-card wn-notice-stage">
      <div className="wn-pax-row">
        <span className="wn-pax-avatar">M</span>
        <span className="wn-pax-name">Milan</span>
      </div>
      <div className="wn-notice">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M8 2.5a3.5 3.5 0 0 0-3.5 3.5v2.4L3.3 10.6h9.4l-1.2-2.2V6A3.5 3.5 0 0 0 8 2.5Z" fill="currentColor" />
          <circle cx="8" cy="12.6" r="1.2" fill="currentColor" />
        </svg>
        <span className="wn-notice-lines">
          <span className="wn-line" />
          <span className="wn-line wn-line-label" />
        </span>
      </div>
    </div>
  )
}

/** A shared car's card: a pin drops on the place and the line under it says where the car is. */
function CarWhereDemo() {
  return (
    <div className="wn-card">
      <span className="wn-line wn-line-label" />
      <div className="wn-where">
        <svg className="wn-where-pin" viewBox="0 0 16 16" width="18" height="18">
          <path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8Z" fill="currentColor" />
          <circle cx="8" cy="6.6" r="1.7" fill="var(--surface)" />
        </svg>
        <span className="wn-where-text">Novi Sad</span>
      </div>
      <span className="wn-line" />
    </div>
  )
}

/** A week of the ride form's calendar for a shared car: the days it is taken in those hours turn red. */
function CarBusyDemo() {
  const taken = [2, 4]
  return (
    <div className="wn-card">
      <div className="wn-busy-head">
        <span className="wn-line wn-line-label" />
        <span className="wn-busy-time">08:00 – 12:00</span>
      </div>
      <div className="wn-cal">
        {[9, 10, 11, 12, 13, 14, 15].map((d, i) => (
          <span key={d} className={taken.includes(i) ? 'wn-cal-day wn-cal-taken' : 'wn-cal-day'} style={{ ['--i' as string]: taken.indexOf(i) }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A blank ride form; the switch goes on and the fields fill in one after another. */
function PrefillDemo() {
  return (
    <div className="wn-card">
      <div className="wn-switch-row">
        <span className="wn-line wn-line-label" />
        <span className="wn-switch">
          <span className="wn-knob" />
        </span>
      </div>
      {['Novi Sad → Beograd', '07:30 – 16:30', 'Mazda 6e · 3'].map((text, i) => (
        <div key={text} className="wn-field" style={{ ['--i' as string]: i }}>
          <span className="wn-field-empty" />
          <span className="wn-field-text">{text}</span>
        </div>
      ))}
    </div>
  )
}

/** The driver moves a time: the old one is struck through, the new one asked, and the passengers tick it. */
function ConsentDemo() {
  return (
    <div className="wn-card">
      <div className="wn-times">
        <span className="wn-old">07:30</span>
        <span className="wn-arrow">→</span>
        <span className="wn-new">08:00</span>
      </div>
      <div className="wn-pax">
        {[0, 1, 2].map((i) => (
          <span key={i} className="wn-pax-dot" style={{ ['--i' as string]: i }}>
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M4 8.5 7 11l5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ))}
      </div>
    </div>
  )
}
