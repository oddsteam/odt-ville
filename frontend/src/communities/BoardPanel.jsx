import { BOARD_LABELS } from './constants.js'
import ContentCard from './ContentCard.jsx'

// One board within a house: a labeled header and its content cards.
// Must-Know is styled most prominent; Nice-to-Know the least.
export default function BoardPanel({ board, onItemUpdate }) {
  const label = BOARD_LABELS[board.board_type] || board.board_type
  const items = board.content_items || []

  return (
    <section className={`board-panel board-${board.board_type}`}>
      <header className="board-header">
        <h3 className="board-title">{label}</h3>
        <span className="board-count">{items.length}</span>
      </header>

      {items.length === 0 ? (
        <p className="board-empty">Nothing here right now.</p>
      ) : (
        <div className="board-cards">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onItemUpdate={(res) => onItemUpdate(board.board_type, res)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
