// Verifies that adding a new community puts the wrapped row *above* the
// existing row — the original houses stay anchored to the entrance.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Read every building's plaque title + its plot's top-Y (px).
const snapshot = () =>
  page.$$eval('.building', (els) =>
    els.map((el) => ({
      title: el.querySelector('.bld-plaque')?.textContent?.trim(),
      top: parseInt(el.style.top, 10),
    })).sort((a, b) => a.top - b.top),
  )

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForTimeout(500)
const before = await snapshot()

// Add one community — this forces the town from 5 to 6 (wraps to a 2nd row).
// Admin lives in its own top-level tab now; the village game no longer has
// an in-game ⚙ button.
await page.click('.app-tab >> text=⚙ ADMIN')
await page.waitForSelector('.admin-page', { timeout: 5000 })
await page.fill('.admin-form input >> nth=0', 'Finance House')
await page.click('.admin-colour >> nth=5')
await page.click('.admin-add')
await page.waitForFunction(
  (n) => document.querySelectorAll('.admin-row').length === n,
  6,
  { timeout: 8000 },
)
await page.click('.app-tab >> text=🕹️ VILLAGE')
await page.waitForSelector('.building', { timeout: 5000 })
await page.waitForTimeout(400)
const after = await snapshot()

// Quick visual: walk up the entrance stem so the camera shows the original
// bottom row anchored near the player, then a second screenshot after walking
// further up to reveal the new top row.
await page.screenshot({ path: `${OUT}/above-1-at-entrance.png` })

await browser.close()

// The original five must all share one y in `after` (one row), the new house
// must sit at a smaller y (a new row above), and the originals' row must be
// at a larger y than the new one (the bottom row, closer to the entrance).
const newOne = after.find((b) => !before.some((x) => x.title === b.title))
const originalsAfter = after.filter((b) => b !== newOne)
const originalsRowY = originalsAfter[0]?.top
const originalsAreOneRow = originalsAfter.every((b) => b.top === originalsRowY)
const newIsAbove = !!newOne && newOne.top < originalsRowY

// Tidy: remove the Finance House so the next run is idempotent.
await fetch('http://localhost:3130/api/v1/communities')
  .then((r) => r.json())
  .then(async (d) => {
    const fin = d.communities.find((c) => c.title === 'Finance House')
    if (fin) {
      await fetch(`http://localhost:3130/api/v1/communities/${fin.id}`, {
        method: 'DELETE',
      })
    }
  })
  .catch(() => {})

console.log(
  JSON.stringify(
    {
      before: before.map((b) => `${b.title}@y${b.top}`),
      after: after.map((b) => `${b.title}@y${b.top}`),
      originalsAreOneRow,
      newOne,
      newIsAbove,
      errors,
    },
    null,
    2,
  ),
)
process.exit(errors.length || !originalsAreOneRow || !newIsAbove ? 1 : 0)
