/**
 * Mobile remote client — a phone-friendly UI to view and control every live
 * terminal session running in the desktop app, over the WebSocket bridge.
 *
 * Served at `/` by src/main/remote-server.ts. Auth token comes from the URL
 * (?token=...) which the QR code encodes.
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './styles/mobile.css'
import { RemoteClient, type ConnState } from './lib/remote-client'

interface TerminalMeta {
  id: string
  name: string
  kind: 'shell' | 'claude' | 'codex' | 'pi'
  cwd: string
  workspacePath: string
}

const token = new URLSearchParams(location.search).get('token') || location.hash.replace(/^#token=/, '')
const client = new RemoteClient(token)

function shortPath(p: string): string {
  if (!p) return '~'
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/')
}

const KIND_LABEL: Record<TerminalMeta['kind'], string> = {
  shell: 'shell', claude: 'Claude', codex: 'Codex', pi: 'PI'
}

function App() {
  const [conn, setConn] = useState<ConnState>('connecting')
  const [sessions, setSessions] = useState<TerminalMeta[]>([])
  const [active, setActive] = useState<TerminalMeta | null>(null)

  useEffect(() => {
    const offState = client.onState(setConn)
    const offMeta = client.on('session:meta', (list: TerminalMeta[]) => setSessions(list || []))
    client.connect()
    return () => { offState(); offMeta() }
  }, [])

  // Refetch the list whenever we (re)connect.
  useEffect(() => {
    if (conn !== 'open') return
    client.call<TerminalMeta[]>('session:list').then((l) => setSessions(l || [])).catch(() => {})
  }, [conn])

  // If the active session disappears from the registry, drop back to the list.
  useEffect(() => {
    if (active && !sessions.some((s) => s.id === active.id)) setActive(null)
  }, [sessions, active])

  const groups = useMemo(() => {
    const m = new Map<string, TerminalMeta[]>()
    for (const s of sessions) {
      const k = s.workspacePath || '~'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return Array.from(m.entries())
  }, [sessions])

  if (active) return <TerminalView meta={active} conn={conn} onBack={() => setActive(null)} />

  return (
    <div className="m-app">
      <header className="m-header">
        <span className="m-title">ThaoTerminal Remote</span>
        <span className={`m-conn ${conn}`}>{conn}</span>
      </header>
      <div className="m-list">
        {sessions.length === 0 && (
          <div className="m-empty">
            {conn === 'open' ? 'No active terminals. Open one on the desktop.' : 'Connecting…'}
          </div>
        )}
        {groups.map(([path, terms]) => (
          <div key={path} className="m-group">
            <div className="m-group-head">{shortPath(path)}</div>
            {terms.map((t) => (
              <button key={t.id} className={`m-session kind-${t.kind}`} onClick={() => setActive(t)}>
                <span className="m-dot" />
                <span className="m-name">{t.name}</span>
                <span className="m-kind">{KIND_LABEL[t.kind]}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TerminalView({ meta, conn, onBack }: { meta: TerminalMeta; conn: ConnState; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"JetBrains Mono", Menlo, monospace',
      scrollback: 5000,
      theme: { background: '#1a1b26', foreground: '#c0caf5' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    termRef.current = term
    fitRef.current = fit

    const sendResize = () => {
      try { fit.fit() } catch { /* not laid out yet */ }
      client.call('terminal:resize', meta.id, term.cols, term.rows).catch(() => {})
    }

    // Input -> PTY
    const inputDisp = term.onData((d) => client.call('terminal:write', meta.id, d).catch(() => {}))
    // Live output -> terminal
    const offData = client.on('terminal:data', (p: { id: string; data: string }) => {
      if (p.id === meta.id) term.write(p.data)
    })
    const offExit = client.on('terminal:exit', (p: { id: string }) => {
      if (p.id === meta.id) term.write('\r\n\x1b[31m[session ended]\x1b[0m\r\n')
    })

    // Replay the current screen + recent scrollback, then size to the phone.
    client.call<string>('session:buffer', meta.id).then((buf) => {
      if (buf) term.write(buf)
      setTimeout(sendResize, 60)
    }).catch(() => setTimeout(sendResize, 60))

    const onResize = () => setTimeout(sendResize, 50)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    setTimeout(() => term.focus(), 120)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      inputDisp.dispose()
      offData()
      offExit()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      // NOTE: we intentionally do NOT kill the PTY — leaving this view just
      // detaches; the desktop session keeps running.
    }
  }, [meta.id])

  const send = (s: string) => { client.call('terminal:write', meta.id, s).catch(() => {}); termRef.current?.focus() }

  return (
    <div className="m-term-view">
      <header className="m-header">
        <button className="m-back" onClick={onBack}>‹ Sessions</button>
        <span className="m-title">{meta.name}</span>
        <span className={`m-conn ${conn}`}>{conn === 'open' ? '●' : '○'}</span>
      </header>
      <div ref={hostRef} className="m-term" />
      <div className="m-keys">
        <button onClick={() => send('\x1b')}>Esc</button>
        <button onClick={() => send('\t')}>Tab</button>
        <button onClick={() => send('\x03')}>^C</button>
        <button onClick={() => send('\x1b[A')}>↑</button>
        <button onClick={() => send('\x1b[B')}>↓</button>
        <button onClick={() => send('\x1b[D')}>←</button>
        <button onClick={() => send('\x1b[C')}>→</button>
        <button onClick={() => send('\r')}>⏎</button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
