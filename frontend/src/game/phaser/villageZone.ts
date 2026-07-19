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
}

export function villageZone({ exitToTown, travel, openLink }: VillageZoneDeps) {
  return (_trigger: Zone['trigger'], zone: Zone) => {
    const p = zone.payload
    switch (p.kind) {
      case 'portal':
        if (p.targetNode === 'town') exitToTown()
        else travel(p)
        return
      case 'link':
        openLink(p.url)
    }
  }
}
