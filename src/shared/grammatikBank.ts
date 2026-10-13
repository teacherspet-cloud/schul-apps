/**
 * Aufgabenbank der Grammatik (13.10.2026, mit der Lehrkraft abgestimmt; Memory „grammatik-aufgabenbank-2026-10-13"):
 * Übungsaufgaben hängen nicht mehr an einem Kurs, sondern an der Grammatikform – gepflegt im Seitenfenster der App
 * „Grammatikformen", schulweit wie die Zuordnung der Formen zu den Lehrwerken.
 *
 *  - Schlüssel: je Teilbereich die Katalog-Kennung („en.verb.past_simple/fragen"; ein Thema ohne Teilformen steht für
 *    sich), dazu gemischte Aufgaben je Grammatikpunkt („mix:" + die Kennungen des Punkts) und je Unit
 *    („unit:" + Band + Unit) als gemischte Wiederholung.
 *  - Je Schlüssel eine Regelkarte und Aufgaben in fünf Übungsarten: Erkennen, Bilden, Anwenden (Kern – sie entscheiden
 *    über „sicher") sowie Unterscheiden und Fehler finden (Zusatz – zählen weder für „sicher" noch für Medaillen).
 *  - „Grammatik hinzufügen" weist dem Kurs die hinterlegten Aufgaben zu; der Kurs verweist auf die Bank (Änderungen
 *    gelten überall, server/grammatikBank.ts baut die Pakete der Kurse neu). Kennungen der Aufgaben bleiben, damit der
 *    Lernstand an der richtigen Aufgabe hängt.
 *
 * Reine Regeln ohne Datenbank und ohne Katalog (den kennt nur die Oberfläche) – für Server, Oberfläche und Tests.
 */
import type { GrammatikAufgabe, GrammatikPaket, GrammatikRegel } from './grammatiktrainer'

export type Uebung = 'erkennen' | 'bilden' | 'anwenden' | 'unterscheiden' | 'fehler'
export const UEBUNGEN: Uebung[] = ['erkennen', 'bilden', 'anwenden', 'unterscheiden', 'fehler']
/** Kern-Übungsarten: entscheiden über „sicher" und zählen für Medaillen */
export const KERN_UEBUNGEN: Uebung[] = ['erkennen', 'bilden', 'anwenden']
export const istKern = (u: Uebung | undefined): boolean => Boolean(u && KERN_UEBUNGEN.includes(u))
export const istUebung = (x: unknown): x is Uebung => typeof x === 'string' && (UEBUNGEN as string[]).includes(x)

export const UEBUNG_NAME: Record<Uebung, string> = {
  erkennen: 'Erkennen',
  bilden: 'Bilden',
  anwenden: 'Anwenden',
  unterscheiden: 'Unterscheiden',
  fehler: 'Fehler finden'
}
/** Kurz, was die Übungsart verlangt – für die Oberfläche und den Auftrag an die KI */
export const UEBUNG_TEXT: Record<Uebung, string> = {
  erkennen: 'die Form im Satz erkennen bzw. aus Möglichkeiten die richtige wählen (Auswahl, Lücke mit Auswahl)',
  bilden: 'die Form aus einer Vorgabe selbst bilden (Lücke mit Grundform, Umformen eines kurzen Satzes)',
  anwenden: 'die Form in einem ganzen Satz anwenden (Umformen mit Ziel, Satzbau, kurzer Satz nach Vorgabe)',
  unterscheiden: 'die Form von ähnlichen Formen abgrenzen (Auswahl zwischen verwechselbaren Formen, Signalwörter)',
  fehler: 'einen Fehler mit der Form im Satz finden und berichtigen'
}
/** Aufgabenarten, die zur Übungsart passen (Englisch, Französisch, Spanisch …) */
export const UEBUNG_ARTEN: Record<Uebung, string[]> = {
  erkennen: ['auswahl', 'luecke'],
  bilden: ['luecke', 'umformen'],
  anwenden: ['umformen', 'satzbau', 'luecke'],
  unterscheiden: ['auswahl', 'luecke'],
  fehler: ['fehler']
}
/** Stufe für Reihenfolge und ältere Ansichten: Erkennen 1, Bilden 2, sonst 3 */
export const uebungStufe = (u: Uebung): 1 | 2 | 3 => (u === 'erkennen' ? 1 : u === 'bilden' ? 2 : 3)

/** Aufgaben je Feld (Teilbereich × Übungsart × Stufe), die der KI-Knopf schreibt (abgestimmt: rund 8) */
export const AUFGABEN_JE_FELD = 8

// ---------------------------------------------------------------- Stufen (13.10.2026, abgestimmt)

