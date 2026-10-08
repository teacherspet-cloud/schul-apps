/**
 * Reihe speichern und veröffentlichen (08.10.2026, Wunsch der Lehrkraft) – Regeln für Lehrkraft-App und Server.
 *
 *  - Automatisches Speichern: Der Editor sichert verzögert. Damit ein älterer Stand nie einen neueren überschreibt
 *    (zweites Fenster, Ergebnis eines Hintergrund-Auftrags am Server), schickt er den Stand mit, auf dem er aufbaut
 *    (`basis` = `geaendert` beim Laden bzw. letzten Speichern). Ist der gespeicherte Stand neuer, lehnt der Server ab
 *    (409, `istVeraltet`) – außer die Änderung kommt von einem Auftrag (`auftrag`). Der Editor führt dann beide Stände
 *    zusammen (`fuehreZusammen`, Drei-Wege-Vergleich mit der Basis) und speichert erneut.
 *  - Zugewiesene Reihen: Speichern ändert nur den Entwurf. Lernende sehen den veröffentlichten Stand, bis die Lehrkraft
 *    „Für Lernende aktualisieren" wählt. Wie viel sich seitdem geändert hat, zählt `aenderungenSeit`.
 */
import type { Reihe, Schritt } from './reihe'

/** Ist der gespeicherte Stand neuer als der, auf dem der Client aufbaut? (ISO-Zeitstempel) */
export function istVeraltet(gespeichert: string | undefined, basis: string | undefined, auftrag = false): boolean {
  if (auftrag || !gespeichert || !basis) return false
  return gespeichert > basis
}

const gleich = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Felder der Reihe, die beim Zusammenführen einzeln verglichen werden (alles außer Schritten und Kennungen) */
const FELDER = [
  'titel',
  'fachId',
  'fachLabel',
  'stateId',
  'schoolTypeId',
  'grade',
  'oberthema',
  'lernziele',
  'teile',
  'stunden',
  'optionalMindestens',
  'planHinweis',
  'art',
  'verlauf',
  'niveau',
  // 08.10.2026: Reihenmuster
  'leitfrage',
  'reihentyp'
] as const

/** Schritt beim Zusammenführen: Wer ihn geändert hat, gewinnt; beide geändert → ein gefüllter Platzhalter (Auftrag) vor dem leeren */
function schrittWahl(lokal: Schritt, basis: Schritt | undefined, server: Schritt): Schritt {
  if (basis && gleich(lokal, basis)) return server
  if (basis && gleich(server, basis)) return lokal
  if (lokal.platzhalter && !server.platzhalter) return { ...lokal, ...server }
  return lokal
}

/**
 * Drei-Wege-Zusammenführung nach einem Konflikt: `lokal` (Editor), `basis` (zuletzt geladen/gespeichert), `server`
 * (jetzt gespeichert). Unveränderte Felder übernehmen den Serverstand, eigene Änderungen bleiben. Schritte je Kennung:
 * neu (lokal oder am Server) bleibt, gelöscht wird nur, was die andere Seite nicht verändert hat. Reihenfolge wie lokal,
 * neue Schritte des Servers hinter ihrem Vorgänger. Ergebnis trägt `geaendert` des Servers (neue Basis).
 */
