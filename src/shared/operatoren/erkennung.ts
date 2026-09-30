/**
 * Operatoren in Aufgabenstellungen erkennen – EINE Erkennung für alle Programme (30.09.2026).
 *
 * Anlass (Rückmeldung der Lehrkraft): „‚Erläutern Sie …' und ‚Arbeiten Sie … heraus' werden
 * nicht als Operatoren erkannt, obwohl es Operatoren in Geschichte sind." Bis dahin hatte jedes
 * Programm eine eigene Erkennung: die Lernzielkontrolle einen Wortstamm mit festen Endungen
 * (die Sie-Form „erläutern" von „erläutern" fiel durch, weil nach dem Stamm „erläuter" nur ein
 * „n" folgt), das Arbeitsblatt nur das erste Wort, die Klassenarbeit die fett gesetzten Teile.
 * Trennbare Verben („Arbeite … heraus", „Stelle … dar") kannte nur eine kleine Handtabelle.
 *
 * Erkannt werden hier:
 *   - du-, ihr- und Sie-Imperativ und Infinitiv („Erläutere", „Erläutert", „Erläutern Sie",
 *     „erläutern"), starke Verben mit Vokalwechsel („Gib", „Nimm", „Entwirf")
 *   - trennbare Verben mit der Partikel am Satz- bzw. Teilsatzende („Arbeiten Sie … heraus",
 *     „Setze dich … auseinander", „Ordne … ein")
 *   - Wendungen aus mehreren Wörtern („Stellung nehmen", „in Beziehung setzen")
 *   - Substantivierungen als Rückfall („Verfasse eine Stellungnahme" ohne Verb der Liste)
 *   - zielsprachige Operatoren am Anfang eines Satzes oder Teilsatzes („Describe …",
 *     „Décrivez …", „Analiza …"), britische und amerikanische Schreibung gleich
 *
 * Ob ein erkanntes Verb ein OPERATOR ist, entscheidet immer die übergebene Liste – in den
 * Programmen die Liste aus `operatorenAuswahl` für Land, Fach, Stufe und Schulform. Ein Verb,
 * das nur in anderen Listen steht, meldet `pruefeAnweisung` als „kein Operator der Landesliste"
 * mit dem nächstliegenden Operator der Liste.
 */
import { BESTAND } from './zugriff'
import type { Listensprache } from './typen'

export type ErkennungsSprache = Listensprache

/** Ein Listeneintrag in einer der Formen, wie sie in den Programmen vorkommen */
export type OperatorAngabe = string | { operator: string; formen?: string[] } | { name: string; synonyme?: string[] }

export interface OperatorTreffer {
  /** Name des Listeneintrags (erste Form) */
  operator: string
  /** Stelle des Eintrags in der übergebenen Liste */
  index: number
  /** Die Form im Text, bei getrennten Verben mit Auslassung („Arbeiten … heraus") */
  form: string
  /** Zeichenposition im bereinigten Text */
  position: number
  art: 'verb' | 'getrennt' | 'wendung' | 'nomen'
}

export const nameVon = (a: OperatorAngabe): string => (typeof a === 'string' ? a : 'operator' in a ? a.operator : a.name)
const formenVon = (a: OperatorAngabe): string[] => (typeof a === 'string' ? [] : 'operator' in a ? a.formen ?? [] : a.synonyme ?? [])

/* ---------- Text zerlegen ---------- */

interface Wort {
  w: string
  roh: string
  start: number
  satz: number
  /** Beginnt hier ein Satz oder Teilsatz? */
  anfang: boolean
  /** Endet hier ein Satz oder Teilsatz? */
  ende: boolean
}

/** Abkürzungen, nach denen ein Punkt keinen Satz beendet */
const ABKUERZUNGEN = new Set(
  'z b d h u a v n o ä e i s m chr bzw ca vgl usw etc nr jh jhd bspw ggf evtl inkl sog dt engl frz lat abb tab kap zit hrsg mio mrd st str bzgl ebd f ff'.split(
    ' '
  )
)
/** Bindewörter, nach denen ein neuer Teilsatz mit eigenem Imperativ beginnen kann */
const ANSCHLUSS = new Set(['und', 'oder', 'sowie', 'dann', 'anschließend', 'and', 'or', 'then', 'et', 'puis', 'ou', 'y', 'e', 'o', 'luego', 'poi'])

