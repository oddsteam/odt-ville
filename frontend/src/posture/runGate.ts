// The frontend half of the posture-login entry gate (issue #24): the pure
// orchestration of one entry attempt. Mirrors the posture-login demo gate.ts,
// but the trust decision stays server-side — we open the gate only on the
// backend's server-to-server confirm, never on the popup's redirect hint.
//
// All IO is injected so this is unit-testable without a browser or a live
// service. The once-per-session memory lives in the shell, not here; this runs
// a single attempt.

export type GateOutcome = { granted: boolean; reason?: string }

export interface GateDeps {
  // Ask the Rails backend to start a Verification for this house. Returns the
  // hosted page URL to open and the one-time session we'll confirm against.
  start: (communityId: number) => Promise<{ session_id: string; hosted_url: string }>
  // Open the hosted page (a popup). Returns a handle, or null if blocked.
  openPopup: (url: string) => unknown | null
  // Resolve when the popup reports back (origin-checked) with its status hint,
  // or when it closes/cancels.
  awaitResult: (popup: unknown) => Promise<{ status: string | null }>
  // Server-to-server confirm — the only thing that opens the gate.
  confirm: (sessionId: string) => Promise<{ granted: boolean; status: string | null }>
}

export async function runPostureGate(communityId: number, deps: GateDeps): Promise<GateOutcome> {
  const { session_id, hosted_url } = await deps.start(communityId)

  const popup = deps.openPopup(hosted_url)
  if (!popup) return { granted: false, reason: 'popup-blocked' }

  const { status } = await deps.awaitResult(popup)
  // A non-pass hint (cancelled/expired/closed) means the user didn't make it —
  // skip the confirm round-trip. A "passed" hint is never trusted on its own.
  if (status && status !== 'passed') return { granted: false, reason: status }

  const { granted } = await deps.confirm(session_id)
  return { granted }
}
