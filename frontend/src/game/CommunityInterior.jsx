import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { TILE, MOVE_MS } from './constants.js'
import PlayerSprite from './PlayerSprite.jsx'
import MobileDpad from './MobileDpad.jsx'
import {
  buildInterior,
  interiorTileChar,
  isInteriorWalkable,
  boardAt,
} from './buildInterior.js'

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

const TILE_CLASS = {
  '.': 'floor',
  W: 'wall',
  D: 'door-tile',
  // Boards are rendered as positioned sprites on top of the floor — the
  // underlying tile stays floor so the board casts onto a clean square.
  1: 'floor',
  2: 'floor',
  3: 'floor',
}

// Clamp the camera so the room is centred when it fits, and pans to follow
// the player when it doesn't (rare for this tiny room, but keeps the math
// identical to <VillageMap>).
function clampCamera(value, total, view) {
  if (total <= view) return (total - view) / 2
  return Math.min(Math.max(value, 0), total - view)
}

// CommunityInterior — the spatial room behind a community's door.
//
// This is a black-box game scene exactly like <VillageMap>. The shell gives
// it the community summary (id, title, color, badges) plus the slot
// renderers, and listens for two events:
//
//   onExit()                — player walked back through the door, or hit Exit
//   onOpenBoard(boardType)  — player pressed A on Must / Should / Nice
//
// It does not import from `src/communities/` — the boards are spatial objects
// here, and what's *behind* them is the shell's business.
export default function CommunityInterior({
  community,
  dailyBrief,
  onExit,
  onOpenBoard,
}) {
  const interior = useMemo(() => buildInterior(), [])

  const [player, setPlayer] = useState({
    x: interior.spawn.x,
    y: interior.spawn.y,
  })
  const [facing, setFacing] = useState(interior.spawn.facing)
  const [moving, setMoving] = useState(false)
  const [stepCount, setStepCount] = useState(0)
  const [view, setView] = useState({ w: 720, h: 520 })
  const [ready, setReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const shellRef = useRef(null)
  const screenRef = useRef(null)
  const movingRef = useRef(false)
  const heldRef = useRef([])
  const playerRef = useRef(player)
  const facingRef = useRef(facing)
  // Once an exit is in flight we stop accepting more movement / clicks so a
  // user can't fire onExit twice (door tile + Exit button in rapid succession).
  const exitingRef = useRef(false)

  playerRef.current = player
  facingRef.current = facing

  // ---- collision ----------------------------------------------------
  function walkable(x, y) {
    return isInteriorWalkable(interior, x, y)
  }

  // ---- one tile step ------------------------------------------------
  function step(dir) {
    if (exitingRef.current) return
    setFacing(dir)
    facingRef.current = dir
    const { x, y } = playerRef.current
    const { dx, dy } = DELTAS[dir]
    const tx = x + dx
    const ty = y + dy
    // Stepping onto the door tile leaves the room.
    if (interiorTileChar(interior, tx, ty) === 'D') {
      exitingRef.current = true
      onExit?.()
      return
    }
    if (!walkable(tx, ty)) return // bumped a wall / board — turn in place
    movingRef.current = true
    setMoving(true)
    setStepCount((s) => s + 1)
    const np = { x: tx, y: ty }
    playerRef.current = np
    setPlayer(np)
    window.setTimeout(() => {
      movingRef.current = false
      setMoving(false)
    }, MOVE_MS)
  }

  // ---- A button: press the board you are facing ---------------------
  function pressA() {
    if (exitingRef.current) return
    const { x, y } = playerRef.current
    const { dx, dy } = DELTAS[facingRef.current]
    const board = boardAt(interior, x + dx, y + dy)
    if (board) onOpenBoard?.(board.boardType)
  }

  function pressDir(dir) {
    if (!heldRef.current.includes(dir)) heldRef.current.push(dir)
    if (!movingRef.current) step(dir)
  }
  function releaseDir(dir) {
    heldRef.current = heldRef.current.filter((d) => d !== dir)
  }

  // ---- walk loop (keeps stepping while a direction is held) ---------
  useEffect(() => {
    const id = window.setInterval(() => {
      if (movingRef.current || exitingRef.current) return
      const held = heldRef.current
      if (held.length) step(held[held.length - 1])
    }, 40)
    return () => window.clearInterval(id)
  }, [])

  // ---- keyboard -----------------------------------------------------
  useEffect(() => {
    function onDown(e) {
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

  // ---- fullscreen toggle -------------------------------------------
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
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- viewport measurement (for the camera) -----------------------
  useLayoutEffect(() => {
    const el = screenRef.current
    if (!el) return undefined
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Skip the spawn slide-in.
  useEffect(() => {
    const r = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(r)
  }, [])

  // ---- ground tiles -------------------------------------------------
  const tiles = useMemo(() => {
    const out = []
    for (let y = 0; y < interior.rows; y++) {
      for (let x = 0; x < interior.cols; x++) {
        const cls = TILE_CLASS[interior.map[y][x]] || 'floor'
        out.push(<div key={`${x}-${y}`} className={`it it-${cls}`} />)
      }
    }
    return out
  }, [interior])

  // ---- camera + targeting ------------------------------------------
  const fd = DELTAS[facing]
  const facingBoard = boardAt(interior, player.x + fd.dx, player.y + fd.dy)
  // The A button is "armed" (highlighted) when the player is facing
  // something they can interact with — currently a board.
  const actionArmed = Boolean(facingBoard)

  const camX = clampCamera(
    player.x * TILE + TILE / 2 - view.w / 2,
    interior.cols * TILE,
    view.w,
  )
  const camY = clampCamera(
    player.y * TILE + TILE / 2 - view.h / 2,
    interior.rows * TILE,
    view.h,
  )

  // The community's roof colour drives the back-wall accent so the interior
  // reads as belonging to the building you just walked into. Falls back to
  // a warm wood tone when a community has no colour set.
  const accent = community?.color || '#c7a76a'
  // Urgent badge bubbles to Must-Know — that's where mandated items live.
  const urgentCount = community?.badges?.urgent || 0

  return (
    <div className="village-map community-interior">
      <div className="gb-shell" ref={shellRef}>
        <div className="gb-topbar">
          <span className="gb-led" />
          {/* `.interior-title` is the stable selector exit-spawn / walk e2e
              tests rely on. Doubling up the class keeps the title visible
              in the topbar without an extra DOM node. */}
          <span className="gb-topbar-label interior-title">
            {community?.title || 'COMMUNITY'}
          </span>
          <span className="gb-topbar-tag">GAME BOY</span>
        </div>

        <div className="gb-screen" ref={screenRef}>
          <div
            className={`town${ready ? ' town-animate' : ''} interior-room`}
            style={{
              width: interior.cols * TILE,
              height: interior.rows * TILE,
              transform: `translate(${-camX}px, ${-camY}px)`,
              // CSS variable so the back-wall band can tint to the community.
              '--room-accent': accent,
            }}
          >
            <div
              className="town-ground interior-ground"
              style={{
                gridTemplateColumns: `repeat(${interior.cols}, ${TILE}px)`,
              }}
            >
              {tiles}
            </div>

            {/* Boards — positioned sprites on top of the floor. */}
            {interior.boards.map((b) => {
              const targeted =
                facingBoard && facingBoard.boardType === b.boardType
              const showBadge = b.boardType === 'must_know' && urgentCount > 0
              return (
                <div
                  key={b.boardType}
                  className={`interior-board board-${b.boardType}${
                    targeted ? ' board-target' : ''
                  }`}
                  style={{
                    left: b.col * TILE,
                    top: b.row * TILE,
                    width: TILE,
                    height: TILE,
                  }}
                >
                  <span className="board-label">{b.label}</span>
                  {showBadge && (
                    <span className="board-badge" aria-label="urgent items">
                      {urgentCount}
                    </span>
                  )}
                </div>
              )
            })}

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

          {/* Overlay controls — same shape / positions as the town overlay,
              so the GB chrome reads consistently across scenes. */}
          <div className="screen-overlay">
            <p className="overlay-hint">
              Arrows / WASD walk · A to open · door to exit
            </p>

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
              <button
                type="button"
                className="exit-door-btn"
                onClick={() => {
                  if (exitingRef.current) return
                  exitingRef.current = true
                  onExit?.()
                }}
              >
                <span className="exit-door-icon">🚪</span> Exit
              </button>
            </div>

            <div className="overlay-slot overlay-bl">
              <MobileDpad onPress={pressDir} onRelease={releaseDir} />
            </div>

            <div className="overlay-slot overlay-br">
              {facingBoard && (
                <span className="action-label">OPEN {facingBoard.label}</span>
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
        </div>
      </div>
    </div>
  )
}
