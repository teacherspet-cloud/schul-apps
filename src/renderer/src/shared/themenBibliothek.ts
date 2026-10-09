/**
 * Ordnung der Themen-Bibliothek (09.10.2026, Entscheidung der Lehrkraft für Tafelbilder,
 * Rückmeldungen und freigegebene Blätter): Fach → Themenbereich → Einträge, innerhalb eines
 * Bereichs nach Klasse, dann Titel.
 *
 * Der Themenbereich eines Eintrags – in dieser Reihenfolge:
 *  1. von Hand gewählt (gespeichert am Dokument bzw. an der Freigabe),
 *  2. der Bereich, den die Themenbereiche der App schon kennen (shared/themenbereiche.tsx,
 *     z. B. der Bereich des Arbeitsblatts, aus dem eine Freigabe stammt),
 *  3. das Überthema, wenn es ein Thema des Lehrplankatalogs beim Namen nennt,
 *  4. das passendste Katalogthema nach Stichwörtern aus Titel, Thema und Überthema – OHNE KI,
 *     dieselbe Regel wie die Automatik der Arbeitsblatt-Bibliothek (themenVorschlag.ts),
 *  5. das Überthema im Wortlaut (die Lehrkraft hat es selbst so genannt),
 *  6. sonst „Ohne Themenbereich".
 * Als Themenbereich gilt das OBERSTE Thema des Katalogpfads (die Unterrichtseinheit unter dem
 * Fach) – wie das Überthema im Kopf der Materialien (`obersterBereich`).
 *
 * Ohne React geschrieben – geprüft in tests/themenBibliothek.test.ts.
 */
import { passendesKatalogThema, type KatalogThema } from './themenVorschlag'

export const OHNE_THEMENBEREICH = 'Ohne Themenbereich'
export const OHNE_FACH = 'Ohne Fach'

/** Was die Bibliothek über einen Eintrag wissen muss */
export interface ThemenEintrag {
  id: string
  titel: string
  /** Fach als Anzeigename („Geschichte"); leer = ohne Fach */
  fach: string
  /** Fachkennung für den Katalog („geschichte") */
  fachId: string
  grade?: number
  thema?: string
  ueberthema?: string
  updatedAt: string
  /** Von Hand gewählt (Dokument bzw. Freigabe) – hat Vorrang vor allem anderen */
  themenbereich?: string
  /** Bereich aus den Themenbereichen der App (Stufe 2) */
  bereichVorgabe?: string
  /** Weitere Suchwörter (Lerngruppe …) */
  suchtext?: string
  /** Bundesland und Schulform für den Lehrplankatalog (ohne: die Einstellungen) */
  land?: string
  schulform?: string
}

export type Herkunft = 'hand' | 'bereich' | 'ueberthema' | 'katalog' | 'wortlaut' | 'ohne'

export interface Zuordnung {
  name: string
  herkunft: Herkunft
}

const gleich = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de')
const oberstes = (k: KatalogThema): string => k.pfad?.[0] ?? k.name
const erster = (s: string): string => s.split('›')[0].trim()

/** Themenbereich eines Eintrags nach den sechs Stufen oben */
export function themenbereichFuer(e: ThemenEintrag, katalog: KatalogThema[]): Zuordnung {
  if (e.themenbereich?.trim()) return { name: e.themenbereich.trim(), herkunft: 'hand' }
  if (e.bereichVorgabe?.trim()) return { name: e.bereichVorgabe.trim(), herkunft: 'bereich' }
  const ue = (e.ueberthema ?? '').trim()
  if (ue) {
    const k = katalog.find((x) => gleich(x.name, ue) || gleich(x.name, erster(ue)) || (x.wortlaut ? gleich(x.wortlaut, ue) : false))
    if (k) return { name: oberstes(k), herkunft: 'ueberthema' }
  }
  if (katalog.length) {
    const thema = [e.thema, ue].filter(Boolean).join(' ')
    const probe = (name: string, t: string): KatalogThema | null =>
      passendesKatalogThema({ moduleId: '', id: e.id, name, thema: t, fachId: e.fachId, updatedAt: e.updatedAt, ...(e.grade ? { grade: e.grade } : {}) }, katalog)
    // Erst Titel mit Thema; ein nichtssagender Titel („Tafelbild 3") verwässert die Deckung – dann das Thema allein
    const k = probe(e.titel, thema) ?? (thema.trim() ? probe('', thema) : null)
    if (k) return { name: oberstes(k), herkunft: 'katalog' }
  }
  if (ue) return { name: erster(ue), herkunft: 'wortlaut' }
  return { name: OHNE_THEMENBEREICH, herkunft: 'ohne' }
}

