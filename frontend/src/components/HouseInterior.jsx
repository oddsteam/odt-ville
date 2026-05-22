import { useState } from 'react'
import { categoryEmoji, BOARD_ORDER } from '../constants.js'
import BoardPanel from './BoardPanel.jsx'

// The house scene: a colored header bar, three boards (in fixed order),
// and an Exit door button that returns to the town.
export default function HouseInterior({ houseData, onExit }) {
  // Local copy of boards so item state updates render immediately.
  const [boards, setBoards] = useState(houseData.boards || [])
  const house = houseData.house
  const hasLogo = house.logo_url && house.logo_url.trim() !== ''

  // Merge an updated content item (from open/acknowledge) into local state.
  function handleItemUpdate(boardType, res) {
    setBoards((prev) =>
      prev.map((b) => {
        if (b.board_type !== boardType) return b
        return {
          ...b,
          content_items: b.content_items.map((it) =>
            it.id === res.id ? { ...it, ...res } : it,
          ),
        }
      }),
    )
  }

  // Boards always arrive in must_know/should_know/nice_to_know order, but
  // sort defensively so the UI is stable regardless.
  const ordered = [...boards].sort(
    (a, b) => BOARD_ORDER.indexOf(a.board_type) - BOARD_ORDER.indexOf(b.board_type),
  )

  return (
    <div className="house-interior">
      <header className="interior-header" style={{ background: house.color }}>
        <div className="interior-logo">
          {hasLogo ? (
            <img src={house.logo_url} alt="" className="interior-logo-img" />
          ) : (
            <span className="interior-logo-emoji">
              {categoryEmoji(house.category_key)}
            </span>
          )}
        </div>
        <div className="interior-titles">
          <h2 className="interior-title">{house.title}</h2>
          <span className="interior-category">{house.category_key}</span>
        </div>
        <button type="button" className="exit-door-btn" onClick={onExit}>
          <span className="exit-door-icon">🚪</span>
          Exit
        </button>
      </header>

      <div className="interior-boards">
        {ordered.map((board) => (
          <BoardPanel
            key={board.id ?? board.board_type}
            board={board}
            onItemUpdate={handleItemUpdate}
          />
        ))}
      </div>
    </div>
  )
}
