import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TILE, MOVE_MS, isGroundWalkable, tileChar } from './constants.js'
import PlayerSprite from './PlayerSprite.jsx'
import Building from './Building.jsx'
import Trainer from './Trainer.jsx'
import DialogueBox from './DialogueBox.jsx'
import MobileDpad from './MobileDpad.jsx'
import EncounterScreen from './EncounterScreen.jsx'
import {
  rollEncounter,
  pickWildPokemon,
  GRACE_STEPS,
  GATE_TRAINER,
  resolveTrainerStart,
  trainerSightCells,
} from './encounters.js'

const DELTAS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

const KEY_DIR = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
}

const WELCOME = [
  'ONE REV VILLAGE — welcome aboard!',
  'Walk up to a community and step into its doorway to read the boards inside.',
  'A red "!" means urgent MUST-KNOW news. The DAILY BRIEF lists everything.',
  'Wild Pokémon hide in the dark TALL GRASS — wander in to find them!',
]

const TILE_CLASS = {
  '.': 'grass',
  ':': 'path',
  '*': 'flower',
  g: 'tallgrass',
  T: 'tree',
  s: 'sign',
}

// Clamp the camera to the town; centre the town if it is smaller than the view.
function clampCamera(value, town, view) {
  if (town <= view) return (town - view) / 2
  return Math.min(Math.max(value, 0), town - view)
}

