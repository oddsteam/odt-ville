// Drives a real browser through the top-down town: spawn at the Town
// Entrance, walk up the path, over to Compliance House, and into its
// doorway. Reads scene state via the Phaser test API (canvas has no DOM
// nodes to query).
import { chromium } from 'playwright-core'
import { clearGateTrainer } from './_helpers.mjs'

const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key)
    await page.waitForTimeout(190)
    await page.keyboard.up(key)
    await page.waitForTimeout(40)
  }
}

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, {
  timeout: 10000,
})
await page.waitForFunction(
  () => typeof window.__game?.playerTile === 'function',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/01-town.png` })

// First step up triggers the gate trainer; dismiss the duel so the
// scripted walk stays deterministic. After this returns the player is
// one tile above the entrance (9 more ups to the street row).
await clearGateTrainer(page)
await press('ArrowUp', 9)
await press('ArrowLeft', 9)
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/02-at-door.png` })

// Step up into the doorway → Phaser's InteriorScene takes over.
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Interior',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/03-compliance-interior.png`, fullPage: true })

const title = await page.evaluate(() => window.__game?.community?.()?.title)
const boards = await page.evaluate(() => window.__game?.boards?.() || [])

console.log(JSON.stringify({ title, boards, errors }, null, 2))
await browser.close()
process.exit(errors.length ? 1 : 0)
