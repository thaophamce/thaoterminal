/**
 * PTY Manager - Manages terminal shell processes via node-pty
 */
import * as pty from 'node-pty'
import os from 'os'
import fs from 'fs'

interface PtyInstance {
  process: pty.IPty
  onDataCallback: (data: string) => void
  initialCwd: string
  lastKnownCwd: string
  createdAt: number
  restartCount: number
}

const MAX_RESTART_ATTEMPTS = 3
const RESTART_DELAY_MS = 1500
const CRASH_WINDOW_MS = 5000

export class PtyManager {
  private instances: Map<string, PtyInstance> = new Map()

  private findShell(): string {
    if (os.platform() === 'win32') return 'powershell.exe'

    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh']
    for (const shell of shells) {
      try {
        if (fs.existsSync(shell) && fs.statSync(shell).isFile()) return shell
      } catch {
        // continue
      }
    }
    return '/bin/sh'
  }

  /**
   * On Windows we pre-define `claude` / `codex` wrapper functions so that typing
   * the bare command by hand behaves like the app's launch buttons: it auto-adds
   * the permission-bypass flag the user always wants. `Get-Command -CommandType
   * Application,ExternalScript` resolves the REAL exe/.cmd/.ps1 (never our own
   * function, so no recursion), and the `-contains` guard makes it idempotent —
   * the button-launched `initialCommand`s already carry the flag and won't get a
   * duplicate. Passed via -EncodedCommand (base64 UTF-16LE) so quoting survives
   * node-pty's argv-to-commandline round-trip intact.
   */
  private winShellArgs(): string[] {
    const setup = [
      "function claude { $c = Get-Command claude -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $c) { Write-Host 'ThaoTerminal: claude not found on PATH'; return }; if ($args -contains '--dangerously-skip-permissions') { & $c.Source @args } else { & $c.Source --dangerously-skip-permissions @args } }",
      "function codex { $c = Get-Command codex -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $c) { Write-Host 'ThaoTerminal: codex not found on PATH'; return }; if ($args -contains '--dangerously-bypass-approvals-and-sandbox') { & $c.Source @args } else { & $c.Source --dangerously-bypass-approvals-and-sandbox @args } }"
    ].join('\n')
    const b64 = Buffer.from(setup, 'utf16le').toString('base64')
    return ['-NoLogo', '-NoExit', '-EncodedCommand', b64]
  }

