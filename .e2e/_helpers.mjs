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

// Walk one step up the entrance stem; if the gate trainer's
// EncounterScene launches, press Enter (RUN AWAY) and wait for the
// Town scene to resume. Use this at the start of any test that needs
// to traverse the entrance area without the duel screen contaminating
// the planned walk. After this returns the trainer is defeated for
// the rest of this page session.
export async function clearGateTrainer(page) {
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(190)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(120)
  const inEncounter = await page.evaluate(
    () => window.__game?.activeSceneKey?.() === 'Encounter',
  )
  if (inEncounter) {
    await page.waitForTimeout(500) // past the white flash
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () => window.__game?.activeSceneKey?.() === 'Town',
      null,
      { timeout: 5000 },
    )
    await page.waitForTimeout(300)
  }
}
