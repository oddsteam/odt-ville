// Trainer sight-cone e2e (issue #86).
//
// The unit tests (kernel/zones.test.ts) prove the cone geometry. This proves
// the two halves a pure function can't: that walking into a real trainer's
// sight line fires the challenge through the onZone channel, and that the
// avatar actually stops there — held key and all — instead of walking on.
//
// The seeded atrium trainer (db/seeds.rb) stands at (5,5) looking up with
// range 3, so it sees (5,4) (5,3) (5,2). MapPage spawns at the map centre,
// (4,3): one step east crosses the sight line, one step south does not.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] || '.'
const APP = 'http://localhost:5460'

// alice / dev — seeded realm user, same grant map-walk.mjs uses.
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

// The `link` payload fires as window.open — a popup is the challenge firing.
const challenges = []
page.on('popup', async (p) => {
  challenges.push(p.url())
  await p.close()
})

await page.addInitScript(
  (t) => sessionStorage.setItem('odtville.devToken', t),
  access_token,
)

await page.goto(`${APP}/maps/atrium`, { waitUntil: 'networkidle' })
await page.waitForFunction(
  () => typeof window.__game?.playerTile === 'function',
  null,
  { timeout: 15000 },
)
await page.waitForTimeout(700)

const playerTile = () => page.evaluate(() => window.__game.playerTile())
const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key)
    await page.waitForTimeout(190)
    await page.keyboard.up(key)
    await page.waitForTimeout(60)
  }
}

const spawn = await playerTile()
await page.screenshot({ path: `${OUT}/01-cone-spawn.png` })

// Step south to (4,4) — level with the cone cell (5,4) but one column west of
// it. Adjacent, outside: nothing should fire.
await press('ArrowDown')
const beside = await playerTile()
const firedBeside = challenges.length

// Back to (4,3), then hold east long enough for three steps. The first lands
// on (5,3), inside the cone — the halt must eat the rest of the hold, so the
// avatar ends on (5,3) and not (6,3) or (7,3).
await press('ArrowUp')
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(900)
await page.keyboard.up('ArrowRight')
await page.waitForTimeout(300)
const sighted = await playerTile()
await page.screenshot({ path: `${OUT}/02-cone-sighted.png` })

const ok =
  spawn.x === 4 &&
  spawn.y === 3 &&
  beside.x === 4 &&
  beside.y === 4 &&
  firedBeside === 0 &&
  sighted.x === 5 &&
  sighted.y === 3 &&
  challenges.length === 1 &&
  challenges[0].includes('/issues/86') &&
  errors.length === 0

console.log(
  JSON.stringify(
    { spawn, beside, firedBeside, sighted, challenges, ok, errors },
    null,
    2,
  ),
)

await browser.close()
process.exit(ok ? 0 : 1)
