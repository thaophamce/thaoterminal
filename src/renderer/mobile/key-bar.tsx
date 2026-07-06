/**
 * KeyBar — the floating helper-key row above the phone keyboard: soft-keyboard
 * toggle, Esc/Tab, sticky Ctrl/Alt modifiers, arrows, ^C, paste, Enter.
 * Collapsible via the grab handle (state persisted by the caller).
 */
import type { ReactNode } from 'react'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  mods: { ctrl: boolean; alt: boolean }
  onToggleMod: (m: 'ctrl' | 'alt') => void
  onKey: (seq: string) => void
  onPaste: () => void
  onKeyboard: () => void
}

export function KeyBar({ collapsed, onToggleCollapse, mods, onToggleMod, onKey, onPaste, onKeyboard }: Props) {
  return (
    <div className={`mv-keybar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="mv-kb-handle"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Show helper keys' : 'Hide helper keys'}
        aria-expanded={!collapsed}
      >
        <span aria-hidden />
      </button>
      <div className="mv-kb-row" aria-hidden={collapsed}>
        <Key onPress={onKeyboard} label="Toggle on-screen keyboard">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="3" y="7" width="18" height="11" rx="2.5" />
            <path d="M7 11h.01M11 11h.01M15 11h.01M17.5 11h.01M7 14.5h10" strokeLinecap="round" />
          </svg>
        </Key>
        <Key onPress={() => onKey('\x1b')} label="Escape">
          esc
        </Key>
        <Key onPress={() => onKey('\t')} label="Tab">
          tab
        </Key>
        <Key onPress={() => onToggleMod('ctrl')} label="Control (applies to the next key)" active={mods.ctrl}>
          ctrl
        </Key>
        <Key onPress={() => onToggleMod('alt')} label="Alt (applies to the next key)" active={mods.alt}>
          alt
        </Key>
        <Key onPress={() => onKey('\x1b[A')} label="Arrow up">
          ↑
        </Key>
        <Key onPress={() => onKey('\x1b[B')} label="Arrow down">
          ↓
        </Key>
        <Key onPress={() => onKey('\x1b[D')} label="Arrow left">
          ←
        </Key>
        <Key onPress={() => onKey('\x1b[C')} label="Arrow right">
          →
        </Key>
        <Key onPress={() => onKey('\x03')} label="Interrupt (Ctrl+C)" danger>
          ^C
        </Key>
        <Key onPress={onPaste} label="Paste from clipboard">
          paste
        </Key>
        <Key onPress={() => onKey('\r')} label="Enter" primary>
          ⏎
        </Key>
      </div>
    </div>
  )
}

function Key({
  children,
  onPress,
  label,
  active,
  danger,
  primary
}: {
  children: ReactNode
  onPress: () => void
  label: string
  active?: boolean
  danger?: boolean
  primary?: boolean
}) {
  return (
    <button
      className={`mv-key${active ? ' on' : ''}${danger ? ' danger' : ''}${primary ? ' primary' : ''}`}
      aria-label={label}
      aria-pressed={active}
      onClick={onPress}
    >
      {children}
    </button>
  )
}
