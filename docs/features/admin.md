# Admins: running every ride, rides in someone's name, the admin's log

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Admins run every ride.** `may_run` in `app/access.py` lets the driver *or an admin* edit and
remove a ride (and its following weeks) and manage its seats; the frontend twin is `runs()` in
`lib/me.ts` (`Me.admin`), which `CarDetail` uses for the ⋮ menu, the card's own *Edit* button
(`.driver-edit`) and the seat controls. An admin can
also add a ride in someone else's name: `RideCreate.driver_id` (create only; anyone else naming
another account is a 403, an unknown one a 404), chosen in `RideForm` through `DriverPicker`
(the form's driver line made pressable, listing `/api/admin/users`); that account then drives and
owns the ride and is pushed `ride_assigned`. The ride keeps its own trail of that: `Ride.added_by_id` / `added_by_name` (`ADDED_COLUMNS`, set on every week of a series, a snapshot that follows a rename through `rename_person` and outlives the account, whose deletion nulls the id), shown as an *Added by* fact on the driver card, under the driver in *All rides* and as the spreadsheet's last column. An admin's edit or removal of someone's ride is pushed to
its driver too, and the passengers' `ride_changed` / `ride_removed` name whoever did it.
**The admin's log** (`app/audit.py`, table `AdminAction`, `GET /api/admin/log?before&limit`, admins
only): `audit.record` is called before the commit of every admin action, so the line and the change
land together: a ride added in someone's name, someone's ride edited (`audit.diff`, each field before
and after in words) or removed, a seat added or taken out in someone's car (`_on_behalf`: an admin
acting on a ride they do not drive; their own rides are never logged), and every pool-car and account
change in `routers/cars.py` / `routers/admin.py`. Lines are snapshots in words, no foreign keys, so they
outlive the ride, car or person. On screen: *Admin log* in the drawer (`AdminLog`), a heading per day,
the changes as chips with the old value struck through; a line about a ride that still exists opens it
on the day plan. A new action needs its sentence in `adminLog.line` (both languages) and a new field
its label in `adminLog.fields`. Tests: `tests/test_admin_rides.py`.


**The office manager's side.** *All rides* has a **Month** tab (`MonthSummary.tsx`, `GET /api/admin/summary?month`,
`fleet.month_summary`): per person, grouped by `User.department` (set under *People*), the shared-car rides and km (the
odometer's stretches at the wheel where there are any, else the ride's length), own-car rides and km, rides along, and the
own-car allowance: 30 % of a litre of the `allowance_fuel` (BMB 95 unless changed) at each day's official price for every
km, flagged past `allowance_cap` (10,121 dinars a month, the tax-free amount from 1 Feb 2026). Pending rides and ones
nobody drove are left out; its spreadsheet is built in the browser (`lib/fleet.ts summaryCsv`). **Switching an account off**
(`User.disabled`, `PATCH /api/admin/users/{id} {disabled}`) is for someone who left: their coming plans go as on deletion
(`_clear_coming`, shared with `delete_user`), sessions, push subscriptions and reset links are dropped and sockets closed,
sign-in and reset answer *This account is switched off*, `/api/people` and `admin_ids` leave them out, and the history keeps
the id. Not yourself, not a configured admin, not the last admin. Every change is in the admin's log.
