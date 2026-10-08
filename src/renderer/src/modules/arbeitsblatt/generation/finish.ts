import type { LearnerProfile } from '../didactics/profile'
import { platziereIllustrationen } from './illustrationen'
import type { Worksheet, WsBlock } from '../model/types'
import { generateBoard } from './board'
import type { AiCall, Progress } from './generate'
import { allBlocks, checkMediaSources, completeOriginalSources, SourceServices } from './originalSources'
import { completeWorksheetImages, WorksheetImageDeps } from './worksheetImages'
import { entferneFehlendeBilder } from './bildFehlt'
import { aufgabenNaheAmMaterial, seitenJeBaustein } from '../didactics/integrity'
import type { PagePlan } from '../render/paginate'

/** Gemessene Seitenaufteilung je Blatt (Schülerfassung) */
export type Messen = (ws: Worksheet) => Promise<(sheetId: string) => PagePlan[] | undefined>

export interface FinishDeps {
  ai: AiCall
  images: WorksheetImageDeps
  sources: SourceServices
  /**
   * Seitenaufteilung messen (08.10.2026) – für „Aufgabe nah am Material". Fehlt der Wert, misst die App im Browser
   * selbst (render/seitenMessen.tsx); ohne Browser (Tests) entfällt der Schritt. `null` = nicht messen.
   */
  messen?: Messen | null
}

/** Standard: dieselbe Messung wie im Editor, außerhalb des Bildschirms */
const browserMessen: Messen | undefined =
  typeof document === 'undefined'
    ? undefined
    : async (ws) => {
        const [{ messeSeiten }, { layoutKey }] = await Promise.all([import('../render/seitenMessen'), import('../render/SheetPages')])
        const l = await messeSeiten(ws, null, '', 15000)
        return (id) => l.get(layoutKey(id, false))
      }

/**
 * Aufgaben hinter ihr Material rücken, wenn es nach dem Umbruch zwei oder mehr Seiten davor steht und die
 * Reihenfolge es erlaubt (didactics/integrity.ts). Was nicht umgestellt werden kann, nennt beim Darstellen die Seite.
 */
export function aufgabenZumMaterial(ws: Worksheet, plaene: (sheetId: string) => PagePlan[] | undefined): string[] {
  const hinweise: string[] = []
  ws.sheets = ws.sheets.map((s) => {
    const p = plaene(s.id)
    if (!p?.length) return s
    const { sheet, umgestellt } = aufgabenNaheAmMaterial(s, seitenJeBaustein(p))
    for (const h of umgestellt) hinweise.push(ws.sheets.length > 1 ? `${s.label}: ${h}` : h)
    return sheet
  })
  return hinweise
}

/*
 * Je Hinweis EINE Zeile. Bis 26.09.2026 wurde mit Leerzeichen angehängt – daraus wurde ein
 * einziger Absatz aus Planung, Kürzungsprotokoll und Quellenwarnung, den die Lehrkraft als
 * „unübersichtlich und überfrachtet" zurückgab. `didactics/hinweise.ts` ordnet die Zeilen.
 */
const addNote = (ws: Worksheet, note: string): void => {
  ws.meta = { ...ws.meta, teacherNote: [ws.meta.teacherNote, note].filter(Boolean).join('\n') }
}

