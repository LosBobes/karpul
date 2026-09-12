import { getLocale, useLocale, type Locale } from './locale'

/**
 * Every word the screen shows, in English and in Serbian (Latin script).
 *
 * `en` is the reference: its shape is the `Messages` type, so a key missing
 * from `sr` is a type error and nothing can ever fall back to English by
 * accident. Anything with a count or a name in it is a function, because the
 * two languages inflect differently: Serbian has three plural forms (1 vožnja,
 * 2 vožnje, 5 vožnji) and a name in a sentence would need a case ending, so
 * the Serbian sentences are built so the name can stay as typed.
 *
 * Components read it through `useT()`; non-component code (`lib/dates.ts`,
 * `lib/carModels.ts`) through `messages()`. Backend error texts are English
 * and are rendered through `apiError`, which knows the server's wordings.
 */

type PowertrainKind = 'electric' | 'hybrid' | 'diesel' | 'petrol'
type LiveStatus = 'connecting' | 'live' | 'offline'

/** One picture per guide entry; drawn by components/GuideArt.tsx. */
export type GuideArtKey =
  | 'park-flap'
  | 'card-reader'
  | 'plug-in'
  | 'card-then-unplug'
  | 'card-back'
  | 'no-start-button'
  | 'stalk'
  | 'switch-off'
  | 'regen'
  | 'touchscreen'
  | 'battery'
  | 'flap'
  | 'frunk'

export interface GuideEntry {
  art: GuideArtKey
  title: string
  body: string
}

