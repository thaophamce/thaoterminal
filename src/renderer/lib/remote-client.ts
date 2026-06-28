/**
 * WebSocket client for the mobile remote page. Mirrors the RPC + event protocol
 * served by src/main/remote-server.ts: request/response via {t:'rpc'} and
 * server-pushed {t:'event'} messages (terminal:data, terminal:exit, session:meta).
 */
export type RemoteEvent = 'terminal:data' | 'terminal:exit' | 'session:meta'
export type ConnState = 'connecting' | 'open' | 'closed'

export class RemoteClient {
  private ws: WebSocket | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
  private listeners = new Map<string, Set<(payload: any) => void>>()
  private stateListeners = new Set<(s: ConnState) => void>()
  private closedByUser = false

  constructor(private token: string) {}

  connect(): void {
    this.closedByUser = false
    this.open()
  }

  private open(): void {
    this.setState('connecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}`)
    this.ws = ws
    ws.onopen = () => this.setState('open')
    ws.onclose = () => {
      this.setState('closed')
      // Reject in-flight calls so the UI doesn't hang.
      for (const { reject } of this.pending.values()) reject(new Error('disconnected'))
      this.pending.clear()
      if (!this.closedByUser) setTimeout(() => this.open(), 1500)
    }
    ws.onmessage = (ev) => {
      let msg: any
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.t === 'rpc') {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if ('error' in msg && msg.error) p.reject(new Error(msg.error))
        else p.resolve(msg.result)
      } else if (msg.t === 'event') {
        this.listeners.get(msg.name)?.forEach((cb) => cb(msg.payload))
      }
    }
  }

  close(): void {
    this.closedByUser = true
    this.ws?.close()
  }

  call<T = any>(method: string, ...args: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'))
        return
      }
      const id = ++this.seq
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ t: 'rpc', id, method, args }))
    })
  }

  on(name: RemoteEvent, cb: (payload: any) => void): () => void {
    let set = this.listeners.get(name)
    if (!set) { set = new Set(); this.listeners.set(name, set) }
    set.add(cb)
    return () => set!.delete(cb)
  }

  onState(cb: (s: ConnState) => void): () => void {
    this.stateListeners.add(cb)
    return () => this.stateListeners.delete(cb)
  }

  private setState(s: ConnState): void {
    this.stateListeners.forEach((cb) => cb(s))
  }
}
