/**
 * Prüfung der Aussprache-Aufnahmen per Messung (12.10.2026, Wunsch der Lehrkraft: „einsilbige Wörter sind oft nicht zu
 * erkennen"). KEINE Spracherkennung und kein Dienst – nur kostenlose Messungen am fertigen MP3: Dauer, Pegel, Stille am
 * Anfang und Ende, Pegel am Schluss. Das Ergebnis steht als `pruefung` an der Aufnahme (shared/medienbank.ts), damit es
 * nicht bei jedem Öffnen neu gerechnet wird; `version` erlaubt, die Regeln später zu verschärfen (dann wird neu geprüft).
 *
 * Gemessen wird in der Oberfläche (Web Audio `decodeAudioData`, renderer/shared/medien/tonMessung.ts) – das geht in der
 * Exe UND im Browser am Server; der Hauptprozess hätte keinen MP3-Decoder. Hier steht nur die reine Rechnung (testbar).
 *
 * Alle Schwellen sind FAUSTREGELN (nicht belegt, aus Erfahrungswerten abgeleitet) – Grundlage ist allein der gemessene
 * Wert aus voiceSettings.ts (ElevenLabs bei speed 1.0 ≈ 205 Wörter/min, also etwa 4–5 Silben bzw. 15 Buchstaben je
 * Sekunde). „Verdacht" heißt deshalb nur: anhören und ggf. neu erzeugen.
 */

/** Fassung der Regeln – steigt sie, gelten ältere Prüfungen als ungeprüft */
export const PRUEF_VERSION = 1

export type PruefStufe = 'ok' | 'verdacht'

export interface TonPruefung {
  stufe: PruefStufe
  /** Lesbare Gründe („zu kurz für 2 Silben" …) – leer bei „ok" */
  gruende: string[]
  version: number
  /** Gerundete Messwerte (Sekunden bzw. dBFS) – zum Nachvollziehen */
  werte?: Messwerte
}

export interface Messwerte {
  /** Länge der Datei */
  dauer: number
  /** Vom ersten bis zum letzten hörbaren Fenster */
  sprechen: number
  stilleAnfang: number
  stilleEnde: number
  /** Lautestes 20-ms-Fenster (RMS, dBFS) */
  spitzeDb: number
  /** Lautestes Fenster der letzten 50 ms, relativ zur Spitze (dB, ≤ 0) */
  endeRelDb: number
}

/** Fensterlänge der Pegelmessung */
const FENSTER_S = 0.02
const db = (rms: number): number => 20 * Math.log10(rms + 1e-9)
const rund = (x: number, n = 2): number => Math.round(x * 10 ** n) / 10 ** n

/** Pegelverlauf eines Signals messen (Mono, Werte −1 … 1) */
export function messeSignal(daten: Float32Array, rate: number): Messwerte {
  const n = Math.max(1, Math.round(rate * FENSTER_S))
  const pegel: number[] = []
  for (let i = 0; i < daten.length; i += n) {
    let summe = 0
    const ende = Math.min(daten.length, i + n)
    for (let j = i; j < ende; j++) summe += daten[j] * daten[j]
    pegel.push(db(Math.sqrt(summe / Math.max(1, ende - i))))
  }
  const dauer = daten.length / rate
  const spitze = pegel.length ? Math.max(...pegel) : -180
  // Hörbar: höchstens 30 dB unter der Spitze und lauter als −50 dBFS (Faustregel)
  const schwelle = Math.max(-50, spitze - 30)
  const erstes = pegel.findIndex((p) => p >= schwelle)
  let letztes = -1
  for (let i = pegel.length - 1; i >= 0; i--)
    if (pegel[i] >= schwelle) {
      letztes = i
      break
    }
  const schluss = pegel.slice(Math.max(0, pegel.length - Math.ceil(0.05 / FENSTER_S)))
  const endeRel = schluss.length ? Math.max(...schluss) - spitze : -180
  if (erstes < 0) return { dauer: rund(dauer), sprechen: 0, stilleAnfang: rund(dauer), stilleEnde: rund(dauer), spitzeDb: rund(spitze, 1), endeRelDb: -180 }
  return {
    dauer: rund(dauer),
    sprechen: rund((letztes - erstes + 1) * FENSTER_S),
    stilleAnfang: rund(erstes * FENSTER_S),
    stilleEnde: rund(Math.max(0, dauer - (letztes + 1) * FENSTER_S)),
    spitzeDb: rund(spitze, 1),
    endeRelDb: rund(Math.max(-180, endeRel), 1)
  }
}

const VOKALE = /[aeiouyäöüàâáãåæéèêëíìîïóòôõøœúùûůý]+/giu

/**
 * Silben schätzen (Vokalgruppen je Wort; stummes „e" am Wortende im Englischen/Französischen zählt nicht) – grob, aber für
 * „zu kurz/zu lang" genügt die Größenordnung.
 */
export function schaetzeSilben(text: string): number {
  let n = 0
  for (const wort of String(text ?? '')
    .toLowerCase()
    .match(/\p{L}+/gu) ?? []) {
    let s = (wort.match(VOKALE) ?? []).length
    if (s > 1 && /[^aeiouy]e$/.test(wort) && !/le$/.test(wort)) s--
    n += Math.max(1, s)
  }
  return Math.max(1, n)
}

