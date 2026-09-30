/**
 * Material für Tafelbilder:
 * - Material aus der App (Arbeitsblatt, Klassenarbeit, LZK …) als Text für die KI – aus dem
 *   gespeicherten Dokument die Texte gesammelt (ohne Bilder, Kennungen, Einstellungen).
 * - Das Tafelbild eines Arbeitsblatts (BoardPlan) ohne KI als Inhalt übernehmen.
 * - Umgekehrt: ein Tafelbild ins Arbeitsblatt übernehmen – als Tafelbild der Lehrkraft (BoardPlan,
 *   dort bearbeitbar) und auf Wunsch als Bild-Baustein auf dem Blatt (Hefteintrag/Lückentafelbild).
 */
import type { BoardFormat } from '../arbeitsblatt/didactics/boardDesign'
import type { BoardPlan, ImageBlock, Worksheet } from '../arbeitsblatt/model/types'
import { knotenText } from './layout'
import { neueId, type TbInhalt, type TbKnoten, type TbTafel } from './model'
import type { FormatId } from './formate'

/** Felder, deren Inhalt nie Unterrichtstext ist */
const UEBERGEHEN = /^(id|ids|dataUrl|image|images|bild|bilder|src|design|audio|voice|stimme|createdAt|updatedAt|savedAt|version|fileName|url|ref|citation|aiPrompt|thumbnail|logo|payload_hash|stats)$/i

/** Alle Texte eines gespeicherten Dokuments – in Reihenfolge, doppelte nur einmal, höchstens `max` Zeichen */
export function texteAus(wert: unknown, max = 8000): string {
  const gesehen = new Set<string>()
  const teile: string[] = []
  let laenge = 0
  const lauf = (v: unknown, schluessel = ''): void => {
    if (laenge > max) return
    if (typeof v === 'string') {
      const t = v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (t.length < 3 || /^data:/.test(t) || /^[a-z0-9_-]{6,}$/i.test(t) || gesehen.has(t)) return
      if (/^(true|false|null|none|lines|grid|space|mixed|de|en|fr|es)$/i.test(t)) return
      gesehen.add(t)
      teile.push(t)
      laenge += t.length + 1
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) lauf(x, schluessel)
      return
    }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!UEBERGEHEN.test(k)) lauf(x, k)
  }
  lauf(wert)
  const text = teile.join('\n')
  return text.length > max ? `${text.slice(0, max)} …` : text
}

/** Gespeichertes Material der App laden (je Programm eigene Ablage) */
export async function ladeAppMaterial(moduleId: string, id: string): Promise<{ name: string; payload: unknown }> {
  const api = window.api
  switch (moduleId) {
    case 'arbeitsblatt': {
      const w = await api.sheets.get(id)
      return { name: w.name, payload: w.payload }
    }
    case 'klassenarbeit': {
      const e = await api.exams.get(id)
      return { name: e.name, payload: e.payload }
    }
    case 'lernzielkontrolle': {
      const k = await api.kurztests.get(id)
      return { name: k.name, payload: k.payload }
    }
    case 'grammatiktest': {
      const g = await api.grammarTests.get(id)
      return { name: g.name, payload: g.payload }
    }
    case 'vokabeltest': {
      const v = await api.tests.get(id)
      return { name: v.name, payload: v.payload }
    }
    case 'tafelbild': {
      const t = await api.tafelbilder.get(id)
      return { name: t.name, payload: t.payload }
    }
    default:
      throw new Error('Dieses Material lässt sich nicht als Grundlage verwenden.')
  }
}

// ---------- Arbeitsblatt → Tafelbild ----------

/** Die Tafelbilder eines Arbeitsblatts */
export function tafelbilderDesBlatts(ws: Partial<Worksheet>): BoardPlan[] {
  if (ws.boards?.length) return ws.boards
  return ws.board ? [ws.board] : []
}

