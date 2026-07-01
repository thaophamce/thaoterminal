/**
 * ThaoTerminal - Main App
 * Multi-tab terminal with split panes, image paste, and themes
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { WorkspaceLayout } from './components/workspace-layout'
import { MenuBar, type MenuActions } from './components/menu-bar'
import { ThemeProvider, useTheme } from './hooks/use-theme'
import { ImageOverlay } from './components/image-overlay'

function AppContent() {
  const { theme, themeName, cycleTheme } = useTheme()
  const [pastedImage, setPastedImage] = useState<string | null>(null)
  const [versionPopup, setVersionPopup] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const brandRef = useRef<HTMLButtonElement>(null)
  const menuActionsRef = useRef<MenuActions>({
    run: () => {},
    openKeybindings: () => {},
    checkForUpdates: () => {},
    viewReleases: () => {},
    agents: { claude: false, codex: false, pi: false },
    bindings: []
  })

  const handleImagePaste = useCallback((dataUrl: string) => {
    setPastedImage(dataUrl)
  }, [])

  // Sync titleBarOverlay color with current theme (Windows only, no-op on other platforms)
  useEffect(() => {
    window.app.setTitleBarOverlay({ color: theme.background, symbolColor: theme.foreground })
  }, [theme.background, theme.foreground])

  const handleBrandClick = useCallback(async () => {
    if (!version) {
      const v = await window.app.getVersion()
      setVersion(v)
    }
    setVersionPopup(p => !p)
  }, [version])

  // Close popup when clicking outside
  useEffect(() => {
    if (!versionPopup) return
    const handler = (e: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) {
        setVersionPopup(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [versionPopup])

  return (
    <div
      className="app"
      style={{
        background: theme.background,
        color: theme.foreground,
        '--accent': theme.accent,
        '--border': theme.border,
        '--tab-bg': theme.tabBg,
        '--tab-active-bg': theme.tabActiveBg,
        '--hover': theme.hover,
        '--drag-region-height': '38px'
      } as React.CSSProperties}
    >
      {/* Title bar drag region */}
      <div className="titlebar">
        <div className="titlebar-drag" />
        <div className="titlebar-left">
          <button
            ref={brandRef}
            className="titlebar-brand"
            onClick={handleBrandClick}
            title="About ThaoTerminal"
          >
            ThaoTerminal
          </button>
          {versionPopup && (
            <div className="titlebar-version-popup">
              <div className="tvp-name">ThaoTerminal</div>
              <div className="tvp-ver">Version {version ?? '...'}</div>
            </div>
          )}
          <MenuBar actionsRef={menuActionsRef} onAbout={handleBrandClick} />
        </div>
        <button className="titlebar-theme-btn" onClick={cycleTheme} title={`Theme: ${themeName}`}>
          ◐
        </button>
      </div>

      {/* Main content */}
      <WorkspaceLayout onImagePaste={handleImagePaste} menuActionsRef={menuActionsRef} />

      {/* Image overlay when pasted */}
      {pastedImage && (
        <ImageOverlay src={pastedImage} onClose={() => setPastedImage(null)} />
      )}
    </div>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
