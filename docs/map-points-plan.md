# Plan: map points for pickup points and places

Status: proposal, nothing built yet.

## Where things stand

Every place in Karpul is a string someone typed: `Ride.origin`, `Ride.destination`,
`Ride.stops` / `Ride.stops_before` (one per line), `Booking.pickup` (`""` for the origin or a
stop verbatim), `WaitlistEntry.pickup`, `RideRequest.origin` / `destination` and
`CorporateCar.home`. The only place the app knows anything about is the two offices
(`app/offices.py`, `lib/offices.ts`), by name. Nothing has coordinates, and nothing in the
frontend draws a map.

The strings are the contract. Bookings point at a stop by its text, `pickup_or_422` and
`drop_orphaned_pickups` match on it, `add_stop` dedupes on it, request matching
(`drivers_for`) folds it. **This plan keeps the strings as they are and adds coordinates
next to them.** A place with no point stays fine everywhere. A map is only an extra.

## Goals

1. A passenger sees on a map exactly where the car picks them up, not just "Kod Sava Centra".
2. A driver sees the whole route as pins in order and opens it in their navigation app.
3. Whoever types a place gets suggestions (known places, then a geocoder) and can drop a pin
   on a map instead.
4. Old rides, and rides whose places nobody pinned, keep working unchanged.

Not goals (for now): live car tracking, turn-by-turn navigation inside Karpul, any payment or
ETA promise.

## Phase 0: "Open in Maps" from the text (no map library, ~half a day)

Fast and useful before any of the rest lands.

- `lib/maps.ts`: `mapsSearchUrl(place)` →
  `https://www.google.com/maps/search/?api=1&query=<place>` and `mapsRouteUrl(ride)` →
  `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=a|b|c` from
  `allStops` in route order. Google Maps URLs open the app on Android and iOS; Apple Maps users
  get the web page, which is acceptable.
- `CarDetail`: every point of the route (origin, stops, destination) gets a small pin button
  (`PinIcon` already exists) that opens the search link; the ⋮ menu gets *Open the route in
  Maps* for the driver.
- Tests: `maps.test.ts` (encoding, `|` in names, the order with `stops_before`).
- i18n: `detail.openInMaps`, `detail.routeInMaps` in `en` and `sr`.

When coordinates exist (phase 1) these links switch to `lat,lng`, which never guesses wrong.

## Phase 1: coordinates on the ride, a geocoder, a map sheet

### Data model

- New column `Ride.points: str` (JSON text), in `ADDED_COLUMNS` as
  `("ride", "points", "VARCHAR NOT NULL DEFAULT '{}'")` with a `server_default` on the model.
  A map from the place's folded name (`services.fold_name`) to `{"lat": float, "lng": float}`.
  Keyed by name rather than by position so that reordering stops, `add_stop` and
  `drop_orphaned_pickups` need no index bookkeeping: a point whose name is no longer on the
  route is simply dropped by a `prune_points(ride)` called wherever the route changes
  (`_prepare`, `add_stop`, the PATCH merge).
- Same column on `RideRequest` (`points`, its origin and destination) and on `CorporateCar`
  (`home_lat`, `home_lng`, both nullable), so a new ride in a shared car starts with the
  car's home pinned.
- New table `KnownPlace` (created by `create_all`): `id`, `name`, `key` (folded, unique),
  `lat`, `lng`, `kind` (`office` | `car_home` | `learned`), `uses`, `last_used`. Seeded on start
  with the offices (exact office coordinates come from the admins, see open questions) and
  kept up to date from car homes. A place pinned on any ride is upserted as `learned` with
  `uses += 1`, so the colleagues' usual corners ("Pumpa na Zemunskoj") become suggestions for
  everyone.
- `schemas.py`: `Point(BaseModel)` with `lat` in [-90, 90], `lng` in [-180, 180], and for
  sanity a bounding box around the countries in `KARPUL_ALLOWED_COUNTRIES` (Serbia and Germany
  today; a 422 "This point is outside the area Karpul covers" otherwise).
  `RideBase.points: dict[str, Point] = {}` keyed by the place text as the client sent it,
  folded in a validator; `RideUpdate.points: dict[str, Point] | None`;
  `NewStop.point: Point | None`; `RideRequestCreate.points`. `RideRead.points` is the stored map.
- `to_ride_read_dict` passes `points` through; the live events then carry it for free.

### Geocoder (server-side proxy)

The browser never talks to the geocoder: the server does, so the key (if any) stays secret,
results are cached and the usage policy is respected.

- `app/geo.py`: `search(q, near)` and `reverse(lat, lng)` against
  `KARPUL_GEOCODER_URL` (default the public Nominatim, `https://nominatim.openstreetmap.org`),
  with a real `User-Agent` and `Referer` (Nominatim, like DB-IP, refuses anonymous clients),
  `countrycodes` from `KARPUL_ALLOWED_COUNTRIES`, `accept-language` from the caller's locale,
  `viewbox` biased to Beograd–Novi Sad. Plain `urllib` like `fetch_geoip.py`; no new dependency.
