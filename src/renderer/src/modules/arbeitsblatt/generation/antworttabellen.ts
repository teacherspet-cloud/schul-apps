/**
 * Leere Tabellen werden Ausfülltabellen (08.10.2026).
 *
 * Befund der Lehrkraft (Reihe „Vom Krieg zur Krise", Geschichte Kl. 9): Die KI legte die Antworttabelle einer
 * Aufgabe als MATERIAL-Tabelle an – Kopfzeile und leere Zeilen. Auf dem Blatt stand eine „M4" mit
 * fingerhohen Zeilen, in die niemand schreiben konnte, und digital ließ sie sich gar nicht ausfüllen.
 *
 * Eine Tabelle, deren Zeilen leer sind (oder nur in der ersten Spalte Vorgaben tragen), ist keine Quelle,
 * sondern ein Antwortbereich. Die App macht daraus die Antwortform „tableFill" der zugehörigen Aufgabe:
 * Schreibhöhe je Zeile nach Jahrgang (didactics/schreibraum.ts), leere Zellen als Schreibfelder
 * (`.ws-cell-empty`, im Druck wie digital ausfüllbar). Zugehörig ist die Aufgabe, die auf die Tabelle
 * verweist, sonst die direkt davor bzw. danach. Gibt es keine, entsteht eine eigene Aufgabe „Fülle die
 * Tabelle aus." – der Tabellentitel wird ihre Stellung.
 */
import type { Answer, Sheet, TableBlock, TaskBlock, TaskPart, WsBlock } from '../model/types'
import { emptyAnswer } from '../model/factory'
import { materialNummern, refOf, verschluesseleMaterialverweise, wandleTexte } from '../didactics/integrity'

/** Eine Zelle ohne Inhalt – auch „___", „…" oder „-" als Schreiblinie der KI */
export const leereZelle = (c: string | undefined): boolean => {
  const t = String(c ?? '')
    .replace(/<[^>]*>/g, '')
    .trim()
  return !t || /^[_.…\s–-]+$/.test(t)
}

/**
 * Antworttabelle: alle Zellen leer – oder nur die erste Spalte gefüllt (Kriterium | deine Antwort) und alle
 * übrigen leer. Eine Materialtabelle mit einzelnen leeren Werten bleibt Material.
 */
export function istAntworttabelle(t: TableBlock): boolean {
  const rows = t.rows.filter((r) => r.length)
  if (!rows.length) return false
  if (rows.every((r) => r.every(leereZelle))) return true
  const spalten = Math.max(t.headers.length, ...rows.map((r) => r.length))
  return spalten >= 2 && rows.every((r) => Array.from({ length: spalten - 1 }, (_, c) => r[c + 1]).every(leereZelle))
}

