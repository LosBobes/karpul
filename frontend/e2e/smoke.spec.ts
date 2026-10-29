import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * The whole app in one walk: two colleagues register, one offers a ride, the
 * other gets in and writes in the ride's thread, and the driver sees both
 * arrive live. If this passes, the shell, the API, the socket and the board's
 * main path all work together.
 */

// Each project (phone, desktop) gets its own people, so the runs never meet.
function person(project: string, who: 'ana' | 'marko') {
  const tag = project === 'phone' ? 'p' : 'd'
  return who === 'ana'
    ? { username: project === 'phone' ? 'ana' : 'ana.d', first: 'Ana', last: `Petrović ${tag.toUpperCase()}` }
    : { username: `marko.${tag}`, first: 'Marko', last: `Jovanović ${tag.toUpperCase()}` }
}

/** A toast, as the screen reader hears it (the visible pill is aria-hidden). */
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
  // The board replaces the door.
  await expect(page.getByRole('radiogroup', { name: 'View' })).toBeVisible()
  return page
}

test('offer a ride, get in, write in its thread', async ({ browser }, info) => {
  const options = info.project.use
  const ana = await register(browser, person(info.project.name, 'ana'), options)
  const marko = await register(browser, person(info.project.name, 'marko'), options)
  const anaName = `Ana Petrović ${info.project.name === 'phone' ? 'P' : 'D'}`
  const markoName = `Marko Jovanović ${info.project.name === 'phone' ? 'P' : 'D'}`

  // Ana adds a ride with the floating plus, in her own car.
  await ana.getByRole('button', { name: 'Add ride' }).click()
  const form = ana.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('Blue Golf')
  await form.getByLabel('Pickup location').fill('Novi Sad')
  await form.getByLabel('Drop-off location').fill('HQ')
  await form.getByRole('button', { name: 'Add ride' }).click()
  await expect(toast(ana, 'Ride added.')).toBeAttached()

  // Marko sees it arrive over the socket, without reloading, and gets in.
  const row = marko.getByRole('button', { name: new RegExp(`${anaName} · Blue Golf`) })
  await expect(row).toBeVisible()
  await row.click()
  await marko.getByRole('button', { name: 'Get in this car' }).first().click()
  await expect(toast(marko, `You're in with ${anaName}.`)).toBeAttached()

  // And writes in the thread.
  await marko.getByRole('button', { name: 'Write to the car' }).first().click()
  await marko.getByLabel('Write a message').first().fill('See you at the fountain')
  // Exact: the docked drawer's "Report a bug or send feedback" also contains "send".
  await marko.getByRole('button', { name: 'Send', exact: true }).first().click()
  await expect(marko.getByText('See you at the fountain').first()).toBeVisible()

  // Ana's board shows him in the car and the message count, live.
  // Adding the ride opened it already on a phone (the row is unfolded); a tap would fold it.
  const anaRow = ana.getByRole('button', { name: new RegExp(`${anaName} · Blue Golf`) })
  if ((await anaRow.getAttribute('aria-expanded')) !== 'true') await anaRow.click()
  await expect(ana.getByText(markoName).first()).toBeVisible()
  await expect(ana.getByRole('button', { name: 'Messages (1)' }).first()).toBeVisible()
})

test('signed out, the API shows nothing', async ({ request }) => {
  expect((await request.get('/api/rides')).status()).toBe(401)
  expect((await request.get('/api/stats/me')).status()).toBe(401)
  expect((await request.get('/api/health')).status()).toBe(200)
})

/** A 600×400 picture, made by the browser itself, as the file a person picks. */
async function picture(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 600
    c.height = 400
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#c0392b'
    ctx.fillRect(0, 0, 600, 400)
    ctx.fillStyle = '#2980b9'
    ctx.fillRect(200, 100, 200, 200)
    return c.toDataURL('image/png').split(',')[1]
  })
  return Buffer.from(data, 'base64')
}

test('a profile photo replaces the initials, for everyone', async ({ browser }, info) => {
  const options = info.project.use
  const tag = info.project.name === 'phone' ? 'p' : 'd'
  const nina = await register(browser, { username: `nina.${tag}`, first: 'Nina', last: `Photo ${tag.toUpperCase()}` }, options)
  const ivan = await register(browser, { username: `ivan.${tag}`, first: 'Ivan', last: `Viewer ${tag.toUpperCase()}` }, options)

  // Nina opens her account: through the ☰ on a phone, from the docked drawer on a desktop.
  const menu = nina.getByRole('button', { name: 'Menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await nina.locator('.drawer-me').first().click()
  const sheet = nina.getByRole('dialog', { name: 'Your account' })
  await sheet.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await picture(nina) })
  // The picture opens in the cropper first (components/PhotoCropper.tsx); the middle square will do.
  await sheet.getByRole('button', { name: 'Use this photo' }).click()
  await expect(sheet.getByRole('button', { name: 'Change photo' })).toBeVisible()
  const img = sheet.locator('.account-me .avatar img')
  await expect(img).toBeVisible()
  // Stored as the middle square, shrunk.
  const src = await img.getAttribute('src')
  const served = await nina.request.get(src!)
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/)

  // Nina offers a ride; Ivan sees her face on its driver card, and sees it
  // go when she removes it, without reloading.
  await nina.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await nina.getByRole('button', { name: 'Add ride' }).click()
  const form = nina.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('Red Clio')
  await form.getByLabel('Pickup location').fill('Novi Sad')
  await form.getByLabel('Drop-off location').fill('HQ')
  await form.getByRole('button', { name: 'Add ride' }).click()
  const row = ivan.getByRole('button', { name: new RegExp(`Nina Photo ${tag.toUpperCase()} · Red Clio`) })
  await expect(row).toBeVisible()
  await row.click()
  const face = ivan.locator(`.avatar img[src="${src}"]`).first()
  await expect(face).toBeVisible()

  if (await menu.isVisible()) await menu.click()
  await nina.locator('.drawer-me').first().click()
  // And back to the initials.
  await sheet.getByRole('button', { name: 'Remove photo' }).click()
  await expect(sheet.getByRole('button', { name: 'Add a photo' })).toBeVisible()
  await expect(img).toHaveCount(0)
  await expect(face).toHaveCount(0)
})

test('a reload keeps the view, the open form and what was typed in it', async ({ browser }, info) => {
  const tag = info.project.name === 'phone' ? 'p' : 'd'
  const page = await register(browser, { username: `rita.${tag}`, first: 'Rita', last: `Reload ${tag.toUpperCase()}` }, info.project.use)
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Week' }).click()
  await page.getByRole('button', { name: 'Add ride' }).click()
  const form = page.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'My own car' }).click()
  await form.getByPlaceholder('e.g. grey Octavia').fill('Red Clio')
  await form.getByLabel('Pickup location').fill('Petrovaradin')

  await page.reload()

  await expect(page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Week' })).toBeChecked()
  const back = page.getByRole('dialog', { name: 'Add ride' })
  await expect(back.getByPlaceholder('e.g. grey Octavia')).toHaveValue('Red Clio')
  await expect(back.getByLabel('Pickup location')).toHaveValue('Petrovaradin')

  // Closed, it is gone for good: the next reload opens on the board alone.
  await back.getByRole('button', { name: 'Close' }).click()
  await expect(back).toBeHidden()
  await page.reload()
  await expect(page.getByRole('radiogroup', { name: 'View' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Add ride' })).toBeHidden()
})
