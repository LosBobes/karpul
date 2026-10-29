import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'

/**
 * Places on the map: the driver picks the start and the destination from the
 * suggestions (the offices Karpul knows, pinned for everyone), the ride card
 * opens each place in the maps app and shows the route on a map, and a
 * passenger pins a new pickup point of their own by dropping it on the map.
 * The server has no outside services here (playwright.config.ts): the
 * suggestions are the known places, and the tiles answer nothing.
 */

function toast(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text })
}

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

test('places are suggested, pinned and shown on the map', async ({ browser }, info) => {
  const options = info.project.use
  const tag = attempt(info)
  const mira = await register(browser, `mira.${tag.toLowerCase()}`, 'Mira', `Maps ${tag}`, options)
  const toma = await register(browser, `toma.${tag.toLowerCase()}`, 'Toma', `Pins ${tag}`, options)

  await mira.getByRole('button', { name: 'Add ride' }).click()
  const form = mira.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('Blue Clio')
  // The offices are suggested as you type, and come with their pins.
  await form.getByLabel('Pickup location').fill('Novi')
  await mira.getByRole('option', { name: /Novi Sad/ }).click()
  await expect(form.getByLabel('Pickup location')).toHaveValue('Novi Sad')
  await expect(form.getByRole('button', { name: 'Move the pin of Novi Sad' })).toBeVisible()
  await form.getByLabel('Drop-off location').fill('Beo')
  await mira.getByRole('option', { name: /Beograd/ }).click()
  await form.getByRole('button', { name: 'Add ride' }).click()
  await expect(toast(mira, 'Ride added.')).toBeAttached()

  // Toma opens it: each place opens in the maps app, by its pin.
  const row = toma.getByRole('button', { name: new RegExp(`Mira Maps ${tag} · Blue Clio`) })
  await expect(row).toBeVisible()
  await row.click()
  const card = toma.locator('.driver-card').first()
  await expect(card.getByRole('link', { name: 'Open Novi Sad in Maps' })).toHaveAttribute('href', /query=45\.2551%2C19\.8452/)
  await expect(card.locator('.trip-map-pinned')).toHaveCount(2)

  // The route on the map: inline in a wide pane, behind "Show on map" on a phone.
  const map = toma.getByRole('region', { name: 'Novi Sad to Beograd' })
  if (info.project.name === 'phone') await card.getByRole('button', { name: 'Show on map' }).click()
  await expect(map).toBeVisible()
  await expect(map.locator('.map-pin')).toHaveCount(2)
  if (info.project.name === 'phone') await toma.getByRole('dialog', { name: 'Novi Sad to Beograd' }).getByRole('button', { name: 'Close' }).click()

  // He gets in somewhere new and drops its pin on the map.
  await toma.getByRole('button', { name: 'Pickup', exact: true }).first().click()
  await toma.getByRole('option', { name: 'Somewhere else…' }).click()
  const stop = toma.locator('.add-stop')
  await stop.getByLabel('New pickup point').fill('Kod Spensa')
  await stop.getByRole('button', { name: 'Pick on the map' }).click()
  await expect(stop.getByText('Everyone in Karpul can see this point.', { exact: false })).toBeVisible()
  await stop.getByRole('button', { name: 'Use this point' }).click()
  await expect(stop.getByRole('button', { name: 'Move the pin of Kod Spensa' })).toBeVisible()
  await stop.getByRole('button', { name: 'Get in this car' }).click()
  await expect(toast(toma, `You're in with Mira Maps ${tag}.`)).toBeAttached()
  await expect(card.locator('.trip-place')).toHaveText(['Novi Sad', 'Kod Spensa', 'Beograd'])
  await expect(card.locator('.trip-map-pinned')).toHaveCount(3)

  // Mira sees the new pin too, without reloading.
  const miraRow = mira.getByRole('button', { name: new RegExp(`Mira Maps ${tag} · Blue Clio`) })
  if ((await miraRow.getAttribute('aria-expanded')) !== 'true') await miraRow.click()
  await expect(mira.locator('.driver-card').first().locator('.trip-map-pinned')).toHaveCount(3)
})
