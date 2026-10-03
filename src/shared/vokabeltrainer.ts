/**
 * Vokabeltrainer der Lern-App (03.10.2026) – Regeln, gemeinsam für Server, Lernende und Lehrkraft.
 *
 * Abgestimmt mit der Lehrkraft nach Recherche (Karpicke & Roediger 2008: Abrufen statt Wiederlesen;
 * Cepeda 2006 / Nakata 2015: verteilt wiederholen; Nation: Form, Bedeutung, Gebrauch; phase6/Anki):
 *  - Karteikasten mit 5 Fächern: 1, 3, 7, 16, 35 Tage, danach „Langzeit" (~90 Tage). Falsch = zwei
 *    Fächer zurück (mindestens Fach 1) und in derselben Sitzung noch einmal.
 *  - Termin-Anker: Steht ein Vokabeltest an, werden Wörter vorher fällig, damit jedes 2–3 Mal geübt ist.
 *  - „Sicher beherrscht" = Deutsch → Fremdsprache frei geschrieben, zweimal richtig mit mindestens
 *    7 Tagen Abstand. Erkennen (Fremdsprache → Deutsch, Auswahl) wird getrennt gezählt.
 *  - Tolerant mit Hinweis: Tippfehler bei Wörtern ab 5 Buchstaben = „fast richtig" (keine Rückstufung),
 *    fehlender Akzent markiert und milder, „(to) go" optional, Alternativen mit „/" oder „;".
 *  - Lernkarte nur beim ersten Kontakt mit Selbsteinschätzung; danach immer objektive Abfrage:
 *    Auswahl → Buchstaben → frei → Lückensatz.
 */

export interface Vokabel {
  id: string
  term: string
  translation: string
  /** Beispielsatz (aus dem Lehrwerk) und seine Übersetzung */
  example?: string
  exampleTranslation?: string
  /** Wortart/Zusatz, z. B. „(n)", Latein-Nennform */
  pos?: string
  note?: string
  /** Bild (OpenMoji als data:-URL) für konkrete Wörter */
  bild?: string
}

/** Stand eines Wortes für eine Person */
export interface WortStand {
  /** 0 = neu (noch nicht kennengelernt), 1–5 Fächer, 6 = Langzeit */
  fach: number
  /** Nächste Fälligkeit (ms); 0 = sofort */
  faellig: number
  /** Zeitpunkte richtiger freier Abrufe Deutsch → Fremdsprache (für „sicher") */
  frei: number[]
  /** Erkennen Fremdsprache → Deutsch: richtig/gesamt */
  erkannt: number
  erkennenVersuche: number
  /** Abfragen insgesamt / davon falsch */
  versuche: number
  falsch: number
  /** Letzte falsche Antworten (für „Problemwörter" der Lehrkraft) */
  fehlerTexte: string[]
  /** Zuletzt geübt (ms) */
  zuletzt: number
}

export const TAG = 86_400_000
/** Abstände je Fach in Tagen (Fach 6 = Langzeit) */
export const ABSTAENDE = [0, 1, 3, 7, 16, 35, 90]

export const neuerStand = (): WortStand => ({
  fach: 0,
  faellig: 0,
  frei: [],
  erkannt: 0,
  erkennenVersuche: 0,
  versuche: 0,
  falsch: 0,
  fehlerTexte: [],
  zuletzt: 0
})

export type Urteil = 'richtig' | 'fast' | 'falsch'

export type Uebung = 'karte' | 'auswahl' | 'hoeren' | 'buchstaben' | 'frei' | 'diktat' | 'luecke'

/** Welche Übung als Nächstes für dieses Wort (je nach Fach) – Erstkontakt mit Karte, dann steigend */
export function uebungFuer(st: WortStand, v: Vokabel, zufall = Math.random()): Uebung {
  if (st.fach === 0 && st.versuche === 0) return 'karte'
  if (st.fach <= 1) return zufall < 0.5 ? 'auswahl' : 'buchstaben'
  if (st.fach === 2) return zufall < 0.6 ? 'buchstaben' : 'frei'
  // Ab Fach 3 frei schreiben, abwechselnd mit Lückensatz (wenn es einen Beispielsatz gibt) und Diktat
  if (v.example && enthaeltWort(v.example, v.term) && zufall < 0.35) return 'luecke'
  if (zufall > 0.85) return 'diktat'
  return 'frei'
}

/** Kommt das Wort (oder sein Kern ohne „to"/Artikel) im Satz vor? */
export function enthaeltWort(satz: string, term: string): boolean {
  const kern = kernform(varianten(term)[0] ?? term)
  return kern.length >= 2 && satz.toLowerCase().includes(kern.toLowerCase())
}

