/**
 * Small hooks for the mobile remote client: latency probing, elapsed timer,
 * and localStorage-backed preferences.
 */
import { useEffect, useState } from 'react'
import type { ConnState, RemoteClient } from '../lib/remote-client'

/**
 * Round-trip latency in ms, measured against an existing lightweight RPC
 * (`session:list`) — no protocol change needed. null while unknown/offline.
 */
export function useLatency(client: RemoteClient, conn: ConnState, intervalMs = 8000): number | null {
  const [ms, setMs] = useState<number | null>(null)
  useEffect(() => {
    if (conn !== 'open') {
      setMs(null)
      return
    }
    let alive = true
    const probe = async () => {
      const t0 = performance.now()
      try {
        await client.call('session:list')
        if (alive) setMs(Math.max(1, Math.round(performance.now() - t0)))
      } catch {
        if (alive) setMs(null)
      }
    }
    probe()
    const iv = setInterval(probe, intervalMs)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [client, conn, intervalMs])
  return ms
}

/** Seconds elapsed since mount — the "connection time" counter. */
export function useElapsed(): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const iv = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(iv)
  }, [])
  return s
}

/** useState persisted to localStorage (falls back to memory in private mode). */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setVal(v)
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* private mode */
    }
  }
  return [val, set]
}
