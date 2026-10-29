import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * The end-to-end smoke test (`npm run e2e`): the real app, the way it ships.
 * `npm run build` first; this starts the backend with that build on a fresh
 * SQLite file in the temp directory, so a run never touches a real database.
 * `PYTHON` picks the interpreter (CI has `python`; a checkout may point it at
 * backend/.venv).
 */
const PORT = 8765
const db = join(tmpdir(), `karpul-e2e-${Date.now()}.db`).replace(/\\/g, '/')

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
    // A checkout with another Chromium than this Playwright's (a container
    // with one pre-installed) points at it here; CI leaves it unset.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `${process.env.PYTHON ?? 'python'} -m uvicorn app.main:app --host 127.0.0.1 --port ${PORT}`,
    cwd: '../backend',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: `sqlite:///${db}`,
      KARPUL_FRONTEND_DIST: join(process.cwd(), 'dist'),
      CORPORATE_CARS: '',
      KARPUL_VAPID_PRIVATE_KEY: '',
      KARPUL_ADMINS: 'ana',
      // Every test registers its own people, all from one address.
      KARPUL_REGISTRATIONS_PER_HOUR: '100',
      // No outside services: places come from what Karpul knows (the offices),
      // and the map's tiles from an address that answers nothing, so the map
      // draws its pins on a blank ground without the test touching the network.
      KARPUL_GEOCODER_URL: '',
      KARPUL_ROUTER_URL: '',
      KARPUL_MAP_TILES: '/api/no-tiles/{z}/{x}/{y}.png',
    },
  },
})
