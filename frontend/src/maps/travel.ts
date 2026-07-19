// Portal travel (#84, ADR-0005): the shell-side behaviour behind a fired
// `portal` zone. The target map is loaded *before* leaving the current one, so
// a denied or broken target refuses with a reason and the avatar stays put —
// the portal stays visible, entry is what's refused (gated refusal, not
// hiding). Deps are injected so the decision is testable apart from React.

export interface PortalPayload {
  kind: 'portal'
  targetNode: string
  entrySpawnId?: string
}

export interface TravelDeps {
  load: (slug: string) => Promise<unknown>
  go: (slug: string, entrySpawnId?: string) => void
  refuse: (notice: string) => void
}

export async function travel(payload: PortalPayload, { load, go, refuse }: TravelDeps) {
  try {
    await load(payload.targetNode)
    go(payload.targetNode, payload.entrySpawnId)
  } catch (e) {
    const denied = (e as { status?: number }).status === 403
    refuse(
      denied
        ? `ENTRY REFUSED — you don’t have access to "${payload.targetNode}"`
        : `ENTRY REFUSED — ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}
