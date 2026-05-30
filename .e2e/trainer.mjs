// Gate trainer e2e (issue #16, PR-D → PR-E port).
//
// Spawn at the village entrance, take a single step up the entrance
// stem, and confirm the trainer encounter fires with "THE BOSS wants
// to duel!". RUN AWAY, then verify the trainer doesn't re-trigger when
// the player walks back across the same sight line.
//
// PR-E port: canonical trainer e2e now runs against the Phaser
// TownScene + EncounterScene via the __game test API; the
// trainer-phaser.mjs duplicate was dropped in the same commit.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Reset session so the player spawns at the Town Entrance.
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

const sceneKey = () =>
  page.evaluate(() => window.__game?.activeSceneKey?.() || null)
const opponent = () => page.evaluate(() => window.__game?.opponent?.() || null)
const trainerInfo = () => page.evaluate(() => window.__game?.trainer?.() || null)

await page.goto('http://localhost:5390/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, {
  timeout: 10000,
})
await page.waitForFunction(
  () => typeof window.__game?.trainer === 'function',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/trainer-01-entrance.png` })

const initialTrainer = await trainerInfo()

// One step up onto the bottom-margin row lands the player in the gate
// trainer's sight (he sees west across row 16; player goes 17 → 16 at
// col 12).
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Encounter',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(450) // past the flash → show
await page.screenshot({ path: `${OUT}/trainer-02-duel.png` })

const inDuel = await sceneKey()
const duelOpponent = await opponent()

// RUN AWAY via the keyboard (Enter). EncounterScene also exposes a
// click target but the keyboard path is the cleaner test.
await press('Enter', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Town',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/trainer-03-after-run.png` })

const afterRunTrainer = await trainerInfo()

// Walking back through the same sight tile must NOT re-trigger. Player
// is at (12, 16) — same sight column. Step up to (12, 15) (still in
// sight per the sightCells layout), then back down. No encounter.
await press('ArrowUp', 1)
await page.waitForTimeout(400)
await press('ArrowDown', 1)
await page.waitForTimeout(400)
const stillInTown = await sceneKey()
await page.screenshot({ path: `${OUT}/trainer-04-walk-past.png` })

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
