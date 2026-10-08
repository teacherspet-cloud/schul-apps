/**
 * Prüfung beim Einreichen eines freigegebenen Arbeitsblatts (08.10.2026, Entscheidung der Lehrkraft: „Beim Einreichen
 * bekommen die Lernenden alles auf einmal").
 *
 *  - Feste Lösungen (Ankreuzen, Richtig/Falsch, Lücken, Zuordnen, Ordnen) prüft der Server OHNE KI: ✓/✗ an jedem
 *    Kästchen und Feld. Grundlage ist der Lösungsschlüssel je Aufgabe (`AufgabenSchluessel`, beim Freigeben aus dem
 *    Blatt erzeugt – arbeitsblatt/blattSchluessel.ts); ältere Freigaben ohne Schlüssel lesen ihn aus der Erwartung
 *    (generation/describe.ts: „[richtig]", „(richtig)", „[[Lösung]]").
 *  - Welche Stelle des Schlüssels ein Feld ist, misst das Gerät der Lernenden (`BlattFeld.bezug`, z. B. „0.mc.2" =
 *    Teilaufgabe a, Ankreuzen, Möglichkeit c; „-1" = Aufgabe ohne Teilaufgaben).
 *  - Offene Aufgaben bewertet die KI in EINER Anfrage je Einreichung (`abgabeAufgabenAnfrage`): Ampel + kurzer Hinweis.
 *
 * Reine Rechnungen ohne Datenbank (Tests: tests/blattPruefung.test.ts).
 */
import type { StructuredRequest } from './types'
import type { BlattAufgabe, BlattFeld } from './blattFreigabe'

export type SchluesselTeil =
  | { teil: number; art: 'mc'; optionen: string[]; richtig: number[] }
  | { teil: number; art: 'rf'; aussagen: string[]; werte: boolean[] }
  | { teil: number; art: 'luecke'; loesungen: string[] }
  /** Zuordnen: je Zeile links der Index der passenden Möglichkeit rechts (a = 0) */
  | { teil: number; art: 'zuordnen'; paare: number[] }
  /** Ordnen: je angezeigter Zeile die richtige Nummer (1 …) */
  | { teil: number; art: 'ordnen'; nummern: number[] }

export interface AufgabenSchluessel {
  teile: SchluesselTeil[]
}

export type SchluesselArt = SchluesselTeil['art']

/** Stelle eines Feldes im Schlüssel: Teilaufgabe (-1 = ohne), Art, Index (Möglichkeit, Lücke, Zeile), ggf. Spalte */
export interface Bezug {
  teil: number
  art: SchluesselArt
  i: number
  spalte?: number
}

const BEZUG = /^(-1|\d{1,2})\.(mc|rf|luecke|zuordnen|ordnen)\.(\d{1,3})(?:\.(\d{1,2}))?$/

export function bezugAus(roh: unknown): Bezug | null {
  const m = BEZUG.exec(String(roh ?? ''))
  if (!m) return null
  return { teil: Number(m[1]), art: m[2] as SchluesselArt, i: Number(m[3]), ...(m[4] !== undefined ? { spalte: Number(m[4]) } : {}) }
}

export const bezugText = (b: Bezug): string => `${b.teil}.${b.art}.${b.i}${b.spalte !== undefined ? `.${b.spalte}` : ''}`

// ---------------------------------------------------------------- Lücken vergleichen

/** Vergleichbar machen: klein, typografische Zeichen vereinheitlicht, Leerraum zusammengefasst, Satzzeichen am Ende weg */
export const normLuecke = (t: string): string =>
  t
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim()

/** Stimmt der Eintrag mit der Lösung überein? Mehrere Lösungen mit „/", Eingeklammertes ist freiwillig */
export function lueckeRichtig(eintrag: string, loesung: string): boolean {
  const e = normLuecke(eintrag)
  if (!e) return false
  const varianten = new Set<string>()
  for (const l of [loesung, ...loesung.split(/\s*\/\s*/)]) {
    varianten.add(normLuecke(l))
    varianten.add(normLuecke(l.replace(/\([^)]*\)/g, ' ')))
    varianten.add(normLuecke(l.replace(/[()]/g, '')))
  }
  varianten.delete('')
  return varianten.has(e)
}

// ---------------------------------------------------------------- Schlüssel aus der Erwartung (ältere Freigaben)

/** Lücken „[[…]]" wie im Blatt (render/Answers.tsx: gapRenderText) */
export const lueckenLoesungen = (text: string): string[] => [...text.matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1].trim())

