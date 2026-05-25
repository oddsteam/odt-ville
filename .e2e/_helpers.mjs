// Shared helpers used by the walking e2e scripts.

// Reset the player's saved game session so they spawn at the Town Entrance.
// Without this, a previously-stored `last_community_id` would put the player
// on a doormat and break tests that assume entrance-relative coordinates.
export async function resetSession() {
  await fetch('http://localhost:3130/api/v1/game/session', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ last_area: 'town', last_community_id: '' }),
  })
}

// Walk one step up the entrance stem and clear the gate trainer if he
// challenges. After this returns the trainer is in his "defeated" state for
// the rest of the page session — he never re-triggers — and the player is
// standing one tile above the entrance, free to walk anywhere.
//
// Use this at the start of any test that needs to traverse the entrance area
// without the duel screen contaminating the planned walk.
export async function clearGateTrainer(page, { stepDelay = 220 } = {}) {
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(stepDelay)
  if (await page.$('.encounter')) {
    await page.waitForTimeout(500) // past the flash → show
    await page.click('.encounter-run')
    await page.waitForTimeout(400)
  }
}
