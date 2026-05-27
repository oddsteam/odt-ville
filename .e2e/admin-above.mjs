// Verifies that adding a new community puts the wrapped row *above*
// the existing row — the original houses stay anchored to the
// entrance.
//
// PR-E port: admin-side flows are unchanged (the ⚙ ADMIN tab is its
// own DOM page, independent of the engine flag), but the village-side
// building snapshot now reads from window.__game.buildings() instead
// of the DOM .building divs that no longer mount under the Phaser
// engine.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Phaser building snapshot — title + pixel-y of the plot's top-left
// (b.row * TILE in the scene's coordinates). Sorted top→bottom so
// the row banding stays comparable to the DOM version.
const snapshot = () =>
  page.evaluate(() => {
    const list = window.__game?.buildings?.() || []
    return list
      .map((b) => ({ title: b.title, top: b.y }))
      .sort((a, b) => a.top - b.top)
  })

const waitForBuildingCount = (n) =>
  page.waitForFunction(
    (count) => (window.__game?.buildings?.() || []).length === count,
    n,
    { timeout: 8000 },
  )

await page.goto('http://localhost:5390/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, {
  timeout: 10000,
})
await page.waitForFunction(
  () => typeof window.__game?.buildings === 'function',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(500)
const before = await snapshot()

// Add one community — this forces the town from 5 to 6 (wraps to a
// second row). Admin lives in its own top-level tab; the village game
// no longer has an in-game ⚙ button.
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
// Re-wait for the Phaser scene since switching tabs unmounts + remounts.
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, {
  timeout: 10000,
})
await waitForBuildingCount(6)
await page.waitForTimeout(400)
const after = await snapshot()

await page.screenshot({ path: `${OUT}/above-1-at-entrance.png` })
await browser.close()

// The original five must all share one y in `after` (one row), the
// new house must sit at a smaller y (a new row above), and the
// originals' row must be at a larger y than the new one (the bottom
// row, closer to the entrance).
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
