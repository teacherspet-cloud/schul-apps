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

import { apostrophNormal, istApostroph } from './apostroph'
import { abkuerzungAus, abkUeben, abkVoll, antwortTeile, auchRichtigAus, kurzPasst, platzhalterNormal, type Abkuerzung } from './abkuerzung'

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
  /** Sprechtext für die Sprachausgabe statt des Wortes (09.10.2026, von der Lehrkraft gesetzt – nur für den Ton) */
  aussprache?: string
  /** Weitere richtige Antworten, von der Lehrkraft eingetragen („auch richtig", 09.10.2026) */
  auchRichtig?: string[]
  /** Tagesrunde einer Sprache (10.10.2026, shared/sprachstand.ts): Wort aus einem früheren Band – „aus Green Line 1 · Unit 2" */
  herkunft?: string
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
  /** Erster Kontakt (ms) – für die Tagesration neuer Wörter (08.10.2026); fehlt bei älteren Ständen */
  erstmals?: number
  /** Zuletzt in ein höheres Fach gerückt (ms) – freiwilliges Üben rückt am selben Tag nicht noch einmal vor */
  vor?: number
}

export const TAG = 86_400_000
/**
 * Namen der Fächer (03.10.2026, mit der Lehrkraft abgestimmt: „Lernstufen" – Lernende sollen verstehen,
 * welche Wörter in welches Fach kommen, und ihren Fortschritt sehen). Je Stufe: Name, kurzer Name für
 * schmale Kästen, wann das Wort wiederkommt und wie es hineinkommt.
 */
export const STUFEN: { name: string; kurz: string; wieder: string; hinein: string }[] = [
  { name: 'Neu', kurz: 'Neu', wieder: 'in der nächsten Runde', hinein: 'Hier beginnt jedes Wort der Liste – du lernst es mit einer Lernkarte kennen.' },
  {
    name: 'Angefangen',
    kurz: 'Ange­fangen',
    wieder: 'morgen',
    hinein: 'Du hast die Lernkarte gewusst. Hierher fällt ein Wort auch zurück, wenn es später danebengeht.'
  },
  { name: 'Wiedererkannt', kurz: 'Wieder­erkannt', wieder: 'in 3 Tagen', hinein: 'Du hast das Wort einmal richtig erkannt oder geschrieben.' },
  { name: 'Geübt', kurz: 'Geübt', wieder: 'in 7 Tagen', hinein: 'Du hast es selbst richtig geschrieben – Erkennen allein reicht ab hier nicht mehr.' },
  { name: 'Gefestigt', kurz: 'Gefestigt', wieder: 'in 16 Tagen', hinein: 'Nach einer Woche Pause wieder richtig geschrieben.' },
  { name: 'Gekonnt', kurz: 'Gekonnt', wieder: 'in 35 Tagen', hinein: 'Auch nach über zwei Wochen noch richtig geschrieben.' },
  {
    name: 'Im Langzeitgedächtnis',
    kurz: 'Langzeit',
    wieder: 'in 90 Tagen',
    hinein: 'Nach über einem Monat noch gewusst – das Wort sitzt. Ab und zu kommt es zur Sicherheit wieder.'
  }
]

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
export type Uebung =
  | 'karte'
  | 'auswahl'
  | 'hoeren'
  | 'buchstaben'
  | 'frei'
  | 'diktat'
  | 'luecke'
  | 'auswahlFs'
  | 'paar'
  | 'luecken'
  /** Abkürzungen (09.10.2026): „YA" → Langform schreiben bzw. „young adults" → Abkürzung schreiben */
  | 'abkLang'
  | 'abkKurz'
export const UEBUNGEN: Uebung[] = ['karte', 'auswahl', 'hoeren', 'buchstaben', 'frei', 'diktat', 'luecke', 'auswahlFs', 'paar', 'luecken', 'abkLang', 'abkKurz']
/** Erkennen (nicht selbst schreiben): bringt höchstens bis Fach 2 */
export const ERKENNEN: Uebung[] = ['auswahl', 'hoeren', 'auswahlFs', 'paar']

