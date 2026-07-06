/**
 * Shared UI primitives + design constants for the mobile remote client:
 * agent kind palette, avatar, connection pill, path/time formatting.
 */
import type { ConnState } from '../lib/remote-client'

export type TermKind = 'shell' | 'claude' | 'codex' | 'pi'

export interface TerminalMeta {
  id: string
  name: string
  kind: TermKind
  cwd: string
  workspacePath: string
}

export const KIND_INFO: Record<TermKind, { label: string; glyph: string; color: string }> = {
  claude: { label: 'Claude', glyph: '✳', color: '#e08a63' },
  codex: { label: 'Codex', glyph: '◈', color: '#2fbf9a' },
  pi: { label: 'PI', glyph: 'π', color: '#b49bfa' },
  shell: { label: 'Shell', glyph: '❯', color: '#82a7ff' }
}

/** `D:\a\b\c` or `/a/b/c` -> `…/b/c`; empty -> 'Home'. */
export function shortPath(p: string): string {
  if (!p || p === '~') return 'Home'
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? parts.join('/') : '…/' + parts.slice(-2).join('/')
}

export function fmtElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function latencyTone(ms: number): 'good' | 'ok' | 'bad' {
  return ms < 120 ? 'good' : ms < 350 ? 'ok' : 'bad'
}

/** Colored rounded-square avatar for an agent kind, with a live-presence dot. */
export function AgentAvatar({ kind, size = 42, presence = true }: { kind: TermKind; size?: number; presence?: boolean }) {
  const info = KIND_INFO[kind]
  return (
    <span
      className="mv-avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        color: info.color,
        background: `${info.color}1c`,
        borderColor: `${info.color}38`
      }}
    >
      {info.glyph}
      {presence && <span className="mv-presence" />}
    </span>
  )
}

/** Header pill showing the bridge connection state (and live session count). */
export function ConnPill({ conn, count }: { conn: ConnState; count?: number }) {
  const label =
    conn === 'open'
      ? typeof count === 'number'
        ? `${count} live`
        : 'Connected'
      : conn === 'connecting'
        ? 'Connecting'
        : 'Offline'
  return (
    <span className={`mv-pill ${conn}`} role="status">
      <span className="mv-pill-dot" />
      {label}
    </span>
  )
}
