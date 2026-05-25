// Gate trainer e2e. Spawn at the village entrance, take a single step up the
// entrance stem, and confirm the trainer encounter fires with "THE BOSS wants
// to duel!". RUN AWAY, then verify the trainer doesn't re-trigger when the
// player walks back across the same sight line.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Reset session so the village player spawns at the Town Entrance.
await fetch('http://localhost:3130/api/v1/game/session', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
})

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForSelector('.trainer', { timeout: 5000 })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/trainer-01-entrance.png` })

const sightCells = await page.$$eval('.trainer-sight', (e) => e.length)

// One step up the entrance stem should land the player in the trainer's
// sight (his sight reaches west across the bottom margin row).
await press('ArrowUp', 1)
await page.waitForSelector('.encounter', { timeout: 5000 })
await page.waitForTimeout(600) // wait past the flash → show transition
await page.screenshot({ path: `${OUT}/trainer-02-duel.png` })

const duelText = (await page.textContent('.encounter-text'))?.trim()
const runLabel = (await page.textContent('.encounter-run'))?.trim()
const isTrainerStage = await page.$('.encounter-trainer').then((e) => !!e)

// RUN AWAY → back to the village.
await page.click('.encounter-run')
await page.waitForSelector('.gb-screen', { timeout: 5000 })
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/trainer-03-after-run.png` })

const sightCellsAfter = await page.$$eval('.trainer-sight', (e) => e.length)
const isDefeated = await page.$('.trainer-defeated').then((e) => !!e)

// Walking back into the same sight line must not trigger again.
await press('ArrowUp', 1) // back into the same sight tile
await page.waitForTimeout(500)
const reTriggered = await page.$('.encounter').then((e) => !!e)
await page.screenshot({ path: `${OUT}/trainer-04-walk-past.png` })

const ok =
  sightCells > 0 &&
  duelText?.includes('THE BOSS') &&
  duelText?.includes('wants to duel') &&
  runLabel === 'RUN AWAY' &&
  isTrainerStage &&
  sightCellsAfter === 0 &&
  isDefeated &&
  !reTriggered &&
  errors.length === 0

console.log(
  JSON.stringify(
    {
      sightCells,
      duelText,
      runLabel,
      isTrainerStage,
      sightCellsAfter,
      isDefeated,
      reTriggered,
      ok,
      errors,
    },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