const enPlural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`

const en = {
  documentTitle: 'Karpul · community carpooling',

  common: {
    save: 'Save',
    cancel: 'Cancel',
    done: 'Done',
    delete: 'Delete',
    remove: 'Remove',
    add: 'Add',
    edit: 'Edit',
    continue: 'Continue',
    close: 'Close',
    loading: 'Loading…',
    saving: 'Saving…',
    checking: 'Checking…',
    removing: 'Removing…',
    today: 'Today',
    tomorrow: 'Tomorrow',
    open: 'Open',
    choose: 'Choose…',
    menu: 'Menu',
    language: 'Language',
    somethingWrong: 'Something went wrong',
    copy: 'Copy link',
  },

  theme: { label: 'Appearance', light: 'Light', dark: 'Dark', system: 'Auto' },

  live: {
    label: { connecting: 'Connecting', live: 'Live', offline: 'Offline' } as Record<LiveStatus, string>,
    title: {
      connecting: 'Connecting to the board…',
      live: 'Changes made by others show up here as they happen.',
      offline: 'Live updates are down; the board refreshes itself every 30 s until they are back.',
    } as Record<LiveStatus, string>,
  },

  view: { label: 'View', upcoming: 'Upcoming', week: 'Week' },

  fab: { addRide: 'Add ride' },

  sidebar: {
    changeName: 'Change name',
    enterName: 'Enter your name',
    nameHint: 'How colleagues see you',
    nameNeeded: 'Needed before you can get in a car',
    cars: 'Company cars',
    carsHint: 'Manage the pool (password)',
    guide: 'Company car guide',
    guideHint: 'Charging with the card, the Mazda 6e',
    closeMenu: 'Close menu',
    noName: 'No name yet',
    youHere: 'You, in this browser',
    tapIntro: 'Tap to introduce yourself',
  },

  myRides: {
    title: 'Your rides',
    hint: 'History, figures, calendar feed',
    thisMonth: 'This month',
    allTime: 'All time',
    driven: 'Driven',
    ridden: 'Ridden along',
    carried: 'People carried',
    km: 'km shared',
    kmHint: 'One-way distances as the drivers entered them; a ride without one counts as 0.',
    history: 'Past rides',
    noHistory: 'No past rides yet.',
    feed: 'Calendar feed',
    feedHint: 'Subscribe to this address in your calendar app and every ride you drive or ride in shows up there, and stays current.',
    asDriver: 'Driver',
    asPassenger: 'Passenger',
    pax: (n: number) => enPlural(n, 'passenger', 'passengers'),
    route: (origin: string, destination: string) => `${origin} to ${destination}`,
    nameFirst: 'Set your name to see your rides.',
  },

  notif: {
    title: 'Notifications',
    hint: 'Who got in, reminders before leaving',
    body: 'A push when someone gets into your car or out of it, when a driver moves or removes a ride you are in, and 30 minutes before you leave.',
    enable: 'Turn on',
    disable: 'Turn off',
    on: 'On, for this browser and this name.',
    off: 'Off.',
    unsupported: 'This browser cannot show push notifications. On an iPhone, install Karpul to the home screen first, then try again.',
    unavailable: 'Push is not set up on this server.',
    denied: 'The browser has blocked notifications for this site. Allow them in the site settings, then try again.',
    nameFirst: 'Set your name first; notifications are sent to a name.',
  },

  name: {
    changeTitle: 'Change your name',
    askTitle: "What's your name?",
    yourName: 'Your name',
    placeholder: 'e.g. Ana Petrović',
    hint: 'This is how you appear to your colleagues in a car. No account, no password. The name is only remembered in this browser.',
  },

  you: {
    title: 'You',
    whoAreYou: 'Who are you?',
    tapName: 'Tap to enter your name. No account needed.',
    allSet: "You're all set!",
    ridingWith: (first: string, time: string) => `Riding with ${first}, leaving at ${time}.`,
    drivingToday: (taken: number, seats: number) => `You're driving today. ${taken} of ${seats} seats taken.`,
    dragMe: (verb: string) => `${verb} me onto a car`,
    dropOut: 'Drop here to get out of the car',
    rodeWith: (first: string) => `You rode with ${first}.`,
    dayOver: 'This day is over.',
    youDrive: "You're the driver.",
    inCar: (first: string, verb: string) => `In ${first}'s car. ${verb} to another car, or drop here to get out.`,
    notInCar: (verb: string) => `Not in a car yet. ${verb} onto a car, or open one and tap "Get in".`,
    noFreeSeats: 'No free seats today.',
    noRides: 'No rides on this day yet.',
    drag: 'Drag',
    holdDrag: 'Hold and drag',
  },

  detail: {
    editRide: 'Edit ride',
    stopManage: 'Stop passengers managing seats',
    letManage: 'Let passengers manage seats',
    duplicate: 'Duplicate ride',
    removeRide: 'Remove ride',
    duplicateMine: 'Duplicate as my ride',
    driver: 'Driver',
    you: 'You',
    rideOptions: 'Ride options',
    leaves: 'Leaves',
    returns: 'Returns',
    oneWay: 'One way',
    from: 'From:',
    to: 'To:',
    companyCar: 'Company car',
    ownCar: 'Own car',
    howTo: 'How to charge and drive it',
    passengersTitle: 'Passengers in this car',
    openListTitle: 'The driver lets passengers add and remove each other',
    openList: 'Open list',
    nobodyRode: 'Nobody rode along.',
    noSeatsOffered: 'No passenger seats offered.',
    noPassengers: 'No passengers yet.',
    dropToGetIn: 'Drop here to get in',
    getIn: 'Get in this car',
    dragHintCoarse: 'Hold and drag your chip here, or tap to join',
    dragHint: 'Drag your chip here or tap to join',
    tapSeat: 'Tap to take a seat',
    dragSwitch: 'Drag to another car to switch, or down to "You" to get out',
    switchTo: 'Switch to this car',
    switchHint: (first: string) => `You leave ${first}'s car for this day.`,
    share: 'Share ride',
    shareText: (driver: string, origin: string, destination: string, when: string) =>
      `${driver} drives ${origin} to ${destination}, ${when}.`,
    addToCalendar: 'Add to calendar',
    removeFollowing: 'Remove this and following rides',
    weekly: 'Weekly',
    pickup: 'Pickup',
    start: 'Start',
    getsInAt: (place: string) => `Gets in at ${place}`,
    changePickup: 'Change pickup',
    chipIn: (amount: string) => `${amount} per seat`,
    distance: (km: number) => `${km} km one way`,
    removeName: (name: string) => `Remove ${name}`,
    leave: 'Leave',
    addByName: 'Add a passenger by name',
    passengerName: "Passenger's name",
    colleagueName: "Colleague's name",
    setNameHint: 'Set your name from the menu to get in.',
    full: 'This car is full.',
    openListHint: 'The driver lets passengers add and remove each other in this car.',
  },

  form: {
    returnAfter: 'Return time must be after departure time',
    editTitle: 'Edit ride',
    addTitle: 'Add ride',
    saveChanges: 'Save changes',
    deleteRide: 'Delete ride',
    driver: 'Driver',
    car: 'Car',
    companyCar: 'Company car',
    myOwnCar: 'My own car',
    whichCar: 'Which company car',
    carHint: (plate: string, seats: number) => `${plate} · ${enPlural(seats, 'seat', 'seats')}`,
    yourCar: 'Your car',
    carPlaceholder: 'e.g. grey Octavia',
    seats: 'Passenger seats',
    fewer: 'Fewer seats',
    more: 'More seats',
    alreadyBooked: (n: number) => `${n} already booked, so it can't go lower.`,
    passengerList: 'Passenger list',
    canManage: 'Passengers can add and remove each other',
    manageOn: 'Anyone in the car can put a colleague in or take one out. You can still do both.',
    manageOff: 'Only you can put others in or take them out. Anyone can still get in or leave on their own.',
    departs: 'Departs',
    day: 'Day',
    departureTime: 'Departure time',
    returns: 'Returns',
    oneWay: 'One way',
    returnDay: 'Return day (same day)',
    returnTime: 'Return time',
    pickup: 'Pickup location',
    pickupPlaceholder: 'e.g. Main St. Parking',
    dropoff: 'Drop-off location',
    dropoffPlaceholder: 'e.g. Office',
    notes: 'Notes',
    optional: '(optional)',
    notesPlaceholder: 'Meeting point, detours, luggage…',
    repeat: 'Repeat',
    repeatWeekly: 'Repeat every week',
    repeatUntil: 'Until',
    repeatCount: (n: number) => `${enPlural(n, 'ride', 'rides')}, one a week, same weekday.`,
    repeatMax: 'Up to 26 weeks ahead.',
    stops: 'Extra pickup points',
    stopsHint: 'Up to 3 places on the way where a passenger can get in instead of the start.',
    addStop: 'Add a pickup point',
    stopPlaceholder: 'e.g. Liman bus stop',
    removeStop: 'Remove this pickup point',
    distance: 'Distance one way',
    distanceHint: 'Feeds the "km shared" figures. Optional.',
    chipIn: 'Chip in per seat',
    chipInPlaceholder: 'e.g. 300 din',
    chipInHint: 'Just the agreement, shown on the ride. Nothing is charged here.',
    /** Pre-filled destination on the very first ride in this browser. */
    defaultDestination: 'Office',
  },

  admin: {
    title: 'Company cars',
    forget: 'Forget the admin password on this device',
    hint: 'Changes here affect everyone. Retiring a car keeps it on past rides but takes it out of the "Add ride" form.',
    seats: (n: number) => enPlural(n, 'seat', 'seats'),
    retired: 'Retired',
    optionsFor: (name: string) => `Options for ${name}`,
    retire: 'Retire',
    restore: 'Restore',
    addCar: 'Add car',
    addCompanyCar: 'Add company car',
    unlock: 'Unlock',
    password: 'Admin password',
    passwordPlaceholder: 'Shared car-pool password',
    passwordHint: 'Only needed to change the car pool. Adding and joining cars never asks for it.',
    name: 'Name',
    namePlaceholder: 'e.g. Skoda Octavia',
    plate: 'Plate',
    platePlaceholder: 'FIRM-004',
  },

  usage: {
    tab: 'Usage',
    carsTab: 'Cars',
    window: (days: number) => (days === 365 ? 'Last year' : `Last ${days} days`),
    ridesLabel: 'Rides',
    daysOut: 'Days out',
    useRate: 'Use rate',
    useRateHint: (days: number) => `Days the car went out, over the ${days} working days in this window.`,
    drivers: 'Drivers',
    passengers: 'Passengers',
    km: 'km',
    lastUsed: 'Last used',
    never: 'Never',
    booked: (n: number) => (n === 1 ? '1 ride booked ahead' : `${n} rides booked ahead`),
    history: 'Rides in this window',
    noUsage: 'No company-car rides in this window.',
    retired: 'Retired',
    pax: (n: number, seats: number) => `${n} of ${seats}`,
  },

  upcoming: {
    label: 'Next sessions',
    meta: (rides: number, free: number) => `${enPlural(rides, 'ride', 'rides')} · ${free} free ${free === 1 ? 'seat' : 'seats'}`,
    back: (time: string) => `back ${time}`,
    oneWay: 'one way',
    route: (driver: string, origin: string, destination: string) => `${driver} · ${origin} to ${destination}`,
    driving: 'Driving',
    youreIn: "You're in",
    full: 'Full',
    seats: (n: number) => enPlural(n, 'seat', 'seats'),
  },

  filters: {
    label: 'Show',
    all: 'All',
    free: 'Free seats',
    mine: 'My rides',
    joined: "I'm in",
    search: 'Search by place or driver',
    noMatch: 'No rides match.',
    clear: 'Clear filters',
  },

  dates: {
    pickDay: 'Pick a day',
    week: 'Week',
    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    jumpToDate: 'Jump to date',
    jumpTo: 'Jump to…',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
  },

  time: { hour: 'Hour', minute: 'Minute', ampm: 'AM or PM' },

  confirm: {
    removeRideTitle: 'Remove this ride?',
    removeRidePax: (n: number) => `${n} passenger${n === 1 ? ' is' : 's are'} in this car. They will lose their seat.`,
    removeRideBody: (driver: string, car: string, date: string) =>
      `${driver}'s ride in the ${car} will be removed from ${date}.`,
    removeFollowingTitle: 'Remove this and the following rides?',
    removeFollowingBody: 'This ride and every later ride of this weekly series will be removed. Their passengers lose their seats.',
    deleteCarTitle: 'Delete this car?',
    deleteCarBody: (name: string, plate: string) =>
      `${name} (${plate}) will be deleted from the pool. Retiring it instead keeps it on past rides.`,
  },

  toasts: {
    couldNotLoad: (msg: string) => `Could not load rides: ${msg}`,
    youreIn: (driver: string) => `You're in with ${driver}.`,
    nameIn: (name: string, driver: string) => `${name} is in with ${driver}.`,
    manageOn: 'Passengers can now add and remove each other.',
    manageOff: 'Only you manage the passenger list now.',
    rideRemoved: 'Ride removed.',
    rideUpdated: 'Ride updated.',
    rideAdded: 'Ride added.',
    ridesAdded: (n: number) => `${n} rides added, one a week.`,
    ridesRemoved: 'Rides removed.',
    linkCopied: 'Link copied.',
    pickupChanged: (place: string) => `You get in at ${place}.`,
    notifOn: 'Notifications are on.',
    notifOff: 'Notifications are off.',
    rideNotFound: 'That ride is gone.',
    carAdded: (name: string) => `${name} added to the pool.`,
    carDeleted: (name: string) => `${name} deleted.`,
    updateReady: 'A new version is ready.',
    updateAction: 'Update',
  },

  empty: {
    noRidesDay: 'No rides on this day yet',
    noUpcoming: 'No upcoming sessions yet',
    noRidesWent: 'No rides went on this day',
    pastReadOnly: 'Past days are read-only.',
    whoAreYou: 'Who are you?',
    enterToAdd: 'Enter your name to add a ride or get into a car.',
    usePlus: 'Add one with the + button at the bottom right.',
    viewsIntro: 'Upcoming lists every ride for the next 90 days. Week shows one day at a time, with the cars as tiles.',
    firstRide: 'The form remembers your route and car, and the destination starts as "Office".',
  },

  carousel: { label: 'Rides', scrollLeft: 'Scroll rides left', scrollRight: 'Scroll rides right' },

  share: {
    title: (driver: string, origin: string, destination: string) => `${driver} drives ${origin} to ${destination}`,
  },

  powertrain: { electric: 'Electric', hybrid: 'Hybrid', diesel: 'Diesel', petrol: 'Petrol' } as Record<PowertrainKind, string>,

  guide: {
    title: 'Company car guide',
    chargingTitle: 'Charging with the company card',
    mazdaTitle: 'Mazda 6e, first time behind the wheel',
    charging: [
      {
        art: 'park-flap',
        title: 'Park at the charger and open the flap',
        body: 'Back in close enough for the cable to reach. Press the charging flap on the rear quarter panel and it pops open; the socket behind it takes the standard CCS plug on every company charger.',
      },
      {
        art: 'card-reader',
        title: 'Hold the company card against the reader',
        body: "The charging card lives in the car (glovebox). Hold it flat against the reader on the charger for a second until the charger beeps or its light turns green. A quick swipe past it usually isn't read.",
      },
      {
        art: 'plug-in',
        title: 'Plug in within a minute',
        body: 'Push the plug in until it clicks and locks. The charger starts on its own; the car shows a charging light by the socket and the battery percentage on the driver display.',
      },
      {
        art: 'card-then-unplug',
        title: 'Stopping: card first, then unplug',
        body: "Hold the card against the reader again to end the session; only then does the plug unlock. Unlocking the car also releases it. Don't tug at a locked plug.",
      },
      {
        art: 'card-back',
        title: 'Put the card back',
        body: 'The card is the only way the next driver can charge. Back in the glovebox, and note on the ride if the charger was out of order.',
      },
    ] as GuideEntry[],
    mazda: [
      {
        art: 'no-start-button',
        title: 'There is no start button',
        body: 'Get in with the key on you, press the brake and the car is ready. There is no key to turn and nothing to press. It is silent, so watch the driver display for "READY" instead of listening for an engine.',
      },
      {
        art: 'stalk',
        title: 'Gears are on a stalk, not a lever',
        body: 'The selector is the stalk on the right of the steering column. Hold the brake, push the stalk down for Drive, up for Reverse; the P button on its tip parks the car. There is no clutch and no gear lever between the seats.',
      },
      {
        art: 'switch-off',
        title: 'Switching it off',
        body: 'Press P, get out and lock it. The car shuts itself down; you never "turn it off". The screen stays lit for a moment, which is normal.',
      },
      {
        art: 'regen',
        title: 'It slows down by itself',
        body: 'Lifting off the accelerator brakes noticeably: the motor recovers energy. That is regenerative braking, and its strength is set in the Vehicle menu on the touchscreen. Use the brake pedal exactly as you would in any car.',
      },
      {
        art: 'touchscreen',
        title: 'Most switches are on the screen',
        body: 'Climate, drive modes, mirror adjustment and regen strength live in the central touchscreen rather than on physical buttons. Wipers and lights stay on the stalks; there is a physical hazard button.',
      },
      {
        art: 'battery',
        title: 'Battery, not fuel',
        body: 'The gauge shows the battery percentage and the remaining range; the range drops faster on the motorway and in the cold. For a day trip you do not need a full charge: 80% is plenty, and the charger slows down above it anyway.',
      },
      {
        art: 'flap',
        title: 'Where the plug goes',
        body: 'The charging flap is on the rear quarter panel: press it and it opens. If the car is locked the flap stays shut, so unlock first.',
      },
      {
        art: 'frunk',
        title: 'There is a boot under the bonnet',
        body: 'With no engine up front, the space under the bonnet is a small second boot, the frunk. It is where the charging cable lives, so the cable never rolls around the back. It opens from the Vehicle menu on the touchscreen, not from a lever under the dash. Close it with a firm push on the bonnet and check it is latched.',
      },
    ] as GuideEntry[],
  },

  /** Server error texts are English; this is the identity for English. */
  apiError: (message: string) => message,
}