/**
 * Schlüssel aus dem Text der Erwartung (generation/describe.ts) – für Freigaben, die vor dem 08.10.2026 ohne
 * `schluessel` gespeichert wurden. Ankreuzen, Richtig/Falsch und Lücken; Zuordnen nur mit Schlüssel.
 */
export function schluesselAusErwartung(erwartung: string): AufgabenSchluessel | undefined {
  const teile: SchluesselTeil[] = []
  // Abschnitte: Kopf (mit der Antwortform der Aufgabe ohne Teilaufgaben), je Teilaufgabe „  a) …", Lösung, Vorgaben
  const stuecke = erwartung.split(/\n(?= {2}(?:[a-z]\) |Lösung: |Vorgaben: ))/)
  const mitTeilen = stuecke.some((s) => /^ {2}[a-z]\) /.test(s))
  for (const s of stuecke) {
    const t = /^ {2}([a-z])\) /.exec(s)
    let teil: number
    let rest: string
    if (t) {
      teil = t[1].charCodeAt(0) - 97
      rest = s
    } else if (/^Aufgabe/.test(s) && !mitTeilen) {
      teil = -1
      const k = s.indexOf('\n')
      if (k < 0) continue
      rest = s.slice(k)
    } else continue
    const ende = (x: string): string => x.split(' – Lösung: ')[0]
    const mc = /Multiple Choice: ([\s\S]*)/.exec(rest)
    if (mc) {
      const optionen = ende(mc[1]).split(' | ')
      const richtig = optionen.flatMap((o, i) => (o.startsWith('[richtig] ') ? [i] : []))
      if (optionen.length > 1 && richtig.length) teile.push({ teil, art: 'mc', optionen: optionen.map((o) => o.replace(/^\[richtig\] /, '').trim()), richtig })
      continue
    }
    const rf = /Richtig\/falsch: ([\s\S]*)/.exec(rest)
    if (rf) {
      const aussagen: string[] = []
      const werte: boolean[] = []
      for (const m of ende(rf[1]).matchAll(/(.*?) \((richtig|falsch)\)(?:; |\s*$)/g)) {
        aussagen.push(m[1].trim())
        werte.push(m[2] === 'richtig')
      }
      if (werte.length) teile.push({ teil, art: 'rf', aussagen, werte })
      continue
    }
    const lt = /Lückentext: ([\s\S]*)/.exec(rest)
    if (lt) {
      const loesungen = lueckenLoesungen(ende(lt[1]))
      if (loesungen.length) teile.push({ teil, art: 'luecke', loesungen })
    }
  }
  return teile.length ? { teile } : undefined
}

/** Schlüssel aus einer Anfrage begrenzen (Server beim Freigeben) */
export function schluesselBereinigt(roh: unknown): AufgabenSchluessel | undefined {
  const liste = (roh as { teile?: unknown } | null)?.teile
  if (!Array.isArray(liste)) return undefined
  const text = (x: unknown): string => String(x ?? '').slice(0, 400)
  const zahlen = (x: unknown, max: number): number[] =>
    (Array.isArray(x) ? x : [])
      .slice(0, 200)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= max)
  const teile = liste.slice(0, 40).flatMap((x): SchluesselTeil[] => {
    const t = (x ?? {}) as Record<string, unknown>
    const teil = Number(t.teil)
    if (!Number.isInteger(teil) || teil < -1 || teil > 60) return []
    switch (t.art) {
      case 'mc': {
        const optionen = (Array.isArray(t.optionen) ? t.optionen : []).slice(0, 30).map(text)
        const richtig = zahlen(t.richtig, optionen.length - 1)
        return optionen.length && richtig.length ? [{ teil, art: 'mc', optionen, richtig }] : []
      }
      case 'rf': {
        const werte = (Array.isArray(t.werte) ? t.werte : []).slice(0, 100).map((w) => w === true)
        const aussagen = (Array.isArray(t.aussagen) ? t.aussagen : []).slice(0, 100).map(text)
        return werte.length ? [{ teil, art: 'rf', aussagen, werte }] : []
      }
      case 'luecke': {
        const loesungen = (Array.isArray(t.loesungen) ? t.loesungen : []).slice(0, 200).map(text)
        return loesungen.length ? [{ teil, art: 'luecke', loesungen }] : []
      }
      case 'zuordnen': {
        const paare = zahlen(t.paare, 25)
        return paare.length ? [{ teil, art: 'zuordnen', paare }] : []
      }
      case 'ordnen': {
        const nummern = zahlen(t.nummern, 200)
        return nummern.length ? [{ teil, art: 'ordnen', nummern }] : []
      }
      default:
        return []
    }
  })
  return teile.length ? { teile } : undefined
}

