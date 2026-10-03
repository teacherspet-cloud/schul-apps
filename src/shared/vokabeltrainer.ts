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

/**
 * Übungsarten. Seit 03.10.2026 (Wunsch der Lehrkraft: „weitere Arten"): `auswahlFs` (die richtige
 * Schreibweise der Fremdsprache wählen – mit typischen Falschschreibungen als Distraktoren),
 * `paar` (stimmt das Paar Fremdwort – Übersetzung?), `luecken` (Wort mit fehlenden Buchstaben).
 */
export type Uebung = 'karte' | 'auswahl' | 'hoeren' | 'buchstaben' | 'frei' | 'diktat' | 'luecke' | 'auswahlFs' | 'paar' | 'luecken'
export const UEBUNGEN: Uebung[] = ['karte', 'auswahl', 'hoeren', 'buchstaben', 'frei', 'diktat', 'luecke', 'auswahlFs', 'paar', 'luecken']
/** Erkennen (nicht selbst schreiben): bringt höchstens bis Fach 2 */
export const ERKENNEN: Uebung[] = ['auswahl', 'hoeren', 'auswahlFs', 'paar']

/** Welche Übung als Nächstes für dieses Wort (je nach Fach) – Erstkontakt mit Karte, dann steigend */
export function uebungFuer(st: WortStand, v: Vokabel, zufall = Math.random()): Uebung {
  if (st.fach === 0 && st.versuche === 0) return 'karte'
  // Fach 0–1: erkennen in mehreren Formen, dazu Buchstaben legen
  if (st.fach <= 1) return zufall < 0.28 ? 'auswahl' : zufall < 0.46 ? 'paar' : zufall < 0.7 ? 'auswahlFs' : 'buchstaben'
  // Fach 2: Schreibweise festigen
  if (st.fach === 2) return zufall < 0.3 ? 'buchstaben' : zufall < 0.5 ? 'luecken' : zufall < 0.62 ? 'auswahlFs' : 'frei'
  // Ab Fach 3 frei schreiben, abwechselnd mit Lückensatz (wenn es einen Beispielsatz gibt), Diktat und Buchstabenlücken
  if (v.example && enthaeltWort(v.example, v.term) && zufall < 0.3) return 'luecke'
  if (zufall > 0.86) return 'diktat'
  if (zufall > 0.74) return 'luecken'
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

/**
 * Grammatik- und Gebrauchsangaben aus dem Lehrbuch („children [pl]", „sheep (pl sheep)", „mouse [irr]",
 * „flat (BE)") gehören nicht zum Wort: Sie werden weder vorgelesen noch eingegeben (03.10.2026).
 * Eckige Klammern fallen immer weg, runde nur mit einer solchen Angabe – „(to) play" bleibt.
 */
const ANGABE =
  /\s*\((?:pl|sg|pl\.|sg\.|no pl|kein pl\.?|irr\.?|unr\.?|adj\.?|adv\.?|prep\.?|conj\.?|n|v|nt|f|m|mf|c|u|be|ae|bre|ame|infml|fml|inf\.?|coll\.?|ugs\.?|pl [^)]*|Pl\.?[^)]*|Sg\.?)\)/gi
