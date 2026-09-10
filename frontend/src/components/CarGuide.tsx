import { CarArt } from './CarArt'
import { BoltIcon, KeyIcon } from './icons'
import { Sheet } from './Sheet'

/**
 * The help panel for the company cars: how to charge one with the company
 * card, and where the Mazda 6e keeps the controls a first-time EV driver
 * looks for in the wrong place. Plain content — edit the arrays below when the
 * fleet or the chargers change; nothing else needs to know.
 */

const CHARGING_STEPS: { title: string; body: string }[] = [
  {
    title: 'Park at the charger and open the flap',
    body: 'Back in close enough for the cable to reach. Press the charging flap on the rear quarter panel and it pops open; the socket behind it takes the standard CCS plug on every company charger.',
  },
  {
    title: 'Hold the company card against the reader',
    body: "The charging card lives in the car (glovebox). Hold it flat against the reader on the charger for a second until the charger beeps or its light turns green — a quick swipe past it usually isn't read.",
  },
  {
    title: 'Plug in within a minute',
    body: 'Push the plug in until it clicks and locks. The charger starts on its own; the car shows a charging light by the socket and the battery percentage on the driver display.',
  },
  {
    title: 'Stopping: card first, then unplug',
    body: "Hold the card against the reader again to end the session; only then does the plug unlock. Unlocking the car also releases it. Don't tug at a locked plug.",
  },
  {
    title: 'Put the card back',
    body: 'The card is the only way the next driver can charge. Back in the glovebox, and note on the ride if the charger was out of order.',
  },
]

const MAZDA_6E: { title: string; body: string }[] = [
  {
    title: 'There is no start button',
    body: 'Get in with the key on you, press the brake and the car is ready — no key to turn and nothing to press. It is silent, so watch the driver display for "READY" instead of listening for an engine.',
  },
  {
    title: 'Gears are on a stalk, not a lever',
    body: 'The selector is the stalk on the right of the steering column. Hold the brake, push the stalk down for Drive, up for Reverse; the P button on its tip parks the car. There is no clutch and no gear lever between the seats.',
  },
  {
    title: 'Switching it off',
    body: 'Press P, get out and lock it. The car shuts itself down; you never "turn it off". The screen stays lit for a moment — that is normal.',
  },
  {
    title: 'It slows down by itself',
    body: 'Lifting off the accelerator brakes noticeably: the motor recovers energy. That is regenerative braking, and its strength is set in the Vehicle menu on the touchscreen. Use the brake pedal exactly as you would in any car.',
  },
  {
    title: 'Most switches are on the screen',
    body: 'Climate, drive modes, mirror adjustment and regen strength live in the central touchscreen rather than on physical buttons. Wipers and lights stay on the stalks; there is a physical hazard button.',
  },
  {
    title: 'Battery, not fuel',
    body: 'The gauge shows the battery percentage and the remaining range; the range drops faster on the motorway and in the cold. For a day trip you do not need a full charge — 80% is plenty, and the charger slows down above it anyway.',
  },
  {
    title: 'Where the plug goes',
    body: 'The charging flap is on the rear quarter panel: press it and it opens. If the car is locked the flap stays shut, so unlock first.',
  },
]

export function CarGuide({ onClose }: { onClose: () => void }) {
  return (
    <Sheet id="guide-title" title="Company car guide" onClose={onClose} className="guide">
      <section className="guide-section">
        <h3 className="section-title">
          <KeyIcon size={16} /> Charging with the company card
        </h3>
        <ol className="guide-steps">
          {CHARGING_STEPS.map((s, i) => (
            <li key={s.title} className="guide-step">
              <span className="guide-step-no" aria-hidden="true">
                {i + 1}
              </span>
              <span className="guide-step-text">
                <b>{s.title}</b>
                <span>{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section">
        <div className="guide-hero" aria-hidden="true">
          <CarArt model="mazda6e" width={150} />
        </div>
        <h3 className="section-title">
          <BoltIcon size={16} /> Mazda 6e, first time behind the wheel
        </h3>
        <p className="hint">
          The 6e is electric and does a few things differently from a petrol car. Nothing here is hard, it is just in
          another place than you would expect.
        </p>
        <dl className="guide-list">
          {MAZDA_6E.map((q) => (
            <div key={q.title} className="guide-row">
              <dt>{q.title}</dt>
              <dd>{q.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Sheet>
  )
}