export type Messages = typeof en

/**
 * Serbian plural: 1 (but not 11) takes the first form, 2 to 4 (but not 12 to 14)
 * the second, everything else the third. "1 vožnja, 2 vožnje, 5 vožnji".
 */
function srForm(n: number, one: string, few: string, other: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return other
}
const srPlural = (n: number, one: string, few: string, other: string) => `${n} ${srForm(n, one, few, other)}`
const srSeats = (n: number) => srPlural(n, 'mesto', 'mesta', 'mesta')
const srPassengers = (n: number) => srPlural(n, 'putnik', 'putnika', 'putnika')

/** The server's wordings (routers/rides.py, routers/cars.py, services.py, schemas.py), in Serbian. */
const SR_API_ERRORS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Ride not found$/, () => 'Vožnja nije pronađena'],
  [/^Booking not found$/, () => 'Rezervacija nije pronađena'],
  [/^Corporate car not found$/, () => 'Službeni auto nije pronađen'],
  [/^No free seats left$/, () => 'Nema više slobodnih mesta'],
  [/^Only the driver can cancel this ride$/, () => 'Samo vozač može da ukloni ovu vožnju'],
  [/^Only the driver can edit this ride$/, () => 'Samo vozač može da izmeni ovu vožnju'],
  [/^Only the passenger, the driver or another passenger/, () => 'Ovu rezervaciju može da ukloni samo taj putnik, vozač ili drugi putnik iz ovog auta'],
  [/^Set your name first/, () => 'Prvo upiši svoje ime'],
  [/^Wrong or missing admin password$/, () => 'Pogrešna lozinka ili lozinka nije uneta'],
  [/^Car-pool admin is not configured/, () => 'Upravljanje voznim parkom nije podešeno na ovom serveru'],
  [/^Range may not exceed 92 days$/, () => 'Opseg ne može biti duži od 92 dana'],
  [/^`to` must not be before `from`$/, () => 'Krajnji datum ne može biti pre početnog'],
  [/^(.+) already joined this ride$/, (m) => `${m[1]} već ima mesto u ovoj vožnji`],
  [/^(.+) is the driver of this ride$/, (m) => `${m[1]} je vozač ove vožnje`],
  [/^(.+) only has (\d+) passenger seats$/, (m) => `${m[1]} ima samo ${srSeats(Number(m[2]))} za putnike`],
  [/^(\d+) passengers already joined; seats cannot go below that$/, (m) => `Već upisanih: ${srPassengers(Number(m[1]))}; broj mesta ne može biti manji od toga`],
  [/^(.+) is already in the pool \((.+)\)$/, (m) => `${m[1]} je već u voznom parku (${m[2]})`],
  [/^(.+) is used by (\d+) ride\(s\); retire it instead of deleting it$/, (m) => `${m[1]} se koristi u ${srPlural(Number(m[2]), 'vožnji', 'vožnje', 'vožnji')}; povuci ga umesto brisanja`],
  [
    /^(.+)'s ride on (\S+) already offers (\d+) seats in this car; lower that ride first$/,
    (m) => `Vožnja za ${m[2]} (${m[1]}) već nudi ${srSeats(Number(m[3]))} u ovom autu; prvo smanji tu vožnju`,
  ],
  [
    /^That corporate car is already booked by (.+) from (\d\d:\d\d)(?: to (\d\d:\d\d))? that day(?: \((\S+)\))?$/,
    (m) => `Taj službeni auto je ${m[4] ? `${m[4]} ` : 'tog dana '}već zauzet: ${m[1]}, od ${m[2]}${m[3] ? ` do ${m[3]}` : ''}`,
  ],
  [/^Pickup must be the ride's origin or one of its stops$/, () => 'Mesto ulaska mora biti polazak ili jedno od mesta ulaska ove vožnje'],
  [/^Only the passenger or the driver can change this booking$/, () => 'Ovu rezervaciju može da izmeni samo taj putnik ili vozač'],
  [/^Push notifications are not configured on this server$/, () => 'Obaveštenja nisu podešena na ovom serveru'],
  [/^repeat_until must not be before ride_date$/, () => 'Kraj ponavljanja ne može biti pre dana vožnje'],
  [/^repeat_until may be at most (\d+) weeks after ride_date$/, (m) => `Ponavljanje može trajati najviše ${srPlural(Number(m[1]), 'sedmicu', 'sedmice', 'sedmica')}`],
  [/^at most (\d+) extra pickup points$/, (m) => `Najviše ${m[1]} dodatna mesta ulaska`],
  [/^a pickup point may have at most (\d+) characters$/, (m) => `Mesto ulaska može imati najviše ${m[1]} znakova`],
  // Pydantic (schemas.py), possibly prefixed with the field by api.ts: "origin: must not be empty".
  [/^return_time must be after departure_time$/, () => 'Vreme povratka mora biti posle polaska'],
  [/^corporate_car_id is required for a corporate car$/, () => 'Izaberi službeni auto'],
  [/^car_name is required for an own car$/, () => 'Upiši koji je auto'],
]