export function ohneAngaben(t: string): string {
  return String(t ?? '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(ANGABE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** „to go" → „go", „the dog" → „dog", „(to) play" → „play" */
export function kernform(t: string): string {
  return ohneAngaben(t)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(to|the|a|an|le|la|les|l'|un|une|el|los|las|il|lo|gli|der|die|das)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Zulässige Lösungen: Alternativen („/", „;", „,") und Klammerteile optional */
export function varianten(loesung: string): string[] {
  const teile = ohneAngaben(String(loesung ?? ''))
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
export function bewerte(antwort: string, loesung: string, strikt = false): { urteil: Urteil; hinweis?: string; richtig: string } {
  const a = normal(antwort)
  const alle = varianten(loesung)
  const richtig = alle[0] ?? loesung
  if (!a) return { urteil: 'falsch', richtig }
  /*
   * Die ganze Lösung zählt (03.10.2026, Befund der Lehrkraft: richtig angeklickt, als falsch gewertet) –
   * bei „welche, welcher, welches" zerlegte `varianten` die Lösung, die angeklickte ganze Angabe passte
   * dann zu keinem Teil.
   */
  if (a === normal(loesung) || kernform(a) === kernform(normal(loesung))) return { urteil: 'richtig', richtig: ohneAngaben(loesung) }
  // Auswahl (z. B. zwischen Falschschreibungen): nur genau richtig zählt, kein „fast"
  if (strikt) {
    for (const l of alle) if (a === normal(l) || kernform(a) === kernform(normal(l))) return { urteil: 'richtig', richtig: l }
    return { urteil: 'falsch', richtig }
  }
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
  const erkennen = ERKENNEN.includes(uebung)
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

/**
 * Auswahl in der Fremdsprache (03.10.2026): die richtige Schreibweise unter Wörtern der Liste – und
 * gelegentlich (etwa jede zweite Frage) typischen Falschschreibungen des Wortes selbst (vokabelFehler.ts).
 */
export function auswahlFsOptionen(
  v: Vokabel,
  liste: Vokabel[],
  sprache: string,
  falsch: (w: string, n: number, verboten: string[]) => string[],
  zufall: () => number = Math.random
): string[] {
  const richtig = ohneAngaben(varianten(v.term)[0] ?? v.term)
  const andere = [...new Set(liste.filter((x) => x.id !== v.id).map((x) => ohneAngaben(varianten(x.term)[0] ?? x.term)))].filter((t) => t && t !== richtig)
  const mitFehlern = zufall() < 0.55 || andere.length < 3
  const fehler = mitFehlern ? falsch(richtig, andere.length < 3 ? 3 : 2, [...varianten(v.term), ...andere]) : []
  const rest = [...andere].sort(() => zufall() - 0.5).slice(0, Math.max(0, 3 - fehler.length))
  void sprache
  return [richtig, ...fehler, ...rest].slice(0, 4).sort(() => zufall() - 0.5)
}

/** Paar für „Stimmt das?": in etwa der Hälfte der Fälle die richtige Übersetzung, sonst die eines anderen Wortes */
export function paarFuer(v: Vokabel, liste: Vokabel[], zufall: () => number = Math.random): string {
  const andere = liste.filter((x) => x.id !== v.id && x.translation && normal(x.translation) !== normal(v.translation))
  if (!andere.length || zufall() < 0.5) return v.translation
  return andere[Math.floor(zufall() * andere.length)].translation
}

/** Wort mit Lücken („w h _ t _"): etwa 40 % der Buchstaben fehlen, nie der erste; Leerzeichen bleiben */
export function lueckenMuster(term: string, zufall: () => number = Math.random): string {
  const kern = ohneAngaben(varianten(term)[0] ?? term)
  const stellen = [...kern].map((c, i) => ({ c, i })).filter((x) => i_ok(x.i, x.c))
  const n = Math.max(1, Math.round(stellen.length * 0.4))
  const weg = new Set(
    [...stellen]
      .sort(() => zufall() - 0.5)
      .slice(0, n)
      .map((x) => x.i)
  )
  return [...kern].map((c, i) => (weg.has(i) ? '_' : c)).join('')
  function i_ok(i: number, c: string): boolean {
    return i > 0 && /\p{L}/u.test(c)
  }
}

/** Buchstaben des Wortes (Kernform) gemischt, für „Buchstaben legen" */
export function buchstaben(term: string, zufall: () => number = Math.random): string[] {
  const kern = kernform(varianten(term)[0] ?? term)
  return kern
    .split('')
    .filter((c) => c !== ' ')
    .sort(() => zufall() - 0.5)
}
