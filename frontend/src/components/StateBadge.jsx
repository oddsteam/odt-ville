// A small badge showing the read-state of a content item.
const LABELS = {
  unread: 'Unread',
  opened: 'Opened',
  acknowledged: 'Acknowledged',
}

export default function StateBadge({ state }) {
  const label = LABELS[state] || state
  return <span className={`state-badge state-${state}`}>{label}</span>
}
