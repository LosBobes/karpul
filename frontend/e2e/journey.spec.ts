import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * One whole ride, from both sides: a driver offers one, a colleague gets in,
 * thinks better of it and leaves, the driver sees both live and then removes
 * the ride, which the colleague sees go. The smoke test proves the parts meet;
 * this proves the board agrees with itself after each step.
 */

function person(project: string, who: 'lena' | 'nikola') {
  const tag = project === 'phone' ? 'P' : 'D'
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
  const lena = await register(browser, person(info.project.name, 'lena'), options)
  const nikola = await register(browser, person(info.project.name, 'nikola'), options)
  const lenaName = `Lena Mitić ${info.project.name === 'phone' ? 'P' : 'D'}`
  const nikolaName = `Nikola Savić ${info.project.name === 'phone' ? 'P' : 'D'}`

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
  const page = await register(browser, { username: `vuk.${info.project.name}`, first: 'Vuk', last: `Perić ${info.project.name}` }, info.project.use)
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Car status' }).click()
  await expect(page.getByRole('dialog', { name: 'Car status' })).toBeVisible()
})