/**
 * Abkürzungs-Übung für Einträge wie „YA = young adults" (09.10.2026, Wunsch der Lehrkraft) – nur für solche Wörter und
 * erst nach der Lernkarte: etwa jede vierte Abfrage. Bis Fach 1 die Abkürzung schreiben (Langform steht da), danach
 * meist die Abkürzung auflösen. Zählt wie die anderen Schreibübungen (rückt vor, aber nicht für „sicher").
 */
export function abkUebungFuer(st: WortStand, v: Vokabel, zufall: number): Uebung | null {
  if (!abkuerzungAus(v.term) || (st.fach === 0 && st.versuche === 0)) return null
  // Eigener Zufallswert: die Verteilung der übrigen Übungen bleibt, wie sie war
  if (zufall < 0.75) return null
  // Was die Tabelle des Lehrwerks erlaubt („GCSE": nur auflösen, „°C": nur auflösen)
  const ueben = abkUeben(v.term)
  if (ueben === 'keine') return null
  if (ueben === 'aufloesen') return 'abkLang'
  if (ueben === 'kuerzen' || st.fach <= 1) return 'abkKurz'
  return zufall < 0.8 ? 'abkKurz' : 'abkLang'
}

/** Welche Übung als Nächstes für dieses Wort (je nach Fach) – Erstkontakt mit Karte, dann steigend */
export function uebungFuer(st: WortStand, v: Vokabel, zufall = Math.random(), zufall2 = Math.random()): Uebung {
  if (st.fach === 0 && st.versuche === 0) return 'karte'
  const abk = abkUebungFuer(st, v, zufall2)
  if (abk) return abk
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

/**
 * „Abfrage ohne Hinschauen" (09.10.2026, Tipp auf der Startseite): nur selbst abrufen – keine Auswahl, kein Erkennen.
 * Neue Wörter bleiben beim ersten Kontakt Lernkarte; Fach 0–1 legt Buchstaben, Fach 2 schreibt (auch mit Lücken),
 * ab Fach 3 wie gewohnt (frei, Lückensatz, Diktat).
 */
export function abrufUebungFuer(st: WortStand, v: Vokabel, zufall = Math.random(), zufall2 = Math.random()): Uebung {
  if (st.fach === 0 && st.versuche === 0) return 'karte'
  const abk = abkUebungFuer(st, v, zufall2)
  if (abk) return abk
  if (st.fach <= 1) return 'buchstaben'
  if (st.fach === 2) return zufall < 0.35 ? 'luecken' : 'frei'
  return uebungFuer(st, v, zufall, 0)
}

/**
 * „Lege das Wort" in der schwersten Stufe (09.10.2026, Wunsch der Lehrkraft): Ab diesem Fach setzen die Lernenden die
 * Leerzeichen selbst. Damit nichts verrät, ob das Wort getrennt geschrieben wird, gilt die Stufe für JEDES Wort –
 * die Leertaste steht also auch bei „house" bereit, und es gibt keine Lücke oder Feldaufteilung.
 */
export const LEGE_LEERZEICHEN_AB = 2
export const leerzeichenSelbst = (st: Pick<WortStand, 'fach'> | null | undefined): boolean => (st?.fach ?? 0) >= LEGE_LEERZEICHEN_AB

/** Kommt das Wort (oder sein Kern ohne „to"/Artikel) im Satz vor? */
export function enthaeltWort(satz: string, term: string): boolean {
  if (abkuerzungAus(term)) return satzMitLuecke(satz, term) !== null
  const kern = kernform(varianten(term)[0] ?? term)
  return kern.length >= 2 && satz.toLowerCase().includes(kern.toLowerCase())
}

/**
 * Abkürzung im Satz (09.10.2026): erst die Langform („young adults", wie sonst ab Wortanfang), dann die Abkürzung selbst –
 * genau so geschrieben und als ganzes Wort, damit „YA" nicht in „player" gefunden wird.
 */
function abkImSatz(satz: string, e: Abkuerzung): { vor: string; nach: string; loesung: string } | null {
  const lang = satzMitLuecke(satz, e.lang)
  if (lang) return lang
  const k = e.kurz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|[^\\p{L}\\d])(${k})(?![\\p{L}\\d])`, 'u').exec(satz)
  if (!m) return null
  const i = m.index + m[1].length
  return { vor: satz.slice(0, i), nach: satz.slice(i + m[2].length), loesung: m[2] }
}

/** Satz mit Lücke an der Stelle des Wortes */
export function satzMitLuecke(satz: string, term: string): { vor: string; nach: string; loesung: string } | null {
  const abk = abkuerzungAus(term)
  if (abk) return abkImSatz(satz, abk)
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

/**
 * Auslassungspunkte („to look forward to ...", „… ago") gehören nicht zur Antwort (09.10.2026, Wunsch der Lehrkraft):
 * Wer sie weglässt, antwortet richtig; wer sie mittippt, auch. Drei (oder mehr) Punkte und das Zeichen „…" fallen weg,
 * einzelne Punkte wie in „sb." oder „etw." bleiben.
 */
export const ohneAuslassung = (t: string): string =>
  String(t ?? '')
    .replace(/\.{3,}|…/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** „to go" → „go", „the dog" → „dog", „(to) play" → „play" */
export function kernform(t: string): string {
  // Apostroph vorher vereinheitlichen: „l’ école" verliert den Artikel wie „l' école" (08.10.2026)
  return apostrophNormal(ohneAuslassung(ohneAngaben(t)))
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
  // Alle Apostroph-Zeichen (’ ‘ ʼ ´ ` …) zählen gleich (08.10.2026)
  // Platzhalter wie „sb"/„somebody", „etw."/„etwas" zählen gleich (09.10.2026)
  platzhalterNormal(apostrophNormal(ohneAuslassung(s)))
    .toLowerCase()
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