export const schluesselVon = (a: BlattAufgabe): AufgabenSchluessel | undefined => a.schluessel ?? schluesselAusErwartung(a.erwartung ?? '')

// ---------------------------------------------------------------- automatische Prüfung

/** r = richtig, f = falsch, fehlt = richtige Möglichkeit nicht angekreuzt bzw. Lücke leer (nur nach der letzten Runde) */
export type Marke = 'r' | 'f' | 'fehlt'

/** Marke eines Feldes mit dem Wert beim Einreichen – ändert die Person das Feld danach, verschwindet die Marke */
export interface FeldMarke {
  m: Marke
  w: string
}

export interface AufgabeAuto {
  /** Geprüfte Einheiten (Frage, Aussage, Lücke, Zeile) und davon richtig */
  richtig: number
  gesamt: number
  /** Alle Felder der Aufgabe sind automatisch geprüft – die KI braucht es nicht */
  nurAuto: boolean
}

export interface AutoErgebnis {
  marken: Record<string, FeldMarke>
  /** Je Aufgabennummer (nur Aufgaben mit geprüften Einheiten) */
  aufgaben: Record<string, AufgabeAuto>
}

const angekreuzt = (w: string | undefined): boolean => Boolean((w ?? '').trim())

/** Buchstabe einer Zuordnung („b", „B)", „b )") → Index */
const buchstabe = (w: string): number | null => {
  const m = /^\s*([a-z])\s*\)?\s*$/i.exec(w)
  return m ? m[1].toLowerCase().charCodeAt(0) - 97 : null
}

/**
 * Felder mit festen Lösungen prüfen. `letzteRunde`: auch Fehlendes markieren (nicht angekreuzte richtige Möglichkeit,
 * leere Lücke) – vorher nicht, sonst verriete die Marke die Lösung für die nächste Runde.
 */
export function autoPruefen(
  aufgaben: BlattAufgabe[],
  felder: BlattFeld[],
  antworten: Record<string, string>,
  opts: { letzteRunde?: boolean } = {}
): AutoErgebnis {
  const marken: Record<string, FeldMarke> = {}
  const ergebnis: Record<string, AufgabeAuto> = {}
  const wert = (f: BlattFeld): string => antworten[f.id] ?? ''
  const marke = (f: BlattFeld, m: Marke): void => void (marken[f.id] = { m, w: wert(f) })
  for (const a of aufgaben) {
    const s = schluesselVon(a)
    if (!s) continue
    const eigene = felder.filter((f) => f.nr === a.nr)
    const mitBezug = eigene.flatMap((f) => {
      const b = bezugAus(f.bezug)
      return b ? [{ f, b }] : []
    })
    const geprueft = new Set<string>()
    let richtig = 0
    let gesamt = 0
    for (const t of s.teile) {
      const fs = mitBezug.filter((x) => x.b.teil === t.teil && x.b.art === t.art)
      const an = (i: number, spalte?: number): BlattFeld | undefined => fs.find((x) => x.b.i === i && x.b.spalte === spalte)?.f
      // Nur prüfen, wenn das Blatt genau die Felder hat, die der Schlüssel erwartet – sonst ginge die Zuordnung schief
      if (t.art === 'mc') {
        const opt = t.optionen.map((_, i) => an(i))
        if (fs.length !== t.optionen.length || opt.some((f) => !f)) continue
        const gewaehlt = opt.flatMap((f, i) => (angekreuzt(wert(f!)) ? [i] : []))
        gesamt++
        if (gewaehlt.length === t.richtig.length && gewaehlt.every((i) => t.richtig.includes(i))) richtig++
        opt.forEach((f, i) => {
          geprueft.add(f!.id)
          if (gewaehlt.includes(i)) marke(f!, t.richtig.includes(i) ? 'r' : 'f')
          else if (opts.letzteRunde && t.richtig.includes(i)) marke(f!, 'fehlt')
        })
      } else if (t.art === 'rf') {
        const zeilen = t.werte.map((_, i) => [an(i, 0), an(i, 1)])
        if (fs.length !== t.werte.length * 2 || zeilen.some((z) => !z[0] || !z[1])) continue
        zeilen.forEach((z, i) => {
          const soll = t.werte[i] ? 0 : 1
          const gewaehlt = [0, 1].filter((k) => angekreuzt(wert(z[k]!)))
          gesamt++
          const ok = gewaehlt.length === 1 && gewaehlt[0] === soll
          if (ok) richtig++
          for (const k of [0, 1]) {
            geprueft.add(z[k]!.id)
            if (gewaehlt.includes(k)) marke(z[k]!, ok ? 'r' : 'f')
            else if (opts.letzteRunde && k === soll && !ok) marke(z[k]!, 'fehlt')
          }
        })
      } else {
        const soll: string[] = t.art === 'luecke' ? t.loesungen : t.art === 'zuordnen' ? t.paare.map(String) : t.nummern.map(String)
        const reihe = soll.map((_, i) => an(i))
        if (fs.length !== soll.length || reihe.some((f) => !f)) continue
        reihe.forEach((f, i) => {
          const w = wert(f!)
          geprueft.add(f!.id)
          gesamt++
          const ok =
            t.art === 'luecke'
              ? lueckeRichtig(w, soll[i])
              : t.art === 'zuordnen'
                ? buchstabe(w) === t.paare[i]
                : /^\s*\d{1,3}\s*\.?\s*$/.test(w) && parseInt(w, 10) === t.nummern[i]
          if (ok) richtig++
          if (w.trim()) marke(f!, ok ? 'r' : 'f')
          else if (opts.letzteRunde) marke(f!, 'fehlt')
        })
      }
    }
    if (gesamt) ergebnis[String(a.nr)] = { richtig, gesamt, nurAuto: eigene.length > 0 && eigene.every((f) => geprueft.has(f.id)) }
  }
  return { marken, aufgaben: ergebnis }
}

