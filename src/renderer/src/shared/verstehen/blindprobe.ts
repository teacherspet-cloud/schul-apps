/**
 * Ankreuzfragen zu Texten: nicht ohne den Text lösbar (01.10.2026).
 *
 * Wunsch der Lehrkraft: Bei Multiple-Choice-Fragen zu Lese-, Hör- und Hörsehtexten dürfen die
 * Lernenden keine Antwortmöglichkeit ausschließen können, ohne den Text gelesen, gehört oder
 * gesehen zu haben; die Fragen prüfen genaues Lesen/Hören. Entschieden (Auswahl der Lehrkraft):
 *
 * 1. Regeln im Auftrag an die KI (`mcAusschlussRegeln`) – plausible Distraktoren gleicher Länge,
 *    gleichen Baus und Registers, kein Weltwissen, keine Absolutwörter, keine grammatischen
 *    Hinweise, Lösung nicht die längste, kein „all/none of the above", Paraphrase statt Wortgleichheit.
 * 2. BLINDPROBE nach dem Erzeugen: Eine zweite Anfrage beantwortet die Fragen OHNE den Text (nur
 *    Frage und Optionen). Was sie mit hoher Sicherheit richtig beantwortet oder wo sie mindestens
 *    zwei falsche Optionen mit Grund ausschließt, wird neu gefasst (höchstens zwei Runden), sonst
 *    als Hinweis markiert. Je Aufgabe eine Anfrage, knappes Schema, keine personenbezogenen Daten.
 * 3. Bestehende Materialien: Hinweis „MC-Frage ohne Text lösbar?" mit „Vorschlag der App umsetzen"
 *    (shared/components/McBlindHinweis.tsx) – die Blindprobe auf Abruf.
 *
 * Gilt in Arbeitsblatt, Klassenarbeit, Lernzielkontrolle und Grammatiktest. Der Vokabeltest hat keine
 * Ankreuzfragen zu Texten (nur Einzelsätze mit Lücke) und bleibt außen vor.
 */
import type { StructuredRequest } from '@shared/types'
import type { TaskBlock, TaskPart, WsBlock } from '../../modules/arbeitsblatt/model/types'
import { arr, int, obj, str } from '../aiSchema'

export type BlindprobeAi = <T>(req: StructuredRequest) => Promise<T>

/** Die Regeln für den Erzeugungsauftrag – gelten für jede Ankreuzfrage zu einem Text, Hör- oder Hörsehtext */
export function mcAusschlussRegeln(): string {
  return [
    'ANKREUZFRAGEN ZU EINEM TEXT, HÖRTEXT ODER VIDEO – NUR MIT DEM TEXT LÖSBAR (verbindlich):',
    '- Wer den Text nicht kennt, darf KEINE Antwortmöglichkeit sicher ausschließen können. Jede Frage prüft genaues Lesen bzw. Hören einer bestimmten Stelle, nicht das Thema im Groben.',
    '- Die falschen Möglichkeiten (Distraktoren) sind plausibel: Sie beziehen sich auf Dinge, die im Text vorkommen oder in dieser Situation gut vorkommen könnten.',
    '- Alle Möglichkeiten einer Frage haben gleiche Länge, gleichen Satzbau und gleiches Register; die richtige ist weder die längste noch die genaueste.',
    '- Kein Weltwissen als Verräter: Keine Möglichkeit ist allein deshalb richtig oder falsch, weil sie allgemein bekannt, vernünftig oder abwegig ist.',
    '- Keine Absolutwörter als Signal (always, never, all, only, immer, nie, alle, nur …) – weder nur in den falschen noch nur in der richtigen Möglichkeit.',
    '- Keine grammatischen Hinweise: Jede Möglichkeit passt grammatisch gleich gut zur Frage (Artikel, Numerus, Zeitform, Anschluss).',
    '- Kein „all of the above", „none of the above", „alles davon", „nichts davon", keine Kombinationen.',
    '- Paraphrase statt Wortgleichheit: Die richtige Möglichkeit übernimmt nicht den Wortlaut des Textes; ein Distraktor darf Textwörter enthalten.',
    '- Die Antwort verlangt, eine Einzelheit im Text zu finden; sie lässt sich nicht aus dem Gesamteindruck oder der Überschrift erraten.'
  ].join('\n')
}

