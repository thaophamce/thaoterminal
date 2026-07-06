/**
 * CommandPalette — Ctrl+K quick actions. Pure UI: fuzzy-filters a fixed list
 * of commands built by WorkspaceLayout from the very same dispatchers the
 * menu bar and keyboard shortcuts already call (`runAction`, `setActiveId`,
 * `setShowKeybindings`, `setShowRemote`, `onCycleTheme`). No new IPC, no new
 * business logic — this is a discoverability layer on top of what exists.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon } from './icons'

export interface PaletteCommand {
  id: string
  label: string
  group?: string
  hint?: string
  icon?: JSX.Element
}

interface Props {
  commands: PaletteCommand[]
  onRun: (id: string) => void
  onClose: () => void
}

// Subsequence fuzzy match with a bonus for prefix / contiguous runs, so
// "nct" still finds "New Codex Terminal" but "codex" ranks its exact prefix
// hits above scattered ones. Returns -1 when the query isn't a subsequence.
function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 1
  if (t.startsWith(q)) return 1000 - t.length
  let ti = 0
  let score = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti)
    if (idx === -1) return -1
    streak = idx === ti ? streak + 1 : 1
    score += 10 + streak * 3 - (idx - ti)
    ti = idx + 1
  }
  return score
}

export function CommandPalette({ commands, onRun, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const scored = commands
      .map(c => ({ c, score: fuzzyScore(query, `${c.group ?? ''} ${c.label}`) }))
      .filter(x => x.score >= 0)
    scored.sort((a, b) => b.score - a.score)
    return scored.map(x => x.c)
  }, [commands, query])

  useEffect(() => { setSelected(0) }, [query])

  // Own key handling in the capture phase so shortcuts underneath (Ctrl+W,
  // Ctrl+N, etc.) don't also fire while the palette is focused.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setSelected(s => Math.min(results.length - 1, s + 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setSelected(s => Math.max(0, s - 1)); return }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        const cmd = results[selected]
        if (cmd) { onRun(cmd.id); onClose() }
        return
      }
      // Let everything else (typing, Ctrl+K to toggle) fall through.
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [results, selected, onRun, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector('.cp-row.selected') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="cp-input-row">
          <SearchIcon size={15} className="cp-search-ic" />
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="Type a command…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
          />
          <kbd className="cp-esc">Esc</kbd>
        </div>
        <div className="cp-list" ref={listRef}>
          {results.length === 0 && <div className="cp-empty">No matching commands</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              className={`cp-row ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => { onRun(c.id); onClose() }}
            >
              {c.icon && <span className="cp-row-ic">{c.icon}</span>}
              <span className="cp-row-label">{c.label}</span>
              {c.group && <span className="cp-row-group">{c.group}</span>}
              {c.hint && <kbd className="cp-row-hint">{c.hint}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
