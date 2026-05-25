import PhaserGame from './phaser/PhaserGame.jsx'

// The Village Game black box. Receives community list + game session as
// props; emits door-entry, exit, and board-press events. Has no API
// knowledge, no routing, and no imports outside this directory.
// Drop-in usable from any shell.
//
// Inputs:
//   communities          — array of community objects (id, title, color,
//                          logo_url, category_key, position_order, badges)
//   session              — { spawn: { area, last_community_id } }
//   dailyBrief           — a React node rendered in the top-right overlay
//   activeCommunityId    — currently-active community id (for topbar label)
//   trainerDefeated      — once the gate trainer has been escaped
//
// Outputs:
//   onEnterCommunity(id)  — player walked onto a community doorway
//   onExitCommunity(id)   — player walked out of an interior doormat
//   onOpenBoard(boardType) — player pressed A on a board ('must_know' |
//                            'should_know' | 'nice_to_know')
//   onTrainerDefeated()   — player RAN AWAY from the gate trainer
//
// Under the hood (since issue #16, PR-E) the game renders on a Phaser
// canvas; VillageGame stays as the documented module boundary so the
// shell never imports Phaser directly.
export default function VillageGame(props) {
  return <PhaserGame {...props} />
}
