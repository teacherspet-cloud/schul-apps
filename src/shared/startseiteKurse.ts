/**
 * Startseite der Lehrkraft, Karte „Termine & Vokabeltraining" und Kasten „Meine Klassen" (10.10.2026, Wunsch der
 * Lehrkraft). Befund: Die Karte zeigte nur Kurse mit Testtermin – laufende Kurse ohne Termin fehlten ganz. Jetzt, in
 * dieser Reihenfolge:
 *  a) Testtermine mit Prognose (zeitkritisch zuerst),
 *  b) jeder laufende Vokabelkurs als Zeile „7b – Englisch · Green Line 3 Unit 2" mit „64 % sicher" und „heute geübt",
 *  c) Handlungsbedarf der Kurse (dieselbe Quelle wie Kursseite und „Meine Klassen": shared/kursHinweise.ts) – knapp,
 *     ohne Namen, ein Klick öffnet den Kurs im passenden Reiter,
 *  d) freigegebene Grammatik je Kurs mit Stand und die Haltepunkte der Unterrichtsreihen.
 * Rein rechnend; der Server (server/startseite.ts) liefert alles mit EINER Anfrage.
 */
import { abschnitteEinordnen, type KursTeil } from './kursAbschnitte'
import type { HinweisReiter } from './kursHinweise'

const TAG = 86_400_000

/** Knapper Hinweis eines Kurses auf der Startseite */
export interface StartHinweis {
  /** Art (kursHinweise: schwach, foerdern, inaktiv, leer …; dazu „problem" und „endet") */
  hinweis: string
  text: string
  reiter: HinweisReiter
  farbe: string
  /** Betroffene (Kennungen) – Sprung an die Stelle (kursFokus) */
  ids?: string[]
}

export interface StartGrammatik {
  id: string
  titel: string
  status: 'laeuft' | 'geplant'
  /** Anteil sicherer Aufgaben (0–1) */
  sicher: number
  geplantAb: number | null
}

export interface StartKurs {
  id: string
  gruppeId: string
  /** „7b – Englisch · Green Line 3 Unit 2" */
  titel: string
  woerter: number
  /** Anteil sicher im Schnitt der Lernenden (0–1); null ohne Wörter */
  sicher: number | null
  lernende: number
  heute: number
  testTermin: number | null
  hinweise: StartHinweis[]
  grammatik: StartGrammatik[]
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

/** Zuletzt freigeschalteter Abschnitt als „Green Line 3 Unit 2" (ohne Lehrwerk: Abschnittsname, sonst die Bände) */
export function abschnittText(teile: KursTeil[], baende: string, titel: string, jetzt = Date.now()): string {
  const frei = teile.filter((t) => !t.zeit || t.zeit <= jetzt)
  if (!frei.length) return baende || titel
  const e = abschnitteEinordnen(frei, null)[frei.length - 1]
  const buch = e.buch || (e.unit ? baende : '')
  const text = e.unit ? [buch, e.unit].filter(Boolean).join(' ') : ''
  return text || baende || e.name || titel
}

/** Zeilentitel eines Kurses: „7b – Englisch · Green Line 3 Unit 2" */
export function kursZeilenTitel(gruppe: string, fach: string, abschnitt: string): string {
  const kopf = [gruppe.trim(), fach.trim()].filter(Boolean).join(' – ')
  return abschnitt ? `${kopf} · ${abschnitt}` : kopf
}

const lernendeWort = (n: number): string => (n === 1 ? '1 Lernende/r' : `${n} Lernende`)

/**
 * Hinweis der Kursseite (shared/kursHinweise.ts) in knapper Form ohne Namen; `termin` steht schon oben (a) → null.
 * `anzahl`: Zahl der Betroffenen (ids), falls bekannt.
 */
export function hinweisKurz(hinweis: string, anzahl: number | undefined, text: string): string | null {
  const n = anzahl ?? 0
  switch (hinweis) {
    case 'termin':
      return null
    case 'inaktiv':
      return n ? `${lernendeWort(n)} seit 7 Tagen nicht geübt` : text
    case 'schwach':
      return n ? `${lernendeWort(n)} unter 30 % sicher` : text
    case 'foerdern':
      return n ? `${lernendeWort(n)} mit Grammatik-Schwäche – Fördern` : text
    case 'leer':
      return 'Noch niemand im Kurs'
    default:
      return text
  }
}

/** Problemwörter des Kurses (wackelig bei mehreren) – ab 3 ein Hinweis */
export function problemHinweis(anzahl: number): StartHinweis | null {
  if (anzahl < 3) return null
  return { hinweis: 'problem', text: `${anzahl} Problemwörter`, reiter: 'vokabeln', farbe: 'orange' }
}

/** Kurs endet bald (Enddatum in den nächsten 7 Tagen) */
export function endetHinweis(bis: number | null | undefined, jetzt = Date.now()): StartHinweis | null {
  if (!bis || bis < jetzt || bis - jetzt > 7 * TAG) return null
  return {
    hinweis: 'endet',
    text: `Kurs endet am ${new Date(bis).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}`,
    reiter: 'einstellungen',
    farbe: 'gray'
  }
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
