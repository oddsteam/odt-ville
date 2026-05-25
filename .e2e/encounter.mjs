// Drives the browser into the tall-grass field and wanders until a wild
// Pokémon encounter fires, then RUNs from it.
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

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/enc-01-town.png` })

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

// First step up triggers the gate trainer's duel — run away from him so the
// rest of the walk is unblocked. After this returns the player is one tile
// above the entrance.
await clearGateTrainer(page)

// Spawn at the Town Entrance — step up the stem into the field rows, then off
// the safe path into the tall grass.
await press('ArrowUp', 1)
await press('ArrowLeft', 1)
await page.screenshot({ path: `${OUT}/enc-02-in-grass.png` })

// Wander a 2x2 patch of tall grass until a wild Pokémon appears.
const moves = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
let encountered = (await page.$('.encounter')) !== null
let steps = 0
for (let i = 0; i < 80 && !encountered; i++) {
  await page.keyboard.press(moves[i % 4])
  await page.waitForTimeout(220)
  steps++
  encountered = (await page.$('.encounter')) !== null
}

let name = null
let ranAway = null
if (encountered) {
  await page.waitForSelector('.encounter-stage', { timeout: 3000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/enc-03-encounter.png` })
  name = (await page.textContent('.encounter-text'))?.replace(/\s+/g, ' ').trim()
  await page.keyboard.press('Escape') // RUN
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}/enc-04-after-run.png` })
  ranAway = (await page.$('.encounter')) === null
}

console.log(JSON.stringify({ encountered, steps, name, ranAway, errors }, null, 2))
await browser.close()
process.exit(errors.length || !encountered || !ranAway ? 1 : 0)
