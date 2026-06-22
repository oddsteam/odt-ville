// A small colored chip for content priority.
const LABELS: Record<string, string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

export default function PriorityChip({ priority }: { priority: string }) {
  const label = LABELS[priority] || priority
  return <span className={`priority-chip priority-${priority}`}>{label}</span>
}
