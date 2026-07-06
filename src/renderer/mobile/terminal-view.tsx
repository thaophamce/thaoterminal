/**
 * TerminalView — full-screen remote control of one desktop terminal session.
 *
 * Protocol is unchanged: subscribe -> buffer replay -> live terminal:data,
 * input via terminal:write, size via terminal:resize. Everything on top is
 * client-side UX: latency probe, connection timer, sticky Ctrl/Alt modifiers
 * for the soft keyboard, wake lock, haptics, ended/reconnect states.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { ConnState, RemoteClient } from '../lib/remote-client'
import { AgentAvatar, KIND_INFO, fmtElapsed, latencyTone, type TerminalMeta } from './ui'
import { useElapsed, useLatency, useStoredState } from './hooks'
import { KeyBar } from './key-bar'
import { SettingsSheet } from './settings-sheet'
import { joinPastedLines } from '../lib/paste'

interface Props {
  client: RemoteClient
  meta: TerminalMeta
  conn: ConnState
  /** false once the session disappears from the registry (closed on desktop). */
  alive: boolean
  onBack: () => void
}

export function TerminalView({ client, meta, conn, alive, onBack }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const lastSize = useRef({ cols: 0, rows: 0 })
  const resizeRef = useRef<() => void>(() => {})

  const [ended, setEnded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [pasteModalData, setPasteModalData] = useState<{ text: string } | null>(null)
  const [modalText, setModalText] = useState('')

  useEffect(() => {
    if (pasteModalData) {
      setModalText(pasteModalData.text)
    } else {
      setModalText('')
    }
  }, [pasteModalData])
  const [keybarHidden, setKeybarHidden] = useStoredState('mremote.keybarHidden', false)
  const [fontSize, setFontSize] = useStoredState('mremote.fontSize', 13)
  const [keepAwake, setKeepAwake] = useStoredState('mremote.keepAwake', true)
  const [haptics, setHaptics] = useStoredState('mremote.haptics', true)
  const fontSizeRef = useRef(fontSize)
  fontSizeRef.current = fontSize

  // Sticky modifiers armed from the key bar, applied to the NEXT soft-keyboard
  // character (Termux-style), then cleared.
  const [mods, setMods] = useState({ ctrl: false, alt: false })
  const modsRef = useRef(mods)

  const latency = useLatency(client, conn)
  const elapsed = useElapsed()

  const hapticsRef = useRef(haptics)
  hapticsRef.current = haptics
  const tap = useCallback(() => {
    if (hapticsRef.current) {
      try {
        navigator.vibrate?.(8)
      } catch {
        /* unsupported */
      }
    }
  }, [])

  const toggleMod = useCallback((m: 'ctrl' | 'alt') => {
    setMods((prev) => {
      const next = { ...prev, [m]: !prev[m] }
      modsRef.current = next
      return next
    })
  }, [])

  const write = useCallback(
    (data: string) => {
      client.call('terminal:write', meta.id, data).catch(() => {})
    },
    [client, meta.id]
  )

  // --- xterm lifecycle ---
  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSizeRef.current,
      fontFamily: '"JetBrains Mono", Menlo, monospace',
      scrollback: 100000,
      theme: { background: '#0b0d14', foreground: '#c8d0e8', cursor: '#82a7ff' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    termRef.current = term

    const doResize = () => {
      try {
        fit.fit()
      } catch {
        /* not laid out yet */
      }
      const { cols, rows } = term
      // Same guard as the desktop: only send REAL size changes, or the shared
      // PTY gets resize-spammed and TUIs redraw glitchy.
      if (cols === lastSize.current.cols && rows === lastSize.current.rows) return
      lastSize.current = { cols, rows }
      client.call('terminal:resize', meta.id, cols, rows).catch(() => {})
    }
    resizeRef.current = doResize

    // Only receive this terminal's output stream (the server filters by sub).
    const unsub = client.subscribeTerminal(meta.id)

    // Soft-keyboard input -> PTY, applying armed sticky modifiers.
    const inputDisp = term.onData((d) => {
      let out = d
      const m = modsRef.current
      if ((m.ctrl || m.alt) && d.length === 1) {
        if (m.ctrl) {
          const c = d.toLowerCase().charCodeAt(0)
          if (c >= 97 && c <= 122) out = String.fromCharCode(c - 96)
          else if (d === ' ') out = '\x00'
        }
        if (m.alt) out = `\x1b${out}`
        modsRef.current = { ctrl: false, alt: false }
        setMods(modsRef.current)
      }
      client.call('terminal:write', meta.id, out).catch(() => {})
    })

    const offData = client.on('terminal:data', (p: { id: string; data: string }) => {
      if (p.id === meta.id) term.write(p.data)
    })
    const offExit = client.on('terminal:exit', (p: { id: string }) => {
      if (p.id === meta.id) {
        term.write('\r\n\x1b[31m[session ended]\x1b[0m\r\n')
        setEnded(true)
      }
    })

    // Replay the current screen + recent scrollback, then size to the phone.
    client
      .call<string>('session:buffer', meta.id)
      .then((buf) => {
        if (buf) term.write(buf)
        setTimeout(doResize, 60)
      })
      .catch(() => setTimeout(doResize, 60))

    const onResize = () => setTimeout(doResize, 50)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    // Refit when the soft keyboard opens/closes (visual viewport shrinks).
    window.visualViewport?.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      unsub()
      inputDisp.dispose()
      offData()
      offExit()
      term.dispose()
      termRef.current = null
      // NOTE: we intentionally do NOT kill the PTY — leaving this view just
      // detaches; the desktop session keeps running.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id])

  // Live font-size changes without recreating the terminal.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    resizeRef.current()
  }, [fontSize])

  // Re-assert our size after a reconnect (subscription is auto-restored).
  useEffect(() => {
    if (conn !== 'open') return
    const t = setTimeout(() => resizeRef.current(), 100)
    return () => clearTimeout(t)
  }, [conn])

  // Collapsing the key bar changes the layout height -> refit after animation.
  useEffect(() => {
    const t = setTimeout(() => resizeRef.current(), 240)
    return () => clearTimeout(t)
  }, [keybarHidden])

  // Keep the screen awake while controlling a session (HTTPS/tunnel only).
  useEffect(() => {
    if (!keepAwake) return
    let lock: { release?: () => Promise<void> } | null = null
    const request = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } }).wakeLock?.request('screen') ?? null
      } catch {
        /* unsupported or insecure context */
      }
    }
    request()
    const onVis = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      try {
        lock?.release?.()
      } catch {
        /* already released */
      }
    }
  }, [keepAwake])

  const sendKey = useCallback(
    (seq: string) => {
      tap()
      write(seq)
    },
    [tap, write]
  )

  const doPaste = useCallback(async () => {
    tap()
    let text: string | null = null
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // Clipboard API needs HTTPS/permission — fall back to a manual prompt.
      text = window.prompt('Paste text to send:')
    }
    if (!text) return

    const result = joinPastedLines(text)
    if (meta.kind === 'shell' && result && result.lines.length > 10) {
      setPasteModalData({ text })
    } else {
      const chunkSize = 150
      let offset = 0
      const sendNext = () => {
        if (offset >= text.length) return
        write(text.slice(offset, offset + chunkSize))
        offset += chunkSize
        setTimeout(sendNext, 15)
      }
      sendNext()
    }
  }, [tap, write, meta.kind])

  const toggleKeyboard = useCallback(() => {
    tap()
    const term = termRef.current
    if (!term) return
    const ta = term.textarea
    if (ta && document.activeElement === ta) ta.blur()
    else term.focus()
  }, [tap])

  const gone = ended || (!alive && conn === 'open')
  const info = KIND_INFO[meta.kind]

  return (
    <div className="mv-term-view mv-enter">
      <header className="mv-term-top">
        <button className="mv-icon-btn" onClick={onBack} aria-label="Back to sessions">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <AgentAvatar kind={meta.kind} size={34} presence={false} />
        <div className="mv-term-title">
          <span className="mv-term-name">{meta.name}</span>
          <span className="mv-term-status">
            <span className={`mv-lat${conn === 'open' && latency != null ? ` ${latencyTone(latency)}` : conn === 'open' ? ' good' : ' bad'}`}>
              ● {conn === 'open' ? (latency != null ? `${latency} ms` : 'live') : 'offline'}
            </span>
            <span className="mv-sep" aria-hidden>·</span>
            <span>{fmtElapsed(elapsed)}</span>
            <span className="mv-sep" aria-hidden>·</span>
            <span>{info.label}</span>
          </span>
        </div>
        <button className="mv-icon-btn" onClick={() => setShowSettings(true)} aria-label="Session settings">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h9M19.5 7H20M4 17h.5M11 17h9" />
            <circle cx="16" cy="7" r="2.6" />
            <circle cx="7.5" cy="17" r="2.6" />
          </svg>
        </button>
      </header>

      <div ref={hostRef} className="mv-term" />

      {conn !== 'open' && !gone && (
        <div className="mv-reconnect" role="status">
          <span className="mv-spinner" aria-hidden />
          <span className="mv-reconnect-text">
            {conn === 'connecting' ? 'Reconnecting…' : 'Connection lost — retrying…'}
          </span>
          <button onClick={() => client.retryNow()}>Retry</button>
        </div>
      )}

      {gone && (
        <div className="mv-ended" role="alertdialog" aria-label="Session ended">
          <div className="mv-ended-card">
            <span className="mv-ended-ic" aria-hidden>
              ◌
            </span>
            <strong>Session ended</strong>
            <span>This terminal was closed on the desktop.</span>
            <button onClick={onBack}>Back to sessions</button>
          </div>
        </div>
      )}

      <KeyBar
        collapsed={keybarHidden}
        onToggleCollapse={() => {
          tap()
          setKeybarHidden(!keybarHidden)
        }}
        mods={mods}
        onToggleMod={(m) => {
          tap()
          toggleMod(m)
        }}
        onKey={sendKey}
        onPaste={doPaste}
        onKeyboard={toggleKeyboard}
      />

      {showSettings && (
        <SettingsSheet
          meta={meta}
          fontSize={fontSize}
          onFontSize={setFontSize}
          keepAwake={keepAwake}
          onKeepAwake={setKeepAwake}
          haptics={haptics}
          onHaptics={setHaptics}
          onClose={() => setShowSettings(false)}
        />
      )}

      {pasteModalData && (
        <div className="mv-paste-modal-overlay" onClick={() => setPasteModalData(null)}>
          <div className="mv-paste-modal" onClick={e => e.stopPropagation()}>
            <div className="kb-head">
              <h2>Paste Multi-line Text ({modalText.split(/\r\n|\r|\n/).filter(Boolean).length} lines)</h2>
              <button className="kb-close" onClick={() => setPasteModalData(null)} title="Cancel">×</button>
            </div>
            <div className="mv-paste-modal-body">
              <textarea
                className="mv-paste-modal-textarea"
                value={modalText}
                onChange={e => setModalText(e.target.value)}
                placeholder="Paste code or text here..."
                autoFocus
              />
              <div className="mv-paste-modal-warning">
                Warning: Pasting text with multiple lines can be dangerous. You can review/edit the text above.
              </div>
            </div>
            <div className="mv-paste-modal-actions">
              <button
                className="mv-paste-btn mv-paste-btn-primary"
                onClick={() => {
                  const lines = modalText.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean)
                  const joined = lines.join('; ')
                  
                  const chunkSize = 150
                  let offset = 0
                  const sendNext = () => {
                    if (offset >= joined.length) {
                      write('\r')
                      return
                    }
                    write(joined.slice(offset, offset + chunkSize))
                    offset += chunkSize
                    setTimeout(sendNext, 15)
                  }
                  sendNext()
                  setPasteModalData(null)
                }}
              >
                Send (Join with ;)
              </button>
              <button
                className="mv-paste-btn mv-paste-btn-secondary"
                onClick={() => {
                  const chunkSize = 150
                  let offset = 0
                  const sendNext = () => {
                    if (offset >= modalText.length) return
                    write(modalText.slice(offset, offset + chunkSize))
                    offset += chunkSize
                    setTimeout(sendNext, 15)
                  }
                  sendNext()
                  setPasteModalData(null)
                }}
              >
                Send with Newlines
              </button>
              <button className="mv-paste-btn mv-paste-btn-cancel" onClick={() => setPasteModalData(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