/** Nach dem Ausformulieren: Quellen prüfen, Bilder suchen/erzeugen, optional Tafelbild. */
export async function finishWorksheet(
  result: Worksheet,
  profile: LearnerProfile,
  deps: FinishDeps,
  onProgress?: Progress,
  /** Live-Vorschau (02.10.2026): das Blatt, sobald ein Bild oder eine Figur eingesetzt ist */
  zwischenstand?: (ws: Worksheet, was: string) => void
): Promise<Worksheet> {
  const found = await completeOriginalSources(allBlocks(result), deps.sources, (done, total) =>
    onProgress?.(`Originalquellen werden geprüft (${done} von ${total}) …`, done, total)
  )
  if (found.texts > 0) {
    addNote(
      result,
      `Originalquellen (${found.texts} Textquelle(n)): Die KI gibt Quellen aus dem Gedächtnis wieder – Wortlaut und Quellenangabe vor dem Einsatz prüfen (Hinweise an den Bausteinen).`
    )
  }

  /*
   * Ton- und Filmquellen (Geschichte, Politik): Die KI nennt eine Fundstelle im Archiv –
   * ob es sie gibt, entscheidet erst der Abruf. Eine erfundene Adresse ist hier der
   * gefährlichste Fehler, weil eine nicht vorhandene Quelle auf dem Blatt echt aussieht.
   */
  const medien = await checkMediaSources(allBlocks(result), deps.sources, (done, total) =>
    onProgress?.(`Ton- und Filmquellen werden geprüft (${done} von ${total}) …`, done, total)
  )
  if (medien.videos > 0) {
    const offen = medien.videos - medien.verified
    addNote(
      result,
      offen > 0
        ? `Ton-/Filmquellen: ${medien.verified} von ${medien.videos} Fundstellen bestätigt. ${offen} ließ(en) sich nicht bestätigen – vor dem Einsatz selbst im Archiv nachsehen (Hinweise an den Bausteinen).`
        : `Ton-/Filmquellen: alle ${medien.videos} Fundstellen sind erreichbar und passen zu den Angaben. Trotzdem vor dem Einsatz einmal anspielen.`
    )
  }

  try {
    // Eine als Bild beschriebene Zeitleiste wird zum gezeichneten Baustein – an derselben Stelle, mit derselben Kennung
    const ersetze = (imageId: string, block: WsBlock): void => {
      for (const sheet of result.sheets) sheet.blocks = sheet.blocks.map((b) => (b.id === imageId ? block : b))
    }
    const images = await completeWorksheetImages(allBlocks(result), result.meta, { ...deps.images, ersetze }, (message, done, total) => {
      onProgress?.(message, done, total)
      // Die Bilder landen in den Bausteinen selbst – jedes erscheint in der Vorschau, sobald es da ist
      zwischenstand?.(result, message)
    })
    zwischenstand?.(result, 'Bilder eingesetzt')
    if (images.web + images.ai + images.missing + images.reused + images.gezeichnet > 0) {
      addNote(
        result,
        `Bilder: ${images.web} aus dem Internet (KI-geprüft), ${images.ai} KI-generiert${images.gezeichnet ? `, ${images.gezeichnet} Zeitleiste(n) von der App gezeichnet` : ''}${images.reused ? `, ${images.reused} aus einem früheren Blatt übernommen` : ''}${images.missing ? `, ${images.missing} noch auszuwählen` : ''} – Bildnachweise stehen unter den Bildern.`
      )
    }
  } catch (e) {
    addNote(result, `Bilder konnten nicht automatisch gewählt werden: ${e instanceof Error ? e.message : String(e)}`)
  }

  /*
   * Was jetzt noch kein Bild hat, verlässt das Blatt (08.10.2026): Auf dem Schülerblatt stand sonst der Suchauftrag
   * der KI, und Aufgaben verwiesen auf leeres Material. Aufgaben werden ohne KI angepasst (generation/bildFehlt.ts).
   * Nicht bei „Platzhalter" – dort will die Lehrkraft die Bilder selbst wählen.
   */
  if ((result.meta.imageSource ?? 'auto') !== 'placeholder') {
    const fehlt = entferneFehlendeBilder(result)
    if (fehlt.entfernt) {
      addNote(
        result,
        `Bild fehlt: ${fehlt.entfernt} Bild(er) ließen sich weder finden noch erzeugen und wurden vom Blatt genommen${fehlt.angepasst + fehlt.gestrichen ? ` – ${fehlt.angepasst} Aufgabe(n) angepasst, ${fehlt.gestrichen} entfallen` : ''}. Im Editor lässt sich jederzeit ein Bild einfügen.`
      )
      for (const h of fehlt.hinweise) addNote(result, h)
      zwischenstand?.(result, 'Fehlende Bilder entfernt')
    }
  }

  // Aufgabe nah am Material (08.10.2026): nach der gemessenen Seitenaufteilung, wo es die Reihenfolge erlaubt
  const messen = deps.messen === undefined ? browserMessen : deps.messen
  if (messen) {
    try {
      onProgress?.('Seitenumbruch wird geprüft …', 0, 1)
      for (const h of aufgabenZumMaterial(result, await messen(result))) addNote(result, `Aufgabe nah am Material: ${h}`)
    } catch {
      /* ohne Messung bleibt die Reihenfolge; die Seitenhinweise setzt die Darstellung */
    }
  }

  // Illustrationen (26.09.2026): nach Regeln gesetzt, Sprechblasen von der KI – nur bei jüngeren Jahrgängen
  try {
    result.sheets = (await platziereIllustrationen(result, { ai: deps.ai })).sheets
    zwischenstand?.(result, 'Figuren gesetzt')
  } catch {
    /* ohne Figuren weiter */
  }

  if (result.meta.boardPlan) {
    onProgress?.('Tafelbild wird aus den Aufgaben entwickelt …', 0, 1)
    try {
      // Beim ersten Mal für die Mitteltafel; weitere Flächen kommen im Editor dazu
      const board = await generateBoard(result, profile, deps.ai)
      result.boards = [board]
      result.board = board
    } catch (e) {
      addNote(result, `Tafelbild konnte nicht erstellt werden: ${e instanceof Error ? e.message : String(e)} – im Editor unter „Tafelbild“ erneut versuchen.`)
    }
  }
  return result
}