type Bewertung = { urteil: Urteil; hinweis?: string; richtig: string }

/**
 * Abkürzungs-Eintrag (09.10.2026, Wunsch der Lehrkraft): Richtig ist die Abkürzung allein („YA"), die Langform allein
 * („young adults", wie sonst ohne Groß-/Kleinschreibung und mit Tippfehler-Toleranz) oder beides in einer üblichen
 * Schreibweise („YA = young adults", „YA (young adults)", „young adults (YA)"). Abweichende Groß-/Kleinschreibung der
 * Abkürzung („ya") zählt, die Rückmeldung nennt aber die richtige. Die Lösung zeigt immer den ganzen Eintrag.
 * `ziel`: nur die Abkürzung bzw. nur die Langform verlangen (Übungen „Abkürzung schreiben"/„auflösen") – der ganze
 * Eintrag zählt dann auch.
 */
export function bewerteAbkuerzung(antwort: string, e: Abkuerzung, ziel: 'beide' | 'kurz' | 'lang' = 'beide', strikt = false): Bewertung {
  const richtig = abkVoll(e)
  const a = String(antwort ?? '').trim()
  if (!a) return { urteil: 'falsch', richtig }
  const schreibweise: Bewertung = { urteil: 'richtig', hinweis: `Achte auf die Schreibweise der Abkürzung: „${e.kurz}“.`, richtig }
  const langUrteil = (x: string): Bewertung => bewerte(x, e.lang, strikt)
  // Beides genannt
  const teile = antwortTeile(a)
  if (teile)
    for (const [x, y] of [teile, [teile[1], teile[0]]]) {
      const k = kurzPasst(x, e.kurz)
      const l = langUrteil(y)
      if (k && l.urteil !== 'falsch') return l.urteil === 'fast' ? { ...l, richtig } : k === 'genau' ? { urteil: 'richtig', richtig } : schreibweise
    }
  if (ziel !== 'lang') {
    const k = kurzPasst(a, e.kurz)
    if (k === 'genau') return { urteil: 'richtig', richtig }
    if (k) return strikt ? { urteil: 'falsch', richtig } : schreibweise
  }
  if (ziel !== 'kurz') {
    const l = langUrteil(a)
    if (l.urteil !== 'falsch') return { ...l, richtig }
  } else if (langUrteil(a).urteil === 'richtig') return { urteil: 'falsch', hinweis: `Gefragt ist die Abkürzung: „${e.kurz}“.`, richtig }
  return { urteil: 'falsch', richtig }
}

