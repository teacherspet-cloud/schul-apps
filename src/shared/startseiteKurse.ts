/**
 * Startseite der Lehrkraft, Karte „Termine & Vokabeltraining" und Kasten „Meine Klassen" (10.10.2026, Wunsch der
 * Lehrkraft). Zweite Fassung (10.10.2026, Befund: „zu unübersichtlich"):
 *  a) EINE Zeile je laufendem Kurs – „7b · Englisch", kleiner Balken mit „64 %" (sicher) und höchstens EIN Abzeichen mit
 *     dem Wichtigsten: Test bald („Test Fr" / „Test morgen" / „Test heute") > „n nicht geübt" (7 Tage) > „n Problemwörter"
 *     (ab 3) > sonst ein stilles ✓. Keine Zeile „heute geübt", keine eigenen Hinweis- oder Grammatikzeilen (die stehen im
 *     Kurs).
 *  b) „Demnächst": Vokabeltests der Kurse und Haltepunkte der Unterrichtsreihen mit Datum, zeitlich geordnet, nur heute
 *     und später (Haltepunkte ohne Stundentermin stehen hinten, ohne Datum).
 * Rein rechnend; der Server (server/startseite.ts) liefert die Kurse mit EINER Anfrage, die Haltepunkte kommen mit den
 * laufenden Reihen (server/reihen.ts › laufend).
 */
import { abschnitteEinordnen, type KursTeil } from './kursAbschnitte'
import type { HinweisReiter } from './kursHinweise'
import type { Reihe } from './reihe'
import { tagVon, unterrichtsTage, wochentag } from './schulkalender'

const TAG = 86_400_000

/** Das eine Abzeichen einer Kurszeile */
export interface StartAbzeichen {
  art: 'test' | 'inaktiv' | 'problem' | 'leer' | 'ok'
  /** „Test Fr", „3 nicht geübt", „12 Problemwörter", „✓" */
  text: string
  /** Reiter des Kurses, in den ein Klick auf das Abzeichen führt (fehlt = Kurs öffnen) */
  reiter?: HinweisReiter
  /** Art des Hinweises für den Sprung an die Stelle (kursFokus) */
  hinweis?: string
  /** Betroffene (Kennungen) – Sprung an die Stelle */
  ids?: string[]
}

export interface StartKurs {
  id: string
  gruppeId: string
  /** „7b" */
  gruppe: string
  /** „Englisch" */
  fach: string
  /** Zuletzt freigeschalteter Abschnitt „Green Line 3 Unit 2" */
  abschnitt: string
  /** Kurz für „Demnächst": „Unit 2" */
  einheit: string
  woerter: number
  /** Anteil sicher im Schnitt der Lernenden (0–1); null ohne Wörter */
  sicher: number | null
  lernende: number
  testTermin: number | null
  abzeichen: StartAbzeichen
}

export interface StartKlasse {
  schluessel: string
  name: string
  /** Erste Lerngruppe der Klasse (öffnet die Klasse) */
  gruppeId: string
  faecher: { id: string; fach: string }[]
}

export interface StartseiteDaten {
  kurse: StartKurs[]
  klassen: StartKlasse[]
}

function einordnen(teile: KursTeil[], jetzt: number): { buch?: string; unit?: string; name?: string } | null {
  const frei = teile.filter((t) => !t.zeit || t.zeit <= jetzt)
  return frei.length ? abschnitteEinordnen(frei, null)[frei.length - 1] : null
}

/** Zuletzt freigeschalteter Abschnitt als „Green Line 3 Unit 2" (ohne Lehrwerk: Abschnittsname, sonst die Bände) */
export function abschnittText(teile: KursTeil[], baende: string, titel: string, jetzt = Date.now()): string {
  const e = einordnen(teile, jetzt)
  if (!e) return baende || titel
  const buch = e.buch || (e.unit ? baende : '')
  const text = e.unit ? [buch, e.unit].filter(Boolean).join(' ') : ''
  return text || baende || e.name || titel
}

/** Kurz für „Demnächst": nur die Unit („Unit 2"), sonst wie `abschnittText` */
export function einheitText(teile: KursTeil[], baende: string, titel: string, jetzt = Date.now()): string {
  return einordnen(teile, jetzt)?.unit || abschnittText(teile, baende, titel, jetzt)
}

/** Kopf einer Kurszeile: „7b · Englisch" */
export const kursKopf = (gruppe: string, fach: string): string => [gruppe.trim(), fach.trim()].filter(Boolean).join(' · ')

// ---------------------------------------------------------------- Tage

/** Ganze Kalendertage von `heute` bis `tag` (beide „JJJJ-MM-TT") */
export const tageBis = (tag: string, heute: string): number => Math.round((Date.parse(`${tag}T12:00:00Z`) - Date.parse(`${heute}T12:00:00Z`)) / TAG)

const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
/** „Fr 17.10." */
export const tagKurz = (tag: string): string => `${WT[wochentag(tag) - 1]} ${tag.slice(8, 10)}.${tag.slice(5, 7)}.`

/** „Test heute" / „Test morgen" / „Test Fr" – nur in den nächsten 7 Tagen, sonst null */
export function testBaldText(termin: number | null | undefined, jetzt = Date.now()): string | null {
  if (!termin) return null
  const tag = tagVon(termin)
  const n = tageBis(tag, tagVon(jetzt))
  if (n < 0 || n > 7) return null
  return n === 0 ? 'Test heute' : n === 1 ? 'Test morgen' : `Test ${WT[wochentag(tag) - 1]}`
}