  create(id: string, onData: (data: string) => void, cwd?: string, restartCount = 0, onExit?: () => void): void {
    this.kill(id)

    const shell = this.findShell()
    const shellArgs = os.platform() === 'win32' ? this.winShellArgs() : ['-l']
    const homeDir = os.homedir()
    const workingDir = cwd || homeDir

    try {
      const env: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) continue
        // Strip the parent Claude Code session markers. If the app was itself
        // launched from within a Claude Code session, these leak in and make
        // every `claude` we spawn think it's a nested child session — which
        // disables transcript persistence, so sessions can't be resumed.
        if (/^CLAUDECODE$|^CLAUDE_CODE_|^CLAUDE_EFFORT$|^AI_AGENT$/.test(key)) continue
        env[key] = value
      }
      env.TERM = 'xterm-256color'
      env.COLORTERM = 'truecolor'
      env.LANG = env.LANG || 'en_US.UTF-8'
      env.HOME = homeDir
      env.SHELL = shell

      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: workingDir,
        env
      })

      ptyProcess.onData(onData)

      ptyProcess.onExit(({ exitCode }) => {
        console.log(`[PTY] Terminal ${id} exited (code ${exitCode})`)
        const instance = this.instances.get(id)
        // Only treat a NON-ZERO exit shortly after spawn as a crash. A clean
        // exit (code 0 — e.g. the user typed `exit` right away) must close the
        // tab, not resurrect the shell.
        const wasCrash = instance && exitCode !== 0 && (Date.now() - instance.createdAt) < CRASH_WINDOW_MS
        this.instances.delete(id)

        if (wasCrash && instance && instance.restartCount < MAX_RESTART_ATTEMPTS) {
          // Use last known cwd so restart preserves user's current directory
          const restartCwd = instance.lastKnownCwd || instance.initialCwd
          setTimeout(() => {
            this.create(id, instance.onDataCallback, restartCwd, instance.restartCount + 1, onExit)
          }, RESTART_DELAY_MS)
        } else {
          onExit?.()
        }
      })

      this.instances.set(id, {
        process: ptyProcess,
        onDataCallback: onData,
        initialCwd: workingDir,
        lastKnownCwd: workingDir,
        createdAt: Date.now(),
        restartCount
      })

      // Periodically track cwd so we can restore it on crash restart
      this.trackCwd(id)
    } catch (error) {
      onData(`\r\n\x1b[31mError: Failed to spawn shell (${shell})\x1b[0m\r\n`)
      if (restartCount < MAX_RESTART_ATTEMPTS) {
        setTimeout(() => this.create(id, onData, workingDir, restartCount + 1, onExit), RESTART_DELAY_MS)
      } else {
        onExit?.()
      }
    }
  }

  write(id: string, data: string): void {
    this.instances.get(id)?.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.instances.get(id)?.process.resize(cols, rows)
  }

  kill(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      this.instances.delete(id)
      this.gracefulKill(instance.process)
    }
  }

  /**
   * Gracefully kill PTY. First try to exit any foreground TUI (Claude/Codex:
   * Ctrl-C twice) so it flushes its session transcript to disk, then exit the
   * shell, then force kill after a grace window if still alive.
   */
  private gracefulKill(proc: pty.IPty): void {
    this.sendQuitSequence(proc)
    const forceKillTimer = setTimeout(() => {
      try { proc.kill() } catch { /* already dead */ }
    }, 2500)
    proc.onExit(() => clearTimeout(forceKillTimer))
  }

  /**
   * Ctrl-C twice exits Claude Code / Codex TUIs (letting them persist their
   * session); for a plain shell it just cancels the current line. Then `exit`
   * closes the shell. Harmless either way.
   */
  private sendQuitSequence(proc: pty.IPty): void {
    const w = (s: string) => { try { proc.write(s) } catch { /* dead */ } }
    w('\x03')
    setTimeout(() => w('\x03'), 150)
    setTimeout(() => w('exit\n'), 550)
  }

  /**
   * Gracefully shut down every PTY (used on app quit): send the quit sequence
   * to all, wait for them to flush/exit, then force-kill any survivors.
   * Resolves once done so the caller can quit safely.
   */
  async gracefulShutdownAll(timeoutMs = 1500): Promise<void> {
    const procs = Array.from(this.instances.values()).map((i) => i.process)
    this.instances.clear()
    if (procs.length === 0) return
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const w = (p: pty.IPty, s: string) => { try { p.write(s) } catch { /* dead */ } }

    procs.forEach((p) => w(p, '\x03'))
    await delay(150)
    procs.forEach((p) => w(p, '\x03'))
    await delay(400)
    procs.forEach((p) => w(p, 'exit\n'))
    await delay(timeoutMs)
    procs.forEach((p) => { try { p.kill() } catch { /* dead */ } })
  }

  /**
   * Periodically update lastKnownCwd while PTY is alive,
   * so crash restart can use the actual cwd instead of initial cwd.
   */
  private trackCwd(id: string): void {
    const interval = setInterval(async () => {
      const instance = this.instances.get(id)
      if (!instance) {
        clearInterval(interval)
        return
      }
      try {
        const cwd = await this.resolveCwd(instance)
        if (cwd) instance.lastKnownCwd = cwd
      } catch {
        // ignore - process may have just exited
      }
    }, 5000)
  }

  private async resolveCwd(instance: PtyInstance): Promise<string | null> {
    const pid = instance.process.pid
    try {
      if (os.platform() === 'darwin') {
        // Async execFile — the old execSync blocked the main process for up to
        // 1s per terminal every 5s while lsof ran.
        const { execFile } = await import('child_process')
        const output = await new Promise<string>((resolve) => {
          execFile('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], { timeout: 1000 }, (err, stdout) => {
            resolve(err ? '' : stdout)
          })
        })
        // -Fn output: lines prefixed with 'n' carry the path.
        const line = output.split('\n').find((l) => l.startsWith('n'))
        if (line) return line.slice(1).trim() || null
      } else if (os.platform() === 'linux') {
        const cwdLink = `/proc/${pid}/cwd`
        if (fs.existsSync(cwdLink)) return fs.readlinkSync(cwdLink)
      }
    } catch {
      // fallback
    }
    return null
  }

  getShellName(): string {
    const shell = this.findShell()
    // Extract just the name: /bin/zsh -> zsh, powershell.exe -> powershell
    return shell.split('/').pop()?.replace('.exe', '') || 'shell'
  }

  async getCwd(id: string): Promise<string> {
    const instance = this.instances.get(id)
    if (!instance) return os.homedir()

    const cwd = await this.resolveCwd(instance)
    return cwd || instance.lastKnownCwd || instance.initialCwd
  }
}