export type Einschaetzung = 'sicher' | 'teilweise' | 'noch nicht'

/** Ampel aus dem Anteil richtiger Einheiten: alles = sicher, mindestens die Hälfte = teilweise */
export function einschaetzungAus(richtig: number, gesamt: number): Einschaetzung {
  if (gesamt > 0 && richtig >= gesamt) return 'sicher'
  if (gesamt > 0 && richtig / gesamt >= 0.5) return 'teilweise'
  return 'noch nicht'
}

/** Kurzer Hinweis zur automatisch geprüften Aufgabe */
export function autoHinweis(richtig: number, gesamt: number, letzteRunde: boolean): string {
  if (richtig >= gesamt) return `Alles richtig (${richtig} von ${gesamt}).`
  return `${richtig} von ${gesamt} richtig. ${
    letzteRunde ? 'Die richtigen Stellen sind jetzt markiert – sieh sie dir an.' : 'Sieh dir die rot markierten Stellen noch einmal an.'
  }`
}

// ---------------------------------------------------------------- Feedback je Aufgabe beim Einreichen

/** Eintrag im Feedback-Verlauf einer Aufgabe, der beim Einreichen entsteht (neben „Aufgabe prüfen lassen") */
export interface AbgabeFeedback {
  einschaetzung: Einschaetzung
  /** Kurzer Hinweis */
  text: string
  zeit: number
  /** Nummer der Einreichung */
  abgabe: number
  /** Automatisch geprüft: richtige und geprüfte Einheiten */
  auto?: { richtig: number; gesamt: number }
  /** ✓/✗ je Feld dieser Aufgabe */
  marken?: Record<string, FeldMarke>
}

/** Feedback-Runden „prüfen lassen" – die Einträge vom Einreichen zählen nicht mit */
export const pruefRunden = (liste: readonly object[] | undefined): number => (liste ?? []).filter((x) => !(x as { abgabe?: unknown }).abgabe).length

/** Marken aller Felder aus dem jeweils letzten Einreichen-Eintrag je Aufgabe */
export function markenAusVerlauf(verlauf: Record<string, { abgabe?: unknown; marken?: Record<string, FeldMarke> }[] | undefined>): Record<string, FeldMarke> {
  const aus: Record<string, FeldMarke> = {}
  for (const liste of Object.values(verlauf ?? {})) {
    const e = [...(liste ?? [])].reverse().find((x) => x.abgabe)
    if (e?.marken) Object.assign(aus, e.marken)
  }
  return aus
}

/** Gilt die Marke noch? Nur, solange das Feld unverändert ist */
export const markeGilt = (m: FeldMarke | undefined, aktuell: string | undefined): m is FeldMarke =>
  Boolean(m) && (m!.w ?? '').trim() === (aktuell ?? '').trim()