/**
 * Antwort bewerten (tolerant mit Hinweis):
 *  - genau (ohne Groß-/Kleinschreibung, Satzzeichen am Ende, „to"/Artikel optional) → richtig
 *  - nur Akzent fehlt → fast („Akzent fehlt: é")
 *  - ein Tippfehler bei Wörtern ab 5 Buchstaben → fast
 *  - Einträge mit Abkürzung („YA = young adults"): siehe bewerteAbkuerzung
 */
export function bewerte(antwort: string, loesung: string, strikt = false): Bewertung {
  const r = bewerteGrund(antwort, loesung, strikt)
  if (r.urteil === 'richtig') return r
  // Weitere richtige Antworten aus der Abkürzungs-Tabelle („PC" → „personal computer", „Mr" → „Mr.")
  for (const alt of auchRichtigAus(loesung)) {
    const x = bewerteGrund(antwort, alt, strikt)
    if (x.urteil === 'richtig' || (x.urteil === 'fast' && r.urteil === 'falsch')) return { ...x, richtig: r.richtig }
  }
  return r
}

/** Antwort gegen weitere, von der Lehrkraft eingetragene richtige Antworten („auch richtig") prüfen */
export function bewerteMitAuchRichtig(antwort: string, loesung: string, auch: string[] | undefined, strikt = false): Bewertung {
  const r = bewerte(antwort, loesung, strikt)
  if (r.urteil === 'richtig') return r
  for (const alt of auch ?? []) {
    if (!String(alt ?? '').trim()) continue
    const x = bewerte(antwort, alt, strikt)
    if (x.urteil === 'richtig' || (x.urteil === 'fast' && r.urteil === 'falsch')) return { ...x, richtig: r.richtig }
  }
  return r
}

