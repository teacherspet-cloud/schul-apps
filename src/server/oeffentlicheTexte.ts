/**
 * Öffentliche Textdateien ohne Anmeldung (23.10.2026, Nachprüfung des Schulträgers, Punkt 8 „Härtung"):
 *
 *   GET /.well-known/security.txt   – RFC 9116: Kontakt für Sicherheitsmeldungen, Ablauf in einem Jahr, Sprachen, Canonical
 *   GET /robots.txt                 – Suchmaschinen: nur die öffentlichen Seiten (Datenschutz, Impressum), sonst nichts
 *
 * Kontakt: die erste E-Mail-Adresse aus den Datenschutz-Angaben (Betreiber, sonst Datenschutzbeauftragte), sonst aus
 * der Schul-Einrichtung, sonst SCHULAPPS_SICHERHEIT_KONTAKT; ohne Adresse verweist „Contact" auf das Impressum.
 */
import type { Anfrage } from './http'
import { leseAngaben } from './datenschutzSeiten'
import { leseSchule } from './schule'

const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/** Erste E-Mail-Adresse aus den Angaben der Schule (oder leer) */
export function sicherheitsKontakt(): string {
  let a: { betreiber?: string; datenschutzbeauftragte?: string } = {}
  try {
    a = leseAngaben()
  } catch {
    // keine Angaben
  }
  let schule = ''
  try {
    schule = leseSchule()?.email ?? ''
  } catch {
    // keine Einrichtung
  }
  for (const t of [a.betreiber, a.datenschutzbeauftragte, schule, process.env.SCHULAPPS_SICHERHEIT_KONTAKT]) {
    const m = MAIL.exec(String(t ?? ''))
    if (m) return m[0]
  }
  return ''
}

export function securityTxt(adresse: string, jetzt = new Date()): string {
  const basis = adresse.replace(/\/$/, '')
  const mail = sicherheitsKontakt()
  const ablauf = new Date(jetzt)
  ablauf.setUTCFullYear(ablauf.getUTCFullYear() + 1)
  ablauf.setUTCHours(0, 0, 0, 0)
  return [
    `Contact: ${mail ? `mailto:${mail}` : `${basis}/impressum`}`,
    `Expires: ${ablauf.toISOString().replace('.000Z', 'Z')}`,
    'Preferred-Languages: de, en',
    `Canonical: ${basis}/.well-known/security.txt`,
    `Policy: ${basis}/impressum`,
    ''
  ].join('\n')
}

/** Öffentliche Seiten (datenschutzSeiten.ts) – alles andere liegt hinter der Anmeldung */
export const ROBOTS_TXT = ['User-agent: *', 'Allow: /datenschutz', 'Allow: /impressum', 'Allow: /.well-known/security.txt', 'Disallow: /', ''].join('\n')

export function oeffentlicheTexteRoute(adresse: string): (k: Anfrage) => Promise<boolean> {
  return async ({ req, res, url }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    const text = url.pathname === '/.well-known/security.txt' ? securityTxt(adresse) : url.pathname === '/robots.txt' ? ROBOTS_TXT : null
    if (text === null) return false
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' })
    res.end(req.method === 'HEAD' ? undefined : text)
    return true
  }
}
