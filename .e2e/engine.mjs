// Engine-swap e2e (issue #16, PR-A → PR-E).
//
// Two ways to render the village game co-exist while the Phaser rebuild
// lands. After the PR-E default flip:
//   - default            → Phaser, a real <canvas>
//   - ?engine=phaser     → Phaser (explicit, same result as default)
//   - ?engine=dom        → legacy DOM engine, .player + .building divs
//
// This test loads the dom + phaser URLs side by side and asserts each
// engine boots into its expected shape. It does NOT walk or test
// gameplay — the other e2e files cover that.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function bootEngine(url, expectedMarker) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  // Both engines render inside the village view; the test API marker is set
  // by whichever engine actually mounted.
  await page.waitForFunction(
    () => typeof window !== 'undefined' && window.__game?.engine,
    null,
    { timeout: 10000 },
  )
  const marker = await page.evaluate(() => window.__game?.engine)
  const hasCanvas = (await page.$('canvas')) !== null
  const hasDomPlayer = (await page.$('.player')) !== null

  await page.waitForTimeout(400)
  await page.screenshot({
    path: `${OUT}/engine-${expectedMarker}.png`,
  })

  await page.close()
  return { marker, hasCanvas, hasDomPlayer, errors }
}

const dom = await bootEngine('http://localhost:5390/?engine=dom', 'dom')
const phaser = await bootEngine('http://localhost:5390/?engine=phaser', 'phaser')

const ok =
  dom.marker === 'dom' &&
  dom.hasDomPlayer === true &&
  dom.hasCanvas === false &&
  dom.errors.length === 0 &&
  phaser.marker === 'phaser' &&
  phaser.hasCanvas === true &&
  phaser.hasDomPlayer === false &&
  phaser.errors.length === 0

console.log(JSON.stringify({ dom, phaser, ok }, null, 2))

await browser.close()
process.exit(ok ? 0 : 1)
