/**
 * Aufgaben und Bausteine eines Materials für einen Reihen-Schritt auswählen (05.10.2026, Wunsch der
 * Lehrkraft: „einzelne Aufgaben / Bausteine … ausblenden, wenn dadurch die Lernziele und Zeiten der
 * Unterrichtsreihe besser erfüllt werden. Das soll nicht das Originalmaterial verändern, nur die
 * Sichtbarkeit für die Schüler und die entsprechende Bewertung").
 *
 * Abgestimmt: Aufgaben, Bausteine UND Teilaufgaben; drei Zustände Pflicht / Freiwillig ★ (sichtbar,
 * mit Feedback, zählt nicht für den Erfolg) / Ausgeblendet; Aufgaben für die Lernenden neu
 * durchgezählt, Materialnummern wie im Original; die KI schlägt vor, die Lehrkraft bestätigt.
 */
import type { StructuredRequest } from '@shared/types'
import type { Reihe, Schritt } from '@shared/reihe'
import { plainText } from '../../shared/richtext/parse'
import type { Sheet, TaskBlock, Worksheet, WsBlock } from '../arbeitsblatt/model/types'
import { isMaterial, loeseMaterialverweise, materialNummern } from '../arbeitsblatt/didactics/integrity'
import { BLOCK_LABELS } from '../arbeitsblatt/model/factory'
import { describeBlock } from '../arbeitsblatt/generation/describe'

type Ki = <T>(req: StructuredRequest) => Promise<T>
export type Auswahl = Record<string, 'frei' | 'aus'>
export type Stufe = 'pflicht' | 'frei' | 'aus'

export const teilSchluessel = (blockId: string, teilId: string): string => `${blockId}/${teilId}`
export const stufeVon = (a: Auswahl | undefined, schluessel: string): Stufe => a?.[schluessel] ?? 'pflicht'

export interface AuswahlEintrag {
  schluessel: string
  art: 'aufgabe' | 'material' | 'baustein'
  /** „Aufgabe 3", „M2", „Merkkasten / Info" */
  kennung: string
  text: string
  /** Bearbeitungszeit laut Blatt (Aufgaben) */
  minuten?: number
  teile: { schluessel: string; kennung: string; text: string }[]
}

