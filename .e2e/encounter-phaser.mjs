// Phaser wild-encounter e2e (issue #16, PR-D).
//
// Opens the village under ?engine=phaser, clears the gate trainer
// (one-step duel + RUN), then walks into the tall-grass field and
// wanders until a wild Pokémon encounter fires. Asserts the encounter
// is `kind: 'wild'`, named VAYU PHOENIX or MR.P, then RUNs and
// confirms TownScene takes back over.
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

await page.goto('http://localhost:5390/?engine=phaser', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__game?.engine === 'phaser', null, { timeout: 10000 })
await page.waitForFunction(() => typeof window.__game?.trainer === 'function', null, { timeout: 5000 })
await page.waitForTimeout(700)

// Clear the gate trainer first — one step up triggers his duel.
await press('ArrowUp', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Encounter',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(450)
await press('Enter', 1)
await page.waitForFunction(
  () => window.__game?.activeSceneKey?.() === 'Town',
  null,
  { timeout: 5000 },
)
await page.waitForTimeout(300)

// Walk up the entrance stem into the tall-grass field; (12, 11..15)
// are tall-grass tiles. The player is currently at (12, 16) after
// running from the trainer.
await press('ArrowUp', 5)
await page.screenshot({ path: `${OUT}/encounter-phaser-01-in-grass.png` })

// Wander up to 80 steps in the grass; the wild rate is 10%/step so
// an encounter is virtually guaranteed within 30. Bail if it never
// fires.
const moves = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
let encountered = (await sceneKey()) === 'Encounter'
let steps = 0
while (!encountered && steps < 80) {
  await press(moves[steps % 4], 1)
  steps++
  encountered = (await sceneKey()) === 'Encounter'
}

let wildOpponent = null
let ranAway = false
if (encountered) {
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}/encounter-phaser-02-encounter.png` })
  wildOpponent = await opponent()
  await press('Enter', 1)
  await page.waitForFunction(
    () => window.__game?.activeSceneKey?.() === 'Town',
    null,
    { timeout: 5000 },
  )
  await page.waitForTimeout(300)
  ranAway = (await sceneKey()) === 'Town'
  await page.screenshot({ path: `${OUT}/encounter-phaser-03-after-run.png` })
}

const validName =
  wildOpponent?.name === 'VAYU PHOENIX' || wildOpponent?.name === 'MR.P'

const ok =
  encountered &&
  wildOpponent?.kind === 'wild' &&
  validName &&
  wildOpponent?.level === 99 &&
  ranAway &&
  errors.length === 0

console.log(
  JSON.stringify(
    { encountered, steps, wildOpponent, ranAway, ok, errors },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
