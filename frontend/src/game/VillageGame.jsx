import PhaserGame from './phaser/PhaserGame.jsx'

// The Village Game black box. Receives community list + game session as
// props; emits door-entry and admin events. Has no API knowledge, no
// routing, and no imports outside this directory. Drop-in usable from
// any shell.
//
// Inputs:
//   communities       — array of community objects (id, title, color,
//                       logo_url, category_key, position_order, badges)
//   session           — { spawn: { area, last_community_id } } from
//                       /game/session
//   dailyBrief        — a React node rendered into the game's top-right
//                       overlay slot. The shell decides what to render
//                       here (e.g. a daily-brief modal trigger).
//
// Outputs:
//   onEnterCommunity(id) — player walked onto a community doorway
//   onExitCommunity(id)  — player stepped south off the interior doormat
//   onOpenBoard(boardType) — player pressed A on an interior board
//   onTrainerDefeated()  — player ran from the gate trainer's duel
//
// PR-E retired the DOM engine; this component is now a thin wrapper
// around the Phaser game (TownScene + InteriorScene + EncounterScene).
// The town layout, building placement, and player spawn are derived
// inside the Phaser scenes from the communities + session props that
// PhaserGame pushes into its registry.
export default function VillageGame({
  communities,
  session,
  dailyBrief,
  activeCommunityId,
  onEnterCommunity,
  onExitCommunity,
  onOpenBoard,
  trainerDefeated,
  onTrainerDefeated,
}) {
  return (
    <PhaserGame
      communities={communities}
      session={session}
      dailyBrief={dailyBrief}
      activeCommunityId={activeCommunityId}
      onEnterCommunity={onEnterCommunity}
      onExitCommunity={onExitCommunity}
      onOpenBoard={onOpenBoard}
      trainerDefeated={trainerDefeated}
      onTrainerDefeated={onTrainerDefeated}
    />
  )
}
