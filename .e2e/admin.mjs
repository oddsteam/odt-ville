// Verifies the admin UI: count buildings, add a community, confirm a new
// building appears, then delete it and confirm it is gone.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

const buildings = () => page.$$eval('.building', (els) => els.length)
const rows = () => page.$$eval('.admin-row', (els) => els.length)

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.building', { timeout: 15000 })
await page.waitForTimeout(600)
const before = await buildings()

// Open the admin panel and add a community.
await page.click('.admin-btn')
await page.waitForSelector('.admin-modal', { timeout: 5000 })
await page.screenshot({ path: `${OUT}/admin-1-panel.png` })
await page.fill('.admin-form input >> nth=0', 'Finance House')
await page.click('.admin-colour >> nth=5')
await page.click('.admin-add')
await page.waitForFunction(() => document.querySelectorAll('.admin-row').length >= 6, {
  timeout: 8000,
})
const rowsAfterAdd = await rows()
await page.click('.modal-close')

// Walk up so the building street is in view, then screenshot.
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(230)
}
await page.waitForTimeout(300)
const afterAdd = await buildings()
await page.screenshot({ path: `${OUT}/admin-2-added.png` })

// Re-open admin and delete the community we just added.
await page.click('.admin-btn')
await page.waitForSelector('.admin-modal', { timeout: 5000 })
await page.click('.admin-row:last-child .admin-del')
await page.waitForFunction(() => document.querySelectorAll('.admin-row').length <= 5, {
  timeout: 8000,
})
await page.click('.modal-close')
await page.waitForTimeout(400)
const afterDelete = await buildings()
await page.screenshot({ path: `${OUT}/admin-3-deleted.png` })

console.log(
  JSON.stringify(
    { before, rowsAfterAdd, afterAdd, afterDelete, errors },
    null,
    2,
  ),
)
await browser.close()
process.exit(errors.length ? 1 : 0)
