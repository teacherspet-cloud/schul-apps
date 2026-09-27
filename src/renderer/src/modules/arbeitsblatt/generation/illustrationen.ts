/**
 * Automatische Platzierung der Illustrationen (26.09.2026).
 *
 * Entscheidungen der Lehrkraft: Illustrationen gelten bis zu einer Klassenstufe (Einstellung,
 * Vorgabe Klasse 6) als altersgerecht; die KI setzt sie sparsam nach Regeln an Kästen und
 * Aufgabenköpfe, mit Sprechblase nur, wo ein Kurztext hilft; auf Arbeiten (Klassenarbeit,
 * Grammatiktest, Lernzielkontrolle) nur am Kopf (winkend) und am Schluss (jubelnd).
 *
 * Die REGELN stehen hier, nicht im Sprachmodell: Sie sind nachvollziehbar, kosten kein
 * Kontingent und liefern auf jedem Blatt dasselbe Muster. Nur die Sprechblasentexte schreibt
 * die KI (ein kleiner Auftrag), damit sie zum Thema passen; ohne KI stehen feste Sätze da.
 */
import { obj, str } from '../../../shared/aiSchema'
import { useAppSettings } from '../../../shared/settingsStore'
import { useMaskottchen } from '../../../shared/maskottchenStore'
import type { Sheet, Worksheet, WorksheetMeta, WsBlock } from '../model/types'
import type { AiCall } from './generate'

export const ILLUSTRATIONEN_BIS_KLASSE = 6

export type Illustration = NonNullable<WsBlock['illustration']>

/** Bis zu welcher Klasse Illustrationen angeboten werden (Einstellung; Vorgabe 6). */
export function illustrationenBisKlasse(): number {
  return useAppSettings.getState().settings.illustrationen?.bisKlasse ?? ILLUSTRATIONEN_BIS_KLASSE
}

/**
 * Gelten für dieses Blatt Illustrationen? Ausdrückliche Wahl am Blatt geht vor; sonst nach
 * dem Jahrgang. Ohne angelegtes Maskottchen bleibt alles aus – leere Rahmen gibt es nicht.
 */
export function illustrationenAktiv(meta: Pick<WorksheetMeta, 'grade' | 'illustrationen'>): boolean {
  if (!useMaskottchen.getState().liste.length) return false
  if (typeof meta.illustrationen?.an === 'boolean') return meta.illustrationen.an
  return meta.grade <= illustrationenBisKlasse()
}

/** Vorschlag der Automatik – Illustrationen an, wenn der Jahrgang darunter liegt. */
export function illustrationenVorschlag(grade: number): boolean {
  return grade <= illustrationenBisKlasse()
}

const AFB_DENKEN = /^(beurteile|bewerte|begründe|erkläre|erläutere|diskutiere|vergleiche|entwickle)/i

/** Pose für einen Baustein nach seinem Zweck – oder null, wenn er keine bekommt. */
export function poseFuer(block: WsBlock, meta: Pick<WorksheetMeta, 'subjectId'>): string | null {
  switch (block.type) {
    case 'infoBox':
      return block.variant === 'regel' ? 'warnend' : block.variant === 'beispiel' ? (meta.subjectId === 'mathematik' ? 'rechnend' : 'zeigend') : block.variant === 'definition' || block.variant === 'wissen' ? 'lesend' : 'zeigend'
    case 'scaffold':
      return block.variant === 'tipp' ? 'sprechend' : null
    case 'audio':
      return 'hoerend'
    case 'selfCheck':
      return 'jubelnd'
    case 'task': {
      const kind = block.parts[0]?.answer.kind ?? block.answer.kind
      if (kind === 'diagram') return 'zeichnend'
      if (block.afb === 'III' || AFB_DENKEN.test(block.operator || block.instruction)) return 'denkend'
      if (kind === 'lines' && (block.answer.count >= 5 || block.brief)) return 'schreibend'
      if (meta.subjectId === 'mathematik' && kind === 'grid') return 'rechnend'
      return null
    }
    default:
      return null
  }
}

export interface PlatzierungsOptionen {
  /** Arbeiten: nur Kopf (winkend) und Schluss (jubelnd), keine Sprechblasen */
  nurKopfUndSchluss?: boolean
  /** Sprechblasentexte von der KI; fehlt sie, feste Sätze */
  ai?: AiCall
  /** Vorhandene Illustrationen (von Hand gesetzt) erhalten */
  bewahren?: boolean
}

const FESTE_TEXTE = { gruss: 'Hallo! Los geht’s.', schluss: 'Geschafft – gut gemacht!' }

