import { describe, it, expect } from 'vitest'
import { classifyScrollKey, isBrowserPasteShortcut, type KeyDescriptor } from './terminal-keys'

function key(overrides: Partial<KeyDescriptor>): KeyDescriptor {
  return {
    key: '',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    type: 'keydown',
    ...overrides
  }
}

describe('classifyScrollKey', () => {
  it('scrolls a page up/down on bare PageUp/PageDown outside the alt buffer', () => {
    expect(classifyScrollKey(key({ key: 'PageUp' }), false)).toBe('pageUp')
    expect(classifyScrollKey(key({ key: 'PageDown' }), false)).toBe('pageDown')
  })

  it('jumps to top/bottom on Ctrl+Home/Ctrl+End outside the alt buffer', () => {
    expect(classifyScrollKey(key({ key: 'Home', ctrlKey: true }), false)).toBe('top')
    expect(classifyScrollKey(key({ key: 'End', ctrlKey: true }), false)).toBe('bottom')
  })

  it('does not intercept anything while in the alternate screen buffer (vim, htop, Ink TUIs)', () => {
    expect(classifyScrollKey(key({ key: 'PageUp' }), true)).toBeNull()
    expect(classifyScrollKey(key({ key: 'PageDown' }), true)).toBeNull()
    expect(classifyScrollKey(key({ key: 'Home', ctrlKey: true }), true)).toBeNull()
    expect(classifyScrollKey(key({ key: 'End', ctrlKey: true }), true)).toBeNull()
  })

  it('leaves Shift+PageUp/Down alone (already scrolls via xterm default)', () => {
    expect(classifyScrollKey(key({ key: 'PageUp', shiftKey: true }), false)).toBeNull()
    expect(classifyScrollKey(key({ key: 'PageDown', shiftKey: true }), false)).toBeNull()
  })

  it('ignores keyup events', () => {
    expect(classifyScrollKey(key({ key: 'PageUp', type: 'keyup' }), false)).toBeNull()
  })

  it('ignores unrelated keys and modifier combos', () => {
    expect(classifyScrollKey(key({ key: 'a' }), false)).toBeNull()
    expect(classifyScrollKey(key({ key: 'PageUp', ctrlKey: true }), false)).toBeNull()
    expect(classifyScrollKey(key({ key: 'Home' }), false)).toBeNull()
  })
})

describe('isBrowserPasteShortcut', () => {
  it('matches Ctrl+V', () => {
    expect(isBrowserPasteShortcut(key({ key: 'v', ctrlKey: true }))).toBe(true)
  })

  it('matches Shift+Insert', () => {
    expect(isBrowserPasteShortcut(key({ key: 'Insert', shiftKey: true }))).toBe(true)
  })

  it('does not match Ctrl+Shift+V or plain Insert', () => {
    expect(isBrowserPasteShortcut(key({ key: 'v', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isBrowserPasteShortcut(key({ key: 'Insert' }))).toBe(false)
  })

  it('does not match unrelated keys', () => {
    expect(isBrowserPasteShortcut(key({ key: 'c', ctrlKey: true }))).toBe(false)
  })
})
