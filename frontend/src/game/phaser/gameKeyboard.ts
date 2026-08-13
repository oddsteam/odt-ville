// Handing the keyboard between the game and a DOM panel (#380). Phaser's
// keyboard plugin listens on `window` and *captures* the keys a scene binds —
// W/A/S/D, SPACE, ENTER — so a text field over the game never sees them and the
// avatar walks instead. Silence the game while the panel is open and hand the
// keyboard back when it closes.
//
// The hand-back is tied to the panel being *open*, not to a field having
// *focus*: focus is inferred from the DOM and gets stuck (the deploy button
// suppresses its own mousedown so it can't steal focus mid-typing, so a blur
// never arrives), while open is a state the shell owns. Returning the restore
// makes it a React effect cleanup, which runs on every close path — deploy,
// cancel, dismiss, unmount.
export function silenceKeyboard(kb: { enabled: boolean } | null | undefined) {
  if (!kb) return () => {}
  kb.enabled = false
  return () => {
    kb.enabled = true
  }
}
