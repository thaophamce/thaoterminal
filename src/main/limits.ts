/**
 * Rate-limit ("quota") monitor for Claude Code and Codex.
 *
 * This is the *rolling rate limit* (how much of the 5h / weekly window is used),
 * which is different from the per-day token/cost tally in index.ts. There is no
 * local file that holds the live %, so we ask each provider:
 *
 *  - Claude: send a 1-token request to /v1/messages with the Claude Code OAuth
 *    token; the response carries `anthropic-ratelimit-unified-{5h,7d}-*` headers.
 *  - Codex:  call the ChatGPT backend `/wham/usage` with the Codex OAuth token;
 *    the body carries `rate_limit.primary_window` (5h) + `secondary_window` (7d).
 *
 * Approach ported from PhamMinhKha/TrayLink (Rust → TS).
 */
import os from 'os'
import fs from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { createHash } from 'crypto'

export interface LimitWindow {
  label: string
  usedPercent: number
  resetAt: number // unix seconds, 0 if unknown
  resetMinutes: number
  status: string
}

export interface ProviderLimits {
  ok: boolean
  /** null when the provider was reachable but reported nothing for that window */
  session5h: LimitWindow | null
  weekly7d: LimitWindow | null
  plan?: string | null
  error?: string | null
  updatedAt?: string
}

export interface LimitsSnapshot {
  claude: ProviderLimits
  codex: ProviderLimits
}

function home(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir()
}

function resetMinutes(resetAt: number): number {
  if (!resetAt || resetAt <= 0) return 0
  return Math.max(0, Math.round((resetAt - Date.now() / 1000) / 60))
}

const REQUEST_TIMEOUT_MS = 15000

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
}

// --- Claude ---------------------------------------------------------------

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(home(), '.claude')
}

/** `Claude Code-credentials-<sha256(configDir)[:8]>` — Claude Code v2 keychain target. */
function hashedKeychainTarget(): string {
  const digest = createHash('sha256').update(claudeConfigDir()).digest('hex')
  return `Claude Code-credentials-${digest.slice(0, 8)}`
}

function extractClaudeToken(raw: string): string | null {
  try {
    const j = JSON.parse(raw)
    const fromNode = (n: any): string | null => {
      if (!n || typeof n !== 'object') return null
      const direct = n.claudeAiOauth?.accessToken || n.accessToken || n.access_token
      if (typeof direct === 'string' && direct) return direct
      for (const v of Object.values(n)) {
        const found = fromNode(v)
        if (found) return found
      }
      return null
    }
    const t = fromNode(j)
    if (t) return t
  } catch { /* not json — fall through */ }
  const needle = '"accessToken":"'
  const i = raw.indexOf(needle)
  if (i !== -1) {
    const rest = raw.slice(i + needle.length)
    const end = rest.indexOf('"')
    if (end !== -1) return rest.slice(0, end)
  }
  return null
}

function readClaudeTokenFromFile(path: string): string | null {
  try {
    return extractClaudeToken(fs.readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function readClaudeTokenFromKeychain(): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null)
  const services = ['Claude Code-credentials', hashedKeychainTarget(), 'Claude Code', 'Claude']
  const tryOne = (svc: string): Promise<string | null> =>
    new Promise((resolve) => {
      execFile('security', ['find-generic-password', '-s', svc, '-w'], (err, stdout) => {
        if (err || !stdout) return resolve(null)
        resolve(extractClaudeToken(stdout.trim()))
      })
    })
  return services.reduce<Promise<string | null>>(
    (acc, svc) => acc.then((found) => found || tryOne(svc)),
    Promise.resolve(null)
  )
}

async function readClaudeToken(): Promise<string | null> {
  const env = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()
  if (env) return env
  return (
    readClaudeTokenFromFile(join(claudeConfigDir(), '.credentials.json')) ||
    readClaudeTokenFromFile(join(home(), '.claude.json')) ||
    (await readClaudeTokenFromKeychain())
  )
}

function claudePercent(v: string | null): number {
  const raw = v == null ? NaN : parseFloat(v.trim())
  if (!isFinite(raw)) return 0
  const pct = raw <= 1 ? raw * 100 : raw
  return Math.min(100, Math.max(0, pct))
}

function claudeWindow(headers: Headers, prefix: string, label: string): LimitWindow {
  const resetAt = Math.max(0, Math.floor(parseFloat(headers.get(`${prefix}-reset`) || '0') || 0))
  return {
    label,
    usedPercent: claudePercent(headers.get(`${prefix}-utilization`)),
    resetAt,
    resetMinutes: resetMinutes(resetAt),
    status: headers.get(`${prefix}-status`) || 'unknown'
  }
}

async function getClaudeLimits(): Promise<ProviderLimits> {
  let token: string | null
  try {
    token = await readClaudeToken()
  } catch {
    token = null
  }
  if (!token) {
    return { ok: false, session5h: null, weekly7d: null, error: 'No Claude Code token. Run `claude login`.' }
  }
  try {
    const res = await fetchWithTimeout(CLAUDE_API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'claude-code/2.1.5',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20'
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
    })
    if (!res.ok) {
      const msg =
        res.status === 401 || res.status === 403
          ? 'Claude token expired. Run `claude login`.'
          : `Claude quota check failed (HTTP ${res.status}).`
      return { ok: false, session5h: null, weekly7d: null, error: msg }
    }
    return {
      ok: true,
      session5h: claudeWindow(res.headers, 'anthropic-ratelimit-unified-5h', '5h'),
      weekly7d: claudeWindow(res.headers, 'anthropic-ratelimit-unified-7d', '7d'),
      updatedAt: new Date().toISOString()
    }
  } catch (e: any) {
    return { ok: false, session5h: null, weekly7d: null, error: e?.message || 'Claude quota request failed.' }
  }
}

