import { ageBandForGrade } from './ageBands'
import type { SeitenPlan, SeitenVorschlag, Sheet, WorksheetMeta } from '../model/types'

/**
 * Seitenzahl des Arbeitsblatts: automatisch, genau oder als Spanne.
 *
 * Wunsch der Lehrkraft (Paket 7, 25.09.2026): Die Seitenzahl ist wie die Zahl der Aufgaben
 * standardmäßig AUTOMATISCH – die KI legt sie selbst fest, passend zu Jahrgang,
 * Bearbeitungszeit und Aufgaben. Eine von Hand eingestellte Zahl gilt als Richtwert (wie
 * bisher: eine Seite mehr mit Begründung erlaubt), eine Spanne („2–3") heißt „zwischen zwei
 * und drei Seiten, nach Bedarf des Materials".
 *
 * Gespeichert in zwei Feldern, damit ältere Blätter ohne Umbau weiter gelten:
 *   `pages`    – Untergrenze bzw. genaue Zahl; 0 = automatisch
 *   `pagesBis` – Obergrenze einer Spanne (fehlt oder ≤ `pages` = genaue Zahl)
 * Ein altes Blatt mit `pages: 2` bleibt also „genau 2".
 */

type SeitenMeta = Pick<WorksheetMeta, 'pages' | 'pagesBis'>
type SchaetzMeta = SeitenMeta & Pick<WorksheetMeta, 'grade' | 'minutes' | 'taskCount'>

/** Die Vorgabe der Lehrkraft – null, wenn die KI die Seitenzahl selbst festlegt */
export function seitenVorgabe(meta: SeitenMeta): { min: number; max: number } | null {
  const min = Math.max(0, Math.round(Number(meta.pages) || 0))
  if (!min) return null
  const bis = Math.round(Number(meta.pagesBis) || 0)
  return { min, max: Math.max(min, bis) }
}

/** Die Art der Vorgabe – für die Auswahl im Formular */
export function seitenArt(meta: SeitenMeta): 'auto' | 'genau' | 'spanne' {
  const v = seitenVorgabe(meta)
  return !v ? 'auto' : v.max > v.min ? 'spanne' : 'genau'
}

/**
 * Seitenbereich für Berechnungen (Aufgaben-Richtwert, Bildbudget, Prüfungen): die Vorgabe,
 * sonst eine Schätzung aus Bearbeitungszeit (oder vorgegebener Aufgabenzahl) und dem
 * Altersband. Die Schätzung ist für die KI nur ein Anhaltspunkt, nie eine Vorgabe.
 */
export function seitenBereich(meta: SchaetzMeta): { min: number; max: number } {
  const vorgabe = seitenVorgabe(meta)
  if (vorgabe) return vorgabe
  const n = seitenSchaetzung(meta)
  return { min: n, max: n }
}

/** Geschätzte Seitenzahl ohne Vorgabe – zwischen 1 und 4 */
export function seitenSchaetzung(meta: Pick<WorksheetMeta, 'grade' | 'minutes' | 'taskCount'>): number {
  const band = ageBandForGrade(meta.grade)
  const jeSeite = (band.tasksPerPage[0] + band.tasksPerPage[1]) / 2
  const minutenJeAufgabe = (band.minutesPerTask[0] + band.minutesPerTask[1]) / 2
  const aufgaben = meta.taskCount && meta.taskCount > 0 ? meta.taskCount : (meta.minutes || 45) / minutenJeAufgabe
  return Math.min(4, Math.max(1, Math.round(aufgaben / jeSeite)))
}

/** „1 Seite", „2–3 Seiten" bzw. „etwa 2 Seiten" – für Hinweise und Prüfmeldungen */
export function seitenText(meta: SchaetzMeta): string {
  const { min, max } = seitenBereich(meta)
  const zahl = max > min ? `${min}–${max}` : String(min)
  return `${seitenVorgabe(meta) ? '' : 'etwa '}${zahl} Seite${max === 1 ? '' : 'n'}`
}

// ---------- Abweichung von der Seitenvorgabe (Paket 7, Nachtrag der Lehrkraft) ----------

/**
 * Was zählt: NUR die Seiten des eigentlichen Arbeitsblatts – Aufgaben und Material. Nicht
 * mitgezählt werden die Hilfekarten-Schlussseite, das Hilfsblatt „nützliche Ausdrücke" auf
 * eigener Seite, Bildnachweise, Deckblatt, Lösungsteil, Tafelbild und Hörtext-Skripte. In der
 * App sind das genau die Seiten, die `paginate` für das Schülerblatt plant; die Schlussseiten
 * hängt SheetPages erst danach an (render/SheetPages.tsx, `extraPages`).
 */
