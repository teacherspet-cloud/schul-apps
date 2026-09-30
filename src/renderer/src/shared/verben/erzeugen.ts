/**
 * Erzeugt Aufgaben zu unregelmäßigen Verben (30.09.2026) – EIN Erzeuger für Grammatiktest,
 * Arbeitsblatt und Vokabeltest.
 *
 * Das Ergebnis ist eine neutrale Aufgabe (`VerbTask`): Tabelle, Ankreuzen, Zuordnen oder Lückentext.
 * Grammatiktest und Arbeitsblatt setzen sie mit `alsWsBlock` in ihre Bausteine um, der Vokabeltest
 * mit einem eigenen Übersetzer in seine Blöcke (vokabeltest/generation/verbAufgabe.ts).
 *
 * Tabellen, Ankreuzen, Fehler finden und Zuordnen entstehen OHNE KI: Die Lösungen sind die Formen
 * der Liste – genau so, wie sie im Schulbuch stehen. Varianten A/B nehmen andere Verben, wenn die
 * Auswahl groß genug ist, sonst dieselben in anderer Reihenfolge mit anderen Lücken.
 */
import { grundformVon, istLeerform, varianten, VERB_SPALTEN, type VerbEintrag, type VerbSprache } from '@shared/verben'
import type { Anrede } from '../anrede'
import { createRng, newId, shuffle, type Rng } from '../../modules/vokabeltest/model/random'
import { emptyAnswer } from '../../modules/arbeitsblatt/model/factory'
import type { TaskBlock, TaskPart, WsBlock } from '../../modules/arbeitsblatt/model/types'
import { anweisung, formatVon, type VerbAufgabe, type VerbFormatId } from './formate'
import { fehlformen, musterVon } from './muster'

export type VerbTeil =
  /** `zellen`: '' = Lücke; `loesung`: die Lösung an den Lücken, sonst '' */
  | { art: 'tabelle'; kopf: string[]; zeilen: { verbId: string; zellen: string[]; loesung: string[] }[] }
  | { art: 'auswahl'; items: { verbId: string; frage: string; optionen: string[]; richtig: number }[] }
  | { art: 'zuordnung'; links: { verbId: string; text: string }[]; rechts: string[]; paare: number[] }
  /** Text mit [[Lösung]] je Lücke – wie im Arbeitsblatt */
  | { art: 'lueckentext'; text: string; luecken: number }

export interface VerbTask {
  format: VerbFormatId
  anweisung: string
  /** Je Form ein Punkt */
  punkte: number
  /** Stolperstelle für das Fehlerprofil */
  fehlerart: string
  teil: VerbTeil
}

export const FEHLERART: Record<VerbFormatId, string> = {
  tabelle: 'Formen der Liste nicht sicher abrufbar',
  tabelleGemischt: 'Formen ohne feste Reihenfolge nicht abrufbar',
  auswahl: 'Übergeneralisierung (*goed) oder Analogie zu anderem Muster (*brang)',
  fehler: 'typische Fehlform nicht erkannt',
  muster: 'Bildungsmuster nicht erkannt',
  ausreisser: 'Bildungsmuster nicht erkannt',
  lueckensatz: 'Form im Satzzusammenhang nicht abrufbar',
  zeitform: 'Zeitform im Text nicht umgesetzt',
  uebersetzen: 'Verbform beim Übersetzen verfehlt'
}

export const TOPIC_ID = 'Unregelmäßige Verben'

const erste = (zelle: string | undefined): string => (zelle ? (varianten(zelle)[0] ?? zelle) : '')
const spaltenVon = (sprache: VerbSprache) => VERB_SPALTEN[sprache]
const labelVon = (sprache: VerbSprache, id: string): string => spaltenVon(sprache).find((s) => s.id === id)?.label ?? id
const istDeutsch = (sprache: VerbSprache, id: string): boolean => Boolean(spaltenVon(sprache).find((s) => s.id === id)?.deutsch)

