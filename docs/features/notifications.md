# Push notifications, calendars, sharing and the figures

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Push notifications.** `app/webpush.py` does RFC 8291 encryption and VAPID (RFC 8292) on the
`cryptography` package rather than pywebpush, whose `http-ece` dependency does not build on a
Debian-patched setuptools; `tests/test_push.py` holds it to the RFC test vector. `app/push.py`
keeps one `PushSubscription` per endpoint under the normalised name and the app language, and
`notify()` collects the targets inside the request and sends from a small thread pool
(`deliver`, `forget` for 404/410 endpoints; tests replace both). It is all off until
`KARPUL_VAPID_PRIVATE_KEY` is set (`python -m app.vapid` prints one), read per request like the
admin password. Pushes are addressed by account (`notify(session, user_ids, ...)`;
a seat with no account is skipped). Who is told: the driver when someone gets in or out on their own, a passenger
when the driver takes them out, the passengers when the ride moves (date, times or route, not a
note) or is removed, the first in line when a seat frees up, the car when someone writes in its
thread, the passengers when the driver is running late, the drivers who drive that way when someone
asks for a ride, a requester when a driver answers, and everyone in the car before departure (`app/reminders.py`,
a minute-by-minute task started in the lifespan): **each person picks the lead**, 15, 30 or 60
minutes (`User.remind_before`, `LEAD_CHOICES`, in `GET/PUT /api/push/preferences` as
`remind_before`, the segmented control under the reminders row in `NotificationsSheet`), so one
ride's reminders go out at different minutes; `ReminderSent` is who has had theirs and
`Ride.reminder_sent` is set once everyone has or the ride has left. The
browser side is `lib/push.ts` plus `public/push-sw.js`, which Workbox pulls into `sw.js`
through `importScripts`; every sign-in re-files the browser's subscription under the account (`resubscribePush` in `App.tsx`). Each `kind` belongs to one of `CATEGORIES` in `app/push.py`
(seats, changes, reminders, messages, requests, approvals, cars); a person switches categories off per account
(`User.push_muted`, `GET/PUT /api/push/preferences`) and `notify` skips them. `NotificationsSheet` is the
notification centre: the push switch on its own card, a row per category, and *New version notice* for this
device (`useUpdateNotices` / `setUpdateNotices` in `lib/pwa.ts`, `karpul.updateNotices`, off unless turned on): off, the update
toast and its bolt never show and a waiting build is taken only in the first seconds after the app opens
(`takeQuietly`: the page reloads only once the new worker has taken it, never on a timer, at most once per
10 minutes in a tab, because an iOS app woken from a long sleep can keep its worker waiting and a timed
reload found it still waiting and reloaded again every few seconds).

**Calendar, sharing, figures.** `app/calendar.py` writes floating local times (no zone) for one
ride (`/api/rides/{id}/calendar.ics`, signed in; the app fetches it and hands it over as a
download) and for a person's feed (`/api/calendar/{token}.ics`, a week back to a year ahead).
A calendar app cannot sign in, so `User.calendar_token` in the address is the credential;
*Your rides* shows it and `POST /api/auth/me/calendar-token` rotates it.
`/ride/{id}` is the shell with Open Graph tags spliced before `</head>` (`ride_preview_tags` in
`main.py`); the app reads the path on load, opens the ride and `replaceState`s to `/`.
`person_stats` and `corporate_usage` in `services.py` are the *Your rides* and admin *Usage*
figures: "km shared" is the one-way distance of every ride the person was in, a floor not a
claim, and a car's use rate is days out over the working days in the window plus the weekend days it went out (so never past 100%). **Off the road**: `services.impact` turns rides into the car km a seat saved (each passenger is one car at home for the one-way distance) and, at `CO2_KG_PER_KM` (0.17) and `FUEL_L_PER_KM` (0.07), the CO₂ and fuel; with a person it is half of each trip (driver and passenger share it) so everyone's adds up to the team's, which `corporate_usage` carries as `team` (every car, own ones too) for *Usage*.