/*
 * Schalter in den Einstellungen („Blindprobe für Ankreuzfragen", voreingestellt an). Der Laden der
 * Einstellungen setzt ihn (settingsStore.ts); die Erzeugung fragt ihn hier ab, ohne die Oberfläche zu kennen.
 */
let aktiv = true
export const setzeBlindprobe = (an: boolean | undefined): void => {
  aktiv = an !== false
}
export const blindprobeAktiv = (): boolean => aktiv

/** Ab dieser Sicherheit (0–100) gilt eine richtige Blindantwort als „ohne Text lösbar" */
export const SICHER_AB = 70
/** So viele falsche Möglichkeiten mit Grund ausgeschlossen = ohne Text lösbar */
export const AUSSCHLUSS_AB = 2
/** Höchstens so viele Neufassungen je Frage */
export const MAX_RUNDEN = 2
/** Unter so vielen Zeichen Material wird nicht neu gefasst, nur markiert (z. B. Video ohne Transkript) */
const KONTEXT_MIN = 200
const KONTEXT_MAX = 14000

/** Kennzeichen des Hinweises an der Aufgabe – auch zum Wiederfinden beim nächsten Durchlauf */
export const BLIND_HINWEIS = 'MC-Frage ohne Text lösbar'

/** Eine Ankreuzfrage: `teil` = Nummer der Teilaufgabe, -1 = die Aufgabe selbst */
export interface McFrage {
  blockId: string
  teil: number
  frage: string
  optionen: string[]
  richtig: number[]
}

