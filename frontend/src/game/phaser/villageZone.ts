// The one event channel out of an authored Node inside the village shell (#85,
// #111, #249). MapScene fires every zone event through here and the shell
// dispatches on payload kind, the same exhaustive switch MapPage runs — only
// the effects differ, because the village keeps one Phaser game alive and
// swaps scenes instead of changing route.
//
// `portal` to the reserved `town` slug is the interior's exit: the town hub is
// not an authored Node, so the shell swaps back to TownScene. Any other target
// is an onward hop to that Node (#249) — `travel` loads it before leaving and
// refuses in place if it can't (gated refusal, #84).

import type { Zone } from '../../kernel/schema.ts'

export interface VillageZoneDeps {
  exitToTown: () => void
  travel: (portal: { kind: 'portal'; targetNode: string; entrySpawnId?: string }) => void
  openLink: (url: string) => void
  // Start a duel with the NPC the trainer payload names (#259). The shell
  // resolves the id against the loaded catalog and launches EncounterScene over
  // the interior; a dangling/unset id starts nothing (trainerOpponent → null).
  startDuel: (npcId: number) => void
  // Roll a wild from the named pool (#87). The shell owns the fetch — the game
  // never imports a data service (ADR-0004) — so an empty slug means the whole
  // global pool, and a failed fetch rolls nothing.
  startEncounter: (pool: string) => void
}

export function villageZone({
  exitToTown,
  travel,
  openLink,
  startDuel,
  startEncounter,
}: VillageZoneDeps) {
  return (_trigger: Zone['trigger'], zone: Zone) => {
    const p = zone.payload
    switch (p.kind) {
      case 'portal':
        if (p.targetNode === 'town') exitToTown()
        else travel(p)
        return
      case 'link':
        openLink(p.url)
        return
      case 'trainer':
        startDuel(p.npcId)
        return
      case 'encounter':
        startEncounter(p.pool)
        return
      // The switch claims to be exhaustive over ZonePayload; this makes the
      // compiler hold it to that. Without it #87 added `encounter` to MapPage
      // alone and this dispatch went on silently ignoring it — the same map
      // rolled a wild by URL and did nothing behind a community door. A new
      // payload kind now fails the build here instead of failing in play.
      default: {
        const unhandled: never = p
        return unhandled
      }
    }
  }
}
