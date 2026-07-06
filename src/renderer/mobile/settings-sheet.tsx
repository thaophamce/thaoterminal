/**
 * SettingsSheet — bottom sheet with viewing preferences (text size, keep
 * screen on, haptics, fullscreen) and session details. Pure client-side:
 * nothing here touches the desktop or the protocol.
 */
import { useEffect, useState } from 'react'
import { KIND_INFO, shortPath, type TerminalMeta } from './ui'

interface Props {
  meta: TerminalMeta
  fontSize: number
  onFontSize: (n: number) => void
  keepAwake: boolean
  onKeepAwake: (b: boolean) => void
  haptics: boolean
  onHaptics: (b: boolean) => void
  onClose: () => void
}

const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
const hapticsSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator

export function SettingsSheet({ meta, fontSize, onFontSize, keepAwake, onKeepAwake, haptics, onHaptics, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)

  const close = () => {
    setClosing(true)
    setTimeout(onClose, 200)
  }

  // Keep the switch in sync when the user exits fullscreen via system gesture.
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className={`mv-sheet-root${closing ? ' closing' : ''}`}>
      <div className="mv-sheet-backdrop" onClick={close} />
      <div className="mv-sheet" role="dialog" aria-modal="true" aria-label="Session settings">
        <span className="mv-sheet-grab" aria-hidden />
        <h2 className="mv-sheet-title">Settings</h2>

        <div className="mv-set-row">
          <div className="mv-set-info">
            <span className="mv-set-name">Text size</span>
            <span className="mv-set-sub">Terminal font size</span>
          </div>
          <div className="mv-stepper">
            <button aria-label="Smaller text" disabled={fontSize <= 10} onClick={() => onFontSize(Math.max(10, fontSize - 1))}>
              −
            </button>
            <span aria-live="polite">{fontSize}</span>
            <button aria-label="Larger text" disabled={fontSize >= 20} onClick={() => onFontSize(Math.min(20, fontSize + 1))}>
              +
            </button>
          </div>
        </div>

        <div className="mv-set-row">
          <div className="mv-set-info">
            <span className="mv-set-name">Keep screen on</span>
            <span className="mv-set-sub">
              {wakeLockSupported ? 'Stops the phone from sleeping' : 'Needs HTTPS (use the tunnel)'}
            </span>
          </div>
          <Switch checked={keepAwake && wakeLockSupported} disabled={!wakeLockSupported} onChange={onKeepAwake} label="Keep screen on" />
        </div>

        {hapticsSupported && (
          <div className="mv-set-row">
            <div className="mv-set-info">
              <span className="mv-set-name">Haptic feedback</span>
              <span className="mv-set-sub">Vibrate on helper keys</span>
            </div>
            <Switch checked={haptics} onChange={onHaptics} label="Haptic feedback" />
          </div>
        )}

        <div className="mv-set-row">
          <div className="mv-set-info">
            <span className="mv-set-name">Fullscreen</span>
            <span className="mv-set-sub">Hide the browser chrome</span>
          </div>
          <Switch checked={fullscreen} onChange={toggleFullscreen} label="Fullscreen" />
        </div>

        <div className="mv-set-session">
          <h3>Session</h3>
          <dl>
            <div>
              <dt>Agent</dt>
              <dd>{KIND_INFO[meta.kind].label}</dd>
            </div>
            <div>
              <dt>Directory</dt>
              <dd title={meta.cwd}>{meta.cwd ? shortPath(meta.cwd) : '—'}</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd title={meta.workspacePath}>{meta.workspacePath ? shortPath(meta.workspacePath) : '—'}</dd>
            </div>
          </dl>
        </div>

        <button className="mv-sheet-done" onClick={close}>
          Done
        </button>
      </div>
    </div>
  )
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (b: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`mv-switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="mv-switch-knob" aria-hidden />
    </button>
  )
}