const roh = (s: string): string =>
  (s ?? '')
    .replace(/\*\*|__|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const istMc = (a: TaskPart['answer'] | undefined): boolean => a?.kind === 'multipleChoice' && (a.options ?? []).filter((o) => o.trim()).length >= 2

/** Die Ankreuzfragen einer Aufgabe – die Aufgabe selbst und ihre Teilaufgaben */
export function mcFragenDerAufgabe(t: TaskBlock): McFrage[] {
  const out: McFrage[] = []
  if (istMc(t.answer))
    out.push({
      blockId: t.id,
      teil: -1,
      frage: roh(t.instruction),
      optionen: t.answer.options.map(roh),
      richtig: [...(t.answer.correct ?? [])]
    })
  ;(t.parts ?? []).forEach((p, i) => {
    if (istMc(p.answer))
      out.push({
        blockId: t.id,
        teil: i,
        frage: roh(p.instruction),
        optionen: p.answer.options.map(roh),
        richtig: [...(p.answer.correct ?? [])]
      })
  })
  return out
}

/**
 * Gehört die Aufgabe zu einem Text, Hörtext oder Video? Grammatik- und Wortschatzaufgaben nie – die
 * sind mit Sprachwissen lösbar, und genau das sollen sie prüfen. `streng` (Grammatiktest): nur
 * ausgewiesene Lese-/Hör-/Sehaufgaben, keine Erkennung am Wortlaut der Anweisung.
 */
export function istVerstehensAufgabe(t: TaskBlock, bloecke: WsBlock[], streng = false): boolean {
  if (t.grammar || (t.skill && t.skill !== 'reading' && t.skill !== 'listening')) return false
  if (t.skill === 'reading' || t.skill === 'listening' || t.audioId || t.videoId || t.viewingPhase) return true
  if (streng) return false
  const material = bloecke.some((b) => b.type === 'text' || b.type === 'audio' || b.type === 'video')
  if (!material) return false
  // Sachfächer: Ankreuzfragen, die sich ausdrücklich auf ein Material beziehen
  const anweisung = [t.instruction, ...(t.parts ?? []).map((p) => p.instruction)].join(' ')
  return (
    /\bM\s?\d+\b|\[\[|\b(text|passage|article|listening|recording|video|film|clip)\b|\b(Text|Hörtext|Artikel|Material|Quelle|Video|Film|Bericht|Interview)/i.test(
      anweisung
    ) || Boolean(t.ref)
  )
}

/** Kurze Prüfsumme aus Fragen und Optionen (djb2) – ändert sich, sobald eine Frage geändert wird */
export function mcSignatur(t: TaskBlock): string {
  const s = mcFragenDerAufgabe(t)
    .map((f) => `${f.teil}|${f.frage}|${f.optionen.join('¦')}|${f.richtig.join(',')}`)
    .join('\n')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `b1-${h.toString(36)}`
}

/** Verstehensaufgaben mit Ankreuzfragen, die noch keine Blindprobe in ihrer jetzigen Fassung hatten */
export function ungepruefteMcAufgaben(bloecke: WsBlock[], streng = false): TaskBlock[] {
  return bloecke.filter(
    (b): b is TaskBlock => b.type === 'task' && mcFragenDerAufgabe(b).length > 0 && istVerstehensAufgabe(b, bloecke, streng) && b.mcBlindprobe !== mcSignatur(b)
  )
}

/** Das Material, auf das sich die Aufgabe bezieht – für die Neufassung (nicht für die Blindprobe) */
export function materialKontext(bloecke: WsBlock[], t: TaskBlock): string {
  const teile: string[] = []
  for (const b of bloecke) {
    if (b.type === 'audio' && (!t.audioId || t.audioId === b.id)) teile.push(`${b.title}\n${b.transcript}`)
    else if (b.type === 'video' && (!t.videoId || t.videoId === b.id))
      teile.push([b.sourceTitle, b.section, b.summary, b.teacherNote].filter(Boolean).join('\n'))
    else if (b.type === 'text' && !t.audioId && !t.videoId) teile.push(`${b.title}\n${b.body}`)
  }
  return teile.join('\n\n').slice(0, KONTEXT_MAX)
}

export interface BlindUrteil {
  nr: number
  antwort: number
  sicherheit: number
  ausgeschlossen: { option: number; grund: string }[]
}

const fragenListe = (fragen: McFrage[]): string =>
  fragen.map((f, i) => [`${i + 1}. ${f.frage}`, ...f.optionen.map((o, k) => `   ${k}) ${o}`)].join('\n')).join('\n')

const BLIND_SCHEMA = obj({
  antworten: arr(
    obj({
      nr: int('Nummer der Frage'),
      antwort: int('Index der wahrscheinlichsten Option (ab 0)'),
      sicherheit: int('Sicherheit 0–100'),
      ausgeschlossen: arr(
        obj({
          option: int('Index der Option'),
          grund: str('Kurzer Grund, warum sie ohne Text sicher falsch ist')
        })
      )
    })
  )
})

/** Die Blindprobe selbst: eine Anfrage für alle Fragen einer Aufgabe – OHNE den Text */
export async function blindRaten(fragen: McFrage[], ai: BlindprobeAi): Promise<BlindUrteil[]> {
  if (!fragen.length) return []
  const res = await ai<{ antworten?: BlindUrteil[] }>({
    system: [
      'Du bist ein Prüfling OHNE Zugang zum Text, Hörtext oder Video, auf den sich die Fragen beziehen.',
      'Beantworte jede Ankreuzfrage allein aus Allgemeinwissen, Sprachgefühl und Hinweisen in Frage und Antwortmöglichkeiten (Länge, Grammatik, Absolutwörter, Wortwahl).',
      'Gib je Frage den Index der wahrscheinlichsten Möglichkeit, deine ehrliche Sicherheit (0 = reines Raten, 100 = sicher) und die Möglichkeiten, die du OHNE Text sicher ausschließen kannst, je mit kurzem Grund.',
      'Schließe nur aus, was du wirklich begründen kannst; im Zweifel nichts ausschließen und niedrige Sicherheit angeben.'
    ].join('\n'),
    user: `Ankreuzfragen (Optionen mit Index ab 0):\n${fragenListe(fragen)}`,
    schema: BLIND_SCHEMA,
    schemaName: 'mc_blindprobe'
  })
  return Array.isArray(res?.antworten) ? res.antworten : []
}

/** Ist die Frage nach dem Urteil der Blindprobe ohne Text lösbar? Liefert den Grund oder '' */
export function ohneTextLoesbar(f: McFrage, u: BlindUrteil | undefined): string {
  if (!u) return ''
  const falscheRaus = (u.ausgeschlossen ?? []).filter((a) => !f.richtig.includes(a.option) && a.option >= 0 && a.option < f.optionen.length && a.grund?.trim())
  const anzahlRaus = new Set(falscheRaus.map((a) => a.option)).size
  if (f.richtig.includes(u.antwort) && u.sicherheit >= SICHER_AB) return `ohne Text richtig beantwortet, Sicherheit ${u.sicherheit} %`
  if (anzahlRaus >= AUSSCHLUSS_AB && f.optionen.length > 2)
    return `${anzahlRaus} Möglichkeiten ohne Text ausgeschlossen: ${falscheRaus
      .slice(0, 2)
      .map((a) => roh(a.grund))
      .join('; ')}`
  return ''
}

const NEU_SCHEMA = obj({
  fragen: arr(
    obj({
      nr: int('Nummer der Frage'),
      frage: str('Neu gefasste Frage'),
      optionen: arr(str(), 'Antwortmöglichkeiten, gleiche Zahl wie vorher'),
      richtig: int('Index der richtigen Möglichkeit (ab 0)')
    })
  )
})

/** Die ohne Text lösbaren Fragen neu fassen – mit dem Material und den Gründen der Blindprobe */
export async function neuFassen(fragen: { frage: McFrage; grund: string }[], kontext: string, ai: BlindprobeAi): Promise<(McFrage | null)[]> {
  if (!fragen.length) return []
  const res = await ai<{
    fragen?: {
      nr: number
      frage: string
      optionen: string[]
      richtig: number
    }[]
  }>({
    system: [
      'Du überarbeitest Ankreuzfragen zu einem Text, Hörtext oder Video für ein Arbeitsblatt bzw. eine Klassenarbeit.',
      'Eine Blindprobe hat die folgenden Fragen OHNE das Material lösen können. Fasse jede so neu, dass sie nur mit dem Material lösbar ist.',
      'Gleiche Sprache, gleiche Zahl an Möglichkeiten, gleicher Inhaltsbereich (dieselbe Textstelle oder eine benachbarte) und gleiche Schwierigkeit; genau eine Möglichkeit ist richtig und steht im Material.',
      'Fragesatz ohne Nummer, Möglichkeiten ohne „a)" – die Zählung setzt das Blatt.',
      '',
      mcAusschlussRegeln()
    ].join('\n'),
    user: [
      `MATERIAL:\n${kontext}`,
      '',
      'FRAGEN, DIE OHNE MATERIAL LÖSBAR WAREN (Optionen mit Index ab 0, richtige markiert):',
      fragen
        .map(({ frage: f, grund }, i) =>
          [`${i + 1}. ${f.frage}`, ...f.optionen.map((o, k) => `   ${k}) ${o}${f.richtig.includes(k) ? '  [richtig]' : ''}`), `   Blindprobe: ${grund}`].join(
            '\n'
          )
        )
        .join('\n')
    ].join('\n'),
    schema: NEU_SCHEMA,
    schemaName: 'mc_neufassung'
  })
  const liste = Array.isArray(res?.fragen) ? res.fragen : []
  return fragen.map(({ frage: alt }, i) => {
    const n = liste.find((x) => x.nr === i + 1) ?? liste[i]
    const optionen = (n?.optionen ?? []).map((o) => String(o ?? '').trim())
    if (!n?.frage?.trim() || optionen.length !== alt.optionen.length || optionen.some((o) => !o) || !(n.richtig >= 0 && n.richtig < optionen.length))
      return null
    return { ...alt, frage: n.frage.trim(), optionen, richtig: [n.richtig] }
  })
}

/** Eine neu gefasste Frage in die Aufgabe setzen – Lösungstext mit, Begründung der Stufe gilt nicht mehr */
export function setzeFrage(t: TaskBlock, f: McFrage): TaskBlock {
  const loesung = f.optionen[f.richtig[0]] ?? ''
  if (f.teil < 0) {
    const { stufeGrund: _alt, ...rest } = t
    return {
      ...rest,
      instruction: f.frage,
      answer: { ...t.answer, options: f.optionen, correct: f.richtig },
      solution: t.solution ? loesung : t.solution
    }
  }
  return {
    ...t,
    parts: t.parts.map((p, i) => {
      if (i !== f.teil) return p
      const { stufeGrund: _alt, ...rest } = p
      return {
        ...rest,
        instruction: f.frage,
        answer: { ...p.answer, options: f.optionen, correct: f.richtig },
        solution: p.solution ? loesung : p.solution
      }
    })
  }
}

const kurz = (s: string): string => (s.length > 70 ? `${s.slice(0, 67)}…` : s)

export interface BlindprobeErgebnis {
  aufgabe: TaskBlock
  /** Neu gefasste Fragen */
  ersetzt: number
  /** Fragen, die auch danach ohne Text lösbar blieben (oder nicht neu gefasst werden konnten) */
  markiert: number
}

/**
 * Blindprobe für eine Aufgabe: prüfen, Lösbares neu fassen, neu Gefasstes wieder prüfen – höchstens
 * `MAX_RUNDEN` Neufassungen. Was danach noch ohne Text lösbar ist, bekommt einen Hinweis.
 */
export async function blindprobeAufgabe(t: TaskBlock, kontext: string, ai: BlindprobeAi): Promise<BlindprobeErgebnis> {
  let aufgabe: TaskBlock = {
    ...t,
    warnings: (t.warnings ?? []).filter((w) => !w.includes(BLIND_HINWEIS))
  }
  let offen = mcFragenDerAufgabe(aufgabe)
  const neu = new Set<number>()
  let markiert = 0
  const hinweise: string[] = []
  for (let runde = 0; offen.length; runde++) {
    // Scheitert eine spätere Runde, bleibt das bis dahin Neugefasste (die erste Runde scheitert ganz)
    const urteile = await blindRaten(offen, ai).catch((e) => {
      if (runde === 0) throw e
      return null
    })
    if (!urteile) break
    const loesbar = offen
      .map((f, i) => ({
        frage: f,
        grund: ohneTextLoesbar(f, urteile.find((u) => u.nr === i + 1) ?? urteile[i])
      }))
      .filter((x) => x.grund)
    if (!loesbar.length) break
    const neuFassbar = kontext.trim().length >= KONTEXT_MIN && runde < MAX_RUNDEN
    const fassungen = neuFassbar ? await neuFassen(loesbar, kontext, ai).catch(() => loesbar.map(() => null)) : loesbar.map(() => null)
    const naechste: McFrage[] = []
    loesbar.forEach(({ frage, grund }, i) => {
      const f = fassungen[i]
      if (f) {
        aufgabe = setzeFrage(aufgabe, f)
        neu.add(f.teil)
        naechste.push(f)
        return
      }
      markiert++
      hinweise.push(
        `[Prüfung] ${BLIND_HINWEIS}: „${kurz(frage.frage)}" – ${grund}${
          neuFassbar ? '' : runde >= MAX_RUNDEN ? ` (auch nach ${MAX_RUNDEN} Neufassungen)` : ' (ohne Materialtext keine Neufassung)'
        }. Die Antwortmöglichkeiten brauchen einen Blick der Lehrkraft.`
      )
    })
    offen = naechste
  }
  const ersetzt = neu.size
  aufgabe = {
    ...aufgabe,
    mcBlindprobe: mcSignatur(aufgabe),
    ...(hinweise.length || aufgabe.warnings?.length ? { warnings: [...(aufgabe.warnings ?? []), ...hinweise] } : {})
  }
  if (!aufgabe.warnings?.length) delete aufgabe.warnings
  return { aufgabe, ersetzt, markiert }
}

export interface BlindprobeBericht {
  bloecke: WsBlock[]
  geprueft: number
  ersetzt: number
  markiert: number
}

/**
 * Blindprobe für alle ungeprüften Verstehensaufgaben mit Ankreuzfragen einer Bausteinliste (Blatt,
 * Teil einer Arbeit, Kurztest). Fehler einer Anfrage lassen die Aufgabe unverändert – die Blindprobe
 * ist eine Verbesserung, kein Grund, ein fertiges Blatt zu verwerfen.
 */
export async function blindprobeBloecke(
  bloecke: WsBlock[],
  ai: BlindprobeAi,
  opts: { melde?: (text: string) => void; streng?: boolean } = {}
): Promise<BlindprobeBericht> {
  const { melde, streng } = opts
  const aufgaben = ungepruefteMcAufgaben(bloecke, streng)
  const bericht: BlindprobeBericht = {
    bloecke,
    geprueft: 0,
    ersetzt: 0,
    markiert: 0
  }
  if (!aufgaben.length) return bericht
  melde?.(`Ankreuzfragen: Blindprobe ohne Text (${aufgaben.length} ${aufgaben.length === 1 ? 'Aufgabe' : 'Aufgaben'}) …`)
  // Höchstens drei Aufgaben gleichzeitig – wie die übrigen Nachbesserungen
  const ergebnisse: (BlindprobeErgebnis | null)[] = []
  for (let i = 0; i < aufgaben.length; i += 3)
    ergebnisse.push(...(await Promise.all(aufgaben.slice(i, i + 3).map((t) => blindprobeAufgabe(t, materialKontext(bloecke, t), ai).catch(() => null)))))
  const neu = new Map<string, TaskBlock>()
  ergebnisse.forEach((e) => {
    if (!e) return
    neu.set(e.aufgabe.id, e.aufgabe)
    bericht.geprueft++
    bericht.ersetzt += e.ersetzt
    bericht.markiert += e.markiert
  })
  bericht.bloecke = bloecke.map((b) => neu.get(b.id) ?? b)
  return bericht
}

/** Die geprüften Aufgaben in einen inzwischen womöglich geänderten Stand einarbeiten – nur Aufgaben, die die Lehrkraft seitdem nicht angefasst hat */
export function uebernimmBlindprobe(aktuell: WsBlock[], vorher: WsBlock[], geprueft: WsBlock[]): WsBlock[] {
  const alt = new Map(vorher.map((b) => [b.id, b]))
  const neu = new Map(geprueft.filter((b) => b.type === 'task').map((b) => [b.id, b]))
  return aktuell.map((b) => {
    const n = neu.get(b.id)
    const v = alt.get(b.id)
    if (!n || !v || n === v) return b
    // Seit dem Start von Hand geändert: nicht überschreiben
    return JSON.stringify(b) === JSON.stringify(v) ? n : b
  })
}

/** Zusammenfassung für die Lehrkraft nach einer Blindprobe auf Abruf */
export function blindprobeMeldung(b: Pick<BlindprobeBericht, 'geprueft' | 'ersetzt' | 'markiert'>): string {
  if (!b.geprueft) return 'Keine Ankreuzfragen zu Texten zu prüfen.'
  const teile = [
    `${b.geprueft} ${b.geprueft === 1 ? 'Aufgabe' : 'Aufgaben'} ohne Text geprüft`,
    b.ersetzt ? `${b.ersetzt} ${b.ersetzt === 1 ? 'Frage' : 'Fragen'} neu gefasst` : 'keine Frage ohne Text lösbar',
    b.markiert ? `${b.markiert} mit Hinweis markiert` : ''
  ]
  return `${teile.filter(Boolean).join(', ')}.`
}
