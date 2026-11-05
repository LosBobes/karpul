# The screen: design system, motion, theme, layout

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Styling.** The frontend is Tailwind v4 (via `@tailwindcss/vite`) plus a hand-written design
system in `src/index.css` (one stylesheet in parts: it `@import`s `src/styles/*.css`: tokens,
controls, layout, board, plan, admin-log, ride, people, sheets, feedback, extras, themes, each a
run of sections in the order they always were, Tailwind inlining them at build; the media blocks,
phones, wide screens, dark and hover, are in the last two and must stay last), built on Microsoft's
Fluent 2 design language in Karpul's own green: a
phone-first, card-based UI on Fluent's neutrals, white cards with Fluent's two-part elevation shadows
(`--shadow`, `--shadow-hover` in the *Hover* block, `hover: hover and pointer: fine` only,
`--shadow-pop`), Fluent's shapes (`--radius-sm` 4px for controls, `--radius` 8px for cards,
`--radius-lg` 12px for sheets and dialogs), one green accent for "selected / go", red only for
removal, Fluent's controls (an input's bottom edge darker and an accent underline when focused, the custom
pickers and the route box included; the outlined switch that fills; a secondary button outlined on
the surface, pressed by darkening rather than shrinking; cards at shadow 4 with no visible stroke;
the top bar and the tab bar frosted with `backdrop-filter`, written unprefixed only, because the
CSS minifier keeps just the `-webkit-` copy when both are there), and Segoe UI Variable where the
system has it, else Inter (bundled from `@fontsource/inter`
in `main.tsx`, because the app ships as one self-hosted container). Karpul keeps its own name, mark
and colour: Fluent is the language, not a Microsoft brand. The semantic class names (`.card`, `.date`, `.car-tile`, `.pax-row`,
`.panel`, `.btn`, …) are the contract the components render against. On a phone the layout is
one 600px column. From 1024px (`lib/useWide.ts`, the *Wide screens* block in `index.css`) it is a desktop app
that fills the window: the page never scrolls; the drawer's content is docked down the left edge
(`Dock` in `Sidebar.tsx`, no ☰), a toolbar carries the view's name, the view switch and the add
button, and each view is two full-height panes (`.split`) that scroll on their own
(`data-scroll-pane`):
Upcoming is the list beside the open ride (no unfolding in place: `Upcoming` gets no `renderDetail`,
and the pane shows your next ride when nothing is picked), Week is the days, the day's rides as a
vertical list (`CarCarousel vertical`) and `YouPanel` beside the open ride, Day is the plan with the
ride in a column on the right. The ride pane is a container: past 760px the ride becomes one big
card split into the driver's half and the passengers'. From 1600px the root font grows to 16px. Two media
blocks carry the phone layout:
`max-width: 600px` (sheets become true bottom sheets) and `pointer: coarse` (44px targets, hover
choreography switched off, carousel arrows hidden). `lib/useCoarsePointer.ts` exposes the same
query to components that need to change their wording. The app's own mark (the top bar, the drawer head, the favicon and the installed-app
icons) is a car, side-on, whose back half turns into a thunderbolt: one thick white line on a tile
that runs from mint to forest green with a soft light in its top corner, in the manner of the newer
Fluent app icons. `public/favicon.svg` is the source, split by `<!-- tile -->` / `<!-- mark -->`
comments that `scripts/render-icons.mjs` uses to derive the PNGs (`pwa-192`/`pwa-512` with rounded
transparent corners, `pwa-maskable-512` full-bleed with the mark scaled into the platform's safe
zone, `apple-touch-icon` full-bleed and opaque), and `components/Logo.tsx` repeats the same drawing
inline (its gradient ids per instance, through `useId`). Change the mark in all three places. Icons are drawn in
`components/icons.tsx` itself (no icon package), in Fluent 2's grammar: the 24px grid with its 3px
margin, a 1.5px round stroke (`light` 1.25 / `regular` 1.5 / `bold` 2, a touch heavier below 16px so
small glyphs stay crisp), rounded corners on every box, long thin chevrons and arrows, a person as a
head over a rounded shoulder, Fluent's own shapes for the common glyphs (Dismiss, Navigation,
Calendar, Clock, Delete, Edit, Chat, Send, Alert, Shield, Money), no fills except the dots. The named exports are the contract the components render against (`size` in px, optional
`weight`). The drawer and the phone's tab bar use the Fluent marks in
`components/FluentIcon.tsx` instead: a 20px grid, a 1.5px stroke, each drawing split into a body,
details and extras so one drawing gives two styles (`regular`, and `filled` with the details cut out
in `--icon-knock` for the selected tab). Every icon in the app is monochrome, in `currentColor`: the
drawer's marks stand in the label's ink with no tile, and the notification centre's rows have no
tinted tiles either. Selection is shown the Fluent way, by a brand tint and an accent bar, never by a
solid green block: the picked day in the week strip is a tinted cell with a short bar at its foot
(`.date-thumb`, today's number in green), a picked car tile or Upcoming row is tinted with a green
hairline (`.car-tile-selected`, `.session-open`), a filter chip is a square-cornered toggle that tints
when on (`.chip-on`), and the week arrows are borderless icon buttons (`.week-btn`). Adding a ride has exactly one control: `AddRideFab`
(`components/AddRideButton.tsx`), Fluent's FAB: a white plus on a green rounded square (16px corners)
floating at the bottom right of the column, above the tab bar, on every view whenever a ride can be added (`.fab`, under every sheet's backdrop); on a
wide screen it is `AddRideToolbarButton` at the right end of the toolbar instead.
There is deliberately no *Add ride* tile in the carousel, no plus in the empty card and no drawer
item; the empty card says only that there is nothing yet. Avatars (`components/Avatar.tsx`) derive a stable pastel from the name.
Known car models get a side-view illustration instead of the generic icon: `lib/carModels.ts`
matches a car name (plate suffix and all) to a model key and an `electric` flag, and
`components/CarArt.tsx` draws it (`CarGlyph` falls back to `CarIcon`) in Fluent's illustration
manner: no outline, the shapes modelled by soft gradients (ids per instance through `useId`), a
sheen across the glass and a blurred shadow under the car. Today that is only the
white Mazda 6e, used in the ride tiles, the driver card's vehicle strip and the admin list.
`carPowertrain()` in the same file says whether a name is *electric*, a *hybrid*, *diesel* or
*petrol* (explicit words and engine badges first, hybrid before electric before diesel before
petrol so "plug-in hybrid electric" is a hybrid; then models sold only one way) and
`PowertrainMark` draws it as a 12px glyph (bolt / leaf / drop / pump) *after the car's name* on
the tile, the Upcoming row and the admin list (`.pt-mark`). It is deliberately not on the
picture: a sticker big enough to read on a phone hid the car. The driver card spells it out as
"Electric" / "Hybrid" / "Diesel" / "Petrol" beside *Company car* / *Own car* under the car's name.
Below that, `carBrand()` in the same file recognises a *make* from the name (make words and
the models people write instead of one: "grey Golf", "Octavia"; words that are also plain
English, like "Seat" or "Focus", must be capitalised to count) and `BrandLogo` /`CarGlyph` show
its mark from the `simple-icons` package in `currentColor`. Only the brands listed in `LOGOS`
are bundled (named imports tree-shake); Mercedes, Land Rover, Jaguar, Alfa Romeo and Lexus are
not in that package, so they keep the generic icon.

**Motion.** Fluent's patterns, and things go back the way they came: a view slides in 40px from
its side after the one it replaces has slid out the other way (`components/SlideSwitch.tsx`: the keyed
content's wrapper hands its DOM to the host as it unmounts, and a `cloneNode` snapshot laid over
the host plays `.swap-leave-*` while the real content is long gone, so nothing in it runs or
fetches again; the entering `.swap-*` is marked `data-after` and holds, invisible, for the
snapshot's `--swap-out` (100ms) before its own step, so the two are never on screen together:
two layouts of text stacked at half opacity read as mud, not motion), a flyout comes 10px out of its anchor, a dialog grows a little out of the
middle as it fades in, a toast rises 16px, on Fluent's curves (`--ease-out` decelerates in,
`--ease-in` accelerates out, `--ease-spring` no longer overshoots; the one overshoot left is
`--ease-bounce`, on the update screen's bolt and the phone tab bar's glide and pop) and durations (`--dur-fast` 150ms, `--dur-normal`
200ms, `--dur-gentle` 250ms, hover 100ms). The
keyframes are in the *Motion* and *Sheets & dialogs* sections of `index.css`, the two hooks in
`lib/motion.ts`. `useSlideDir(value, rank)` says which side freshly keyed content enters from
(a higher rank enters from the right, a lower one from the left, NaN means no slide) and
`App.tsx` wraps the view (Upcoming sits left of Week), the day board (the way the calendar
moved, only while the Week view shows) and the driver card (from the tile you tapped) in
`SlideSwitch` (the keyed `.stack` inside carries `slideClass(dir)`); `DateCarousel` does the same for a week step.
`useClosing(onClose)` lets `Sheet`, `Sidebar` and `ConfirmDialog` play their exit before the
parent unmounts them: every close from inside the overlay goes through `requestClose`, which
adds `backdrop-closing`, and `onClose` runs on the panel's `animationend` (with a fallback
timeout); a parent that unmounts the overlay itself, after a save, still closes on the spot,
and the drawer's `pick` closes on the spot on purpose so the sheet it opens owns the history
entry alone. Sheets rise from the bottom edge on a phone and pop up on a desktop, the drawer
slides from the left, confirmations grow out of the middle and popovers come out of their anchor (`Popover` sets
`transform-origin` and measures itself with `offsetWidth`, which a transform does not change),
the toast and the floating plus spring in (the plus also contracts while pressed and springs back on release; the pressed state comes from pointer and key events, not `:active`, which phones apply late and Chrome holds on after the finger lifts), the Upcoming detail unfolds as a grid row from
`0fr` (the `.session-detail-clip` wrapper hides the overflow and leaves room for shadows), a
passenger who just got in grows into the car's list the same way (`.pax-slot-new`, `useArrivals`
in `lib/motion.ts`: not on first render, not into an empty list, not your own row, which takes the
place of the *Get in* row; the seat controls stay on screen, disabled, while the call is out, so
the card never flickers through its empty state first), and
the segmented controls (`SegThumb`, `components/Segmented.tsx`, drawn as Fluent's TabList: the
choices on the page, the pick semibold over a short accent bar) and the date pills
(`.date-thumb`) move one marker element instead of recolouring buttons. Reduced motion collapses
every duration, so the exits still fire `animationend`.