export const GEZAEHLTE_SEITEN = 'Aufgaben- und Materialseiten (ohne Hilfekarten, Lösungen, Tafelbild, Deckblatt und Hörtext-Skripte)'

/** Auftrag an die KI: Seitenzahl melden und eine Abweichung begründen – im selben Lauf wie das Blatt */
export function seitenPlanRegeln(meta: SeitenMeta): string {
  const v = seitenVorgabe(meta)
  if (!v)
    return 'SEITEN: Keine Seitenvorgabe. Trage in seiten.geplant die voraussichtliche Zahl der Aufgaben- und Materialseiten ein; grund und vorschlaege bleiben leer.'
  const ziel = v.max > v.min ? `${v.min}–${v.max}` : String(v.min)
  return [
    `SEITEN: Vorgabe ${ziel} Seite(n) als RICHTWERT. Gezählt werden nur ${GEZAEHLTE_SEITEN}.`,
    '- Trage in seiten.geplant ein, wie viele solche Seiten das Blatt voraussichtlich füllt.',
    '- Weicht das von der Vorgabe ab (mehr ODER weniger), weil Material oder Lernziel es verlangen: nenne in seiten.grund den Grund und in seiten.vorschlaege 1–3 Vorschläge, wie sich die Seitenzahl zur Vorgabe hin ändern ließe.',
    '- Nur Vorschläge, die dem Lernziel dienen. Zum Verringern z. B.: gleichartige Übungen zusammenlegen (zusammenlegen), Material kürzen ohne die Kernaussage zu verlieren (materialKuerzen), Hilfen auf die Hilfekarten auslagern – sie zählen nicht mit (hilfenAufKarten). Zum Erhöhen z. B.: Vertiefungsaufgabe zum Lernziel (vertiefung), Sicherungsaufgabe (sicherung), Transferaufgabe (transfer).',
    '- baustein: Index des betroffenen Bausteins in blocks, sonst -1. Ohne Abweichung bleiben grund und vorschlaege leer.'
  ].join('\n')
}

const ARTEN: SeitenVorschlag['art'][] = ['hilfenAufKarten', 'zusammenlegen', 'materialKuerzen', 'vertiefung', 'sicherung', 'transfer', 'sonstiges']

/** Die Angabe der KI übernehmen; Bausteine nennt sie nach ihrer Stelle in der Antwort (`ids`) */
export function seitenPlanAus(roh: unknown, ids: (string | undefined)[]): SeitenPlan | undefined {
  if (!roh || typeof roh !== 'object') return undefined
  const r = roh as { geplant?: unknown; grund?: unknown; vorschlaege?: unknown }
  const geplant = Math.max(0, Math.round(Number(r.geplant) || 0))
  const grund = typeof r.grund === 'string' ? r.grund.trim() : ''
  const vorschlaege: SeitenVorschlag[] = (Array.isArray(r.vorschlaege) ? r.vorschlaege : [])
    .map((v: { richtung?: unknown; art?: unknown; text?: unknown; baustein?: unknown }): SeitenVorschlag | null => {
      const text = typeof v?.text === 'string' ? v.text.trim() : ''
      if (!text) return null
      const art = ARTEN.includes(v.art as SeitenVorschlag['art']) ? (v.art as SeitenVorschlag['art']) : 'sonstiges'
      const blockId = Number.isInteger(v.baustein) ? ids[v.baustein as number] : undefined
      return { richtung: v.richtung === 'mehr' ? 'mehr' : 'weniger', art, text, ...(blockId ? { blockId } : {}) }
    })
    .filter((v: SeitenVorschlag | null): v is SeitenVorschlag => Boolean(v))
    .slice(0, 3)
  if (!geplant && !grund && !vorschlaege.length) return undefined
  return { geplant, grund, vorschlaege }
}

export interface SeitenAbweichung {
  /** Tatsächlich gesetzte Aufgaben- und Materialseiten */
  gezaehlt: number
  vorgabe: { min: number; max: number }
  /** In welche Richtung sich das Blatt ändern müsste */
  richtung: 'weniger' | 'mehr'
  /** Grund laut KI – leer, wenn sie die Abweichung nicht begründet hat */
  grund: string
  vorschlaege: SeitenVorschlag[]
}

