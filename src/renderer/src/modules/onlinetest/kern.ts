/**
 * Onlinetest – der gemeinsame Kern für Server und Oberfläche (02.10.2026).
 *
 * Wunsch der Lehrkraft: Vokabeltests „online" am iPad der Lernenden; einfache Richtig/Falsch-
 * Antworten werden direkt ausgewertet, komplexere (Sätze mit vorgegebenem Wort, Odd one out mit
 * Begründung …) prüft die KI auf Korrektheit/Plausibilität. Halbe Punkte sind nicht vorgesehen.
 *
 * Aus einer Variante des Vokabeltests entstehen hier:
 *  - die SCHÜLERFASSUNG (`OnlineAufgabe[]`): alles, was auf dem Blatt steht – OHNE Lösungen.
 *    Der Server schickt nur sie an die Geräte der Lernenden.
 *  - die EINHEITEN: je Teilaufgabe eine Bewertungseinheit mit ganzen Punkten – ganz oder gar nicht.
 *    Eine Einheit kann aus mehreren Feldern bestehen (Richtig/Falsch + Korrektur, Odd one out +
 *    Begründung); sie zählt nur, wenn alle Felder stimmen.
 *  - die LÖSUNGEN je Feld (bleiben auf dem Server): genau (mit Normalisierung), Auswahl, KI
 *    (Erwartung für die Plausibilitätsprüfung) oder Lehrkraft (freies Schreiben).
 */
import { anweisungFuer } from '../vokabeltest/model/blocks'
import { mitOptionalem, teileVon } from '@shared/luecken'
import type { Block, Variant } from '../vokabeltest/model/types'

export type FeldArt = 'text' | 'langtext' | 'auswahl' | 'wahr'

export interface Feld {
  id: string
  art: FeldArt
  /** Auswahl: Schlüssel und angezeigter Text */
  optionen?: { wert: string; text: string }[]
  /** Kurze Beschriftung vor dem Feld (z. B. „Korrektur", „Begründung", Formangabe) */
  beschriftung?: string
  /** Anfangsbuchstabe als Hilfe (steht auch auf dem Papierblatt) */
  anfang?: string
  /** Länge des Worts (Kreuzworträtsel) */
  laenge?: number
}

/** Eine Teilaufgabe, wie sie die Lernenden sehen */
export interface OnlineEintrag {
  einheit: string
  /** Text davor/danach (Lücke), Aufgabenstellung, Aussage … */
  vor?: string
  nach?: string
  text?: string
  /** Mehrere Sätze mit derselben Lücke; `mitte` = zweite Lücke dazwischen (zweiteilige Wendung) */
  saetze?: { vor: string; nach: string; mitte?: string }[]
  hinweis?: string
  bild?: string
  /** Wörter (Odd one out, Durcheinander) */
  woerter?: string[]
  felder: Feld[]
}

export interface OnlineAufgabe {
  id: string
  /** `material`: Text/Bild/Tabelle des Blatts zum Lesen (Grammatiktest, Lernzielkontrolle, 05.10.2026) */
  art: Block['kind'] | 'material'
  /** Material: gedrucktes HTML (ohne Lösungen) – gezeigt in einem abgeschotteten Rahmen mit `OnlineFassung.stil` */
  html?: string
  titel: string
  anweisung: string
  hilfe?: string
  /** Wortkasten (alphabetisch, wie auf dem Blatt) */
  wortkasten?: string[]
  /** Zuordnung: rechte Spalte; Kategorien; Mindmap: Thema und Äste; Verbtabelle: Kopf */
  rechts?: { wert: string; text: string }[]
  kopf?: string[]
  thema?: string
  /** freier Text (Schreibauftrag) */
  vorlage?: string
  eintraege: OnlineEintrag[]
  punkte: number
}

export type Loesung =
  | { art: 'genau'; werte: string[]; artikelFrei?: boolean }
  | { art: 'auswahl'; wert: string }
  | { art: 'ki'; frage: string; erwartung: string }
  | { art: 'lehrkraft'; frage: string; erwartung?: string }
  /** Mindmap: jedes erwartete Wort (des Astes) zählt – sonst prüft die KI */
  | { art: 'menge'; werte: string[]; gruppe: string; frage: string }

