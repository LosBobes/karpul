# Accounts: profile photos and calling the driver

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Profile photos** (`routers/photos.py`, table `ProfilePhoto`). `components/AccountSheet.tsx` picks a file and opens it in
`PhotoCropper` (inline in the sheet, not a second overlay): the picture dimmed round a square outline (what is saved)
with the avatar's circle inside it, dragged, pinched, wheeled or arrow-keyed, with a zoom slider up to `MAX_ZOOM`
(the geometry is `fitCrop` / `zoomCrop` in `lib/photos.ts`, tested in `photos.test.ts`). `squarePhoto` then draws that
square at 256 px as WebP (JPEG where the browser cannot write WebP) before `PUT /api/auth/me/photo` (raw body, no multipart). The server only sniffs the first bytes
(JPEG/PNG/WebP) and caps the size (`MAX_PHOTO_BYTES`). The bytes live in the database, so the backup carries
them. An `<img>` cannot send a bearer token, so a photo is served openly at `/api/avatars/<key>` with a random
key that changes on every upload (the old address 404s), `immutable` and `nosniff`; the service worker caches
those addresses (`karpul-photos`), the one exception to "nothing under `/api` is cached". Every place draws an
avatar by *name*, so the board fetches the whole list (`GET /api/avatars`, signed in) into the external store in
`lib/photos.ts`, and `Avatar` looks its name up there (`normName` in `lib/dates.ts`) and falls back to the
initials. `useBoard` refetches it on every (re)connect and on `photos.changed`, which an upload, a removal, a
rename of someone with a photo and an account deletion publish. An admin takes one down from *People*
(`DELETE /api/admin/users/{id}/photo`, logged as `photo_removed`). Tests: `tests/test_photos.py`.

**Calling the driver.** `User.phone` is optional and shown on the rides that person drives:
`RideRead.driver_phone` is looked up by `driver_id` (`board_extras` in `services.py`, one query for
the whole board in `GET /api/rides`, next to the thread's message counts), and `CarDetail` turns it into a *Call the driver* `tel:` link
for everyone but the driver. **Karpul keeps no email**: the office mail writes addresses from names
(`lib/carMail.ts`), so an account is a username, a name and a password, and signing in is by username.
`appuser.email` is in `DROPPED_COLUMNS` in `database.py`: `rebuild_tables` rebuilds that table once on
start without it (and its unique index) and VACUUMs, so the addresses leave the file too. An app from
before still sending `email` is ignored, not refused.
