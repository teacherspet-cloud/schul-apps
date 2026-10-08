/**
 * „Weiter" auf dem Weg einer Unterrichtsreihe (08.10.2026, Wunsch der Lehrkraft): Nach dem Einreichen eines Blatts bzw.
 * sobald ein Schritt geschafft ist, führt ein deutlicher Knopf „Weiter: <nächster Schritt>" dorthin; auf der Übersicht
 * steht oben „Weiter mit: …". Reine Rechnungen für Blatt- und Reihenseite (Tests: tests/reiheWeiter.test.ts).
 */
import type { Status } from './reihe'

export interface WegSchritt {
  id: string
  titel: string
  rolle?: string
  link?: string
  inhalt?: { art: string; zweck?: unknown }
}

/** Noch zu tun: offen oder nicht geschafft (noch einmal ansehen) */
const ZU_TUN: Status[] = ['offen', 'nicht_geschafft']

/**
 * Der nächste Schritt, an dem es weitergeht: zuerst nach dem aktuellen Schritt (Pflicht, Wahl, Förder vor Optionalem
 * und Zusatz), sonst der erste noch offene davor. `null`, wenn nichts mehr offen ist.
 */
export function naechsterSchritt<T extends WegSchritt>(schritte: T[], lagen: { id: string; status: Status }[], aktuell?: string): T | null {
  const status = new Map(lagen.map((l) => [l.id, l.status]))
  const offen = schritte.filter((s) => s.id !== aktuell && ZU_TUN.includes(status.get(s.id) ?? 'gesperrt'))
  if (!offen.length) return null
  const ab = aktuell ? schritte.findIndex((s) => s.id === aktuell) : -1
  const danach = offen.filter((s) => schritte.indexOf(s) > ab)
  const wichtig = (l: T[]): T | undefined => l.find((s) => s.rolle !== 'optional' && s.rolle !== 'forder') ?? l[0]
  return wichtig(danach) ?? wichtig(offen) ?? null
}

/** Schritt zu einem Link (z. B. das Blatt „/s/b/<ID>", das gerade offen ist) */
export function schrittZumLink<T extends WegSchritt>(schritte: T[], pfad: string): T | undefined {
  const ohne = pfad.split('?')[0]
  return schritte.find((s) => s.link && s.link.split('?')[0] === ohne)
}

/** Wohin ein Schritt führt: Blatt, Test usw. direkt (mit Rückweg zur Reihe), sonst die Schrittseite */
export function schrittZiel(zid: string, s: WegSchritt): string {
  // Blatt als Selbsteinschätzung oder Abschluss: erst die Schrittseite (Ampel bzw. Raster), von dort zum Blatt
  const ueberSchritt = s.inhalt?.zweck === 'reflexion' || s.inhalt?.zweck === 'abschluss'
  if (s.link && !ueberSchritt) return `${s.link}${s.link.includes('?') ? '&' : '?'}reihe=${zid}`
  return `/s/r/${zid}/${s.id}`
}

/** Ist der Schritt für die Lernenden erledigt (geschafft, übersprungen oder abgegeben und wartet auf die Lehrkraft)? */
export const schrittErledigt = (l: { status: Status; wartet?: boolean } | undefined): boolean =>
  Boolean(l && (l.status === 'geschafft' || l.status === 'uebersprungen' || (l.status === 'eingereicht' && l.wartet)))
