import type { LearnerProfile } from '../didactics/profile'
import type { Worksheet } from '../model/types'
import { generateBoard } from './board'
import type { AiCall, Progress } from './generate'
import { allBlocks, checkMediaSources, completeOriginalSources, SourceServices } from './originalSources'
import { completeWorksheetImages, WorksheetImageDeps } from './worksheetImages'

export interface FinishDeps {
  ai: AiCall
  images: WorksheetImageDeps
  sources: SourceServices
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
export async function finishWorksheet(result: Worksheet, profile: LearnerProfile, deps: FinishDeps, onProgress?: Progress): Promise<Worksheet> {
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
    const images = await completeWorksheetImages(allBlocks(result), result.meta, deps.images, onProgress)
    if (images.web + images.ai + images.missing + images.reused > 0) {
      addNote(
        result,
        `Bilder: ${images.web} aus dem Internet (KI-geprüft), ${images.ai} KI-generiert${images.reused ? `, ${images.reused} aus einem früheren Blatt übernommen` : ''}${images.missing ? `, ${images.missing} noch auszuwählen` : ''} – Bildnachweise stehen unter den Bildern.`
      )
    }
  } catch (e) {
    addNote(result, `Bilder konnten nicht automatisch gewählt werden: ${e instanceof Error ? e.message : String(e)}`)
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
