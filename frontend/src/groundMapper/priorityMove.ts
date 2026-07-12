// Reorder the terrain priority stack (#120, extracted from the map editor in
// #198): swap `name` with its neighbour in the low→high stack. `dir` +1 raises
// priority (owns more seams), -1 lowers it. Null when the move falls off
// either end or the name is unknown.
export const movedOrder = (order: readonly string[], name: string, dir: 1 | -1): string[] | null => {
  const i = order.indexOf(name)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return null
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
