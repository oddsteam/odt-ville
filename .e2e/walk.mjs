// Drives a real browser through the top-down town: spawn at the Town
// Entrance, walk up the path, over to Compliance House, and into its
// doorway — landing inside the spatial interior.
//
// PR-E switched the engine default to Phaser, so this canonical walk
// test now targets the Phaser TownScene + InteriorScene via the
// __game test API (canvas has no DOM nodes to query). The previous
// walk-phaser.mjs duplicate was deleted in the same commit; this is
// the only walk e2e going forward.
import { chromium } from 'playwright-core'
import { clearPhaserGateTrainer } from './_helpers.mjs'

const OUT = process.argv[2] || '.'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Reset session so we spawn at the Town Entrance — without this a
// previously-stored `last_community_id` would land the player on a
// doormat and break the entrance-relative step counts below.
await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

await page.goto('http://localhost:5390/', { waitUntil: 'networkidle' })
// Wait for the Phaser scene to publish its test API.
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

// First step up the entrance stem triggers the gate trainer's duel —
// dismiss it so the rest of the planned walk is deterministic. After
// this returns the trainer is defeated for the rest of the page
// session and the player is one tile above the entrance (10 more ups
// to reach the street row).
await clearPhaserGateTrainer(page)

// Town Entrance → up the entrance stem (which crosses the tall-grass
// field safely) to the street, then west along the street under
// Compliance House.
await press('ArrowUp', 10)
const afterUp = await playerTile()
await press('ArrowLeft', 9)
const afterLeft = await playerTile()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/02-at-door.png` })

// Step up into the doorway — the Phaser TownScene emits
// enterCommunity and starts InteriorScene.
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Interior',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(400)

const interiorTitle = await page.evaluate(
  () => window.__game?.community?.()?.title || null,
)
const boards = await page.evaluate(
  () => window.__game?.boards?.() || [],
)
await page.screenshot({ path: `${OUT}/03-compliance-interior.png`, fullPage: true })

const ok =
  spawn.x === 12 &&
  spawn.y === 18 &&
  buildings === 5 &&
  afterUp.x === 12 &&
  afterUp.y === 7 &&
  afterLeft.x === 3 &&
  afterLeft.y === 7 &&
  interiorTitle === 'Compliance House' &&
  boards.length === 3 &&
  errors.length === 0

console.log(
  JSON.stringify(
    { spawn, afterUp, afterLeft, buildings, interiorTitle, boards, ok, errors },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
