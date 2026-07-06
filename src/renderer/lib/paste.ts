/** Pure paste-text logic, shared by the paste listener and the right-click paste handler. */

export interface JoinedPaste {
  lines: string[]
  joined: string
}

/**
 * Splits pasted text into trimmed non-empty lines and `; `-joins them for
 * shells without bracketed-paste support (PowerShell/CMD would otherwise
 * execute each line as it lands). Returns null for single-line paste, which
 * callers should pass through unmodified.
 */
export function joinPastedLines(text: string): JoinedPaste | null {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  return { lines, joined: lines.join('; ') }
}
