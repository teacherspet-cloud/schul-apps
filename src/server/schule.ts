/**
 * Schul-Einrichtung des Servers (09.10.2026, shared/schulEinrichtung.ts).
 *
 *   GET  /server/schule        – Angaben und Logo (alle Lehrkräfte und Admins; Lernende nicht)
 *   POST /server/schule        – Angaben speichern (nur Admin, mit x-schulapps-token)
 *   POST /server/schule/logo   – Logo setzen ({ logo: 'data:image/png;base64,…' }) oder entfernen ({ logo: null }) (nur Admin)
 *
 * Die Angaben liegen in server_einstellungen unter 'schule', das Logo als Datei im Systemordner (<DATEN>/system,
 * im Server-Bündel verschlüsselt wie alles dort).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOGO_GRENZE, pruefeSchule, type SchulEinrichtung } from '@shared/schulEinrichtung'
import type { Anfrage } from './http'
import { json } from './http'
import { protokolliereServer, serverWert, setzeServerWert } from './datenbank'
import { systemOrdner } from './pfade'

const logoPfad = (): string => join(systemOrdner(), 'schule-logo.png')
const PNG_KOPF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Angaben der Schule oder null, solange die Verwaltung nichts eingerichtet hat */
export function leseSchule(): SchulEinrichtung | null {
  const s = serverWert<SchulEinrichtung | null>('schule', null)
  return s && typeof s === 'object' && typeof s.name === 'string' ? s : null
}

export function speichereSchule(roh: unknown): { schule: SchulEinrichtung } | { fehler: string } {
  const p = pruefeSchule(roh)
  if ('fehler' in p) return p
  const schule: SchulEinrichtung = { ...p.schule, logo: Boolean(leseSchule()?.logo), geaendert: new Date().toISOString() }
  setzeServerWert('schule', schule)
  return { schule }
}

/** Logo als PNG-data:-URL oder null */
export function leseSchulLogo(): string | null {
  try {
    if (!existsSync(logoPfad())) return null
    return `data:image/png;base64,${readFileSync(logoPfad()).toString('base64')}`
  } catch {
    return null
  }
}

/** Prüft eine PNG-data:-URL (Kopf, Größe) und liefert die Bytes */
export function pruefeLogo(dataUrl: unknown): { daten: Buffer } | { fehler: string } {
  const m = typeof dataUrl === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl) : null
  if (!m) return { fehler: 'Das Logo muss als PNG-Bild kommen.' }
  const daten = Buffer.from(m[1], 'base64')
  if (daten.length > LOGO_GRENZE) return { fehler: 'Das Logo ist zu groß (höchstens 1 MB).' }
  if (daten.length < 32 || !daten.subarray(0, 8).equals(PNG_KOPF)) return { fehler: 'Die Datei ist kein gültiges PNG-Bild.' }
  return { daten }
}

/** Logo setzen (PNG-data:-URL) oder mit null entfernen */
export function setzeSchulLogo(dataUrl: string | null): { ok: true } | { fehler: string } {
  if (dataUrl === null) {
    rmSync(logoPfad(), { force: true })
  } else {
    const p = pruefeLogo(dataUrl)
    if ('fehler' in p) return p
    writeFileSync(logoPfad(), p.daten)
  }
  const s = leseSchule()
  if (s) setzeServerWert('schule', { ...s, logo: dataUrl !== null })
  else if (dataUrl !== null) setzeServerWert('schule', { ...leereSchule(), logo: true })
  return { ok: true }
}

/** Platzhalter, wenn das Logo vor den übrigen Angaben kommt (ohne Namen gilt die Schule als nicht eingerichtet) */
const leereSchule = (): SchulEinrichtung => ({ name: '', stateId: '', schulformen: [], strasse: '', plz: '', ort: '', telefon: '', email: '' })

export async function schuleRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/schule' && url.pathname !== '/server/schule/logo') return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Kein Zugang.' }), true)

  if (req.method === 'GET' && url.pathname === '/server/schule') {
    const schule = leseSchule()
    return (json(res, 200, { schule: schule?.name ? schule : null, logo: schule?.logo ? leseSchulLogo() : null }), true)
  }
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
  const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>

  if (url.pathname === '/server/schule/logo') {
    const r = setzeSchulLogo(k0.logo === null ? null : typeof k0.logo === 'string' ? k0.logo : '')
    if ('fehler' in r) return (json(res, 400, r), true)
    protokolliereServer('verwaltung', `Schullogo ${k0.logo === null ? 'entfernt' : 'gesetzt'}`, sitzung.nutzer.id)
    return (json(res, 200, { ok: true }), true)
  }
  const r = speichereSchule(k0)
  if ('fehler' in r) return (json(res, 400, r), true)
  protokolliereServer('verwaltung', 'Schul-Einrichtung geändert', sitzung.nutzer.id)
  return (json(res, 200, r), true)
}
