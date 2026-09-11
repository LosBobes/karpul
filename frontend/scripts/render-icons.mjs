// Renders the PNG app icons in public/ from public/favicon.svg, the one source
// of the mark. Run it after changing the SVG; the PNGs are checked in so a
// build never needs a browser.
//
//   node scripts/render-icons.mjs
//
// Needs Playwright's Chromium. With Playwright installed somewhere else, point
// PLAYWRIGHT_MODULE at its index.mjs and PLAYWRIGHT_CHROMIUM at the binary.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const source = readFileSync(join(pub, 'favicon.svg'), 'utf8')
const [head, rest] = source.split('<!-- tile -->')
const [tile, mark] = rest.split('<!-- mark -->')

/** The mark on a full-bleed tile, scaled about the centre for a platform mask. */
function fullBleed(scale) {
  const g = `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${mark.replace('</svg>', '')}</g></svg>`
  return head + tile.replace('rx="14"', 'rx="0"') + g
}

const variants = [
  // purpose "any": rounded corners, transparent around them
  { file: 'pwa-192.png', size: 192, svg: source },
  { file: 'pwa-512.png', size: 512, svg: source },
  // purpose "maskable": the platform cuts its own shape; the mark stays in the safe zone
  { file: 'pwa-maskable-512.png', size: 512, svg: fullBleed(0.8) },
  // iOS rounds the corners itself and wants no transparency
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed(0.92) },
]

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM })
for (const { file, size, svg } of variants) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  writeFileSync(join(pub, file), await page.screenshot({ omitBackground: true }))
  await page.close()
  console.log(`${file} ${size}x${size}`)
}
await browser.close()
