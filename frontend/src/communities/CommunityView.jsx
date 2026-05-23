import { useState } from 'react'
import { categoryEmoji, BOARD_ORDER } from './constants.js'
import BoardPanel from './BoardPanel.jsx'

// The community-detail scene: a colored header bar, three boards (in fixed
// order), and an Exit button that returns to whatever shell invoked it. The
// PRD calls this view CommunityView — formerly HouseInterior.
export default function CommunityView({ communityData, onExit }) {
  const [boards, setBoards] = useState(communityData.boards || [])
  const community = communityData.community
  const hasLogo = community.logo_url && community.logo_url.trim() !== ''

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
      <header className="interior-header" style={{ background: community.color }}>
        <div className="interior-logo">
          {hasLogo ? (
            <img src={community.logo_url} alt="" className="interior-logo-img" />
          ) : (
            <span className="interior-logo-emoji">
              {categoryEmoji(community.category_key)}
            </span>
          )}
        </div>
        <div className="interior-titles">
          <h2 className="interior-title">{community.title}</h2>
          <span className="interior-category">{community.category_key}</span>
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
