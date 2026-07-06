/**
 * Home — the session list screen of the mobile remote. Search, kind filter
 * chips, quick-connect (most recent session), grouped-by-workspace cards,
 * skeleton loading, empty state, and a connection-lost banner with retry.
 */
import { useMemo, useState } from 'react'
import type { ConnState, RemoteClient } from '../lib/remote-client'
import { AgentAvatar, ConnPill, KIND_INFO, shortPath, type TermKind, type TerminalMeta } from './ui'

interface Props {
  client: RemoteClient
  conn: ConnState
  sessions: TerminalMeta[]
  onOpen: (meta: TerminalMeta) => void
}

export function HomeView({ client, conn, sessions, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<TermKind | 'all'>('all')

  const kinds = useMemo(() => Array.from(new Set(sessions.map((s) => s.kind))), [sessions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions.filter(
      (s) =>
        (kindFilter === 'all' || s.kind === kindFilter) &&
        (!q || s.name.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q))
    )
  }, [sessions, query, kindFilter])

  // Quick connect: the last session opened from this phone, if still live.
  const recent = useMemo(() => {
    let id: string | null = null
    try {
      id = localStorage.getItem('mremote.recent')
    } catch {
      /* private mode */
    }
    if (!id) return null
    return filtered.find((s) => s.id === id) || null
  }, [filtered])

  const groups = useMemo(() => {
    const m = new Map<string, TerminalMeta[]>()
    for (const s of filtered) {
      const k = s.workspacePath || '~'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return Array.from(m.entries())
  }, [filtered])

  return (
    <div className="mv-app mv-enter">
      <header className="mv-top">
        <div className="mv-brand">
          <span className="mv-logo" aria-hidden>
            ❯
          </span>
          <div className="mv-brand-text">
            <span className="mv-app-name">ThaoTerminal</span>
            <span className="mv-app-sub">Remote control</span>
          </div>
        </div>
        <ConnPill conn={conn} count={sessions.length} />
      </header>

      {sessions.length > 0 && (
        <div className="mv-tools">
          <label className="mv-search">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search sessions"
              aria-label="Search sessions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {kinds.length > 1 && (
            <div className="mv-chips" role="group" aria-label="Filter by agent">
              <Chip label="All" on={kindFilter === 'all'} onPress={() => setKindFilter('all')} />
              {kinds.map((k) => (
                <Chip key={k} label={KIND_INFO[k].label} color={KIND_INFO[k].color} on={kindFilter === k} onPress={() => setKindFilter(k)} />
              ))}
            </div>
          )}
        </div>
      )}

      <main className="mv-list">
        {conn !== 'open' && sessions.length === 0 && <SkeletonList />}
        {conn === 'open' && sessions.length === 0 && <EmptyState />}
        {sessions.length > 0 && filtered.length === 0 && (
          <div className="mv-no-match">No sessions match &ldquo;{query}&rdquo;.</div>
        )}

        {recent && (
          <section className="mv-group">
            <h2 className="mv-group-head">Quick connect</h2>
            <SessionCard meta={recent} onOpen={onOpen} highlight />
          </section>
        )}
        {groups.map(([path, terms]) => (
          <section key={path} className="mv-group">
            <h2 className="mv-group-head" title={path}>
              {shortPath(path)}
            </h2>
            {terms.map((t, i) => (
              <SessionCard key={t.id} meta={t} onOpen={onOpen} index={i} />
            ))}
          </section>
        ))}
      </main>

      {conn === 'closed' && (
        <div className="mv-banner" role="alert">
          <span className="mv-banner-dot" aria-hidden />
          <div className="mv-banner-text">
            <strong>Connection lost</strong>
            <span>Reconnecting automatically…</span>
          </div>
          <button className="mv-banner-btn" onClick={() => client.retryNow()}>
            Retry now
          </button>
        </div>
      )}
    </div>
  )
}

function Chip({ label, on, onPress, color }: { label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <button className={`mv-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onPress}>
      {color && <span className="mv-chip-dot" style={{ background: color }} aria-hidden />}
      {label}
    </button>
  )
}

function SessionCard({ meta, onOpen, highlight, index = 0 }: { meta: TerminalMeta; onOpen: (m: TerminalMeta) => void; highlight?: boolean; index?: number }) {
  const info = KIND_INFO[meta.kind]
  return (
    <button
      className={`mv-card${highlight ? ' highlight' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      onClick={() => onOpen(meta)}
      aria-label={`Open ${meta.name} (${info.label})`}
    >
      <AgentAvatar kind={meta.kind} />
      <span className="mv-card-main">
        <span className="mv-card-name">{meta.name}</span>
        <span className="mv-card-sub">{meta.cwd ? shortPath(meta.cwd) : info.label}</span>
      </span>
      <span className="mv-card-side">
        <span className="mv-card-kind" style={{ color: info.color }}>
          {info.label}
        </span>
        <span className="mv-card-open">Open</span>
      </span>
    </button>
  )
}

function SkeletonList() {
  return (
    <div className="mv-skeletons" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mv-skel" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mv-empty">
      <svg viewBox="0 0 120 90" width="136" height="102" aria-hidden>
        <rect x="6" y="8" width="108" height="74" rx="10" fill="rgba(130,167,255,.05)" stroke="rgba(130,167,255,.28)" strokeWidth="1.5" />
        <circle cx="19" cy="21" r="3" fill="#fb7185" />
        <circle cx="30" cy="21" r="3" fill="#fbbf24" />
        <circle cx="41" cy="21" r="3" fill="#34d399" />
        <path d="M20 42l11 9-11 9" stroke="#82a7ff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="38" y="55" width="28" height="4.5" rx="2.25" fill="rgba(200,208,232,.4)">
          <animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite" />
        </rect>
      </svg>
      <h2 className="mv-empty-title">No live terminals</h2>
      <p className="mv-empty-sub">
        Open a terminal in ThaoTerminal on your desktop and it will appear here instantly.
      </p>
    </div>
  )
}
