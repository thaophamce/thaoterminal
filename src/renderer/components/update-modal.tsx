/**
 * Update guide. Instead of self-updating, we show the user a one-line install
 * command to copy, paste into any terminal, and run. The installer downloads
 * the latest release into /Applications; the user then quits TawTerminal and
 * reopens it to pick up the new version.
 */
import { useState, useEffect } from 'react'

const REPO = 'tawgroup/taw-terminal'
const INSTALL_CMD = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`

interface Props {
  latest: string | null
  onClose: () => void
}

export function UpdateModal({ latest, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = () => {
    navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal upd-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-head">
          <h2>Update TawTerminal{latest ? ` → v${latest}` : ''}</h2>
          <button className="kb-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="upd-body">
          <ol className="upd-steps">
            <li>
              <b>Copy</b> the command below.
            </li>
            <li>
              Open any <b>terminal</b>, <b>paste</b> it, and press <b>Enter</b>.
              It downloads the latest version into <code>/Applications</code>.
            </li>
            <li>
              When it finishes, <b>quit TawTerminal</b> (⌘Q) and <b>open it again</b> —
              you'll be on the new version.
            </li>
          </ol>

          <div className="upd-cmd">
            <code>{INSTALL_CMD}</code>
            <button className={`upd-copy ${copied ? 'done' : ''}`} onClick={copy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <p className="upd-tip">
            Tip: you can run it right here in a TawTerminal tab — just quit and reopen
            after it's done.
          </p>
        </div>

        <div className="kb-foot">
          <span className="kb-hint">No data is lost — your workspaces and tabs are restored on relaunch.</span>
          <button className="kb-reset" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