/**
 * Schwierigkeit je Aufgabe: grundlegend, mittel, anspruchsvoll – für alle Fächer. Ein Kurs bekommt die Stufen seiner
 * Schulform (`stufenFuerSchulform`), je Kurs änderbar. Aufgaben ohne Angabe gelten als mittel.
 */
export type Stufe = 'g' | 'm' | 'a'
export const STUFEN: Stufe[] = ['g', 'm', 'a']
export const STUFE_NAME: Record<Stufe, string> = { g: 'grundlegend', m: 'mittel', a: 'anspruchsvoll' }
export const istStufe = (x: unknown): x is Stufe => x === 'g' || x === 'm' || x === 'a'
export const stufeVon = (a: { niveau?: Stufe }): Stufe => a.niveau ?? 'm'
/** Was die Stufe für die KI heißt */
export const STUFE_TEXT: Record<Stufe, string> = {
  g: 'grundlegend – kurze Sätze, einfacher Wortschatz, die Regel in ihrer Grundform, viel Hilfe durch Vorgaben',
  m: 'mittel – wie im Unterricht üblich, gemischte Fälle',
  a: 'anspruchsvoll – längere Sätze, Ausnahmen und Sonderfälle, Transfer, wenig Vorgaben'
}
/**
 * Stufen eines Kurses nach Schulform (abgestimmt): Hauptschule, Mittelschule, Förderschule grundlegend; Gymnasium mittel und
 * anspruchsvoll; alle übrigen (Real-, Ober-, Gesamtschule …) grundlegend und mittel – anspruchsvoll ergänzt die Lehrkraft
 * je Kurs (z. B. IGS-E-Kurs). Ohne Schulform: alle drei.
 */
export function stufenFuerSchulform(schulform: string | undefined | null): Stufe[] {
  const s = String(schulform ?? '').toLowerCase()
  if (!s) return [...STUFEN]
  if (/gymnas/.test(s)) return ['m', 'a']
  if (/haupt|mittelschule|foerder|förder|werkreal/.test(s)) return ['g']
  return ['g', 'm']
}
export const stufenBereinigt = (x: unknown): Stufe[] | undefined => {
  const l = Array.isArray(x) ? STUFEN.filter((s) => x.includes(s)) : []
  return l.length ? l : undefined
}

// ---------------------------------------------------------------- Schlüssel

/**
 * Kern einer Aufgabe zum Erkennen von Dopplungen (13.10.2026, Wunsch der Lehrkraft): derselbe Satz (bzw. dieselben Teile)
 * mit derselben ersten Lösung – unabhängig von Groß-/Kleinschreibung, Satzzeichen und Leerzeichen. Leer = nicht vergleichbar.
 */