export function fuehreZusammen(lokal: Reihe, basis: Reihe | null, server: Reihe): Reihe {
  const aus: Reihe = { ...lokal, id: server.id || lokal.id, geaendert: server.geaendert }
  for (const f of FELDER) {
    const l = lokal[f]
    const b = basis?.[f]
    if (basis && gleich(l, b)) (aus as unknown as Record<string, unknown>)[f] = server[f]
  }
  const sMap = new Map(server.schritte.map((s) => [s.id, s]))
  const bMap = new Map((basis?.schritte ?? []).map((s) => [s.id, s]))
  const lIds = new Set(lokal.schritte.map((s) => s.id))
  const schritte: Schritt[] = []
  for (const l of lokal.schritte) {
    const s = sMap.get(l.id)
    const b = bMap.get(l.id)
    if (!s) {
      // Am Server gelöscht: nur weg, wenn hier unverändert
      if (b && gleich(l, b)) continue
      schritte.push(l)
      continue
    }
    schritte.push(schrittWahl(l, b, s))
  }
  // Neue Schritte des Servers (oder hier gelöscht, dort aber geändert) hinter ihrem Vorgänger einfügen
  server.schritte.forEach((s, i) => {
    if (lIds.has(s.id)) return
    const b = bMap.get(s.id)
    if (b && gleich(s, b)) return // hier gelöscht, dort unverändert
    const vorgaenger = server.schritte
      .slice(0, i)
      .reverse()
      .find((x) => schritte.some((y) => y.id === x.id))
    const k = vorgaenger ? schritte.findIndex((y) => y.id === vorgaenger.id) + 1 : 0
    schritte.splice(k, 0, s)
  })
  return { ...aus, schritte }
}

/** Was Lernende von einem Schritt sehen bzw. was ihren Weg bestimmt – ohne Planungs- und KI-Angaben der Lehrkraft */
function sichtbar(s: Schritt): unknown {
  const { kiEntwurf: _k, grundlageAus: _g, kiVorgabe: _v, begruendung: _b, ersetzen: _e, stunde: _s, minuten: _m, platzhalter: _p, ...rest } = s
  return rest
}

/**
 * Wie viele Änderungen hat der Entwurf gegenüber dem veröffentlichten Stand (für Lernende sichtbar)? Platzhalter zählen
 * nicht – die sehen Lernende nie. Je eine Änderung: Titel, Oberthema, Lernziele, Mindestzahl optionaler Schritte, Art;
 * je hinzugekommenem, entferntem oder geändertem Schritt eine; eine geänderte Reihenfolge eine.
 */
export function aenderungenSeit(veroeffentlicht: Reihe | null, entwurf: Reihe): number {
  if (!veroeffentlicht) return 0
  let n = 0
  // Leitfrage (08.10.2026): sehen die Lernenden oben in der Reihe
  for (const f of ['titel', 'oberthema', 'lernziele', 'optionalMindestens', 'art', 'leitfrage'] as const) if (!gleich(veroeffentlicht[f], entwurf[f])) n++
  const alt = (veroeffentlicht.schritte ?? []).filter((s) => !s.platzhalter)
  const neu = (entwurf.schritte ?? []).filter((s) => !s.platzhalter)
  const altMap = new Map(alt.map((s) => [s.id, s]))
  const neuIds = new Set(neu.map((s) => s.id))
  for (const s of neu) {
    const a = altMap.get(s.id)
    if (!a || !gleich(sichtbar(a), sichtbar(s))) n++
  }
  for (const s of alt) if (!neuIds.has(s.id)) n++
  const gemeinsamAlt = alt.filter((s) => neuIds.has(s.id)).map((s) => s.id)
  const gemeinsamNeu = neu.filter((s) => altMap.has(s.id)).map((s) => s.id)
  if (!gleich(gemeinsamAlt, gemeinsamNeu)) n++
  return n
}

/** Stand der Veröffentlichung für den Editor */
export interface Veroeffentlichung {
  /** Zahl der Zuweisungen (ohne Musterschüler-Vorschau) */
  zugewiesen: number
  /** Änderungen, die Lernende noch nicht sehen */
  offen: number
  /** Zeitpunkt der letzten Veröffentlichung */
  am?: string
}

/** Soll der Server beim Speichern gleich veröffentlichen? Nicht zugewiesen: immer (niemand sieht es); sonst nur auf Wunsch */
export const sofortVeroeffentlichen = (zugewiesen: number, gewuenscht: boolean): boolean => zugewiesen === 0 || gewuenscht

/** Name in Listen und Datenbank für eine Reihe ohne Titel (Entwurf) */
export const OHNE_TITEL = 'Neue Reihe'