const kurz = (s: string, n = 110): string => {
  const t = plainText(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Die auswählbaren Bausteine eines Blattes, in Blattreihenfolge mit Originalnummern */
export function auswahlEintraege(sheet: Sheet): AuswahlEintrag[] {
  const mNr = materialNummern(sheet.blocks)
  let aufgabe = 0
  // Angezeigt mit aufgelösten Verweisen („M2" statt „M{video}")
  return loeseMaterialverweise(sheet.blocks).map((b): AuswahlEintrag => {
    if (b.type === 'task') {
      aufgabe++
      return {
        schluessel: b.id,
        art: 'aufgabe',
        kennung: `Aufgabe ${aufgabe}`,
        text: kurz(b.instruction),
        minuten: b.minutes || undefined,
        teile: b.parts.map((p, i) => ({ schluessel: teilSchluessel(b.id, p.id), kennung: `${String.fromCharCode(97 + i)})`, text: kurz(p.instruction, 90) }))
      }
    }
    const titel = 'title' in b && typeof b.title === 'string' ? kurz(b.title, 80) : ''
    return {
      schluessel: b.id,
      art: isMaterial(b) ? 'material' : 'baustein',
      kennung: mNr.get(b.id) ?? BLOCK_LABELS[b.type] ?? b.type,
      text: titel || kurz(describeBlock(b), 90),
      teile: []
    }
  })
}

/** Das Blatt, wie die Lernenden es in diesem Schritt sehen – das Original bleibt unverändert */
export function blattMitAuswahl(sheet: Sheet, a: Auswahl | undefined): Sheet {
  if (!a || !Object.keys(a).length) return sheet
  // Verweise „M{kennung}" vorher auflösen und Nummern festhalten – sonst rückten sie nach
  const bloecke = loeseMaterialverweise(sheet.blocks)
  const nummern = materialNummern(bloecke)
  const neu: WsBlock[] = []
  for (const b of bloecke) {
    const stufe = stufeVon(a, b.id)
    if (stufe === 'aus') continue
    const m = nummern.get(b.id)
    let x: WsBlock = m ? { ...b, festeNummer: m } : b
    if (x.type === 'task') {
      const t: TaskBlock = {
        ...x,
        parts: x.parts
          .filter((p) => stufeVon(a, teilSchluessel(b.id, p.id)) !== 'aus')
          .map((p) => (stufeVon(a, teilSchluessel(b.id, p.id)) === 'frei' ? { ...p, instruction: `★ freiwillig: ${p.instruction}` } : p)),
        ...(stufe === 'frei' ? { freiwillig: true } : {})
      }
      x = t
    }
    neu.push(x)
  }
  return { ...sheet, blocks: neu }
}

/** Alle Blätter (Niveaustufen) eines Arbeitsblatts mit Auswahl */
export const mitAuswahl = (ws: Worksheet, a: Auswahl | undefined): Worksheet =>
  a && Object.keys(a).length ? { ...ws, sheets: ws.sheets.map((s) => blattMitAuswahl(s, a)) } : ws

/**
 * Warnungen: Eine sichtbare Aufgabe nennt ein ausgeblendetes Material, oder es bleibt keine
 * Pflichtaufgabe übrig.
 */
export function auswahlWarnungen(sheet: Sheet, a: Auswahl | undefined): string[] {
  if (!a) return []
  const aus: string[] = []
  const bloecke = loeseMaterialverweise(sheet.blocks)
  const nummern = materialNummern(bloecke)
  const versteckt = bloecke.filter((b) => isMaterial(b) && stufeVon(a, b.id) === 'aus').map((b) => nummern.get(b.id)!)
  const sichtbareAufgaben = bloecke.filter((b): b is TaskBlock => b.type === 'task' && stufeVon(a, b.id) !== 'aus')
  for (const m of versteckt)
    for (const t of sichtbareAufgaben) {
      const text = [t.instruction, ...t.parts.filter((p) => stufeVon(a, teilSchluessel(t.id, p.id)) !== 'aus').map((p) => p.instruction)]
        .map((s) => plainText(s))
        .join(' ')
      if (new RegExp(`\\b${m}\\b`).test(text)) aus.push(`Eine sichtbare Aufgabe verweist auf ${m}, das ausgeblendet ist.`)
    }
  if (!sichtbareAufgaben.some((t) => stufeVon(a, t.id) === 'pflicht'))
    aus.push('Es bleibt keine Pflichtaufgabe – der Schritt ließe sich ohne Arbeit abschließen.')
  return [...new Set(aus)]
}

/** Geschätzte Bearbeitungszeit der Pflichtaufgaben (laut Blatt) */
export function pflichtMinuten(sheet: Sheet, a: Auswahl | undefined): number {
  return sheet.blocks.reduce((n, b) => n + (b.type === 'task' && stufeVon(a, b.id) === 'pflicht' ? b.minutes || 0 : 0), 0)
}

// ---------------------------------------------------------------- Vorschlag der KI

const SCHEMA = {
  type: 'object',
  properties: {
    eintraege: {
      type: 'array',
      items: {
        type: 'object',
        properties: { schluessel: { type: 'string' }, stufe: { type: 'string', enum: ['pflicht', 'frei', 'aus'] }, grund: { type: 'string' } },
        required: ['schluessel', 'stufe', 'grund'],
        additionalProperties: false
      }
    },
    minuten: { type: 'integer' },
    hinweis: { type: 'string' }
  },
  required: ['eintraege', 'minuten', 'hinweis'],
  additionalProperties: false
}

/** Die KI schlägt vor, was in diesem Schritt Pflicht, freiwillig oder ausgeblendet sein soll */
export async function auswahlVorschlagen(
  r: Reihe,
  s: Schritt,
  sheet: Sheet,
  ki: Ki
): Promise<NonNullable<Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>['auswahlVorschlag']>> {
  const eintraege = auswahlEintraege(sheet)
  const bekannt = new Set(eintraege.flatMap((e) => [e.schluessel, ...e.teile.map((t) => t.schluessel)]))
  const stundeMin = r.stunden?.[s.stunde ?? -1] === 'doppel' ? 90 : 45
  const ziel = s.minuten ?? Math.round(stundeMin * 0.6)
  const voll = new Map(sheet.blocks.map((b) => [b.id, b]))
  const d = await ki<{ eintraege: { schluessel: string; stufe: string; grund: string }[]; minuten: number; hinweis: string }>({
    system: `Du passt ein vorhandenes Arbeitsblatt an einen Schritt einer Unterrichtsreihe an (${r.fachLabel}, Klasse ${r.grade}). Das Original bleibt unverändert; du entscheidest nur, was die Lernenden in diesem Schritt als Pflicht bearbeiten, was freiwillig ist und was ausgeblendet wird.`,
    user: [
      `REIHE: ${r.titel} (Oberthema: ${r.oberthema})`,
      `SCHRITT: ${s.titel}`,
      s.lernziele.length ? `LERNZIELE DES SCHRITTS: ${s.lernziele.map((l) => l.text).join('; ')}` : '',
      r.lernziele.length ? `LERNZIELE DER REIHE: ${r.lernziele.map((l) => l.text).join('; ')}` : '',
      `ZEIT FÜR DIESEN SCHRITT: etwa ${ziel} Minuten`,
      'BAUSTEINE DES BLATTES (Schlüssel in eckigen Klammern; Teilaufgaben eingerückt):',
      ...eintraege.flatMap((e) => [
        `[${e.schluessel}] ${e.kennung}${e.minuten ? ` (${e.minuten} min)` : ''}: ${kurz(describeBlock(voll.get(e.schluessel)!), 300)}`,
        ...e.teile.map((t) => `   [${t.schluessel}] ${t.kennung} ${t.text}`)
      ]),
      'REGELN:',
      '- Nenne NUR Bausteine/Teilaufgaben, die NICHT Pflicht bleiben sollen ("frei" oder "aus"); alles Ungenannte bleibt Pflicht.',
      '- "aus" für Aufgaben/Teilaufgaben, die nicht zu den Lernzielen des Schritts gehören oder die Zeit sprengen, und für Materialien, auf die keine verbleibende Aufgabe zugreift.',
      '- "frei" für sinnvolle Vertiefungen (meist Anforderungsbereich III) und Zusatzaufgaben, wenn die Zeit knapp ist.',
      '- Materialien, auf die eine sichtbare Aufgabe verweist, NIE ausblenden. Teilaufgaben, auf die eine spätere Teilaufgabe aufbaut, nicht ausblenden.',
      '- Lernziele, Merkkästen und Hilfen nur ausblenden, wenn sie zu ausgeblendeten Aufgaben gehören.',
      '- Mindestens eine Pflichtaufgabe bleibt. Ziel: Pflichtaufgaben passen in die Zeit.',
      '- "grund": ein kurzer Satz. "minuten": geschätzte Zeit der verbleibenden Pflichtaufgaben. "hinweis": ein bis zwei Sätze für die Lehrkraft.'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_auswahl',
    schema: SCHEMA
  })
  const auswahl: Auswahl = {}
  const gruende: Record<string, string> = {}
  for (const e of d?.eintraege ?? []) {
    const k = String(e.schluessel ?? '').trim()
    if (!bekannt.has(k) || (e.stufe !== 'frei' && e.stufe !== 'aus')) continue
    auswahl[k] = e.stufe
    if (e.grund?.trim()) gruende[k] = e.grund.trim()
  }
  // Nie alle Pflichtaufgaben weg
  if (!sheet.blocks.some((b) => b.type === 'task' && stufeVon(auswahl, b.id) === 'pflicht')) {
    const erste = sheet.blocks.find((b) => b.type === 'task')
    if (erste) delete auswahl[erste.id]
  }
  return { auswahl, gruende, minuten: Math.max(0, Math.round(Number(d?.minuten) || pflichtMinuten(sheet, auswahl))), hinweis: String(d?.hinweis ?? '').trim() }
}
