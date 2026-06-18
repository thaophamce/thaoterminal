/**
 * Workspace Layout - primary UI.
 * Left: folder sidebar (saved paths). Right: the active terminal, full size.
 * Every terminal stays mounted (and its shell alive) while it exists; only the
 * active one is visible. Clicking + under a folder spawns a shell with cwd = that folder.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { TerminalInstance } from './terminal-instance'
import { WorkspaceSidebar, Workspace } from './workspace-sidebar'

let termCounter = 0
const nextTermId = () => `term-${++termCounter}`

interface Props {
  onImagePaste?: (dataUrl: string) => void
}

export function WorkspaceLayout({ onImagePaste }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [shellName, setShellName] = useState('zsh')
  const [home, setHome] = useState('')
  const loadedRef = useRef(false)
  const busyTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Derived
  const allTerminals = workspaces.flatMap(w => w.terminals)
  const activeWorkspace = workspaces.find(w => w.terminals.some(t => t.id === activeId)) || null
  const activeTerm = allTerminals.find(t => t.id === activeId) || null

  // --- helpers ---
  const fetchBranch = useCallback((wsId: string, path: string) => {
    window.workspace.gitBranch(path).then(branch => {
      if (!branch) return
      setWorkspaces(prev => prev.map(w => (w.id === wsId ? { ...w, branch } : w)))
    })
  }, [])

  const spawnTerminal = useCallback((wsId: string, path: string) => {
    const id = nextTermId()
    setWorkspaces(prev => prev.map(w =>
      w.id === wsId
        ? { ...w, collapsed: false, terminals: [...w.terminals, { id, name: `Terminal ${termCounter}`, cwd: path }] }
        : w
    ))
    setActiveId(id)
  }, [])

  // --- init: load saved folders (or seed with home) ---
  useEffect(() => {
    (async () => {
      const [homeDir, name, saved] = await Promise.all([
        window.app.getHome(),
        window.terminal.getShellName?.() ?? Promise.resolve('zsh'),
        window.workspace.load()
      ])
      setHome(homeDir)
      setShellName(name || 'zsh')

      const paths = Array.isArray(saved) && saved.length ? saved : [homeDir]
      const seedTermId = nextTermId()
      const ws: Workspace[] = paths.map((p, i) => ({
        id: p,
        path: p,
        collapsed: false,
        branch: null,
        terminals: i === 0 ? [{ id: seedTermId, name: 'Terminal 1', cwd: p }] : []
      }))
      setWorkspaces(ws)
      setActiveId(seedTermId)
      ws.forEach(w => fetchBranch(w.id, w.path))
      loadedRef.current = true
    })()
  }, [fetchBranch])

  // --- persist folder paths whenever they change (after initial load) ---
  useEffect(() => {
    if (!loadedRef.current) return
    window.workspace.save(workspaces.map(w => w.path))
  }, [workspaces])

  // --- busy indicator: a terminal is "running" if it emitted output recently ---
  useEffect(() => {
    const off = window.terminal.onData(({ id }) => {
      setBusy(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
      clearTimeout(busyTimers.current[id])
      busyTimers.current[id] = setTimeout(() => {
        setBusy(prev => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 700)
    })
    return off
  }, [])

  // --- remove a terminal (used by close button and on shell exit) ---
  const removeTerminal = useCallback((termId: string) => {
    setWorkspaces(prev => prev.map(w => ({ ...w, terminals: w.terminals.filter(t => t.id !== termId) })))
    setActiveId(prev => {
      if (prev !== termId) return prev
      const remaining = workspaces.flatMap(w => w.terminals).filter(t => t.id !== termId)
      return remaining.length ? remaining[remaining.length - 1].id : null
    })
  }, [workspaces])

  // Shell exited on its own (e.g. user typed `exit`) -> drop the card
  useEffect(() => {
    const off = window.terminal.onExit(({ id }) => removeTerminal(id))
    return off
  }, [removeTerminal])

  // --- folder actions ---
  const addFolder = useCallback(async () => {
    const path = await window.workspace.openFolder()
    if (!path) return
    let existed = false
    setWorkspaces(prev => {
      if (prev.some(w => w.path === path)) { existed = true; return prev }
      return [...prev, { id: path, path, collapsed: false, branch: null, terminals: [] }]
    })
    if (!existed) {
      fetchBranch(path, path)
      spawnTerminal(path, path)
    }
  }, [fetchBranch, spawnTerminal])

  const removeFolder = useCallback((wsId: string) => {
    setWorkspaces(prev => prev.filter(w => w.id !== wsId))
  }, [])

  const toggleFolder = useCallback((wsId: string) => {
    setWorkspaces(prev => prev.map(w => (w.id === wsId ? { ...w, collapsed: !w.collapsed } : w)))
  }, [])

  // --- keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.key === 't') {
        e.preventDefault()
        const ws = activeWorkspace || workspaces[0]
        if (ws) spawnTerminal(ws.id, ws.path)
      }
      if (isMeta && e.key === 'w') {
        e.preventDefault()
        if (activeId) removeTerminal(activeId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeWorkspace, workspaces, activeId, spawnTerminal, removeTerminal])

  const shortHome = (p: string) => (home && p.startsWith(home) ? '~' + p.slice(home.length) : p)

  return (
    <div className="workspace-root">
      {/* Decorative activity rail */}
      <div className="ws-rail">
        <div className="rail-ic active">{'>_'}</div>
        <div className="rail-ic">▦</div>
        <div className="rail-ic">⎇</div>
        <div className="rail-spacer" />
        <div className="rail-ic">⚙</div>
      </div>

      <WorkspaceSidebar
        workspaces={workspaces}
        activeId={activeId}
        busy={busy}
        home={home}
        query={query}
        onQuery={setQuery}
        onAddFolder={addFolder}
        onRemoveFolder={removeFolder}
        onToggle={toggleFolder}
        onAddTerminal={(wsId) => {
          const ws = workspaces.find(w => w.id === wsId)
          if (ws) spawnTerminal(ws.id, ws.path)
        }}
        onSelectTerminal={setActiveId}
        onCloseTerminal={removeTerminal}
      />

      <div className="ws-main">
        {/* Top tab bar: terminals of the active workspace */}
        <div className="ws-maintabs">
          {activeWorkspace?.terminals.map(t => (
            <div
              key={t.id}
              className={`ws-tab ${t.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(t.id)}
            >
              <span className="ws-tab-ic">{'>_'}</span>
              <span>{t.name}</span>
              <button className="ws-tab-x" onClick={(e) => { e.stopPropagation(); removeTerminal(t.id) }}>×</button>
            </div>
          ))}
          {activeWorkspace && (
            <button
              className="ws-tab-add"
              title="New terminal (⌘T)"
              onClick={() => spawnTerminal(activeWorkspace.id, activeWorkspace.path)}
            >+</button>
          )}
        </div>

        {/* Toolbar: path + branch + shell */}
        {activeTerm && activeWorkspace && (
          <div className="ws-toolbar">
            <span className="tb-folder">📁</span>
            <span className="tb-path">{shortHome(activeWorkspace.path)}</span>
            {activeWorkspace.branch && <span className="tb-branch">⎇ {activeWorkspace.branch}</span>}
            <div className="tb-right">
              <span className="tb-shell">● {shellName}</span>
              <button className="tb-ic" title="New terminal" onClick={() => spawnTerminal(activeWorkspace.id, activeWorkspace.path)}>+</button>
              <button className="tb-ic" title="Close terminal" onClick={() => removeTerminal(activeTerm.id)}>🗑</button>
            </div>
          </div>
        )}

        {/* Terminal host: every terminal stays mounted; only active is visible */}
        <div className="ws-termhost">
          {allTerminals.map(t => (
            <TerminalInstance
              key={t.id}
              id={t.id}
              isActive={t.id === activeId}
              cwd={t.cwd}
              onImagePaste={onImagePaste}
            />
          ))}
          {allTerminals.length === 0 && (
            <div className="ws-empty">
              <div className="ws-empty-card">
                <div className="ws-empty-icon">{'>_'}</div>
                <p>No terminals yet.</p>
                <p className="ws-empty-sub">Click <b>+</b> next to a folder, or add a workspace folder to spawn one.</p>
                <button className="ws-empty-btn" onClick={addFolder}>+ Add workspace folder</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