export interface Einheit {
  id: string
  aufgabe: string
  felder: string[]
  punkte: number
}

export interface OnlineFassung {
  /** Stilregeln der Druckfassung für Material-Karten (Grammatiktest, Lernzielkontrolle) */
  stil?: string
  aufgaben: OnlineAufgabe[]
  einheiten: Einheit[]
  loesungen: Record<string, Loesung>
  punkte: number
}

export type Antworten = Record<string, string>

/** Ganze Punkte je Einheit: halbe Punkte gibt es im Onlinetest nicht (Entscheidung der Lehrkraft) */
export const ganzePunkte = (p: number): number => Math.max(1, Math.round(Number.isFinite(p) ? p : 1))

const ARTIKEL = /^(to|a|an|the|le|la|les|l'|l’|un|une|des|el|los|las|il|lo|gli|i|der|die|das|ein|eine|de|het)\s+/i

/** Normalisieren für den genauen Vergleich: Leerzeichen, typografische Zeichen, Schlusspunkt – NICHT die Groß-/Kleinschreibung */
export function normalisiere(s: string): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;,]+$/, '')
    .trim()
}

/** Lösungsalternativen aus der Lösung („sth / something", „colour; color", „but (also)") */
export const alternativen = (loesung: string): string[] =>
  String(loesung ?? '')
    .split(/\s+\/\s+|;|\|/)
    .flatMap((x) => mitOptionalem(x))
    .map((x) => normalisiere(x))
    .filter(Boolean)

