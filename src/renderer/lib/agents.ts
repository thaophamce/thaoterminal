/**
 * Configurable AI agents. The user can turn individual agents on/off; disabled
 * agents are hidden from every "new session" button and skip their keyboard
 * shortcut. The plain shell is always available and not listed here.
 * State is persisted to localStorage. Default: all enabled.
 */
export type AgentKind = 'claude' | 'codex' | 'pi'

export interface AgentMeta {
  id: AgentKind
  label: string
}

export const AGENTS: AgentMeta[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'pi', label: 'PI' }
]

export type AgentState = Record<AgentKind, boolean>

const STORE_KEY = 'taw.agents'

export function loadEnabledAgents(): AgentState {
  let saved: Record<string, boolean> = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    saved = {}
  }
  const out = {} as AgentState
  // Default to enabled: only an explicit `false` turns an agent off.
  AGENTS.forEach(a => { out[a.id] = saved[a.id] !== false })
  return out
}

export function saveEnabledAgents(state: AgentState): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
}

export function resetEnabledAgents(): void {
  localStorage.removeItem(STORE_KEY)
}
