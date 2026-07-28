// Spatial community interior — issue #15, ported to Phaser in PR-E.
//
// Walk into Compliance House, verify the InteriorScene renders three
// boards, walk up to each and press A, assert each opens the configured
// VITE_BOARD_URL — or nothing when unset (#335) — through the openBoard
// bus event (window.open stubbed so popups don't steal keyboard focus).
// Then step south through the door and confirm we land back in TownScene
// on Compliance's doormat.
//
// PR-E port: the canonical interior e2e now runs against the Phaser
// engine via the __game test API; interior-phaser.mjs duplicate was
// dropped in the same commit.
import { chromium } from 'playwright-core'
import { clearPhaserGateTrainer } from './_helpers.mjs'

const OUT = process.argv[2] || '.'
// Must match the VITE_BOARD_URL the dev server under test was started with
// (#335): set in both shells, boards open it; unset in both, boards open
// nothing and this script asserts exactly that.
const BOARD_URL = process.env.VITE_BOARD_URL || null

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Reset session so the village spawns at the Town Entrance, not a
// previously-saved doormat.
await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

// Stub window.open before the page boots — actual popups would steal
// keyboard focus between presses and ruin the movement sequence. We
// just want to know what URL each board would have opened with.
await page.addInitScript(() => {
  window.__openCalls = []
  window.open = (url, target, features) => {
    window.__openCalls.push({ url, target, features })
    return null
  }
})

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key)
    await page.waitForTimeout(190)
    await page.keyboard.up(key)
    await page.waitForTimeout(40)
  }
}

const sceneKey = () =>
  page.evaluate(() => window.__game?.activeSceneKey?.() || null)
const playerTile = () => page.evaluate(() => window.__game?.playerTile?.() || null)
const openCalls = () => page.evaluate(() => window.__openCalls || [])

await page.goto('http://localhost:5390/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, {
  timeout: 10000,
})
await page.waitForTimeout(700)

// First step up triggers the gate trainer — dismiss the duel so the
// rest of the walk is deterministic.
await clearPhaserGateTrainer(page)

// Spawn (12, 18), trainer step to row 17, then Compliance doormat (3, 7).
await press('ArrowUp', 10)
await press('ArrowLeft', 9)
await press('ArrowUp', 1)

// Wait for InteriorScene to take over — the scene-start hook
// reassigns window.__game.activeSceneKey + repopulates its surface.
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Interior',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/interior-01-entered.png` })

const inInterior = await sceneKey()
const interiorCommunity = await page.evaluate(() => window.__game?.community?.())
const boards = await page.evaluate(() => window.__game?.boards?.() || [])
const spawnTile = await playerTile()

// Player spawn inside the interior is (5, 6) facing up — see
// InteriorScene.init: spawn = (DOOR_COL, DOOR_ROW - 1).
const expectedSpawn = { x: 5, y: 6 }

// Walk to Should Know board (centre, col 5, row 1). Spawn (5,6) → up
// 4 → (5,2), facing up at the board.
await press('ArrowUp', 4)
await page.waitForTimeout(150)
await page.screenshot({ path: `${OUT}/interior-02-at-should-know.png` })
await press('Enter', 1) // A button
await page.waitForTimeout(200)
const afterShould = await openCalls()

// Walk left to (3,2), face up at Must Know, press A.
await press('ArrowLeft', 2)
await press('ArrowUp', 1) // turn to face up (board blocks; player rotates only)
await press('Enter', 1)
await page.waitForTimeout(200)
const afterMust = await openCalls()

// Walk right to (7,2), face up at Nice to Know, press A.
await press('ArrowRight', 4)
await press('ArrowUp', 1)
await press('Enter', 1)
await page.waitForTimeout(200)
const afterNice = await openCalls()

await page.screenshot({ path: `${OUT}/interior-03-after-presses.png` })

// Walk south back to the door — (7,2) → (5,7).
await press('ArrowDown', 4) // (7, 6)
await press('ArrowLeft', 2) // (5, 6)
await press('ArrowDown', 1) // step onto door → exits
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Town',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/interior-04-back-in-village.png` })

const backInTown = await sceneKey()
const townPlayerTile = await playerTile()

// Player should respawn on Compliance's doormat (3, 7).
const expectedTownTile = { x: 3, y: 7 }

// One press per board so far; with no URL configured, no calls at all.
const wantCalls = BOARD_URL ? [1, 2, 3] : [0, 0, 0]
const callsAllMatchBoardUrl = afterNice.every((c) => c.url === BOARD_URL)

const ok =
  inInterior === 'Interior' &&
  interiorCommunity?.title === 'Compliance House' &&
  boards.length === 3 &&
  boards[0]?.type === 'must_know' &&
  boards[1]?.type === 'should_know' &&
  boards[2]?.type === 'nice_to_know' &&
  spawnTile?.x === expectedSpawn.x &&
  spawnTile?.y === expectedSpawn.y &&
  afterShould.length === wantCalls[0] &&
  afterMust.length === wantCalls[1] &&
  afterNice.length === wantCalls[2] &&
  callsAllMatchBoardUrl &&
  backInTown === 'Town' &&
  townPlayerTile?.x === expectedTownTile.x &&
  townPlayerTile?.y === expectedTownTile.y &&
  errors.length === 0

console.log(
  JSON.stringify(
    {
      inInterior,
      interiorCommunity,
      boards,
      spawnTile,
      expectedSpawn,
      afterShould,
      afterMust,
      afterNice,
      callsAllMatchBoardUrl,
      backInTown,
      townPlayerTile,
      expectedTownTile,
      ok,
      errors,
    },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