/** Spalten der Aufgabe in der Reihenfolge des Schulbuchs */
export function tabellenSpalten(a: Pick<VerbAufgabe, 'sprache' | 'spalten' | 'vorgabe'>): string[] {
  const gewollt = new Set([...a.spalten, a.vorgabe])
  const out = spaltenVon(a.sprache)
    .map((s) => s.id)
    .filter((id) => gewollt.has(id))
  return out.length ? out : spaltenVon(a.sprache).map((s) => s.id)
}

/** Formen, die gefragt werden können: in der Liste vorhanden und keine „—"-Zelle */
const abfragbar = (e: VerbEintrag, id: string): boolean => !istLeerform(e.formen[id])

/** Die Verben einer Fassung: bei genug Auswahl getrennte Hälften für A und B */
export function verbenDerFassung(a: VerbAufgabe, fassung: number, anzahlFassungen: number): VerbEintrag[] {
  const pool = shuffle(a.verben, createRng(a.seed))
  if (anzahlFassungen < 2) return pool
  const bedarf = Math.max(...a.formate.map((f) => a.anzahl[f] ?? formatVon(f).standardAnzahl), 1)
  if (pool.length >= bedarf * anzahlFassungen) return pool.filter((_, i) => i % anzahlFassungen === fassung)
  // Zu wenige Verben für getrennte Fassungen: dieselben, andere Reihenfolge (und andere Lücken)
  return shuffle(a.verben, createRng(a.seed + 7919 * (fassung + 1)))
}

/** Verben für das n-te Format – reihum, damit die Formate möglichst verschiedene Verben nehmen */
function reihum(pool: VerbEintrag[], anzahl: number, versatz: number): VerbEintrag[] {
  if (!pool.length) return []
  const n = Math.min(anzahl, pool.length)
  return Array.from({ length: n }, (_, i) => pool[(versatz + i) % pool.length])
}

// ---------- Die Formate ohne KI ----------

function tabelle(a: VerbAufgabe, verben: VerbEintrag[], rng: Rng, gemischt: boolean): VerbTeil {
  const spalten = tabellenSpalten(a)
  const zeilen = verben.flatMap((e) => {
    const moeglich = spalten.filter((id) => abfragbar(e, id))
    if (moeglich.length < 2) return []
    // Gemischt: eine zufällige Form ist vorgegeben – auch die deutsche Bedeutung
    const vorgegeben = gemischt ? moeglich[Math.floor(rng() * moeglich.length)] : a.vorgabe
    if (!e.formen[vorgegeben]) return []
    const zellen: string[] = []
    const loesung: string[] = []
    for (const id of spalten) {
      const wert = e.formen[id] ?? ''
      if (id === vorgegeben || istLeerform(wert)) {
        zellen.push(istLeerform(wert) ? '—' : wert)
        loesung.push('')
      } else {
        zellen.push('')
        loesung.push(wert)
      }
    }
    return [{ verbId: e.id, zellen, loesung }]
  })
  return { art: 'tabelle', kopf: spalten.map((id) => labelVon(a.sprache, id)), zeilen }
}

/** Zielspalten für Ankreuzen und Fehler finden: gefragte Formen ohne Grundform und Deutsch */
function formSpalten(a: VerbAufgabe): string[] {
  return tabellenSpalten(a).filter((id) => !istDeutsch(a.sprache, id) && !spaltenVon(a.sprache).find((s) => s.id === id)?.grundform)
}