/** Wer das Wort vor der Lücke wiederholt („to reward" bei „She wanted to ___"), liegt nicht falsch (02.10.2026) */
const mitVorwort = (vor: string, loesung: string): string[] => {
  const w = String(vor ?? '')
    .trim()
    .split(/\s+/)
    .pop()
    ?.replace(/[^\p{L}'’-]/gu, '')
  return w ? [loesung, `${w} ${loesung}`] : [loesung]
}

export type Vergleich = 'richtig' | 'falsch' | 'nurGross' | 'leer'

/** Genauer Vergleich mit Alternativen und (bei Bildern) freiem Artikel */
export function vergleiche(antwort: string, werte: string[], artikelFrei = false): Vergleich {
  const a = normalisiere(antwort)
  if (!a) return 'leer'
  const soll = werte.flatMap(alternativen)
  const ohne = (x: string): string => (artikelFrei ? x.replace(ARTIKEL, '') : x)
  if (soll.some((s) => ohne(s) === ohne(a))) return 'richtig'
  // Nur Groß-/Kleinschreibung falsch: als falsch werten, aber für die Lehrkraft markieren
  if (soll.some((s) => ohne(s).toLowerCase() === ohne(a).toLowerCase())) return 'nurGross'
  return 'falsch'
}

// ---------------------------------------------------------------- Schülerfassung

const feldId = (block: string, item: string, teil = 'a'): string => `${block}.${item}.${teil}`

const sortiertesWortkastenBild = (woerter: string[]): string[] =>
  [...new Set(woerter.filter(Boolean))].sort((a, b) => a.replace(ARTIKEL, '').localeCompare(b.replace(ARTIKEL, ''), undefined, { sensitivity: 'base' }))

/** Aus einer Variante die Onlinefassung bauen (Reihenfolge wie auf dem Papierblatt) */
export function onlineFassung(variante: Variant): OnlineFassung {
  const aufgaben: OnlineAufgabe[] = []
  const einheiten: Einheit[] = []
  const loesungen: Record<string, Loesung> = {}
  for (const b of variante.blocks) {
    const ppi = ganzePunkte(b.pointsPerItem)
    const a: OnlineAufgabe = {
      id: b.id,
      art: b.kind,
      titel: b.title,
      anweisung: anweisungFuer(b),
      ...(b.helpText ? { hilfe: b.helpText } : {}),
      eintraege: [],
      punkte: 0
    }
    const einheit = (id: string, felder: string[], punkte = ppi): void => {
      einheiten.push({ id, aufgabe: b.id, felder, punkte })
      a.punkte += punkte
    }
    const frage = (...teile: (string | undefined)[]): string => [anweisungFuer(b), ...teile].filter(Boolean).join(' – ')
    switch (b.kind) {
      case 'gap': {
        if (b.wordBank) a.wortkasten = sortiertesWortkastenBild([...b.items.map((i) => i.bankWord || i.answer), ...b.extraBankWords])
        for (const it of b.items) {
          const f = feldId(b.id, it.id)
          const teile = teileVon(it.answer)
          const zweiteilig = it.sentences.length === 1 && it.sentences[0].mitte !== undefined && teile.length === 2
          if (zweiteilig) {
            // Zweiteilige Wendung: zwei Felder, beide richtig = ein Punkt
            const f2 = feldId(b.id, it.id, 'b')
            const s0 = it.sentences[0]
            a.eintraege.push({
              einheit: f,
              saetze: [{ vor: s0.before, mitte: s0.mitte, nach: s0.after }],
              felder: [
                { id: f, art: 'text', beschriftung: '1. Lücke', ...(b.firstLetterHint || it.firstLetter ? { anfang: teile[0].charAt(0) } : {}) },
                { id: f2, art: 'text', beschriftung: '2. Lücke', ...(b.firstLetterHint || it.firstLetter ? { anfang: teile[1].charAt(0) } : {}) }
              ]
            })
            loesungen[f] = { art: 'genau', werte: mitVorwort(s0.before, teile[0]) }
            loesungen[f2] = { art: 'genau', werte: mitVorwort(s0.mitte ?? '', teile[1]) }
            einheit(f, [f, f2])
            continue
          }
          a.eintraege.push({
            einheit: f,
            saetze: it.sentences.map((s) => ({ vor: s.before, nach: s.after })),
            ...(it.hint ? { hinweis: it.hint } : {}),
            felder: [{ id: f, art: 'text', ...(b.firstLetterHint || it.firstLetter ? { anfang: it.answer.trim().charAt(0) } : {}) }]
          })
          loesungen[f] = { art: 'genau', werte: it.sentences.length === 1 ? mitVorwort(it.sentences[0].before, it.answer) : [it.answer] }
          einheit(f, [f])
        }
        break
      }
      case 'gapText': {
        if (b.wordBank)
          a.wortkasten = sortiertesWortkastenBild([...b.parts.flatMap((p) => (p.type === 'gap' ? [p.bankWord || p.answer] : [])), ...b.extraBankWords])
        // Der Text als Folge: Textstücke und Lücken in einem Eintrag je Lücke (vor = Text davor)
        let vor = ''
        let letzteEinheit: Einheit | null = null
        for (const p of b.parts) {
          if (p.type === 'text') {
            vor += p.text
            continue
          }
          const f = feldId(b.id, p.id)
          a.eintraege.push({
            einheit: p.folge && letzteEinheit ? letzteEinheit.id : f,
            vor,
            felder: [{ id: f, art: 'text', ...(b.firstLetterHint || p.firstLetter ? { anfang: p.answer.trim().charAt(0) } : {}) }]
          })
          loesungen[f] = { art: 'genau', werte: mitVorwort(vor, p.answer) }
          if (p.folge && letzteEinheit) {
            // Zweiter Teil einer zweiteiligen Wendung: gehört zur Einheit davor (ein Punkt für beide)
            letzteEinheit.felder.push(f)
          } else {
            einheit(f, [f])
            letzteEinheit = einheiten[einheiten.length - 1]
          }
          vor = ''
        }
        if (vor) a.vorlage = vor
        break
      }
      case 'match': {
        a.rechts = b.right.map((r, i) => ({ wert: r.id, text: `${String.fromCharCode(97 + i)}) ${r.text}` }))
        a.kopf = [b.leftLabel, b.rightLabel]
        for (const l of b.left) {
          const f = feldId(b.id, l.id)
          a.eintraege.push({ einheit: f, text: l.text, felder: [{ id: f, art: 'auswahl', optionen: a.rechts }] })
          loesungen[f] = { art: 'auswahl', wert: l.answerId }
          einheit(f, [f])
        }
        break
      }
      case 'choice':
        for (const it of b.items) {
          const f = feldId(b.id, it.id)
          a.eintraege.push({
            einheit: f,
            vor: it.before,
            nach: it.after,
            felder: [{ id: f, art: 'auswahl', optionen: it.options.map((o, i) => ({ wert: String(i), text: o })) }]
          })
          loesungen[f] = { art: 'auswahl', wert: String(it.correct) }
          einheit(f, [f])
        }
        break
      case 'open':
        for (const it of b.items) {
          const f = feldId(b.id, it.id)
          a.eintraege.push({ einheit: f, text: it.prompt, felder: [{ id: f, art: it.lines > 1 ? 'langtext' : 'text' }] })
          loesungen[f] = { art: 'ki', frage: frage(it.prompt), erwartung: it.modelAnswer }
          einheit(f, [f])
        }
        break
      case 'trueFalse':
        for (const it of b.items) {
          const w = feldId(b.id, it.id, 'w')
          const felder: Feld[] = [
            {
              id: w,
              art: 'wahr',
              optionen: [
                { wert: 'true', text: 'richtig' },
                { wert: 'false', text: 'falsch' }
              ]
            }
          ]
          loesungen[w] = { art: 'auswahl', wert: String(it.isTrue) }
          const ids = [w]
          if (b.askCorrection && !it.isTrue) {
            // Ob korrigiert werden muss, verrät das Feld nicht: Es steht bei JEDER Aussage
            const k = feldId(b.id, it.id, 'k')
            felder.push({ id: k, art: 'text', beschriftung: 'Korrektur (wenn falsch)' })
            loesungen[k] = { art: 'ki', frage: frage(`Aussage: ${it.statement}`), erwartung: it.correction }
            ids.push(k)
          } else if (b.askCorrection) {
            const k = feldId(b.id, it.id, 'k')
            felder.push({ id: k, art: 'text', beschriftung: 'Korrektur (wenn falsch)' })
            // Bei einer richtigen Aussage gehört keine Korrektur hinein – wird nicht bewertet
          }
          a.eintraege.push({ einheit: w, text: it.statement, felder })
          einheit(w, ids)
        }
        break
      case 'oddOneOut':
        for (const it of b.items) {
          const w = feldId(b.id, it.id, 'w')
          const felder: Feld[] = [{ id: w, art: 'auswahl', optionen: it.words.map((x) => ({ wert: x, text: x })) }]
          loesungen[w] = { art: 'auswahl', wert: it.answer }
          const ids = [w]
          if (b.askReason) {
            const r = feldId(b.id, it.id, 'r')
            felder.push({ id: r, art: 'text', beschriftung: 'Begründung' })
            loesungen[r] = { art: 'ki', frage: frage(`Wörter: ${it.words.join(', ')}; ausgewählt: ${it.answer}`), erwartung: it.reason }
            ids.push(r)
          }
          a.eintraege.push({ einheit: w, woerter: it.words, felder })
          einheit(w, ids)
        }
        break
      case 'categorize':
        a.rechts = b.categories.map((c) => ({ wert: c.id, text: c.name }))
        for (const w of b.words) {
          const f = feldId(b.id, w.id)
          a.eintraege.push({ einheit: f, text: w.text, felder: [{ id: f, art: 'auswahl', optionen: a.rechts }] })
          loesungen[f] = { art: 'auswahl', wert: w.categoryId }
          einheit(f, [f])
        }
        break
      case 'mindmap': {
        a.thema = b.topic
        const aeste = b.variante === 'offen' || !b.branches?.length ? [{ id: '_', label: '' }] : b.branches
        a.rechts = aeste.map((x) => ({ wert: x.id, text: x.label }))
        aeste.forEach((ast) => {
          const zuAst = b.items.filter((i) => (ast.id === '_' ? true : i.branchId === ast.id))
          zuAst.forEach((it, n) => {
            const f = feldId(b.id, it.id)
            a.eintraege.push({
              einheit: f,
              ...(ast.label ? { text: ast.label } : {}),
              felder: [{ id: f, art: 'text', beschriftung: ast.label ? `${ast.label} ${n + 1}` : `${n + 1}` }]
            })
            loesungen[f] = {
              art: 'menge',
              werte: zuAst.map((x) => x.answer),
              gruppe: `${b.id}.${ast.id}`,
              frage: frage(`Thema: ${b.topic}${ast.label ? `, Oberbegriff: ${ast.label}` : ''}`)
            }
            einheit(f, [f])
          })
        })
        break
      }
      case 'picture':
        if (b.wordBank) a.wortkasten = sortiertesWortkastenBild([...b.items.map((i) => i.answer), ...(b.extraBankWords ?? [])])
        for (const it of b.items) {
          const f = feldId(b.id, it.id)
          a.eintraege.push({ einheit: f, ...(it.image?.dataUrl ? { bild: it.image.dataUrl } : {}), felder: [{ id: f, art: 'text' }] })
          loesungen[f] = { art: 'genau', werte: [it.answer], artikelFrei: true }
          einheit(f, [f])
        }
        break
      case 'scramble':
        for (const it of b.items) {
          const f = feldId(b.id, it.id)
          a.eintraege.push({ einheit: f, text: it.scrambled, ...(it.hint ? { hinweis: it.hint } : {}), felder: [{ id: f, art: 'text' }] })
          loesungen[f] = { art: 'genau', werte: [it.answer] }
          einheit(f, [f])
        }
        break
      case 'crossword':
        for (const e of [...b.entries].sort((x, y) => (x.dir === y.dir ? x.number - y.number : x.dir === 'across' ? -1 : 1))) {
          const f = feldId(b.id, e.id)
          a.eintraege.push({
            einheit: f,
            text: `${e.number} ${e.dir === 'across' ? '→' : '↓'} ${e.clue}`,
            felder: [{ id: f, art: 'text', laenge: e.answer.replace(/\s/g, '').length }]
          })
          loesungen[f] = { art: 'genau', werte: [e.answer] }
          einheit(f, [f])
        }
        break
      case 'freeText': {
        a.vorlage = b.text
        const f = feldId(b.id, 'text')
        a.eintraege.push({ einheit: f, felder: [{ id: f, art: 'langtext' }] })
        // Freies Schreiben bewertet die Lehrkraft (Punkte des ganzen Auftrags)
        loesungen[f] = { art: 'lehrkraft', frage: frage(b.text) }
        einheit(f, [f], ganzePunkte(b.pointsPerItem))
        break
      }
      case 'latinForms':
        for (const it of b.items) {
          const fo = feldId(b.id, it.id, 'f')
          const be = feldId(b.id, it.id, 'b')
          a.eintraege.push({
            einheit: fo,
            text: it.term,
            felder: [
              { id: fo, art: 'text', beschriftung: it.formLabel },
              { id: be, art: 'text', beschriftung: 'Bedeutungen' }
            ]
          })
          loesungen[fo] = { art: 'genau', werte: [it.form] }
          loesungen[be] = { art: 'ki', frage: frage(`Bedeutungen von „${it.term}" (alle)`), erwartung: it.meanings }
          einheit(fo, [fo], ganzePunkte(b.pointsForm))
          einheit(be, [be], ganzePunkte(b.pointsMeaning))
        }
        break
      case 'verbTable':
        a.kopf = b.headers
        for (const r of b.rows) {
          const felder: Feld[] = []
          r.cells.forEach((c, i) => {
            if (c) return
            const f = feldId(b.id, r.id, String(i))
            felder.push({ id: f, art: 'text', beschriftung: b.headers[i] })
            loesungen[f] = { art: 'genau', werte: [r.solution[i] ?? ''] }
            einheit(f, [f])
          })
          a.eintraege.push({ einheit: r.id, woerter: r.cells, felder })
        }
        break
    }
    aufgaben.push(a)
  }
  return { aufgaben, einheiten, loesungen, punkte: aufgaben.reduce((s, a) => s + a.punkte, 0) }
}

// ---------------------------------------------------------------- Bewertung

export type Status = 'richtig' | 'falsch' | 'ki' | 'lehrkraft'

export interface EinheitBewertung {
  status: Status
  punkte: number
  /** Woher das Urteil kommt */
  quelle: 'auto' | 'ki' | 'lehrkraft'
  /** Begründung der KI bzw. Hinweis („nur Groß-/Kleinschreibung") */
  hinweis?: string
  /**
   * Die Lehrkraft entscheidet (02.10.2026): kleiner Fehler (Rechtschreibung, Präposition …) oder
   * eine von der Lösung abweichende, im Zusammenhang sinnvolle Antwort. Bis dahin 0 Punkte
   * („erst mal falsch", abgestimmt); „akzeptieren" gibt den ganzen Punkt.
   */
  pruefen?: 'kleinerFehler' | 'sinnvoll'
  /** Die KI hat diese (automatisch falsche) Antwort schon auf Sinn im Zusammenhang geprüft */
  kiGeprueft?: boolean
  /** Lehrkraft: Haken in Klammern – knapp richtig, volle Punkte, aber nicht fehlerfrei (03.10.2026) */
  knapp?: boolean
  /** Lehrkraft: Fragezeichen – zu allgemein bzw. unklar, keine Punkte (03.10.2026) */
  frage?: boolean
}

/** Korrekturzeichen der Lehrkraft in der Blattansicht */
export type Zeichen = 'richtig' | 'knapp' | 'falsch' | 'frage'

export type Bewertung = Record<string, EinheitBewertung>

/** Ein Feld automatisch bewerten: true/false, oder null = braucht KI bzw. Lehrkraft */
export function feldAutomatisch(l: Loesung, antwort: string, bereitsGezaehlt?: Set<string>): { ok: boolean | null; hinweis?: string } {
  const a = String(antwort ?? '')
  if (l.art === 'auswahl') return { ok: a === l.wert }
  if (l.art === 'genau') {
    const v = vergleiche(a, l.werte, l.artikelFrei)
    if (v === 'nurGross') return { ok: false, hinweis: 'nur Groß-/Kleinschreibung abweichend – bitte prüfen' }
    return { ok: v === 'richtig' }
  }
  if (!normalisiere(a)) return { ok: false }
  if (l.art === 'menge') {
    const n = normalisiere(a).toLowerCase()
    const treffer = l.werte.flatMap(alternativen).some((w) => w.toLowerCase() === n)
    // Dasselbe Wort zweimal am selben Ast zählt einmal
    const schluessel = `${l.gruppe}:${n}`
    if (treffer) {
      if (bereitsGezaehlt?.has(schluessel)) return { ok: false, hinweis: 'doppelt' }
      bereitsGezaehlt?.add(schluessel)
      return { ok: true }
    }
    return { ok: null }
  }
  return { ok: null }
}

/**
 * Erste Bewertung direkt nach der Abgabe: alles Eindeutige sofort, der Rest wartet auf die KI
 * (Status „ki") bzw. die Lehrkraft. Vorhandene Urteile der KI/Lehrkraft bleiben stehen.
 */
export function bewerte(f: Pick<OnlineFassung, 'einheiten' | 'loesungen'>, antworten: Antworten, vorher: Bewertung = {}): Bewertung {
  const out: Bewertung = {}
  const gezaehlt = new Set<string>()
  for (const e of f.einheiten) {
    const alt = vorher[e.id]
    if (alt && alt.quelle !== 'auto') {
      out[e.id] = alt
      continue
    }
    let offen: Status | null = null
    let falsch = false
    const hinweise: string[] = []
    for (const id of e.felder) {
      const l = f.loesungen[id]
      if (!l) continue
      const r = feldAutomatisch(l, antworten[id] ?? '', gezaehlt)
      if (r.hinweis) hinweise.push(r.hinweis)
      if (r.ok === false) falsch = true
      else if (r.ok === null) offen = l.art === 'lehrkraft' ? 'lehrkraft' : offen === 'lehrkraft' ? 'lehrkraft' : 'ki'
    }
    // Ein falsches Feld macht die ganze Einheit falsch – keine KI nötig
    if (falsch) out[e.id] = { status: 'falsch', punkte: 0, quelle: 'auto', ...(hinweise.length ? { hinweis: hinweise.join('; ') } : {}) }
    else if (offen) out[e.id] = { status: offen, punkte: 0, quelle: 'auto' }
    else out[e.id] = { status: 'richtig', punkte: e.punkte, quelle: 'auto' }
  }
  return out
}

export const summe = (b: Bewertung): number => Object.values(b).reduce((s, x) => s + x.punkte, 0)
export const offeneEinheiten = (b: Bewertung): number => Object.values(b).filter((x) => x.status === 'ki' || x.status === 'lehrkraft').length
/** Von der KI markiert, von der Lehrkraft noch nicht entschieden */
export const zuEntscheiden = (b: Bewertung): number => Object.values(b).filter((x) => x.pruefen && x.quelle !== 'lehrkraft').length

// ---------------------------------------------------------------- Anzeige

/** Eine Antwort, wie die Lernenden sie gesehen haben (Auswahl: Text statt interner Kennung) */
export function antwortAlsText(antwort: string | undefined, optionen?: { wert: string; text: string }[]): string {
  const a = String(antwort ?? '')
  if (!a) return ''
  return optionen?.find((o) => o.wert === a)?.text ?? a
}

/** Die Lösung eines Feldes als Text für Lehrkraft und Ergebnisseite */
export function loesungAlsText(l: Loesung | undefined, optionen?: { wert: string; text: string }[]): string {
  if (!l) return ''
  if (l.art === 'genau') return l.werte.join(' / ')
  if (l.art === 'auswahl') return antwortAlsText(l.wert, optionen) || l.wert
  if (l.art === 'ki') return l.erwartung ? `z. B. ${l.erwartung}` : ''
  if (l.art === 'menge') return l.werte.join(', ')
  return l.erwartung ? `z. B. ${l.erwartung}` : ''
}

/** Alle Felder einer Fassung mit ihrem Eintrag und ihrer Aufgabe */
export function felderVon(f: Pick<OnlineFassung, 'aufgaben'>): Map<string, { feld: Feld; eintrag: OnlineEintrag; aufgabe: OnlineAufgabe }> {
  const m = new Map<string, { feld: Feld; eintrag: OnlineEintrag; aufgabe: OnlineAufgabe }>()
  for (const aufgabe of f.aufgaben) for (const eintrag of aufgabe.eintraege) for (const feld of eintrag.felder) m.set(feld.id, { feld, eintrag, aufgabe })
  return m
}

/** Zusammenhang eines Feldes für die KI: Aufgabenstellung und das, was um die Lücke steht */
export function kontextVon(f: Pick<OnlineFassung, 'aufgaben'>, feldId: string): string {
  const x = felderVon(f).get(feldId)
  if (!x) return ''
  const { eintrag: e, aufgabe: a, feld } = x
  const teile = [a.anweisung]
  if (e.saetze?.length) teile.push(...e.saetze.map((s) => `${s.vor} ___ ${s.mitte !== undefined ? `${s.mitte} ___ ` : ''}${s.nach}`.trim()))
  else if (e.vor || e.nach) teile.push(`${(e.vor ?? '').slice(-300)} ___ ${e.nach ?? ''}`.trim())
  if (e.text) teile.push(e.text)
  if (e.woerter?.length) teile.push(`Wörter: ${e.woerter.filter(Boolean).join(', ')}`)
  if (e.hinweis) teile.push(`Hinweis: ${e.hinweis}`)
  if (feld.beschriftung) teile.push(`Feld: ${feld.beschriftung}`)
  if (a.wortkasten?.length) teile.push(`Wortkasten: ${a.wortkasten.join(', ')}`)
  return teile.filter(Boolean).join(' – ')
}
