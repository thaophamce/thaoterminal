/**
 * MenuBar - classic "File Edit View Window Help" dropdown menu, rendered next
 * to the titlebar brand button. Actions that depend on WorkspaceLayout state
 * (spawn terminal, add folder, toggle sidebar...) are read from a ref bridge
 * kept in sync by WorkspaceLayout every render; window/clipboard/quit actions
 * go straight through window.app.* since they don't depend on any React state.
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentState } from '../lib/agents'
import type { Binding } from '../lib/keybindings'
import { formatCombo } from '../lib/keybindings'

export interface MenuActions {
  run: (actionId: string) => void
  openKeybindings: () => void
  openPalette: () => void
  checkForUpdates: () => void
  viewReleases: () => void
  agents: AgentState
  bindings: Binding[]
}

interface MenuItemDef {
  label: string
  onClick: () => void
  accel?: string
}

type MenuDef = { id: string; label: string; items: (MenuItemDef | 'sep')[] }

function accelFor(bindings: Binding[], actionId: string): string | undefined {
  const b = bindings.find(b => b.id === actionId)
  return b ? formatCombo(b.combo) : undefined
}

export function MenuBar({ actionsRef, onAbout }: { actionsRef: React.MutableRefObject<MenuActions>; onAbout: () => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const { run, openKeybindings, openPalette, checkForUpdates, viewReleases, agents, bindings } = actionsRef.current

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'New Terminal', onClick: () => run('newTerminal'), accel: accelFor(bindings, 'newTerminal') },
        'sep',
        { label: 'Add Workspace Folder', onClick: () => run('addFolder'), accel: accelFor(bindings, 'addFolder') },
        'sep',
        { label: 'Close Terminal', onClick: () => run('closeTerminal'), accel: accelFor(bindings, 'closeTerminal') },
        'sep',
        { label: 'Exit', onClick: () => window.app.quit() }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Copy', onClick: () => window.app.copy() },
        { label: 'Paste', onClick: () => window.app.paste() }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Toggle Sidebar', onClick: () => run('toggleSidebar'), accel: accelFor(bindings, 'toggleSidebar') },
        'sep',
        { label: 'Command Palette', onClick: openPalette, accel: 'Ctrl+K' }
      ]
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        { label: 'Minimize', onClick: () => window.app.minimize() },
        { label: 'Maximize / Restore', onClick: () => window.app.toggleMaximize() },
        'sep',
        { label: 'Close Window', onClick: () => window.app.closeWindow() }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'About ThaoTerminal', onClick: onAbout },
        { label: 'Check for Updates', onClick: checkForUpdates },
        { label: 'View Releases', onClick: viewReleases },
        'sep',
        { label: 'Keyboard Shortcuts', onClick: openKeybindings }
      ]
    }
  ]

  return (
    <div className="menu-bar" ref={rootRef}>
      {menus.map(menu => (
        <div key={menu.id} className="menu-item-wrap">
          <button
            className={`menu-item ${openMenu === menu.id ? 'open' : ''}`}
            onClick={() => setOpenMenu(m => (m === menu.id ? null : menu.id))}
            onMouseEnter={() => setOpenMenu(m => (m !== null && m !== menu.id ? menu.id : m))}
          >
            {menu.label}
          </button>
          {openMenu === menu.id && (
            <div className="menu-dropdown">
              {menu.items.map((item, i) =>
                item === 'sep' ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={item.label}
                    className="menu-dropdown-item"
                    onClick={() => { item.onClick(); setOpenMenu(null) }}
                  >
                    <span>{item.label}</span>
                    {item.accel && <span className="menu-accel">{item.accel}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
