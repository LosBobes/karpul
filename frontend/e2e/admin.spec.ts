import { expect, test, type APIRequestContext, type Browser, type Page, type TestInfo } from '@playwright/test'

/**
 * The admins' side, and the rescue when a shared car's driver cancels.
 *
 * An admin is an account whose username is in `KARPUL_ADMINS`
 * (playwright.config.ts lists one per project and attempt). Each test puts its
 * own car in the pool through the API, so the projects running side by side on
 * one database never book each other's car; what the test is about happens on
 * screen, the scaffolding around it through the API.
 */

/** A tag per project and attempt: a retry runs on the same database, so it signs up people (and cars) of its own. */
function attempt(info: TestInfo) {
  const n = info.retry + info.repeatEachIndex
  return (info.project.name === 'phone' ? 'P' : 'D') + (n ? String(n + 1) : '')
}

type Who = { username: string; first: string; last: string }

function toast(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text })
}

async function register(browser: Browser, who: Who, options: object): Promise<Page> {
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
  // A new account gets the first-login tour, an overlay over the board.
  await page.getByRole('button', { name: 'Skip the tour' }).click()
  return page
}

/** The page's own session, for the setup calls made beside the screen. */
async function api(page: Page): Promise<{ request: APIRequestContext; headers: Record<string, string> }> {
  const token = await page.evaluate(() => (JSON.parse(localStorage.getItem('karpul.auth') ?? '{}') as { token?: string }).token)
  expect(token).toBeTruthy()
  return { request: page.request, headers: { Authorization: `Bearer ${token}` } }
}

async function post(page: Page, path: string, data: object) {
  const { request, headers } = await api(page)
  const res = await request.post(path, { headers, data })
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBe(true)
  return res.json()
}

async function addCar(admin: Page, tag: string) {
  return post(admin, '/api/cars/corporate', { name: `Pool ${tag}`, plate: `NS-E2E-${tag}`, passenger_seats: 4 })
}

function isoDay(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The drawer: under the ☰ on a phone, docked on a desktop. */
async function drawer(page: Page, info: TestInfo, item: RegExp) {
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: item }).first().click()
}

/** A ride's row on the board, by its driver and its car's name ("Pool TP" and not "Pool TP2"). */
function row(page: Page, driver: string, carName: string) {
  return page.getByRole('button', { name: new RegExp(`${driver} · ${carName}(?!\\d)`) })
}

test('a shared car past the share is asked for, approved by an admin, and a plate ticked off the garage list', async ({ browser }, info) => {
  const options = info.project.use
  const tag = attempt(info)
  const admin = await register(browser, { username: `boss.${tag.toLowerCase()}`, first: 'Boss', last: `Admin ${tag}` }, options)
  const car = await addCar(admin, tag)

  const mila = await register(browser, { username: `mila.${tag.toLowerCase()}`, first: 'Mila', last: `Jović ${tag}` }, options)
  const milaName = `Mila Jović ${tag}`
  // Today's share of the shared cars is taken already, early in the morning.
  await post(mila, '/api/rides', {
    ride_date: isoDay(0),
    car_type: 'corporate',
    corporate_car_id: car.id,
    origin: 'Novi Sad',
    destination: 'Beograd',
    departure_time: '05:00',
    return_time: '06:00',
    seats: 2,
  })
  // A fresh form rather than a copy of that ride (`prefill_rides`), so it asks for the day's working hours.
  const { request, headers } = await api(mila)
  expect((await request.patch('/api/auth/me', { headers, data: { prefill_rides: false } })).ok()).toBe(true)
  await mila.reload()

  // A second shared car today is past the share: the form offers to ask an admin.
  await mila.getByRole('button', { name: 'Add ride' }).click()
  const form = mila.getByRole('dialog', { name: 'Add ride' })
  await form.getByRole('radio', { name: 'Shared car' }).click()
  await form.getByRole('button', { name: 'Which shared car' }).click()
  await mila.getByRole('option', { name: new RegExp(`^Pool ${tag}NS-E2E-${tag} `) }).click()
  await form.getByLabel('Pickup location').fill('Novi Sad')
  await form.getByLabel('Drop-off location').fill('Beograd')
  await form.getByRole('button', { name: 'Add ride' }).click()
  await form.getByRole('button', { name: 'Ask an admin to approve it' }).click()
  await expect(toast(mila, 'Added. The admins are asked to approve it.')).toBeAttached()
  // Taking a shared car ends with the mail to the office, the admins in copy.
  const mail = mila.getByRole('dialog', { name: 'Let the office know' })
  await expect(mail).toContainText('vesna.ardeljan@non.se.com')
  await expect(mail).toContainText(`boss.admin.${tag.toLowerCase()}@se.com`)
  await expect(mail.getByRole('link', { name: 'Open in email' })).toHaveAttribute('href', /^mailto:vesna\.ardeljan@non\.se\.com\?cc=/)
  await mail.getByRole('button', { name: 'Not now' }).click()
  await expect(mail).toHaveCount(0)
  const pending = mila.getByRole('button', { name: new RegExp(`${milaName} · ${car.name}(?!\\d)`) }).filter({ hasText: 'Awaiting approval' })
  await expect(pending).toBeVisible()

  // The admin finds it under Approvals and lets it through.
  await drawer(admin, info, /^Approvals/)
  const approvals = admin.getByRole('dialog', { name: 'Approvals' })
  // Every admin sees every ask, the other runs' too: this one is Mila's ("Mila Jović P", not "P2").
  const ask = approvals.getByRole('listitem').filter({ hasText: new RegExp(`${milaName}(?!\\d)`) })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Approve' }).click()
  await expect(toast(admin, `Approved. ${milaName} has the car.`)).toBeAttached()
  await expect(ask).toHaveCount(0)
  await approvals.getByRole('button', { name: 'Close' }).first().click()

  // Mila's board drops the tag without a reload.
  await expect(pending).toHaveCount(0)

  // An own car coming to the Beograd office gives its plate; the admin ticks it off.
  const plate = `BG-${tag}-77`
  await post(mila, '/api/rides', {
    ride_date: isoDay(1),
    car_type: 'own',
    car_name: 'Red Clio',
    plate,
    origin: 'Novi Sad',
    destination: 'Beograd',
    departure_time: '07:00',
    return_time: '16:00',
    seats: 3,
  })
  await drawer(admin, info, /^Garage list/)
  const garage = admin.getByRole('dialog', { name: 'Garage list' })
  const task = garage.getByRole('listitem').filter({ hasText: plate.toUpperCase() })
  await expect(task).toBeVisible()
  await task.getByRole('button', { name: 'Mark as added' }).click()
  await expect(task.getByText('On the list')).toBeVisible()
})

