// Drives a real browser onto an authored map (/maps/:slug) and walks the
// character around it — the end-to-end proof that a map saved from the editor
// is playable (issue #91's first slice: load, render, move).
//
// Auth: DEV keeps the bearer in sessionStorage (authToken.ts), so we mint a
// seeded-user token via the Keycloak password grant and seed storage before
// the app boots — same credentials the dev user-switcher uses.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const SLUG = process.argv[3] || 'test01'
const APP = 'http://localhost:5460'

// alice / dev — seeded realm user (keycloak/realm-export.json, issue #93).
const tokenRes = await fetch(
  'http://localhost:8080/realms/odtville/protocol/openid-connect/token',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'odt-ville-web',
      username: 'alice',
      password: 'dev',
    }),
  },
)
if (!tokenRes.ok) {
  console.error(`Keycloak password grant failed: ${tokenRes.status}`)
  process.exit(1)
}
const { access_token } = await tokenRes.json()

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await page.addInitScript(
  (t) => sessionStorage.setItem('odtville.devToken', t),
  access_token,
)

await page.goto(`${APP}/maps/${SLUG}`, { waitUntil: 'networkidle' })
await page.waitForFunction(
  () => typeof window.__game?.playerTile === 'function',
  null,
  { timeout: 15000 },
)
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/01-map-spawn.png` })

const playerTile = () => page.evaluate(() => window.__game.playerTile())
const mapSize = await page.evaluate(() => window.__game.mapSize())

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key)
    await page.waitForTimeout(190)
    await page.keyboard.up(key)
    await page.waitForTimeout(40)
  }
}

const spawn = await playerTile()

// Walk one step each way and back — proves all four directions move.
await press('ArrowLeft')
const afterLeft = await playerTile()
await press('ArrowUp')
const afterUp = await playerTile()
await press('ArrowRight')
await press('ArrowDown')
const backHome = await playerTile()

// March into the west edge — proves out-of-bounds steps are blocked.
await press('ArrowLeft', mapSize.cols + 2)
const atEdge = await playerTile()
await page.screenshot({ path: `${OUT}/02-map-edge.png` })

const ok =
  spawn.x === Math.floor(mapSize.cols / 2) &&
  spawn.y === Math.floor(mapSize.rows / 2) &&
  afterLeft.x === spawn.x - 1 &&
  afterUp.y === spawn.y - 1 &&
  backHome.x === spawn.x &&
  backHome.y === spawn.y &&
  atEdge.x === 0 &&
  errors.length === 0

console.log(
  JSON.stringify(
    { slug: SLUG, mapSize, spawn, afterLeft, afterUp, backHome, atEdge, ok, errors },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