/** Markdown, Formeln und Zeichen, die für die Erkennung stören */
export function bereinigterText(text: string): string {
  return (text ?? '')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\\[a-z]+\{[^}]*\}/gi, ' ')
    .replace(/[*_`#]+/g, '')
    .replace(/[’‘]/g, "'")
}

function zerlege(text: string): Wort[] {
  const t = bereinigterText(text)
  const woerter: Wort[] = []
  let satz = 0
  let letzteEnde = 0
  for (const m of t.matchAll(/\p{L}+(?:['-]\p{L}+)*/gu)) {
    const start = m.index ?? 0
    const zwischen = t.slice(letzteEnde, start)
    const vorher = woerter[woerter.length - 1]
    // Satzgrenze: . ! ? ; : oder Zeilenumbruch – ein Punkt nach Zahl („19. Jahrhundert") oder Abkürzung („v. Chr.") nicht
    let neuerSatz = !vorher
    if (vorher) {
      const punkt = zwischen.indexOf('.')
      if (/[!?;:\n]/.test(zwischen)) neuerSatz = true
      else if (punkt >= 0) neuerSatz = !ABKUERZUNGEN.has(vorher.w) && !/\d\s*$/.test(zwischen.slice(0, punkt))
    }
    if (vorher && neuerSatz) satz++
    const teilsatz = /[,()–—]/.test(zwischen) || /(^|\s)[a-z]\)\s*$/i.test(zwischen)
    if (vorher) vorher.ende = neuerSatz || teilsatz || ANSCHLUSS.has(m[0].toLowerCase())
    woerter.push({
      w: m[0].toLocaleLowerCase('de'),
      roh: m[0],
      start,
      satz,
      anfang: !vorher || neuerSatz || teilsatz || ANSCHLUSS.has(vorher.w),
      ende: false
    })
    letzteEnde = start + m[0].length
  }
  if (woerter.length) woerter[woerter.length - 1].ende = true
  return woerter
}

/* ---------- Deutsch ---------- */

/** Trennbare Vorsilben, die längsten zuerst */
const TRENNBAR = [
  'auseinander',
  'gegenüber',
  'zusammen',
  'heraus',
  'hervor',
  'herbei',
  'vorher',
  'zurück',
  'wieder',
  'heran',
  'dazu',
  'fest',
  'nach',
  'hin',
  'her',
  'dar',
  'ein',
  'auf',
  'aus',
  'vor',
  'mit',
  'bei',
  'ab',
  'an',
  'zu'
]

/** Starke Verben mit anderem du-Imperativ */
const STARK: [string, string][] = [
  ['geben', 'gib'],
  ['nehmen', 'nimm'],
  ['lesen', 'lies'],
  ['sehen', 'sieh'],
  ['messen', 'miss'],
  ['werfen', 'wirf'],
  ['sprechen', 'sprich'],
  ['treffen', 'triff'],
  ['helfen', 'hilf'],
  ['vergessen', 'vergiss'],
  ['empfehlen', 'empfiehl'],
  ['brechen', 'brich'],
  ['befehlen', 'befiehl'],
  ['werben', 'wirb']
]

/** Wörter, die in einer Wendung nichts zur Erkennung beitragen */
const FUELLWOERTER = new Set(
  'sich etwas jmd jemandem jemanden ein eine einen einem einer eines der die das den dem des zu zum zur mit von aus auf über für an in im am um und oder bzw bzw. ggf'.split(
    ' '
  )
)

interface DeutschesMuster {
  /** Formen des ganzen Verbs (ungetrennt) */
  ganz: Set<string>
  /** Formen, die nur am Satz- bzw. Teilsatzanfang zählen (ihr-Imperativ „erläutert" – sonst Partizip/Adjektiv) */
  nurAnfang: Set<string>
  /** Trennbares Verb: Formen des Grundverbs und die Partikel */
  grund?: { formen: Set<string>; nurAnfang: Set<string>; partikel: string }
  /** Weitere Wörter der Wendung („Stellung", „Beziehung") als Wortanfang */
  beiwoerter: string[]
}

/** Die Formen eines Verbs: [überall, nur am Anfang] */
function verbformen(verb: string): [string[], string[]] {
  const ueberall: string[] = [verb]
  const anfang: string[] = []
  if (/(?:er|el)n$/.test(verb)) {
    // erläutern → erläutere, erläutert; sammeln → sammle
    const stamm = verb.slice(0, -1)
    ueberall.push(`${stamm}e`)
    anfang.push(`${stamm}t`, `${stamm}st`)
    if (verb.endsWith('eln')) ueberall.push(`${verb.slice(0, -3)}le`)
    if (verb.endsWith('ern')) ueberall.push(`${verb.slice(0, -3)}re`)
  } else if (verb.endsWith('en')) {
    const stamm = verb.slice(0, -2)
    ueberall.push(stamm, `${stamm}e`)
    anfang.push(`${stamm}t`, `${stamm}et`, `${stamm}st`, `${stamm}est`)
  }
  for (const [inf, imp] of STARK) if (verb.endsWith(inf)) ueberall.push(verb.slice(0, -inf.length) + imp)
  return [ueberall.filter((f) => f.length >= 3), anfang.filter((f) => f.length >= 4)]
}

const wortstamm = (w: string): string => (w.length > 5 ? w.replace(/(?:en|es|e|n|s)$/, '') : w)

function deutschesMuster(variante: string): DeutschesMuster | null {
  const woerter = variante
    .toLocaleLowerCase('de')
    .replace(/…|\.\.\.|\bxx\b/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!woerter.length) return null
  // Das Verb: das letzte Wort auf -en/-ern/-eln, das kein Füllwort ist („Stellung nehmen", „formulieren aus der Sicht von")
  let vi = -1
  for (let i = woerter.length - 1; i >= 0; i--)
    if (/(?:en|ern|eln)$/.test(woerter[i]) && !FUELLWOERTER.has(woerter[i]) && woerter[i].length >= 4) {
      vi = i
      break
    }
  if (vi < 0) vi = 0
  const verb = woerter[vi]
  const beiwoerter = woerter.filter((w, i) => i !== vi && !FUELLWOERTER.has(w) && (i < vi || vi === 0) && w.length > 1).map(wortstamm)
  const [ueberall, anfang] = verbformen(verb)
  const muster: DeutschesMuster = {
    ganz: new Set(ueberall),
    nurAnfang: new Set(anfang),
    beiwoerter
  }
  const vorsilbe = TRENNBAR.find((p) => verb.startsWith(p) && verb.length - p.length >= 4 && /(?:en|ern|eln)$/.test(verb.slice(p.length)))
  if (vorsilbe) {
    const grundverb = verb.slice(vorsilbe.length)
    const [g, ga] = verbformen(grundverb)
    muster.grund = {
      formen: new Set(g),
      nurAnfang: new Set(ga),
      partikel: vorsilbe
    }
    // Ungetrennt im Nebensatz oder als zu-Infinitiv: „herauszuarbeiten"
    muster.ganz.add(`${vorsilbe}zu${grundverb}`)
  }
  return muster
}

/** Substantivierungen, die in Aufgabenstellungen für den Operator stehen */
const NOMEN: Record<string, string[]> = {
  stellungnahme: ['stellung nehmen', 'bewerten'],
  erörterung: ['erörtern'],
  analyse: ['analysieren'],
  interpretation: ['interpretieren'],
  charakterisierung: ['charakterisieren'],
  charakteristik: ['charakterisieren'],
  zusammenfassung: ['zusammenfassen'],
  beschreibung: ['beschreiben'],
  erläuterung: ['erläutern'],
  erklärung: ['erklären'],
  begründung: ['begründen'],
  beurteilung: ['beurteilen'],
  bewertung: ['bewerten'],
  vergleich: ['vergleichen'],
  einordnung: ['einordnen'],
  gegenüberstellung: ['gegenüberstellen'],
  auseinandersetzung: ['sich auseinandersetzen', 'auseinandersetzen']
}

/* ---------- Fremdsprachen ---------- */

/** Britische und amerikanische Schreibung gleich behandeln */
const englisch = (w: string): string =>
  w
    .replace(/yz(e|ed|es|ing)$/, 'ys$1')
    .replace(/iz(e|ed|es|ing)$/, 'is$1')
    .replace(/ization$/, 'isation')

const ohneAkzent = (w: string): string => w.normalize('NFD').replace(/\p{M}/gu, '')

const ROMANISCHE_ENDUNGEN: Record<string, RegExp> = {
  fr: /(?:issez|isse|ez|er|ir|re|is|it|e|s)$/,
  es: /(?:ad|ed|id|ar|er|ir|en|an|a|e|o)$/,
  it: /(?:ate|ete|ite|are|ere|ire|a|i|e)$/
}

/**
 * Russisch (30.09.2026): Infinitiv der Liste („описать", „проанализировать", „дать оценку") ↔
 * Imperativ der Aufgabe („Опишите", „Проанализируйте", „Дайте оценку", „Отметьте"). Ohne
 * `ohneAkzent` – NFD zerlegt „й" und „ё". Konsonantenwechsel im Imperativ („написать" ↔
 * „напишите", „доказать" ↔ „докажите") am Stammende ausgeglichen.
 */
function russischerStamm(w: string): string {
  const s = w.toLowerCase().replace(/ё/g, 'е')
  const r = s
    .replace(/(?:ировать|уйте|ите|йте|ьте|ть)$/, '')
    .replace(/ш$/, 'с')
    .replace(/ж$/, 'з')
  return r.length >= 2 ? r : s
}

function romanischerStamm(w: string, sprache: string): string {
  if (sprache === 'ru') return russischerStamm(w)
  let s = ohneAkzent(w)
  if (sprache === 'es') s = s.replace(/z/g, 'c')
  const r = s.replace(ROMANISCHE_ENDUNGEN[sprache] ?? /$^/, '')
  return r.length >= 3 ? r : s
}

/** Gleiches Verb? „décris" ↔ „décrire" ↔ „décrivez", „analiza" ↔ „analizar" ↔ „analice", „опишите" ↔ „описать" */
function romanischGleich(a: string, b: string, sprache: string): boolean {
  if (ohneAkzent(a) === ohneAkzent(b)) return true
  const x = romanischerStamm(a, sprache)
  const y = romanischerStamm(b, sprache)
  if (x === y) return x.length >= 2
  const [k, l] = x.length <= y.length ? [x, y] : [y, x]
  return l.startsWith(k) && ((k.length >= 4 && l.length - k.length <= 2) || (k.length === 3 && l.length - k.length === 1))
}

interface FremdMuster {
  /** Abschnitte der Wendung; der erste steht am Satzanfang, die übrigen folgen im selben Satz */
  abschnitte: string[][]
}

function fremdMuster(variante: string, sprache: ErkennungsSprache): FremdMuster[] {
  // „comment (on)" → „comment on" und „comment"
  const mitKlammer = /\(([^)]*)\)/.test(variante) ? [variante.replace(/\(([^)]*)\)/g, '$1'), variante.replace(/\([^)]*\)/g, ' ')] : [variante]
  return mitKlammer.map((v) => ({
    abschnitte: v
      .toLowerCase()
      .split(/…|\.\.\.|\bxx\b|\bsth\b|\bsb\b|\bsomething\b|\bsomebody\b|\bqc\b|\bqn\b/)
      .map((teil) =>
        teil
          .replace(/[^\p{L}\s'-]/gu, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => (sprache === 'en' ? englisch(w) : w))
      )
      .filter((a) => a.length)
  }))
}

/* ---------- Erkennung ---------- */

/** Die einzelnen Formen eines Listeneintrags: „analysieren/untersuchen", „(be)nennen", „ein-, zuordnen" */
export function variantenVon(name: string): string[] {
  const out: string[] = []
  const roh = name.replace(/\s*\.\.\.\s*$|\s*…\s*$/, '').trim()
  // „(be)nennen", „(be-)nennen" → nennen, benennen
  const klammer = /^\((\p{L}+)-?\)\s*(\p{L}.*)$/u.exec(roh)
  if (klammer) return [klammer[2], `${klammer[1]}${klammer[2]}`]
  // „be-/nennen", „ein-, zuordnen", „ein-/zuordnen"
  const vorsilbe = /^(\p{L}+)-\s*[,/]\s*(\p{L}+)$/u.exec(roh)
  if (vorsilbe) {
    const [, p, w] = vorsilbe
    const eigene = TRENNBAR.find((t) => w.toLocaleLowerCase('de').startsWith(t) && w.length - t.length >= 4)
    return [eigene ? p + w.slice(eigene.length) : p + w, w]
  }
  for (const teil of roh.split(/\s*[/,;]\s*/)) if (teil.trim()) out.push(teil.trim())
  return out
}

interface Kandidat extends OperatorTreffer {
  kopf: number
  gewicht: number
}

const deutscheMusterCache = new Map<string, DeutschesMuster | null>()
const fremdMusterCache = new Map<string, FremdMuster[]>()

/** Deutsch erkannt, auch wenn die Liste eine Fremdsprachenliste mit deutschen Entsprechungen ist */
function istDeutscheVariante(v: string, sprache: ErkennungsSprache): boolean {
  if (sprache === 'de') return true
  return deutscheOperatorwoerter().has(v.toLocaleLowerCase('de'))
}

function deutschSuchen(woerter: Wort[], variante: string, index: number, operator: string, out: Kandidat[]): void {
  // Der eigene Name eines Eintrags wiegt mehr als eine mitgeführte Form (BY: „bewerten [bewerten | Stellung nehmen]" vs. „Stellung nehmen")
  const bonus = variante.toLocaleLowerCase('de') === operator.toLocaleLowerCase('de') ? 0.5 : 0
  let m = deutscheMusterCache.get(variante)
  if (m === undefined) {
    m = deutschesMuster(variante)
    deutscheMusterCache.set(variante, m)
  }
  if (!m) return
  const muster = m
  const beiwoerterIm = (satz: number): boolean =>
    muster.beiwoerter.every((b) => woerter.some((x) => x.satz === satz && (b.length <= 3 ? x.w === b : x.w.startsWith(b))))
  woerter.forEach((x, i) => {
    // Großgeschrieben mitten im Satz ist es ein Substantiv („Beleg", „Bild", „Vergleich")
    if (!x.anfang && x.roh[0] !== x.roh[0].toLocaleLowerCase('de')) return
    // Ganzes Verb
    if (muster.ganz.has(x.w) || (x.anfang && muster.nurAnfang.has(x.w))) {
      if (beiwoerterIm(x.satz))
        out.push({
          operator,
          index,
          form: x.roh,
          position: x.start,
          art: muster.beiwoerter.length ? 'wendung' : 'verb',
          kopf: i,
          gewicht: 1 + muster.beiwoerter.length + bonus
        })
      return
    }
    // Getrennt: Grundverb … Partikel am Satz- bzw. Teilsatzende
    const g = muster.grund
    if (!g || !(g.formen.has(x.w) || (x.anfang && g.nurAnfang.has(x.w)))) return
    for (let j = i + 1; j < woerter.length && woerter[j].satz === x.satz; j++) {
      const y = woerter[j]
      if (y.w === g.partikel && y.ende && beiwoerterIm(x.satz)) {
        out.push({
          operator,
          index,
          form: j === i + 1 ? `${x.roh} ${y.roh}` : `${x.roh} … ${y.roh}`,
          position: x.start,
          art: 'getrennt',
          kopf: i,
          gewicht: 2 + muster.beiwoerter.length + bonus
        })
        return
      }
    }
  })
}

function fremdSuchen(woerter: Wort[], variante: string, sprache: ErkennungsSprache, index: number, operator: string, out: Kandidat[]): void {
  const key = `${sprache}|${variante}`
  let muster = fremdMusterCache.get(key)
  if (!muster) {
    muster = fremdMuster(variante, sprache)
    fremdMusterCache.set(key, muster)
  }
  const norm = (w: string): string => (sprache === 'en' ? englisch(w) : w)
  const bonus = variante.toLowerCase() === operator.toLowerCase() ? 0.5 : 0
  const gleich = (textWort: string, listenWort: string, erstes: boolean): boolean =>
    sprache === 'en' ? norm(textWort) === listenWort : erstes ? romanischGleich(textWort, listenWort, sprache) : ohneAkzent(textWort) === ohneAkzent(listenWort)
  for (const m of muster) {
    if (!m.abschnitte.length) continue
    woerter.forEach((x, i) => {
      if (!x.anfang) return
      // Der erste Abschnitt steht zusammenhängend am Anfang
      const erster = m.abschnitte[0]
      for (let k = 0; k < erster.length; k++) {
        const y = woerter[i + k]
        if (!y || y.satz !== x.satz || !gleich(y.w, erster[k], k === 0)) return
      }
      // Die übrigen Abschnitte folgen im selben Satz, jeder zusammenhängend
      let pos = i + erster.length
      let letztes = woerter[pos - 1]
      for (const abschnitt of m.abschnitte.slice(1)) {
        let gefunden = -1
        for (let j = pos; j < woerter.length && woerter[j].satz === x.satz; j++)
          if (abschnitt.every((w, k) => woerter[j + k] && woerter[j + k].satz === x.satz && gleich(woerter[j + k].w, w, false))) {
            gefunden = j
            break
          }
        if (gefunden < 0) return
        pos = gefunden + abschnitt.length
        letztes = woerter[pos - 1]
      }
      const woerterZahl = m.abschnitte.reduce((s, a) => s + a.length, 0)
      const form =
        letztes === woerter[i + woerterZahl - 1] && m.abschnitte.length === 1
          ? woerter
              .slice(i, pos)
              .map((w) => w.roh)
              .join(' ')
          : `${x.roh} … ${letztes.roh}`
      out.push({
        operator,
        index,
        form,
        position: x.start,
        art: woerterZahl > 1 ? 'wendung' : 'verb',
        kopf: i,
        gewicht: woerterZahl + bonus
      })
    })
  }
}

export interface ErkennungsOptionen {
  /** Sprache der Liste; ohne Angabe Deutsch */
  sprache?: ErkennungsSprache
  /** Substantivierungen als Rückfall zulassen (Standard: ja) */
  nomen?: boolean
}

/**
 * Alle Operatoren der Liste, die in der Aufgabenstellung stehen – in der Reihenfolge des
 * Textes, jeder Eintrag höchstens einmal. Ein Wort gehört zu genau einem Operator: Ist „Ordne"
 * der Kopf von „Ordne … ein", zählt es nicht zusätzlich als „ordnen".
 */
export function findeOperatoren(text: string, liste: OperatorAngabe[], opt: ErkennungsOptionen = {}): OperatorTreffer[] {
  const sprache = opt.sprache ?? 'de'
  const woerter = zerlege(text)
  if (!woerter.length) return []
  const kandidaten: Kandidat[] = []
  liste.forEach((eintrag, index) => {
    const operator = nameVon(eintrag)
    const varianten = [...new Set([operator, ...formenVon(eintrag)].flatMap(variantenVon))]
    for (const v of varianten) {
      if (istDeutscheVariante(v, sprache)) deutschSuchen(woerter, v, index, operator, kandidaten)
      else fremdSuchen(woerter, v, sprache, index, operator, kandidaten)
    }
  })
  // Je Kopfwort nur der genaueste Treffer (getrennt/Wendung vor bloßem Verb)
  const bester = new Map<number, number>()
  for (const k of kandidaten) bester.set(k.kopf, Math.max(bester.get(k.kopf) ?? 0, k.gewicht))
  const out: OperatorTreffer[] = []
  const gesehen = new Set<number>()
  for (const k of kandidaten.filter((k) => k.gewicht === bester.get(k.kopf)).sort((a, b) => a.position - b.position)) {
    if (gesehen.has(k.index)) continue
    gesehen.add(k.index)
    out.push({
      operator: k.operator,
      index: k.index,
      form: k.form,
      position: k.position,
      art: k.art
    })
  }
  if (out.length || opt.nomen === false || sprache !== 'de') return out
  // Rückfall: Substantivierung („Verfasse eine Stellungnahme"), nur wenn kein Verb der Liste dasteht
  for (const x of woerter) {
    const ziele = NOMEN[x.w]
    if (!ziele) continue
    const index = liste.findIndex((e) => [nameVon(e), ...formenVon(e)].flatMap(variantenVon).some((v) => ziele.includes(v.toLocaleLowerCase('de'))))
    if (index >= 0 && !gesehen.has(index)) {
      gesehen.add(index)
      out.push({
        operator: nameVon(liste[index]),
        index,
        form: x.roh,
        position: x.start,
        art: 'nomen'
      })
    }
  }
  return out
}

/** Der erste Operator der Aufgabenstellung – oder null */
export function ersterOperator(text: string, liste: OperatorAngabe[], opt: ErkennungsOptionen = {}): OperatorTreffer | null {
  return findeOperatoren(text, liste, opt)[0] ?? null
}

/** Steht dieser eine Operator in der Aufgabenstellung? */
export function enthaeltOperatorForm(text: string, operator: OperatorAngabe, opt: ErkennungsOptionen = {}): boolean {
  return findeOperatoren(text, [operator], { nomen: false, ...opt }).length > 0
}

/* ---------- Bestand aller Listen: bekannte Operatoren und Verwandtschaften ---------- */

let deutscheWoerterCache: Set<string> | null = null

/** Alle Formen aus deutschen Listen – damit deutsche Entsprechungen in Fremdsprachenlisten deutsch erkannt werden */
function deutscheOperatorwoerter(): Set<string> {
  if (deutscheWoerterCache) return deutscheWoerterCache
  const s = new Set<string>()
  for (const land of Object.values(BESTAND))
    for (const l of land.listen)
      if (l.sprache === 'de')
        for (const o of l.operatoren) for (const v of [o.operator, ...(o.formen ?? [])].flatMap(variantenVon)) s.add(v.toLocaleLowerCase('de'))
  for (const v of ['stellung nehmen', 'in beziehung setzen', 'sich auseinandersetzen', 'herausarbeiten', 'darstellen', 'einordnen', 'erläutern']) s.add(v)
  deutscheWoerterCache = s
  return s
}

const bekanntCache = new Map<string, string[]>()

/** Jeder Operator, der in irgendeiner Liste des Bestands in dieser Sprache steht */
export function alleBekanntenOperatoren(sprache: ErkennungsSprache = 'de'): string[] {
  const vorhanden = bekanntCache.get(sprache)
  if (vorhanden) return vorhanden
  const s = new Set<string>()
  for (const land of Object.values(BESTAND))
    for (const l of land.listen)
      if (l.sprache === sprache)
        for (const o of l.operatoren)
          for (const v of [o.operator, ...(o.formen ?? [])].flatMap(variantenVon)) {
            const k = v.trim()
            if (k && (sprache !== 'de' || deutscheOperatorwoerter().has(k.toLocaleLowerCase('de')))) s.add(sprache === 'de' ? k.toLocaleLowerCase('de') : k)
          }
  const liste = [...s].sort((a, b) => a.localeCompare(b, 'de'))
  bekanntCache.set(sprache, liste)
  return liste
}

/**
 * Operatoren, die in den Listen füreinander stehen – aus den Listen selbst (Bayern fasst
 * „aufzeigen, beschreiben, wiedergeben, zusammenfassen" in eine Zeile, Hessen „bewerten
 * (Stellung nehmen)") und aus diesen üblichen Entsprechungen.
 */
const VERWANDT: string[][] = [
  ['erläutern', 'erklären', 'verdeutlichen'],
  ['darstellen', 'darlegen', 'aufzeigen', 'beschreiben', 'schildern'],
  ['erörtern', 'diskutieren', 'sich auseinandersetzen'],
  ['beurteilen', 'bewerten', 'Stellung nehmen', 'einschätzen'],
  ['analysieren', 'untersuchen', 'erschließen'],
  ['herausarbeiten', 'erschließen', 'ermitteln', 'analysieren'],
  ['einordnen', 'zuordnen', 'in Beziehung setzen'],
  ['nennen', 'aufzählen', 'angeben', 'benennen', 'bezeichnen'],
  ['zusammenfassen', 'wiedergeben'],
  ['überprüfen', 'prüfen'],
  ['vergleichen', 'gegenüberstellen'],
  ['begründen', 'nachweisen', 'belegen'],
  ['skizzieren', 'zeichnen'],
  ['bestimmen', 'ermitteln', 'berechnen'],
  ['interpretieren', 'deuten'],
  ['entwickeln', 'entwerfen', 'gestalten'],
  ['charakterisieren', 'kennzeichnen'],
  ['explain', 'illustrate', 'account for'],
  ['analyse', 'examine'],
  ['assess', 'evaluate', 'judge'],
  ['discuss', 'comment', 'comment on'],
  ['summarise', 'sum up', 'outline'],
  ['name', 'state', 'list', 'enumerate'],
  ['describe', 'present', 'give an account of'],
  ['décrire', 'présenter'],
  ['expliquer', 'justifier'],
  ['analyser', 'examiner', 'étudier'],
  ['juger', 'évaluer', 'commenter'],
  ['describir', 'presentar'],
  ['analizar', 'examinar'],
  ['explicar', 'justificar'],
  ['evaluar', 'juzgar', 'comentar']
]

const schluessel = (w: string): string => ohneAkzent(englisch(w.toLocaleLowerCase('de').trim()))

let verwandtCache: Map<string, Set<string>> | null = null

function verwandtschaften(): Map<string, Set<string>> {
  if (verwandtCache) return verwandtCache
  const m = new Map<string, Set<string>>()
  const gruppe = (namen: string[]): void => {
    const ks = namen.map(schluessel).filter(Boolean)
    for (const k of ks) {
      const s = m.get(k) ?? new Set<string>()
      for (const x of ks) if (x !== k) s.add(x)
      m.set(k, s)
    }
  }
  for (const g of VERWANDT) gruppe(g)
  for (const land of Object.values(BESTAND))
    for (const l of land.listen) for (const o of l.operatoren) if (o.formen?.length) gruppe([o.operator, ...o.formen].flatMap(variantenVon))
  verwandtCache = m
  return m
}

/** Einfache Editierdistanz für den letzten Rückfall */
function abstand(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/**
 * Der nächstliegende Operator der Liste zu einem Operator, der dort nicht steht: zuerst eine
 * Entsprechung aus den Listen („erklären" → „erläutern"), sonst ein ähnlich geschriebener
 * („prüfen" → „überprüfen"). Null, wenn nichts naheliegt.
 */
export function naechsterOperator(operator: string, liste: OperatorAngabe[]): string | null {
  const k = schluessel(operator)
  const nah = verwandtschaften().get(k) ?? new Set<string>()
  for (const e of liste) if ([nameVon(e), ...formenVon(e)].flatMap(variantenVon).some((v) => nah.has(schluessel(v)))) return nameVon(e)
  let best: { name: string; d: number } | null = null
  for (const e of liste) {
    const n = nameVon(e)
    const d = abstand(k, schluessel(n))
    if (d <= Math.max(2, Math.floor(k.length * 0.3)) && (!best || d < best.d)) best = { name: n, d }
  }
  return best?.name ?? null
}

export type AnweisungsBefund =
  | { art: 'operator'; treffer: OperatorTreffer[] }
  | { art: 'fremd'; form: string; operator: string; vorschlag: string | null }
  | { art: 'keiner' }

/**
 * Prüft eine Aufgabenstellung gegen DIE Liste (Land, Fach, Stufe, Schulform):
 *   „operator" – mindestens ein Operator der Liste steht da
 *   „fremd"    – ein Operator anderer Listen steht da, aber keiner dieser Liste („kein Operator der Landesliste")
 *   „keiner"   – gar kein erkennbarer Operator
 */
export function pruefeAnweisung(text: string, liste: OperatorAngabe[], opt: ErkennungsOptionen & { zusaetzlich?: string[] } = {}): AnweisungsBefund {
  const treffer = findeOperatoren(text, liste, opt)
  if (treffer.length) return { art: 'operator', treffer }
  const sprache = opt.sprache ?? 'de'
  const anderswo = ersterOperator(text, [...alleBekanntenOperatoren(sprache), ...(opt.zusaetzlich ?? [])], { ...opt, nomen: false })
  if (anderswo)
    return {
      art: 'fremd',
      form: anderswo.form,
      operator: anderswo.operator,
      vorschlag: naechsterOperator(anderswo.operator, liste)
    }
  return { art: 'keiner' }
}

/** Steht dieses Wort als Operator in einer deutschen Liste? (Deutsche Entsprechungen in Fremdsprachenlisten erkennen) */
export const istDeutschesOperatorwort = (w: string): boolean => deutscheOperatorwoerter().has(w.trim().toLocaleLowerCase('de'))
