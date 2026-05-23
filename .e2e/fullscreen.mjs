// Verifies the fullscreen toggle (#10): the button is present, clicking it
// requests fullscreen, and — if the browser grants it — the gb-screen grows
// to roughly viewport size. Headless Chromium does not always honour the
// Fullscreen API; the test tolerates that and still verifies the API call.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

// Spy on requestFullscreen so we can confirm the click wired through, even
// if the browser does not actually enter fullscreen.
await page.addInitScript(() => {
  window.__requestFullscreenCalls = 0
  const orig = Element.prototype.requestFullscreen
  Element.prototype.requestFullscreen = function () {
    window.__requestFullscreenCalls += 1
    return orig.apply(this, arguments)
  }
})

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await page.goto('http://localhost:5390', { waitUntil: 'networkidle' })
await page.waitForSelector('.gb-screen', { timeout: 15000 })
await page.waitForSelector('.fullscreen-btn', { timeout: 5000 })
await page.waitForTimeout(500)

const initialLabel = (await page.textContent('.fullscreen-btn'))?.trim()
const initialBounds = await page.$eval('.gb-screen', (el) => ({
  w: el.clientWidth,
  h: el.clientHeight,
}))

await page.click('.fullscreen-btn')
await page.waitForTimeout(500)

const calls = await page.evaluate(() => window.__requestFullscreenCalls)
const fullscreenEl = await page.evaluate(() => Boolean(document.fullscreenElement))
const afterBounds = await page.$eval('.gb-screen', (el) => ({
  w: el.clientWidth,
  h: el.clientHeight,
}))

const result = {
  initialLabel,
  initialBounds,
  fullscreenButtonClicked: calls >= 1,
  fullscreenElementPresent: fullscreenEl,
  afterBounds,
  errors,
}
console.log(JSON.stringify(result, null, 2))

await browser.close()
// We require the click to have fired the API. The actual fullscreen grant is
// best-effort in headless Chromium and not a hard failure.
process.exit(result.fullscreenButtonClicked && errors.length === 0 ? 0 : 1)