/** Buchstaben (ohne Leerzeichen und Satzzeichen) */
const buchstaben = (text: string): number => (String(text ?? '').match(/\p{L}/gu) ?? []).length

/**
 * Grenzen für die Sprechdauer (FAUSTREGELN, 12.10.2026):
 * - Wort: erwartet ≈ 0,2–0,25 s je Silbe (≈ 4–5 Silben/s, aus den gemessenen 205 Wörtern/min). „Zu kurz" unter
 *   0,15 s + 0,1 s je Silbe (≈ halbe Erwartung: 1 Silbe 0,25 s, 2 Silben 0,35 s); „zu lang" über 1,2 s + 0,45 s je Silbe.
 * - Satz: erwartet ≈ 15 Buchstaben/s. „Zu kurz" schneller als 30 Buchstaben/s; „zu lang" langsamer als 6 Buchstaben/s
 *   plus 1,5 s Luft für Pausen.
 */
export function grenzen(art: 'wort' | 'satz', text: string): { min: number; max: number; silben: number; zeichen: number } {
  const silben = schaetzeSilben(text)
  const zeichen = buchstaben(text)
  if (art === 'wort') return { min: rund(0.15 + 0.1 * silben), max: rund(1.2 + 0.45 * silben), silben, zeichen }
  return { min: rund(Math.max(0.4, zeichen / 30)), max: rund(zeichen / 6 + 1.5), silben, zeichen }
}

/**
 * Regeln (FAUSTREGELN):
 * - stumm: lautestes Fenster unter −45 dBFS bzw. nichts Hörbares; sehr leise: Spitze unter −32 dBFS,
 * - zu kurz/zu lang: Sprechdauer außerhalb von `grenzen`,
 * - lange Stille: mehr als 1 s vor bzw. 1,5 s nach dem Sprechen,
 * - Ende abgeschnitten: in den letzten 50 ms noch höchstens 15 dB unter der Spitze (natürliche Enden klingen ab, und
 *   die Sprach-KI lässt danach gewöhnlich etwas Stille).
 */
export function bewerte(w: Messwerte, art: 'wort' | 'satz', text: string): TonPruefung {
  const gruende: string[] = []
  const g = grenzen(art, text)
  if (w.spitzeDb < -45 || w.sprechen <= 0) gruende.push('stumm oder kaum hörbar')
  else {
    if (w.spitzeDb < -32) gruende.push('sehr leise')
    if (w.sprechen < g.min)
      gruende.push(
        art === 'wort'
          ? `zu kurz für ${g.silben} ${g.silben === 1 ? 'Silbe' : 'Silben'} (${w.sprechen.toFixed(2)} s gesprochen)`
          : `zu kurz für den Satz (${w.sprechen.toFixed(2)} s für ${g.zeichen} Buchstaben)`
      )
    if (w.sprechen > g.max) gruende.push(`ungewöhnlich lang (${w.sprechen.toFixed(1)} s)`)
    if (w.stilleAnfang > 1) gruende.push(`lange Stille am Anfang (${w.stilleAnfang.toFixed(1)} s)`)
    if (w.stilleEnde > 1.5) gruende.push(`lange Stille am Ende (${w.stilleEnde.toFixed(1)} s)`)
    if (w.endeRelDb > -15) gruende.push('Ende vielleicht abgeschnitten')
  }
  return { stufe: gruende.length ? 'verdacht' : 'ok', gruende, version: PRUEF_VERSION, werte: w }
}

/** Ist die gespeicherte Prüfung noch gültig (gleiche Regelfassung)? */
export const istGeprueft = (p: TonPruefung | undefined): boolean => Boolean(p && p.version === PRUEF_VERSION)

/** Tooltip-Text eines Verdachts */
export const verdachtText = (p: TonPruefung | undefined): string =>
  p?.stufe === 'verdacht' ? `Aussprache vielleicht undeutlich: ${p.gruende.join(', ')} – bitte anhören` : ''

/** Eine Prüfung aus fremder Hand (Server, Datei) bereinigen – nur bekannte Felder, begrenzte Längen */
export function pruefungBereinigt(p: unknown): TonPruefung | undefined {
  if (!p || typeof p !== 'object') return undefined
  const x = p as Record<string, unknown>
  const stufe: PruefStufe = x.stufe === 'verdacht' ? 'verdacht' : 'ok'
  const gruende = Array.isArray(x.gruende) ? x.gruende.map((g) => String(g).slice(0, 120)).slice(0, 8) : []
  const version = Number.isFinite(Number(x.version)) ? Math.round(Number(x.version)) : 0
  const w = x.werte && typeof x.werte === 'object' ? (x.werte as Record<string, unknown>) : null
  const zahl = (k: string): number => (Number.isFinite(Number(w?.[k])) ? Number(w?.[k]) : 0)
  return {
    stufe,
    gruende,
    version,
    ...(w
      ? {
          werte: {
            dauer: zahl('dauer'),
            sprechen: zahl('sprechen'),
            stilleAnfang: zahl('stilleAnfang'),
            stilleEnde: zahl('stilleEnde'),
            spitzeDb: zahl('spitzeDb'),
            endeRelDb: zahl('endeRelDb')
          }
        }
      : {})
  }
}
