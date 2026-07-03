/**
 * Single terminal instance - xterm.js with addons
 * Handles image paste and web links
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTheme } from '../hooks/use-theme'
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

  // Re-fit to THIS window and push the size back to the (shared) PTY. A remote
  // phone client fits the same PTY to its tiny screen; without re-asserting,
  // the desktop stays squeezed at the phone's width — the program reflows to
  // ~40 cols and everything crams into the left half. Only the active terminal
  // is laid out (others are display:none → a fit would compute 0), so guard it.
  // Forced: the PTY's actual size may have been changed by the OTHER client
  // (the phone) without our local cols/rows changing, so the dedupe in
  // pushResize would otherwise skip re-asserting it.
  const reassertSize = useCallback(() => {
    if (!isActiveRef.current) return
    requestAnimationFrame(() => {
      if (!isActiveRef.current || !fitAddonRef.current || !terminalRef.current) return
      fitAddonRef.current.fit()
      const { cols, rows } = terminalRef.current
      pushResize(cols, rows, true)
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
      allowProposedApi: true,
      theme: xtermTheme
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon((_event, uri) => {
      window.app.openExternal(uri)
    }))

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.open(container)

    // Windows clipboard shortcuts:
    // Ctrl+V — xterm would treat as ^V (control char); return false so the browser
    //           fires a paste event instead, which xterm's internal listener handles.
    // Ctrl+C — if text is selected, copy it; otherwise fall through so xterm sends
    //           ^C (SIGINT) to the PTY as normal.
    // Shift+Enter — xterm sends plain \r for this exactly like a bare Enter, so
    //           CLI TUIs (Claude Code, Codex) can't tell "newline" from "submit".
    //           Send ESC+CR instead, the sequence those CLIs treat as insert-newline.
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (e.key === 'v') return false
        if (e.key === 'c' || e.key === 'C') {
          const sel = terminal.getSelection()
          if (sel) navigator.clipboard.writeText(sel)
          return false
        }
      }
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Enter') {
        if (e.type === 'keydown') window.terminal.write(id, '\x1b\r')
        return false
      }
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
    const inputDisposable = terminal.onData((data) => {
      if (ptyAlive) window.terminal.write(id, data)
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
      setTimeout(() => {
        fitAddonRef.current!.fit()
        const { cols, rows } = terminalRef.current!
        // Forced: while this tab was hidden a remote phone client may have
        // resized the shared PTY without our local cols/rows changing.
        pushResize(cols, rows, true)
        terminalRef.current!.focus()
      }, 50)
    }
  }, [isActive, id, pushResize])

  // Re-assert our size when the desktop window regains focus or a remote phone
  // client attaches/detaches (it shrinks the shared PTY to its screen size).
  useEffect(() => {
    window.addEventListener('focus', reassertSize)
    const offClients = window.remote?.onClients?.(reassertSize)
    return () => {
      window.removeEventListener('focus', reassertSize)
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
  // which looks like the pasted text got cut off. Collapse it into one
  // `;`-joined line instead so it runs as a single compound statement. Only for
  // plain `shell` tabs — Claude Code/Codex/PI need literal multi-line text for
  // their prompts, so leave those to xterm's normal (bracketed) paste handling.
  useEffect(() => {
    if (kind !== 'shell') return
    const handler = (e: ClipboardEvent) => {
      if (!isActiveRef.current) return
      const items = e.clipboardData?.items
      if (items && Array.from(items).some((item) => item.type.startsWith('image/'))) return
      const text = e.clipboardData?.getData('text/plain')
      if (!text) return
      const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length < 2) return
      e.preventDefault()
      e.stopImmediatePropagation()
      window.terminal.write(id, lines.join('; '))
    }
    window.addEventListener('paste', handler, true)
    return () => window.removeEventListener('paste', handler, true)
  }, [id, kind])

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
        onClick={() => { terminalRef.current?.focus(); reassertSize() }}
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
    </div>
  )
}
