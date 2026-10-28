import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Pickup points that are not on the route yet: a passenger gets in at a place
 * of their own before the start, and the driver adds one on the way to a ride
 * that is already on the board. Each side sees the other's change live.
 */

function toast(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text })
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
  const tag = info.project.name === 'phone' ? 'P' : 'D'
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
  await goran.getByLabel('New pickup point').fill('Futog')
  await goran.getByRole('button', { name: 'Where on the way' }).click()
  await goran.getByRole('option', { name: /Before Novi Sad/ }).click()
  await goran.locator('.add-stop').getByRole('button', { name: 'Get in this car' }).click()
  await expect(toast(goran, `You're in with Vesna Driver ${tag}.`)).toBeAttached()
  await expect(goran.getByText('Gets in at Futog').first()).toBeVisible()

  // Vesna sees him, and Futog ahead of her start, without reloading.
  const vesnaRow = vesna.getByRole('button', { name: new RegExp(`Vesna Driver ${tag} · Green Polo`) })
  if ((await vesnaRow.getAttribute('aria-expanded')) !== 'true') await vesnaRow.click()
  const trip = vesna.locator('.trip').first()
  await expect(trip.locator('.trip-place')).toHaveText(['Futog', 'Novi Sad', 'HQ'])

  // She adds Liman on the way; it lands between the start and HQ.
  await vesna.getByRole('button', { name: 'Add a pickup point' }).first().click()
  await vesna.getByLabel('New pickup point').fill('Liman')
  await vesna.locator('.add-stop').getByRole('button', { name: 'Add', exact: true }).click()
  await expect(toast(vesna, 'Liman is on the route.')).toBeAttached()
  await expect(trip.locator('.trip-place')).toHaveText(['Futog', 'Novi Sad', 'Liman', 'HQ'])
  await expect(goran.locator('.trip').first().locator('.trip-place')).toHaveText(['Futog', 'Novi Sad', 'Liman', 'HQ'])
})
