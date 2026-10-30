import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'

/**
 * Pickup points that are not on the route yet: a passenger gets in at a place
 * of their own before the start, and the driver adds one on the way to a ride
 * that is already on the board. Each side sees the other's change live.
 */

function toast(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text })
}

/**
 * A tag for this project and attempt, in the usernames and the surnames: a
 * retry (or `--repeat-each`) runs on the same database, where the first
 * attempt's people and rides are still there.
 */
function attempt(info: TestInfo) {
  const n = info.retry + info.repeatEachIndex
  return (info.project.name === 'phone' ? 'P' : 'D') + (n ? String(n + 1) : '')
}

async function register(browser: Browser, username: string, first: string, last: string, options: object): Promise<Page> {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('tab', { name: 'Register' }).click()
  await page.getByLabel('First name').fill(first)
  await page.getByLabel('Surname').fill(last)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('radiogroup', { name: 'View' })).toBeVisible()
  return page
}

test('a passenger and the driver put new pickup points on the route', async ({ browser }, info) => {
  const options = info.project.use
  const tag = attempt(info)
  const vesna = await register(browser, `vesna.${tag.toLowerCase()}`, 'Vesna', `Driver ${tag}`, options)
  const goran = await register(browser, `goran.${tag.toLowerCase()}`, 'Goran', `Rider ${tag}`, options)

  await vesna.getByRole('button', { name: 'Add ride' }).click()
  const form = vesna.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('Green Polo')
  await form.getByLabel('Pickup location').fill('Novi Sad')
  await form.getByLabel('Drop-off location').fill('HQ')
  await form.getByRole('button', { name: 'Add ride' }).click()
  await expect(toast(vesna, 'Ride added.')).toBeAttached()

  // Goran gets in at Futog, on the way to the start.
  const row = goran.getByRole('button', { name: new RegExp(`Vesna Driver ${tag} · Green Polo`) })
  await expect(row).toBeVisible()
  await row.click()
  await goran.getByRole('button', { name: 'Pickup', exact: true }).first().click()
  await goran.getByRole('option', { name: 'Somewhere else…' }).click()
  // The place is picked in the full-screen place dialog, then where on the way.
  const goranPlace = goran.getByRole('dialog', { name: 'New pickup point' })
  await goranPlace.getByLabel('Search places and addresses').fill('Futog')
  await goranPlace.getByRole('button', { name: 'Use “Futog”' }).click()
  await expect(goranPlace.getByText('Not on the map')).toBeVisible()
  await goranPlace.getByRole('button', { name: 'Where on the way' }).click()
  await goran.getByRole('option', { name: /Before Novi Sad/ }).click()
  await goranPlace.getByRole('button', { name: 'Get in this car' }).click()
  await expect(goranPlace).toBeHidden()
  await expect(toast(goran, `You're in with Vesna Driver ${tag}.`)).toBeAttached()
  await expect(goran.getByText('Gets in at Futog').first()).toBeVisible()

  // Vesna sees him, and Futog ahead of her start, without reloading.
  const vesnaRow = vesna.getByRole('button', { name: new RegExp(`Vesna Driver ${tag} · Green Polo`) })
  if ((await vesnaRow.getAttribute('aria-expanded')) !== 'true') await vesnaRow.click()
  const trip = vesna.locator('.trip').first()
  await expect(trip.locator('.trip-place')).toHaveText(['Futog', 'Novi Sad', 'HQ', 'Novi Sad'])

  // She adds Liman: Add a pickup point goes straight to the place picker, then
  // where on the way (just after the start by default), and it is on the route.
  await vesna.getByRole('button', { name: 'Add a pickup point' }).first().click()
  const vesnaPlace = vesna.getByRole('dialog', { name: 'New pickup point' })
  await vesnaPlace.getByLabel('Search places and addresses').fill('Liman')
  await vesnaPlace.getByLabel('Search places and addresses').press('Enter')
  await vesnaPlace.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(toast(vesna, 'Liman is on the route.')).toBeAttached()
  await expect(vesnaPlace).toBeHidden()

  // Edit the route is the whole route on its own screen: who gets in where,
  // Kać goes in and comes off again, and nothing is sent until she saves.
  await vesna.getByRole('button', { name: 'Edit the route' }).first().click()
  const route = vesna.getByRole('dialog', { name: 'Route' })
  await expect(route.getByText(`Getting in here: Goran Rider ${tag}`)).toBeVisible()
  await route.getByRole('button', { name: 'Add a pickup point' }).click()
  await vesnaPlace.getByLabel('Search places and addresses').fill('Kać')
  await vesnaPlace.getByLabel('Search places and addresses').press('Enter')
  await vesnaPlace.getByRole('button', { name: 'Done' }).click()
  await expect(vesnaPlace).toBeHidden()
  await expect(route.locator('.place-row-name')).toHaveText(['Futog', 'Novi Sad', 'Kać', 'Liman', 'HQ', 'Add a pickup point'])
  await route.getByRole('button', { name: 'Remove Kać' }).click()
  await route.getByRole('button', { name: 'Remove Futog' }).click()
  await expect(route.getByText(`Goran Rider ${tag} will get in at the start instead.`)).toBeVisible()
  await route.getByRole('button', { name: 'Close' }).click()
  await expect(route).toBeHidden()
  await expect(trip.locator('.trip-place')).toHaveText(['Futog', 'Novi Sad', 'Liman', 'HQ', 'Novi Sad'])
  await expect(goran.locator('.trip').first().locator('.trip-place')).toHaveText(['Futog', 'Novi Sad', 'Liman', 'HQ', 'Novi Sad'])

  // She closes the route to new places: Goran can only pick from what is there.
  await vesna.getByRole('button', { name: 'Ride options' }).first().click()
  await vesna.getByRole('menuitem', { name: 'Stop passengers adding pickup points' }).click()
  await expect(toast(vesna, 'Passengers can no longer add pickup points.')).toBeAttached()
  await goran.getByRole('button', { name: 'Edit', exact: true }).first().click()
  await goran.getByRole('button', { name: 'Change pickup' }).click()
  await expect(goran.getByRole('option', { name: 'Liman' })).toBeVisible()
  await expect(goran.getByRole('option', { name: 'Somewhere else…' })).toHaveCount(0)
  await expect(goran.getByRole('button', { name: 'Add a pickup point' })).toHaveCount(0)
})

