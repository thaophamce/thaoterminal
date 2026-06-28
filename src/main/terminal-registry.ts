/**
 * Terminal registry — the single source of truth about live terminals, shared
 * between the desktop window and any remote (phone) clients.
 *
 * The desktop renderer still owns the *layout* (which tabs/folders), but the PTY
 * processes and their recent output live here so a remote client can:
 *   - list what sessions exist (`list()`),
 *   - replay the current screen + recent scrollback on attach (`buffer()`),
 *   - receive live output and exits via events.
 *
 * index.ts pumps PTY output through `pushData`; both the Electron window and the
 * remote server subscribe to the same events, so output fans out to every client.
 */
import { EventEmitter } from 'events'

export interface TerminalMeta {
  id: string
  name: string
  kind: 'shell' | 'claude' | 'codex' | 'pi' | 'tawx'
  cwd: string
  workspacePath: string
}

/** Keep this much recent output per terminal so a phone can redraw the screen. */
const BUFFER_CAP_BYTES = 256 * 1024

interface Entry {
  meta: TerminalMeta
  chunks: string[]
  size: number
}

class TerminalRegistry extends EventEmitter {
  private entries = new Map<string, Entry>()

  /** Register (or update) a terminal's metadata. Emits `meta` for live clients. */
  register(meta: Partial<TerminalMeta> & { id: string }): void {
    const existing = this.entries.get(meta.id)
    const next: TerminalMeta = {
      id: meta.id,
      name: meta.name ?? existing?.meta.name ?? 'terminal',
      kind: meta.kind ?? existing?.meta.kind ?? 'shell',
      cwd: meta.cwd ?? existing?.meta.cwd ?? '',
      workspacePath: meta.workspacePath ?? existing?.meta.workspacePath ?? ''
    }
    if (existing) existing.meta = next
    else this.entries.set(meta.id, { meta: next, chunks: [], size: 0 })
    this.emit('meta')
  }

  rename(id: string, name: string): void {
    const e = this.entries.get(id)
    if (!e) return
    e.meta.name = name
    this.emit('meta')
  }

  /** Append PTY output to the ring buffer and fan out to subscribers. */
  pushData(id: string, data: string): void {
    const e = this.entries.get(id)
    if (e) {
      e.chunks.push(data)
      e.size += data.length
      while (e.size > BUFFER_CAP_BYTES && e.chunks.length > 1) {
        e.size -= e.chunks.shift()!.length
      }
    }
    this.emit('data', { id, data })
  }

  markExit(id: string): void {
    this.entries.delete(id)
    this.emit('exit', { id })
    this.emit('meta')
  }

  /** Drop a terminal without emitting an exit (used when the desktop kills it). */
  remove(id: string): void {
    if (this.entries.delete(id)) this.emit('meta')
  }

  list(): TerminalMeta[] {
    return Array.from(this.entries.values()).map((e) => e.meta)
  }

  buffer(id: string): string {
    return this.entries.get(id)?.chunks.join('') ?? ''
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }
}

export const terminalRegistry = new TerminalRegistry()