export interface AbgabeEintrag {
  aufgabe: BlattAufgabe
  /** Antwort als Text (ohne Namen) */
  antwort: string
}

/**
 * Offene Aufgaben einer Einreichung in EINER Anfrage (Kontingent der Lehrkraft, Namensfilter zentral): je Aufgabe Ampel
 * und ein kurzer Hinweis – ohne die Lösung zu verraten. Der ausführliche Bogen kommt wie bisher getrennt.
 */
export function abgabeAufgabenAnfrage(
  eintraege: AbgabeEintrag[],
  opts: { sprache?: string; material?: string; bilder?: string[] } = {}
): StructuredRequest {
  const bilder = opts.bilder ?? []
  return {
    system:
      'Du bist eine erfahrene, zugewandte Lehrkraft. Eine Person hat ein Arbeitsblatt eingereicht. Du schätzt JEDE genannte Aufgabe kurz ein. Sprich die Person mit „du" an.',
    user: [
      'REGELN:',
      '- einschaetzung: „sicher" = inhaltlich richtig und vollständig, „teilweise" = Ansätze richtig, „noch nicht" = überwiegend falsch, unpassend oder leer.',
      '- hinweis: EIN bis ZWEI kurze Sätze – was gelungen ist bzw. was genau noch fehlt, und ein konkreter nächster Schritt. Keine Allgemeinplätze.',
      '- INHALT VOR FORM: Prüfe, ob der Operator erfüllt ist („nenne" = Stichpunkte genügen). Bemängle die Form nur, wenn die Aufgabe sie verlangt.',
      '- Verrate die Lösung NICHT – weder wörtlich noch umschrieben. Keine Note, keine Punkte.',
      '- Gib für JEDE Aufgabe genau einen Eintrag mit ihrer Nummer zurück.',
      opts.sprache && opts.sprache !== 'de' ? `- Schreibe auf Deutsch; Zitate aus den Antworten bleiben in der Originalsprache (${opts.sprache}).` : '',
      bilder.length ? '- Mit dem Stift Eingetragenes steht auf den beigefügten Seitenbildern; beziehe es bei der passenden Aufgabe ein.' : '',
      opts.material ? `MATERIAL DES BLATTS MIT ZEILENNUMMERN (nur zum Prüfen von Belegen, nicht Teil der Antworten):\n${opts.material}` : '',
      ...eintraege.map((e) =>
        [
          `AUFGABE ${e.aufgabe.nr}: ${e.aufgabe.anweisung}`,
          `ERWARTUNG UND LÖSUNG (nur für dich, nicht verraten):\n${e.aufgabe.erwartung}`,
          'ANTWORT (zwischen <<< und >>>):',
          `<<<\n${e.antwort.trim() || '(nur auf dem Blatt eingezeichnet, siehe Bild)'}\n>>>`
        ].join('\n')
      )
    ]
      .filter(Boolean)
      .join('\n'),
    ...(bilder.length ? { images: bilder.slice(0, 4) } : {}),
    schemaName: 'blatt_abgabe_aufgaben',
    schema: {
      type: 'object',
      properties: {
        aufgaben: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nr: { type: 'integer' },
              einschaetzung: { type: 'string', enum: ['sicher', 'teilweise', 'noch nicht'] },
              hinweis: { type: 'string' }
            },
            required: ['nr', 'einschaetzung', 'hinweis'],
            additionalProperties: false
          }
        }
      },
      required: ['aufgaben'],
      additionalProperties: false
    }
  }
}

/** Antwort der KI je Aufgabennummer – nur die gefragten Nummern */
export function abgabeAufgabenAus(roh: unknown, nummern: number[]): Record<string, { einschaetzung: Einschaetzung; hinweis: string }> {
  const aus: Record<string, { einschaetzung: Einschaetzung; hinweis: string }> = {}
  const liste = ((roh ?? {}) as { aufgaben?: unknown }).aufgaben
  for (const x of Array.isArray(liste) ? liste : []) {
    const r = (x ?? {}) as Record<string, unknown>
    const nr = Number(r.nr)
    if (!nummern.includes(nr) || aus[String(nr)]) continue
    const e = String(r.einschaetzung ?? '')
    aus[String(nr)] = {
      einschaetzung: e === 'sicher' || e === 'teilweise' ? e : 'noch nicht',
      hinweis: String(r.hinweis ?? '')
        .trim()
        .slice(0, 500)
    }
  }
  return aus
}
