// Verifies the admin UI with no house cap: add three communities (forcing the
// town to wrap onto a second street row), confirm the buildings appear, then
// delete them and confirm the town shrinks back.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } })

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

// Add three communities — seed has 5, PER_ROW is 5, so these wrap to row 2.
const NEW = ['Finance House', 'Legal House', 'Travel House']
await page.click('.admin-btn')
await page.waitForSelector('.admin-modal', { timeout: 5000 })
await page.screenshot({ path: `${OUT}/admin-1-panel.png` })

let expected = before
for (const name of NEW) {
  await page.fill('.admin-form input >> nth=0', name)
  await page.click('.admin-colour >> nth=5')
  await page.click('.admin-add')
  expected += 1
  await page.waitForFunction(
    (n) => document.querySelectorAll('.admin-row').length === n,
    expected,
    { timeout: 8000 },
  )
}
const rowsAfterAdd = await rows()
await page.click('.modal-close')

// Walk up so the wrapped second row of buildings comes into view.
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(170)
}
await page.waitForTimeout(400)
const afterAdd = await buildings()
await page.screenshot({ path: `${OUT}/admin-2-added.png`, fullPage: true })

// Delete the three we added.
await page.click('.admin-btn')
await page.waitForSelector('.admin-modal', { timeout: 5000 })
for (let i = 0; i < NEW.length; i++) {
  const n = await rows()
  await page.click('.admin-row:last-child .admin-del')
  await page.waitForFunction(
    (target) => document.querySelectorAll('.admin-row').length === target,
    n - 1,
    { timeout: 8000 },
  )
}
await page.click('.modal-close')
await page.waitForTimeout(400)
const afterDelete = await buildings()
await page.screenshot({ path: `${OUT}/admin-3-deleted.png` })

console.log(
  JSON.stringify({ before, rowsAfterAdd, afterAdd, afterDelete, errors }, null, 2),
)
await browser.close()
process.exit(errors.length ? 1 : 0)
