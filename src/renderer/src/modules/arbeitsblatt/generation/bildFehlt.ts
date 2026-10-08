/**
 * Bilder, die nach Suche, Archiv-Durchgang und KI-Bild noch fehlen, verlassen das erzeugte Blatt (08.10.2026).
 *
 * Befund der Lehrkraft (Reihe „Vom Krieg zur Krise", Geschichte Kl. 9): Auf dem Schülerblatt stand ein
 * gestrichelter Kasten mit dem Suchauftrag der KI – und eine Aufgabe „Beschreibe M3", obwohl M3 leer war. Ein
 * Blatt mit leerem Material ist für die Lernenden unbrauchbar; deshalb nimmt die App den Bild-Baustein heraus
 * und passt die Aufgaben an, OHNE KI und nachvollziehbar:
 *
 * - „M1 und M3", „M3, M1", „(M3)" → nur noch der Verweis auf das vorhandene Material;
 * - eine Teilaufgabe, die danach noch das fehlende Bild verlangt, entfällt;
 * - eine Aufgabe, deren Stellung das Bild verlangt (oder deren Teilaufgaben alle entfallen), entfällt ganz –
 *   samt den Hilfen, die zu ihr gehören; Verweise „Aufgabe 4" anderer Bausteine werden umgezählt;
 * - jede Anpassung steht als „Bild fehlt – Aufgabe angepasst" an der Aufgabe bzw. im Lehrkraft-Hinweis.
 *
 * Im Editor lässt sich jederzeit ein neuer Bild-Baustein einfügen („Bild fehlt" mit „Bild suchen").
 */
import type { ImageBlock, Sheet, TaskBlock, Worksheet, WsBlock } from '../model/types'
import { refOf, verschluesseleMaterialverweise, wandleTexte } from '../didactics/integrity'
import { hilfenZuordnung, verweiseUmschreiben } from '../didactics/aufgabenVerweise'

export const BILD_FEHLT = 'Bild fehlt – Aufgabe angepasst'