// --- Codex ----------------------------------------------------------------

const CODEX_REFRESH_ENDPOINT = 'https://auth.openai.com/oauth/token'
const CODEX_REFRESH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CODEX_USAGE_DEFAULT_BASE = 'https://chatgpt.com/backend-api'

interface CodexCreds {
  accessToken: string
  refreshToken: string
  idToken?: string
  accountId?: string
  lastRefresh?: number // ms
}

function codexHome(): string {
  return join(home(), '.codex')
}

function parseJwt(token?: string): any | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    let p = parts[1]
    p += '='.repeat((4 - (p.length % 4)) % 4)
    return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function accountIdFromIdToken(idToken?: string): string | undefined {
  const payload = parseJwt(idToken)
  if (!payload) return undefined
  const auth = payload['https://api.openai.com/auth']
  return auth?.chatgpt_account_id || payload.chatgpt_account_id || undefined
}

function planFromIdToken(idToken?: string): string | undefined {
  const payload = parseJwt(idToken)
  if (!payload) return undefined
  const auth = payload['https://api.openai.com/auth']
  return auth?.chatgpt_plan_type || payload.chatgpt_plan_type || undefined
}

function readCodexCreds(): CodexCreds | null {
  let raw: string
  try {
    raw = fs.readFileSync(join(codexHome(), 'auth.json'), 'utf8')
  } catch {
    return null
  }
  let j: any
  try {
    j = JSON.parse(raw)
  } catch {
    return null
  }
  const tokens = j.tokens || {}
  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token
  if (!accessToken || !refreshToken) return null
  return {
    accessToken,
    refreshToken,
    idToken: tokens.id_token,
    accountId: tokens.account_id || accountIdFromIdToken(tokens.id_token),
    lastRefresh: j.last_refresh ? Date.parse(j.last_refresh) : undefined
  }
}

function refreshDue(creds: CodexCreds): boolean {
  if (!creds.lastRefresh) return true
  return Date.now() - creds.lastRefresh > 8 * 24 * 3600 * 1000
}

async function refreshCodex(creds: CodexCreds): Promise<CodexCreds> {
  const res = await fetchWithTimeout(CODEX_REFRESH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-cache, no-store, max-age=0', pragma: 'no-cache' },
    body: JSON.stringify({
      client_id: CODEX_REFRESH_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      scope: 'openid profile email'
    })
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Codex refresh token expired. Sign in to Codex again.')
    throw new Error(`Codex token refresh failed (HTTP ${res.status}).`)
  }
  const j: any = await res.json()
  const next: CodexCreds = {
    accessToken: j.access_token || creds.accessToken,
    refreshToken: j.refresh_token || creds.refreshToken,
    idToken: j.id_token || creds.idToken,
    accountId: creds.accountId || accountIdFromIdToken(j.id_token),
    lastRefresh: Date.now()
  }
  // Persist refreshed tokens back so the Codex CLI keeps working too.
  try {
    const authPath = join(codexHome(), 'auth.json')
    const existing = JSON.parse(fs.readFileSync(authPath, 'utf8'))
    existing.tokens = {
      ...(existing.tokens || {}),
      access_token: next.accessToken,
      refresh_token: next.refreshToken,
      ...(next.idToken ? { id_token: next.idToken } : {}),
      ...(next.accountId ? { account_id: next.accountId } : {})
    }
    existing.last_refresh = new Date().toISOString()
    fs.writeFileSync(authPath, JSON.stringify(existing, null, 2))
  } catch { /* best-effort persistence */ }
  return next
}

