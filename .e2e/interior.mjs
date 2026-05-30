// Spatial community interior — issue #15.
// Walk into Compliance House, verify the room renders three boards, walk up
// to each and press A, assert each opens the demo external URL in a new tab.
// Then walk back south through the door and confirm we land in the village.
import { chromium } from 'playwright-core'
import { clearGateTrainer } from './_helpers.mjs'

const OUT = process.argv[2] || '.'
const DEMO_URL = 'https://odt-sit.dev.krungthai.com/'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Reset the game session so the village player spawns at the Town Entrance —
// otherwise a previously-saved `last_community_id` would put the player on a
// doormat, and the entry walk would step into the wrong house.
await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

// Stub window.open before the page boots — actual popups would steal keyboard
// focus between presses and ruin the movement sequence. We just want to know
// what URL each board *would* have opened with.
await page.addInitScript(() => {
  window.__openCalls = []
  window.open = (url, target, features) => {
    window.__openCalls.push({ url, target, features })
    return null
  }
})

const openCalls = () => page.evaluate(() => window.__openCalls || [])

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

const playerTile = () =>
  page.$eval('.player', (el) => {
    const m = el.style.transform.match(/translate\(([\-0-9.]+)px,\s*([\-0-9.]+)px\)/)
    if (!m) return null
    return {
      x: Math.round(parseFloat(m[1]) / 48),
      y: Math.round(parseFloat(m[2]) / 48),
    }
  })

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForTimeout(700)

// First step up triggers the gate trainer — dismiss the duel so the rest
// of the walk is deterministic, then continue with 9 more ups to reach the
// street row.
await clearGateTrainer(page)

// Spawn at the entrance → Compliance House doormat → step into door.
await press('ArrowUp', 9) // up the entrance stem to the street
await press('ArrowLeft', 9) // west to Compliance's doormat
await press('ArrowUp', 1) // into the doorway

await page.waitForSelector('.community-interior', { timeout: 5000 })
await page.waitForSelector('.interior-board', { timeout: 5000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/interior-01-entered.png` })

const title = (await page.textContent('.interior-title'))?.trim()
const boardCount = await page.$$eval('.interior-board', (e) => e.length)
const spawnTile = await playerTile()

// Player spawns at the door's interior tile, facing up. From buildInterior:
//   ROOM_COLS=11, ROOM_ROWS=8, DOOR_COL=5, DOOR_ROW=7 -> spawn (5, 6).
const expectedSpawn = { x: 5, y: 6 }

// Walk to the Should Know board (centre, col 5, row 1). Spawn (5,6) -> go up 4
// times to land on (5,2) directly below the board at (5,1), then press A.
await press('ArrowUp', 4)
await page.waitForTimeout(150)
await page.screenshot({ path: `${OUT}/interior-02-at-should-know.png` })
await press('Enter', 1) // A button
await page.waitForTimeout(200)
const callsAfterShould = await openCalls()

// Now walk left two tiles to (3,2), facing the Must Know board at (3,1).
await press('ArrowLeft', 2)
await press('ArrowUp', 1) // bump the board to face up (board is blocked, so this just turns the player)
await press('Enter', 1)
await page.waitForTimeout(200)
const callsAfterMust = await openCalls()

// Walk right four tiles to (7,2), facing Nice to Know at (7,1).
await press('ArrowRight', 4)
await press('ArrowUp', 1) // turn to face up (board is blocked)
await press('Enter', 1)
await page.waitForTimeout(200)
const callsAfterNice = await openCalls()

const shouldFired = callsAfterShould.length === 1
const mustFired = callsAfterMust.length === 2
const niceFired = callsAfterNice.length === 3
const shouldUrl = callsAfterShould[0]?.url || null
const mustUrl = callsAfterMust[1]?.url || null
const niceUrl = callsAfterNice[2]?.url || null

await page.screenshot({ path: `${OUT}/interior-03-after-presses.png` })

// Walk back to the door — (7,2) -> (5,7). Go down to (7,6), left to (5,6),
// then down once more onto the door tile (5,7) — that fires onExit.
await press('ArrowDown', 4) // (7, 6)
await press('ArrowLeft', 2) // (5, 6)
await press('ArrowDown', 1) // step south onto door -> exit
await page.waitForSelector('.building', { timeout: 5000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/interior-04-back-in-village.png` })

const allUrlsMatch = [shouldUrl, mustUrl, niceUrl].every((u) => u === DEMO_URL)
const ok =
  title === 'Compliance House' &&
  boardCount === 3 &&
  spawnTile?.x === expectedSpawn.x &&
  spawnTile?.y === expectedSpawn.y &&
  shouldFired &&
  mustFired &&
  niceFired &&
  allUrlsMatch &&
  errors.length === 0

console.log(
  JSON.stringify(
    {
      title,
      boardCount,
      spawnTile,
      expectedSpawn,
      shouldFired,
      mustFired,
      niceFired,
      shouldUrl,
      mustUrl,
      niceUrl,
      ok,
      errors,
    },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