- One request a second at most (Nominatim's policy) through a small lock in `app/ratelimit.py`,
  plus a per-account limit (60 a minute) so one browser cannot exhaust it.
- `GeocodeCache` table (query key, locale, JSON result, `fetched_at`), 30 days, purged by the
  hourly pass in `app/housekeeping.py`.
- Routes (signed in, under `/api`, so the SPA catch-all is not an issue):
  - `GET /api/places?q=` → `KnownPlace` matches first (folded prefix, then `similar_names`),
    then geocoder results, at most 8, each `{name, lat, lng, source}`.
  - `GET /api/places/reverse?lat&lng` → a short readable name (street and number or the
    nearest named thing), for a pin dropped on the map.
  - `GET /api/map/config` (open, like `/api/push/config`) → the tile URL template, attribution
    and max zoom from `KARPUL_MAP_TILES` / `KARPUL_MAP_ATTRIBUTION`; empty means "maps off",
    and the frontend then shows only phase 0's links.
- Tests replace `geo.search` / `geo.reverse` the way `geofence.country_of` is replaced, and
  `clean_env` clears the new variables. `tests/test_places.py`, `tests/test_points.py`.

### Map on screen

- Library: **Leaflet** (about 40 kB gzipped, no WebGL, works on every phone). Loaded with a
  dynamic `import()` inside `components/MapView.tsx` so the main bundle does not grow and a
  user who never opens a map never downloads it. MapLibre GL is nicer looking but four times the
  size and needs vector tiles; revisit if we ever self-host tiles.
- Tiles: from `/api/map/config`. The OSM standard tiles are fine for a few dozen colleagues
  with attribution, but their policy forbids anything heavier; a free-tier key (MapTiler,
  Stadia, Thunderforest) is the safer default for production. Dark theme: a CSS
  `filter: invert(1) hue-rotate(180deg) brightness(.9)` on the tile pane under
  `[data-resolved='dark']`, or the provider's dark style when it has one.
- Service worker: tiles are third-party, so they are not precached; a `StaleWhileRevalidate`
  runtime cache `karpul-tiles` (max 500 entries, 30 days) keeps the commute area usable offline.
  Nothing under `/api/places` is cached (it stays under the existing "nothing under `/api`" rule).
- `components/MapView.tsx`: Fluent styling (rounded card, `--shadow`, the zoom buttons as
  `.icon-btn`), numbered pins in route order using the driver's tone (`avatarTone`), the origin
  as the driver's avatar like `CarDetail` draws it, the destination as a dot, a straight dashed
  line between them in order (no road routing until phase 3), your own pickup pin larger and
  green. Fits the bounds of the pinned points; unpinned places are listed under the map with
  phase 0's search link.
- `components/RouteMap.tsx` (a `Sheet`): opened from the route on `CarDetail` (*Show on map*)
  when at least one point is pinned. Footer: *Navigate* (the driver: Google Maps directions
  with every waypoint as `lat,lng`; a passenger: directions to their own pickup point).
- On a wide screen the ride pane (past 760px) shows a small map under the route inline instead
  of the button.

### Entering places

- `components/PlaceInput.tsx` replaces the plain inputs for origin, destination and each stop in
  `RideForm`'s `.route` box, in `AddStop`, in `RequestForm` and for *Departs from* in `CarAdmin`.
  It is a text input with a `Popover` of suggestions (debounced 300 ms, at least 3 characters,
  arrow keys and Enter, no native datalist, per the "no native pickers" rule). Picking a
  suggestion sets the text *and* its point; editing the text afterwards drops the point (a
  little pin badge in the input says whether the place is pinned).
- The last entry of the suggestions is *Pick on the map*: opens `MapPicker` (inside the same
  sheet, like `PhotoCropper`, not a second overlay) with a fixed centre crosshair over a
  draggable map, *Use my location* (`navigator.geolocation`, only on a tap), and *Use this
  point*, which reverse-geocodes for a name when the text is empty.
- Typing a place and never picking a suggestion still works and stores no point: maps stay
  optional.
- Office names (`office_of`) resolve to the office's `KnownPlace` automatically, server-side,
  so every existing Beograd–Novi Sad ride gets pins with no one doing anything. A start-up pass
  (like `fill_office_distances`) fills `points` in for old rides between the offices.

### Rules on who may set a point

Same as who may set the place: whoever may edit the ride sets any point (`may_run`); a
passenger adding a new stop sets that stop's point with it (`NewStop.point`), and only while
`passengers_add_stops` is on. A passenger may *not* move an existing pin; they can ask in the
thread. Moving a point (not adding one) counts as the route moving, so the passengers are
pushed `ride_changed` like any other route change.

## Phase 2: polish that follows from having points

- Calendar: `GEO:lat;lng` and the place in `LOCATION` on the event (`app/calendar.py`), so a
  phone's calendar offers directions to the pickup point.
- Push: `stop_added` and the departure reminder carry a `url` that opens the ride with its map.
- *Shared car guide* / *Car status*: each car's home on a small map.
- Admin log: a moved point is a change line ("pickup point moved", no coordinates in words).
- `docs/user-guide.md` and `howTo` in `lib/i18n.ts` (keep them in step): a topic on picking a
  pickup point on the map.

## Phase 3: using the geometry

Only once phases 1–2 have been in use for a while and people pin places.

- Road distance and time: an OSRM-compatible routing service (`KARPUL_ROUTER_URL`, the public
  demo server is not for production; self-host or a paid key) fills `distance_km` when it is
  blank and both ends are pinned, the way the offices do today, and draws the real road on the
  map instead of the dashed line.
- Requests by proximity: `drivers_for` also matches a driver whose route passes within
  `NEAR_KM` (2 km) of a pinned request start, not only by folded name.
- A day map in the Day view: every pickup point of the day's rides, coloured per car, so the
  office manager sees who goes past whom.
- Suggest a stop: when a passenger's own pinned place is near a ride's line, the *Get in*
  row offers to add it as a stop.

## Privacy

A pickup point is often someone's street, so a pin is more precise than the text was.

- Points are shown only to signed-in people, like the rest of the board, and never in the
  `/ride/{id}` share preview or its Open Graph tags.
- `MapPicker` says once, under the map: "Everyone in Karpul can see this point. A corner or a
  landmark near your home is enough." (A hint about a privacy risk is allowed by the wording rule.)
- No location is ever read without a tap on *Use my location*; nothing is stored about where a
  person is, only the points they chose for a ride.
- `KnownPlace` learns only places that were pinned on a ride; an admin can delete one
  (`DELETE /api/admin/places/{id}`, logged in the admin's log).

## Changes by file (phase 1)

Backend
- `app/models.py`: `Ride.points`, `RideRequest.points`, `CorporateCar.home_lat/home_lng`,
  `KnownPlace`, `GeocodeCache`.
- `app/database.py`: the new `ADDED_COLUMNS`; the office-points pass on start.
- `app/schemas.py`: `Point`, the `points` fields, `NewStop.point`.
- `app/geo.py` (new): geocoder client, cache, throttle; `prune_points`, `learn_place`.
- `app/routers/places.py` (new): `/api/places`, `/api/places/reverse`, `/api/map/config`;
  wired in `main.py`.
- `app/services.py`: `add_stop` and `drop_orphaned_pickups` prune points; `to_ride_read_dict`.
- `app/routers/rides.py`, `routers/requests.py`, `routers/waitlist.py`, `routers/cars.py`:
  accept and keep points.
- `app/offices.py`: office coordinates.
- `app/housekeeping.py`: purge the geocode cache.
- Error texts: run `python -m tests.error_catalogue`, translate the new ones in `apiError`.

Frontend
- `lib/types.ts` (`Point`, `Ride.points`), `lib/maps.ts` (links, `pointOf(ride, place)`),
  `lib/places.ts` (search with debounce and abort).
- `components/MapView.tsx`, `RouteMap.tsx`, `MapPicker.tsx`, `PlaceInput.tsx`.
- `CarDetail.tsx`, `RideForm.tsx`, `AddStop.tsx`, `RequestForm.tsx`, `CarAdmin.tsx`.
- `styles/extras.css` (map card, pins), `styles/themes.css` (dark tiles).
- `vite.config.ts`: the `karpul-tiles` runtime cache.
- `lib/i18n.ts`: every new string in `en` and `sr`.

Tests
- Backend: points validated, pruned when a stop goes, kept through PATCH, passenger rules,
  geocoder proxy with a fake, throttling, `KnownPlace` learning, migrations
  (`tests/test_migrations.py` covers the new columns).
- Frontend: `maps.test.ts`, `places.test.ts`, `stops.test.ts` still green.
- E2E: `e2e/pickup.spec.ts` gets a case picking a suggested place (geocoder faked via an env
  flag that makes `geo.py` answer from a fixture) and seeing the pin on the ride.

## Open questions

1. **Tiles and geocoder**: free public OSM services (fine at our size, best effort, policy
   limits) or a free-tier key from MapTiler / Stadia (more reliable, one more secret)? The
   plan works with either; it only changes two environment variables.
2. **Exact office coordinates** (Beograd and Novi Sad), and where each shared car is kept.
3. **Should pins be required** for a new stop added by a passenger, or always optional?
   The plan assumes optional.
4. **Navigation app**: Google Maps links for everyone, or detect iOS and offer Apple Maps?

## Rough size

- Phase 0: half a day.
- Phase 1: 4–6 days (backend 2, map and place input 2–3, tests and e2e 1).
- Phase 2: 1–2 days.
- Phase 3: open-ended; decide after phase 1 is in use.
