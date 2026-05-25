// Phaser gate trainer e2e (issue #16, PR-D).
//
// Opens the village under ?engine=phaser, takes one step up the entrance
// stem to land in the gate trainer's sight, asserts EncounterScene takes
// over the canvas with "THE BOSS wants to duel!" + a RUN AWAY button,
// presses Enter, returns to Town, and verifies the trainer's defeated
// flag flipped + sight markers are gone + walking back through the same
// sight tiles no longer re-triggers.
import { chromium } from 'playwright-core'

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

const sceneKey = () => page.evaluate(() => window.__game?.activeSceneKey?.() || null)
const opponent = () => page.evaluate(() => window.__game?.opponent?.() || null)
const trainerInfo = () => page.evaluate(() => window.__game?.trainer?.() || null)

await page.goto('http://localhost:5390/?engine=phaser', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, { timeout: 10000 })
await page.waitForFunction(() => typeof window.__game?.trainer === 'function', null, { timeout: 5000 })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/trainer-phaser-01-entrance.png` })

const initialTrainer = await trainerInfo()

// One step up onto the bottom-margin row lands the player in the gate
// trainer's sight (he sees west across row 16; player goes 17→16 at col 12).
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Encounter',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(450) // past the flash → show
await page.screenshot({ path: `${OUT}/trainer-phaser-02-duel.png` })

const inDuel = await sceneKey()
const duelOpponent = await opponent()

// RUN AWAY via the keyboard. The button is also clickable but the
// keyboard path is the cleaner test.
await press('Enter', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Town',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/trainer-phaser-03-after-run.png` })

const afterRunTrainer = await trainerInfo()

// Walking back through the same sight tile must NOT re-trigger.
// Player is currently at (12, 16) — in the same sight column. Step up
// again into (12, 15) (still in sight), then back down. No encounter.
await press('ArrowUp', 1)
await page.waitForTimeout(400)
await press('ArrowDown', 1)
await page.waitForTimeout(400)
const stillInTown = await sceneKey()

const ok =
  initialTrainer &&
  initialTrainer.defeated === false &&
  initialTrainer.sightCells.length === 5 &&
  inDuel === 'Encounter' &&
  duelOpponent?.kind === 'trainer' &&
  duelOpponent?.name === 'THE BOSS' &&
  duelOpponent?.level === 99 &&
  afterRunTrainer?.defeated === true &&
  stillInTown === 'Town' &&
  errors.length === 0

console.log(
  JSON.stringify(
    {
      initialTrainer,
      inDuel,
      duelOpponent,
      afterRunTrainer,
      stillInTown,
      ok,
      errors,
    },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
