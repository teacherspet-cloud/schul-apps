/**
 * Schreibraum der Antwortflächen (02.10.2026).
 *
 * Befund der Lehrkraft: „Die Antwortfelder sind oft viel zu klein für die Notizen der Lernenden."
 * Entscheidung der Lehrkraft: „Regeln + KI-Prüfung" – die App setzt die Maße nach Regeln
 * (Jahrgang, Förderbedarf, erwartete Lösung), und die ohnehin laufende KI-Prüfrunde des Blattes
 * beurteilt zusätzlich, ob der Platz zur Funktion passt, und vergrößert (kein eigener KI-Auftrag).
 * Von Hand gezogene Maße gehen immer vor – sie stehen im Modell und werden hier nie überschrieben.
 *
 * Belegt (Recherche 02.10.2026): Lineaturen der Schulhefte (siehe `linienAbstandMm` in
 * ageBands.ts); Leitfäden (zebis 2022, LehrkräftePlus NRW) nennen „zu wenig Platz in Lücken und
 * auf Linien" als Hauptfehler; Nachteilsausgleich bei LRS: größere Linien, mehr Schreibraum.
 * Faustregeln aus Recherche 02.10.2026: Zellhöhe = Linienabstand + 2–3 mm Polster; Buchstaben-
 * breite der Handschrift GS 4–5 mm, Sek I 3–3,5 mm, Sek II 2,5–3 mm; ein Wort braucht eine Zelle
 * von mindestens 30 mm (GS 45 mm) und nie weniger als die Lösung + 50 %; Stichpunkte eine Linie je
 * Punkt + 1 Reserve; Sätze nach Länge + 25 %; Begründung Sek I ≥ 4–5, Sek II 5–8 Linien. Ein Satz
 * braucht in einer Zelle mehr Zeilen (Höhe), nicht mehr Breite.
 */
import { FOERDERSCHULE_ID } from '@shared/schulformen'
import { plainText } from '../../../shared/richtext/parse'
import type { Answer, Sheet, TaskBlock, WorksheetMeta } from '../model/types'
import { MIN_SPALTE_PROZENT, MIN_ZEILE_MM, spaltenZahl, zeilenHoehe } from '../render/tabelleMasse'
import { ageBandForGrade, linienAbstandMm } from './ageBands'
import { needsLargeType, type LanguageMode } from './language'

export interface SchreibRegel {
  grade: number
  foerder: boolean
  /** Abstand einer Schreiblinie in mm */
  linieMm: number
  /** Polster einer Tabellenzelle oben + unten in mm */
  polsterMm: number
  /** Mindesthöhe einer Ausfüllzelle mit einer Zeile */
  zelleMm: number
  mmProBuchstabe: number
  zeilenProSatz: number
  begruendungZeilen: number
  /** Mindestbreite einer Zelle für ein einzelnes Wort */
  minWortZelleMm: number
}

/**
 * Rückfall für den Abstand der gedruckten Schreiblinien (ws.css `var(--ws-linie, 8.5mm)`), wenn
 * keine Lerngruppe bekannt ist. Seit 02.10.2026 folgen die Linien dem Jahrgang: `linieMmFuerMeta`
 * setzt PageFrame als `--ws-linie` auf die Seite, dieselbe Zahl rechnet SheetPages beim Auffüllen,
 * blockview beim Teilen des Schreibraums und der Word-Export.
 */
export const LINIE_GEDRUCKT_MM = 8.5

/** Breite einer Ausfülltabelle in der Aufgabe, wenn nichts anderes bekannt ist (Satzspiegel 170 mm minus Einzug) */
export const TABELLE_BREITE_MM = 160

/**
 * Förderbedarf: Förderschule (Förderschwerpunkt Lernen) – die Bezeichnungen der Länder enthalten
 * „Förderschwerpunkt", „Förderzentrum", „Förderschule" oder „SBBZ". Die hessische „Förderstufe"
 * (Kl. 5–6 aller Schulformen) ist KEIN Förderbedarf, deshalb kein bloßes „Förder".
 */
