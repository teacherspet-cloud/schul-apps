// Rücksichtsvolle Anfragen an freie Bilddienste (Wikimedia, Openverse): wenige gleichzeitig je Dienst,
// bei Überlastung (429/503) kurz warten und erneut versuchen.

import { pruefeZiel } from '../netz/zieladresse'

const LIMIT_PER_HOST = 4
const running = new Map<string, number>()
const waiting = new Map<string, (() => void)[]>()

function hostKey(url: string): string {
  try {
    const host = new URL(url).hostname
    return host.endsWith('wikimedia.org') || host.endsWith('wikisource.org') ? 'wikimedia' : host
  } catch {
    return 'other'
  }
}

async function acquire(key: string): Promise<void> {
  if ((running.get(key) ?? 0) >= LIMIT_PER_HOST) {
    await new Promise<void>((resolve) => waiting.set(key, [...(waiting.get(key) ?? []), resolve]))
  }
  running.set(key, (running.get(key) ?? 0) + 1)
}

function release(key: string): void {
  running.set(key, Math.max(0, (running.get(key) ?? 1) - 1))
  const queue = waiting.get(key)
  const next = queue?.shift()
  if (next) next()
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/*
 * Sicherheit (27.09.2026): Jede Adresse wird VOR dem Abruf geprüft (nur https, nicht das eigene
 * Netz, Name aufgelöst – siehe netz/zieladresse.ts), und Weiterleitungen werden selbst verfolgt,
 * damit auch jede Zwischenstation geprüft ist. Bis dahin hätte eine Adresse aus einer KI-Antwort
 * oder vom Tablet den eigenen Rechner oder Router abfragen können.
 */
const MAX_WEITERLEITUNGEN = 5

export async function politeFetch(url: string | URL, init: RequestInit = {}, retries = 3): Promise<Response> {
  let ziel = await pruefeZiel(url)
  for (let sprung = 0; ; sprung++) {
    const res = await einmal(ziel, { ...init, redirect: 'manual' }, retries)
    if (res.status < 300 || res.status > 399) return res
    const ort = res.headers.get('location')
    if (!ort) return res
    if (sprung >= MAX_WEITERLEITUNGEN) throw new Error('Zu viele Weiterleitungen.')
    await res.body?.cancel().catch(() => undefined)
    ziel = await pruefeZiel(new URL(ort, ziel))
    // Nach einer Weiterleitung wird wie ein Browser mit GET weitergemacht
    if (res.status === 303 || (init.method && init.method !== 'GET' && (res.status === 301 || res.status === 302))) {
      init = { ...init, method: 'GET', body: undefined }
    }
  }
}

async function einmal(url: URL, init: RequestInit, retries: number): Promise<Response> {
  const key = hostKey(String(url))
  for (let attempt = 0; ; attempt++) {
    await acquire(key)
    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000), ...init })
    } catch (e) {
      release(key)
      if (attempt >= retries) throw e
      await sleep(800 * (attempt + 1))
      continue
    }
    release(key)
    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1000 * 2 ** attempt)
      continue
    }
    return res
  }
}