/** Ein Tafelbild des Arbeitsblatts (Bereiche mit Stichpunkten) als Inhalt – ohne KI */
export function inhaltAusBoardPlan(b: BoardPlan): TbInhalt {
  const mitte = b.sections.filter((s) => s.field !== 'links' && s.field !== 'rechts')
  const links = b.sections.filter((s) => s.field === 'links')
  const rechts = b.sections.filter((s) => s.field === 'rechts')
  const struktur = b.structure === 'zeitstrahl' ? 'zeitleiste' : b.structure === 'ursache-folge' || b.structure === 'ablauf' ? 'fluss' : b.structure === 'kreislauf' ? 'kreislauf' : b.structure === 'vergleich' || b.layout === 'columns' ? 'tabelle' : b.layout === 'cluster' || b.structure === 'mindmap' || b.structure === 'concept-map' ? 'netz' : b.layout === 'flow' ? 'fluss' : 'gliederung'
  const knoten: TbKnoten[] = mitte.map((s, i) => ({
    id: `k${i + 1}`,
    titel: s.heading,
    punkte: s.points,
    rolle: struktur === 'netz' && i === 0 ? 'zentrum' : struktur === 'tabelle' ? 'spalte' : 'aspekt',
    farbe: 'grund',
    niveau: 1,
    schritt: i + 2,
    lueckenWoerter: []
  }))
  if (!knoten.length) throw new Error('Das Tafelbild des Arbeitsblatts ist leer.')
  return {
    titel: b.title,
    struktur: struktur === 'tabelle' && knoten.length < 2 ? 'gliederung' : struktur,
    strukturGrund: b.structureReason ?? '',
    impuls: links.map((s) => [s.heading, ...s.points].join(': ')).join('\n'),
    knoten,
    beziehungen: struktur === 'fluss' ? knoten.slice(1).map((k, i) => ({ von: knoten[i].id, nach: k.id, beschriftung: '', art: 'pfeil' as const })) : [],
    merksatz: b.conclusion?.trim() || rechts.length ? { titel: 'Merke!', text: b.conclusion?.trim() || rechts.flatMap((s) => s.points).join(' '), lueckenWoerter: [] } : null,
    hausaufgabe: '',
    zeichnungen: [],
    farbLegende: [],
    schritte: b.steps.map((s, i) => ({ nr: i + 1, phase: s.phase, impuls: s.impulse }))
  }
}

// ---------- Tafelbild → Arbeitsblatt ----------

const BOARD_FORMAT: Record<FormatId, BoardFormat> = { klapptafel: 'volltafel', whiteboard: 'display', flipchart: 'mitteltafel', heft: 'heftseite' }

/** Das Tafelbild als Tafelbild-Baustein des Arbeitsblatts (BoardPlan) */
export function boardPlanAus(inhalt: TbInhalt, tafel: TbTafel): BoardPlan {
  const kaesten = tafel.elemente.filter((e) => e.typ === 'kasten' && e.knoten)
  const sektionen = kaesten.length
    ? kaesten.map((e) => ({ heading: e.titel ?? '', points: e.text.split('\n').map((z) => z.replace(/^[•\-–]\s*/, '').trim()).filter(Boolean), field: 'mitte' as const, toNotebook: true, fromTasks: '' }))
    : inhalt.knoten.map((k) => ({ heading: k.titel, points: k.punkte, field: 'mitte' as const, toNotebook: true, fromTasks: '' }))
  if (inhalt.impuls.trim()) sektionen.unshift({ heading: 'Impuls', points: [inhalt.impuls], field: 'links' as never, toNotebook: false, fromTasks: '' })
  const layout = inhalt.struktur === 'tabelle' ? 'columns' : inhalt.struktur === 'netz' ? 'cluster' : 'flow'
  const struktur = { netz: 'concept-map', tabelle: 'vergleich', fluss: 'ursache-folge', zeitleiste: 'zeitstrahl', kreislauf: 'kreislauf', gliederung: undefined, frei: undefined }[inhalt.struktur]
  return {
    title: inhalt.titel,
    layout,
    format: BOARD_FORMAT[tafel.format],
    ...(struktur ? { structure: struktur } : {}),
    ...(inhalt.strukturGrund ? { structureReason: inhalt.strukturGrund } : {}),
    sections: sektionen,
    conclusion: inhalt.merksatz?.text ?? '',
    steps: inhalt.schritte.map((s) => ({ phase: s.phase, impulse: s.impuls, expected: '' }))
  }
}

/** Arbeitsblatt um Tafelbild (und optional ein Bild auf dem ersten Blatt) ergänzen */
export function insArbeitsblatt(ws: Worksheet, plan: BoardPlan, bild?: { dataUrl: string; titel: string; luecke: boolean }): Worksheet {
  const boards = [...tafelbilderDesBlatts(ws).filter((b) => (b.format ?? 'mitteltafel') !== plan.format), plan]
  const neu: Worksheet = { ...ws, boards, board: null }
  if (bild && neu.sheets.length) {
    const block: ImageBlock = {
      id: neueId('b'),
      type: 'image',
      image: { dataUrl: bild.dataUrl, source: 'own' },
      description: `Tafelbild: ${bild.titel}`,
      caption: bild.luecke ? `Tafelbild „${bild.titel}" – Lücken ausfüllen` : `Tafelbild „${bild.titel}"`,
      widthPercent: 100
    }
    neu.sheets = neu.sheets.map((s, i) => (i === 0 ? { ...s, blocks: [...s.blocks, block] } : s))
  }
  return neu
}

/** Knoten-Text wie im Kasten – für die Übernahme in andere Programme */
export const knotenAlsText = (k: TbKnoten, stil: 'stichpunkte' | 'ausformuliert'): string => [k.titel, knotenText(k, stil)].filter(Boolean).join('\n')
