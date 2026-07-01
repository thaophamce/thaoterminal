/**
 * Configurable keyboard shortcuts. Defaults can be overridden by the user and
 * are persisted to localStorage. Jump (⌘1–9) is fixed and handled separately.
 */
export interface Binding {
  id: string
  label: string
  combo: string // e.g. "Cmd+Shift+C"
}

export const DEFAULT_BINDINGS: Binding[] = [
  { id: 'newTerminal', label: 'New terminal', combo: 'Ctrl+Shift+T' },
  { id: 'newClaude', label: 'New Claude session', combo: 'Ctrl+Shift+C' },
  { id: 'newCodex', label: 'New Codex session', combo: 'Ctrl+Shift+X' },
  { id: 'newPi', label: 'New PI session', combo: 'Ctrl+Shift+P' },
  { id: 'newTawx', label: 'New tawx session', combo: 'Ctrl+Shift+A' },
  { id: 'addFolder', label: 'Add workspace folder', combo: 'Ctrl+Shift+N' },
  { id: 'closeTerminal', label: 'Close terminal', combo: 'Ctrl+W' },
  { id: 'toggleSidebar', label: 'Toggle sidebar', combo: 'Ctrl+B' }
]

const STORE_KEY = 'taw.keybindings'

/** Build the combo string for a keyboard event (e.g. "Cmd+Shift+C"). */
export function eventToCombo(e: KeyboardEvent): string {
  const k = e.key
  if (k === 'Meta' || k === 'Control' || k === 'Alt' || k === 'Shift') return ''
  const parts: string[] = []
  if (e.metaKey) parts.push('Cmd')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let key = k
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}

/** Pretty display: Ctrl+Shift+C -> Ctrl+Shift+C */
export function formatCombo(combo: string): string {
  return combo
    .replace(/Cmd/g, 'Ctrl')
    .split('+')
    .join('+')
}

export function loadBindings(): Binding[] {
  let overrides: Record<string, string> = {}
  try {
    overrides = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    overrides = {}
  }
  return DEFAULT_BINDINGS.map(b => ({ ...b, combo: overrides[b.id] || b.combo }))
}

export function saveBindings(bindings: Binding[]): void {
  const map: Record<string, string> = {}
  bindings.forEach(b => { map[b.id] = b.combo })
  localStorage.setItem(STORE_KEY, JSON.stringify(map))
}
