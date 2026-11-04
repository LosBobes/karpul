# Installable app and the update screen

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Installable (PWA).** `vite-plugin-pwa` in `vite.config.ts` writes the web app manifest
(`manifest.webmanifest`, standalone display, the icons above, off-white theme colour to match the
top bar) and generates a Workbox service worker, `sw.js`, that precaches the built shell: `index.html`,
the hashed bundles, the fonts and the icons, so an installed app opens offline and starts instantly.
**The install offer** (`lib/install.ts`, `components/InstallCard.tsx`): Chrome and Edge fire
`beforeinstallprompt` once the app qualifies, and `listenForInstall` (called in `main.tsx` before
React, because the event can fire before the first render) keeps it and suppresses the browser's
own mini-infobar; Safari on an iPhone or iPad has no such event, so there the offer is the two taps
through the Share menu (`ios()` also catches an iPad that calls itself a Mac). Signed in and not
running standalone, the board opens with an *Install Karpul* card (above the board on a phone,
floating in the bottom corner on a wide screen): *Install* runs the browser's dialog, *Not now* /
*Got it* puts it away for good in this browser (`karpul.installHint`), and *Install the app* in the
drawer's *Settings* group stays while the browser can still install, bringing the card back on iOS.
Nothing under `/api` is ever cached, and navigations to `/api`, `/docs`, `/redoc` and `/openapi.json`
are left to FastAPI (`navigateFallbackDenylist`). `lib/pwa.ts` registers the worker from `main.tsx`
(`registerType: 'prompt'`): a new build waits instead of reloading under the user's fingers, `App.tsx`
shows it as a tappable "A new version is ready" toast (`useUpdateReady`, in the toast slot whenever no
other toast shows). The other toasts are a line of ink that comes and goes; this one waits to be
pressed, so it is built like the cards instead: the app's own mark on a green tile (a charge sweeps
across it every few seconds), the line with its hint under it and the verb as a green chip, on a card
with a green line and a green glow that it keeps in both themes.
The tap opens `UpdateScreen`, which takes the **whole screen** and turns the lights out: an ink
ground in either theme, with the app's own thunderbolt glowing across it for you to **trace** to take
the build. It is its own screen rather than a sheet because the bolt is the screen, a stroke that
crosses a phone edge to edge, and a pad inside a panel gave the finger a lane the width of a thumb;
it still rises from the bottom edge and carries a sheet's manners (escape, the phone's back button, a
locked body), because it comes out of the toast down there. The words and the way out float over the
bolt with `pointer-events: none`, so only the two buttons take a tap of their own, and the screen
hands the bolt its colours as `--bolt` / `--bolt-dark` (the light board's green is too dark to glow).
`BoltTrace` walks the bolt path once with `getPointAtLength` and matches the finger against a window
of points ahead of where it has got to, so a corner may be cut and a wander is forgiven: past `STRAY_R`
the trail holds where it is and can be picked back up, and only past `LOST_R`, or a lift short of the
tail, does it start over with a shrug. The bolt falls the way a bolt falls: two steep strokes with a jog
back across between them, because the screen's height is what there is most of and a stroke pulled down
it is the gesture a thumb makes without thinking. The two long strokes are parallel and 53 units apart,
which is what lets `STRAY_R` be generous (a finger on one is never nearer a point on the other) and what
sets how thick the lane can be drawn: `LANE` in `BoltTrace.tsx` and the `stroke-width` in `index.css`
are the same number, because `LANE` also cuts the mask below. The lit part of the bolt is four layers on
one path, all keyed to how far the finger has got (`pathLength=100`, so every dash is a percentage): a
blurred `.bolt-glow` for the light it throws, the `.bolt-trail` itself, and `.bolt-current` pulses
falling down the inside, clipped to the drawn part by a mask cut from the same dash. A blurred filter
*inside* that mask leaks its own rectangular filter region in Chrome, so the current's softness is a
second wider pass at low opacity instead. The head the finger steers is a white core in a blurred
`.bolt-halo`, and before anyone touches it a `.bolt-hint` spark falls down the empty lane to say which
way it goes. When it closes, the pad pops, the lane goes white-hot and cools back to green, the current
speeds up, a white spark runs the length of it, a ring is thrown off the tail and a green flare washes
the screen, which is also what hides the reload's blank frame. The flare opens from the
tail of the bolt rather than the middle of the screen, so it carries on from where the finger stopped:
`BoltTrace` hands its last point to `onComplete` as a percentage of the viewport (through the same
matrix that puts the finger in the bolt's coordinates, measured before the charge pops the pad) and
`UpdateScreen` sets it as `--flare-x` / `--flare-y`, which `.update-flare` uses for both the gradient's
centre and its `transform-origin`. The plain button at the foot of the screen
is the same update for anyone who would rather not draw, the button equivalent every drag here has.
Both run `applyUpdate`, which is a hard refresh: it listens for `controllerchange` itself, empties the
Cache Storage (the precache an ordinary reload would be served from, kept when the browser says it is
offline) and reloads, with a 3 s timer so it still refreshes when no worker claims the page. That listener is deliberate: workbox-window only calls a controller change an update when a
worker already controlled the page at registration, false on a first visit, and `clientsClaim: true`
in the worker is what makes the new worker take that page over at all. An installed app can stay open
for days, so the hook also asks the browser for a new worker every hour and when the app comes back to
the foreground. On the server, everything outside `/assets` keeps its name across builds (the shell,
`sw.js`, the manifest, the icons) and `mount_frontend` in `main.py` serves all of it `no-cache`, so a
phone always learns about a new build; `tests/test_frontend.py` pins the headers. In `npm run dev` the
virtual register module is a stub and no worker runs; index.html carries the Apple meta tags the
manifest cannot express (`apple-touch-icon`, standalone mode, the app title).
