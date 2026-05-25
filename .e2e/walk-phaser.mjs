// Phaser TownScene walking e2e (issue #16, PR-B).
// Opens the village under ?engine=phaser, walks the avatar up the entrance
// stem and west along the street to Compliance House's doormat, then steps
// into the doorway. Asserts the player position after each leg via the
// __game test API (canvas has no DOM nodes to query), and confirms the
// enterCommunity event reached the React shell (the DOM CommunityInterior
// is rendered because PR-B keeps the interior on the DOM engine for now).
import { chromium } from 'playwright-core'
import { clearGateTrainer } from './_helpers.mjs'

const OUT = process.argv[2] || '.'
const TILE = 48

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Reset session so we spawn at the Town Entrance.
await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

await page.goto('http://localhost:5390/?engine=phaser', { waitUntil: 'networkidle' })
// Wait for the Phaser scene to publish its test API.
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, {
  timeout: 10000,
})
// And for the test API to expose the playerTile read.
await page.waitForFunction(() => typeof window.__game?.playerTile === 'function', null, {
  timeout: 5000,
})

await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/walk-phaser-01-entrance.png` })

const playerTile = () => page.evaluate(() => window.__game.playerTile())
const buildingCount = () =>
  page.evaluate(() => (window.__game.buildings?.() || []).length)

const spawn = await playerTile()
const buildings = await buildingCount()

// Phaser keyboard input runs against the actual page — no special focus
// needed since the canvas captures keyboard via Phaser's listeners.
const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key)
    await page.waitForTimeout(190)
    await page.keyboard.up(key)
    await page.waitForTimeout(40)
  }
}

// PR-B doesn't have the gate trainer in Phaser yet (still DOM-only — PR-D
// moves him over). The DOM-side _helpers.clearGateTrainer would only run
// in the DOM engine, so we skip it here. With a clean session the player
// can walk straight up the stem without any encounters.
void clearGateTrainer // referenced so the import isn't flagged unused

// Spawn → street row: walk up 10 tiles, then west 9 to Compliance's doormat.
await press('ArrowUp', 10)
const afterUp = await playerTile()
await press('ArrowLeft', 9)
const afterLeft = await playerTile()
await page.screenshot({ path: `${OUT}/walk-phaser-02-at-door.png` })

// Step into Compliance's door. The Phaser scene emits enterCommunity and
// starts Phaser's InteriorScene (PR-C). The DOM <CommunityInterior> is
// no longer mounted under ?engine=phaser — the InteriorScene owns the
// canvas instead.
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Interior',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/walk-phaser-03-interior.png` })

const interiorTitle = await page.evaluate(
  () => window.__game?.community?.()?.title || null,
)

const ok =
  spawn.x === 12 &&
  spawn.y === 17 &&
  buildings === 5 &&
  afterUp.x === 12 &&
  afterUp.y === 7 &&
  afterLeft.x === 3 &&
  afterLeft.y === 7 &&
  interiorTitle === 'Compliance House' &&
  errors.length === 0

console.log(
  JSON.stringify(
    { spawn, afterUp, afterLeft, buildings, interiorTitle, ok, errors },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
