import { TILE, categoryEmoji } from './constants.js'
import SignBadge from './SignBadge.jsx'

// A top-down Pokémon-style building sitting on a plot. The roof is tinted with
// the community's admin-configured colour; a nameplate sign sits in front.
export default function Building({ building, isTarget }) {
  const { community, col, row, w, h, doorCol } = building
  const urgent = (community.badges?.urgent || 0) > 0

  return (
    <div
      className={`building${isTarget ? ' building-target' : ''}`}
      style={{
        left: col * TILE,
        top: row * TILE,
        width: w * TILE,
        height: h * TILE,
        // Depth-sort: the avatar is in front of buildings it stands below.
        zIndex: (row + h) * 10,
      }}
    >
      <div className="bld-roof" style={{ background: community.color }}>
        <div className="bld-roof-ridge" />
        {urgent && <SignBadge />}
      </div>

      <div className="bld-wall">
        <div className="bld-window" />
        <div
          className="bld-door"
          style={{ left: (doorCol - col) * TILE + TILE * 0.18, width: TILE * 0.64 }}
        />
        <div className="bld-window bld-window-right" />
      </div>

      <div className="bld-plaque" style={{ width: w * TILE }}>
        <span className="bld-emoji">{categoryEmoji(community.category_key)}</span>
        <span className="bld-name">{community.title}</span>
      </div>
    </div>
  )
}