function auswahl(a: VerbAufgabe, verben: VerbEintrag[], rng: Rng): VerbTeil {
  // Recherche: in Lernjahr 1–2 höchstens drei Möglichkeiten, danach vier
  const ablenker = a.lernjahr <= 2 ? 2 : 3
  const items = verben.flatMap((e) => {
    const kandidaten = shuffle(formSpalten(a), rng).filter((id) => abfragbar(e, id) && fehlformen(e, id, a.sprache).length >= ablenker)
    const id = kandidaten[0]
    if (!id) return []
    const richtig = erste(e.formen[id])
    const falsch = fehlformen(e, id, a.sprache).slice(0, ablenker + 1)
    const optionen = shuffle([richtig, ...shuffle(falsch, rng).slice(0, ablenker)], rng)
    return [{ verbId: e.id, frage: `${grundformVon(e, a.sprache)} – ${labelVon(a.sprache, id)}`, optionen, richtig: optionen.indexOf(richtig) }]
  })
  return { art: 'auswahl', items }
}

const KORREKTUR: Record<VerbSprache, string> = { en: 'correction', fr: 'correction', es: 'corrección', it: 'correzione', ru: 'Berichtigung', la: 'Berichtigung' }

function fehler(a: VerbAufgabe, verben: VerbEintrag[], rng: Rng): VerbTeil {
  const spalten = tabellenSpalten(a).filter((id) => !istDeutsch(a.sprache, id))
  const ziel = formSpalten(a)
  const kopf = [...spalten.map((id) => labelVon(a.sprache, id)), a.anweisungDeutsch ? 'Berichtigung' : KORREKTUR[a.sprache]]
  const zeilen = verben.flatMap((e) => {
    const id = shuffle(ziel, rng).find((s) => abfragbar(e, s) && fehlformen(e, s, a.sprache).length > 0)
    if (!id) return []
    const falsch = fehlformen(e, id, a.sprache)[Math.floor(rng() * Math.min(2, fehlformen(e, id, a.sprache).length))]
    const zellen = spalten.map((s) => (s === id ? falsch : istLeerform(e.formen[s]) ? '—' : erste(e.formen[s])))
    return [{ verbId: e.id, zellen: [...zellen, ''], loesung: [...spalten.map(() => ''), `${falsch} → ${e.formen[id]}`] }]
  })
  return { art: 'tabelle', kopf, zeilen }
}

/** Wie ein Verb beim Zuordnen dasteht: die Formen, an denen man das Muster sieht */
export function musterAnzeige(e: VerbEintrag, sprache: VerbSprache): string {
  const f = (id: string): string => erste(e.formen[id])
  switch (sprache) {
    case 'en':
      return [f('inf'), f('past'), f('pp')].filter(Boolean).join(' – ')
    case 'fr':
      return [f('inf'), f('pc')].filter(Boolean).join(' – ')
    case 'es':
      return [f('inf'), f('yo')].filter(Boolean).join(' – ')
    case 'it':
      return [f('inf'), f('pp')].filter(Boolean).join(' – ')
    case 'ru':
      return [f('inf'), f('ya'), f('ty')].filter(Boolean).join(' – ')
    case 'la':
      return [f('praes'), f('inf'), f('perf'), f('ppp')].filter((x) => x && x !== '—').join(', ')
  }
}

function muster(a: VerbAufgabe, verben: VerbEintrag[], pool: VerbEintrag[], rng: Rng): VerbTeil {
  const mitMuster = verben.map((e) => ({ e, m: musterVon(e, a.sprache) })).filter((x) => x.m)
  const benutzt = [...new Map(mitMuster.map((x) => [x.m!.id, x.m!])).values()]
  // Ein Muster mehr als gebraucht, damit das letzte nicht durch Ausschluss gefunden wird
  const extra = pool
    .map((e) => musterVon(e, a.sprache))
    .find((m) => m && !benutzt.some((b) => b.id === m.id))
  const rechts = shuffle([...benutzt, ...(extra ? [extra] : [])], rng)
  return {
    art: 'zuordnung',
    links: mitMuster.map((x) => ({ verbId: x.e.id, text: musterAnzeige(x.e, a.sprache) })),
    rechts: rechts.map((m) => m.label),
    paare: mitMuster.map((x) => rechts.findIndex((m) => m.id === x.m!.id))
  }
}

