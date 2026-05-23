// Verifies the overlay controls are translucent (#11): idle opacity is less
// than 1 on the D-pad / A button / Admin slots, and hovering an overlay slot
// restores it to fully opaque.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.overlay-bl', { timeout: 5000 })
await page.waitForTimeout(500)

const opacityOf = (selector) =>
  page.$eval(selector, (el) => parseFloat(getComputedStyle(el).opacity))

const idle = {
  bl: await opacityOf('.overlay-bl'),
  br: await opacityOf('.overlay-br'),
  tr: await opacityOf('.overlay-tr'),
  hint: await opacityOf('.overlay-hint'),
}

// Hover the D-pad slot and confirm it goes opaque.
const bl = await page.$('.overlay-bl')
const box = await bl.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(250)
const hoveredBl = await opacityOf('.overlay-bl')

const allFaded =
  idle.bl < 1 && idle.br < 1 && idle.tr < 1 && idle.hint < 1
const hoverRestores = Math.abs(hoveredBl - 1) < 0.01

const result = { idle, hoveredBl, allFaded, hoverRestores, errors }
console.log(JSON.stringify(result, null, 2))

await browser.close()
process.exit(allFaded && hoverRestores && errors.length === 0 ? 0 : 1)