export interface BildEntfernung {
  /** Herausgenommene Bild-Bausteine (ganze Bildreihen ohne jedes Bild eingeschlossen) */
  entfernt: number
  /** Aufgaben mit geändertem Text oder weniger Teilaufgaben */
  angepasst: number
  /** Ganz entfallene Aufgaben */
  gestrichen: number
  /** Zeilen für den Lehrkraft-Hinweis */
  hinweise: string[]
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Ein anderer Materialverweis: gespeichert „M{karte}" oder sichtbar „M2"/„Q1"/„B3" */
const ANDERER = String.raw`(?:M\{[^}\s]+\}|\b[MQB]\d+\b)`
const VERBINDER = String.raw`\s*(?:,|und|sowie|&|/)\s*`

/** Verweise auf `ref` in Aufzählungen und Klammern entfernen – ein allein stehender Verweis bleibt stehen */
export function ohneBildVerweis(text: string, ref: string): string {
  const r = esc(`M{${ref}}`)
  if (!text.includes(`M{${ref}}`)) return text
  return (
    text
      // „(M3)", „(siehe M3)", „(vgl. M3)"
      .replace(new RegExp(String.raw`\s*\(\s*(?:siehe|vgl\.|s\.)?\s*${r}\s*\)`, 'g'), '')
      // „M1 und M3" → „M1"
      .replace(new RegExp(String.raw`(${ANDERER})${VERBINDER}${r}`, 'g'), '$1')
      // „M3 und M1" → „M1"
      .replace(new RegExp(String.raw`${r}${VERBINDER}(?=${ANDERER})`, 'g'), '')
      .replace(/ {2,}/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
  )
}

const enthaelt = (text: string | undefined, ref: string): boolean => Boolean(text?.includes(`M{${ref}}`))

/** Bildunterschrift ohne Materialnummer – für die Hinweise */
const bildName = (b: ImageBlock): string => (b.caption || b.description || 'Bild').replace(/^\s*[MQB]\s?\d+\s*[:.–-]?\s*/, '').slice(0, 60)

/** Kurzname einer Aufgabe für den Hinweis */
const aufgabenName = (t: TaskBlock, nr: number): string => `Aufgabe ${nr}${t.operator ? ` (${t.operator})` : ''}`

/**
 * Nimmt Bild-Bausteine ohne Bild aus einem Blatt und passt die Aufgaben an. Bildreihen verlieren nur ihre leeren
 * Einzelbilder; ohne jedes Bild fällt auch die Reihe weg. Liefert das neue Blatt (ohne Änderung: dasselbe).
 */
export function blattOhneFehlendeBilder(sheet: Sheet): { sheet: Sheet; bericht: BildEntfernung } {
  const bericht: BildEntfernung = { entfernt: 0, angepasst: 0, gestrichen: 0, hinweise: [] }
  const fehlend = (b: WsBlock): b is ImageBlock => b.type === 'image' && (b.items?.length ? b.items.every((it) => !it.image) : !b.image)
  const teilweise = (b: WsBlock): b is ImageBlock => b.type === 'image' && Boolean(b.items?.length) && b.items!.some((it) => !it.image) && !fehlend(b)
  if (!sheet.blocks.some((b) => fehlend(b) || teilweise(b))) return { sheet, bericht }

  // Gespeichert werden Kennungen: „M3", wie die KI es trotzdem schreibt, wird vorher zu „M{kennung}"
  let blocks: WsBlock[] = verschluesseleMaterialverweise(sheet.blocks)

  // Bildreihen mit einzelnen Lücken: nur die gefundenen Bilder bleiben
  blocks = blocks.map((b) => {
    if (!teilweise(b)) return b
    const weg = b.items!.filter((it) => !it.image).length
    return {
      ...b,
      items: b.items!.filter((it) => it.image),
      warnings: [...(b.warnings ?? []), `Bild fehlt: ${weg} Einzelbild(er) ohne passendes Bild wurden aus der Bildreihe genommen.`]
    }
  })

  const weg = blocks.filter(fehlend)
  if (!weg.length) return { sheet: { ...sheet, blocks }, bericht }
  bericht.entfernt = weg.length

  // Aufgabennummern VOR dem Herausnehmen (für Hilfen und Verweise „Aufgabe 4")
  const alteNummer = new Map<string, number>()
  let n = 0
  for (const b of blocks) if (b.type === 'task') alteNummer.set(b.id, ++n)
  const hilfen = hilfenZuordnung({ blocks })

  const gestrichen = new Set<string>()
  const fehlendeIds = new Set(weg.map((b) => b.id))
  blocks = blocks.filter((b) => !fehlendeIds.has(b.id))

  for (const bild of weg) {
    const ref = refOf(bild)
    const name = bildName(bild)
    blocks = blocks.map((b) => {
      if (gestrichen.has(b.id)) return b
      const sauber = wandleTexte(b, (s) => ohneBildVerweis(s, ref)) as WsBlock
      if (sauber.type !== 'task')
        // Allein stehender Verweis in einer Hilfe o. Ä.: Verweis heraus, der Satz bleibt
        return wandleTexte(sauber, (s) =>
          enthaelt(s, ref)
            ? s
                .split(`M{${ref}}`)
                .join('')
                .replace(/ {2,}/g, ' ')
                .replace(/\s+([.,;:!?])/g, '$1')
            : s
        ) as WsBlock
      const nr = alteNummer.get(b.id) ?? 0
      // Die Stellung verlangt das Bild: Aufgabe entfällt
      if (enthaelt(sauber.instruction, ref) || enthaelt(sauber.brief?.situation, ref)) {
        gestrichen.add(b.id)
        bericht.hinweise.push(`${BILD_FEHLT}: ${aufgabenName(b as TaskBlock, nr)} entfiel – sie war nur mit dem fehlenden Bild „${name}" lösbar.`)
        return b
      }
      const teile = sauber.parts.filter((p) => !enthaelt(p.instruction, ref))
      if (sauber.parts.length && !teile.length) {
        gestrichen.add(b.id)
        bericht.hinweise.push(`${BILD_FEHLT}: ${aufgabenName(b as TaskBlock, nr)} entfiel – alle Teilaufgaben bezogen sich auf das fehlende Bild „${name}".`)
        return b
      }
      if (sauber === b && teile.length === sauber.parts.length) return b
      const ohne = sauber.parts.length - teile.length
      const hinweis = ohne
        ? `${BILD_FEHLT}: ${ohne} Teilaufgabe(n) zum fehlenden Bild „${name}" entfernt – bitte prüfen oder ein Bild einfügen.`
        : `${BILD_FEHLT}: Verweis auf das fehlende Bild „${name}" entfernt – bitte prüfen oder ein Bild einfügen.`
      bericht.angepasst++
      bericht.hinweise.push(`${BILD_FEHLT}: ${aufgabenName(b as TaskBlock, nr)} – ${ohne ? `${ohne} Teilaufgabe(n) entfernt` : 'Verweis entfernt'} (Bild „${name}").`)
      return { ...sauber, parts: teile, warnings: [...(sauber.warnings ?? []), hinweis] }
    })
  }

  if (gestrichen.size) {
    bericht.gestrichen = gestrichen.size
    // Hilfen der entfallenen Aufgaben gehen mit
    const entfalleneNummern = new Set([...gestrichen].map((id) => alteNummer.get(id)))
    blocks = blocks.filter((b) => !gestrichen.has(b.id) && !(b.type === 'scaffold' && entfalleneNummern.has(hilfen.get(b.id))))
    // „Aufgabe 4" in anderen Bausteinen: neu gezählt, Verweise auf entfallene als „(entfällt)"
    const nummern = new Map<number, number | null>()
    let neu = 0
    for (const [id, alt] of alteNummer) nummern.set(alt, gestrichen.has(id) ? null : ++neu)
    blocks = blocks.map((b) => wandleTexte(b, (s) => verweiseUmschreiben(s, nummern)) as WsBlock)
  }
  return { sheet: { ...sheet, blocks }, bericht }
}

/** Für das ganze erzeugte Blatt (alle Niveaufassungen); Hinweise je Fassung nur einmal */
export function entferneFehlendeBilder(ws: Worksheet): BildEntfernung {
  const gesamt: BildEntfernung = { entfernt: 0, angepasst: 0, gestrichen: 0, hinweise: [] }
  ws.sheets = ws.sheets.map((s) => {
    const { sheet, bericht } = blattOhneFehlendeBilder(s)
    gesamt.entfernt += bericht.entfernt
    gesamt.angepasst += bericht.angepasst
    gesamt.gestrichen += bericht.gestrichen
    for (const h of bericht.hinweise) {
      const zeile = ws.sheets.length > 1 ? `${s.label}: ${h}` : h
      if (!gesamt.hinweise.includes(zeile)) gesamt.hinweise.push(zeile)
    }
    return sheet
  })
  return gesamt
}