function ausreisser(a: VerbAufgabe, anzahl: number, pool: VerbEintrag[], rng: Rng): VerbTeil {
  const gruppen = new Map<string, VerbEintrag[]>()
  for (const e of pool) {
    const m = musterVon(e, a.sprache)
    if (m) gruppen.set(m.id, [...(gruppen.get(m.id) ?? []), e])
  }
  const gross = [...gruppen.entries()].filter(([, v]) => v.length >= 3)
  const items: { verbId: string; frage: string; optionen: string[]; richtig: number }[] = []
  if (!gross.length || gruppen.size < 2) return { art: 'auswahl', items }
  const genommen = new Set<string>()
  for (let i = 0; i < anzahl * 3 && items.length < anzahl; i++) {
    const [id, gruppe] = gross[Math.floor(rng() * gross.length)]
    const drei = shuffle(gruppe, rng).slice(0, 3)
    const andere = shuffle(
      pool.filter((e) => musterVon(e, a.sprache)?.id !== id),
      rng
    )[0]
    if (!andere) break
    const schluessel = [...drei.map((e) => e.id), andere.id].sort().join('|')
    if (genommen.has(schluessel)) continue
    genommen.add(schluessel)
    const optionen = shuffle([...drei, andere], rng).map((e) => musterAnzeige(e, a.sprache))
    items.push({ verbId: andere.id, frage: '', optionen, richtig: optionen.indexOf(musterAnzeige(andere, a.sprache)) })
  }
  return { art: 'auswahl', items }
}

/** Punkte einer Aufgabe: je Lücke bzw. je Item ein Punkt */
export function punkteVon(teil: VerbTeil): number {
  switch (teil.art) {
    case 'tabelle':
      return teil.zeilen.reduce((n, z) => n + z.zellen.filter((c) => !c).length, 0)
    case 'auswahl':
      return teil.items.length
    case 'zuordnung':
      return teil.links.length
    case 'lueckentext':
      return teil.luecken
  }
}

const hatInhalt = (teil: VerbTeil): boolean => punkteVon(teil) > 0

/**
 * Aufgaben ohne KI für eine Fassung. `nurFormate` schränkt ein (der Vokabeltest nimmt nur diese).
 * Formate, für die die Auswahl nicht reicht (z. B. „Was passt nicht?" ohne drei Verben eines
 * Musters), fallen still weg – die Oberfläche sagt es vorher (`formatHinweis`).
 */
export function erzeugeOhneKi(a: VerbAufgabe, anrede: Anrede, fassung = 0, anzahlFassungen = 1): VerbTask[] {
  const pool = verbenDerFassung(a, fassung, anzahlFassungen)
  const rng = createRng(a.seed + 104729 * (fassung + 1))
  const out: VerbTask[] = []
  a.formate.forEach((format, i) => {
    const f = formatVon(format)
    if (f.ki) return
    const anzahl = a.anzahl[format] ?? f.standardAnzahl
    const verben = reihum(pool, anzahl, i * anzahl)
    const teil =
      format === 'tabelle'
        ? tabelle(a, verben, rng, false)
        : format === 'tabelleGemischt'
          ? tabelle(a, verben, rng, true)
          : format === 'auswahl'
            ? auswahl(a, verben, rng)
            : format === 'fehler'
              ? fehler(a, verben, rng)
              : format === 'muster'
                ? muster(a, verben, pool, rng)
                : ausreisser(a, anzahl, pool, rng)
    if (hatInhalt(teil)) out.push({ format, anweisung: anweisung(format, a, anrede), punkte: punkteVon(teil), fehlerart: FEHLERART[format], teil })
  })
  return out
}