**Theme.** Light, dark or the system's choice: `lib/theme.ts` is an external store like the
locale, remembered as `karpul.theme`, and puts the choice on the root as `data-theme` and what
is on screen as `data-resolved`. The dark tokens in `index.css` live under both
`:root[data-theme='dark']` and the `prefers-color-scheme` media query (so a dark phone never
paints light before the script runs); the rules that were never tokens (the pastel avatars,
the illustrations, the toast, the error text) key off `data-resolved`. The switch
(`ThemeSwitch`) sits above the language switch in the drawer.

**Screen structure.** The top bar is the ☰ button, the title and the live lamp; the ☰ opens
`Sidebar` (`components/Sidebar.tsx`), a drawer from the left edge that holds everything not
about one particular ride: under your account, the things opened most with no heading over them
(*Your rides*, *Shared cars*, the *Shared car guide*), then collapsible groups, *Manage* for admins (approvals, the
people, the places, every ride, the log), *Help* (support, feedback), and *Settings*: not a group but a card of its
own pinned to the foot (`.settings-card`, a gear, a chevron pointing up), folded by default, that unfolds
*upwards* out of its head (the body is a grid row above the head, 0fr to 1fr; the rest of the menu is
`.drawer-scroll` and gives way), holding *Notifications*, *Install the app* while the browser can, the
theme and the language. What is open is remembered as `karpul.drawerGroups`; a folded *Manage* carries the approvals count on
its heading. Each group heading is a Fluent accordion header: a full-width
row in the text's ink, a leading chevron in its own small well that turns down when the group opens,
a tint under a mouse and a darker one when pressed, and the open group's rows hanging off a hairline
under the chevron. The items are one label each, no hint line. Your account is the
identity block on top (it opens `AccountSheet`, which is also where you sign out), *Your rides* (`MyRides`: figures, history, the calendar feed address),
*Notifications* (`NotificationsSheet`, the push switch), *Approvals* and *Admin log* (admins only, `Approvals`, `AdminLog`), *Shared cars* (`SharedCars`: the cars and how they stand for everyone, managed on
the same cards by admins, who also get a *Usage* tab that reads `/api/cars/corporate/usage`) and the *Shared car guide* (`CarGuide`: how to charge
with the company card, and a Mazda 6e primer for first-time EV drivers, frunk included. The words are the `guide`
entries in `lib/i18n.ts`, one picture per entry in `components/GuideArt.tsx`, drawn like Fluent's
own icons only bigger (a 120×80 box at 96px, so the 1.875 stroke lands on 1.5px, round corners, soft
neutral fills, numbers and ticks on a solid green disc) with the green accent on the one thing the
step is about; also reachable from
the driver card of any company-car ride; its foot opens *Contact support*). The *Help* group holds *How to use Karpul* (`HowTo`: a
Fluent accordion of topics, each a few numbered steps; the words are `howTo` in `lib/i18n.ts`, `**name**` sets a
control's name in bold, the admin topic shows to admins only; `docs/user-guide.md` is the long version, keep them
in step), the guide,
*Contact support* (`SupportSheet`: car, app and organizational contacts with `tel:` / `mailto:` buttons, the list is
`SUPPORT` in `lib/support.ts`) and *Report a bug or send feedback* (`FeedbackSheet`, also at the foot of the support
sheet: a bug or an idea sent as a `mailto:` to the app contact from the person's own mail app, with the account, view,
browser and screen under the text; nothing on the server). Picking an
item closes the drawer before the sheet opens, so the two body-scroll locks never overlap. The views are switched by a Fluent bottom tab bar on a
phone (`.tabbar` in `App.tsx`, a radio group named *View*, 26px marks, the active one filled; one
green pill, `.tab-glider`, slides under the marks to the picked tab on `--ease-bounce`, and the mark it
lands on pops, keyed so the animation replays; `--tabbar` is its height, which the FAB, the toast and the column's foot leave room for, and 0
on a wide screen) and by the segmented control in the toolbar on a wide screen, and
remembered in `localStorage` (`karpul.view`): *Upcoming* (the default), *Week* and *Day*.
Day (`components/DayPlan.tsx`, the arithmetic in `lib/dayPlan.ts`, tested in `dayPlan.test.ts`) is
one day for scheduling the company cars, drawn as one *road* per car: every active pool car (free
ones too) and then each own car going, hours across: the whole day, 00:00 to 24:00 (`DAY_AXIS`), at a
fixed width per hour (`--plan-hour`), so the board scrolls sideways (`.plan-scroll`, the car's name
sticky on the left) and opens on now today, else an hour before the first ride, else 07:00. A ride is a
stretch of its road in the driver's colour (`avatarTone` in `lib/tone.ts`, the avatar's pastel and ink
as `.tone-*`; solid green when it is yours), from the driver's avatar at departure to a dot at the
return, the way `CarDetail` draws a route; no return runs off the right edge, as the server holds the
car to end of day. Now is an ink rule behind the roads (not red, which is for removal); each pool car
says when it is next free (`rowStatus`). Switching to it jumps to today; `range` is that one day. A tapped bar
opens the ride under the plan (beside it on a wide screen, `.split-day`); a free stretch of a pool car
(`.plan-free`, never in the past; under a mouse a ring follows the pointer to the half hour, popping in on a spring and shrinking away where it was when the pointer leaves, per road in `pins`, and the clock's ring the same through `useLinger` in `lib/motion.ts`; a company car's hour ticks are elements, `.plan-tick`, and the ones on a free stretch are green-tinted and stand up in a wave from the pointer, `--d` delaying each by its distance) opens `RideForm` with `slot`: that car, departure at the tapped
half hour, back by the next booking or 17:00. While the board scrolls (a phone, a narrow pane), an
overview strip sits on top of it (`components/PlanOverview.tsx`): the whole day across the card's width,
one thin lane per car with its rides in the drivers' tones, and a green frame over the hours on screen;
a tap centres the board there and a drag pans it (`visibleSpan` / `scrollToCentre` in `lib/dayPlan.ts`),
and it is a keyboard slider too. It hides itself when the day fits. A picked ride that you run (`runs()`, so any ride for an
admin) grows a pencil at its end (`.plan-edit`), and a double click on it opens the edit form too. The same
day can be drawn as a **clock** instead (`components/DayClock.tsx`, geometry in `lib/dayClock.ts`, tested in
`dayClock.test.ts`): a 24-hour dial, midnight at the top, one ring per car (pool cars outermost, then own cars),
rides as arcs in the driver's tone from their initials to a dot, the hours gone today as a faint wedge and now as
a hand. A free arc of a pool car books like `.plan-free` (pin at the half hour under the pointer), the middle of
the dial reads out the hovered slot, the hovered or picked ride (with *Edit* when you run it) or the time, and a
legend beside it names the rings with each car's status. The Clock / Timeline switch sits in the plan's head,
remembered as `karpul.planShape`; with nothing remembered a wide screen opens on the clock (its dial takes the
pane's height) and a phone on the timeline. Upcoming is
`Upcoming` (`components/Upcoming.tsx`): every ride from today for the next `UPCOMING_DAYS` (90;
the API caps a range at 92) grouped under a heading per day, one row per car; a tapped row
unfolds `CarDetail` beneath it. Above the list sit the filter chips (*All*, *Free seats*, *My
rides*, *I'm in*) and a search box, state local to `Upcoming`; the day headings are sticky under
the top bar (`.upcoming-head`). `App.tsx` loads whichever range the view needs (`range`) and
the live-event filter uses the same range. Week is the day board: `DateCarousel` (the loaded Mon–Sun week as seven pills that always fit the
width — nothing scrolls; above them one line for the week, whose name opens a calendar
(`DatePicker variant="title"`) with *Today* and the two arrows on the right, and a sideways swipe on
the strip also steps a week; the days are bare text, the sliding green pill marks the picked one) →
`CarCarousel` (one tile per ride that day with its route line, hidden when there are none; the seat count goes red when full and green when you are in or driving) →
either `CarDetail` (driver card, times, route with the pickup points, distance and chip-in
tags, passenger list and the *Get in this car* row, which reads *Switch to
this car* when `switchFrom` says you are seated elsewhere that day and asks where you get in
after the tap (`PickupSheet`); ⋮ with *Share ride*,
*Add to calendar* and, on a series, *Remove this and following rides*) or `AddCarCard` (the
dashed placeholder with a small car badge, deliberately no picture; `intro` adds the two-view explanation when the whole board is empty) →
`YouPanel`. The design's
"unassigned passengers" list has no equivalent because Karpul has no roster: the only passenger
you can move is yourself, so `YouPanel` says where you are that day and offers to ask for a ride. Every dialog is a `Sheet` (bottom sheet on a phone,
centred panel on a desktop), the one exception being `UpdateScreen`, which takes the whole screen
because the bolt you trace on it is the screen; destructive actions go through `ConfirmDialog` instead of
`window.confirm`. Every overlay (`Sheet`, `Sidebar`, `ConfirmDialog`, `Popover`) calls
`useBackClose` (`lib/useBackClose.ts`), so a phone's back button closes the topmost one instead
of leaving the page: the first overlay to open pushes one history entry, the ones stacked on top
join an in-memory stack, back pops the top and re-pushes while any remain, and a close by any
other route pops the entry when it was the last, so back never lands on a dead entry. **No native pickers or dropdowns**: `Select`, `DatePicker` and `TimePicker` are
custom controls (and `Menu` is the ⋮ menu) built on `Popover`, which portals to `<body>` and
positions itself against its anchor with `position: fixed`, so it is never clipped by a sheet's
scrolling body and flips above the anchor when the viewport runs out. `TimePicker` shows hour (00–23)
and minute columns and emits `HH:MM`. `App.tsx` resolves which tile is open (`selection`):
an explicit pick that still exists, else your own ride, else the first ride, else nothing (the empty card).
**Wording:** the thing you add, edit, duplicate or remove is a *ride*; *car* is reserved for the
vehicle (the pool, "Shared car" / "Own car", "get in this car", "in this car"). The pool cars are
*shared cars* on screen (Serbian *zajednički auto*); the code and the API keep saying *corporate*
(`CarType.corporate`, `/api/cars/corporate`), and the charging card stays the *company card*.
