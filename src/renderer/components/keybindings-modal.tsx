/**
 * Settings modal — left-nav tabs: Agents (enable/disable per-agent sessions),
 * Shortcuts (rebind keyboard combos), Appearance (pick a theme directly).
 * Jump (⌘1–9) is shown as fixed info in Shortcuts.
 */
import { useState, useEffect } from 'react'
import { Binding, eventToCombo, formatCombo } from '../lib/keybindings'
import { AGENTS, AgentKind, AgentState } from '../lib/agents'
import { ClaudeIcon, CodexIcon, PiIcon } from './icons'
import { useTheme } from '../hooks/use-theme'

const AGENT_ICONS: Record<AgentKind, (p: { size?: number }) => JSX.Element> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
  pi: PiIcon
}

type SettingsTab = 'agents' | 'shortcuts' | 'appearance'

interface Props {
  bindings: Binding[]
  onChange: (id: string, combo: string) => void
  onReset: () => void
  agents: AgentState
  onToggleAgent: (id: AgentKind) => void
  onResetAgents: () => void
  onClose: () => void
}

export function KeybindingsModal({ bindings, onChange, onReset, agents, onToggleAgent, onResetAgents, onClose }: Props) {
  const [tab, setTab] = useState<SettingsTab>('agents')
  const [capturingId, setCapturingId] = useState<string | null>(null)
  const { themeIndex, themeList, setTheme } = useTheme()

  // While capturing, the next key combo becomes the binding
  useEffect(() => {
    if (!capturingId) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapturingId(null); return }
      const combo = eventToCombo(e)
      if (!combo) return // modifier-only, keep waiting
      onChange(capturingId, combo)
      setCapturingId(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturingId, onChange])

  // Detect duplicate combos to warn the user
  const counts: Record<string, number> = {}
  bindings.forEach(b => { counts[b.combo] = (counts[b.combo] || 0) + 1 })

  const NAV: { id: SettingsTab; label: string }[] = [
    { id: 'agents', label: 'Agents' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'appearance', label: 'Appearance' }
  ]

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-head">
          <h2>Settings</h2>
          <button className="kb-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="kb-body">
          <div className="kb-nav">
            {NAV.map(n => (
              <button
                key={n.id}
                className={`kb-nav-item ${tab === n.id ? 'active' : ''}`}
                onClick={() => setTab(n.id)}
              >
                {n.label}
              </button>
            ))}
          </div>

          <div className="kb-panel">
            {tab === 'agents' && (
              <>
                <div className="kb-section-head">
                  <span>Agents</span>
                  <button className="kb-reset" onClick={onResetAgents}>Enable all</button>
                </div>
                <div className="kb-agents">
                  {AGENTS.map(a => {
                    const Icon = AGENT_ICONS[a.id]
                    const on = agents[a.id]
                    return (
                      <button
                        key={a.id}
                        className={`kb-agent ${a.id} ${on ? 'on' : 'off'}`}
                        onClick={() => onToggleAgent(a.id)}
                        title={on ? `Disable ${a.label}` : `Enable ${a.label}`}
                      >
                        <span className="kb-agent-ic"><Icon size={14} /></span>
                        <span className="kb-agent-name">{a.label}</span>
                        <span className={`kb-switch ${on ? 'on' : 'off'}`}><span className="kb-knob" /></span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {tab === 'shortcuts' && (
              <>
                <div className="kb-section-head">
                  <span>Keyboard Shortcuts</span>
                </div>
                <div className="kb-list">
                  {bindings.map(b => (
                    <div className="kb-row" key={b.id}>
                      <span className="kb-label">{b.label}</span>
                      {counts[b.combo] > 1 && <span className="kb-dup" title="Used by another action">conflict</span>}
                      <button
                        className={`kb-combo ${capturingId === b.id ? 'capturing' : ''}`}
                        onClick={() => setCapturingId(b.id)}
                        title="Click, then press the new shortcut"
                      >
                        {capturingId === b.id ? 'Press keys… (Esc to cancel)' : formatCombo(b.combo)}
                      </button>
                    </div>
                  ))}

                  <div className="kb-row fixed">
                    <span className="kb-label">Jump to terminal 1–9</span>
                    <span className="kb-combo static">Ctrl+1 … Ctrl+9</span>
                  </div>
                </div>
                <div className="kb-foot">
                  <span className="kb-hint">Click a shortcut, then press the new key combo.</span>
                  <button className="kb-reset" onClick={onReset}>Reset to defaults</button>
                </div>
              </>
            )}

            {tab === 'appearance' && (
              <>
                <div className="kb-section-head">
                  <span>Theme</span>
                </div>
                <div className="theme-swatches">
                  {themeList.map((t, i) => (
                    <button
                      key={t.name}
                      className={`theme-swatch ${i === themeIndex ? 'active' : ''}`}
                      onClick={() => setTheme(i)}
                      title={t.name}
                    >
                      <span className="swatch-dot" style={{ background: t.background, boxShadow: `inset 0 0 0 2px ${t.accent}` }} />
                      <span className="swatch-name">{t.name}</span>
                      {i === themeIndex && <span className="swatch-check">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