function bewerteGrund(antwort: string, loesung: string, strikt: boolean): Bewertung {
  const abk = abkuerzungAus(loesung)
  if (abk) {
    // Genau der ganze Eintrag (auch bei Auswahl unter Falschschreibungen) – sonst die Regeln der Abkürzung
    if (normal(antwort) === normal(loesung)) return { urteil: 'richtig', richtig: abkVoll(abk) }
    return bewerteAbkuerzung(antwort, abk, 'beide', strikt)
  }
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
  const st: WortStand = {
    ...st0,
    frei: [...st0.frei],
    fehlerTexte: [...st0.fehlerTexte],
    versuche: st0.versuche + 1,
    zuletzt: jetzt,
    // Erster Kontakt: für die Tagesration neuer Wörter (08.10.2026)
    ...(st0.versuche === 0 && !st0.erstmals ? { erstmals: jetzt } : {})
  }
  const erkennen = ERKENNEN.includes(uebung)
  if (erkennen) {
    st.erkennenVersuche++
    if (urteil === 'richtig') st.erkannt++
  }
  if (uebung === 'karte') {
    if (urteil === 'richtig' && st.fach < 1) {
      st.fach = 1
      st.vor = jetzt
    }
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
  const vorher = st.fach
  st.fach = Math.max(st.fach === 0 ? 1 : st.fach, ziel)
  if (st.fach > vorher) st.vor = jetzt
  let faellig = jetzt + ABSTAENDE[st.fach] * TAG
  // Termin-Anker: vor dem Test noch einmal fällig (spätestens 2 Tage vorher, nicht vor morgen)
  if (testTermin && testTermin > jetzt && faellig > testTermin - 2 * TAG) faellig = Math.max(jetzt + TAG, Math.min(faellig, testTermin - 2 * TAG))
  st.faellig = faellig
  return st
}

/**
 * Freiwillig weiter üben (08.10.2026, abgestimmt): Richtig rückt nur vor, wenn das Wort fällig ist und heute noch nicht
 * vorgerückt ist – sonst reine Übung. Falsch stuft nicht zurück, wird aber gemerkt (Fehlertexte, bald wieder dran).
 */
export function nachFreiwillig(st0: WortStand, uebung: Uebung, urteil: Urteil, antwort: string, jetzt = Date.now(), testTermin?: number): WortStand {
  const heuteVorgerueckt = Boolean(st0.vor && tagVon(st0.vor) === tagVon(jetzt))
  if (urteil === 'richtig' && st0.faellig <= jetzt && !heuteVorgerueckt) return nachAbfrage(st0, uebung, urteil, antwort, jetzt, testTermin)
  const st: WortStand = { ...st0, frei: [...st0.frei], fehlerTexte: [...st0.fehlerTexte], versuche: st0.versuche + 1, zuletzt: jetzt }
  if (ERKENNEN.includes(uebung)) {
    st.erkennenVersuche++
    if (urteil === 'richtig') st.erkannt++
  }
  if (urteil === 'falsch') {
    st.falsch++
    if (antwort.trim()) st.fehlerTexte = [...st.fehlerTexte, antwort.trim().slice(0, 60)].slice(-5)
  }
  // Nicht gewusst: spätestens morgen wieder im Kasten (wackelig) – das Fach bleibt
  if (urteil !== 'richtig' && st.faellig > jetzt + TAG) st.faellig = jetzt + TAG
  return st
}

/**
 * Wörter für das freiwillige Üben (abgestimmt): zuerst die heute falsch beantworteten bzw. nicht gewussten, dann die
 * wackeligen (Fach 1–2), danach alle übrigen schon geübten – je Runde `n`. Nie geübte Wörter kommen über „weitere neue".
 */
export function freiwilligeWoerter(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now(), n = 10): Vokabel[] {
  const heute = tagVon(jetzt)
  const geuebt = liste.filter((v) => (staende[v.id]?.versuche ?? 0) > 0)
  const st = (v: Vokabel): WortStand => staende[v.id]
  const rang = (v: Vokabel): number => {
    const s = st(v)
    // Heute daneben: heute geübt und danach noch fällig (richtig Beantwortete sind erst morgen wieder dran)
    const heuteDaneben = tagVon(s.zuletzt) === heute && s.faellig <= jetzt
    return heuteDaneben ? 0 : s.fach <= 2 ? 1 : 2
  }
  return geuebt
    .map((v) => ({ v, r: rang(v), z: streu(`${heute}|${v.id}|frei`) }))
    .sort((a, b) => a.r - b.r || a.z - b.z)
    .slice(0, n)
    .map((x) => x.v)
}

let TAG_FORMAT: Intl.DateTimeFormat | null = null
const TAG_JE_STUNDE = new Map<number, string>()
/** Tag in Deutschland (JJJJ-MM-TT) – Grenze der Tagesration */
export const tagVon = (ms: number): string => {
  /*
   * Leistung (09.10.2026): toLocaleDateString mit Zeitzone baut bei jedem Aufruf einen Formatierer – in „Meine Klassen"
   * (je Lernende und Wort mehrfach) kostete das über 20 s. Ein Formatierer für alle, dazu ein Merkzettel je Stunde
   * (Tagesgrenzen in Deutschland liegen immer auf vollen UTC-Stunden).
   */
  const stunde = Math.floor(ms / 3_600_000)
  const da = TAG_JE_STUNDE.get(stunde)
  if (da !== undefined) return da
  if (!Number.isFinite(ms)) return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  TAG_FORMAT ??= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' })
  const tag = TAG_FORMAT.format(ms)
  if (TAG_JE_STUNDE.size > 5000) TAG_JE_STUNDE.clear()
  TAG_JE_STUNDE.set(stunde, tag)
  return tag
}

/** Neue Wörter je Tag (08.10.2026, Wunsch der Lehrkraft: 127 freigegebene Vokabeln nicht alle am ersten Tag) */
export const NEU_JE_TAG = 10

/** Kleine, feste Streuzahl – mischt die neuen Wörter je Tag gleich (bleibt beim Neuladen stabil) */
const streu = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Wurde das Wort heute zum ersten Mal geübt? (Ältere Stände ohne `erstmals`: heute geübt und höchstens in Fach 1) */
const heuteNeu = (st: WortStand, heute: string): boolean =>
  st.erstmals ? tagVon(st.erstmals) === heute : st.versuche > 0 && st.fach <= 1 && tagVon(st.zuletzt) === heute

/** Noch nie geübte Wörter in der Reihenfolge des Tages (zufällig, aber je Tag fest) */
export function neueWoerter(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now()): Vokabel[] {
  const heute = tagVon(jetzt)
  return liste
    .filter((v) => (staende[v.id]?.versuche ?? 0) === 0 && (staende[v.id]?.fach ?? 0) === 0)
    .map((v) => [streu(`${heute}|${v.id}`), v] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
}

/**
 * Tagesration (08.10.2026, abgestimmt): fällige Wiederholungen (älteste zuerst; dazu kennengelernte, aber noch nicht
 * gewusste), dann so viele neue Wörter, dass es heute höchstens `neu` neue sind – in zufälliger Reihenfolge. Ist die
 * Ration geschafft, gibt es die Spiele; weitere neue Wörter nur freiwillig (`weitereNeue`). Am nächsten Tag die nächsten.
 */
export function sitzungsWoerter(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now(), neu = NEU_JE_TAG, max = 25): Vokabel[] {
  const st = (v: Vokabel): WortStand => staende[v.id] ?? neuerStand()
  const heute = tagVon(jetzt)
  const faellig = liste
    // Neue und angefangene Wörter (Fach 0–1), heute schon geübt (auch nicht gewusst), kommen erst morgen wieder – sie
    // wurden in der Runde selbst wiederholt; so endet die Tagesration. Ab Fach 2 bleibt „fast" heute noch fällig.
    .filter((v) => (st(v).fach > 0 || st(v).versuche > 0) && st(v).faellig <= jetzt && !(st(v).fach <= 1 && st(v).zuletzt && tagVon(st(v).zuletzt) === heute))
    .sort((a, b) => st(a).faellig - st(b).faellig)
  const schonNeu = liste.filter((v) => heuteNeu(st(v), heute)).length
  const neue = neueWoerter(liste, staende, jetzt).slice(0, Math.max(0, neu - schonNeu))
  return [...faellig, ...neue].slice(0, max)
}

/** Schrittgröße beim Üben: die Tagesration kommt in Zehnerschritten (der letzte Schritt ggf. kleiner) */
export const SCHRITT = 10

/**
 * Die Tagesrunde (10.10.2026, Befund der Lehrkraft: die Startseite nannte „88 Vokabeln sind heute dran", der Ordner
 * „heute noch 45" – drei verschiedene Rechnungen). EINE Zahl überall: fällige Wiederholungen (älteste zuerst), dann neue
 * Wörter bis zum Tagesziel – höchstens so viele wie das Tagesziel (mindestens ein Zehnerschritt). Weitere fällige
 * Wiederholungen nennt `extra`: freiwillig, ruhig erwähnt, sie kommen sonst morgen zuerst.
 */
export const rundenGrenze = (ziel: number): number => Math.max(SCHRITT, Math.round(ziel) || 0)
export function tagesRunde(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now(), ziel = NEU_JE_TAG): { woerter: Vokabel[]; extra: number } {
  const alle = sitzungsWoerter(liste, staende, jetzt, ziel, Number.MAX_SAFE_INTEGER)
  const grenze = rundenGrenze(ziel)
  const woerter = alle.slice(0, grenze)
  const neuIds = new Set(neueWoerter(liste, staende, jetzt).map((v) => v.id))
  return { woerter, extra: alle.slice(grenze).filter((v) => !neuIds.has(v.id)).length }
}

/** Freiwillig weiter (nach der Tagesration): die nächsten `n` neuen Wörter */
export const weitereNeue = (liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now(), n = NEU_JE_TAG): Vokabel[] =>
  neueWoerter(liste, staende, jetzt).slice(0, n)

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
  /** Heute schon geübte Wörter und was von der Tagesration noch offen ist (08.10.2026, Anzeige für Lernende) */
  heuteGeuebt?: number
  heuteOffen?: number
}

export function uebersicht(liste: Vokabel[], staende: Record<string, WortStand>, jetzt = Date.now(), tagesziel = NEU_JE_TAG): Uebersicht {
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
  const heute = tagVon(jetzt)
  const heuteGeuebt = liste.filter((v) => (staende[v.id]?.zuletzt ?? 0) > 0 && tagVon(staende[v.id].zuletzt) === heute).length
  const heuteOffen = tagesRunde(liste, staende, jetzt, tagesziel).woerter.length
  return {
    gesamt: liste.length,
    neu: faecher[0],
    imAufbau: liste.length - faecher[0] - sicher,
    sicher,
    faellig,
    erkennen: erkV ? erk / erkV : 0,
    faecher,
    heuteGeuebt,
    heuteOffen
  }
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
/**
 * Leerzeichen der Lösung automatisch einsetzen (06.10.2026, Befund der Lehrkraft: „to bring about" ergab beim Legen
 * „bringabout" und galt als falsch). Die Kacheln enthalten keine Leerzeichen; sie stehen hier an ihrer Stelle, sobald
 * die Buchstaben davor gelegt sind.
 */
export function mitLeerzeichen(term: string, gelegt: string): string {
  const kern = kernform(varianten(term)[0] ?? term)
  let aus = ''
  let i = 0
  for (const c of kern) {
    // Apostrophe sind wie Leerzeichen keine Kacheln, sondern vorbelegt – auch am Wortende („dogs'", 08.10.2026)
    if (istApostroph(c)) {
      aus += c
      continue
    }
    if (i >= gelegt.length) break
    if (c === ' ') aus += ' '
    else aus += gelegt[i++]
  }
  return aus + gelegt.slice(i)
}

/**
 * Wie `mitLeerzeichen`, aber für das Tippfeld (09.10.2026): Ein Leerzeichen (bzw. Apostroph), das direkt nach den schon
 * gelegten Buchstaben folgt, steht schon da – leicht, man muss es nicht tippen. Tippt man es doch, wird es nicht doppelt
 * (getippte Leerzeichen verbrauchen nichts, das Feld zeigt immer diese Form).
 */
export function mitLeerzeichenVoraus(term: string, gelegt: string): string {
  if (!gelegt) return mitLeerzeichen(term, gelegt)
  const kern = kernform(varianten(term)[0] ?? term)
  let aus = ''
  let i = 0
  for (const c of kern) {
    if (c === ' ' || istApostroph(c)) {
      aus += c
      continue
    }
    // Erst am nächsten fehlenden Buchstaben aufhören – die Leerzeichen davor stehen schon
    if (i >= gelegt.length) break
    aus += gelegt[i++]
  }
  return aus + gelegt.slice(i)
}

/**
 * Schwerste Stufe von „Lege das Wort" (09.10.2026): Die Lernenden setzen die Leerzeichen selbst (`gelegt` enthält sie,
 * wie getippt). Nur Apostrophe stehen weiter von selbst an ihrer Stelle – direkt hinter dem Buchstaben, dem sie in der
 * Lösung folgen („dogs'", „l'école"), sonst vor dem nächsten („'cause").
 */
export function mitApostrophen(term: string, gelegt: string): string {
  const kern = kernform(varianten(term)[0] ?? term)
  const vor: string[] = []
  const nach: string[] = []
  let n = 0
  let puffer = ''
  let letztesBuchstabe = false
  for (const c of kern) {
    if (istApostroph(c)) {
      if (letztesBuchstabe) nach[n - 1] = (nach[n - 1] ?? '') + c
      else puffer += c
      continue
    }
    if (c === ' ') {
      letztesBuchstabe = false
      continue
    }
    vor[n] = puffer
    puffer = ''
    n++
    letztesBuchstabe = true
  }
  let aus = ''
  let i = 0
  for (const c of gelegt) {
    if (c === ' ') {
      aus += c
      continue
    }
    aus += (vor[i] ?? '') + c + (nach[i] ?? '')
    i++
  }
  return aus
}

export function buchstaben(term: string, zufall: () => number = Math.random): string[] {
  const kern = kernform(varianten(term)[0] ?? term)
  return kern
    .split('')
    .filter((c) => c !== ' ' && !istApostroph(c))
    .sort(() => zufall() - 0.5)
}

/** Wackelig wie im Lernstand der Startseite: Fach 1–2, schon einmal falsch, in den letzten 14 Tagen geübt */
export const istWackelig = (s: WortStand, jetzt = Date.now()): boolean => s.fach >= 1 && s.fach <= 2 && s.falsch > 0 && jetzt - (s.zuletzt || 0) < 14 * TAG

/** Übungen, die ein Link direkt startet (`/s/v/<ID>?uebung=…`, Tipps der Startseite, 09.10.2026) */
export type LinkUebung = 'runde' | 'abfragen' | 'wackelig' | 'neu'
export const LINK_UEBUNGEN: readonly LinkUebung[] = ['runde', 'abfragen', 'wackelig', 'neu']

/**
 * Welche Runde ein Link startet (09.10.2026, Befund der Lehrkraft: „Abfrage ohne Hinschauen starten" öffnete nur die
 * Kursseite). `runde`: der nächste Zehnerschritt der Tagesration (sonst freiwillig weiter); `abfragen`: dasselbe, aber
 * zuerst schon bekannte Wörter und nur selbst abrufen; `wackelig`: die wackeligen Wörter (freiwillig – ohne
 * Zurückstufen). null = nichts zu üben, die Kursseite bleibt.
 */
export function linkRunde(
  art: string | null,
  liste: Vokabel[],
  staende: Record<string, WortStand>,
  jetzt = Date.now(),
  tagesziel = NEU_JE_TAG
): { woerter: Vokabel[]; abfragen: boolean; freiwillig: boolean } | null {
  if (!art || !(LINK_UEBUNGEN as readonly string[]).includes(art)) return null
  const heute = tagesRunde(liste, staende, jetzt, tagesziel).woerter
  const frei = (): Vokabel[] => freiwilligeWoerter(liste, staende, jetzt)
  // Freiwillig Neues aus einem früheren Band (10.10.2026, „Noch nicht gelernte Wörter lernen"): die nächsten zehn neuen
  if (art === 'neu') {
    const w = weitereNeue(liste, staende, jetzt, SCHRITT)
    if (w.length) return { woerter: w, abfragen: false, freiwillig: false }
    art = 'runde'
  }
  if (art === 'wackelig') {
    const w = liste.filter((v) => staende[v.id] && istWackelig(staende[v.id], jetzt)).slice(0, SCHRITT)
    if (w.length) return { woerter: w, abfragen: false, freiwillig: true }
    art = 'runde'
  }
  if (art === 'abfragen') {
    const bekannt = heute.filter((v) => (staende[v.id]?.versuche ?? 0) > 0)
    const w = (bekannt.length ? bekannt : heute).slice(0, SCHRITT)
    if (w.length) return { woerter: w, abfragen: true, freiwillig: false }
    const f = frei()
    return f.length ? { woerter: f, abfragen: true, freiwillig: true } : null
  }
  if (heute.length) return { woerter: heute.slice(0, SCHRITT), abfragen: false, freiwillig: false }
  const f = frei()
  return f.length ? { woerter: f, abfragen: false, freiwillig: true } : null
}