// Internal village component used by <VillageGame>. The black-box boundary
// lives one level up; this file only deals with the spatial / input layer.
//
// Props:
//   town, buildings     — geometry from <VillageGame>
//   communities         — the same array <VillageGame> received, passed to
//                         AdminPanel for the list/delete UI
//   townSpawn           — { x, y, facing } resolved from session by parent
//   dailyBrief          — a slot (React node) the shell injects into the
//                         top-right overlay; the game does not know its shape
//   onEnterCommunity    — fired when the avatar steps onto a doorway
export default function VillageMap({
  town,
  buildings,
  townSpawn,
  dailyBrief,
  onEnterCommunity,
  trainerDefeated,
  onTrainerDefeated,
}) {
  const [player, setPlayer] = useState({ x: townSpawn.x, y: townSpawn.y })
  const [facing, setFacing] = useState(townSpawn.facing || 'down')
  const [moving, setMoving] = useState(false)
  const [stepCount, setStepCount] = useState(0)
  const [dialogue, setDialogue] = useState(null) // { lines, idx } | null
  const [encounter, setEncounter] = useState(null) // wild Pokémon OR trainer | null
  const [view, setView] = useState({ w: 720, h: 520 })
  const [ready, setReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Gate trainer + his line of sight. Position is derived from the town's
  // entrance so the trainer follows the entrance even as the town reshapes.
  const trainer = useMemo(() => resolveTrainerStart(town), [town])
  const trainerSight = useMemo(
    () => trainerSightCells(trainer, town),
    [trainer, town],
  )

  const shellRef = useRef(null)
  const screenRef = useRef(null)
  const movingRef = useRef(false)
  const heldRef = useRef([])
  const playerRef = useRef(player)
  const facingRef = useRef(facing)
  const dialogueRef = useRef(dialogue)
  const encounterRef = useRef(null) // set manually — must be live for the walk loop
  const graceRef = useRef(0) // steps remaining where encounters are suppressed
  const buildingsRef = useRef(buildings)
  const enterRef = useRef(onEnterCommunity)
  const townRef = useRef(town)
  const trainerRef = useRef(trainer)
  const trainerSightRef = useRef(trainerSight)
  const trainerDefeatedRef = useRef(Boolean(trainerDefeated))

  playerRef.current = player
  facingRef.current = facing
  dialogueRef.current = dialogue
  buildingsRef.current = buildings
  enterRef.current = onEnterCommunity
  townRef.current = town
  trainerRef.current = trainer
  trainerSightRef.current = trainerSight
  trainerDefeatedRef.current = Boolean(trainerDefeated)

  // ---- collision -----------------------------------------------------
  function doorAt(x, y) {
    return buildingsRef.current.find((b) => b.doorCol === x && b.doorRow === y)
  }
  function insideBuilding(x, y) {
    return buildingsRef.current.some(
      (b) => x >= b.col && x < b.col + b.w && y >= b.row && y < b.row + b.h,
    )
  }
  function walkable(x, y) {
    if (!isGroundWalkable(townRef.current, x, y)) return false
    if (doorAt(x, y)) return true
    if (insideBuilding(x, y)) return false
    // The trainer stands in his tile and blocks pass-through (even after
    // defeat — defeated trainers stay rooted in Pokémon, you just walk past).
    const t = trainerRef.current
    if (t && t.x === x && t.y === y) return false
    return true
  }

  // ---- one tile step -------------------------------------------------
  function step(dir) {
    setFacing(dir)
    facingRef.current = dir
    const { x, y } = playerRef.current
    const { dx, dy } = DELTAS[dir]
    const tx = x + dx
    const ty = y + dy
    const door = doorAt(tx, ty)
    if (door) {
      enterRef.current(door.community.id) // walk into a doorway -> enter
      return
    }
    if (!walkable(tx, ty)) return // bumped a wall — turned in place
    movingRef.current = true
    setMoving(true)
    setStepCount((s) => s + 1)
    const np = { x: tx, y: ty }
    playerRef.current = np
    setPlayer(np)
    window.setTimeout(() => {
      movingRef.current = false
      setMoving(false)
      // Trainer sight is checked first — if the player lands in the gate
      // trainer's line of sight, the duel takes priority over a wild
      // encounter on the same step.
      if (!maybeTrainerSpot(tx, ty)) {
        maybeEncounter(tx, ty)
      }
    }, MOVE_MS)
  }

  // ---- gate trainer (fires when a step lands inside his sight line) ---
  // Returns true if a trainer encounter was started, so the caller can skip
  // the wild-grass roll for this step.
  function maybeTrainerSpot(x, y) {
    if (encounterRef.current) return false
    if (trainerDefeatedRef.current) return false
    const inSight = trainerSightRef.current.some(
      (c) => c.x === x && c.y === y,
    )
    if (!inSight) return false
    const challenge = { ...GATE_TRAINER }
    encounterRef.current = challenge
    setEncounter(challenge)
    return true
  }

  // ---- wild encounters (rolled when a step lands on tall grass) ------
  function maybeEncounter(x, y) {
    if (encounterRef.current) return
    if (tileChar(townRef.current, x, y) !== 'g') return
    if (graceRef.current > 0) {
      graceRef.current -= 1 // walking out of the grass after one — stay calm
      return
    }
    if (rollEncounter()) {
      const wild = pickWildPokemon()
      encounterRef.current = wild // sync — the 40ms walk loop reads this
      setEncounter(wild)
    }
  }

  function endEncounter() {
    // Trainer "defeat" persists for the rest of the session — escaping a
    // trainer the Pokémon way means he stays put but no longer challenges.
    // Wild encounters get a few grace steps so you can leave the grass.
    if (encounterRef.current?.kind === 'trainer') {
      trainerDefeatedRef.current = true
      onTrainerDefeated?.()
    } else {
      graceRef.current = GRACE_STEPS
    }
    encounterRef.current = null
    setEncounter(null)
  }

  // ---- A button: advance dialogue, read a sign, or enter a door ------
  function pressA() {
    if (dialogueRef.current) {
      setDialogue((d) => {
        if (!d) return null
        return d.idx >= d.lines.length - 1 ? null : { ...d, idx: d.idx + 1 }
      })
      return
    }
    const { x, y } = playerRef.current
    const { dx, dy } = DELTAS[facingRef.current]
    const fx = x + dx
    const fy = y + dy
    if (tileChar(townRef.current, fx, fy) === 's') {
      setDialogue({ lines: WELCOME, idx: 0 })
      return
    }
    const door = doorAt(fx, fy)
    if (door) enterRef.current(door.community.id)
  }

  function pressDir(dir) {
    if (!heldRef.current.includes(dir)) heldRef.current.push(dir)
    if (!movingRef.current && !dialogueRef.current) step(dir)
  }
  function releaseDir(dir) {
    heldRef.current = heldRef.current.filter((d) => d !== dir)
  }

  // ---- walk loop (keeps moving while a direction is held) ------------
  useEffect(() => {
    const id = window.setInterval(() => {
      if (dialogueRef.current || movingRef.current || encounterRef.current) return
      const held = heldRef.current
      if (held.length) step(held[held.length - 1])
    }, 40)
    return () => window.clearInterval(id)
  }, [])

  // ---- keyboard ------------------------------------------------------
  useEffect(() => {
    function onDown(e) {
      if (encounterRef.current) return // encounter screen owns the keyboard
      const k = e.key.toLowerCase()
      const dir = KEY_DIR[k]
      if (dir) {
        e.preventDefault()
        pressDir(dir)
      } else if (k === 'enter' || k === ' ') {
        e.preventDefault()
        pressA()
      }
    }
    function onUp(e) {
      const dir = KEY_DIR[e.key.toLowerCase()]
      if (dir) releaseDir(dir)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // ---- fullscreen toggle --------------------------------------------
  function toggleFullscreen() {
    const root = shellRef.current
    if (!root) return
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else if (root.requestFullscreen) {
      root.requestFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- viewport measurement (for the camera) -------------------------
  useLayoutEffect(() => {
    const el = screenRef.current
    if (!el) return undefined
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Enable slide transitions only after the first paint (no spawn slide-in).
  useEffect(() => {
    const r = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(r)
  }, [])

  // ---- ground tiles (rebuilt when the town changes) ------------------
  const tiles = useMemo(() => {
    const out = []
    for (let y = 0; y < town.rows; y++) {
      for (let x = 0; x < town.cols; x++) {
        const cls = TILE_CLASS[town.map[y][x]] || 'grass'
        out.push(<div key={`${x}-${y}`} className={`t t-${cls}`} />)
      }
    }
    return out
  }, [town])

  // If the town was rebuilt (a community added/removed) and the player's tile
  // is no longer valid, snap them back to the entrance.
  useEffect(() => {
    const { x, y } = playerRef.current
    if (x < 0 || x >= town.cols || y < 0 || y >= town.rows || !walkable(x, y)) {
      const e = town.entrance
      playerRef.current = { x: e.x, y: e.y }
      setPlayer({ x: e.x, y: e.y })
      setFacing('up')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [town, buildings])

  // ---- camera --------------------------------------------------------
  const camX = clampCamera(
    player.x * TILE + TILE / 2 - view.w / 2,
    town.cols * TILE,
    view.w,
  )
  const camY = clampCamera(
    player.y * TILE + TILE / 2 - view.h / 2,
    town.rows * TILE,
    view.h,
  )

  // ---- what the player is facing -------------------------------------
  const fd = DELTAS[facing]
  const interactionTarget = buildings.find(
    (b) => b.doorCol === player.x + fd.dx && b.doorRow === player.y + fd.dy,
  )
  const facingSign = tileChar(town, player.x + fd.dx, player.y + fd.dy) === 's'
  const actionArmed = Boolean(interactionTarget) || facingSign || Boolean(dialogue)

  return (
    <div className="village-map">
      <div className="gb-shell" ref={shellRef}>
        <div className="gb-topbar">
          <span className="gb-led" />
          <span className="gb-topbar-label">ONE REV VILLAGE</span>
          <span className="gb-topbar-tag">GAME BOY</span>
        </div>

        <div className="gb-screen" ref={screenRef}>
          <div
            className={`town${ready ? ' town-animate' : ''}`}
            style={{
              width: town.cols * TILE,
              height: town.rows * TILE,
              transform: `translate(${-camX}px, ${-camY}px)`,
            }}
          >
            <div
              className="town-ground"
              style={{ gridTemplateColumns: `repeat(${town.cols}, ${TILE}px)` }}
            >
              {tiles}
            </div>

            {buildings.map((b) => (
              <Building
                key={b.community.id}
                building={b}
                isTarget={
                  interactionTarget && interactionTarget.community.id === b.community.id
                }
              />
            ))}

            <Trainer
              trainer={{ ...trainer, name: GATE_TRAINER.name, sprite: GATE_TRAINER.sprite }}
              sightCells={trainerSight}
              defeated={Boolean(trainerDefeated)}
            />

            <div
              className={`player${ready ? ' player-animate' : ''}`}
              style={{
                transform: `translate(${player.x * TILE}px, ${player.y * TILE}px)`,
                zIndex: player.y * 10 + 5,
              }}
            >
              <PlayerSprite facing={facing} moving={moving} step={stepCount} />
            </div>
          </div>

          {/* Overlay controls — fixed on the screen, not scrolled with the map */}
          <div className="screen-overlay">
            <p className="overlay-hint">Arrows / WASD walk · A to enter</p>

            <div className="overlay-slot overlay-tr">
              {dailyBrief}
              <button
                type="button"
                className="fullscreen-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? '⊟ EXIT' : '⛶ FULL'}
              </button>
            </div>

            <div className="overlay-slot overlay-bl">
              <MobileDpad onPress={pressDir} onRelease={releaseDir} />
            </div>

            <div className="overlay-slot overlay-br">
              {interactionTarget && (
                <span className="action-label">{interactionTarget.community.title}</span>
              )}
              <button
                type="button"
                className={`action-btn${actionArmed ? ' action-btn-ready' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={pressA}
                aria-label="A button"
              >
                A
              </button>
            </div>
          </div>

          {dialogue && (
            <DialogueBox
              key={dialogue.idx}
              line={dialogue.lines[dialogue.idx]}
              onAdvance={pressA}
            />
          )}

          {encounter && <EncounterScreen wild={encounter} onRun={endEncounter} />}
        </div>
      </div>
    </div>
  )
}
