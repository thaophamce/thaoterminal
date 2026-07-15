/**
 * Single terminal instance - xterm.js with addons
 * Handles image paste and web links
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useTheme } from '../hooks/use-theme'
import { joinPastedLines } from '../lib/paste'
import { classifyScrollKey, isBrowserPasteShortcut } from '../lib/terminal-keys'
import '@xterm/xterm/css/xterm.css'

interface Props {
  id: string
  isActive: boolean
  cwd?: string
  /** Metadata surfaced to remote (phone) clients in the session list. */
  name?: string
  kind?: string
  workspacePath?: string
  /** Command auto-run once after the shell is ready (e.g. `claude --resume <id>`) */
  initialCommand?: string
  onImagePaste?: (dataUrl: string) => void
}

export function TerminalInstance({ id, isActive, cwd, name, kind, workspacePath, initialCommand, onImagePaste }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const initializedRef = useRef(false)
  const { xtermTheme } = useTheme()
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [pasteModalData, setPasteModalData] = useState<{ text: string } | null>(null)
  const [modalText, setModalText] = useState('')

  useEffect(() => {
    if (pasteModalData) {
      setModalText(pasteModalData.text)
    } else {
      setModalText('')
    }
  }, [pasteModalData])

  // Editable paste placeholder (shell tabs only) — see the input-forwarding
  // effect below for the full echo/erase/flush design. `bufferUnitsRef` holds
  // the units typed/pasted since the buffer was last flushed; `pasteCounterRef`
  // numbers placeholders (#1, #2…) and resets once the buffer empties out.
  type BufferUnit = { kind: 'char'; value: string } | { kind: 'placeholder'; visibleLen: number; real: string }
  const bufferUnitsRef = useRef<BufferUnit[]>([])
  const pasteCounterRef = useRef(0)

  // Last size we actually pushed to the PTY. Re-asserting the SAME size still
  // fires a resize signal down to the shell — on Windows (ConPTY) that makes
  // Ink-based TUIs (Claude Code, Codex) redraw their whole screen. With several
  // independent triggers here (focus, tab switch, ResizeObserver) all able to
  // fire in close succession without an actual size change, those redraws can
  // overlap and land as duplicated/misaligned text. Only forward a resize when
  // cols/rows genuinely changed.
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const pushResize = useCallback((cols: number, rows: number, force = false) => {
    const last = lastSizeRef.current
    if (!force && last && last.cols === cols && last.rows === rows) return
    lastSizeRef.current = { cols, rows }
    window.terminal.resize(id, cols, rows)
  }, [id])

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom()
    terminalRef.current?.focus()
  }, [])

  // Keep the latest isActive readable from stable callbacks below.
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // Whether a remote (phone) client is currently attached to the shared PTY.
  // Forcing an unchanged size down to ConPTY makes Ink TUIs (Claude Code/Codex)
  // redraw their whole screen, and overlapping redraws corrupt the display
  // (vỡ/lặp chữ) and snap scrollback to the bottom. That forced re-assert is
  // ONLY needed to reclaim size after a phone squeezed the shared PTY, so we
  // gate it behind an actually-connected client — desktop-only use never forces.
  const hasRemoteClientsRef = useRef(false)

  // Re-fit to THIS window and push the size back to the (shared) PTY. A remote
  // phone client fits the same PTY to its tiny screen; without re-asserting,
  // the desktop stays squeezed at the phone's width — the program reflows to
  // ~40 cols and everything crams into the left half. Only the active terminal
  // is laid out (others are display:none → a fit would compute 0), so guard it.
  // `force` re-sends even an unchanged size (needed only when a phone may have
  // changed the shared PTY behind our back); otherwise pushResize dedupes and
  // stays silent when cols/rows didn't actually change.
  const reassertSize = useCallback((force = false) => {
    if (!isActiveRef.current) return
    requestAnimationFrame(() => {
      if (!isActiveRef.current || !fitAddonRef.current || !terminalRef.current) return
      fitAddonRef.current.fit()
      const { cols, rows } = terminalRef.current
      pushResize(cols, rows, force)
    })
  }, [pushResize])

  // Initialize terminal once
  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return
    initializedRef.current = true

    const container = containerRef.current

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 15,
      fontFamily: 'Consolas, "Cascadia Code", "Cascadia Mono", "Courier New", monospace',
      fontWeight: '500',
      lineHeight: 1.3,
      letterSpacing: 0,
      scrollback: 100000,
      scrollSensitivity: 3,
      allowProposedApi: true,
      theme: xtermTheme,
      // Windows only: without this, ConPTY resizes don't get xterm's
      // scrollback-preserving compensation (rows added on grow come from
      // scrollback instead of being blank) — resizing the window can then
      // scramble/duplicate visible lines.
      ...(window.app.platform === 'win32' ? { windowsPty: { backend: 'conpty' as const } } : {})
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon((_event, uri) => {
      window.app.openExternal(uri)
    }))
    terminal.loadAddon(new Unicode11Addon())
    terminal.unicode.activeVersion = '11'

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.open(container)

    // Windows clipboard shortcuts:
    // Ctrl+V — xterm would treat as ^V (control char); return false so the browser
    //           fires a paste event instead, which xterm's internal listener handles.
    // Ctrl+C — if text is selected, copy it; otherwise fall through so xterm sends
    //           ^C (SIGINT) to the PTY as normal.
    // Shift+Insert — same "let the browser paste" strategy as Ctrl+V.
    // Shift+Enter — xterm sends plain \r for this exactly like a bare Enter, so
    //           CLI TUIs (Claude Code, Codex) can't tell "newline" from "submit".
    //           Send ESC+CR instead, the sequence those CLIs treat as insert-newline.
    // Bare PageUp/PageDown/Ctrl+Home/Ctrl+End — xterm's own default sends these
    //           as VT sequences to the PTY, which only browses scrollback with
    //           Shift held. Scroll the local viewport instead, matching Windows
    //           Terminal/VSCode convention — but only outside the alternate
    //           screen buffer, so full-screen TUIs (vim, htop, Claude/Codex's own
    //           Ink UI) keep receiving raw PageUp/PageDown/Home/End untouched.
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          const sel = terminal.getSelection()
          if (sel) navigator.clipboard.writeText(sel)
          return false
        }
      }
      if (isBrowserPasteShortcut(e)) return false
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Enter') {
        if (e.type === 'keydown') window.terminal.write(id, '\x1b\r')
        return false
      }
      const scrollAction = classifyScrollKey(e, terminal.buffer.active.type === 'alternate')
      if (scrollAction === 'pageUp') { terminal.scrollPages(-1); return false }
      if (scrollAction === 'pageDown') { terminal.scrollPages(1); return false }
      if (scrollAction === 'top') { terminal.scrollToTop(); return false }
      if (scrollAction === 'bottom') { terminal.scrollToBottom(); return false }
      return true
    })

    // Create PTY (metadata lets remote phone clients list this session)
    window.terminal.create(id, cwd, { name, kind, workspacePath })

    // PTY data -> terminal
    const removeDataListener = window.terminal.onData(({ id: dataId, data }) => {
      if (dataId === id) terminal.write(data)
    })

    // Terminal input -> PTY (guard against writing to dead PTY)
    let ptyAlive = true

    // Clears the pending buffer and resets the placeholder counter together —
    // every place that empties the buffer should renumber from #1 again.
    const clearBufferUnits = () => {
      bufferUnitsRef.current = []
      pasteCounterRef.current = 0
    }

    // Erase everything the buffer has echoed locally (one `\b \b` per visible
    // column) — must run BEFORE the buffer is cleared, since it needs the
    // widths of the units being erased.
    const eraseLocalEcho = () => {
      let cols = 0
      for (const u of bufferUnitsRef.current) cols += u.kind === 'char' ? 1 : u.visibleLen
      if (cols > 0) terminal.write('\b \b'.repeat(cols))
    }

    // Join buffered units back into the real text (placeholders expand to
    // their original paste) and clear the buffer.
    const flushBufferText = () => {
      const real = bufferUnitsRef.current.map(u => (u.kind === 'char' ? u.value : u.real)).join('')
      clearBufferUnits()
      return real
    }

    // Only shell tabs buffer input locally, and only outside the alternate
    // screen buffer — Claude/Codex/PI (as dedicated tabs, or `claude`/`codex`
    // run manually inside a Shell tab) switch to the alt buffer and do their
    // own input parsing/echo; forwarding a synthetic `;`-joined mega-paste to
    // them as literal keystrokes drops lines and corrupts their redraw.
    const handleBufferedInput = (data: string) => {
      if (data === '\r' || data === '\n') {
        eraseLocalEcho()
        const real = flushBufferText()
        window.terminal.write(id, real + '\r')
        return
      }
      if (data === '\x03') {
        // Ctrl+C — cancel the buffered line, forward ^C as usual (no run).
        eraseLocalEcho()
        clearBufferUnits()
        window.terminal.write(id, '\x03')
        return
      }
      if (data === '\x7f' || data === '\b') {
        const units = bufferUnitsRef.current
        const last = units[units.length - 1]
        if (last) {
          terminal.write('\b \b'.repeat(last.kind === 'char' ? 1 : last.visibleLen))
          units.pop()
          if (units.length === 0) pasteCounterRef.current = 0
        }
        return
      }
      // A run of plain printable characters (typing or a short paste) — echo
      // locally and keep the placeholder(s) alive in the buffer.
      if (!/[\x00-\x1f\x7f]/.test(data)) {
        terminal.write(data)
        for (const ch of Array.from(data)) bufferUnitsRef.current.push({ kind: 'char', value: ch })
        return
      }
      // Anything else (arrows, Tab, Ctrl+U/W/R, Home/End…) — don't try to
      // emulate a line editor. Bung sớm: erase the local echo, flush the real
      // text down to the PTY, then forward this input right behind it so the
      // shell's own line editor picks up from the correct real content.
      eraseLocalEcho()
      const real = flushBufferText()
      window.terminal.write(id, real + data)
    }

    const inputDisposable = terminal.onData((data) => {
      if (!ptyAlive) return
      const inAltBuffer = terminal.buffer.active.type === 'alternate'
      if (kind === 'shell' && bufferUnitsRef.current.length > 0) {
        if (inAltBuffer) {
          // A full-screen program (e.g. `claude`/`codex` launched manually,
          // vim, htop) started while a paste was still buffered — erase our
          // placeholder echo and flush the stale buffer as plain text instead
          // of leaving it orphaned.
          eraseLocalEcho()
          const real = flushBufferText()
          window.terminal.write(id, real + data)
          return
        }
        handleBufferedInput(data)
        return
      }
      window.terminal.write(id, data)
    })

    // Stop writing when PTY exits unexpectedly
    const removeExitListener = window.terminal.onExit(({ id: exitId }) => {
      if (exitId === id) ptyAlive = false
    })

    // Auto-run an initial command (e.g. launch/resume a Claude Code session)
    // once the login shell has had a moment to become ready for input.
    if (initialCommand) {
      setTimeout(() => {
        if (ptyAlive) window.terminal.write(id, initialCommand + '\r')
      }, 700)
    }

    // Track scroll position via DOM scroll event on xterm viewport
    const viewport = container.querySelector('.xterm-viewport') as HTMLElement | null
    const handleViewportScroll = () => {
      const isAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY
      setShowScrollDown(!isAtBottom && terminal.buffer.active.baseY > 0)
    }
    viewport?.addEventListener('scroll', handleViewportScroll, { passive: true })
    // Also check after new content is written
    const writeDisposable = terminal.onWriteParsed(() => {
      const isAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY
      setShowScrollDown(!isAtBottom && terminal.buffer.active.baseY > 0)
    })

    // Fit and resize
    setTimeout(() => {
      fitAddon.fit()
      const { cols, rows } = terminal
      pushResize(cols, rows)
      if (isActive) terminal.focus()
    }, 150)

    return () => {
      initializedRef.current = false
      removeDataListener()
      removeExitListener()
      inputDisposable.dispose()
      viewport?.removeEventListener('scroll', handleViewportScroll)
      writeDisposable.dispose()
      window.terminal.kill(id)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [id, cwd])

  // Update theme when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = xtermTheme
    }
  }, [xtermTheme])

  // Handle visibility and focus
  useEffect(() => {
    if (isActive && terminalRef.current && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current!.fit()
        const { cols, rows } = terminalRef.current!
        // Force only if a phone is attached — it may have resized the shared
        // PTY while this tab was hidden. Otherwise dedupe (avoid a spurious
        // ConPTY redraw that corrupts Claude/Codex output on every tab switch).
        pushResize(cols, rows, hasRemoteClientsRef.current)
        terminalRef.current!.focus()
      })
    }
  }, [isActive, id, pushResize])

  // Re-assert our size when the desktop window regains focus or a remote phone
  // client attaches/detaches (it shrinks the shared PTY to its screen size).
  useEffect(() => {
    // Window focus: only force when a phone is connected (it may have resized
    // the shared PTY while we were away). Plain refocus with no phone must not
    // force — a redundant ConPTY resize redraws and corrupts Claude/Codex.
    const onFocus = () => reassertSize(hasRemoteClientsRef.current)
    // Client attach/detach is the one case that always needs a forced re-fit:
    // the phone either just squeezed the PTY or just released it.
    const onClients = (count: number) => {
      hasRemoteClientsRef.current = count > 0
      reassertSize(true)
    }
    window.addEventListener('focus', onFocus)
    const offClients = window.remote?.onClients?.(onClients)
    return () => {
      window.removeEventListener('focus', onFocus)
      offClients?.()
    }
  }, [reassertSize])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current || !isActive) return

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = terminalRef.current
          pushResize(cols, rows)
        }
      })
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [isActive, id, pushResize])

  // Image paste — use capture on window so we intercept before xterm's internal
  // paste listener can call stopPropagation(). Only handle when this terminal is active.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!isActiveRef.current) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue
          const reader = new FileReader()
          reader.onload = async () => {
            const dataUrl = reader.result as string
            onImagePaste?.(dataUrl)
            try {
              const filePath = await window.app.saveImage(dataUrl)
              if (filePath) {
                window.terminal.write(id, filePath)
                terminalRef.current?.write(`\r\n\x1b[36m[Image saved → ${filePath}]\x1b[0m\r\n`)
              } else {
                terminalRef.current?.write('\r\n\x1b[33m[Image paste: could not save file]\x1b[0m\r\n')
              }
            } catch {
              terminalRef.current?.write('\r\n\x1b[33m[Image paste: error saving file]\x1b[0m\r\n')
            }
          }
          reader.readAsDataURL(blob)
          return
        }
      }
    }
    window.addEventListener('paste', handler, true)
    return () => window.removeEventListener('paste', handler, true)
  }, [onImagePaste])

  // Multi-line text paste into a plain shell tab — Windows PowerShell's console
  // host (and most shells without bracketed-paste support) treats every embedded
  // newline as an Enter press, executing each line the instant it lands. Later
  // lines can then error or land in an unintended state (e.g. after a `cd`),
  // which looks like the pasted text got cut off. Instead of sending the joined
  // text straight to the PTY, drop a single-line, editable placeholder (like
  // Claude Code's own input) — the real `; `-joined text lives in
  // `bufferUnitsRef` and is only sent once Enter is pressed (see the input
  // handler above), so the PTY only ever sees it — and echoes it — once. Only
  // for plain `shell` tabs outside the alternate screen buffer — Claude
  // Code/Codex/PI (as dedicated tabs, or run manually inside a Shell tab) need
  // literal multi-line text and already handle bracketed paste themselves.
  // Shared with the right-click paste handler below.
  const pasteTextRef = useRef<(text: string) => void>(() => {})
  pasteTextRef.current = (text: string) => {
    const term = terminalRef.current
    if (!term) return
    const inAltBuffer = term.buffer.active.type === 'alternate'
    const result = joinPastedLines(text)

    if (kind === 'shell' && !inAltBuffer && result && result.lines.length > 10) {
      setPasteModalData({ text })
    } else {
      term.paste(text)
    }
  }

  useEffect(() => {
    if (kind !== 'shell') return
    const handler = (e: ClipboardEvent) => {
      if (!isActiveRef.current) return
      const term = terminalRef.current
      if (term?.buffer.active.type === 'alternate') return

      const items = e.clipboardData?.items
      if (items && Array.from(items).some((item) => item.type.startsWith('image/'))) return
      const text = e.clipboardData?.getData('text/plain')
      if (!text) return
      e.preventDefault()
      e.stopImmediatePropagation()
      pasteTextRef.current(text)
    }
    window.addEventListener('paste', handler, true)
    return () => window.removeEventListener('paste', handler, true)
  }, [id, kind])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = async (e: MouseEvent) => {
      if (!isActiveRef.current) return
      e.preventDefault()
      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          pasteTextRef.current(text)
        }
      } catch {
        // Clipboard read denied/unavailable — no-op, don't break right-click.
      }
    }
    container.addEventListener('contextmenu', handler)
    return () => container.removeEventListener('contextmenu', handler)
  }, [])

  // Drag and drop image
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files) return

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          onImagePaste?.(dataUrl)
          try {
            const filePath = await window.app.saveImage(dataUrl)
            if (filePath) {
              window.terminal.write(id, filePath)
              terminalRef.current?.write(`\r\n\x1b[36m[Image saved → ${filePath}]\x1b[0m\r\n`)
            }
          } catch { /* ignore */ }
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }, [onImagePaste])

  return (
    <div style={{ display: isActive ? 'block' : 'none', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        className="terminal-instance"
        style={{ height: '100%' }}
        onClick={() => { terminalRef.current?.focus() }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      />
      {showScrollDown && (
        <button
          className="scroll-to-bottom-btn"
          onClick={scrollToBottom}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}

      {pasteModalData && (
        <div className="paste-modal-overlay" onClick={() => setPasteModalData(null)}>
          <div className="paste-modal" onClick={e => e.stopPropagation()}>
            <div className="kb-head">
              <h2>Paste Multi-line Text ({modalText.split(/\r\n|\r|\n/).filter(Boolean).length} lines)</h2>
              <button className="kb-close" onClick={() => setPasteModalData(null)} title="Cancel (Esc)">×</button>
            </div>
            <div className="paste-modal-body">
              <textarea
                className="paste-modal-textarea"
                value={modalText}
                onChange={e => setModalText(e.target.value)}
                placeholder="Paste code or text here..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setPasteModalData(null)
                  } else if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    const lines = modalText.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean)
                    const joined = lines.join('; ')
                    
                    // Send chunked to prevent dropped characters on Windows ConPTY
                    const chunkSize = 150
                    let offset = 0
                    const sendNext = () => {
                      if (offset >= joined.length) {
                        window.terminal.write(id, '\r')
                        return
                      }
                      window.terminal.write(id, joined.slice(offset, offset + chunkSize))
                      offset += chunkSize
                      setTimeout(sendNext, 15)
                    }
                    sendNext()
                    setPasteModalData(null)
                  }
                }}
              />
              <div className="paste-modal-warning">
                Warning: Pasting text with multiple lines can be dangerous. You can review/edit the text above. Ctrl+Enter to submit joined with semicolons.
              </div>
            </div>
            <div className="paste-modal-actions">
              <button className="paste-btn paste-btn-cancel" onClick={() => setPasteModalData(null)}>
                Cancel
              </button>
              <button
                className="paste-btn paste-btn-secondary"
                onClick={() => {
                  const chunkSize = 150
                  let offset = 0
                  const sendNext = () => {
                    if (offset >= modalText.length) return
                    window.terminal.write(id, modalText.slice(offset, offset + chunkSize))
                    offset += chunkSize
                    setTimeout(sendNext, 15)
                  }
                  sendNext()
                  setPasteModalData(null)
                }}
              >
                Send with Newlines
              </button>
              <button
                className="paste-btn paste-btn-primary"
                onClick={() => {
                  const lines = modalText.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean)
                  const joined = lines.join('; ')
                  
                  const chunkSize = 150
                  let offset = 0
                  const sendNext = () => {
                    if (offset >= joined.length) {
                      window.terminal.write(id, '\r')
                      return
                    }
                    window.terminal.write(id, joined.slice(offset, offset + chunkSize))
                    offset += chunkSize
                    setTimeout(sendNext, 15)
                  }
                  sendNext()
                  setPasteModalData(null)
                }}
              >
                Send (Join with ;)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