const SR_FIELDS: Record<string, string> = {
  origin: 'Mesto polaska',
  destination: 'Odredište',
  car_name: 'Auto',
  driver_name: 'Vozač',
  passenger_name: 'Ime putnika',
  notes: 'Napomene',
  name: 'Naziv',
  plate: 'Tablice',
  passenger_seats: 'Mesta za putnike',
  seats: 'Mesta za putnike',
  ride_date: 'Dan',
  departure_time: 'Vreme polaska',
  return_time: 'Vreme povratka',
  stops: 'Mesta ulaska',
  distance_km: 'Razdaljina',
  chip_in: 'Doprinos',
  repeat_until: 'Ponavljanje do',
  pickup: 'Mesto ulaska',
}

const SR_FIELD_MSGS: [RegExp, string][] = [
  [/^must not be empty$/, 'ne sme biti prazno'],
  [/^Field required$/, 'je obavezno'],
  [/^Input should be greater than or equal to (\d+)$/, 'mora biti najmanje $1'],
  [/^Input should be less than or equal to (\d+)$/, 'može biti najviše $1'],
  [/^String should have at most (\d+) characters$/, 'može imati najviše $1 znakova'],
]

function srApiError(message: string): string {
  // api.ts joins several validation errors with "; ", each "field: text".
  return message
    .split('; ')
    .map((part) => {
      for (const [re, fn] of SR_API_ERRORS) {
        const m = part.match(re)
        if (m) return fn(m)
      }
      const field = part.match(/^([a-z_]+): (.+)$/)
      if (field) {
        const label = SR_FIELDS[field[1]] ?? field[1]
        for (const [re, sr] of SR_FIELD_MSGS) {
          if (re.test(field[2])) return `${label} ${field[2].replace(re, sr)}`
        }
        return `${label}: ${srApiError(field[2])}`
      }
      return part
    })
    .join('; ')
}

