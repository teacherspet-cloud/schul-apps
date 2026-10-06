/**
 * Vokabelspiele nach geschaffter Tagesrunde (03.10.2026, mit der Lehrkraft abgestimmt): Memory,
 * Zuordnen gegen die Uhr, Blitzrunde, Satzpuzzle, Wortraten, Kreuzworträtsel, Fallende Wörter,
 * Buchstabensalat. Nur eigener Rekord je Spiel, keine Ranglisten; der Karteikasten bleibt unverändert –
 * Fehler im Spiel merken das Wort nur als „nochmal ansehen".
 *
 * Hier die reinen Regeln (ohne Oberfläche), damit Server und Tests sie teilen.
 */
import { ohneAngaben, varianten, type Vokabel, type WortStand } from './vokabeltrainer'

export type SpielId =
  | 'memory'
  | 'zuordnen'
  | 'blitz'
  | 'satz'
  | 'wortraten'
  | 'kreuzwort'
  | 'fallend'
  | 'suchsel'
  | 'bildwort'
  | 'hoeren'
  | 'satzhoeren'
  | 'diktat'
  | 'satzluecke'
  | 'duell'

export interface SpielInfo {
  id: SpielId
  name: string
  art: 'erkennen' | 'schreiben'
  /** Wie der Rekord zählt */
  einheit: string
  /** true: kleiner ist besser (Züge, Sekunden) */
  kleinerBesser: boolean
  beschreibung: string
}

export const SPIELE: SpielInfo[] = [
  { id: 'memory', name: 'Memory', art: 'erkennen', einheit: 'Züge', kleinerBesser: true, beschreibung: 'Wort und Übersetzung als Paar aufdecken.' },
  { id: 'zuordnen', name: 'Zuordnen gegen die Uhr', art: 'erkennen', einheit: 's', kleinerBesser: true, beschreibung: 'Paare antippen, so schnell es geht.' },
  { id: 'blitz', name: 'Blitzrunde', art: 'erkennen', einheit: 'richtig', kleinerBesser: false, beschreibung: '60 Sekunden – so viele richtige wie möglich.' },
  { id: 'satz', name: 'Satzpuzzle', art: 'erkennen', einheit: 'Sätze', kleinerBesser: false, beschreibung: 'Beispielsätze in die richtige Reihenfolge legen.' },
  {
    id: 'wortraten',
    name: 'Wortraten',
    art: 'schreiben',
    einheit: 'Wörter',
    kleinerBesser: false,
    beschreibung: 'Buchstaben raten, bevor die Blume alle Blätter verliert.'
  },
  {
    id: 'kreuzwort',
    name: 'Kreuzworträtsel',
    art: 'schreiben',
    einheit: 's',
    kleinerBesser: true,
    beschreibung: 'Aus deinen Wörtern, mit deutschen Hinweisen.'
  },
  {
    id: 'fallend',
    name: 'Fallende Wörter',
    art: 'schreiben',
    einheit: 'Wörter',
    kleinerBesser: false,
    beschreibung: 'Die Übersetzung tippen, bevor das Wort unten ankommt.'
  },
  { id: 'suchsel', name: 'Buchstabensalat', art: 'schreiben', einheit: 's', kleinerBesser: true, beschreibung: 'Die Wörter im Buchstabengitter finden.' },
  // Mit Bildern und Aussprache der Medienbank (05.10.2026)
  { id: 'bildwort', name: 'Bilderrätsel', art: 'erkennen', einheit: 'richtig', kleinerBesser: false, beschreibung: 'Zum Bild das passende Wort finden.' },
  { id: 'hoeren', name: 'Hörquiz', art: 'erkennen', einheit: 'richtig', kleinerBesser: false, beschreibung: 'Hinhören und die richtige Schreibweise wählen.' },
  {
    id: 'satzhoeren',
    name: 'Satz-Diktat',
    art: 'erkennen',
    einheit: 'Sätze',
    kleinerBesser: false,
    beschreibung: 'Den Beispielsatz hören und die Wörter ordnen.'
  },
  // Neu 06.10.2026 (abgestimmt mit der Lehrkraft)
  {
    id: 'diktat',
    name: 'Hören & Schreiben',
    art: 'schreiben',
    einheit: 'richtig',
    kleinerBesser: false,
    beschreibung: 'Das Wort hören und richtig schreiben.'
  },
  {
    id: 'satzluecke',
    name: 'Satz-Lücke',
    art: 'schreiben',
    einheit: 'richtig',
    kleinerBesser: false,
    beschreibung: 'Das passende Wort in den Beispielsatz einsetzen.'
  },
  { id: 'duell', name: 'Wortduell', art: 'erkennen', einheit: 's', kleinerBesser: true, beschreibung: 'Passt das Paar? 20 Runden gegen deine Bestzeit.' }
]

/** Schreibweise eines Wortes im Spiel: erste Variante, ohne Angaben */
export const spielform = (term: string): string => ohneAngaben(varianten(term)[0] ?? term)

/**
 * Wörter für die Spiele (06.10.2026, abgestimmt): nur schon kennengelernte (ab Fach 1 – neue erst nach der Einführung
 * im Karteikasten), gemischt aus etwa 60 % heute fälligen, 30 % wackeligen (niedrige Fächer, zuletzt falsch) und 10 %
 * sicheren zur Auffrischung. Fehlt eine Gruppe, füllen die anderen auf; sind es insgesamt zu wenige, kommen weitere
 * (zuletzt auch noch neue) dazu, damit jedes Spiel startet.
 */