export const hatFoerderbedarf = (m: { schoolTypeId?: string; schoolTypeName?: string; languageMode?: LanguageMode }): boolean =>
  m.schoolTypeId === FOERDERSCHULE_ID ||
  /Förderschwerpunkt|Förderschule|Förderzentrum|SBBZ/i.test(m.schoolTypeName ?? '') ||
  // Einfache/Leichte Sprache und DaZ-Anfänger: wie die große Schrift im Profil (didactics/profile.ts) auch größere Linien
  Boolean(m.languageMode && needsLargeType(m.languageMode))

export function schreibRegel(grade: number, foerder = false): SchreibRegel {
  const g = Number.isFinite(grade) && grade > 0 ? grade : 7
  const band = ageBandForGrade(g)
  const linieMm = linienAbstandMm(g, foerder)
  // Oberstufe: knapperes Polster (Faustregel: Sek II ~10 mm Zellhöhe)
  const polsterMm = g >= 11 && !foerder ? 1.5 : 2.5
  // Mit Förderbedarf eine Stufe größer – auch die Schrift braucht mehr Breite
  const mmProBuchstabe = foerder ? Math.round(band.schreibraum.mmProBuchstabe * 1.15 * 100) / 100 : band.schreibraum.mmProBuchstabe
  return {
    grade: g,
    foerder,
    linieMm,
    polsterMm,
    zelleMm: linieMm + polsterMm,
    mmProBuchstabe,
    zeilenProSatz: band.schreibraum.zeilenProSatz,
    begruendungZeilen: band.schreibraum.begruendungZeilen,
    minWortZelleMm: g <= 4 || foerder ? 45 : 30
  }
}

export const schreibRegelFuerMeta = (meta: Pick<WorksheetMeta, 'grade' | 'schoolTypeId' | 'schoolTypeName'> & { languageMode?: LanguageMode }): SchreibRegel =>
  schreibRegel(meta.grade, hatFoerderbedarf(meta))

/** Abstand der gedruckten Schreiblinien dieses Blattes in mm (02.10.2026) */
export const linieMmFuerMeta = (meta: Parameters<typeof schreibRegelFuerMeta>[0] | undefined): number =>
  meta ? schreibRegelFuerMeta(meta).linieMm : LINIE_GEDRUCKT_MM

export type LoesungsArt = 'leer' | 'wort' | 'stichpunkte' | 'saetze'

export interface LoesungsForm {
  art: LoesungsArt
  zeichen: number
  woerter: number
  /** Stichpunkte: Länge (Zeichen) je Punkt */
  punkte: number[]
  saetze: number
  laengstesWort: number
}