test('a new pickup point from the waiting list goes on the route with the seat', async ({ browser }, info) => {
  const options = info.project.use
  const tag = attempt(info)
  const dara = await register(browser, `dara.${tag.toLowerCase()}`, 'Dara', `Driver ${tag}`, options)
  const ema = await register(browser, `ema.${tag.toLowerCase()}`, 'Ema', `First ${tag}`, options)
  const filip = await register(browser, `filip.${tag.toLowerCase()}`, 'Filip', `Waiting ${tag}`, options)

  // One seat only.
  await dara.getByRole('button', { name: 'Add ride' }).click()
  const form = dara.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('White Up')
  await form.getByRole('button', { name: 'Fewer seats' }).click()
  await form.getByRole('button', { name: 'Fewer seats' }).click()
  await form.getByLabel('Pickup location').fill('Novi Sad')
  await form.getByLabel('Drop-off location').fill('HQ')
  await form.getByRole('button', { name: 'Add ride' }).click()
  await expect(toast(dara, 'Ride added.')).toBeAttached()

  const rowName = new RegExp(`Dara Driver ${tag} · White Up`)
  await ema.getByRole('button', { name: rowName }).click()
  await ema.getByRole('button', { name: 'Get in this car' }).first().click()
  await expect(toast(ema, `You're in with Dara Driver ${tag}.`)).toBeAttached()

  // Filip queues to get in at Kać, before the start; the route does not change yet.
  const filipRow = filip.getByRole('button', { name: rowName })
  await expect(filipRow).toBeVisible()
  if ((await filipRow.getAttribute('aria-expanded')) !== 'true') await filipRow.click()
  await expect(filip.getByRole('button', { name: 'Wait for a seat' })).toBeVisible()
  // A passenger has Add a pickup point under the route too (no Edit the route).
  await expect(filip.getByRole('button', { name: 'Edit the route' })).toHaveCount(0)
  await filip.getByRole('button', { name: 'Add a pickup point' }).first().click()
  const filipPlace = filip.getByRole('dialog', { name: 'New pickup point' })
  await filipPlace.getByLabel('Search places and addresses').fill('Kać')
  await filipPlace.getByRole('button', { name: 'Use “Kać”' }).click()
  await filipPlace.getByRole('button', { name: 'Where on the way' }).click()
  await filip.getByRole('option', { name: /Before Novi Sad/ }).click()
  await filipPlace.getByRole('button', { name: 'Wait for a seat' }).click()
  await expect(filip.getByText('Gets in at Kać · new pickup point').first()).toBeVisible()
  const trip = filip.locator('.trip').first().locator('.trip-place')
  await expect(trip).toHaveText(['Novi Sad', 'HQ', 'Novi Sad'])

  // Ema leaves: the seat is Filip's, and Kać is on the route.
  await ema.getByRole('button', { name: 'Leave' }).first().click()
  await expect(trip).toHaveText(['Kać', 'Novi Sad', 'HQ', 'Novi Sad'])
  await expect(filip.getByText('Gets in at Kać').first()).toBeVisible()
})