test('a shared car whose driver cancels is taken over by a passenger', async ({ browser }, info) => {
  const options = info.project.use
  const tag = attempt(info)
  const admin = await register(browser, { username: `chief.${tag.toLowerCase()}`, first: 'Chief', last: `Admin ${tag}` }, options)
  const car = await addCar(admin, `T${tag}`)

  const teodor = await register(browser, { username: `teodor.${tag.toLowerCase()}`, first: 'Teodor', last: `Ilić ${tag}` }, options)
  const sara = await register(browser, { username: `sara.${tag.toLowerCase()}`, first: 'Sara', last: `Kostić ${tag}` }, options)
  const teodorName = `Teodor Ilić ${tag}`
  const saraName = `Sara Kostić ${tag}`
  // Tomorrow, so the ride has not left by the time it is handed over.
  await post(teodor, '/api/rides', {
    ride_date: isoDay(1),
    car_type: 'corporate',
    corporate_car_id: car.id,
    origin: 'Beograd',
    destination: 'Novi Sad',
    departure_time: '09:00',
    return_time: '18:00',
    seats: 3,
  })

  // Sara gets in.
  const saraRow = row(sara, teodorName, car.name)
  await expect(saraRow).toBeVisible()
  await saraRow.click()
  await sara.getByRole('button', { name: 'Get in this car' }).first().click()
  await sara.getByRole('dialog', { name: 'Where do you get in?' }).getByRole('button', { name: /Start/ }).click()
  await expect(toast(sara, `You're in with ${teodorName}.`)).toBeAttached()

  // Teodor cancels: the car stays, and its passengers are asked to drive.
  const teodorRow = row(teodor, teodorName, car.name)
  if ((await teodorRow.getAttribute('aria-expanded')) !== 'true') await teodorRow.click()
  await expect(teodor.getByText(saraName).first()).toBeVisible()
  await teodor.getByRole('button', { name: 'Ride options' }).first().click()
  await teodor.getByRole('menuitem', { name: 'Remove ride' }).click()
  await teodor.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(toast(teodor, 'Your passengers are asked whether one of them drives.')).toBeAttached()

  // Sara sees it live on the ride's row (every board shows every ride, the
  // other runs' too, so the checks stay on this one), and takes the wheel.
  await expect(saraRow).toContainText('Needs a driver')
  await sara.getByRole('button', { name: "I'll drive" }).first().click()
  await expect(toast(sara, "You're driving now.")).toBeAttached()

  // The ride is Sara's now, on both boards.
  const taken = row(sara, saraName, car.name)
  await expect(taken).toBeVisible()
  await expect(taken).not.toContainText('Needs a driver')
  await expect(row(teodor, saraName, car.name)).toBeVisible()
})
