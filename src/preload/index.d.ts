export interface TerminalAPI {
  create: (id: string, cwd?: string) => Promise<void>
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => void
  kill: (id: string) => Promise<void>
  getCwd: (id: string) => Promise<string>
  getShellName: () => Promise<string>
  onData: (callback: (payload: { id: string; data: string }) => void) => () => void
  onExit: (callback: (payload: { id: string }) => void) => () => void
}

export interface AppAPI {
  getTheme: () => Promise<'dark' | 'light'>
  getHome: () => Promise<string>
  openExternal: (url: string) => Promise<void>
}

export interface WorkspaceAPI {
  openFolder: () => Promise<string | null>
  load: () => Promise<string[] | null>
  save: (paths: string[]) => Promise<void>
  gitBranch: (cwd: string) => Promise<string | null>
}

declare global {
  interface Window {
    terminal: TerminalAPI
    app: AppAPI
    workspace: WorkspaceAPI
  }
}
