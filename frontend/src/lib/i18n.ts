import { getLocale, useLocale, type Locale } from './locale'
import type { SupportTopic } from './support'
import type { PushCategory } from './types'

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

/** One topic of the app's own how-to (components/HowTo.tsx); `**word**` marks a control's name. */
export interface HowToTopic {
  title: string
  steps: string[]
  /** Shown to admins only. */
  admin?: boolean
  /** Shown only to whoever has the maps (lib/places.ts `useMapsAllowed`). */
  maps?: boolean
}

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
    back: 'Back',
    clear: 'Clear',
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

  view: { label: 'View', upcoming: 'Upcoming', week: 'Week', day: 'Day' },

  plan: {
    label: 'Day plan',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    ownCars: 'Own cars on the road',
    freeAllDay: 'Free all day',
    booked: 'Taken all day',
    freeFrom: (time: string) => `Free from ${time}`,
    freeBetween: (from: string, to: string) => `Free ${from}–${to}`,
    from: (time: string) => `from ${time}`,
    you: 'You',
    pin: (time: string) => `Take it at ${time}`,
    edit: (driver: string) => `Edit the ride of ${driver}`,
    barLabel: (driver: string, when: string, origin: string, destination: string, pax: number) =>
      `${driver}, ${when}, ${origin} to ${destination}, ${enPlural(pax, 'passenger', 'passengers')}`,
    book: (car: string, from: string, to: string) => `Book ${car}, free ${from} to ${to}`,
    pick: 'Tap a ride on the plan to open it here.',
    shape: 'Show the day as',
    clock: 'Clock',
    timeline: 'Timeline',
    map: 'Map',
    overview: 'The whole day',
  },

  fab: { addRide: 'Add ride' },

  sidebar: {
    cars: 'Shared cars',
    carState: 'Car status',
    people: 'People',
    places: 'Places',
    guide: 'Shared car guide',
    closeMenu: 'Close menu',
    admin: 'Manage',
    settings: 'Settings',
    help: 'Help',
  },

  install: {
    title: 'Install Karpul',
    body: 'It opens from your home screen like any other app, full screen and offline.',
    go: 'Install',
    later: 'Not now',
    gotIt: 'Got it',
    iosShare: 'Tap Share in the browser bar',
    iosAdd: 'Choose Add to Home Screen',
    menu: 'Install the app',
    done: 'Karpul is on your home screen',
  },

  myRides: {
    title: 'Your rides',
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
    feedHint: 'Subscribe in your calendar app. Anyone with this address sees your rides.',
    feedNew: 'New address',
    feedNewHint: 'The old address stops working.',
    feedChanged: 'The calendar address changed. Subscribe to the new one.',
    asDriver: 'Driver',
    asPassenger: 'Passenger',
    pax: (n: number) => enPlural(n, 'passenger', 'passengers'),
    route: (origin: string, destination: string) => `${origin} to ${destination}`,
  },

  notif: {
    title: 'Notifications',
    enable: 'Turn on',
    disable: 'Turn off',
    push: 'Push notifications',
    on: 'On, for this browser.',
    off: 'Off.',
    kinds: 'What to tell you',
    kindsOff: 'Takes effect once notifications are on.',
    category: {
      seats: ['Seats', 'Someone gets in or out, or a seat frees up for you'],
      changes: ['Ride changes', 'A ride you are in moves, runs late or is removed, or you are put down to drive'],
      reminders: ['Reminders', 'Before you leave, and to note the odometer when a shared car is back'],
      messages: ['Messages', 'Someone writes in the thread of your ride'],
      requests: ['Ride requests', 'Someone asks for a ride on a road you drive, or a driver offers you the one you asked for'],
      approvals: ['Shared-car approvals', 'An ask past the share, and the answer to yours'],
      cars: ['Shared-car reports', 'Someone reports a problem with a shared car'],
    } as Record<PushCategory, [string, string]>,
    lead: 'Before you leave',
    leadChoice: (minutes: number) => `${minutes} min`,
    device: 'On this device',
    updates: 'New version notice',
    updatesHint: 'The card and the bolt when an update is ready. Off, the app updates itself the next time you open it.',
    unsupported: 'This browser cannot show push notifications. On an iPhone, install Karpul to the home screen first, then try again.',
    unavailable: 'Push is not set up on this server.',
    denied: 'The browser has blocked notifications for this site. Allow them in the site settings, then try again.',
  },

  support: {
    title: 'Contact support',
    call: 'Call',
    email: 'Email',
    stuck: 'Not working?',
    topics: {
      car: { title: 'Car issues', body: 'The car will not charge, start or open, a warning light, damage, the charging card.' },
      app: { title: 'App issues', body: 'Karpul shows something wrong, will not let you sign in or book, or crashes.' },
      org: { title: 'Organizational issues', body: 'Who may take a shared car, the rules, approvals and anything else about the arrangement.' },
    } as Record<SupportTopic, { title: string; body: string }>,
  },

  feedback: {
    title: 'Report a bug or send feedback',
    kind: 'What is it',
    bug: 'Bug',
    idea: 'Idea',
    bugLabel: 'What went wrong',
    ideaLabel: 'Your idea',
    bugPlaceholder: 'What you did, what you expected and what happened instead.',
    ideaPlaceholder: 'What would make Karpul better for you?',
    send: 'Send',
    hint: 'Opens your email app with the message ready. Your account name, the browser and the screen size go along to help find the problem.',
  },

  auth: {
    tagline: 'Rides your colleagues share, in one place.',
    signIn: 'Sign in',
    signUp: 'Create account',
    signInTab: 'Sign in',
    signUpTab: 'Register',
    login: 'Username or email',
    username: 'Username',
    usernameHint: 'Lowercase letters, digits, dot, dash or underscore.',
    email: 'Email',
    emailHint: 'Only for signing in with it instead of your username.',
    phone: 'Mobile phone',
    phoneHint: 'Shown on the rides you drive, so your passengers can call you.',
    optional: 'optional',
    firstName: 'First name',
    lastName: 'Surname',
    password: 'Password',
    passwordHint: 'At least 8 characters.',
    submitSignIn: 'Sign in',
    submitSignUp: 'Create account',
    working: 'Just a moment…',
    switchToSignUp: 'No account yet? Register',
    switchToSignIn: 'Already registered? Sign in',
    fillIn: 'Fill in every field to continue.',
    forgot: 'Forgot your password? Ask an admin for a reset link.',
  },

  /** A password reset link from an admin: components/AuthGate.tsx, `reset` mode. */
  reset: {
    title: 'Set a new password',
    greeting: (name: string) => `Hi ${name}. Pick a new password; every browser signed in to your account is signed out.`,
    newPassword: 'New password',
    submit: 'Set password',
    expired: 'This link has expired or was already used. Ask an admin for a new one.',
    backToSignIn: 'Back to sign in',
  },

  account: {
    title: 'Your account',
    handle: (handle: string) => `@${handle}`,
    nameSection: 'Your name',
    emailSection: 'Email',
    phoneSection: 'Mobile phone',
    passwordSection: 'Password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    passwordHint: 'Changing it signs your other browsers out.',
    changePassword: 'Change password',
    saved: 'Account updated',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    memberSince: (date: string) => `With Karpul since ${date}`,
    otherBrowsers: 'Other browsers',
    signOutOthers: 'Sign out everywhere else',
    othersSignedOut: (n: number) => (n === 0 ? 'No other browser was signed in.' : `${enPlural(n, 'browser', 'browsers')} signed out.`),
    addPhoto: 'Add a photo',
    changePhoto: 'Change photo',
    removePhoto: 'Remove photo',
    photoHint: 'Everyone signed in to Karpul sees it next to your name.',
    photoUnreadable: 'That file could not be read as a picture.',
    photoSaving: 'Saving the photo…',
    usePhoto: 'Use this photo',
    cropArea: 'Photo crop. Drag or use the arrow keys to move it, + and − to zoom.',
    cropZoom: 'Zoom',
    cropHint: 'The square is what is saved; the circle is how it shows next to your name.',
  },

  you: {
    title: 'You',
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
    stopAddStops: 'Stop passengers adding pickup points',
    letAddStops: 'Let passengers add pickup points',
    duplicate: 'Duplicate ride',
    removeRide: 'Remove ride',
    duplicateMine: 'Duplicate as my ride',
    driver: 'Driver',
    callDriver: 'Call the driver',
    lateAsk: 'Running late?',
    lateChoice: (minutes: number) => `${minutes} min`,
    lateTell: (minutes: number) => `Tell the car you are ${minutes} min late`,
    you: 'You',
    rideOptions: 'Ride options',
    leaves: 'Leaves',
    returns: 'Returns',
    oneWay: 'One way',
    from: 'From:',
    to: 'To:',
    companyCar: 'Shared car',
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
    /** A shared car past the driver's one a week: waiting for an admin, or let through. */
    awaiting: 'Awaiting approval',
    approved: 'Approved',
    approvalAsk: (driver: string) => `${driver} asks for a shared car past their one a week. Your call.`,
    needsDriver: 'Needs a driver',
    takeOverAsk: (driver: string) => `${driver} can't drive. Will you take the car?`,
    takeOverWait: (driver: string) => `${driver} can't drive. The passengers are asked whether one of them will.`,
    takeOver: "I'll drive",
    coffee: 'Coffee',
    coffeePlease: (first: string) => `${first} would appreciate one`,
    coffeeYou: 'You would appreciate one',
    /** The driver is a name with no account behind it (the shared car's paper log). */
    noAccount: 'No account',
    claimAsk: (driver: string) => `Is this you? ${driver} has no account yet. Claiming it makes every ride under this name yours.`,
    claim: 'This is me',
    approve: 'Approve',
    decline: 'Decline',
    pickup: 'Pickup',
    getInAt: 'Get in at',
    start: 'Start',
    getsInAt: (place: string) => `Gets in at ${place}`,
    changePickup: 'Change pickup',
    elsewhere: 'Somewhere else…',
    newPlace: 'new pickup point',
    newPickup: 'New pickup point',
    newPickupPlaceholder: 'e.g. Futog, the bus stop',
    whereOnRoute: 'Where on the way',
    slotFirst: (place: string) => `Before ${place}`,
    slotBetween: (from: string, to: string) => `${from} → ${to}`,
    beforeStart: 'Before the start',
    backAt: (time: string) => `Back ${time}`,
    addStop: 'Add a pickup point',
    chipIn: (amount: string) => `${amount} per seat`,
    distance: (km: number) => `${km} km one way`,
    removeName: (name: string) => `Remove ${name}`,
    leave: 'Leave',
    addByName: 'Add a passenger by name',
    passengerName: "Passenger's name",
    colleagueName: "Colleague's name",
    full: 'This car is full.',
    waitFor: 'Wait for a seat',
    waitHint: 'The first seat that frees up is yours, with a notification.',
    inLine: (n: number) => (n === 1 ? "You're first in line for a seat." : `You're number ${n} in line for a seat.`),
    stopWaiting: 'Stop waiting',
    waitingTitle: 'Waiting for a seat',
    removeFromLine: (name: string) => `Take ${name} off the waiting list`,
  },

  /** A ride's thread: components/RideThread.tsx. */
  thread: {
    title: 'Messages',
    show: (n: number) => (n === 0 ? 'Write to the car' : `Messages (${n})`),
    hide: 'Hide messages',
    empty: 'A late start, a detour, a question before getting in: write it here.',
    placeholder: 'Write a message',
    send: 'Send',
    remove: 'Remove message',
    late: (minutes: number) => `Running ${minutes} min late`,
  },

  /** Asking for a ride nobody offers yet: components/RequestForm.tsx and RequestList.tsx. */
  requests: {
    title: 'Looking for a ride',
    ask: 'Ask for a ride',
    formTitle: 'Ask for a ride',
    day: 'Day',
    around: 'Around',
    from: 'From',
    to: 'To',
    note: 'Note',
    notePlaceholder: 'e.g. any time before 9',
    submit: 'Ask',
    offer: 'Offer a ride',
    withdraw: 'Withdraw',
    aroundTime: (time: string) => `around ${time}`,
    yours: 'Your request',
    answering: (name: string) => `Offering a ride to ${name}`,
    answeringHint: 'They get a seat in this ride and a notification.',
  },

  form: {
    returnAfter: 'Return time must be after departure time',
    editTitle: 'Edit ride',
    addTitle: 'Add ride',
    saveChanges: 'Save changes',
    deleteRide: 'Delete ride',
    driver: 'Driver',
    drivenBy: 'Drives it',
    pickDriver: (name: string) => `Driver: ${name}. Choose someone else`,
    pickDriverTitle: 'Who drives',
    searchPeople: 'Search people',
    noPeople: 'Nobody by that name.',
    /** The two depths of the form: the short one and the one with everything. */
    detailLevel: 'Level of detail',
    simple: 'Simple',
    advanced: 'Advanced',
    /** The foot of the simple form, naming what it is carrying out of sight. */
    alsoSet: (what: string) => `Also set: ${what}`,
    sumRepeat: 'repeats weekly',
    sumStops: (n: number) => enPlural(n, 'pickup point', 'pickup points'),
    sumManage: 'passengers manage the list',
    sumNoNewStops: 'no new pickup points',
    sumDistance: 'distance',
    sumChipIn: 'chip in',
    sumCoffee: 'coffee',
    sumNotes: 'a note',
    car: 'Car',
    companyCar: 'Shared car',
    myOwnCar: 'My own car',
    whichCar: 'Which shared car',
    carHint: (plate: string, seats: number) => `${plate} · ${enPlural(seats, 'seat', 'seats')}`,
    yourCar: 'Your car',
    carPlaceholder: 'e.g. grey Octavia',
    seats: 'Passenger seats',
    fewer: 'Fewer seats',
    more: 'More seats',
    alreadyBooked: (n: number) => `${n} already booked, so it can't go lower.`,
    passengerList: 'Passenger list',
    canManage: 'Passengers can add and remove each other',
    canAddStops: 'Passengers can add pickup points',
    addStopsOn: 'A passenger can put a place of their own on the route when getting in.',
    addStopsOff: 'Passengers pick from the pickup points already on the route.',
    manageOn: 'Anyone in the car can put a colleague in or take one out. You can still do both.',
    manageOff: 'Only you can put others in or take them out. Anyone can still get in or leave on their own.',
    /** The same two, for an admin on someone else's ride: it is the driver's list, not theirs. */
    manageOnFor: (driver: string) => `Anyone in the car can put a colleague in or take one out. ${driver} can still do both.`,
    manageOffFor: (driver: string) => `Only ${driver} (and an admin) can put others in or take them out. Anyone can still get in or leave on their own.`,
    when: 'When',
    departs: 'Departs',
    day: 'Day',
    departureTime: 'Departure time',
    returns: 'Returns',
    oneWay: 'One way',
    returnDay: 'Return day (same day)',
    returnTime: 'Return time',
    route: 'Route',
    from: 'From',
    to: 'To',
    stopTag: 'Stop',
    pickup: 'Pickup location',
    pickupPlaceholder: 'e.g. Main St. Parking',
    dropoff: 'Drop-off location',
    dropoffPlaceholder: 'e.g. Office',
    notes: 'Notes',
    optional: '(optional)',
    notesPlaceholder: 'Meeting point, detours, luggage…',
    repeatWeekly: 'Repeat every week',
    /** Under the "one a week" refusal: add it anyway, for an admin to approve. */
    askApproval: 'Ask an admin to approve it',
    askApprovalHint: 'The ride is added as waiting. The admins are told and can let it through.',
    repeatUntil: 'Until',
    repeatCount: (n: number) => `${enPlural(n, 'ride', 'rides')}, one a week, same weekday.`,
    repeatMax: 'Up to 26 weeks ahead.',
    stops: 'Extra pickup points',
    stopsHint: 'Up to 6 places, before the start or on the way, where a passenger can get in. Passengers can add their own.',
    addStop: 'Add a pickup point',
    addStopBefore: 'Add a pickup point before the start',
    beforeTag: 'First',
    stopPlaceholder: 'e.g. Liman bus stop',
    removeStop: 'Remove this pickup point',
    distance: 'Distance',
    distanceHint: 'One way, for the "km shared" figures.',
    chipIn: 'Chip in',
    chipInPlaceholder: 'e.g. 300 din',
    chipInHint: 'Per seat, and only the agreement: nothing is charged here. Both optional.',
    coffee: "I'd appreciate a coffee",
    /** Pre-filled destination on the very first ride in this browser. */
    defaultDestination: 'Office',
    /** The road between the offices is a known length (lib/offices.ts). */
    knownRoad: (km: number) => `${km} km, the road between the offices. Filled in for you.`,
    roadKm: (km: string) => `${km} km by road between the pins. Filled in for you.`,
    /** A one-way ride: offer its mirror image. */
    wayBack: 'Add the way back too',
    wayBackHint: 'A second one-way ride with the route reversed.',
    wayBackDay: 'Day back',
    wayBackLeaves: 'Leaves at',
  },

  admin: {
    title: 'Shared cars',
    seats: (n: number) => enPlural(n, 'seat', 'seats'),
    retired: 'Retired',
    optionsFor: (name: string) => `Options for ${name}`,
    retire: 'Retire',
    restore: 'Restore',
    addCar: 'Add car',
    addCompanyCar: 'Add shared car',
    name: 'Name',
    namePlaceholder: 'e.g. Skoda Octavia',
    plate: 'Plate',
    platePlaceholder: 'FIRM-004',
    home: 'Departs from',
    homePlaceholder: 'e.g. Novi Sad office',
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
    noUsage: 'No shared-car rides in this window.',
    retired: 'Retired',
    pax: (n: number, seats: number) => `${n} of ${seats}`,
    download: 'Download as a spreadsheet',
  },

  /** The admin's list of accounts: components/PeopleAdmin.tsx. */
  people: {
    title: 'People',
    count: (n: number) => enPlural(n, 'account', 'accounts'),
    search: 'Search people',
    admin: 'Admin',
    adminByConfigHint: 'Set on the server (KARPUL_ADMINS); it can only be changed there.',
    makeAdmin: 'Make admin',
    removeAdmin: 'Remove admin',
    resetLink: 'Password reset link',
    resetLinkFor: (name: string) => `Reset link for ${name}`,
    resetLinkHint: (date: string) => `One use, until ${date}. Send it to them yourself; it is shown only now, and any older link stops working.`,
    optionsFor: (name: string) => `Options for ${name}`,
    you: 'You',
    deleteAccount: 'Delete account',
    removePhoto: 'Remove photo',
    deleteTitle: (name: string) => `Delete ${name}'s account?`,
    deleteBody:
      'Their coming rides are cancelled (the passengers are told), their seats go to whoever is waiting, and their requests are withdrawn. Past rides keep their name. This cannot be undone.',
  },

  /** The shared-car rides waiting for an admin: components/Approvals.tsx. */
  approvals: {
    title: 'Approvals',
    empty: 'Nothing waiting.',
    count: (n: number) => `${n} waiting`,
    open: 'Open the ride',
  },

  /** The admin's log: components/AdminLog.tsx, backend app/audit.py. */
  adminLog: {
    title: 'Admin log',
    empty: 'Nothing yet.',
    older: 'Show older',
    openRide: 'Open the ride',
    yes: 'yes',
    no: 'no',
    none: 'nothing',
    line: (action: string, admin: string, subject: string): string => {
      switch (action) {
        case 'ride_added':
          return `${admin} added a ride for ${subject}`
        case 'ride_edited':
          return `${admin} edited a ride of ${subject}`
        case 'ride_removed':
          return `${admin} removed a ride of ${subject}`
        case 'seat_added':
          return `${admin} put someone in the car of ${subject}`
        case 'seat_removed':
          return `${admin} took someone out of the car of ${subject}`
        case 'car_added':
          return `${admin} added the shared car ${subject}`
        case 'car_edited':
          return `${admin} changed the shared car ${subject}`
        case 'car_removed':
          return `${admin} deleted the shared car ${subject}`
        case 'admin_granted':
          return `${admin} made ${subject} an admin`
        case 'admin_revoked':
          return `${admin} took the admin role from ${subject}`
        case 'reset_link':
          return `${admin} made a password reset link for ${subject}`
        case 'account_deleted':
          return `${admin} deleted the account of ${subject}`
        case 'photo_removed':
          return `${admin} removed the photo of ${subject}`
        case 'place_moved':
          return `${admin} changed the place ${subject}`
        case 'place_removed':
          return `${admin} forgot the place ${subject}`
        default:
          return `${admin}: ${action} ${subject}`
      }
    },
    fields: {
      ride_date: 'Day',
      departure_time: 'Leaves',
      return_time: 'Back',
      origin: 'From',
      destination: 'To',
      stops: 'Stops',
      stops_before: 'Stops before the start',
      seats: 'Seats',
      car_type: 'Car',
      car_name: 'Car',
      notes: 'Note',
      passengers_manage: 'Passengers manage seats',
      passengers_add_stops: 'Passengers add pickup points',
      coffee_please: 'Coffee welcome',
      distance_km: 'Distance (km)',
      chip_in: 'Chip in',
      passenger: 'Passenger',
      weeks: 'Weeks',
      name: 'Name',
      plate: 'Plate',
      passenger_seats: 'Passenger seats',
      active: 'In the pool',
      home: 'Departs from',
      pins: 'Pins moved',
      home_pin: 'Pin of where it departs from',
      pin: 'Pin moved',
      rides: 'Coming rides moved with it',
    } as Record<string, string>,
  },

  /** The admin's table of every ride: components/RideLog.tsx. */
  rideLog: {
    title: 'All rides',
    upcoming: 'Upcoming',
    past: 'Past',
    from: 'From',
    to: 'To',
    kind: 'Cars',
    kindAll: 'All cars',
    kindCorporate: 'Shared cars',
    kindOwn: 'Own cars',
    search: 'Search driver, passenger, place or car',
    col: {
      date: 'Date',
      departs: 'Leaves',
      back: 'Back',
      driver: 'Driver',
      phone: 'Driver phone',
      car: 'Car',
      type: 'Type',
      from: 'From',
      stops: 'Stops',
      to: 'To',
      seats: 'Seats',
      taken: 'Taken',
      passengers: 'Passengers',
      waiting: 'Waiting',
      km: 'km',
      chipIn: 'Chip in',
      note: 'Note',
      odometer: 'Odometer',
      odoStart: 'Odometer out',
      odoEnd: 'Odometer back',
      driven: 'Driven (km)',
      atWheel: 'At the wheel',
    },
    company: 'Company',
    own: 'Own',
    oneWay: 'one way',
    none: 'No rides between these dates.',
    noMatch: 'No ride matches the filters.',
    totals: (rides: number, pax: number, km: number, driven: number) =>
      `${enPlural(rides, 'ride', 'rides')} · ${enPlural(pax, 'passenger', 'passengers')} · ${km.toLocaleString('en')} km` +
      (driven > 0 ? ` · ${driven.toLocaleString('en')} km driven in shared cars` : ''),
    sortBy: (column: string) => `Sort by ${column}`,
    download: 'Download as a spreadsheet',
  },

  odo: {
    title: 'Kilometres',
    reading: 'Odometer (km)',
    atWheel: 'At the wheel',
    handOverTo: 'Who takes the wheel',
    noteStart: 'Note the start',
    handOver: 'Hand over',
    back: 'Car is back',
    undo: 'Undo the last entry',
    driving: 'driving',
    total: (km: string) => `${km} km driven`,
    hint: 'Note the odometer when you take the car, at every change of driver and when it is back.',
    notNoted: 'Not noted yet.',
    tooLow: (km: string) => `The odometer read ${km} km before this.`,
    /** Bringing the car back: how it was left. */
    howLeft: 'How you leave it',
    soc: 'Battery (%)',
    cleanness: 'Clean?',
    clean: 'Clean',
    dirty: 'Needs a wash',
    notChecked: 'Not checked',
    issues: 'Anything wrong?',
    issuesPlaceholder: 'e.g. warning light, scratch on the left door',
  },

  /** The state of each shared car: components/CarStatus.tsx (backend: app/carstate.py). */
  carState: {
    title: 'Car status',
    odometer: 'Odometer',
    battery: 'Battery',
    cleanTitle: 'Clean',
    unknown: 'Not known',
    km: (km: string) => `${km} km`,
    pct: (n: number) => `${n} %`,
    about: (text: string) => `about ${text}`,
    estimated: 'Guessed from the rides since the last reading.',
    cleanYes: 'Clean',
    cleanNo: 'Needs a wash',
    issues: 'Reported',
    noIssues: 'Nothing wrong reported.',
    noted: (name: string, when: string) => `${name}, ${when}`,
    report: 'Report on this car',
    reportTitle: (car: string) => `Report on ${car}`,
    reportSent: 'Noted. Thanks.',
    odometerField: 'Odometer (km)',
    noCars: 'No shared cars.',
    recent: 'Recent reports',
    fromRide: 'with the return',
    nothingSaid: 'Say at least one thing.',
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
    awaiting: 'Awaiting approval',
    needsDriver: 'Needs a driver',
    seats: (n: number) => enPlural(n, 'seat', 'seats'),
    stops: (n: number) => enPlural(n, 'stop', 'stops'),
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

  time: { hour: 'Hour', minute: 'Minute' },

  confirm: {
    removeRideTitle: 'Remove this ride?',
    removeRidePax: (n: number) => `${n} passenger${n === 1 ? ' is' : 's are'} in this car. They will lose their seat.`,
    handOverPax: (n: number) =>
      `${n} passenger${n === 1 ? ' is' : 's are'} in this car. They will be asked whether one of them drives it; if nobody does by departure, the ride is off.`,
    removeRideBody: (driver: string, car: string, date: string) =>
      `${driver}'s ride in the ${car} will be removed from ${date}.`,
    declineTitle: 'Decline this ride?',
    declineBody: (driver: string) => `The ride is removed and ${driver} is told it was declined. Any passengers are told too.`,
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
    manageOffFor: (driver: string) => `Only ${driver} manages the passenger list now.`,
    rideRemoved: 'Ride removed.',
    handedOver: 'Your passengers are asked whether one of them drives.',
    tookOver: "You're driving now.",
    rideUpdated: 'Ride updated.',
    rideAdded: 'Ride added.',
    rideAddedFor: (name: string) => `Ride added for ${name}.`,
    rideAwaiting: 'Added. The admins are asked to approve it.',
    rideApproved: (driver: string) => `Approved. ${driver} has the car.`,
    claimed: (n: number) => (n === 1 ? 'The ride is yours now.' : `${n} rides are yours now.`),
    lateSaid: (minutes: number) => `The car knows you're ${minutes} min late.`,
    rideDeclined: 'Declined. The ride is removed.',
    ridesAdded: (n: number) => `${n} rides added, one a week.`,
    ridesRemoved: 'Rides removed.',
    linkCopied: 'Link copied.',
    pickupChanged: (place: string) => `You get in at ${place}.`,
    stopAdded: (place: string) => `${place} is on the route.`,
    addStopsOn: 'Passengers can add pickup points now.',
    addStopsOff: 'Passengers can no longer add pickup points.',
    notifOn: 'Notifications are on.',
    notifOff: 'Notifications are off.',
    rideNotFound: 'That ride is gone.',
    carAdded: (name: string) => `${name} added to the pool.`,
    carDeleted: (name: string) => `${name} deleted.`,
    waiting: (n: number) => (n === 1 ? "You're first in line for a seat." : `You're number ${n} in line for a seat.`),
    stoppedWaiting: 'You left the waiting list.',
    requestAdded: 'Asked. Drivers see it on the board.',
    requestWithdrawn: 'Request withdrawn.',
    requestAnswered: (name: string) => `Ride added, and ${name} is in.`,
    madeAdmin: (name: string) => `${name} is an admin now.`,
    removedAdmin: (name: string) => `${name} is no longer an admin.`,
    deletedAccount: (name: string) => `${name}'s account is deleted.`,
    photoRemoved: (name: string) => `${name}'s photo is removed.`,
    updateReady: 'A new version is ready',
    updateHint: 'Trace the bolt to take it.',
    updateAction: 'Update',
    bothAdded: 'Both rides added, there and back.',
    wayBackFailed: (msg: string) => `The ride is added, but not the way back: ${msg}`,
  },

  /** Taking a waiting build: components/UpdateScreen.tsx and the bolt you trace. */
  update: {
    title: 'A new version is ready',
    lead: 'Trace the bolt to charge it up.',
    slip: 'Start at the top and stay on the line.',
    charged: 'Charged. Refreshing.',
    plain: 'Update without the trace',
  },

  empty: {
    noRidesDay: 'No rides on this day yet',
    noUpcoming: 'No upcoming sessions yet',
    noRidesWent: 'No rides went on this day',
  },

  carousel: { label: 'Rides', scrollLeft: 'Scroll rides left', scrollRight: 'Scroll rides right' },

  share: {
    title: (driver: string, origin: string, destination: string) => `${driver} drives ${origin} to ${destination}`,
  },

  powertrain: { electric: 'Electric', hybrid: 'Hybrid', diesel: 'Diesel', petrol: 'Petrol' } as Record<PowertrainKind, string>,

  guide: {
    title: 'Shared car guide',
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

  howTo: {
    title: 'How to use Karpul',
    menu: 'How to use Karpul',
    topics: [
      {
        title: 'Find your way around',
        steps: [
          '**Upcoming** lists every ride for the next 90 days, a heading per day. **Week** is one week, a day at a time. **Day** shows who has which shared car when.',
          'The green **+** (on a computer, **Add ride** at the top right) adds a ride.',
          'The ☰ menu holds your account, **Your rides**, **Car status**, help and settings.',
          'The lamp in the top bar is lit while the board is live: what colleagues do shows up as it happens.',
        ],
      },
      {
        title: 'Get a seat in a car',
        steps: [
          'In **Upcoming**, tap **Free seats** to hide full cars, or search for a place or a driver.',
          'Tap a ride to open it. If it has pickup points, choose yours in **Get in at**; **Somewhere else…** adds a new place to the route.',
          'Tap **Get in this car**. The driver is told.',
          '**Leave** takes you out. Already in a car that day? Another car offers **Switch to this car**.',
          'In **Week** you can also drag your chip onto a car. On a phone, hold it for a moment until it lifts.',
        ],
      },
      {
        title: 'The car is full',
        steps: [
          'Tap **Wait for a seat**. The first seat that frees up is yours, with a notification.',
          'A seat in another car that day takes you off the queue. **Stop waiting** does it by hand.',
        ],
      },
      {
        title: 'Offer a ride',
        steps: [
          'Tap **+**. Pick **Shared car** or **My own car**, the passenger seats, the day, the times and the route, then **Add ride**.',
          '**One way** removes the return time and offers **Add the way back too** for another day.',
          '**Advanced** adds a weekly repeat (up to 26 weeks), pickup points, distance, chip-in, coffee and a note. Chip-in is only the agreement: nothing is charged here.',
          'Your ride\'s ⋮ menu edits, duplicates, shares or removes it. Your passengers are told when it moves or is removed.',
          'On the card you can add a passenger by name, take one out and add a pickup point.',
        ],
      },
      {
        title: 'Places on the map',
        maps: true,
        steps: [
          'Type a place and pick it from the suggestions: the offices, the shared cars\' homes and places colleagues used before. A suggestion puts the place on the map too.',
          'The **Map** button beside a place opens the place picker: tap one of the **Saved places**, or search for an address. An address or **Pick on the map** opens a big map: move it until the ring is on the spot and tap **Use this point**. **Use my location** starts where you are.',
          'A pin is optional. Everyone in Karpul can see it, so a corner or a landmark is better than your front door.',
          'On a ride, the map button beside each place opens it in your maps app. **Show on map** draws the whole route; **Open the route in Maps** in the ⋮ menu starts the navigation.',
          'Asked for a ride with a pinned start? A car passing close by offers to pick you up there.',
        ],
      },
      {
        title: 'Shared cars',
        steps: [
          'A shared car cannot be double-booked. **Day** shows when each one is free; tap a free stretch to book it.',
          'Each person gets one shared-car ride a day and one a week, and no more than 24 hours in a row. Past that, **Ask an admin to approve it**. A ride awaiting approval does not hold the car.',
          'Before your first drive, read the **Shared car guide**: charging with the company card and the Mazda 6e.',
          'In the car, note the odometer: **Note the start**, **Hand over** when someone else drives, **Car is back** with the battery and anything wrong.',
          '**Car status** shows each car\'s odometer, battery and reported problems. **Report on this car** tells the admins.',
          'Can\'t drive after all? Remove the ride: if colleagues are in it, it keeps the car and asks them. The first to tap **I\'ll drive** takes it over.',
        ],
      },
      {
        title: 'No car going your way',
        steps: [
          'Tap **Ask for a ride**: the day, roughly when, from and to.',
          'Drivers who drive that way are notified, and anyone can **Offer a ride** from the board. You get the seat and a notification.',
        ],
      },
      {
        title: 'Messages',
        steps: [
          'Every ride has **Messages**. Everyone in the car is told when you write: a late start, a detour, a big suitcase.',
          'Driving and late? On the day, **Running late?** on your ride takes one tap: **5 min**, **10 min** or **15 min**. The passengers are told and it goes in the messages.',
        ],
      },
      {
        title: 'Notifications and calendar',
        steps: [
          'Settings, **Notifications**: **Turn on**, then choose what to hear about and how long before you leave to be reminded.',
          'On an iPhone, add Karpul to the home screen first (Share, **Add to Home Screen**).',
          '**Add to calendar** in a ride\'s ⋮ menu saves that ride. **Your rides** has a calendar feed address with all of your rides; keep it to yourself.',
          '**Share ride** sends a link that opens the ride for a colleague.',
        ],
      },
      {
        title: 'Your account',
        steps: [
          'Tap your name at the top of the menu to add a photo, change your name, phone or password, or sign out.',
          'Your phone number is shown on the rides you drive, so passengers can call you.',
          'Forgot your password? Ask an admin for a reset link.',
          'When a new version is ready, a card says so: trace the bolt, or use the plain button.',
        ],
      },
      {
        title: 'For admins',
        admin: true,
        steps: [
          '**Approvals** lists shared-car rides waiting for an answer. **Approve** books the car; **Decline** removes the ride.',
          'An admin can edit or remove any ride and manage its seats. In the ride form, tap the driver line to add a ride in someone else\'s name.',
          '**Shared cars** adds, edits and retires pool cars; its **Usage** tab shows how they are used.',
          '**People** makes admins, issues a password reset link (pass it on yourself) and deletes accounts.',
          '**All rides** is every ride in a date range, with a spreadsheet download. **Admin log** lists every change made to someone else\'s ride, a car or an account.',
        ],
      },
    ] as HowToTopic[],
    more: 'Still stuck?',
  },

  /** Server error texts are English; this is the identity for English. */
  /** Places on the map: components/MapView.tsx, MapPicker, PlaceInput, RouteMap, PlacesAdmin. */
  map: {
    loading: 'Loading the map…',
    failed: 'The map did not load.',
    noLocation: 'Your location is not available.',
    locating: 'Finding you…',
    myLocation: 'Use my location',
    usePoint: 'Use this point',
    moveHint: 'Move the map to put the pin on the exact spot. Everyone in Karpul can see it.',
    mapButton: 'Map',
    pinnedShort: 'Pinned',
    searchAddress: 'Search for an address',
    searchPlaceholder: 'Street and number, or a place',
    privacy: 'Everyone in Karpul can see this point. A corner or a landmark near your home is enough.',
    sourceOffice: 'Office',
    sourceCar: 'Shared car',
    sourceLearned: 'Used before',
    pickOnMap: 'Pick on the map',
    pinned: 'On the map',
    movePin: (place: string) => `Move the pin of ${place}`,
    pinFor: (place: string) => `Pin ${place}`,
    routeOf: (from: string, to: string) => `${from} to ${to}`,
    roadIs: (km: number, minutes: number) => `${km} km by road, about ${minutes} min.`,
    notPinned: 'Not on the map:',
    navigate: 'Open the route in Maps',
    toMyPickup: 'Directions to my pickup',
    openPlace: (place: string) => `Open ${place} in Maps`,
    showMap: 'Show on map',
    hint: (place: string, nearBy: string) => `Your request starts at ${place}, near ${nearBy} on this route.`,
    hintGetIn: (place: string) => `Get in at ${place}`,
    places: 'Places',
    kindOffice: 'Office',
    kindCarHome: 'Shared car home',
    kindLearned: 'Pinned on a ride',
    uses: (n: number) => enPlural(n, 'ride', 'rides'),
    move: 'Move',
    rename: 'Rename',
    forget: 'Forget',
    forgetHint: 'It is no longer suggested. Rides keep their pins.',
    noPlaces: 'No places yet.',
    placeName: 'Name',
    homePin: 'On the map',
    noPin: 'Not on the map',
    dayEmpty: 'No pinned places this day.',
    dayLabel: (day: string) => `Pickup points on ${day}`,
    saved: (place: string) => `${place} saved.`,
    searchPlaces: 'Search places and addresses',
    searchPlacesPlaceholder: 'A saved place, a street and number',
    savedPlaces: 'Saved places',
    addresses: 'Addresses',
    noSaved: 'No saved places yet. Search for an address or pick a spot on the map.',
    nothingFound: 'Nothing found. Try another spelling, or pick the spot on the map.',
    movePinShort: 'Move the pin on the map',
    namePlaceholder: 'e.g. Petrol station on Zemunska',
    nameNeeded: 'Give this place a name.',
  },

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
  // Not the server's: lib/api.ts says this when no answer came back at all.
  [/^No connection to the server$/, () => 'Nema veze sa serverom'],
  [/^Booking not found$/, () => 'Rezervacija nije pronađena'],
  [/^Corporate car not found$/, () => 'Zajednički auto nije pronađen'],
  [/^This point is outside the area Karpul covers$/, () => 'Ova tačka je van područja koje Karpul pokriva'],
  [/^Place not found$/, () => 'Mesto nije pronađeno'],
  [/^Maps are not switched on for you yet$/, () => 'Mape ti još nisu uključene'],
  [/^(.+) is already a known place$/, (m) => `${m[1]} je već poznato mesto`],
  [/^No road finder is set up$/, () => 'Pretraga puta nije podešena'],
  [/^No road found between these points$/, () => 'Nema puta između ovih tačaka'],
  [/^A road needs (\d+) to (\d+) points$/, (m) => `Za put je potrebno od ${m[1]} do ${m[2]} tačaka`],
  [/^`via` is lat,lng pairs separated by semicolons$/, () => '`via` su parovi lat,lng odvojeni tačkom i zarezom'],
  [/^You already have a shared car this week\. An admin can approve another$/, () => 'Već imaš zajednički auto ove sedmice. Administrator može da odobri još jedan'],
  [/^You already have a shared car that day\. An admin can approve another$/, () => 'Već imaš zajednički auto tog dana. Administrator može da odobri još jedan'],
  [/^That keeps a shared car with you for more than 24 hours in a row\. An admin can approve it$/, () => 'Tako bi zajednički auto bio kod tebe duže od 24 sata zaredom. Administrator može da to odobri'],
  [/^This ride is not waiting for approval$/, () => 'Ova vožnja ne čeka odobrenje'],
  [/^This ride already has a driver$/, () => 'Ova vožnja već ima vozača'],
  [/^Only a passenger in this car can take it over$/, () => 'Samo putnik u ovom autu može da je preuzme'],
  [/^This ride's driver already has an account$/, () => 'Vozač ove vožnje već ima nalog'],
  [/^(.+) is not a name like yours$/, (m) => `Ime ${m[1]} ne liči na tvoje`],
  [/^An admin has to approve this ride first$/, () => 'Administrator prvo mora da odobri ovu vožnju'],
  [/^(.+) is already at the wheel$/, (m) => `${m[1]} je već za volanom`],
  [/^Kilometres are only kept for the shared cars$/, () => 'Kilometraža se vodi samo za zajedničke automobile'],
  [/^Nobody is at the wheel of this car$/, () => 'Niko nije za volanom ovog auta'],
  [/^Nothing has been noted on the odometer$/, () => 'Kilometraža još nije upisana'],
  [/^Say at least one thing about the car$/, () => 'Napiši bar nešto o autu'],
  [/^That car is retired$/, () => 'Taj auto je povučen'],
  [/^Only the driver or an admin can note the odometer at the start$/, () => 'Početnu kilometražu može da upiše samo vozač ili administrator'],
  [/^Only the driver or an admin can undo the odometer$/, () => 'Unos kilometraže može da poništi samo vozač ili administrator'],
  [/^Only the driver, whoever is at the wheel or an admin can note the odometer$/, () => 'Kilometražu može da upiše samo vozač, onaj ko je za volanom ili administrator'],
  [/^The car is already back; undo that to carry on$/, () => 'Auto je već vraćen; poništi taj unos za nastavak'],
  [/^The odometer cannot read less than (.+) km here$/, (m) => `Kilometraža ovde ne može biti manja od ${m[1]} km`],
  [/^The odometer is noted from the day of the ride$/, () => 'Kilometraža se upisuje od dana vožnje'],
  [/^No free seats left$/, () => 'Nema više slobodnih mesta'],
  [/^Only the driver or an admin can cancel this ride$/, () => 'Samo vozač ili administrator može da ukloni ovu vožnju'],
  [/^Only the driver or an admin can edit this ride$/, () => 'Samo vozač ili administrator može da izmeni ovu vožnju'],
  [/^Only an admin can add a ride for someone else$/, () => 'Samo administrator može da doda vožnju za nekog drugog'],
  [/^Only the passenger, the driver or another passenger/, () => 'Ovu rezervaciju može da ukloni samo taj putnik, vozač ili drugi putnik iz ovog auta'],
  [/^Only the passenger or the driver can remove this booking$/, () => 'Ovu rezervaciju može da ukloni samo taj putnik ili vozač'],
  [/^Only the driver or a passenger in this car can add someone$/, () => 'Nekoga može da doda samo vozač ili putnik iz ovog auta'],
  [/^Only the driver can add other passengers to this car$/, () => 'Druge putnike u ovaj auto može da doda samo vozač'],
  [/^Range may not exceed (\d+) days$/, (m) => `Opseg ne može biti duži od ${m[1]} dana`],
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
    (m) => `Taj zajednički auto je ${m[4] ? `${m[4]} ` : 'tog dana '}već zauzet: ${m[1]}, od ${m[2]}${m[3] ? ` do ${m[3]}` : ''}`,
  ],
  [/^Pickup must be the ride's origin or one of its stops$/, () => 'Mesto ulaska mora biti polazak ili jedno od mesta ulaska ove vožnje'],
  [/^A pickup point cannot be the destination$/, () => 'Mesto ulaska ne može biti odredište'],
  [/^The driver does not take new pickup points on this ride$/, () => 'Vozač na ovoj vožnji ne prima nova mesta ulaska'],
  [/^(.+) is already on this ride's route$/, (m) => `${m[1]} je već na putu ove vožnje`],
  [/^This ride already has (\d+) pickup points$/, (m) => `Ova vožnja već ima ${m[1]} mesta ulaska`],
  [/^Only the passenger or the driver can change this booking$/, () => 'Ovu rezervaciju može da izmeni samo taj putnik ili vozač'],
  [/^Push notifications are not configured on this server$/, () => 'Obaveštenja nisu podešena na ovom serveru'],
  // Accounts (app/auth.py, app/routers/auth.py).
  [/^Wrong username or password$/, () => 'Pogrešno korisničko ime ili lozinka'],
  [/^That username is taken$/, () => 'To korisničko ime je zauzeto'],
  [/^That email already has an account$/, () => 'Taj mejl već ima nalog'],
  [/^Another account already goes by (.+)$/, (m) => `Drugi nalog se već zove ${m[1]}`],
  [/^Your session has expired; sign in again$/, () => 'Prijava je istekla, prijavi se ponovo'],
  [/^Sign in first$/, () => 'Prvo se prijavi'],
  [/^Too many attempts; try again in (\d+) min$/, (m) => `Previše pokušaja; pokušaj ponovo za ${m[1]} min`],
  [/^This reset link has expired or was already used$/, () => 'Ovaj link je istekao ili je već iskorišćen'],
  // Admins (app/admin.py, routers/admin.py).
  [/^Only an admin can do that$/, () => 'To može samo administrator'],
  [/^Account not found$/, () => 'Nalog nije pronađen'],
  [/^(.+) is an admin by the server's configuration \(KARPUL_ADMINS\)$/, (m) => `${m[1]} je administrator po podešavanju servera (KARPUL_ADMINS)`],
  [/^There has to be at least one admin$/, () => 'Mora postojati bar jedan administrator'],
  [/^You cannot delete your own account$/, () => 'Ne možeš obrisati sopstveni nalog'],
  // Profile photos (routers/photos.py).
  [/^A photo has to be a JPEG, PNG or WebP image$/, () => 'Fotografija mora biti slika u formatu JPEG, PNG ili WebP'],
  [/^The photo is too big$/, () => 'Fotografija je prevelika'],
  [/^Photo not found$/, () => 'Fotografija nije pronađena'],
  // The waiting list, the thread and the requests (routers/rides.py, routers/requests.py).
  [/^You drive this ride$/, () => 'Ti voziš ovu vožnju'],
  [/^You are already in this car$/, () => 'Već si u ovom autu'],
  [/^You are already waiting for this car$/, () => 'Već čekaš mesto u ovom autu'],
  [/^There are free seats; get in instead$/, () => 'Ima slobodnih mesta; uđi umesto da čekaš'],
  [/^Not on the waiting list$/, () => 'Nije na listi čekanja'],
  [/^Only the person waiting or the driver can do that$/, () => 'To može samo onaj ko čeka ili vozač'],
  [/^Message not found$/, () => 'Poruka nije pronađena'],
  [/^Only the author or the driver can remove this message$/, () => 'Poruku može da ukloni samo onaj ko ju je napisao ili vozač'],
  [/^Only the driver can say the ride is running late$/, () => 'Samo vozač može da javi da vožnja kasni'],
  [/^A ride can only run late on its own day$/, () => 'Kašnjenje se javlja samo na dan vožnje'],
  [/^Ride request not found$/, () => 'Zahtev za prevoz nije pronađen'],
  [/^Someone already answered that request$/, () => 'Neko je već odgovorio na taj zahtev'],
  [/^That is your own request$/, () => 'To je tvoj zahtev'],
  [/^The ride has to be on the requested day$/, () => 'Vožnja mora biti na traženi dan'],
  [/^Offer at least one seat to take the person who asked$/, () => 'Ponudi bar jedno mesto da povezeš onog ko je tražio'],
  [/^That day is already over$/, () => 'Taj dan je već prošao'],
  [/^Ask for a ride at most three months ahead$/, () => 'Prevoz možeš tražiti najviše tri meseca unapred'],
  [/^You already have (\d+) open requests$/, (m) => `Već imaš ${srPlural(Number(m[1]), 'otvoren zahtev', 'otvorena zahteva', 'otvorenih zahteva')}`],
  [/^Only the person who asked can withdraw a request$/, () => 'Zahtev može da povuče samo onaj ko ga je postavio'],
  [/^Calendar not found$/, () => 'Kalendar nije pronađen'],
  [/^endpoint must be an https URL$/, () => 'Adresa za obaveštenja mora biti https'],
  [/^Wrong current password$/, () => 'Trenutna lozinka nije tačna'],
  [/^must be at least (\d+) characters$/, (m) => `mora imati najmanje ${m[1]} znakova`],
  [/^must be an email address$/, () => 'mora biti mejl adresa'],
  [/^must be a phone number$/, () => 'mora biti broj telefona'],
  [/^current_password is required to set a new password$/, () => 'Za novu lozinku upiši i trenutnu'],
  [
    /^3 to 32 characters: lowercase letters, digits, dot, dash or underscore, starting and ending with a letter or digit$/,
    () => 'Od 3 do 32 znaka: mala slova, cifre, tačka, crtica ili donja crta; počinje i završava se slovom ili cifrom',
  ],
  [/^repeat_until must not be before ride_date$/, () => 'Kraj ponavljanja ne može biti pre dana vožnje'],
  [/^repeat_until may be at most (\d+) weeks after ride_date$/, (m) => `Ponavljanje može trajati najviše ${srPlural(Number(m[1]), 'sedmicu', 'sedmice', 'sedmica')}`],
  [/^at most (\d+) extra pickup points$/, (m) => `Najviše ${m[1]} dodatna mesta ulaska`],
  [/^a pickup point may have at most (\d+) characters$/, (m) => `Mesto ulaska može imati najviše ${m[1]} znakova`],
  // Pydantic (schemas.py), possibly prefixed with the field by api.ts: "origin: must not be empty".
  [/^return_time must be after departure_time$/, () => 'Vreme povratka mora biti posle polaska'],
  [/^corporate_car_id is required for a corporate car$/, () => 'Izaberi zajednički auto'],
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
  username: 'Korisničko ime',
  email: 'Mejl',
  phone: 'Mobilni telefon',
  first_name: 'Ime',
  last_name: 'Prezime',
  password: 'Lozinka',
  new_password: 'Nova lozinka',
  current_password: 'Trenutna lozinka',
  login: 'Korisničko ime ili mejl',
  request_date: 'Dan',
  body: 'Poruka',
  note: 'Napomena',
  token: 'Link',
}

const SR_FIELD_MSGS: [RegExp, string][] = [
  [/^must not be empty$/, 'ne sme biti prazno'],
  [/^Field required$/, 'je obavezno'],
  [/^Input should be greater than or equal to (\d+)$/, 'mora biti najmanje $1'],
  [/^Input should be less than or equal to (\d+)$/, 'može biti najviše $1'],
  [/^String should have at most (\d+) characters$/, 'može imati najviše $1 znakova'],
  [/^String should have at least (\d+) characters$/, 'mora imati najmanje $1 znakova'],
]

function srWhole(message: string): string | null {
  for (const [re, fn] of SR_API_ERRORS) {
    const m = message.match(re)
    if (m) return fn(m)
  }
  for (const [re, sr] of SR_FIELD_MSGS) {
    if (re.test(message)) return message.replace(re, sr)
  }
  return null
}

function srApiError(message: string): string {
  // Several server texts have a "; " of their own ("Your session has expired;
  // sign in again"), so the message is tried whole before it is split.
  const whole = srWhole(message)
  if (whole !== null) return whole
  // api.ts joins several validation errors with "; ", each "field: text".
  return message
    .split('; ')
    .map((part) => {
      const known = srWhole(part)
      if (known !== null) return known
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
    back: 'Nazad',
    clear: 'Obriši',
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

  view: { label: 'Prikaz', upcoming: 'Predstojeće', week: 'Sedmica', day: 'Dan' },

  plan: {
    label: 'Plan dana',
    prevDay: 'Prethodni dan',
    nextDay: 'Sledeći dan',
    ownCars: 'Sopstveni automobili na putu',
    freeAllDay: 'Slobodan ceo dan',
    booked: 'Zauzet ceo dan',
    freeFrom: (time) => `Slobodan od ${time}`,
    freeBetween: (from, to) => `Slobodan ${from}–${to}`,
    from: (time) => `od ${time}`,
    you: 'Ti',
    pin: (time) => `Uzmi ga u ${time}`,
    edit: (driver) => `Izmeni vožnju (vozi ${driver})`,
    barLabel: (driver, when, origin, destination, pax) => `${driver}, ${when}, ${origin} do ${destination}, ${srPassengers(pax)}`,
    book: (car, from, to) => `Rezerviši ${car}, slobodno od ${from} do ${to}`,
    pick: 'Dodirni vožnju na planu da je otvoriš ovde.',
    shape: 'Prikaz dana',
    clock: 'Časovnik',
    timeline: 'Vremenska linija',
    map: 'Mapa',
    overview: 'Ceo dan',
  },

  fab: { addRide: 'Dodaj vožnju' },

  sidebar: {
    cars: 'Zajednički automobili',
    carState: 'Stanje auta',
    people: 'Ljudi',
    places: 'Mesta',
    guide: 'Vodič za zajednički auto',
    closeMenu: 'Zatvori meni',
    admin: 'Upravljanje',
    settings: 'Podešavanja',
    help: 'Pomoć',
  },

  install: {
    title: 'Instaliraj Karpul',
    body: 'Otvara se sa početnog ekrana kao svaka druga aplikacija, preko celog ekrana i bez interneta.',
    go: 'Instaliraj',
    later: 'Ne sada',
    gotIt: 'U redu',
    iosShare: 'Dodirnite Deli u traci pregledača',
    iosAdd: 'Izaberite Dodaj na početni ekran',
    menu: 'Instaliraj aplikaciju',
    done: 'Karpul je na početnom ekranu',
  },

  myRides: {
    title: 'Tvoje vožnje',
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
    feedHint: 'Pretplati se u aplikaciji za kalendar. Ko ima ovu adresu, vidi tvoje vožnje.',
    feedNew: 'Nova adresa',
    feedNewHint: 'Stara adresa prestaje da radi.',
    feedChanged: 'Adresa kalendara je promenjena. Pretplati se na novu.',
    asDriver: 'Vozač',
    asPassenger: 'Putnik',
    pax: srPassengers,
    route: (origin, destination) => `${origin} do ${destination}`,
  },

  notif: {
    title: 'Obaveštenja',
    enable: 'Uključi',
    disable: 'Isključi',
    push: 'Push obaveštenja',
    on: 'Uključeno, za ovaj pregledač.',
    off: 'Isključeno.',
    kinds: 'O čemu da te obaveštavamo',
    kindsOff: 'Važi kada uključiš obaveštenja.',
    category: {
      seats: ['Mesta', 'Neko uđe ili izađe, ili se oslobodi mesto za tebe'],
      changes: ['Izmene vožnji', 'Vožnja u kojoj si se pomeri, kasni ili ukloni, ili te upišu kao vozača'],
      reminders: ['Podsetnici', 'Pre polaska, i da upišeš kilometražu kad se zajednički auto vrati'],
      messages: ['Poruke', 'Neko napiše nešto u razgovoru tvoje vožnje'],
      requests: ['Zahtevi za prevoz', 'Neko traži prevoz na putu koji voziš, ili ti vozač ponudi prevoz koji si tražio/la'],
      approvals: ['Odobrenja zajedničkog auta', 'Zahtev preko dozvoljenog i odgovor na tvoj'],
      cars: ['Prijave o zajedničkom autu', 'Neko prijavi problem sa zajedničkim autom'],
    },
    lead: 'Pre polaska',
    leadChoice: (minutes) => `${minutes} min`,
    device: 'Na ovom uređaju',
    updates: 'Obaveštenje o novoj verziji',
    updatesHint: 'Kartica i munja kada je spremno ažuriranje. Kad je isključeno, aplikacija se ažurira sama sledeći put kada je otvoriš.',
    unsupported: 'Ovaj pregledač ne može da prikazuje obaveštenja. Na iPhone-u prvo dodaj Karpul na početni ekran, pa pokušaj ponovo.',
    unavailable: 'Obaveštenja nisu podešena na ovom serveru.',
    denied: 'Pregledač je blokirao obaveštenja za ovaj sajt. Dozvoli ih u podešavanjima sajta, pa pokušaj ponovo.',
  },

  support: {
    title: 'Kontakt za podršku',
    call: 'Pozovi',
    email: 'Pošalji mejl',
    stuck: 'Nešto ne radi?',
    topics: {
      car: { title: 'Problemi sa autom', body: 'Auto neće da se puni, upali ili otključa, lampica upozorenja, oštećenje, kartica za punjenje.' },
      app: { title: 'Problemi sa aplikacijom', body: 'Karpul prikazuje nešto pogrešno, ne da prijavu ili rezervaciju, ili se ruši.' },
      org: { title: 'Organizaciona pitanja', body: 'Ko sme da uzme zajednički auto, pravila, odobrenja i sve ostalo oko dogovora.' },
    },
  },

  feedback: {
    title: 'Prijavi grešku ili pošalji predlog',
    kind: 'Šta je u pitanju',
    bug: 'Greška',
    idea: 'Predlog',
    bugLabel: 'Šta nije u redu',
    ideaLabel: 'Tvoj predlog',
    bugPlaceholder: 'Šta si uradio/la, šta si očekivao/la i šta se desilo umesto toga.',
    ideaPlaceholder: 'Šta bi Karpul učinilo boljim za tebe?',
    send: 'Pošalji',
    hint: 'Otvara tvoju aplikaciju za mejl sa spremnom porukom. Ime naloga, pregledač i veličina ekrana idu uz nju, da bi se problem lakše našao.',
  },

  auth: {
    tagline: 'Vožnje koje kolege dele, na jednom mestu.',
    signIn: 'Prijava',
    signUp: 'Otvori nalog',
    signInTab: 'Prijava',
    signUpTab: 'Registracija',
    login: 'Korisničko ime ili mejl',
    username: 'Korisničko ime',
    usernameHint: 'Mala slova, cifre, tačka, crtica ili donja crta.',
    email: 'Mejl',
    emailHint: 'Samo da se njime prijaviš umesto korisničkim imenom.',
    phone: 'Mobilni telefon',
    phoneHint: 'Vidi se na vožnjama koje voziš, da te putnici mogu pozvati.',
    optional: 'nije obavezno',
    firstName: 'Ime',
    lastName: 'Prezime',
    password: 'Lozinka',
    passwordHint: 'Najmanje 8 znakova.',
    submitSignIn: 'Prijavi me',
    submitSignUp: 'Otvori nalog',
    working: 'Samo trenutak…',
    switchToSignUp: 'Nemaš nalog? Registruj se',
    switchToSignIn: 'Već imaš nalog? Prijavi se',
    fillIn: 'Popuni sva polja da nastaviš.',
    forgot: 'Zaboravio/la si lozinku? Zatraži od administratora link za novu.',
  },

  reset: {
    title: 'Nova lozinka',
    greeting: (name) => `Zdravo, ${name}. Izaberi novu lozinku; svi pregledači prijavljeni na tvoj nalog biće odjavljeni.`,
    newPassword: 'Nova lozinka',
    submit: 'Postavi lozinku',
    expired: 'Ovaj link je istekao ili je već iskorišćen. Zatraži novi od administratora.',
    backToSignIn: 'Nazad na prijavu',
  },

  account: {
    title: 'Tvoj nalog',
    handle: (handle: string) => `@${handle}`,
    nameSection: 'Tvoje ime',
    emailSection: 'Mejl',
    phoneSection: 'Mobilni telefon',
    passwordSection: 'Lozinka',
    currentPassword: 'Trenutna lozinka',
    newPassword: 'Nova lozinka',
    passwordHint: 'Promena lozinke odjavljuje tvoje ostale pregledače.',
    changePassword: 'Promeni lozinku',
    saved: 'Nalog je izmenjen',
    signOut: 'Odjavi se',
    signingOut: 'Odjava…',
    memberSince: (date: string) => `Na Karpulu od ${date}`,
    otherBrowsers: 'Ostali pregledači',
    signOutOthers: 'Odjavi me svuda drugde',
    othersSignedOut: (n) =>
      n === 0 ? 'Nijedan drugi pregledač nije bio prijavljen.' : `Odjavljeno: ${srPlural(n, 'pregledač', 'pregledača', 'pregledača')}.`,
    addPhoto: 'Dodaj fotografiju',
    changePhoto: 'Promeni fotografiju',
    removePhoto: 'Ukloni fotografiju',
    photoHint: 'Svi prijavljeni na Karpul je vide pored tvog imena.',
    photoUnreadable: 'Ta datoteka ne može da se pročita kao slika.',
    photoSaving: 'Čuvam fotografiju…',
    usePhoto: 'Koristi ovu fotografiju',
    cropArea: 'Isecanje fotografije. Pomeri je prevlačenjem ili strelicama, uvećaj sa + i −.',
    cropZoom: 'Uvećanje',
    cropHint: 'Kvadrat je ono što se čuva; krug je ono što se vidi pored tvog imena.',
  },

  you: {
    title: 'Ti',
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
    stopAddStops: 'Putnici ne dodaju mesta ulaska',
    letAddStops: 'Dozvoli putnicima da dodaju mesta ulaska',
    duplicate: 'Dupliraj vožnju',
    removeRide: 'Ukloni vožnju',
    duplicateMine: 'Dupliraj kao moju vožnju',
    driver: 'Vozač',
    callDriver: 'Pozovi vozača',
    lateAsk: 'Kasniš?',
    lateChoice: (minutes) => `${minutes} min`,
    lateTell: (minutes) => `Javi putnicima da kasniš ${minutes} min`,
    you: 'Ti',
    rideOptions: 'Opcije vožnje',
    leaves: 'Polazi',
    returns: 'Vraća se',
    oneWay: 'U jednom smeru',
    from: 'Od:',
    to: 'Do:',
    companyCar: 'Zajednički auto',
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
    awaiting: 'Čeka odobrenje',
    approved: 'Odobreno',
    approvalAsk: (driver) => `${driver} traži zajednički auto preko svog jednog nedeljno. Ti odlučuješ.`,
    needsDriver: 'Traži se vozač',
    takeOverAsk: (driver) => `${driver} ne može da vozi. Hoćeš li ti da preuzmeš auto?`,
    takeOverWait: (driver) => `${driver} ne može da vozi. Putnici su pitani da li će neko od njih.`,
    takeOver: 'Ja ću voziti',
    coffee: 'Kafa',
    coffeePlease: (first) => `${first} bi se obradovao/la kafi`,
    coffeeYou: 'Obradovao/la bi se kafi',
    noAccount: 'Bez naloga',
    claimAsk: (driver) => `Da li si ovo ti? ${driver} još nema nalog. Ako potvrdiš, sve vožnje pod ovim imenom postaju tvoje.`,
    claim: 'Ovo sam ja',
    approve: 'Odobri',
    decline: 'Odbij',
    pickup: 'Ulazak',
    getInAt: 'Ulazim:',
    start: 'Polazak',
    getsInAt: (place) => `Ulazi: ${place}`,
    changePickup: 'Promeni mesto ulaska',
    elsewhere: 'Negde drugde…',
    newPlace: 'novo mesto ulaska',
    newPickup: 'Novo mesto ulaska',
    newPickupPlaceholder: 'npr. Futog, autobuska stanica',
    whereOnRoute: 'Gde na putu',
    slotFirst: (place) => `Pre: ${place}`,
    slotBetween: (from, to) => `${from} → ${to}`,
    beforeStart: 'Pre polaska',
    backAt: (time: string) => `Povratak ${time}`,
    addStop: 'Dodaj mesto ulaska',
    chipIn: (amount) => `${amount} po mestu`,
    distance: (km) => `${km} km u jednom smeru`,
    removeName: (name) => `Ukloni (${name})`,
    leave: 'Izađi',
    addByName: 'Dodaj putnika po imenu',
    passengerName: 'Ime putnika',
    colleagueName: 'Ime kolege',
    full: 'Ovaj auto je pun.',
    waitFor: 'Čekaj mesto',
    waitHint: 'Prvo mesto koje se oslobodi je tvoje, uz obaveštenje.',
    inLine: (n) => (n === 1 ? 'Prvi/a si na redu za mesto.' : `Na redu za mesto si ${n}.`),
    stopWaiting: 'Prestani da čekaš',
    waitingTitle: 'Čekaju mesto',
    removeFromLine: (name) => `Skloni sa liste čekanja (${name})`,
  },

  thread: {
    title: 'Poruke',
    show: (n) => (n === 0 ? 'Piši autu' : `Poruke (${n})`),
    hide: 'Sakrij poruke',
    empty: 'Kasniš, praviš krug, imaš pitanje pre ulaska: napiši ovde.',
    placeholder: 'Napiši poruku',
    send: 'Pošalji',
    remove: 'Ukloni poruku',
    late: (minutes) => `Kasnim ${minutes} min`,
  },

  requests: {
    title: 'Traže prevoz',
    ask: 'Zatraži prevoz',
    formTitle: 'Zatraži prevoz',
    day: 'Dan',
    around: 'Oko',
    from: 'Od',
    to: 'Do',
    note: 'Napomena',
    notePlaceholder: 'npr. bilo kad pre 9',
    submit: 'Zatraži',
    offer: 'Ponudi prevoz',
    withdraw: 'Povuci',
    aroundTime: (time) => `oko ${time}`,
    yours: 'Tvoj zahtev',
    answering: (name) => `Nudiš prevoz (${name})`,
    answeringHint: 'Dobija mesto u ovoj vožnji i obaveštenje.',
  },

  form: {
    returnAfter: 'Vreme povratka mora biti posle polaska',
    editTitle: 'Izmeni vožnju',
    addTitle: 'Dodaj vožnju',
    saveChanges: 'Sačuvaj izmene',
    deleteRide: 'Obriši vožnju',
    driver: 'Vozač',
    drivenBy: 'Vozi',
    pickDriver: (name) => `Vozač: ${name}. Izaberi nekog drugog`,
    pickDriverTitle: 'Ko vozi',
    searchPeople: 'Pretraži ljude',
    noPeople: 'Niko se tako ne zove.',
    detailLevel: 'Nivo detalja',
    simple: 'Osnovno',
    advanced: 'Napredno',
    alsoSet: (what) => `Podešeno i: ${what}`,
    sumRepeat: 'ponavlja se sedmično',
    sumStops: (n) => srPlural(n, 'mesto ulaska', 'mesta ulaska', 'mesta ulaska'),
    sumManage: 'putnici uređuju listu',
    sumNoNewStops: 'bez novih mesta ulaska',
    sumDistance: 'razdaljina',
    sumChipIn: 'doprinos',
    sumCoffee: 'kafa',
    sumNotes: 'napomena',
    car: 'Auto',
    companyCar: 'Zajednički auto',
    myOwnCar: 'Moj auto',
    whichCar: 'Koji zajednički auto',
    carHint: (plate, seats) => `${plate} · ${srSeats(seats)}`,
    yourCar: 'Tvoj auto',
    carPlaceholder: 'npr. siva Octavia',
    seats: 'Mesta za putnike',
    fewer: 'Manje mesta',
    more: 'Više mesta',
    alreadyBooked: (n) => `Već upisanih: ${n}, pa ne može manje.`,
    passengerList: 'Lista putnika',
    canManage: 'Putnici mogu da dodaju i uklanjaju jedni druge',
    canAddStops: 'Putnici mogu da dodaju mesta ulaska',
    addStopsOn: 'Putnik pri ulasku može da doda svoje mesto na put.',
    addStopsOff: 'Putnici biraju među mestima ulaska koja su već na putu.',
    manageOn: 'Svako u autu može da doda kolegu ili ga ukloni. Ti i dalje možeš oboje.',
    manageOff: 'Samo ti možeš da dodaš druge ili ih ukloniš. Svako i dalje može sam da uđe ili izađe.',
    manageOnFor: (driver) => `Svako u autu može da doda kolegu ili ga ukloni. ${driver} i dalje može oboje.`,
    manageOffFor: (driver) => `Samo ${driver} (i administrator) može da doda druge ili ih ukloni. Svako i dalje može sam da uđe ili izađe.`,
    when: 'Kada',
    departs: 'Polazak',
    day: 'Dan',
    departureTime: 'Vreme polaska',
    returns: 'Povratak',
    oneWay: 'U jednom smeru',
    returnDay: 'Dan povratka (isti dan)',
    returnTime: 'Vreme povratka',
    route: 'Ruta',
    from: 'Od',
    to: 'Do',
    stopTag: 'Usput',
    pickup: 'Mesto polaska',
    pickupPlaceholder: 'npr. parking u Glavnoj ulici',
    dropoff: 'Odredište',
    dropoffPlaceholder: 'npr. Kancelarija',
    notes: 'Napomene',
    optional: '(nije obavezno)',
    notesPlaceholder: 'Mesto sastanka, obilasci, prtljag…',
    repeatWeekly: 'Ponavljaj svake sedmice',
    askApproval: 'Zatraži odobrenje administratora',
    askApprovalHint: 'Vožnja se dodaje kao vožnja na čekanju. Administratori dobijaju obaveštenje i mogu da je odobre.',
    repeatUntil: 'Do',
    repeatCount: (n) => `${srPlural(n, 'vožnja', 'vožnje', 'vožnji')}, jedna sedmično, isti dan u sedmici.`,
    repeatMax: 'Najviše 26 sedmica unapred.',
    stops: 'Dodatna mesta ulaska',
    stopsHint: 'Do 6 mesta, pre polaska ili usput, gde putnik može da uđe. Putnici mogu da dodaju i svoja.',
    addStop: 'Dodaj mesto ulaska',
    addStopBefore: 'Dodaj mesto ulaska pre polaska',
    beforeTag: 'Prvo',
    stopPlaceholder: 'npr. stanica Liman',
    removeStop: 'Ukloni ovo mesto ulaska',
    distance: 'Razdaljina',
    distanceHint: 'U jednom smeru, za brojke „km zajedno“.',
    chipIn: 'Doprinos',
    chipInPlaceholder: 'npr. 300 din',
    chipInHint: 'Po mestu, i samo dogovor: ovde se ništa ne naplaćuje. Oboje nije obavezno.',
    coffee: 'Obradovao/la bih se kafi',
    defaultDestination: 'Kancelarija',
    knownRoad: (km) => `${km} km, put između kancelarija. Upisano umesto tebe.`,
    roadKm: (km) => `${km} km putem između tačaka. Upisano umesto tebe.`,
    wayBack: 'Dodaj i povratak',
    wayBackHint: 'Druga vožnja u jednom smeru, sa obrnutom rutom.',
    wayBackDay: 'Dan povratka',
    wayBackLeaves: 'Polazak u',
  },

  admin: {
    title: 'Zajednički automobili',
    seats: srSeats,
    retired: 'Povučen',
    optionsFor: (name) => `Opcije za ${name}`,
    retire: 'Povuci',
    restore: 'Vrati',
    addCar: 'Dodaj auto',
    addCompanyCar: 'Dodaj zajednički auto',
    name: 'Naziv',
    namePlaceholder: 'npr. Škoda Octavia',
    plate: 'Tablice',
    platePlaceholder: 'FIRM-004',
    home: 'Polazi iz',
    homePlaceholder: 'npr. Kancelarija Novi Sad',
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
    noUsage: 'U ovom periodu nije bilo vožnji zajedničkim autom.',
    retired: 'Povučen',
    pax: (n, seats) => `${n} od ${seats}`,
    download: 'Preuzmi kao tabelu',
  },

  approvals: {
    title: 'Odobrenja',
    empty: 'Ništa ne čeka.',
    count: (n) => `${n} na čekanju`,
    open: 'Otvori vožnju',
  },

  adminLog: {
    title: 'Dnevnik administratora',
    empty: 'Još ništa.',
    older: 'Prikaži starije',
    openRide: 'Otvori vožnju',
    yes: 'da',
    no: 'ne',
    none: 'ništa',
    line: (action, admin, subject) => {
      switch (action) {
        case 'ride_added':
          return `${admin} je dodao/la vožnju, vozi ${subject}`
        case 'ride_edited':
          return `${admin} je izmenio/la vožnju, vozi ${subject}`
        case 'ride_removed':
          return `${admin} je uklonio/la vožnju, vozio/la je ${subject}`
        case 'seat_added':
          return `${admin} je dodao/la putnika, vozi ${subject}`
        case 'seat_removed':
          return `${admin} je uklonio/la putnika, vozi ${subject}`
        case 'car_added':
          return `${admin} je dodao/la zajednički auto ${subject}`
        case 'car_edited':
          return `${admin} je izmenio/la zajednički auto ${subject}`
        case 'car_removed':
          return `${admin} je obrisao/la zajednički auto ${subject}`
        case 'admin_granted':
          return `${admin} je dodelio/la administratorska prava: ${subject}`
        case 'admin_revoked':
          return `${admin} je oduzeo/la administratorska prava: ${subject}`
        case 'reset_link':
          return `${admin} je napravio/la link za novu lozinku: ${subject}`
        case 'account_deleted':
          return `${admin} je obrisao/la nalog: ${subject}`
        case 'photo_removed':
          return `${admin} je uklonio/la fotografiju: ${subject}`
        case 'place_moved':
          return `${admin} je izmenio/la mesto: ${subject}`
        case 'place_removed':
          return `${admin} je zaboravio/la mesto: ${subject}`
        default:
          return `${admin}: ${action} ${subject}`
      }
    },
    fields: {
      ride_date: 'Dan',
      departure_time: 'Polazak',
      return_time: 'Povratak',
      origin: 'Od',
      destination: 'Do',
      stops: 'Usputne stanice',
      stops_before: 'Mesta ulaska pre polaska',
      seats: 'Mesta',
      car_type: 'Auto',
      car_name: 'Auto',
      notes: 'Napomena',
      passengers_manage: 'Putnici uređuju mesta',
      passengers_add_stops: 'Putnici dodaju mesta ulaska',
      coffee_please: 'Kafa dobrodošla',
      distance_km: 'Udaljenost (km)',
      chip_in: 'Doprinos',
      passenger: 'Putnik',
      weeks: 'Sedmica',
      name: 'Naziv',
      plate: 'Tablice',
      passenger_seats: 'Mesta za putnike',
      active: 'U voznom parku',
      home: 'Polazi iz',
      pins: 'Pomerene tačke',
      home_pin: 'Tačka mesta polaska',
      pin: 'Pomerena tačka',
      rides: 'Pomerene buduće vožnje',
    },
  },

  rideLog: {
    title: 'Sve vožnje',
    upcoming: 'Predstojeće',
    past: 'Prošle',
    from: 'Od',
    to: 'Do',
    kind: 'Automobili',
    kindAll: 'Svi automobili',
    kindCorporate: 'Zajednički automobili',
    kindOwn: 'Sopstveni automobili',
    search: 'Traži vozača, putnika, mesto ili auto',
    col: {
      date: 'Datum',
      departs: 'Polazak',
      back: 'Povratak',
      driver: 'Vozač',
      phone: 'Telefon vozača',
      car: 'Auto',
      type: 'Vrsta',
      from: 'Od',
      stops: 'Usputna mesta',
      to: 'Do',
      seats: 'Mesta',
      taken: 'Zauzeto',
      passengers: 'Putnici',
      waiting: 'Čekaju',
      km: 'km',
      chipIn: 'Doprinos',
      note: 'Napomena',
      odometer: 'Kilometar-sat',
      odoStart: 'Kilometraža pri preuzimanju',
      odoEnd: 'Kilometraža pri vraćanju',
      driven: 'Pređeno (km)',
      atWheel: 'Za volanom',
    },
    company: 'Zajednički',
    own: 'Sopstveni',
    oneWay: 'u jednom pravcu',
    none: 'Između ovih datuma nema vožnji.',
    noMatch: 'Nijedna vožnja ne odgovara filterima.',
    totals: (rides, pax, km, driven) =>
      `${srPlural(rides, 'vožnja', 'vožnje', 'vožnji')} · ${srPlural(pax, 'putnik', 'putnika', 'putnika')} · ${km.toLocaleString('sr-Latn')} km` +
      (driven > 0 ? ` · ${driven.toLocaleString('sr-Latn')} km pređeno zajedničkim automobilima` : ''),
    sortBy: (column) => `Sortiraj po koloni ${column}`,
    download: 'Preuzmi kao tabelu',
  },

  odo: {
    title: 'Kilometraža',
    reading: 'Kilometar-sat (km)',
    atWheel: 'Za volanom',
    handOverTo: 'Ko preuzima volan',
    noteStart: 'Upiši početnu',
    handOver: 'Predaj volan',
    back: 'Auto je vraćen',
    undo: 'Poništi poslednji unos',
    driving: 'vozi',
    total: (km) => `pređeno ${km} km`,
    hint: 'Upiši kilometražu kada preuzmeš auto, pri svakoj promeni vozača i kada se auto vrati.',
    notNoted: 'Još nije upisana.',
    tooLow: (km) => `Kilometar-sat je pre ovoga pokazivao ${km} km.`,
    howLeft: 'Kako ostavljaš auto',
    soc: 'Baterija (%)',
    cleanness: 'Čist?',
    clean: 'Čist',
    dirty: 'Treba pranje',
    notChecked: 'Nisam proverio/la',
    issues: 'Nešto nije u redu?',
    issuesPlaceholder: 'npr. upaljena lampica, ogrebotina na levim vratima',
  },

  carState: {
    title: 'Stanje auta',
    odometer: 'Kilometar-sat',
    battery: 'Baterija',
    cleanTitle: 'Čistoća',
    unknown: 'Nepoznato',
    km: (km) => `${km} km`,
    pct: (n) => `${n} %`,
    about: (text) => `oko ${text}`,
    estimated: 'Procena na osnovu vožnji od poslednjeg očitavanja.',
    cleanYes: 'Čist',
    cleanNo: 'Treba pranje',
    issues: 'Prijavljeno',
    noIssues: 'Ništa nije prijavljeno.',
    noted: (name, when) => `${name}, ${when}`,
    report: 'Prijavi stanje auta',
    reportTitle: (car) => `Prijava za ${car}`,
    reportSent: 'Zabeleženo. Hvala.',
    odometerField: 'Kilometar-sat (km)',
    noCars: 'Nema zajedničkih automobila.',
    recent: 'Poslednje prijave',
    fromRide: 'uz povratak',
    nothingSaid: 'Napiši bar nešto.',
  },

  people: {
    title: 'Ljudi',
    count: (n) => srPlural(n, 'nalog', 'naloga', 'naloga'),
    search: 'Traži ljude',
    admin: 'Administrator',
    adminByConfigHint: 'Podešeno na serveru (KARPUL_ADMINS); može se promeniti samo tamo.',
    makeAdmin: 'Postavi za administratora',
    removeAdmin: 'Ukloni administratora',
    resetLink: 'Link za novu lozinku',
    resetLinkFor: (name) => `Link za novu lozinku (${name})`,
    resetLinkHint: (date) => `Za jednu upotrebu, do ${date}. Pošalji ga sam/a; prikazuje se samo sada, a svaki stariji link prestaje da važi.`,
    optionsFor: (name) => `Opcije za ${name}`,
    you: 'Ti',
    deleteAccount: 'Obriši nalog',
    removePhoto: 'Ukloni fotografiju',
    deleteTitle: (name) => `Obrisati nalog (${name})?`,
    deleteBody:
      'Predstojeće vožnje se otkazuju (putnici dobijaju obaveštenje), mesta prelaze na one koji čekaju, a zahtevi se povlače. Prošle vožnje zadržavaju ime. Ovo se ne može poništiti.',
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
    awaiting: 'Čeka odobrenje',
    needsDriver: 'Traži se vozač',
    seats: srSeats,
    stops: (n) => srPlural(n, 'usputna stanica', 'usputne stanice', 'usputnih stanica'),
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

  time: { hour: 'Sat', minute: 'Minut' },

  confirm: {
    removeRideTitle: 'Ukloniti ovu vožnju?',
    removeRidePax: (n) => `${srPassengers(n)} ${srForm(n, 'je', 'su', 'je')} u ovom autu. ${srForm(n, 'Izgubiće mesto.', 'Izgubiće mesta.', 'Izgubiće mesta.')}`,
    handOverPax: (n) =>
      `${srPassengers(n)} ${srForm(n, 'je', 'su', 'je')} u ovom autu. Biće pitani da li će neko od njih da vozi; ako niko ne preuzme do polaska, vožnja se otkazuje.`,
    removeRideBody: (driver, car, date) => `Vožnja za ${date} (${driver}, ${car}) biće uklonjena.`,
    declineTitle: 'Odbiti ovu vožnju?',
    declineBody: (driver) => `Vožnja se uklanja i ${driver} dobija obaveštenje da je odbijena. Putnici takođe.`,
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
    manageOffFor: (driver) => `Sada listu putnika uređuje samo ${driver}.`,
    rideRemoved: 'Vožnja je uklonjena.',
    handedOver: 'Putnici su pitani da li će neko od njih da vozi.',
    tookOver: 'Sada ti voziš.',
    rideUpdated: 'Vožnja je izmenjena.',
    rideAdded: 'Vožnja je dodata.',
    rideAddedFor: (name) => `Vožnja je dodata, vozi ${name}.`,
    rideAwaiting: 'Dodato. Administratori su zamoljeni da odobre.',
    rideApproved: (driver) => `Odobreno. ${driver} ima auto.`,
    claimed: (n) => (n === 1 ? 'Vožnja je sada tvoja.' : `Vožnje su sada tvoje (${n}).`),
    lateSaid: (minutes) => `Putnici znaju da kasniš ${minutes} min.`,
    rideDeclined: 'Odbijeno. Vožnja je uklonjena.',
    ridesAdded: (n) => `Dodato: ${srPlural(n, 'vožnja', 'vožnje', 'vožnji')}, jedna sedmično.`,
    ridesRemoved: 'Vožnje su uklonjene.',
    linkCopied: 'Link je kopiran.',
    pickupChanged: (place) => `Ulaziš: ${place}.`,
    stopAdded: (place) => `Dodato mesto ulaska: ${place}.`,
    addStopsOn: 'Putnici sada mogu da dodaju mesta ulaska.',
    addStopsOff: 'Putnici više ne mogu da dodaju mesta ulaska.',
    notifOn: 'Obaveštenja su uključena.',
    notifOff: 'Obaveštenja su isključena.',
    rideNotFound: 'Te vožnje više nema.',
    carAdded: (name) => `${name} je dodat u vozni park.`,
    carDeleted: (name) => `${name} je obrisan.`,
    waiting: (n) => (n === 1 ? 'Prvi/a si na redu za mesto.' : `Na redu za mesto si ${n}.`),
    stoppedWaiting: 'Više ne čekaš mesto.',
    requestAdded: 'Zatraženo. Vozači to vide na tabli.',
    requestWithdrawn: 'Zahtev je povučen.',
    requestAnswered: (name) => `Vožnja je dodata, ${name} ima mesto.`,
    madeAdmin: (name) => `${name} je sada administrator.`,
    removedAdmin: (name) => `${name} više nije administrator.`,
    deletedAccount: (name) => `Nalog je obrisan (${name}).`,
    photoRemoved: (name) => `Fotografija je uklonjena (${name}).`,
    updateReady: 'Nova verzija je spremna',
    updateHint: 'Prevuci munju da je preuzmeš.',
    updateAction: 'Ažuriraj',
    bothAdded: 'Dodate obe vožnje, tamo i nazad.',
    wayBackFailed: (msg) => `Vožnja je dodata, ali ne i povratak: ${msg}`,
  },

  update: {
    title: 'Nova verzija je spremna',
    lead: 'Prevuci munju da je napuniš.',
    slip: 'Kreni od vrha i ostani na liniji.',
    charged: 'Napunjeno. Osvežavam.',
    plain: 'Ažuriraj bez crtanja',
  },

  empty: {
    noRidesDay: 'Za ovaj dan još nema vožnji',
    noUpcoming: 'Još nema predstojećih vožnji',
    noRidesWent: 'Tog dana nije bilo vožnji',
  },

  carousel: { label: 'Vožnje', scrollLeft: 'Pomeri vožnje ulevo', scrollRight: 'Pomeri vožnje udesno' },

  share: {
    title: (driver, origin, destination) => `${driver} vozi ${origin} do ${destination}`,
  },

  powertrain: { electric: 'Električni', hybrid: 'Hibrid', diesel: 'Dizel', petrol: 'Benzin' },

  guide: {
    title: 'Vodič za zajednički auto',
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

  howTo: {
    title: 'Kako se koristi Karpul',
    menu: 'Kako se koristi Karpul',
    topics: [
      {
        title: 'Snalaženje',
        steps: [
          '**Predstojeće** prikazuje sve vožnje u narednih 90 dana, po danima. **Sedmica** prikazuje jednu sedmicu, dan po dan. **Dan** pokazuje ko ima koji zajednički auto i kada.',
          'Zeleno **+** (na računaru, **Dodaj vožnju** gore desno) dodaje vožnju.',
          'U meniju ☰ su tvoj nalog, **Tvoje vožnje**, **Stanje auta**, pomoć i podešavanja.',
          'Lampica u gornjoj traci svetli dok je tabla uživo: šta kolege urade, vidiš odmah.',
        ],
      },
      {
        title: 'Kako da dobiješ mesto u autu',
        steps: [
          'U prikazu **Predstojeće** dodirni **Slobodna mesta** da sakriješ pune automobile, ili potraži mesto ili vozača.',
          'Dodirni vožnju da je otvoriš. Ako ima mesta ulaska, izaberi svoje kod **Ulazim:**; **Negde drugde…** dodaje novo mesto na rutu.',
          'Dodirni **Uđi u ovaj auto**. Vozač dobija obaveštenje.',
          '**Izađi** te vadi iz auta. Već si u nekom autu tog dana? Drugi auto nudi **Pređi u ovaj auto**.',
          'U prikazu **Sedmica** možeš i da prevučeš svoje ime na auto. Na telefonu ga zadrži prstom dok se ne podigne.',
        ],
      },
      {
        title: 'Auto je pun',
        steps: [
          'Dodirni **Čekaj mesto**. Prvo mesto koje se oslobodi je tvoje, uz obaveštenje.',
          'Kad dobiješ mesto u drugom autu tog dana, izlaziš iz reda. **Prestani da čekaš** to radi ručno.',
        ],
      },
      {
        title: 'Kako da ponudiš vožnju',
        steps: [
          'Dodirni **+**. Izaberi zajednički ili svoj auto, broj mesta za putnike, dan, vreme i rutu, pa **Dodaj vožnju**.',
          '**U jednom smeru** uklanja vreme povratka i nudi **Dodaj i povratak** za drugi dan.',
          '**Napredno** dodaje ponavljanje svake sedmice (do 26 sedmica), mesta ulaska, razdaljinu, doprinos, kafu i napomenu. Doprinos je samo dogovor: ovde se ništa ne naplaćuje.',
          'Meni ⋮ na tvojoj vožnji služi da je izmeniš, dupliraš, podeliš ili ukloniš. Putnici dobijaju obaveštenje kad se vožnja pomeri ili ukloni.',
          'Na kartici vožnje možeš da dodaš putnika po imenu, izvadiš nekog iz auta i dodaš mesto ulaska.',
        ],
      },
      {
        title: 'Mesta na mapi',
        maps: true,
        steps: [
          'Upiši mesto i izaberi ga iz predloga: kancelarije, mesta zajedničkih automobila i mesta koja su kolege već koristile. Predlog stavlja mesto i na mapu.',
          'Dugme **Mapa** pored mesta otvara biranje mesta: dodirni jedno od **Sačuvana mesta**, ili pretraži adresu. Adresa ili **Izaberi na mapi** otvara veliku mapu: pomeraj je dok krug ne bude na tom mestu i dodirni **Uzmi ovu tačku**. **Moja lokacija** počinje od mesta gde si.',
          'Tačka nije obavezna. Vide je svi u Karpulu, pa je ugao ili poznato mesto bolje od ulaznih vrata.',
          'Na vožnji, dugme sa mapom pored svakog mesta otvara ga u aplikaciji za mape. **Prikaži na mapi** crta celu rutu; **Otvori rutu u Mapama** u ⋮ meniju pokreće navigaciju.',
          'Tražio/la si vožnju sa označenim polaskom? Auto koji prolazi blizu nudi da te pokupi tu.',
        ],
      },
      {
        title: 'Zajednički automobili',
        steps: [
          'Zajednički auto ne može dvaput da se rezerviše za isto vreme. **Dan** pokazuje kada je koji slobodan; dodirni slobodan deo da ga rezervišeš.',
          'Svako ima jednu vožnju zajedničkim autom dnevno i jednu sedmično, i ne duže od 24 sata zaredom. Preko toga, **Zatraži odobrenje administratora**. Vožnja koja čeka odobrenje ne drži auto.',
          'Pre prve vožnje pročitaj **Vodič za zajednički auto**: punjenje službenom karticom i Mazda 6e.',
          'U autu upisuj kilometražu: **Upiši početnu**, **Predaj volan** kad vozi neko drugi, **Auto je vraćen** sa stanjem baterije i eventualnim problemima.',
          '**Stanje auta** pokazuje kilometražu, bateriju i prijavljene probleme svakog auta. **Prijavi stanje auta** javlja administratorima.',
          'Ipak ne možeš da voziš? Ukloni vožnju: ako u njoj ima kolega, auto ostaje rezervisan, a putnici dobijaju pitanje da li neko od njih vozi. Ko prvi dodirne **Ja ću voziti** preuzima vožnju.',
        ],
      },
      {
        title: 'Niko ne ide tvojim putem',
        steps: [
          'Dodirni **Zatraži prevoz**: dan, otprilike vreme, odakle i dokle.',
          'Vozači koji voze tim putem dobijaju obaveštenje, a svako može da dodirne **Ponudi prevoz** na tabli. Ti dobijaš mesto i obaveštenje.',
        ],
      },
      {
        title: 'Poruke',
        steps: [
          'Svaka vožnja ima **Poruke**. Svi u autu dobijaju obaveštenje kad napišeš nešto: kašnjenje, skretanje, veliki kofer.',
          'Voziš i kasniš? Na dan vožnje, **Kasniš?** na tvojoj vožnji je jedan dodir: **5 min**, **10 min** ili **15 min**. Putnici dobijaju obaveštenje, a to ide i u poruke.',
        ],
      },
      {
        title: 'Obaveštenja i kalendar',
        steps: [
          'Podešavanja, **Obaveštenja**: **Uključi**, pa izaberi o čemu da te obaveštavamo i koliko pre polaska da te podsetimo.',
          'Na iPhone-u prvo dodaj Karpul na početni ekran (Deli, **Dodaj na početni ekran**).',
          '**Dodaj u kalendar** u meniju ⋮ čuva tu vožnju. U **Tvoje vožnje** je adresa kalendara sa svim tvojim vožnjama; ne deli je ni sa kim.',
          '**Podeli vožnju** šalje link koji kolegi otvara tu vožnju.',
        ],
      },
      {
        title: 'Tvoj nalog',
        steps: [
          'Dodirni svoje ime na vrhu menija da dodaš fotografiju, promeniš ime, telefon ili lozinku, ili da se odjaviš.',
          'Tvoj broj telefona se vidi na vožnjama koje voziš, da bi te putnici mogli pozvati.',
          'Zaboravljena lozinka? Zatraži od administratora link za novu lozinku.',
          'Kad je nova verzija spremna, pojavi se kartica: prevuci munju ili dodirni obično dugme.',
        ],
      },
      {
        title: 'Za administratore',
        admin: true,
        steps: [
          '**Odobrenja** prikazuje vožnje zajedničkim autom koje čekaju odgovor. **Odobri** rezerviše auto; **Odbij** uklanja vožnju.',
          'Administrator može da izmeni ili ukloni bilo koju vožnju i upravlja njenim mestima. U formi za vožnju dodirni red sa vozačem da dodaš vožnju u nečije ime.',
          '**Zajednički automobili** služi za dodavanje, izmenu i povlačenje automobila; kartica **Korišćenje** pokazuje kako se koriste.',
          '**Ljudi** služi da postaviš administratore, napraviš link za novu lozinku (prosleđuješ ga lično) i obrišeš naloge.',
          '**Sve vožnje** su sve vožnje u izabranom periodu, uz preuzimanje kao tabelu. **Dnevnik administratora** beleži svaku izmenu tuđe vožnje, auta ili naloga.',
        ],
      },
    ],
    more: 'I dalje ne ide?',
  },

  map: {
    loading: 'Učitavam mapu…',
    failed: 'Mapa nije učitana.',
    noLocation: 'Tvoja lokacija nije dostupna.',
    locating: 'Tražim te…',
    myLocation: 'Moja lokacija',
    usePoint: 'Uzmi ovu tačku',
    moveHint: 'Pomeri mapu da tačka bude tačno na mestu. Vide je svi u Karpulu.',
    mapButton: 'Mapa',
    pinnedShort: 'Na mapi',
    searchAddress: 'Pretraži adresu',
    searchPlaceholder: 'Ulica i broj, ili mesto',
    privacy: 'Ovu tačku vide svi u Karpulu. Dovoljan je ugao ili neko poznato mesto blizu kuće.',
    sourceOffice: 'Kancelarija',
    sourceCar: 'Zajednički auto',
    sourceLearned: 'Korišćeno ranije',
    pickOnMap: 'Izaberi na mapi',
    pinned: 'Na mapi',
    movePin: (place) => `Pomeri tačku: ${place}`,
    pinFor: (place) => `Tačka na mapi: ${place}`,
    routeOf: (from, to) => `${from} → ${to}`,
    roadIs: (km, minutes) => `${km} km putem, oko ${minutes} min.`,
    notPinned: 'Nije na mapi:',
    navigate: 'Otvori rutu u Mapama',
    toMyPickup: 'Put do mog mesta ulaska',
    openPlace: (place) => `Otvori u Mapama: ${place}`,
    showMap: 'Prikaži na mapi',
    hint: (place, nearBy) => `Tvoj zahtev počinje od mesta ${place}, blizu stanice ${nearBy} na ovoj ruti.`,
    hintGetIn: (place) => `Uđi kod: ${place}`,
    places: 'Mesta',
    kindOffice: 'Kancelarija',
    kindCarHome: 'Mesto zajedničkog auta',
    kindLearned: 'Označeno na vožnji',
    uses: (n) => srPlural(n, 'vožnja', 'vožnje', 'vožnji'),
    move: 'Pomeri',
    rename: 'Preimenuj',
    forget: 'Zaboravi',
    forgetHint: 'Više se ne predlaže. Vožnje zadržavaju svoje tačke.',
    noPlaces: 'Još nema mesta.',
    placeName: 'Naziv',
    homePin: 'Na mapi',
    noPin: 'Nije na mapi',
    dayEmpty: 'Ovog dana nema označenih mesta.',
    dayLabel: (day) => `Mesta ulaska, ${day}`,
    saved: (place) => `Sačuvano: ${place}`,
    searchPlaces: 'Pretraži mesta i adrese',
    searchPlacesPlaceholder: 'Sačuvano mesto, ulica i broj',
    savedPlaces: 'Sačuvana mesta',
    addresses: 'Adrese',
    noSaved: 'Još nema sačuvanih mesta. Pretraži adresu ili izaberi mesto na mapi.',
    nothingFound: 'Ništa nije pronađeno. Probaj drugačije, ili izaberi mesto na mapi.',
    movePinShort: 'Pomeri tačku na mapi',
    namePlaceholder: 'npr. Pumpa na Zemunskoj',
    nameNeeded: 'Daj ime ovom mestu.',
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