/** Warum ein Format mit dieser Auswahl nichts liefern würde – für die Oberfläche */
export function formatHinweis(a: VerbAufgabe, format: VerbFormatId): string | undefined {
  if (!a.verben.length) return undefined
  if (format === 'ausreisser' || format === 'muster') {
    const gruppen = new Map<string, number>()
    for (const e of a.verben) {
      const m = musterVon(e, a.sprache)
      if (m) gruppen.set(m.id, (gruppen.get(m.id) ?? 0) + 1)
    }
    if (gruppen.size < 2) return 'Die gewählten Verben folgen nur einem Muster.'
    if (format === 'ausreisser' && ![...gruppen.values()].some((n) => n >= 3)) return 'Dafür braucht es drei Verben desselben Musters.'
  }
  if (format === 'tabelle' && !a.verben.some((e) => e.formen[a.vorgabe])) return 'Die vorgegebene Spalte ist bei keinem Verb ausgefüllt.'
  return undefined
}

// ---------- Umsetzen in Bausteine des Arbeitsblatts ----------

/** Eine Verb-Aufgabe als Aufgabenbaustein (Arbeitsblatt, Grammatiktest) */
export function alsWsBlock(t: VerbTask): TaskBlock {
  const block: TaskBlock = {
    id: newId(),
    type: 'task',
    instruction: t.anweisung,
    operator: '',
    afbReason: '',
    socialForm: 'EA',
    answer: emptyAnswer('none'),
    parts: [],
    solution: '',
    points: t.punkte,
    minutes: Math.max(2, Math.round(t.punkte / 3)),
    grammar: { topicId: TOPIC_ID, error: t.fehlerart }
  }
  const teil = t.teil
  switch (teil.art) {
    case 'tabelle':
      block.answer = { ...emptyAnswer('tableFill'), headers: teil.kopf, rows: teil.zeilen.map((z) => z.zellen), solutionRows: teil.zeilen.map((z) => z.loesung) }
      break
    case 'zuordnung':
      block.answer = { ...emptyAnswer('matching'), left: teil.links.map((l) => l.text), right: teil.rechts, pairs: teil.paare }
      break
    case 'lueckentext':
      block.answer = { ...emptyAnswer('gapText'), gapText: teil.text }
      break
    case 'auswahl':
      block.parts = teil.items.map(
        (it): TaskPart => ({
          id: newId(),
          instruction: it.frage,
          answer: { ...emptyAnswer('multipleChoice'), options: it.optionen, correct: [it.richtig] },
          solution: it.optionen[it.richtig] ?? ''
        })
      )
      break
  }
  return block
}

/** Bewertungshinweis für den Lösungsteil (nur Lehrkraft) */
export function bewertungsHinweis(a: Pick<VerbAufgabe, 'rechtschreibung' | 'sprache'>): string {
  const romanisch = a.sprache === 'fr' || a.sprache === 'es' || a.sprache === 'it'
  return [
    '- Je Form 1 Punkt.',
    a.rechtschreibung === 'halb'
      ? '- Erkennbare Form mit Schreibfehler (*writen, *choosen): ½ Punkt; falsch gebildete Form (*goed, *have went, *hacido): 0 Punkte.'
      : '- Nur die richtig geschriebene Form zählt; Schreibfehler und falsch gebildete Formen: 0 Punkte.',
    '- Schrägstrich in der Lösung (burnt/burned): jede der genannten Formen ist richtig.',
    romanisch ? '- Zusammengesetzte Zeiten: Form und Hilfsverb bzw. Angleichung lassen sich je ½ Punkt werten.' : '',
    a.sprache === 'la' ? '- Vokallängen werden nicht bewertet.' : '',
    a.sprache === 'ru' ? '- Die Betonung wird nicht bewertet.' : '',
    '- Ein Fehler, der sich im Text wiederholt, zählt einmal.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Der Hinweis als Baustein nur im Lösungsteil */
export function bewertungsBlock(a: Pick<VerbAufgabe, 'rechtschreibung' | 'sprache'>): WsBlock {
  return { id: newId(), type: 'infoBox', variant: 'wissen', title: 'Bewertung (unregelmäßige Verben)', body: bewertungsHinweis(a), nurLoesung: true }
}
