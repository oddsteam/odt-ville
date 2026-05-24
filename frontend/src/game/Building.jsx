import { TILE, categoryEmoji } from './constants.js'
import SignBadge from './SignBadge.jsx'
import roofImg from './assets/buildings/guild-roof.png'
import bodyImg from './assets/buildings/guild-body.png'

// Convert a hex color (#RRGGBB) to its hue in degrees. Roof source is red
// (hue ≈ 0°), so the resulting degrees can be applied directly as a CSS
// `hue-rotate` filter to retint just the roof layer per community.
function hueOf(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 0
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return h * 60
}

// A top-down village house sitting on a plot. Rendered as two stacked sprite
// layers — a roof image and a body image — so the roof can be hue-rotated
// per community without touching the door, walls, sign or windows.
export default function Building({ building, isTarget }) {
  const { community, col, row, w, h } = building
  const urgent = (community.badges?.urgent || 0) > 0
  // Source roof hue is red (0°); rotate to the community's admin-picked hue.
  const roofHue = hueOf(community.color)
  const roofFilter = roofHue ? `hue-rotate(${roofHue}deg)` : 'none'

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
      <img
        className="bld-roof-layer"
        src={roofImg}
        style={{ filter: roofFilter }}
        alt=""
        draggable="false"
      />
      <img
        className="bld-body-layer"
        src={bodyImg}
        alt={community.title}
        draggable="false"
      />

      {urgent && <SignBadge />}

      <div className="bld-plaque" style={{ width: w * TILE }}>
        <span className="bld-emoji">{categoryEmoji(community.category_key)}</span>
        <span className="bld-name">{community.title}</span>
      </div>
    </div>
  )
}
