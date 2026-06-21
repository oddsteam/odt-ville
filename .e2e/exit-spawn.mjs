// Regression for issue #9: exiting a community must land the player on
// the doormat of the community they just exited — not the previously-
// visited one. Walks A → exit, then B → exit, and asserts each
// post-exit tile is the expected community's `(doorCol, doorRow + 1)`.
//
// PR-E ported this from the DOM engine to the Phaser engine. Exit is
// no longer a button click on the DOM CommunityInterior — the Phaser
// InteriorScene exits when the player steps south onto the doormat
// at (DOOR_COL=5, DOOR_ROW=7), i.e. one ArrowDown from the spawn at
// (5, 6). All assertions read player position from window.__game.
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

// Reset session so we spawn at the Town Entrance, not a previously-
// stored community doormat.
await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

await page.goto('http://localhost:5390/', { waitUntil: 'networkidle' })
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

const playerTile = () => page.evaluate(() => window.__game.playerTile())
const activeScene = () => page.evaluate(() => window.__game.activeSceneKey())
const interiorTitle = () =>
  page.evaluate(() => window.__game?.community?.()?.title || null)

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key)
    await page.waitForTimeout(190)
    await page.keyboard.up(key)
    await page.waitForTimeout(40)
  }
}

// Wait for the active scene to settle after a transition triggered by
// a directional press. Waits for either Town or Interior to land.
const waitForScene = (key) =>
  page.waitForFunction(
    (k) => window.__game?.activeSceneKey?.() === k,
    key,
    { timeout: 5000 },
  )

// First step up the entrance stem triggers the gate trainer — dismiss
// his duel so the rest of the planned walk is deterministic.
await clearPhaserGateTrainer(page)

// With the default seed (5 communities) the town has one building
// row. Each plot is 4 columns apart; doormat = (doorCol, doorRow+1) =
// (col+1, row+4). Compliance House: slot 0 → doormat (3, 7). Product
// House: slot 1 → (7, 7).

// Spawn → Compliance doormat: up the entrance stem to the street,
// then west along the street.
await press('ArrowUp', 10) // (entranceCol, 7)
await press('ArrowLeft', 9) // (3, 7) — facing Compliance's door
await press('ArrowUp', 1) // step into the doorway
await waitForScene('Interior')
await page.waitForTimeout(300)
const titleA = await interiorTitle()
await page.screenshot({ path: `${OUT}/exit-02-inside-A.png` })

// Exit by stepping south onto the doormat — Phaser InteriorScene
// spawns the player at (5, 6); one ArrowDown lands on (5, 7) and
// fires exitCommunity.
await press('ArrowDown', 1)
await waitForScene('Town')
await page.waitForTimeout(450)
const afterA = await playerTile()
await page.screenshot({ path: `${OUT}/exit-03-after-A.png` })

// Now walk east to Product House and enter.
await press('ArrowRight', 4) // (7, 7)
await press('ArrowUp', 1) // step into Product's door
await waitForScene('Interior')
await page.waitForTimeout(300)
const titleB = await interiorTitle()
await page.screenshot({ path: `${OUT}/exit-04-inside-B.png` })

// Exit Product the same way and verify the player landed on PRODUCT's
// doormat, not the previously-visited Compliance doormat.
await press('ArrowDown', 1)
await waitForScene('Town')
await page.waitForTimeout(450)
const afterB = await playerTile()
await page.screenshot({ path: `${OUT}/exit-05-after-B.png` })

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
