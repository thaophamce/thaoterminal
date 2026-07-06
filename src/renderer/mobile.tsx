/**
 * Mobile remote client — a phone-friendly UI to view and control every live
 * terminal session running in the desktop app, over the WebSocket bridge.
 *
 * Served at `/` by src/main/remote-server.ts. Auth token comes from the URL
 * (?token=...) which the QR code encodes.
 *
 * This file only wires the client + top-level routing; the UI lives in
 * src/renderer/mobile/ (home list, terminal view, key bar, settings sheet).
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import './styles/mobile.css'
import { RemoteClient, type ConnState } from './lib/remote-client'
import { HomeView } from './mobile/home'
import { TerminalView } from './mobile/terminal-view'
import type { TerminalMeta } from './mobile/ui'

const token = new URLSearchParams(location.search).get('token') || location.hash.replace(/^#token=/, '')
const client = new RemoteClient(token)

function App() {
  const [conn, setConn] = useState<ConnState>('connecting')
  const [sessions, setSessions] = useState<TerminalMeta[]>([])
  const [active, setActive] = useState<TerminalMeta | null>(null)

  useEffect(() => {
    const offState = client.onState(setConn)
    const offMeta = client.on('session:meta', (list: TerminalMeta[]) => setSessions(list || []))
    client.connect()
    return () => {
      offState()
      offMeta()
    }
  }, [])

  // Refetch the list whenever we (re)connect.
  useEffect(() => {
    if (conn !== 'open') return
    client
      .call<TerminalMeta[]>('session:list')
      .then((l) => setSessions(l || []))
      .catch(() => {})
  }, [conn])

  const open = (meta: TerminalMeta) => {
    try {
      localStorage.setItem('mremote.recent', meta.id)
    } catch {
      /* private mode */
    }
    setActive(meta)
  }

  if (active) {
    // When the session disappears from the registry (closed on the desktop),
    // TerminalView shows an explicit "session ended" state instead of the
    // user being silently thrown back to the list.
    const alive = sessions.some((s) => s.id === active.id)
    return <TerminalView client={client} meta={active} conn={conn} alive={alive} onBack={() => setActive(null)} />
  }
  return <HomeView client={client} conn={conn} sessions={sessions} onOpen={open} />
}

createRoot(document.getElementById('root')!).render(<App />)