function codexUsageUrl(): string {
  let base = CODEX_USAGE_DEFAULT_BASE
  try {
    const toml = fs.readFileSync(join(codexHome(), 'config.toml'), 'utf8')
    for (const line of toml.split('\n')) {
      const stripped = line.split('#')[0].trim()
      const eq = stripped.indexOf('=')
      if (eq === -1) continue
      if (stripped.slice(0, eq).trim() !== 'chatgpt_base_url') continue
      let v = stripped.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (v) base = v
      break
    }
  } catch { /* default base */ }
  base = base.replace(/\/+$/, '')
  if ((base.startsWith('https://chatgpt.com') || base.startsWith('https://chat.openai.com')) && !base.includes('/backend-api')) {
    base += '/backend-api'
  }
  return base + (base.includes('/backend-api') ? '/wham/usage' : '/api/codex/usage')
}

function codexWindow(w: any, label: string): LimitWindow | null {
  if (!w) return null
  const used = Number(w.used_percent)
  const resetAt = Number(w.reset_at)
  const at = isFinite(resetAt) && resetAt > 0 ? Math.floor(resetAt) : 0
  return {
    label,
    usedPercent: Math.min(100, Math.max(0, isFinite(used) ? used : 0)),
    resetAt: at,
    resetMinutes: resetMinutes(at),
    status: 'active'
  }
}

/** Codex windows aren't ordered; the weekly one has limit_window_seconds 604800. */
function isWeekly(w: any): boolean {
  return Number(w?.limit_window_seconds) === 604800
}

async function codexUsageCall(creds: CodexCreds): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${creds.accessToken}`,
    'user-agent': 'codex-cli',
    'content-type': 'application/json',
    accept: 'application/json',
    'cache-control': 'no-cache, no-store, max-age=0',
    pragma: 'no-cache'
  }
  if (creds.accountId) headers['chatgpt-account-id'] = creds.accountId
  return fetchWithTimeout(codexUsageUrl(), { method: 'GET', headers })
}

async function getCodexLimits(): Promise<ProviderLimits> {
  let creds = readCodexCreds()
  if (!creds) {
    return { ok: false, session5h: null, weekly7d: null, error: 'No Codex credentials. Sign in to Codex first.' }
  }
  try {
    if (refreshDue(creds)) {
      try {
        creds = await refreshCodex(creds)
      } catch { /* try the stale token; the call below will 401 if truly dead */ }
    }
    let res = await codexUsageCall(creds)
    if ((res.status === 401 || res.status === 403)) {
      // Stale access token — refresh once, then retry.
      try {
        creds = await refreshCodex(creds)
        res = await codexUsageCall(creds)
      } catch (e: any) {
        return { ok: false, session5h: null, weekly7d: null, error: e?.message || 'Codex token expired.' }
      }
    }
    if (!res.ok) {
      return { ok: false, session5h: null, weekly7d: null, error: `Codex usage failed (HTTP ${res.status}).` }
    }
    const body: any = await res.json()
    const data = body?.data || body?.result || body?.response || body
    const rl = data?.rate_limit
    let session5h: LimitWindow | null = null
    let weekly7d: LimitWindow | null = null
    if (rl) {
      for (const w of [rl.primary_window, rl.secondary_window]) {
        if (!w) continue
        if (isWeekly(w)) weekly7d = codexWindow(w, '7d')
        else session5h = codexWindow(w, '5h')
      }
    }
    return {
      ok: true,
      session5h,
      weekly7d,
      plan: data?.plan_type || planFromIdToken(creds.idToken) || null,
      updatedAt: new Date().toISOString()
    }
  } catch (e: any) {
    return { ok: false, session5h: null, weekly7d: null, error: e?.message || 'Codex usage request failed.' }
  }
}

// --- Public ---------------------------------------------------------------

export async function getLimits(): Promise<LimitsSnapshot> {
  const [claude, codex] = await Promise.all([getClaudeLimits(), getCodexLimits()])
  return { claude, codex }
}