/** Antwortform „tableFill" aus der Tabelle: Vorgaben bleiben, leere Zellen werden Schreibfelder */
export function ausfuellAntwort(t: TableBlock): Answer {
  const spalten = Math.max(t.headers.length, ...t.rows.map((r) => r.length), 1)
  const rows = t.rows.filter((r) => r.length).map((r) => Array.from({ length: spalten }, (_, c) => (leereZelle(r[c]) ? '' : String(r[c]))))
  return {
    ...emptyAnswer('tableFill'),
    headers: Array.from({ length: spalten }, (_, c) => t.headers[c] ?? ''),
    rows,
    solutionRows: rows.map((r) => r.map(() => '')),
    ...(t.colWidths?.length === spalten ? { colWidths: t.colWidths } : {}),
    ...(t.headerHeightMm ? { headerHeightMm: t.headerHeightMm } : {})
  }
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Verweis auf die Tabelle in Texten anpassen: Sie ist jetzt Teil der Aufgabe, kein Material mehr */
function ohneTabellenVerweis(text: string, verweise: string[]): string {
  let s = text
  for (const v of verweise) {
    if (!s.includes(v)) continue
    const r = esc(v)
    s = s
      .replace(new RegExp(String.raw`\s*\(\s*(?:siehe|vgl\.|s\.)?\s*${r}\s*\)`, 'g'), '')
      .replace(new RegExp(String.raw`(Tabelle|Übersicht|Raster)\s+${r}`, 'g'), '$1')
      .replace(new RegExp(String.raw`(?<![\p{L}])${r}(?![\p{L}\d}])`, 'gu'), 'die Tabelle')
  }
  return s.replace(/ {2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1')
}

/** Texte einer Aufgabe, in denen ein Verweis stehen kann */
const aufgabenText = (t: TaskBlock): string => [t.instruction, t.brief?.situation ?? '', ...t.parts.map((p) => p.instruction)].join('\n')

const FREI = new Set<Answer['kind']>(['lines', 'space', 'none'])

/**
 * Wandelt die Antworttabellen eines Blattes um. Liefert dasselbe Blatt, wenn es keine gibt.
 * `warnungen`: je umgewandelter Tabelle eine Zeile für die Lehrkraft.
 */
export function tabellenZumAusfuellen(sheet: Sheet): { sheet: Sheet; warnungen: string[] } {
  const tabellen = sheet.blocks.filter((b): b is TableBlock => b.type === 'table' && !b.nurLoesung && !b.free && istAntworttabelle(b))
  if (!tabellen.length) return { sheet, warnungen: [] }
  // Gespeichert werden Kennungen „M{…}" – Nummern, die noch im Text stehen, vorher umwandeln (die Nummern verschieben sich)
  let blocks: WsBlock[] = verschluesseleMaterialverweise(sheet.blocks)
  const nummern = materialNummern(blocks)
  const warnungen: string[] = []

  for (const t of tabellen) {
    const verweise = [`M{${refOf(t)}}`, ...(nummern.get(t.id) ? [nummern.get(t.id)!] : [])]
    const nennt = (b: WsBlock): boolean =>
      b.type === 'task' && verweise.some((v) => (v.startsWith('M{') ? aufgabenText(b).includes(v) : new RegExp(String.raw`\b${esc(v)}\b`).test(aufgabenText(b))))
    const i = blocks.findIndex((b) => b.id === t.id)
    // Zugehörige Aufgabe: die verweisende (die nächste davor zuerst), sonst die direkt davor (Hilfen dazwischen erlaubt), sonst direkt danach
    const verweisend = blocks
      .map((b, k) => ({ b, k }))
      .filter(({ b }) => nennt(b))
      .sort((a, b) => (a.k < i ? i - a.k : 1000 + a.k - i) - (b.k < i ? i - b.k : 1000 + b.k - i))[0]
    let k = i - 1
    while (k >= 0 && (blocks[k].type === 'scaffold' || blocks[k].type === 'phrases')) k--
    const davor = k >= 0 && blocks[k].type === 'task' ? k : -1
    const danach = blocks[i + 1]?.type === 'task' ? i + 1 : -1
    const ziel = verweisend?.k ?? (davor >= 0 ? davor : danach)
    const aufgabe = ziel >= 0 ? (blocks[ziel] as TaskBlock) : undefined
    // Welche Antwortstelle: die Teilaufgabe, die die Tabelle nennt, sonst die letzte; ohne Teilaufgaben die Aufgabe selbst
    const teil: TaskPart | undefined = aufgabe?.parts.length
      ? (aufgabe.parts.find((p) => verweise.some((v) => p.instruction.includes(v))) ?? aufgabe.parts[aufgabe.parts.length - 1])
      : undefined
    const stelle = teil ?? aufgabe
    const titel = t.title.replace(/^\s*[MQB]\s?\d+\s*[:.–-]?\s*/, '').trim()

    if (aufgabe && stelle && FREI.has(stelle.answer.kind)) {
      const antwort = ausfuellAntwort(t)
      const warnung = `Die leere Tabelle${titel ? ` „${titel}"` : ''} ist jetzt die Ausfülltabelle der Aufgabe (Schreibhöhe je Zeile, digital ausfüllbar).`
      const neu: TaskBlock = {
        ...(teil ? { ...aufgabe, parts: aufgabe.parts.map((p) => (p === teil ? { ...p, answer: antwort } : p)) } : { ...aufgabe, answer: antwort }),
        warnings: [...(aufgabe.warnings ?? []), warnung]
      }
      blocks[ziel] = neu
      blocks.splice(i, 1)
      warnungen.push(warnung)
    } else {
      // Keine passende Aufgabe: eigene Aufgabe mit der Tabelle als Antwortform – an der Stelle der Tabelle
      const eigene: TaskBlock = {
        id: t.id,
        type: 'task',
        instruction: titel ? `Fülle die Tabelle „${titel}" aus.` : 'Fülle die Tabelle aus.',
        operator: '',
        afbReason: '',
        socialForm: 'EA',
        answer: ausfuellAntwort(t),
        parts: [],
        solution: '',
        points: 0,
        minutes: 5,
        ...(t.stars ? { stars: t.stars } : {}),
        ...(t.seitenFormat ? { seitenFormat: t.seitenFormat } : {}),
        warnings: ['Aus einer leeren Tabelle wurde eine Aufgabe zum Ausfüllen – Stellung bitte prüfen.']
      }
      blocks[i] = eigene
      warnungen.push(`Die leere Tabelle${titel ? ` „${titel}"` : ''} ist jetzt eine eigene Aufgabe zum Ausfüllen.`)
    }
    // Verweise auf die frühere „M4" zeigen jetzt auf „die Tabelle"
    blocks = blocks.map((b) => wandleTexte(b, (s) => ohneTabellenVerweis(s, verweise.filter((v) => v.startsWith('M{')))) as WsBlock)
  }
  return { sheet: { ...sheet, blocks }, warnungen }
}
