// A small colored chip for content priority.
const LABELS = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

export default function PriorityChip({ priority }) {
  const label = LABELS[priority] || priority
  return <span className={`priority-chip priority-${priority}`}>{label}</span>
}