const sr: Messages = {
  documentTitle: 'Karpul · zajednička vožnja',

  common: {
    save: 'Sačuvaj',
    cancel: 'Otkaži',
    done: 'Gotovo',
    delete: 'Obriši',
    remove: 'Ukloni',
    add: 'Dodaj',
    edit: 'Izmeni',
    continue: 'Nastavi',
    close: 'Zatvori',
    loading: 'Učitavanje…',
    saving: 'Čuvanje…',
    checking: 'Provera…',
    removing: 'Uklanjanje…',
    today: 'Danas',
    tomorrow: 'Sutra',
    open: 'Otvori',
    choose: 'Izaberi…',
    menu: 'Meni',
    language: 'Jezik',
    somethingWrong: 'Nešto nije u redu',
    copy: 'Kopiraj link',
  },

  theme: { label: 'Izgled', light: 'Svetlo', dark: 'Tamno', system: 'Automatski' },

  live: {
    label: { connecting: 'Povezivanje', live: 'Uživo', offline: 'Van mreže' },
    title: {
      connecting: 'Povezivanje sa tablom…',
      live: 'Izmene koje naprave drugi pojavljuju se ovde odmah.',
      offline: 'Ažuriranje uživo ne radi; tabla se sama osvežava na svakih 30 s dok se ne vrati.',
    },
  },

  view: { label: 'Prikaz', upcoming: 'Predstojeće', week: 'Sedmica' },

  fab: { addRide: 'Dodaj vožnju' },

  sidebar: {
    changeName: 'Promeni ime',
    enterName: 'Upiši svoje ime',
    nameHint: 'Kako te kolege vide',
    nameNeeded: 'Potrebno pre nego što uđeš u auto',
    cars: 'Službeni automobili',
    carsHint: 'Upravljanje voznim parkom (lozinka)',
    guide: 'Vodič za službeni auto',
    guideHint: 'Punjenje karticom, Mazda 6e',
    closeMenu: 'Zatvori meni',
    noName: 'Još nema imena',
    youHere: 'Ti, u ovom pregledaču',
    tapIntro: 'Dodirni i predstavi se',
  },

  myRides: {
    title: 'Tvoje vožnje',
    hint: 'Istorija, brojke, kalendar',
    thisMonth: 'Ovog meseca',
    allTime: 'Ukupno',
    driven: 'Vozio/la',
    ridden: 'Vozio/la se',
    carried: 'Prevezenih ljudi',
    km: 'km zajedno',
    kmHint: 'Razdaljine u jednom smeru kako su ih vozači upisali; vožnja bez razdaljine računa se kao 0.',
    history: 'Prošle vožnje',
    noHistory: 'Još nema prošlih vožnji.',
    feed: 'Kalendar',
    feedHint: 'Pretplati se na ovu adresu u aplikaciji za kalendar i svaka vožnja u kojoj voziš ili se voziš pojaviće se tamo, uvek ažurna.',
    asDriver: 'Vozač',
    asPassenger: 'Putnik',
    pax: srPassengers,
    route: (origin, destination) => `${origin} do ${destination}`,
    nameFirst: 'Upiši svoje ime da vidiš svoje vožnje.',
  },

  notif: {
    title: 'Obaveštenja',
    hint: 'Ko je ušao, podsetnik pred polazak',
    body: 'Obaveštenje kad neko uđe u tvoj auto ili izađe iz njega, kad vozač pomeri ili ukloni vožnju u kojoj si, i 30 minuta pre polaska.',
    enable: 'Uključi',
    disable: 'Isključi',
    on: 'Uključeno, za ovaj pregledač i ovo ime.',
    off: 'Isključeno.',
    unsupported: 'Ovaj pregledač ne može da prikazuje obaveštenja. Na iPhone-u prvo dodaj Karpul na početni ekran, pa pokušaj ponovo.',
    unavailable: 'Obaveštenja nisu podešena na ovom serveru.',
    denied: 'Pregledač je blokirao obaveštenja za ovaj sajt. Dozvoli ih u podešavanjima sajta, pa pokušaj ponovo.',
    nameFirst: 'Prvo upiši svoje ime; obaveštenja se šalju na ime.',
  },

  name: {
    changeTitle: 'Promeni ime',
    askTitle: 'Kako se zoveš?',
    yourName: 'Tvoje ime',
    placeholder: 'npr. Ana Petrović',
    hint: 'Ovako te kolege vide u autu. Bez naloga i bez lozinke. Ime se pamti samo u ovom pregledaču.',
  },

  you: {
    title: 'Ti',
    whoAreYou: 'Ko si ti?',
    tapName: 'Dodirni i upiši svoje ime. Nalog nije potreban.',
    allSet: 'Sve je spremno!',
    ridingWith: (first, time) => `Vozi te ${first}, polazak u ${time}.`,
    drivingToday: (taken, seats) => `Danas voziš. Zauzeto ${taken} od ${seats} mesta.`,
    dragMe: (verb) => `${verb} me na auto`,
    dropOut: 'Spusti ovde da izađeš iz auta',
    rodeWith: (first) => `Tvoj vozač: ${first}.`,
    dayOver: 'Ovaj dan je prošao.',
    youDrive: 'Ti si vozač.',
    inCar: (first, verb) => `U autu, vozi ${first}. ${verb} na drugi auto, ili spusti ovde da izađeš.`,
    notInCar: (verb) => `Još nisi u autu. ${verb} na auto, ili otvori jedan i dodirni „Uđi“.`,
    noFreeSeats: 'Danas nema slobodnih mesta.',
    noRides: 'Za ovaj dan još nema vožnji.',
    drag: 'Prevuci',
    holdDrag: 'Zadrži i prevuci',
  },

  detail: {
    editRide: 'Izmeni vožnju',
    stopManage: 'Samo vozač uređuje listu',
    letManage: 'Dozvoli putnicima da uređuju listu',
    duplicate: 'Dupliraj vožnju',
    removeRide: 'Ukloni vožnju',
    duplicateMine: 'Dupliraj kao moju vožnju',
    driver: 'Vozač',
    you: 'Ti',
    rideOptions: 'Opcije vožnje',
    leaves: 'Polazi',
    returns: 'Vraća se',
    oneWay: 'U jednom smeru',
    from: 'Od:',
    to: 'Do:',
    companyCar: 'Službeni auto',
    ownCar: 'Sopstveni auto',
    howTo: 'Kako se puni i vozi',
    passengersTitle: 'Putnici u ovom autu',
    openListTitle: 'Vozač dozvoljava putnicima da dodaju i uklanjaju jedni druge',
    openList: 'Otvorena lista',
    nobodyRode: 'Niko se nije vozio.',
    noSeatsOffered: 'Nema ponuđenih mesta za putnike.',
    noPassengers: 'Još nema putnika.',
    dropToGetIn: 'Spusti ovde da uđeš',
    getIn: 'Uđi u ovaj auto',
    dragHintCoarse: 'Zadrži i prevuci svoju karticu ovde, ili dodirni da uđeš',
    dragHint: 'Prevuci svoju karticu ovde ili dodirni da uđeš',
    tapSeat: 'Dodirni da zauzmeš mesto',
    dragSwitch: 'Prevuci na drugi auto da pređeš, ili dole na „Ti“ da izađeš',
    switchTo: 'Pređi u ovaj auto',
    switchHint: (first) => `Za ovaj dan izlaziš iz auta koji vozi ${first}.`,
    share: 'Podeli vožnju',
    shareText: (driver, origin, destination, when) => `${driver} vozi ${origin} do ${destination}, ${when}.`,
    addToCalendar: 'Dodaj u kalendar',
    removeFollowing: 'Ukloni ovu i sledeće vožnje',
    weekly: 'Nedeljno',
    pickup: 'Ulazak',
    start: 'Polazak',
    getsInAt: (place) => `Ulazi: ${place}`,
    changePickup: 'Promeni mesto ulaska',
    chipIn: (amount) => `${amount} po mestu`,
    distance: (km) => `${km} km u jednom smeru`,
    removeName: (name) => `Ukloni (${name})`,
    leave: 'Izađi',
    addByName: 'Dodaj putnika po imenu',
    passengerName: 'Ime putnika',
    colleagueName: 'Ime kolege',
    setNameHint: 'Za ulazak u auto prvo upiši svoje ime u meniju.',
    full: 'Ovaj auto je pun.',
    openListHint: 'Vozač dozvoljava da putnici u ovom autu dodaju i uklanjaju jedni druge.',
  },

  form: {
    returnAfter: 'Vreme povratka mora biti posle polaska',
    editTitle: 'Izmeni vožnju',
    addTitle: 'Dodaj vožnju',
    saveChanges: 'Sačuvaj izmene',
    deleteRide: 'Obriši vožnju',
    driver: 'Vozač',
    car: 'Auto',
    companyCar: 'Službeni auto',
    myOwnCar: 'Moj auto',
    whichCar: 'Koji službeni auto',
    carHint: (plate, seats) => `${plate} · ${srSeats(seats)}`,
    yourCar: 'Tvoj auto',
    carPlaceholder: 'npr. siva Octavia',
    seats: 'Mesta za putnike',
    fewer: 'Manje mesta',
    more: 'Više mesta',
    alreadyBooked: (n) => `Već upisanih: ${n}, pa ne može manje.`,
    passengerList: 'Lista putnika',
    canManage: 'Putnici mogu da dodaju i uklanjaju jedni druge',
    manageOn: 'Svako u autu može da doda kolegu ili ga ukloni. Ti i dalje možeš oboje.',
    manageOff: 'Samo ti možeš da dodaš druge ili ih ukloniš. Svako i dalje može sam da uđe ili izađe.',
    departs: 'Polazak',
    day: 'Dan',
    departureTime: 'Vreme polaska',
    returns: 'Povratak',
    oneWay: 'U jednom smeru',
    returnDay: 'Dan povratka (isti dan)',
    returnTime: 'Vreme povratka',
    pickup: 'Mesto polaska',
    pickupPlaceholder: 'npr. parking u Glavnoj ulici',
    dropoff: 'Odredište',
    dropoffPlaceholder: 'npr. Kancelarija',
    notes: 'Napomene',
    optional: '(nije obavezno)',
    notesPlaceholder: 'Mesto sastanka, obilasci, prtljag…',
    repeat: 'Ponavljanje',
    repeatWeekly: 'Ponavljaj svake sedmice',
    repeatUntil: 'Do',
    repeatCount: (n) => `${srPlural(n, 'vožnja', 'vožnje', 'vožnji')}, jedna sedmično, isti dan u sedmici.`,
    repeatMax: 'Najviše 26 sedmica unapred.',
    stops: 'Dodatna mesta ulaska',
    stopsHint: 'Do 3 mesta usput gde putnik može da uđe umesto na polasku.',
    addStop: 'Dodaj mesto ulaska',
    stopPlaceholder: 'npr. stanica Liman',
    removeStop: 'Ukloni ovo mesto ulaska',
    distance: 'Razdaljina u jednom smeru',
    distanceHint: 'Ulazi u brojke „km zajedno“. Nije obavezno.',
    chipIn: 'Doprinos po mestu',
    chipInPlaceholder: 'npr. 300 din',
    chipInHint: 'Samo dogovor, prikazan na vožnji. Ovde se ništa ne naplaćuje.',
    defaultDestination: 'Kancelarija',
  },

  admin: {
    title: 'Službeni automobili',
    forget: 'Zaboravi administratorsku lozinku na ovom uređaju',
    hint: 'Izmene ovde važe za sve. Povučen auto ostaje na prošlim vožnjama, ali nestaje iz obrasca „Dodaj vožnju“.',
    seats: srSeats,
    retired: 'Povučen',
    optionsFor: (name) => `Opcije za ${name}`,
    retire: 'Povuci',
    restore: 'Vrati',
    addCar: 'Dodaj auto',
    addCompanyCar: 'Dodaj službeni auto',
    unlock: 'Otključaj',
    password: 'Administratorska lozinka',
    passwordPlaceholder: 'Zajednička lozinka voznog parka',
    passwordHint: 'Potrebna je samo za izmene voznog parka. Dodavanje vožnji i ulazak u auto je nikad ne traže.',
    name: 'Naziv',
    namePlaceholder: 'npr. Škoda Octavia',
    plate: 'Tablice',
    platePlaceholder: 'FIRM-004',
  },

  usage: {
    tab: 'Korišćenje',
    carsTab: 'Automobili',
    window: (days) => (days === 365 ? 'Poslednjih godinu dana' : `Poslednjih ${days} dana`),
    ridesLabel: 'Vožnje',
    daysOut: 'Dana u vožnji',
    useRate: 'Iskorišćenost',
    useRateHint: (days) => `Dani kad je auto išao, u odnosu na ${srPlural(days, 'radni dan', 'radna dana', 'radnih dana')} u ovom periodu.`,
    drivers: 'Vozača',
    passengers: 'Putnika',
    km: 'km',
    lastUsed: 'Poslednji put',
    never: 'Nikad',
    booked: (n) => `${srPlural(n, 'vožnja zakazana', 'vožnje zakazane', 'vožnji zakazano')} unapred`,
    history: 'Vožnje u ovom periodu',
    noUsage: 'U ovom periodu nije bilo vožnji službenim autom.',
    retired: 'Povučen',
    pax: (n, seats) => `${n} od ${seats}`,
  },

  upcoming: {
    label: 'Predstojeće vožnje',
    meta: (rides, free) =>
      `${srPlural(rides, 'vožnja', 'vožnje', 'vožnji')} · ${srPlural(free, 'slobodno mesto', 'slobodna mesta', 'slobodnih mesta')}`,
    back: (time) => `nazad ${time}`,
    oneWay: 'u jednom smeru',
    route: (driver, origin, destination) => `${driver} · ${origin} do ${destination}`,
    driving: 'Voziš',
    youreIn: 'Imaš mesto',
    full: 'Puno',
    seats: srSeats,
  },

  filters: {
    label: 'Prikaži',
    all: 'Sve',
    free: 'Slobodna mesta',
    mine: 'Moje vožnje',
    joined: 'Imam mesto',
    search: 'Traži po mestu ili vozaču',
    noMatch: 'Nijedna vožnja ne odgovara.',
    clear: 'Poništi filtere',
  },

  dates: {
    pickDay: 'Izaberi dan',
    week: 'Sedmica',
    prevWeek: 'Prethodna sedmica',
    nextWeek: 'Sledeća sedmica',
    jumpToDate: 'Idi na datum',
    jumpTo: 'Idi na…',
    prevMonth: 'Prethodni mesec',
    nextMonth: 'Sledeći mesec',
  },

  time: { hour: 'Sat', minute: 'Minut', ampm: 'AM ili PM' },

  confirm: {
    removeRideTitle: 'Ukloniti ovu vožnju?',
    removeRidePax: (n) => `${srPassengers(n)} ${srForm(n, 'je', 'su', 'je')} u ovom autu. ${srForm(n, 'Izgubiće mesto.', 'Izgubiće mesta.', 'Izgubiće mesta.')}`,
    removeRideBody: (driver, car, date) => `Vožnja za ${date} (${driver}, ${car}) biće uklonjena.`,
    removeFollowingTitle: 'Ukloniti ovu i sledeće vožnje?',
    removeFollowingBody: 'Ova vožnja i sve kasnije vožnje iz ove nedeljne serije biće uklonjene. Njihovi putnici gube mesta.',
    deleteCarTitle: 'Obrisati ovaj auto?',
    deleteCarBody: (name, plate) =>
      `${name} (${plate}) biće obrisan iz voznog parka. Ako ga umesto toga povučeš, ostaje na prošlim vožnjama.`,
  },

  toasts: {
    couldNotLoad: (msg) => `Vožnje nisu učitane: ${msg}`,
    youreIn: (driver) => `Imaš mesto, vozi ${driver}.`,
    nameIn: (name, driver) => `${name} ima mesto, vozi ${driver}.`,
    manageOn: 'Putnici sada mogu da dodaju i uklanjaju jedni druge.',
    manageOff: 'Sada samo ti uređuješ listu putnika.',
    rideRemoved: 'Vožnja je uklonjena.',
    rideUpdated: 'Vožnja je izmenjena.',
    rideAdded: 'Vožnja je dodata.',
    ridesAdded: (n) => `Dodato: ${srPlural(n, 'vožnja', 'vožnje', 'vožnji')}, jedna sedmično.`,
    ridesRemoved: 'Vožnje su uklonjene.',
    linkCopied: 'Link je kopiran.',
    pickupChanged: (place) => `Ulaziš: ${place}.`,
    notifOn: 'Obaveštenja su uključena.',
    notifOff: 'Obaveštenja su isključena.',
    rideNotFound: 'Te vožnje više nema.',
    carAdded: (name) => `${name} je dodat u vozni park.`,
    carDeleted: (name) => `${name} je obrisan.`,
    updateReady: 'Nova verzija je spremna.',
    updateAction: 'Ažuriraj',
  },

  empty: {
    noRidesDay: 'Za ovaj dan još nema vožnji',
    noUpcoming: 'Još nema predstojećih vožnji',
    noRidesWent: 'Tog dana nije bilo vožnji',
    pastReadOnly: 'Prošli dani se ne mogu menjati.',
    whoAreYou: 'Ko si ti?',
    enterToAdd: 'Upiši svoje ime da dodaš vožnju ili uđeš u auto.',
    usePlus: 'Dodaj je dugmetom + u donjem desnom uglu.',
    viewsIntro: 'Predstojeće prikazuje sve vožnje u narednih 90 dana. Sedmica prikazuje jedan po jedan dan, sa autima kao pločicama.',
    firstRide: 'Obrazac pamti tvoju rutu i auto, a odredište na početku glasi „Kancelarija“.',
  },

  carousel: { label: 'Vožnje', scrollLeft: 'Pomeri vožnje ulevo', scrollRight: 'Pomeri vožnje udesno' },

  share: {
    title: (driver, origin, destination) => `${driver} vozi ${origin} do ${destination}`,
  },

  powertrain: { electric: 'Električni', hybrid: 'Hibrid', diesel: 'Dizel', petrol: 'Benzin' },

  guide: {
    title: 'Vodič za službeni auto',
    chargingTitle: 'Punjenje službenom karticom',
    mazdaTitle: 'Mazda 6e, prvi put za volanom',
    charging: [
      {
        art: 'park-flap',
        title: 'Parkiraj uz punjač i otvori poklopac',
        body: 'Priđi unazad dovoljno blizu da kabl dosegne. Pritisni poklopac priključka na zadnjem bočnom delu i on iskače; utičnica iza njega prima standardni CCS utikač, kakav je na svakom službenom punjaču.',
      },
      {
        art: 'card-reader',
        title: 'Prisloni službenu karticu uz čitač',
        body: 'Kartica za punjenje stoji u autu (pretinac za rukavice). Drži je ravno uz čitač na punjaču oko sekund, dok punjač ne zapišti ili mu lampica ne pozeleni. Brz prelaz pored čitača obično ne bude očitan.',
      },
      {
        art: 'plug-in',
        title: 'Uključi kabl u roku od minut',
        body: 'Gurni utikač dok ne klikne i ne zaključa se. Punjač kreće sam; auto pokazuje lampicu punjenja pored utičnice i procenat baterije na ekranu vozača.',
      },
      {
        art: 'card-then-unplug',
        title: 'Prekid: prvo kartica, pa utikač',
        body: 'Ponovo prisloni karticu uz čitač da završiš sesiju; tek tada se utikač otključava. Otključavanje auta ga takođe oslobađa. Ne vuci zaključan utikač.',
      },
      {
        art: 'card-back',
        title: 'Vrati karticu',
        body: 'Kartica je jedini način da sledeći vozač napuni auto. Vrati je u pretinac, a ako punjač nije radio, napiši to u napomeni vožnje.',
      },
    ],
    mazda: [
      {
        art: 'no-start-button',
        title: 'Nema dugmeta za paljenje',
        body: 'Uđi sa ključem kod sebe, pritisni kočnicu i auto je spreman. Ništa se ne okreće i ništa se ne pritiska. Tih je, pa umesto da osluškuješ motor, potraži „READY“ na ekranu vozača.',
      },
      {
        art: 'stalk',
        title: 'Menjač je ručica na volanu, ne poluga',
        body: 'Birač je ručica desno na stubu volana. Drži kočnicu, gurni ručicu dole za vožnju (D), gore za rikverc (R); dugme P na njenom vrhu parkira auto. Nema kvačila ni ručice menjača između sedišta.',
      },
      {
        art: 'switch-off',
        title: 'Gašenje',
        body: 'Pritisni P, izađi i zaključaj. Auto se sam gasi; nikad ga ne „gasiš“. Ekran ostane upaljen još koji trenutak, to je normalno.',
      },
      {
        art: 'regen',
        title: 'Sam usporava',
        body: 'Kad pustiš gas, auto primetno koči: motor vraća energiju u bateriju. To je regenerativno kočenje, a jačina mu se podešava u meniju Vehicle na ekranu. Pedalu kočnice koristi kao u svakom autu.',
      },
      {
        art: 'touchscreen',
        title: 'Većina komandi je na ekranu',
        body: 'Klima, režimi vožnje, podešavanje retrovizora i jačina regeneracije su na centralnom ekranu, ne na fizičkim dugmićima. Brisači i svetla ostaju na ručicama; dugme za sva četiri migavca je fizičko.',
      },
      {
        art: 'battery',
        title: 'Baterija, ne gorivo',
        body: 'Pokazivač prikazuje procenat baterije i preostali domet; domet brže pada na auto-putu i po hladnoći. Za dnevni put ne treba puna baterija: 80% je sasvim dovoljno, a iznad toga punjač ionako usporava.',
      },
      {
        art: 'flap',
        title: 'Gde ide utikač',
        body: 'Poklopac priključka je na zadnjem bočnom delu: pritisni ga i otvara se. Dok je auto zaključan, poklopac ostaje zatvoren, pa prvo otključaj.',
      },
      {
        art: 'frunk',
        title: 'Ispod haube je prtljažnik',
        body: 'Pošto napred nema motora, prostor ispod haube je mali drugi prtljažnik, takozvani frunk. U njemu stoji kabl za punjenje, pa se ne kotrlja po zadnjem prtljažniku. Otvara se iz menija Vehicle na ekranu, ne polugom ispod table. Zatvori ga čvrstim pritiskom na haubu i proveri da se zabravio.',
      },
    ],
  },

  apiError: srApiError,
}

const MESSAGES: Record<Locale, Messages> = { en, sr }

/** The current language's messages, for code that is not a component. */
export function messages(): Messages {
  return MESSAGES[getLocale()]
}

/** The current language's messages; re-renders the component when the language changes. */
export function useT(): Messages {
  return MESSAGES[useLocale()]
}
