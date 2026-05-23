// Regression for issue #9: exiting a community must land the player on the
// doormat of the community they just exited — not the previously-visited one.
// Walks A → exit, then B → exit, and asserts each post-exit tile is the
// expected community's `(doorCol, doorRow + 1)`.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const TILE = 48

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

// Read the player's tile from the inline `translate(Xpx, Ypx)` transform.
const playerTile = () =>
  page.$eval('.player', (el) => {
    const m = el.style.transform.match(/translate\(([\-0-9.]+)px,\s*([\-0-9.]+)px\)/)
    if (!m) return null
    return {
      x: Math.round(parseFloat(m[1]) / 48),
      y: Math.round(parseFloat(m[2]) / 48),
    }
  })

const interiorTitle = () =>
  page.textContent('.interior-title').then((t) => (t || '').trim())

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/exit-01-entrance.png` })

// With the default seed (5 communities) the town has one building row. Each
// plot is 4 columns apart; doormat = (doorCol, doorRow + 1) = (col+1, row+4).
// Compliance House: slot 0 → doormat (3, 7). Product House: slot 1 → (7, 7).

// Spawn → Compliance doormat: up the entrance stem to the street, then west.
await press('ArrowUp', 10) // (entranceCol, 7)
await press('ArrowLeft', 9) // (3, 7) — facing Compliance's door
await press('ArrowUp', 1) // step into the doorway
await page.waitForSelector('.house-interior', { timeout: 5000 })
const titleA = await interiorTitle()
await page.screenshot({ path: `${OUT}/exit-02-inside-A.png` })

// Exit and check the player landed on Compliance's doormat.
await page.click('.exit-door-btn')
await page.waitForSelector('.gb-screen', { timeout: 5000 })
await page.waitForTimeout(450)
const afterA = await playerTile()
await page.screenshot({ path: `${OUT}/exit-03-after-A.png` })

// Now walk to Product House and enter.
await press('ArrowRight', 4) // (7, 7)
await press('ArrowUp', 1) // step into Product's door
await page.waitForSelector('.house-interior', { timeout: 5000 })
const titleB = await interiorTitle()
await page.screenshot({ path: `${OUT}/exit-04-inside-B.png` })

// Exit Product and verify the player landed on PRODUCT's doormat (not A).
await page.click('.exit-door-btn')
await page.waitForSelector('.gb-screen', { timeout: 5000 })
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