/**
 * Hält das Blatt die Seitenvorgabe ein? Gezählt wird, was die App tatsächlich setzt – nicht,
 * was die KI angibt. So erscheint der Hinweis auch, wenn die KI die Abweichung verschweigt;
 * ihre Vorschläge werden genommen, wenn sie in die richtige Richtung gehen, sonst die
 * Faustregeln der App.
 */
export function seitenAbweichung(meta: SeitenMeta, sheet: Sheet, gezaehlt: number): SeitenAbweichung | null {
  const vorgabe = seitenVorgabe(meta)
  if (!vorgabe || gezaehlt <= 0) return null
  if (gezaehlt >= vorgabe.min && gezaehlt <= vorgabe.max) return null
  const richtung = gezaehlt > vorgabe.max ? 'weniger' : 'mehr'
  const plan = sheet.seitenPlan
  const vonKi = (plan?.vorschlaege ?? []).filter((v) => v.richtung === richtung && (!v.blockId || sheet.blocks.some((b) => b.id === v.blockId)))
  return { gezaehlt, vorgabe, richtung, grund: plan?.grund ?? '', vorschlaege: vonKi.length ? vonKi : lokaleVorschlaege(richtung, sheet) }
}

/** Wörter eines Textes – grob, nur für die Faustregel „langes Material" */
const wortzahlGrob = (s: string): number =>
  s
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

/**
 * Vorschläge der App, wenn die KI keine passenden geliefert hat.
 *
 * FAUSTREGELN, nicht belegt: Sie richten sich nach dem, was auf dem Blatt steht, und bleiben
 * beim Lernziel – kürzen ohne die Kernaussage zu verlieren, zusammenlegen statt streichen,
 * ergänzen nur mit Aufgaben, die das Lernziel vertiefen, sichern oder übertragen.
 */
export function lokaleVorschlaege(richtung: 'weniger' | 'mehr', sheet: Sheet): SeitenVorschlag[] {
  const out: SeitenVorschlag[] = []
  if (richtung === 'weniger') {
    // Hilfen zwischen den Aufgaben – als Hilfekarten stehen sie auf der Schlussseite, die nicht mitzählt
    const hilfen = sheet.blocks.filter((b) => b.type === 'scaffold' && b.variant !== 'hilfekarten')
    if (hilfen.length)
      out.push({
        richtung,
        art: 'hilfenAufKarten',
        lokal: true,
        text: `${hilfen.length === 1 ? 'Die Hilfe' : `Die ${hilfen.length} Hilfen`} zwischen den Aufgaben auf die Hilfekarten auslagern – sie zählen nicht zur Seitenzahl.`
      })
    // Faustregel: Ein Text über 250 Wörter ist der größte Hebel
    const lang = sheet.blocks
      .filter((b) => b.type === 'text')
      .map((b) => ({ b, n: wortzahlGrob((b as { body?: string }).body ?? '') }))
      .sort((a, c) => c.n - a.n)[0]
    if (lang && lang.n > 250)
      out.push({
        richtung,
        art: 'materialKuerzen',
        lokal: true,
        blockId: lang.b.id,
        text: `Den Text „${(lang.b as { title?: string }).title || 'Material'}“ (${lang.n} Wörter) kürzen, ohne die Kernaussage zu verlieren.`
      })
    // Faustregel: ab vier Aufgaben findet sich meist eine gleichartige Übung zum Zusammenlegen
    const aufgaben = sheet.blocks.filter((b) => b.type === 'task')
    if (aufgaben.length >= 4)
      out.push({
        richtung,
        art: 'zusammenlegen',
        lokal: true,
        blockId: aufgaben[aufgaben.length - 1].id,
        text: 'Zwei gleichartige Übungsaufgaben zu einer zusammenlegen, die denselben Denkschritt verlangt.'
      })
    if (!out.length) out.push({ richtung, art: 'sonstiges', lokal: true, text: 'Schreibraum (Linien, Kästchen) knapper bemessen oder ein Bild verkleinern.' })
  } else {
    out.push(
      { richtung, art: 'vertiefung', lokal: true, text: 'Eine Vertiefungsaufgabe zum Lernziel ergänzen (Anforderungsbereich III).' },
      { richtung, art: 'sicherung', lokal: true, text: 'Eine Sicherungsaufgabe am Ende ergänzen, die das Gelernte zusammenfasst.' },
      { richtung, art: 'transfer', lokal: true, text: 'Eine Transferaufgabe ergänzen, die das Gelernte auf einen neuen Fall anwendet.' }
    )
  }
  return out.slice(0, 3)
}