/** Satz mit Lücke an der Stelle des Wortes */
export function satzMitLuecke(satz: string, term: string): { vor: string; nach: string; loesung: string } | null {
  const kern = kernform(varianten(term)[0] ?? term)
  const i = satz.toLowerCase().indexOf(kern.toLowerCase())
  if (i < 0) return null
  // Bis zum Wortende (gebeugte Form: „play" → „played")
  let ende = i + kern.length
  while (ende < satz.length && /\p{L}/u.test(satz[ende])) ende++
  return { vor: satz.slice(0, i), nach: satz.slice(ende), loesung: satz.slice(i, ende) }
}

/** „to go" → „go", „the dog" → „dog", „(to) play" → „play" */
export function kernform(t: string): string {
  return t
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(to|the|a|an|le|la|les|l'|un|une|el|los|las|il|lo|gli|der|die|das)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Zulässige Lösungen: Alternativen („/", „;", „,") und Klammerteile optional */
export function varianten(loesung: string): string[] {
  const teile = String(loesung ?? '')
    .split(/\s*[/;]\s*|,\s+(?=\S)/)
    .map((x) => x.trim())
    .filter(Boolean)
  const aus = new Set<string>()
  for (const t of teile) {
    aus.add(t.replace(/[()]/g, '').replace(/\s+/g, ' ').trim())
    aus.add(
      t
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
  }
  return [...aus].filter(Boolean)
}

const ohneAkzente = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normal = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Levenshtein-Abstand (klein, für Tippfehler) */
export function abstand(a: string, b: string): number {
  if (a === b) return 0
  const z = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let vor = z[0]
    z[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = z[j]
      z[j] = Math.min(z[j] + 1, z[j - 1] + 1, vor + (a[i - 1] === b[j - 1] ? 0 : 1))
      vor = tmp
    }
  }
  return z[b.length]
}

/**
 * Antwort bewerten (tolerant mit Hinweis):
 *  - genau (ohne Groß-/Kleinschreibung, Satzzeichen am Ende, „to"/Artikel optional) → richtig
 *  - nur Akzent fehlt → fast („Akzent fehlt: é")
 *  - ein Tippfehler bei Wörtern ab 5 Buchstaben → fast
 */
export function bewerte(antwort: string, loesung: string): { urteil: Urteil; hinweis?: string; richtig: string } {
  const a = normal(antwort)
  const alle = varianten(loesung)
  const richtig = alle[0] ?? loesung
  if (!a) return { urteil: 'falsch', richtig }
  for (const l of alle) {
    const n = normal(l)
    if (a === n || kernform(a) === kernform(n)) return { urteil: 'richtig', richtig: l }
  }
  for (const l of alle) {
    const n = normal(l)
    if (ohneAkzente(a) === ohneAkzente(n) || ohneAkzente(kernform(a)) === ohneAkzente(kernform(n)))
      return { urteil: 'fast', hinweis: 'Achte auf die Akzente.', richtig: l }
  }
  for (const l of alle) {
    const n = kernform(normal(l))
    if (n.length >= 5 && abstand(kernform(a), n) === 1) return { urteil: 'fast', hinweis: 'Fast – ein Buchstabe stimmt nicht.', richtig: l }
  }
  return { urteil: 'falsch', richtig }
}

/** Ist das Wort sicher beherrscht? (frei richtig, zweimal mit mindestens 7 Tagen Abstand) */
export function istSicher(st: WortStand): boolean {
  if (st.frei.length < 2) return false
  const z = [...st.frei].sort((a, b) => a - b)
  for (let i = 1; i < z.length; i++) for (let j = 0; j < i; j++) if (z[i] - z[j] >= 7 * TAG) return true
  return false
}

/**
 * Stand nach einer Abfrage.
 *  - Karte (Erstkontakt): „wusste ich" → Fach 1, sonst bleibt neu, aber kennengelernt (in der Sitzung nochmal)
 *  - richtig → ein Fach weiter (höchstens Langzeit); fast → bleibt im Fach, kurz nochmal
 *  - falsch → zwei Fächer zurück (mindestens Fach 1)
 *  - Erkennen (Auswahl/Hören) bringt höchstens bis Fach 2 – weiter nur mit Schreiben
 */
export function nachAbfrage(st0: WortStand, uebung: Uebung, urteil: Urteil, antwort: string, jetzt = Date.now(), testTermin?: number): WortStand {
  const st: WortStand = { ...st0, frei: [...st0.frei], fehlerTexte: [...st0.fehlerTexte], versuche: st0.versuche + 1, zuletzt: jetzt }
  const erkennen = uebung === 'auswahl' || uebung === 'hoeren'
  if (erkennen) {
    st.erkennenVersuche++
    if (urteil === 'richtig') st.erkannt++
  }
  if (uebung === 'karte') {
    if (urteil === 'richtig') st.fach = 1
    st.faellig = urteil === 'richtig' ? jetzt + TAG : jetzt
    return st
  }
  if (urteil === 'falsch') {
    st.falsch++
    if (antwort.trim()) st.fehlerTexte = [...st.fehlerTexte, antwort.trim().slice(0, 60)].slice(-5)
    st.fach = Math.max(1, st.fach - 2)
    st.faellig = jetzt // in dieser Sitzung noch einmal
    return st
  }
  if (urteil === 'fast') {
    st.fach = Math.max(1, st.fach)
    st.faellig = jetzt
    return st
  }
  // richtig
  if ((uebung === 'frei' || uebung === 'diktat' || uebung === 'luecke') && st.fach >= 2) st.frei = [...st.frei, jetzt].slice(-6)
  const ziel = erkennen ? Math.min(Math.max(st.fach, 0) + 1, 2) : Math.min(st.fach + 1, 6)
  st.fach = Math.max(st.fach === 0 ? 1 : st.fach, ziel)
  let faellig = jetzt + ABSTAENDE[st.fach] * TAG
  // Termin-Anker: vor dem Test noch einmal fällig (spätestens 2 Tage vorher, nicht vor morgen)
  if (testTermin && testTermin > jetzt && faellig > testTermin - 2 * TAG) faellig = Math.max(jetzt + TAG, Math.min(faellig, testTermin - 2 * TAG))
  st.faellig = faellig
  return st
}

/** Fällige Wörter einer Sitzung: zuerst Wiederholungen (älteste zuerst), dann höchstens `neu` neue */
export function sitzungsWoerter(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now(), neu = 10, max = 25): Vokabel[] {
  const st = (v: Vokabel): WortStand => staende[v.id] ?? neuerStand()
  const faellig = liste.filter((v) => st(v).fach > 0 && st(v).faellig <= jetzt).sort((a, b) => st(a).faellig - st(b).faellig)
  const neue = liste.filter((v) => st(v).fach === 0).slice(0, neu)
  return [...faellig, ...neue].slice(0, max)
}

export interface Uebersicht {
  gesamt: number
  neu: number
  imAufbau: number
  sicher: number
  faellig: number
  /** Erkennen-Quote (0–1) */
  erkennen: number
  /** Anzahl Wörter je Fach 0–6 */
  faecher: number[]
}

export function uebersicht(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now()): Uebersicht {
  const faecher = [0, 0, 0, 0, 0, 0, 0]
  let sicher = 0
  let faellig = 0
  let erk = 0
  let erkV = 0
  for (const v of liste) {
    const s = staende[v.id] ?? neuerStand()
    faecher[Math.min(6, Math.max(0, s.fach))]++
    if (istSicher(s)) sicher++
    if (s.fach > 0 && s.faellig <= jetzt) faellig++
    erk += s.erkannt
    erkV += s.erkennenVersuche
  }
  return { gesamt: liste.length, neu: faecher[0], imAufbau: liste.length - faecher[0] - sicher, sicher, faellig, erkennen: erkV ? erk / erkV : 0, faecher }
}

/** Auswahl-Optionen: das richtige Wort und drei andere aus der Liste (nicht aus demselben Anfang) */
export function auswahlOptionen(v: Vokabel, liste: Vokabel[], richtung: 'fs' | 'de', zufall: () => number = Math.random): string[] {
  const feld = richtung === 'de' ? 'translation' : 'term'
  const andere = liste.filter((x) => x.id !== v.id && x[feld] && x[feld] !== v[feld])
  const gemischt = [...andere].sort(() => zufall() - 0.5).slice(0, 3)
  return [v[feld], ...gemischt.map((x) => x[feld])].sort(() => zufall() - 0.5)
}

/** Buchstaben des Wortes (Kernform) gemischt, für „Buchstaben legen" */
export function buchstaben(term: string, zufall: () => number = Math.random): string[] {
  const kern = kernform(varianten(term)[0] ?? term)
  return kern
    .split('')
    .filter((c) => c !== ' ')
    .sort(() => zufall() - 0.5)
}