/** Klassenspanne für Überschriften: „Kl. 9–10", „Kl. 7", leer ohne Angabe */
export function klassenSpanne(grades: (number | undefined)[]): string {
  const g = grades.filter((x): x is number => typeof x === 'number' && x > 0)
  if (!g.length) return ''
  const lo = Math.min(...g)
  const hi = Math.max(...g)
  return lo === hi ? `Kl. ${lo}` : `Kl. ${lo}–${hi}`
}

const titelVergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/** Innerhalb eines Bereichs: Klasse aufsteigend (ohne Klasse zuletzt), dann Titel */
export function vergleicheEintraege(a: Pick<ThemenEintrag, 'grade' | 'titel'>, b: Pick<ThemenEintrag, 'grade' | 'titel'>): number {
  const ga = a.grade || 99
  const gb = b.grade || 99
  return ga - gb || titelVergleich.compare(a.titel, b.titel)
}

export interface ThemenGruppe<E extends ThemenEintrag> {
  name: string
  eintraege: E[]
  klassen: string
}

export interface FachGruppe<E extends ThemenEintrag> {
  fach: string
  fachId: string
  anzahl: number
  klassen: string
  themen: ThemenGruppe<E>[]
}

/**
 * Fach → Themenbereich → Einträge. Fächer und Bereiche alphabetisch, „Ohne Fach" bzw. „Ohne
 * Themenbereich" jeweils am Ende. `zuordnung` liefert den Bereich je Eintrag (siehe oben).
 */
export function gruppiereNachThema<E extends ThemenEintrag>(eintraege: E[], zuordnung: (e: E) => Zuordnung): FachGruppe<E>[] {
  const faecher = new Map<string, { fachId: string; themen: Map<string, E[]> }>()
  for (const e of eintraege) {
    const fach = e.fach.trim() || OHNE_FACH
    let f = faecher.get(fach)
    if (!f) {
      f = { fachId: e.fachId, themen: new Map() }
      faecher.set(fach, f)
    }
    const name = zuordnung(e).name
    // Gleich geschriebene Bereiche (Groß-/Kleinschreibung) zusammenlegen
    const schluessel = [...f.themen.keys()].find((k) => gleich(k, name)) ?? name
    f.themen.set(schluessel, [...(f.themen.get(schluessel) ?? []), e])
  }
  const zuletzt = (ohne: string) => (x: string, y: string) => (x === ohne ? 1 : y === ohne ? -1 : titelVergleich.compare(x, y))
  return [...faecher.entries()]
    .sort(([x], [y]) => zuletzt(OHNE_FACH)(x, y))
    .map(([fach, f]) => {
      const themen = [...f.themen.entries()].sort(([x], [y]) => zuletzt(OHNE_THEMENBEREICH)(x, y))
      const alle = themen.flatMap(([, l]) => l)
      return {
        fach,
        fachId: f.fachId,
        anzahl: alle.length,
        klassen: klassenSpanne(alle.map((e) => e.grade)),
        themen: themen.map(([name, l]) => ({ name, eintraege: [...l].sort(vergleicheEintraege), klassen: klassenSpanne(l.map((e) => e.grade)) }))
      }
    })
}

/** Die zuletzt bearbeiteten Einträge (neueste zuerst) */
export function zuletztBearbeitet<E extends Pick<ThemenEintrag, 'updatedAt'>>(eintraege: E[], n = 4): E[] {
  return [...eintraege].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, n)
}

const falte = (s: string): string =>
  s
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')

/** Suche über Titel, Thema, Überthema, Themenbereich, Fach, Klasse und Zusatz – alle Wörter müssen vorkommen */
export function passtZuSuche(e: ThemenEintrag, bereich: string, suche: string): boolean {
  const woerter = falte(suche).split(/\s+/).filter(Boolean)
  if (!woerter.length) return true
  const text = falte([e.titel, e.thema, e.ueberthema, bereich, e.fach, e.grade ? `klasse ${e.grade} kl. ${e.grade}` : '', e.suchtext].filter(Boolean).join(' '))
  return woerter.every((w) => text.includes(w))
}

/**
 * Themen für die Auswahl „Themenbereich ändern …": die obersten Themen des Katalogs (zur Klasse
 * passende zuerst), davor die schon benutzten Bereiche des Fachs – ohne Doppelte.
 */
export function themenAuswahl(katalog: KatalogThema[], benutzt: string[], grade?: number): string[] {
  const oben = new Map<string, number[] | undefined>()
  for (const k of katalog) {
    const n = oberstes(k)
    if (!oben.has(n)) oben.set(n, k.pfad?.length ? undefined : k.jahrgaenge)
  }
  const passend = (j: number[] | undefined): boolean => !grade || !j || j.includes(grade)
  const katalogNamen = [...oben.entries()].sort(([, a], [, b]) => Number(passend(b)) - Number(passend(a))).map(([n]) => n)
  const out: string[] = []
  for (const n of [...benutzt.filter((b) => b !== OHNE_THEMENBEREICH), ...katalogNamen]) if (!out.some((x) => gleich(x, n))) out.push(n)
  return out
}
