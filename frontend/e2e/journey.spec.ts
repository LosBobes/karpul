import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'

/**
 * One whole ride, from both sides: a driver offers one, a colleague gets in,
 * thinks better of it and leaves, the driver sees both live and then removes
 * the ride, which the colleague sees go. The smoke test proves the parts meet;
 * this proves the board agrees with itself after each step.
 */

/**
 * A tag for this project and attempt, in the usernames and the surnames: a
 * retry runs on the same database, where the first attempt's people and rides
 * are still there, so it signs up people of its own.
 */
function attempt(info: TestInfo) {
  const n = info.retry + info.repeatEachIndex
  return (info.project.name === 'phone' ? 'P' : 'D') + (n ? String(n + 1) : '')
}

function person(tag: string, who: 'lena' | 'nikola') {
  return who === 'lena'
    ? { username: `lena.${tag.toLowerCase()}`, first: 'Lena', last: `Mitić ${tag}` }
    : { username: `nikola.${tag.toLowerCase()}`, first: 'Nikola', last: `Savić ${tag}` }
}

function toast(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text })
}

async function register(browser: Browser, who: ReturnType<typeof person>, options: object): Promise<Page> {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('tab', { name: 'Register' }).click()
  await page.getByLabel('First name').fill(who.first)
  await page.getByLabel('Surname').fill(who.last)
  await page.getByLabel('Username').fill(who.username)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('radiogroup', { name: 'View' })).toBeVisible()
  return page
}

test('offer a ride, get in, leave, and the driver removes it', async ({ browser }, info) => {
  const options = info.project.use
  const tag = attempt(info)
  const lena = await register(browser, person(tag, 'lena'), options)
  const nikola = await register(browser, person(tag, 'nikola'), options)
  const lenaName = `Lena Mitić ${tag}`
  const nikolaName = `Nikola Savić ${tag}`

  // Lena offers a ride between the offices in her own car: the distance is known.
  await lena.getByRole('button', { name: 'Add ride' }).click()
  const form = lena.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('Red Clio')
  await form.getByLabel('Pickup location').fill('Beograd')
  await form.getByLabel('Drop-off location').fill('Novi Sad')
  await form.getByRole('button', { name: 'Add ride' }).click()
  await expect(toast(lena, 'Ride added.')).toBeAttached()

  // Nikola sees it, opens it and gets in; the known road is on the card.
  const row = nikola.getByRole('button', { name: new RegExp(`${lenaName} · Red Clio`) })
  await expect(row).toBeVisible()
  await row.click()
  await expect(nikola.getByText('90 km one way').first()).toBeVisible()
  await nikola.getByRole('button', { name: 'Get in this car' }).first().click()
  await expect(toast(nikola, `You're in with ${lenaName}.`)).toBeAttached()

  // Lena's board shows him, live.
  const lenaRow = lena.getByRole('button', { name: new RegExp(`${lenaName} · Red Clio`) })
  if ((await lenaRow.getAttribute('aria-expanded')) !== 'true') await lenaRow.click()
  await expect(lena.getByText(nikolaName).first()).toBeVisible()

  // Nikola leaves; Lena's list empties again.
  await nikola.getByRole('button', { name: 'Leave' }).first().click()
  await expect(nikola.getByRole('button', { name: 'Get in this car' }).first()).toBeVisible()
  await expect(lena.getByText('No passengers yet.').first()).toBeVisible()

  // Lena removes the ride; it leaves Nikola's board without a reload.
  await lena.getByRole('button', { name: 'Ride options' }).first().click()
  await lena.getByRole('menuitem', { name: 'Remove ride' }).click()
  await lena.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(toast(lena, 'Ride removed.')).toBeAttached()
  await expect(row).toBeHidden()
})

test('the car status sheet opens for everyone', async ({ browser }, info) => {
  const tag = attempt(info).toLowerCase()
  const page = await register(browser, { username: `vuk.${tag}`, first: 'Vuk', last: `Perić ${tag}` }, info.project.use)
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Car status' }).click()
  await expect(page.getByRole('dialog', { name: 'Car status' })).toBeVisible()
})
