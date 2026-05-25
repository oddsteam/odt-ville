// Regression for issue #9: exiting a community must land the player on
// the doormat of the community they just exited — not the previously
// visited one. Walks A → exit, then B → exit, and asserts each
// post-exit tile is the expected community's (doorCol, doorRow + 1).
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

const playerTile = () => page.evaluate(() => window.__game?.playerTile?.() || null)
const sceneKey = () => page.evaluate(() => window.__game?.activeSceneKey?.() || null)
const communityTitle = () =>
  page.evaluate(() => window.__game?.community?.()?.title || null)

// Walk south onto the door tile from the interior spawn (5, 6) → step
// down 1 onto (5, 7). Phaser fires exitCommunity + scene.starts Town.
async function exitInterior() {
  await press('ArrowDown', 1)
  await page.waitForFunction(
    () => window.__game?.activeSceneKey?.() === 'Town',
    null,
    { timeout: 5000 },
  )
  await page.waitForTimeout(350)
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
await page.screenshot({ path: `${OUT}/exit-01-entrance.png` })

// First step up triggers the trainer; clear him.
await clearGateTrainer(page)

// Compliance House (slot 0) → doormat (3, 7); Product (slot 1) → (7, 7).
// We're at (12, 16) after the trainer pass-through; up 9 to street row,
// west 9 to (3, 7), up 1 into the doorway.
await press('ArrowUp', 9)
await press('ArrowLeft', 9)
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Interior',
  null,
  { timeout: 5000 },
)
const titleA = await communityTitle()
await page.screenshot({ path: `${OUT}/exit-02-inside-A.png` })

await exitInterior()
const afterA = await playerTile()
await page.screenshot({ path: `${OUT}/exit-03-after-A.png` })

// Now east 4 to Product's doormat (7, 7), then up into the doorway.
await press('ArrowRight', 4)
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Interior',
  null,
  { timeout: 5000 },
)
const titleB = await communityTitle()
await page.screenshot({ path: `${OUT}/exit-04-inside-B.png` })

await exitInterior()
const afterB = await playerTile()
await page.screenshot({ path: `${OUT}/exit-05-after-B.png` })

const inTown = await sceneKey()

const expected = {
  titleA: 'Compliance House',
  afterA: { x: 3, y: 7 },
  titleB: 'Product House',
  afterB: { x: 7, y: 7 },
}
const ok =
  titleA === expected.titleA &&
  afterA?.x === expected.afterA.x &&
  afterA?.y === expected.afterA.y &&
  titleB === expected.titleB &&
  afterB?.x === expected.afterB.x &&
  afterB?.y === expected.afterB.y &&
  inTown === 'Town' &&
  errors.length === 0

console.log(
  JSON.stringify(
    { titleA, afterA, titleB, afterB, expected, ok, errors },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