/** Welche Form hat die erwartete Lösung: ein Wort, Stichpunkte oder ganze Sätze? */
export function loesungsForm(loesung: string): LoesungsForm {
  const text = plainText(loesung ?? '')
    .replace(/\s+\n/g, '\n')
    .trim()
  const woerter = text ? text.split(/\s+/).filter(Boolean) : []
  const laengstesWort = woerter.reduce((m, w) => Math.max(m, w.replace(/[.,;:!?()„“"]/g, '').length), 0)
  const basis = { zeichen: text.length, woerter: woerter.length, laengstesWort }
  if (!text) return { art: 'leer', punkte: [], saetze: 0, ...basis }
  const saetze = (text.match(/[.!?](\s|$)/g) ?? []).length
  // Stichpunkte: Zeilen, Listenpunkte, Semikolons – oder kurze Glieder mit Komma ohne Satzende
  const zeilen = text
    .split(/\n|;|•/)
    .map((s) => s.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
  const kommaGlieder = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (zeilen.length > 1) return { art: 'stichpunkte', punkte: zeilen.map((z) => z.length), saetze, ...basis }
  if (!saetze && kommaGlieder.length > 1 && kommaGlieder.every((g) => g.split(/\s+/).length <= 3))
    return { art: 'stichpunkte', punkte: kommaGlieder.map((z) => z.length), saetze, ...basis }
  if (woerter.length <= 3 && saetze <= 1) return { art: 'wort', punkte: [], saetze, ...basis }
  return { art: 'saetze', punkte: [], saetze: Math.max(1, saetze), ...basis }
}

/** Wie viele Schreibzeilen braucht eine Zelle dieser Breite für die erwartete Lösung? */
export function zellenZeilen(loesung: string, breiteMm: number, regel: SchreibRegel): number {
  const f = loesungsForm(loesung)
  // Buchstaben je Zeile – 4 mm gehen ans Zellpolster links und rechts
  const proZeile = Math.max(4, (breiteMm - 4) / regel.mmProBuchstabe)
  const zeilen = (zeichen: number, faktor: number): number => Math.max(1, Math.ceil((zeichen * faktor) / proZeile))
  let n = 1
  if (f.art === 'wort') n = zeilen(f.zeichen, 1.5)
  else if (f.art === 'stichpunkte') n = f.punkte.reduce((s, p) => s + zeilen(p, 1.25), 0) + 1
  else if (f.art === 'saetze') n = Math.max(zeilen(f.zeichen, 1.25), Math.ceil(f.saetze * regel.zeilenProSatz))
  return Math.min(12, n)
}

/** Mindesthöhe einer Ausfüllzelle (mm) für die erwartete Lösung */
export const zellenHoeheMm = (loesung: string, breiteMm: number, regel: SchreibRegel): number =>
  zeilenHoehe(zellenZeilen(loesung, breiteMm, regel) * regel.linieMm + regel.polsterMm)

/** Gewünschte Breite (mm) einer Spalte: Vorgaben gedruckt, Ausfüllzellen von Hand geschrieben */
function spaltenBedarfMm(answer: Answer, c: number, regel: SchreibRegel): { mm: number; schreiben: boolean } {
  let druck = 12
  let schreib = 0
  const gedruckt = (t: string): void => {
    const f = loesungsForm(t)
    // Druckschrift ~2 mm je Zeichen; der Text darf auf zwei Zeilen umbrechen, nie mitten im Wort
    druck = Math.max(druck, Math.min(70, Math.max(f.laengstesWort * 2, f.zeichen) + 4))
  }
  if (answer.headers[c]) gedruckt(answer.headers[c])
  answer.rows.forEach((row, r) => {
    const zelle = row[c] ?? ''
    if (zelle.trim()) return gedruckt(zelle)
    const f = loesungsForm(answer.solutionRows[r]?.[c] ?? '')
    const wort = f.art === 'wort' ? f.zeichen * 1.5 * regel.mmProBuchstabe + 4 : f.laengstesWort * 1.2 * regel.mmProBuchstabe + 4
    // Längere Antworten: so breit, dass sie in zwei bis drei Zeilen passen – höchstens 80 mm
    const lang = f.art === 'saetze' || f.art === 'stichpunkte' ? Math.min(80, (f.zeichen * regel.mmProBuchstabe) / 3) : 0
    schreib = Math.max(schreib, regel.minWortZelleMm, wort, lang)
  })
  return schreib ? { mm: Math.max(druck, schreib), schreiben: true } : { mm: druck, schreiben: false }
}

/** Spaltenbreiten (Prozent, Summe 100) einer Ausfülltabelle nach Regel */
export function regelSpalten(answer: Answer, breiteMm: number, regel: SchreibRegel): number[] {
  const n = spaltenZahl(answer)
  const bedarf = Array.from({ length: n }, (_, c) => spaltenBedarfMm(answer, c, regel))
  const summe = bedarf.reduce((s, b) => s + b.mm, 0)
  let mm = bedarf.map((b) => b.mm)
  if (summe < breiteMm) {
    // Der Überschuss geht an die Schreibspalten – dort wird er gebraucht
    const ziel = bedarf.some((b) => b.schreiben) ? bedarf.map((b) => b.schreiben) : bedarf.map(() => true)
    const zielSumme = bedarf.reduce((s, b, c) => s + (ziel[c] ? b.mm : 0), 0)
    mm = bedarf.map((b, c) => (ziel[c] ? b.mm + ((breiteMm - summe) * b.mm) / zielSumme : b.mm))
  }
  return prozentNormieren(mm)
}

/** Auf Summe 100 bringen, keine Spalte schmaler als das Minimum, auf eine Nachkommastelle */
export function prozentNormieren(werte: number[]): number[] {
  const summe = werte.reduce((s, w) => s + Math.max(0, w), 0) || 1
  let p = werte.map((w) => (Math.max(0, w) / summe) * 100)
  const klein = p.map((w) => w < MIN_SPALTE_PROZENT)
  if (klein.some(Boolean) && !klein.every(Boolean)) {
    const rest = 100 - klein.filter(Boolean).length * MIN_SPALTE_PROZENT
    const grossSumme = p.reduce((s, w, i) => s + (klein[i] ? 0 : w), 0)
    p = p.map((w, i) => (klein[i] ? MIN_SPALTE_PROZENT : (w / grossSumme) * rest))
  }
  return p.map((w) => Math.round(w * 10) / 10)
}

export interface AntwortTabellenMasse {
  colWidths: number[]
  rowHeightsMm: number[]
  headerHeightMm: number
}

/**
 * Die Maße einer Ausfülltabelle: von Hand Gezogenes (Modell) vor KI-Vorschlag (`cellHeightMm`)
 * vor Regel. Die Mindesthöhe gilt nur für Zeilen mit Ausfüllzellen – Zeilen mit lauter Vorgaben
 * bleiben so hoch wie ihr Inhalt.
 */
export function antwortTabellenMasse(answer: Answer, regel: SchreibRegel, breiteMm = TABELLE_BREITE_MM): AntwortTabellenMasse {
  const n = spaltenZahl(answer)
  const eigene = answer.colWidths
  const colWidths = eigene?.length === n && eigene.every((w) => Number.isFinite(w) && w > 0) ? prozentNormieren(eigene) : regelSpalten(answer, breiteMm, regel)
  const rowHeightsMm = answer.rows.map((row, r) => {
    const hand = answer.rowHeightsMm?.[r] ?? 0
    if (hand > 0) return hand
    const leer = Array.from({ length: n }, (_, c) => c).filter((c) => !(row[c] ?? '').trim())
    if (!leer.length) return 0
    const regelHoehe = Math.max(...leer.map((c) => zellenHoeheMm(answer.solutionRows[r]?.[c] ?? '', (breiteMm * colWidths[c]) / 100, regel)))
    return Math.max(regelHoehe, answer.cellHeightMm && answer.cellHeightMm >= MIN_ZEILE_MM ? answer.cellHeightMm : 0)
  })
  return { colWidths, rowHeightsMm, headerHeightMm: answer.headerHeightMm ?? 0 }
}

/* ---------- Schreiblinien nach Regel */

const BEGRUENDEN = /begründ|erläuter|beurteil|bewert|erörter|diskutier|stellung|interpretier|justify|explain|evaluate|discuss/i

/**
 * Mindestzahl der Schreiblinien für eine Antwort mit Linien. Grundlage ist die Musterlösung in
 * Schülerform, sonst die Lösung; Wörter je Linie aus der Buchstabenbreite (6 Zeichen je Wort mit
 * Leerzeichen) + 25 % Reserve, für Begründungen mindestens die Linienzahl des Altersbands.
 * Höchstens 15 Linien – mehr ist eine Schreibaufgabe mit eigenem Umfang.
 */
export function regelLinien(loesung: string, operator: string, regel: SchreibRegel, linienBreiteMm = TABELLE_BREITE_MM): number {
  const f = loesungsForm(loesung)
  const woerterProLinie = linienBreiteMm / regel.mmProBuchstabe / 6
  let n = f.art === 'leer' ? 1 : f.art === 'stichpunkte' ? f.punkte.length + 1 : Math.ceil((f.woerter / woerterProLinie) * 1.25)
  if (f.art === 'saetze') n = Math.max(n, Math.ceil(f.saetze * regel.zeilenProSatz) + 1)
  if (BEGRUENDEN.test(operator ?? '')) n = Math.max(n, regel.begruendungZeilen)
  return Math.max(1, Math.min(15, n))
}

/* ---------- KI-Prüfung: Übersicht für den Prompt und Anwenden der Vorschläge */

/** Ein Vorschlag der Prüfrunde für eine Antwortfläche (schemas.ts: REVIEW_SCHEMA.answerSpace) */
export interface AntwortRaumVorschlag {
  blockNumber: number
  /** 0 = Antwort der Aufgabe, 1 = Teilaufgabe a, 2 = b … */
  part: number
  /** lines: nötige Linienzahl; tableFill: Zeilen je Ausfüllzelle; 0 = passt */
  lines: number
  /** tableFill/space: Mindesthöhe in mm; 0 = passt */
  cellHeightMm: number
  /** tableFill: Spaltenbreiten in Prozent; leer = passt */
  colWidths: number[]
  reason: string
}

const teile = (b: TaskBlock): { part: number; answer: Answer; solution: string; model?: string }[] =>
  b.parts.length
    ? b.parts.map((p, i) => ({ part: i + 1, answer: p.answer, solution: p.solution, model: p.modelAnswer }))
    : [{ part: 0, answer: b.answer, solution: b.solution, model: b.modelAnswer }]

/** Die Richtwerte als Satz für Prompts (Prüfrunde, Erzeugung) */
export function schreibraumRichtwerte(regel: SchreibRegel): string {
  const mm = (x: number): string => String(Math.round(x * 10) / 10).replace('.', ',')
  return [
    `Richtwerte Schreibraum für Klasse ${regel.grade}${regel.foerder ? ' mit Förderbedarf' : ''}:`,
    `Linienabstand ${mm(regel.linieMm)} mm, Ausfüllzelle mindestens ${mm(regel.zelleMm)} mm hoch,`,
    `Zelle für ein Wort mindestens ${regel.minWortZelleMm} mm breit (und nie kürzer als die Lösung + 50 %), je Buchstabe ${mm(
      regel.mmProBuchstabe
    )} mm Handschrift,`,
    `Stichpunkte eine Linie je erwartetem Punkt + 1 Reserve, ganze Sätze ${mm(regel.zeilenProSatz)} Linien je Satz + 1 Reserve,`,
    `Begründung mindestens ${regel.begruendungZeilen} Linien. Ein Satz braucht in einer Zelle mehr Zeilen (Höhe), nicht mehr Breite.`
  ].join(' ')
}

/** Kurze Übersicht der Antwortflächen mit ihren aktuellen Maßen – für die Prüfrunde */
export function antwortRaumUebersicht(sheet: Sheet, regel: SchreibRegel, breiteMm = TABELLE_BREITE_MM): string {
  const zeilen: string[] = []
  sheet.blocks.forEach((b, i) => {
    if (b.type !== 'task') return
    for (const t of teile(b)) {
      const a = t.answer
      const wo = `(${i + 1})${t.part ? ` Teil ${t.part}` : ''}`
      if (a.kind === 'lines') {
        const soll = regelLinien(t.model || t.solution, b.operator, regel)
        zeilen.push(`${wo} Schreiblinien: ${a.count} × ${regel.linieMm} mm (App-Richtwert nach Lösung: ${soll})`)
      } else if (a.kind === 'space') zeilen.push(`${wo} freie Fläche: ${a.heightMm} mm hoch`)
      else if (a.kind === 'tableFill') {
        const m = antwortTabellenMasse(a, regel, breiteMm)
        const hoehen = m.rowHeightsMm.filter((h) => h > 0)
        zeilen.push(
          `${wo} Ausfülltabelle, ${m.colWidths.length} Spalten (${m.colWidths.map((w) => `${Math.round(w)} %`).join(' / ')} von ${breiteMm} mm),` +
            ` Ausfüllzeilen ${hoehen.length ? `${Math.min(...hoehen)}–${Math.max(...hoehen)} mm` : 'ohne'} hoch`
        )
      }
    }
  })
  return zeilen.length ? `AKTUELLE ANTWORTFLÄCHEN (Baustein, Teil, Maße):\n${zeilen.join('\n')}` : ''
}

/**
 * Wendet Regel und Vorschläge der Prüfrunde an – NUR vergrößern, nie verkleinern, und nie über
 * Maße, die schon im Modell stehen (von Hand gezogen). Ein Vorschlag, der nicht zur Antwortform
 * passt (z. B. Spaltenzahl stimmt nicht mehr, weil der Baustein nachgebessert wurde), fällt weg.
 * Liefert ein neues Blatt; geänderte Bausteine tragen einen Hinweis für die Lehrkraft.
 */
export function antwortRaumAnwenden(sheet: Sheet, vorschlaege: AntwortRaumVorschlag[] | undefined, regel: SchreibRegel): Sheet {
  const blocks = sheet.blocks.map((b) => b)
  const hinweis = new Map<number, string[]>()
  const merken = (i: number, text: string): void => {
    hinweis.set(i, [...(hinweis.get(i) ?? []), text])
  }
  const kopie = (i: number): TaskBlock => {
    if (blocks[i] === sheet.blocks[i]) blocks[i] = structuredClone(sheet.blocks[i])
    return blocks[i] as TaskBlock
  }
  const antwort = (b: TaskBlock, part: number): Answer | undefined => (part > 0 ? b.parts[part - 1]?.answer : b.parts.length ? undefined : b.answer)

  // 1. Regel: Schreiblinien nach erwarteter Lösung (höchstens verdoppeln – die Lösung der Lehrkraft ist oft ausführlicher als die Schülerantwort)
  sheet.blocks.forEach((b, i) => {
    if (b.type !== 'task' || b.brief) return
    for (const t of teile(b)) {
      if (t.answer.kind !== 'lines') continue
      const soll = Math.min(Math.max(1, t.answer.count) * 2, regelLinien(t.model || t.solution, b.operator, regel))
      if (soll > t.answer.count) {
        const a = antwort(kopie(i), t.part)
        if (a) a.count = soll
      }
    }
  })

  // 2. Vorschläge der Prüfrunde
  for (const v of Array.isArray(vorschlaege) ? vorschlaege : []) {
    const i = Math.round(Number(v?.blockNumber)) - 1
    if (!(i >= 0 && i < blocks.length) || blocks[i].type !== 'task') continue
    const vorher = antwort(blocks[i] as TaskBlock, Math.max(0, Math.round(Number(v.part) || 0)))
    if (!vorher) continue
    const lines = Math.max(0, Math.round(Number(v.lines) || 0))
    const hoehe = Math.max(0, Number(v.cellHeightMm) || 0)
    const grund = String(v.reason ?? '').trim()
    let geaendert = false
    const a = (): Answer => antwort(kopie(i), Math.max(0, Math.round(Number(v.part) || 0)))!
    if (vorher.kind === 'lines' && lines > vorher.count) {
      a().count = Math.min(30, lines)
      geaendert = true
    } else if (vorher.kind === 'space') {
      const soll = Math.max(hoehe, lines * regel.linieMm)
      if (soll > vorher.heightMm) {
        a().heightMm = Math.min(250, Math.round(soll))
        geaendert = true
      }
    } else if (vorher.kind === 'tableFill') {
      const soll = zeilenHoehe(Math.max(hoehe, lines ? lines * regel.linieMm + regel.polsterMm : 0))
      if (soll > (vorher.cellHeightMm ?? 0)) {
        a().cellHeightMm = Math.min(80, soll)
        geaendert = true
      }
      const n = spaltenZahl(vorher)
      const w = Array.isArray(v.colWidths) ? v.colWidths.map(Number) : []
      if (!vorher.colWidths?.length && w.length === n && n > 1 && w.every((x) => Number.isFinite(x) && x > 0)) {
        a().colWidths = prozentNormieren(w)
        geaendert = true
      }
    }
    if (geaendert) merken(i, grund)
  }
  for (const [i, gruende] of hinweis) {
    const text = gruende.filter(Boolean).join(' ')
    blocks[i] = { ...blocks[i], warnings: [...(blocks[i].warnings ?? []), `[Schreibraum] Antwortfläche vergrößert${text ? `: ${text}` : ''}`] }
  }
  return blocks.every((b, i) => b === sheet.blocks[i]) ? sheet : { ...sheet, blocks }
}