// ---------------------------------------------------------------- Abzeichen

/**
 * Das EINE Abzeichen einer Kurszeile nach Vorrang: Test bald > nicht geübt (Lernende ohne Übung seit 7 Tagen) >
 * Problemwörter (ab 3) > ✓. Ein Kurs ohne Lernende zeigt statt ✓ ein stilles „leer".
 */
export function kursAbzeichen(
  k: { testTermin: number | null; inaktiv: string[]; problem: number; lernende: number },
  jetzt = Date.now()
): StartAbzeichen {
  const test = testBaldText(k.testTermin, jetzt)
  if (test) return { art: 'test', text: test, reiter: 'vokabeln', hinweis: 'termin' }
  if (k.inaktiv.length) return { art: 'inaktiv', text: `${k.inaktiv.length} nicht geübt`, reiter: 'lernende', hinweis: 'inaktiv', ids: k.inaktiv }
  if (k.problem >= 3) return { art: 'problem', text: `${k.problem} Problemwörter`, reiter: 'vokabeln', hinweis: 'problem' }
  if (!k.lernende) return { art: 'leer', text: 'leer', reiter: 'lernende', hinweis: 'leer' }
  return { art: 'ok', text: '✓' }
}

// ---------------------------------------------------------------- Demnächst

export interface DemnaechstEintrag {
  /** „JJJJ-MM-TT"; null = Haltepunkt ohne Stundentermin */
  tag: string | null
  art: 'test' | 'halt'
  /** „Vokabeltest 7b – Unit 2" bzw. „Haltepunkt „Julikrise" (9c)" */
  text: string
  /** Kurs (Vokabeltest) bzw. Zuweisung der Reihe (Haltepunkt) */
  ziel: string
}

export const vokabeltestText = (gruppe: string, einheit: string): string => (einheit ? `Vokabeltest ${gruppe} – ${einheit}` : `Vokabeltest ${gruppe}`)
export const haltepunktText = (titel: string, gruppe: string): string => `Haltepunkt „${titel}"${gruppe ? ` (${gruppe})` : ''}`

/**
 * Offene Haltepunkte einer Reihe mit dem Tag ihrer Stunde (Stundentermine der Reihe, Ferien übersprungen) – ohne
 * Stundentermin bzw. ohne Stunde: tag = null.
 */
export function haltepunktTermine(
  r: Pick<Reihe, 'schritte' | 'stunden' | 'stundenTermine'>,
  frei: string[] = []
): { titel: string; tag: string | null }[] {
  const t = r.stundenTermine
  const tage = t && r.stunden?.length ? unterrichtsTage(t.beginn, t.tage, r.stunden.length) : []
  return (r.schritte ?? [])
    .filter((s) => s.halt?.art === 'freigabe' && !frei.includes(s.id))
    .map((s) => ({ titel: s.titel, tag: s.stunde !== undefined ? (tage[s.stunde] ?? null) : null }))
}

/**
 * „Demnächst": Vokabeltests der Kurse und Haltepunkte der Reihen – nur heute und später, zeitlich geordnet (am selben
 * Tag Tests zuerst), Haltepunkte ohne Datum am Ende.
 */
export function demnaechst(
  kurse: Pick<StartKurs, 'id' | 'gruppe' | 'einheit' | 'testTermin'>[],
  reihen: { zid: string; gruppe: string; halteTermine?: { titel: string; tag: string | null }[] }[],
  jetzt = Date.now()
): DemnaechstEintrag[] {
  const heute = tagVon(jetzt)
  const liste: DemnaechstEintrag[] = [
    ...kurse.flatMap((k) => (k.testTermin ? [{ tag: tagVon(k.testTermin), art: 'test' as const, text: vokabeltestText(k.gruppe, k.einheit), ziel: k.id }] : [])),
    ...reihen.flatMap((r) => (r.halteTermine ?? []).map((h) => ({ tag: h.tag, art: 'halt' as const, text: haltepunktText(h.titel, r.gruppe), ziel: r.zid })))
  ]
  const rang = (e: DemnaechstEintrag): string => `${e.tag ?? '9999-99-99'}${e.art === 'test' ? 0 : 1}`
  return liste.filter((e) => !e.tag || e.tag >= heute).sort((a, b) => (rang(a) < rang(b) ? -1 : rang(a) > rang(b) ? 1 : 0))
}

// ---------------------------------------------------------------- Anzahl je Karte (Smartphone)

/** Wahl der Anzahl: 0 = alle */
export const ANZAHL_WAHL = [5, 10, 20, 0] as const
export const ANZAHL_VORGABE = 5

/** Gespeicherten Wert lesen: nur erlaubte Werte, sonst die Vorgabe */
export function anzahlAus(roh: string | null | undefined): number {
  const n = Number(roh)
  return roh != null && roh !== '' && (ANZAHL_WAHL as readonly number[]).includes(n) ? n : ANZAHL_VORGABE
}

export const anzahlText = (n: number): string => (n === 0 ? 'alle' : String(n))

/** Die ersten `n` (0 = alle) */
export const begrenzt = <T>(liste: T[], n: number): T[] => (n === 0 ? liste : liste.slice(0, n))