export function spielWoerter(
  liste: Vokabel[],
  staende: Record<string, WortStand>,
  mindestens = 6,
  jetzt = Date.now(),
  ziel = 16,
  zufall: () => number = Math.random
): Vokabel[] {
  const st = (v: Vokabel): WortStand | undefined => staende[v.id]
  const gelernt = liste.filter((v) => (st(v)?.fach ?? 0) >= 1)
  const sicher = (v: Vokabel): boolean => (st(v)?.fach ?? 0) >= 5
  const faellig = gelernt.filter((v) => !sicher(v) && (st(v)?.faellig ?? 0) <= jetzt)
  const wackelig = gelernt.filter((v) => !sicher(v) && !faellig.includes(v) && ((st(v)?.fach ?? 0) <= 2 || (st(v)?.fehlerTexte.length ?? 0) > 0))
  const sichere = gelernt.filter(sicher)
  const mischen = <T>(l: T[]): T[] =>
    l
      .map((x) => [zufall(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1])
  const anteil = (l: Vokabel[], n: number): Vokabel[] => mischen(l).slice(0, n)
  const n = Math.max(mindestens, Math.min(ziel, gelernt.length))
  let aus = [...anteil(faellig, Math.round(n * 0.6)), ...anteil(wackelig, Math.round(n * 0.3)), ...anteil(sichere, Math.max(1, Math.round(n * 0.1)))]
  // Auffüllen: erst übrige Gelernte, dann neue
  for (const v of [...mischen(gelernt), ...liste.filter((x) => !gelernt.includes(x))]) {
    if (aus.length >= n) break
    if (!aus.includes(v)) aus.push(v)
  }
  aus = aus.slice(0, Math.max(n, mindestens))
  return mischen(aus)
}

/**
 * Was ein Fehler im Spiel am Karteikasten ändert (06.10.2026, abgestimmt: „nur Fehler zählen"): Das Wort wird
 * wackelig und kommt gleich wieder dran; ein sicheres Wort (Fach 5 und höher) rutscht ein Fach zurück. Treffer im Spiel
 * befördern nichts – der Aufstieg bleibt dem Karteikasten vorbehalten.
 */
export function nachSpielfehler(st: WortStand, jetzt = Date.now()): WortStand {
  if (st.fach < 1) return st
  return { ...st, fach: st.fach >= 5 ? st.fach - 1 : st.fach, faellig: Math.min(st.faellig, jetzt) }
}

/** Ist der neue Wert ein Rekord? */
export const istRekord = (spiel: SpielId, wert: number, bisher: number | undefined): boolean =>
  bisher === undefined || (SPIELE.find((s) => s.id === spiel)?.kleinerBesser ? wert < bisher : wert > bisher)

/** Nur Buchstaben, groß – für Gitter (Kreuzwort, Suchsel) */
export const gitterform = (term: string): string =>
  spielform(term)
    .replace(/^(to|a|an|the|le|la|les|l'|un|une|el|los|las|il|lo|der|die|das)\s+/i, '')
    .toLocaleUpperCase()
    .replace(/[^\p{L}]/gu, '')

export interface Suchsel {
  groesse: number
  zellen: string[]
  woerter: { id: string; wort: string; start: number; schritt: number }[]
}

/** Buchstabengitter: Wörter waagerecht, senkrecht oder diagonal (nur vorwärts – für Lernende genug) */
export function suchselGitter(woerter: { id: string; wort: string }[], zufall: () => number = Math.random, groesse = 10): Suchsel {
  const n = Math.max(groesse, Math.min(14, Math.max(...woerter.map((w) => w.wort.length), 0) + 2))
  const zellen: string[] = Array(n * n).fill('')
  const richtungen = [
    [0, 1],
    [1, 0],
    [1, 1]
  ]
  const gesetzt: Suchsel['woerter'] = []
  for (const w of [...woerter].sort((a, b) => b.wort.length - a.wort.length)) {
    if (w.wort.length > n) continue
    for (let versuch = 0; versuch < 200; versuch++) {
      const [dz, ds] = richtungen[Math.floor(zufall() * richtungen.length)]
      const z0 = Math.floor(zufall() * (n - dz * (w.wort.length - 1)))
      const s0 = Math.floor(zufall() * (n - ds * (w.wort.length - 1)))
      let passt = true
      for (let k = 0; k < w.wort.length && passt; k++) {
        const c = zellen[(z0 + dz * k) * n + s0 + ds * k]
        if (c && c !== w.wort[k]) passt = false
      }
      if (!passt) continue
      for (let k = 0; k < w.wort.length; k++) zellen[(z0 + dz * k) * n + s0 + ds * k] = w.wort[k]
      gesetzt.push({ id: w.id, wort: w.wort, start: z0 * n + s0, schritt: dz * n + ds })
      break
    }
  }
  // Füllbuchstaben aus den Wörtern selbst (sieht nach der Sprache aus, nicht nach Zufallsbuchstaben)
  const vorrat = woerter.map((w) => w.wort).join('') || 'ABCDEFGHIJKLMNOPRSTUVW'
  for (let i = 0; i < zellen.length; i++) if (!zellen[i]) zellen[i] = vorrat[Math.floor(zufall() * vorrat.length)]
  return { groesse: n, zellen, woerter: gesetzt }
}

/** Zellen eines Wortes im Suchsel */
export const suchselZellen = (w: Suchsel['woerter'][number]): number[] => Array.from({ length: w.wort.length }, (_, k) => w.start + k * w.schritt)

/** Satzpuzzle: Wörter des Beispielsatzes (Satzzeichen hängen am Wort) */
export function satzTeile(satz: string): string[] {
  return satz.trim().split(/\s+/).filter(Boolean)
}
