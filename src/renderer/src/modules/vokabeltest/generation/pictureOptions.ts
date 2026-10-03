import { browserImageServices, generateAiImage, imageGenerationAvailable } from '../../../shared/images'
import { aiCall } from '../store'
import type { TestSettings } from '../model/types'
import type { GenerateOptions } from './generate'
import { findVocabPictures, vocabClipartPrompt } from './pictures'

/**
 * Bildquelle für „Bilder beschriften“ in der App.
 *
 * „auto“ = Piktogramme, Cliparts und KI-Bilder (Standard, auch für ältere Einstellungen „openmoji“).
 * Gesucht wird in dieser Reihenfolge:
 *   1. Piktogramm (OpenMoji),
 *   2. Clipart aus dem Internet (Openverse),
 *   3. erst wenn die KI keines davon als eindeutig bewertet: ein KI-Bild.
 * Jedes Bild wird von der KI auf Eindeutigkeit geprüft.
 */
export async function pictureOptions(
  source: TestSettings['pictureSource'] | undefined,
  /** KI-Aufrufe eines Hintergrund-Auftrags – dann lassen sie sich mit ihm abbrechen */
  auftrag?: { ai: GenerateOptions['ai']; bild: (prompt: string) => Promise<string> }
): Promise<Pick<GenerateOptions, 'findImage' | 'findImages'>> {
  if (source === 'none') return {}
  const canGenerate = await imageGenerationAvailable()
  if (source === 'ai' && canGenerate) {
    return { findImage: async (item) => generateAiImage(vocabClipartPrompt(item, undefined), undefined, auftrag?.bild) }
  }
  return {
    findImages: (items, vocab, settings, ersatz) =>
      findVocabPictures(
        items,
        vocab,
        settings,
        {
          ai: auftrag?.ai ?? aiCall,
          services: browserImageServices(),
          generateImage: canGenerate ? async (prompt) => (await generateAiImage(prompt, undefined, auftrag?.bild)).dataUrl : undefined
        },
        ersatz
      )
  }
}
