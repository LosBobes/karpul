# Places on the map

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Places on the map** (`app/geo.py`, `routers/places.py`, `lib/maps.ts`, `lib/places.ts`). A place
is still its words; a pin is extra. **Who has them**: `KARPUL_MAPS` (`everyone`, the default,
`admins` or `off`, read per request, `geo.maps_for`) says who has the maps; `/api/map/config` carries it
as `audience`, the lookups are a 403 for anyone else, the calendar's `GEO` too, and in the app
`useMapConfig` / `useMapsAllowed` answer "no maps" to them, so `PlaceInput` is a plain field and the card
shows no map links, hint or menu item (the *Places on the map* how-to topic is `maps: true`). The pins are
stored for everyone regardless, so turning the maps back on shows them at once; tests run with `everyone`
(`clean_env`, `playwright.config.ts`). `Ride.points` and `RideRequest.points` (`ADDED_COLUMNS`, JSON text)
map the place's folded name (`fold_name` / `foldName`) to `{lat, lng}`, so reordering stops needs no
bookkeeping: `RideBase.points` / `RideUpdate.points` (replaces them whole) are by the place as written,
`geo.points_for` keeps only the route's places and fills in the pins everyone knows (`known_point`: an
office, as an admin placed it in `KnownPlace` or else `offices.OFFICE_POINTS`, and a shared car's home,
`CorporateCar.home_lat/home_lng`, set with `home_point`). `NewStop.point` pins a new pickup point (a
passenger's only while `passengers_add_stops`; a place already on the route keeps its pin, only whoever
runs the ride moves one), and the waiting list keeps it on the entry (`new_stop_lat/lng`) until the seat
comes. A moved pin (not a first one) is the route moving: `ride_changed`, and an admin's is a `pins`
change in the log. Pinned places become suggestions (`KnownPlace` kind `learned`, `geo.learn`); offices
and car homes are seeded on start by `geo.seed_places`, which also pins old office rides. Admins keep them
at `/api/admin/places` (*Places* in the drawer, `PlacesAdmin`; `place_moved` / `place_removed` in the log).
**A moved office or car home takes its coming rides along** (`geo.repin` / `repin_known`, also from a
car's `home_point` edit): rides from today on and open requests that name it and still carry its old pin
(an office's city-centre default counts as old) get the new one; a pin dropped elsewhere for it and the
rides already driven stay, and no one is pushed. `seed_places` does the same catch-up on start for an
office placed before this existed.
The server, never the browser, asks the outside services: `GET /api/places?q=` (known places, then the
geocoder, `KARPUL_GEOCODER_URL`, the public Nominatim by default, "" off), `/api/places/reverse` (a dropped
pin's name) and `/api/places/road?via=` (an OSRM at `KARPUL_ROUTER_URL`, off by default), all signed in,
per account throttled (`ratelimit.place_lookups`), the answers cached in memory (`geo.cache`; a read route
writes nothing) and the public Nominatim asked once a second at most; tests replace `geo.fetch_json`, and
`clean_env` turns the geocoder off. `GET /api/map/config` (open) gives the tiles (`KARPUL_MAP_TILES`, OSM
by default, "" no map at all: only *Open in Maps*). `requests.drivers_for` also matches a pinned request
whose start is within `geo.NEAR_KM` of a ride's pinned pickup point, and the calendar's `LOCATION`/`GEO`
are the reader's own pickup. On screen: `PlaceInput` (suggestions in a `Popover`, which opens only when
something is found, and a labelled *Map* / *Pinned* chip, `.place-pin`) in `RideForm`, `RequestForm` and `SharedCars`,
whose chip opens `PlaceDialog` (portalled to `<body>`, the whole screen on a phone, a tall panel on a desktop,
Escape captured so the form behind stays open): a search on top, the *Saved places* below it before anything is
typed (`GET /api/places/saved`: every `KnownPlace`, offices first, then car homes, then the most used), the matches
and the geocoder's *Addresses* once something is; a saved place is the pick at once, an address or *Pick on the map*
goes on to the embedded `MapPicker` filling the panel, with a *Name* field and *Use this point*;
`MapPicker` (a crosshair over a moving map, inline, not an overlay, a round *Use my location* button and the zoom
bottom left; on its own a floating rounded address search on top, a `PlaceInput` whose pick centres the map, Enter
kept from the form around it; `embedded`, in `PlaceDialog`, it has no search or buttons, the pin being where it was
moved, `onMove`); `MapView` (Leaflet, loaded on first
use through `lib/leaflet.ts`, so it is a chunk of its own; Karpul's own pins as `divIcon`s, the disc drawn
in `.map-pin-body` because Leaflet owns the marker's transform; dark tiles by a CSS filter); on the card
each place opens in Google Maps (`mapsSearchUrl`), *Show on map* opens `RouteMapSheet` (portalled to
`<body>`: the card may clip) or, in a wide pane, `RideMap` inline; *Open the route in Maps* in the ⋮ menu
(`routeUrl`); the "on your way" hint (`stopHint`) offers your open request's pinned start as a new stop;
Day has a *Map* shape (`DayMap`); *Shared cars* shows a pinned car's home. The service worker keeps map
tiles (`karpul-tiles`, never anything under `/api`). Tests: `tests/test_places.py`, `maps.test.ts`.
