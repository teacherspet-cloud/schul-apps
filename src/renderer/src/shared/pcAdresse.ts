/**
 * Die Adresse des PCs für „Abo über den PC" (iPad-App, 30.09.2026) – geteilt von mobil/pcKi.ts
 * und der Einrichtung in der Oberfläche (shell/PcKiZugang.tsx).
 *
 * TAILSCALE: iOS erlaubt unverschlüsseltes HTTP nur zu Namen auf „.ts.net" (Ausnahme in der
 * Info.plist, scripts/ios-plist.sh) – nicht zur rohen Tailscale-IP 100.x. Rückmeldung der
 * Lehrkraft: „Bei Tailscale wird die IP-Adresse 100.101.181.79:8420 angezeigt. Diese ist vom
 * iPad aus nicht erreichbar." Der PC nennt seinen Namen beim Anmelden; die App ersetzt damit
 * eine eingegebene 100.x-Adresse.
 */
import type { PcKiEinstellungen } from '@shared/types'

/** Voreinstellung des Netzzugangs am PC (main/umgebung.ts) */
export const STANDARD_PORT = '8420'

/**
 * Die eingegebene Adresse in die Form http://host:port bringen.
 *
 * Angenommen wird, was die Netz-Einstellungen am PC zeigen („http://192.168.1.24:8420"), aber
 * auch ohne http:// oder ohne Port. Jeder Rechnername und jede Adresse ist erlaubt – nicht nur
 * die üblichen Heimnetz-Bereiche: Tailscale vergibt 100.x-Adressen und Namen auf „.ts.net".
 */
export function pcAdresse(eingabe: string): string {
  let text = String(eingabe ?? '').trim()
  if (!text) throw new Error('Es ist noch keine Adresse des PCs eingetragen.')
  if (!/^[a-z]+:\/\//i.test(text)) text = `http://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`„${eingabe}" ist keine gültige Adresse. Erwartet wird z. B. 192.168.1.24:8420.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Die Adresse muss mit http:// beginnen.')
  if (url.username || url.password) throw new Error('Die Adresse darf keine Zugangsdaten enthalten.')
  if (!url.port) url.port = STANDARD_PORT
  return `${url.protocol}//${url.host}`
}

/** Tailscale vergibt 100.64.0.0/10 (wie main/services/lanServer.ts, istTailscaleAdresse) */
export function istTailscaleIp(host: string): boolean {
  const teile = host.split('.')
  if (teile.length !== 4 || !teile.every((t) => /^\d{1,3}$/.test(t))) return false
  const [a, b] = teile.map(Number)
  return a === 100 && b >= 64 && b <= 127
}

/** Zeigt die eingegebene Adresse auf eine rohe Tailscale-IP (100.x)? */
export function zeigtAufTailscaleIp(eingabe: string): boolean {
  try {
    return istTailscaleIp(new URL(pcAdresse(eingabe)).hostname)
  } catch {
    return false
  }
}

/**
 * Eine Tailscale-IP durch den gemerkten Namen auf „.ts.net" ersetzen – oder null, wenn es
 * nichts zu ersetzen gibt (keine 100.x-Adresse oder kein Name bekannt). Der Port kommt aus der
 * Eingabe; nur ohne Port aus dem Namen.
 */
export function ersetzeTailscaleIp(eingabe: string, tailscaleAdresse: string | undefined): string | null {
  if (!tailscaleAdresse || !zeigtAufTailscaleIp(eingabe)) return null
  try {
    const name = new URL(pcAdresse(tailscaleAdresse))
    if (!/\.ts\.net$/i.test(name.hostname)) return null
    const roh = String(eingabe).trim()
    const mitPort = /:\d+\/?$/.test(roh.replace(/^[a-z]+:\/\//i, ''))
    const port = mitPort ? new URL(pcAdresse(roh)).port : name.port
    return `${name.protocol}//${name.hostname}:${port || STANDARD_PORT}`
  } catch {
    return null
  }
}

/** Die Adresse, unter der der PC tatsächlich angesprochen wird (100.x → gemerkter ts.net-Name) */
export function zielAdresse(e: Pick<PcKiEinstellungen, 'adresse' | 'tailscaleAdresse'>): string {
  return ersetzeTailscaleIp(e.adresse, e.tailscaleAdresse) ?? pcAdresse(e.adresse)
}
