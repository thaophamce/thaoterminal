/** Pure classification of xterm custom-key-handler decisions — kept separate from
 * DOM/xterm instances so they're unit-testable without mounting a real terminal. */

export interface KeyDescriptor {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  type: string
}

export type ScrollAction = 'pageUp' | 'pageDown' | 'top' | 'bottom' | null

/**
 * Bare PageUp/PageDown and Ctrl+Home/Ctrl+End scroll the local viewport
 * instead of sending a VT sequence to the PTY — but only outside the
 * alternate screen buffer, so full-screen TUIs (vim, htop, Ink UIs) keep
 * receiving the raw keys untouched.
 */
export function classifyScrollKey(e: KeyDescriptor, isAltBuffer: boolean): ScrollAction {
  if (isAltBuffer || e.type !== 'keydown') return null
  if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === 'PageUp') return 'pageUp'
    if (e.key === 'PageDown') return 'pageDown'
  }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    if (e.key === 'Home') return 'top'
    if (e.key === 'End') return 'bottom'
  }
  return null
}

/** Ctrl+V and Shift+Insert both fall through to the browser's native paste event. */
export function isBrowserPasteShortcut(e: KeyDescriptor): boolean {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === 'v') return true
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Insert') return true
  return false
}
