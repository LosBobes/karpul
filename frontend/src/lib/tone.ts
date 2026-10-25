const PALETTE = ['violet', 'rose', 'amber', 'orange', 'blue', 'teal', 'green', 'pink'] as const

/**
 * A person's colour: a stable function of the name, so the same person gets
 * the same pastel on every avatar and their rides the same on the day plan.
 */
export function avatarTone(name: string): (typeof PALETTE)[number] {
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
