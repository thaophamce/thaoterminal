import { useState, useEffect } from 'react'

const REPO = 'thaophamce/thaoterminal'
const MAC_INSTALL_CMD = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`
const WIN_INSTALL_CMD = `irm https://raw.githubusercontent.com/${REPO}/main/install.ps1 | iex`

interface Props {
  latest: string | null
  onClose: () => void
}

export function UpdateModal({ latest, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const isWin = window.app.platform === 'win32'

  const winDownloadUrl = latest
    ? `https://github.com/${REPO}/releases/download/v${latest}/ThaoTerminal-Setup-${latest}.exe`
    : `https://github.com/${REPO}/releases`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  const openReleases = () => {
    window.app.openExternal(`https://github.com/${REPO}/releases`)
  }

  const downloadWinRelease = () => {
    window.app.openExternal(winDownloadUrl)
  }

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal upd-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-head">
          <h2>Update ThaoTerminal{latest ? ` → v${latest}` : ''}</h2>
          <button className="kb-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="upd-body">
          {isWin ? (
            <>
              <ol className="upd-steps">
                <li>
                  <b>Copy</b> the PowerShell command below.
                </li>
                <li>
                  Open <b>PowerShell</b>, <b>paste</b> it, and press <b>Enter</b>.
                  It downloads and launches the latest installer.
                </li>
                <li>
                  When it launches, <b>quit ThaoTerminal</b> (Alt+F4) and complete the installer setup.
                </li>
              </ol>

              <div className="upd-cmd" style={{ marginBottom: '16px' }}>
                <code style={{ fontSize: '11.5px' }}>{WIN_INSTALL_CMD}</code>
                <button className={`upd-copy ${copied ? 'done' : ''}`} onClick={() => copy(WIN_INSTALL_CMD)}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              <div className="upd-win-actions" style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="upd-copy"
                  onClick={downloadWinRelease}
                  style={{ flex: 1, textAlign: 'center', background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 'var(--r-md)', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Download Installer (.exe)
                </button>
                <button
                  className="kb-reset"
                  onClick={openReleases}
                  style={{ flex: 1, padding: '10px 16px', border: '1px solid var(--border2)', borderRadius: 'var(--r-md)' }}
                >
                  Open Releases Page
                </button>
              </div>
            </>
          ) : (
            <>
              <ol className="upd-steps">
                <li>
                  <b>Copy</b> the command below.
                </li>
                <li>
                  Open any <b>terminal</b>, <b>paste</b> it, and press <b>Enter</b>.
                  It downloads the latest version into <code>/Applications</code>.
                </li>
                <li>
                  <b>Quit ThaoTerminal</b> (Alt+F4) and <b>open it again</b> —
                  you'll be on the new version.
                </li>
              </ol>

              <div className="upd-cmd">
                <code>{MAC_INSTALL_CMD}</code>
                <button className={`upd-copy ${copied ? 'done' : ''}`} onClick={() => copy(MAC_INSTALL_CMD)}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </>
          )}

          <p className="upd-tip">
            {isWin
              ? "Tip: Make sure to quit the running ThaoTerminal before the installer finishes writing new files."
              : "Tip: you can run it right here in a ThaoTerminal tab — just quit and reopen after it's done."
            }
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


