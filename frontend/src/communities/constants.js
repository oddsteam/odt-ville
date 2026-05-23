// Domain constants for the communities + content side. Kept self-contained so
// communities components never reach into the game module for these values.

export const BOARD_LABELS = {
  must_know: 'MUST KNOW',
  should_know: 'SHOULD KNOW',
  nice_to_know: 'NICE TO KNOW',
}

export const BOARD_ORDER = ['must_know', 'should_know', 'nice_to_know']

export const PRIORITY_RANK = { urgent: 0, important: 1, normal: 2 }

const CATEGORY_EMOJI = {
  compliance: '⚖️',
  product: '📦',
  branch_ops: '🏢',
  learning: '🎓',
  community: '☕',
}

export function categoryEmoji(key) {
  return CATEGORY_EMOJI[key] || '🏠'
}