export function aufgabeKern(a: { satz?: string; teile?: string[]; loesungen?: string[] }): string {
  const n = (s: unknown): string =>
    String(s ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const text = n(a.satz) || n((a.teile ?? []).join(' '))
  return text ? `${text}|${n(a.loesungen?.[0])}` : ''
}

/** Ohne Dopplungen (die erste bleibt); `schon` = Kerne, die es anderswo schon gibt (z. B. in der Bank) */
export function ohneDoppelte<T extends { satz?: string; teile?: string[]; loesungen?: string[] }>(l: readonly T[], schon: Set<string> = new Set()): T[] {
  const da = new Set(schon)
  return l.filter((a) => {
    const k = aufgabeKern(a)
    if (!k) return true
    if (da.has(k)) return false
    da.add(k)
    return true
  })
}

export const MIX = 'mix:'
export const UNIT = 'unit:'
/** Gemischte Aufgaben eines Grammatikpunkts: seine Kennungen (sortiert) */
export const mixSchluessel = (kennungen: readonly string[]): string => `${MIX}${[...new Set(kennungen)].sort().join('+')}`
/** Gemischte Wiederholung einer Unit */
export const unitSchluessel = (band: string, unit: string): string => `${UNIT}${band}|${unit}`
export const istMix = (s: string): boolean => s.startsWith(MIX) || s.startsWith(UNIT)
/** Kennungen hinter einem Mix-Schlüssel (Unit: leer – die kennt nur die Lehrwerk-Liste) */
export const mixKennungen = (s: string): string[] => (s.startsWith(MIX) ? s.slice(MIX.length).split('+').filter(Boolean) : [])
/** Band und Unit eines Unit-Schlüssels */
export function unitVon(s: string): { band: string; unit: string } | null {
  if (!s.startsWith(UNIT)) return null
  const [band, unit] = s.slice(UNIT.length).split('|')
  return band && unit ? { band, unit } : null
}
/** Form (Katalogthema) eines Teilbereichs; Mix: '' */
export const formVon = (s: string): string => (istMix(s) ? '' : s.split('/')[0])
/** Ist der Schlüssel brauchbar? (Kennungen wie im Katalog, Mix aus solchen, Unit mit Band und Unit) */
export function schluesselGueltig(s: unknown): s is string {
  if (typeof s !== 'string' || !s || s.length > 400) return false
  const kennung = (k: string): boolean => /^[a-z]{2,3}\.[a-z0-9_.-]+(\/[a-z0-9_-]+)?$/i.test(k)
  if (s.startsWith(MIX)) {
    const k = mixKennungen(s)
    return k.length >= 1 && k.every(kennung)
  }
  if (s.startsWith(UNIT)) return Boolean(unitVon(s)) && !/[\n\r]/.test(s)
  return kennung(s)
}

/** Kennung der Regelkarte eines Schlüssels (fest, damit der Lernstand bleibt): „t" + Prüfsumme */
export function regelIdVon(schluessel: string): string {
  let h = 2166136261
  for (let i = 0; i < schluessel.length; i++) {
    h ^= schluessel.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `t${(h >>> 0).toString(36)}`
}

// ---------------------------------------------------------------- Einträge und Pakete

export interface BankRegel {
  titel: string
  erklaerung: string
  beispiele: string[]
}
/** Eine Aufgabe der Bank: wie im Training, dazu die Übungsart (und die Stufe); `id` ist die feste Kennung der Bank („b…") */
export type BankAufgabe = GrammatikAufgabe & { uebung: Uebung }
export interface BankEintrag {
  schluessel: string
  regel: BankRegel
  aufgaben: BankAufgabe[]
}

/** Zahlen je Schlüssel und Übungsart (Übersicht im Pop-up), dazu je Übungsart und Stufe */
export type BankZahlen = Record<string, Partial<Record<Uebung, number>> & { stufen?: Partial<Record<Uebung, Partial<Record<Stufe, number>>>> }>

/** Kern-Aufgaben eines Eintrags */
export const kernZahl = (z: Partial<Record<Uebung, number>> | undefined): number => KERN_UEBUNGEN.reduce((n, u) => n + (z?.[u] ?? 0), 0)

/**
 * Paket eines Kurs-Trainings aus Bank-Einträgen: je Schlüssel mit Aufgaben eine Regelkarte (Kennung `regelIdVon`, mit
 * Schlüssel als `kennung`), die Aufgaben in Teilbereich- und Übungs-Reihenfolge mit Stufe (Erkennen vor Bilden).
 */
export function bankPaket(thema: string, eintraege: readonly BankEintrag[], stufen?: readonly Stufe[]): GrammatikPaket {
  const regeln: GrammatikRegel[] = []
  const aufgaben: GrammatikAufgabe[] = []
  const reserve: GrammatikAufgabe[] = []
  // Förderreserve (13.10.2026): Übt der Kurs nicht „grundlegend", liegen die grundlegenden Aufgaben als Reserve bereit
  const mitReserve = Boolean(stufen?.length && !stufen.includes('g'))
  for (const e of eintraege) {
    const passend = stufen?.length ? e.aufgaben.filter((a) => stufen.includes(stufeVon(a))) : e.aufgaben
    if (!passend.length) continue
    if (mitReserve)
      for (const a of e.aufgaben.filter((x) => stufeVon(x) === 'g')) reserve.push({ ...a, regelId: regelIdVon(e.schluessel), stufe: uebungStufe(a.uebung) })
    const regelId = regelIdVon(e.schluessel)
    regeln.push({
      id: regelId,
      titel: e.regel.titel || e.schluessel,
      erklaerung: e.regel.erklaerung || e.regel.titel || e.schluessel,
      beispiele: e.regel.beispiele,
      kennung: e.schluessel
    })
    // Übungsart, darin vom Leichten zum Schweren
    const sortiert = [...passend].sort(
      (a, b) => UEBUNGEN.indexOf(a.uebung) - UEBUNGEN.indexOf(b.uebung) || STUFEN.indexOf(stufeVon(a)) - STUFEN.indexOf(stufeVon(b))
    )
    for (const a of sortiert) aufgaben.push({ ...a, regelId, stufe: uebungStufe(a.uebung) })
  }
  return { thema, regeln, aufgaben, ...(reserve.length ? { reserve } : {}) }
}

// ---------------------------------------------------------------- „sicher" (13.10.2026, Entscheidung der Lehrkraft)

/** Je Kern-Übungsart: mindestens so viele verschiedene Aufgaben (bzw. alle, wenn es weniger gibt) */
export const MIN_JE_UEBUNG = 5
/** Ab so vielen offenen späteren Fehlern im Teilbereich gilt er nicht mehr als sicher */
export const SPAETER_FEHLER_AB = 2
/** Form sicher: so viele ihrer Teilbereiche sicher (und keiner schwach) */
export const FORM_TEILE_SICHER_AB = 0.8
