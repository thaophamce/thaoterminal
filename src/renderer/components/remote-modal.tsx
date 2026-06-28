/**
 * Remote access modal — start a local server, show a QR a phone can scan to
 * view and control every running terminal session over the network.
 */
import { useState, useEffect, useCallback } from 'react'
import type { RemoteStatus } from '../../preload/index.d'

interface Props {
  onClose: () => void
}

export function RemoteModal({ onClose }: Props) {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [tunnel, setTunnel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(() => {
    window.remote.status().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, refresh])

  const start = async () => {
    setBusy(true)
    try { setStatus(await window.remote.start({ tunnel })) } catch { /* ignore */ } finally { setBusy(false) }
  }
  const stop = async () => {
    setBusy(true)
    try { setStatus(await window.remote.stop()) } catch { /* ignore */ } finally { setBusy(false) }
  }
  const copy = () => {
    if (!status?.url) return
    navigator.clipboard.writeText(status.url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  const running = status?.running
  const reach = status?.tunnelUrl ? 'Internet (tunnel)' : status?.lanUrl ? 'Same Wi-Fi only' : '—'

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal rmt-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-head">
          <h2>Remote access {running ? '· on' : '· off'}</h2>
          <button className="kb-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="rmt-body">
          {!running && (
            <>
              <p className="rmt-lead">
                Scan a QR with your phone to view and control every running terminal session.
                The phone must reach this machine (same Wi-Fi, or via a tunnel for anywhere).
              </p>
              <label className="rmt-opt">
                <input type="checkbox" checked={tunnel} onChange={e => setTunnel(e.target.checked)} />
                <span>Enable internet tunnel (uses <code>cloudflared</code> — use from anywhere)</span>
              </label>
              <button className="rmt-start" disabled={busy} onClick={start}>
                {busy ? 'Starting…' : 'Start remote access'}
              </button>
            </>
          )}

          {running && (
            <>
              {status?.qrDataUrl
                ? <img className="rmt-qr" src={status.qrDataUrl} alt="Scan to connect" />
                : <div className="rmt-qr rmt-qr-empty">No reachable address found</div>}

              <div className="rmt-meta">
                <div className="rmt-row"><span className="rmt-k">Reach</span><span>{reach}</span></div>
                {status?.url && (
                  <div className="rmt-row">
                    <span className="rmt-k">URL</span>
                    <code className="rmt-url">{status.url}</code>
                    <button className={`rmt-copy ${copied ? 'done' : ''}`} onClick={copy}>{copied ? '✓' : 'Copy'}</button>
                  </div>
                )}
                {status?.tunnelError && <div className="rmt-warn">⚠ {status.tunnelError}</div>}
              </div>

              <button className="rmt-stop" disabled={busy} onClick={stop}>
                {busy ? 'Stopping…' : 'Stop remote access'}
              </button>
            </>
          )}

          <p className="rmt-sec">
            🔒 Anyone with this URL gets full shell control of this machine. The link carries a
            secret token; don't share it, and stop remote access when you're done.
          </p>
        </div>
      </div>
    </div>
  )
}