/** Bis zu drei kurze Sprechblasentexte, altersgerecht und zum Thema (ein kleiner Auftrag). */
async function sprechblasen(meta: WorksheetMeta, ai: AiCall | undefined, tippText: string | null): Promise<{ gruss: string; schluss: string; tipp: string }> {
  const fest = { ...FESTE_TEXTE, tipp: '' }
  if (!ai) return fest
  try {
    const data = await ai<{ gruss?: string; schluss?: string; tipp?: string }>({
      system: `Du schreibst Sprechblasentexte für ein freundliches Maskottchen auf einem Arbeitsblatt (Fach ${meta.subjectLabel}, Klasse ${meta.grade}). Sehr kurz (höchstens 8 Wörter), kindgerecht, in Du-Form, ohne Ausrufezeichen-Häufung, ohne Inhalte zu verraten.`,
      user: [
        `Thema: ${meta.topic}`,
        '„gruss": Begrüßung am Anfang mit Bezug zum Thema.',
        '„schluss": Lob am Ende.',
        tippText ? `„tipp": ein Satz, der zu diesem Tipp hinführt, ohne ihn zu wiederholen: „${tippText.slice(0, 200)}"` : '„tipp": leer lassen.'
      ].join('\n'),
      schemaName: 'sprechblasen',
      schema: obj({ gruss: str(), schluss: str(), tipp: str() })
    })
    return {
      gruss: String(data.gruss ?? '').trim() || fest.gruss,
      schluss: String(data.schluss ?? '').trim() || fest.schluss,
      tipp: tippText ? String(data.tipp ?? '').trim() : ''
    }
  } catch {
    return fest
  }
}

/**
 * Setzt die Illustrationen eines Blattes: an den Kopf (erster Baustein, winkend, Gruß), an
 * Kästen und passende Aufgaben (höchstens drei Figuren an Aufgaben, damit es sparsam bleibt),
 * an den Schluss (Selbsteinschätzung oder letzter Baustein, jubelnd, Lob).
 */
export async function platziereIllustrationen(ws: Worksheet, opts: PlatzierungsOptionen = {}): Promise<Worksheet> {
  if (!illustrationenAktiv(ws.meta)) return ws
  const maskottchenId = ws.meta.illustrationen?.maskottchenId
  const sheets: Sheet[] = []
  for (const sheet of ws.sheets) {
    const blocks = sheet.blocks.map((b) => (opts.bewahren && b.illustration ? b : { ...b, illustration: undefined }))
    const sichtbar = blocks.filter((b) => b.type !== 'illustration')
    if (!sichtbar.length) {
      sheets.push({ ...sheet, blocks })
      continue
    }
    const setze = (block: WsBlock, pose: string, bubble?: string): void => {
      if (opts.bewahren && block.illustration) return
      block.illustration = { ...(maskottchenId ? { maskottchenId } : {}), pose, ...(bubble ? { bubble } : {}) }
    }
    const kopf = sichtbar[0]
    const schluss = sichtbar.find((b) => b.type === 'selfCheck') ?? sichtbar[sichtbar.length - 1]
    if (opts.nurKopfUndSchluss) {
      setze(kopf, 'winkend')
      if (schluss !== kopf) setze(schluss, 'jubelnd')
      sheets.push({ ...sheet, blocks })
      continue
    }
    const tipp = sichtbar.find((b) => b.type === 'scaffold' && b.variant === 'tipp')
    const texte = await sprechblasen(ws.meta, opts.ai, tipp && tipp.type === 'scaffold' ? tipp.items.join(' ') : null)
    setze(kopf, 'winkend', texte.gruss)
    let anAufgaben = 0
    for (const b of sichtbar) {
      if (b === kopf || b === schluss) continue
      const pose = poseFuer(b, ws.meta)
      if (!pose) continue
      if (b.type === 'task') {
        if (anAufgaben >= 3) continue
        anAufgaben++
      }
      setze(b, pose, b === tipp ? texte.tipp || undefined : undefined)
    }
    if (schluss !== kopf) setze(schluss, 'jubelnd', texte.schluss)
    sheets.push({ ...sheet, blocks })
  }
  return { ...ws, sheets }
}

/** Arbeiten (Klassenarbeit, Grammatiktest, Lernzielkontrolle): nur Kopf und Schluss, ohne KI – synchron. */
export function platziereKopfUndSchluss(ws: Worksheet): Worksheet {
  if (!illustrationenAktiv(ws.meta)) return ws
  const maskottchenId = ws.meta.illustrationen?.maskottchenId
  return {
    ...ws,
    sheets: ws.sheets.map((sheet) => {
      const blocks = sheet.blocks.map((b) => ({ ...b, illustration: undefined }) as WsBlock)
      const sichtbar = blocks.filter((b) => b.type !== 'illustration')
      if (!sichtbar.length) return { ...sheet, blocks }
      const kopf = sichtbar[0]
      const schluss = sichtbar[sichtbar.length - 1]
      kopf.illustration = { ...(maskottchenId ? { maskottchenId } : {}), pose: 'winkend' }
      if (schluss !== kopf) schluss.illustration = { ...(maskottchenId ? { maskottchenId } : {}), pose: 'jubelnd' }
      return { ...sheet, blocks }
    })
  }
}
