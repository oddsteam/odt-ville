// Drives a real browser through the top-down town: spawn at the Town Entrance,
// walk up the path, over to Compliance House, and into its doorway.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

const press = async (key, times) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(230)
  }
}

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/01-town.png` })

// Town Entrance (17,18) -> up the path to the main path row, then west.
await press('ArrowUp', 8) // -> (17, 10)
await press('ArrowLeft', 14) // -> (3, 10)  in front of Compliance House
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/02-at-door.png` })

// Up the door stub and into the doorway -> enters the house.
await press('ArrowUp', 3)
await page.waitForSelector('.house-interior', { timeout: 15000 })
await page.waitForSelector('.interior-title', { timeout: 5000 })
await page.waitForTimeout(400)

const title = (await page.textContent('.interior-title'))?.trim()
const boards = await page.$$eval('.board-panel', (els) =>
  els.map((el) => ({
    label: el.querySelector('.board-title')?.textContent?.trim(),
    count: el.querySelector('.board-count')?.textContent?.trim(),
  })),
)
await page.screenshot({ path: `${OUT}/03-compliance-interior.png`, fullPage: true })

console.log(JSON.stringify({ title, boards, errors }, null, 2))
await browser.close()
process.exit(errors.length ? 1 : 0)
