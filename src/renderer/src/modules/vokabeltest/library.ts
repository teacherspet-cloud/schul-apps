import { cleanImageBackground } from '../../shared/imageCleanup'
import type { SavedTestStats } from '@shared/types'
import { sichereAlles } from '../../shared/autosave'
import { useStoreAutosave } from '../../shared/useAutosave'
import { variantPoints } from './model/blocks'
import { includedVocab } from './model/vocab'
import { TestPayload, useVokabeltest } from './store'

function currentPayload(): { payload: TestPayload; stats: SavedTestStats } {
  const { vocab, settings, doc } = useVokabeltest.getState()
  const payload: TestPayload = { vocab, settings, doc }
  return {
    payload,
    stats: {
      vocabCount: vocab.filter((v) => v.term.trim()).length,
      includedCount: includedVocab(vocab).length,
      hasTest: Boolean(doc),
      variantCount: doc?.variants.length ?? 0,
      totalPoints: doc?.variants[0] ? variantPoints(doc.variants[0]) : 0
    }
  }
}

export function hasContent(): boolean {
  const { vocab, doc } = useVokabeltest.getState()
  return Boolean(doc) || vocab.some((v) => v.term.trim())
}

/**
 * Speichert den aktuellen Vokabeltest in der App (unter der Kennung des offenen Tests).
 *
 * `still`: automatisches Sichern. Der Vorschlagsname („Vokabeltest vom …") landet dann nicht
 * im Namensfeld – es würde sonst mitten in der Eingabe der ersten Vokabel befüllt.
 */
export async function saveCurrentTest(name?: string, still = false): Promise<void> {
  const state = useVokabeltest.getState()
  const finalName = (name ?? state.listName).trim() || `Vokabeltest vom ${new Date().toLocaleDateString('de-DE')}`
  if (!still && finalName !== state.listName) state.setListName(finalName)
  const id = state.testId
  const { payload, stats } = currentPayload()
  const meta = await window.api.tests.save({ id, name: finalName, stats, payload })
  useVokabeltest.getState().markSaved(meta.id, meta.updatedAt)
}

/** Öffnet einen gespeicherten Vokabeltest. */
export async function openSavedTest(id: string): Promise<void> {
  // Was am bisherigen Test noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const test = await window.api.tests.get(id)
  useVokabeltest.getState().openSaved(test.id, test.name, test.payload as TestPayload, test.updatedAt)
  void cleanTestImages()
}

/** Neuen Vokabeltest beginnen – den bisherigen vorher sichern. */
export async function newTestSafely(): Promise<void> {
  await sichereAlles()
  useVokabeltest.getState().newTest()
}

/**
 * Automatisches Speichern – ab der ersten Vokabel, danach nach jeder Änderung (Vokabeln,
 * Name, Einstellungen, Test).
 *
 * Bis 25.09.2026 sicherte der Vokabeltest erst, nachdem er einmal von Hand gespeichert war.
 * Wer eine lange Liste abtippte und dann „Neuer Vokabeltest" drückte oder das Fenster
 * schloss, hatte nichts mehr.
 */
export function useAutosave(): void {
  useStoreAutosave({
    store: useVokabeltest,
    dokument: (s) => s.testId,
    gesichert: (s) => Boolean(s.lastSavedAt),
    bereit: () => hasContent(),
    geaendert: (s, prev) => s.vocab !== prev.vocab || s.doc !== prev.doc || s.settings !== prev.settings || s.listName !== prev.listName,
    verzoegerung: 1200,
    speichern: () => saveCurrentTest(undefined, true)
  })
}

/** Nach dem Öffnen: Bilder mit Schachbrett- oder Greenscreen-Hintergrund still freistellen. */
export async function cleanTestImages(): Promise<number> {
  const doc = useVokabeltest.getState().doc
  if (!doc) return 0
  const cleaned = new Map<string, string>()
  for (const variant of doc.variants) {
    for (const block of variant.blocks) {
      if (block.kind !== 'picture') continue
      for (const item of block.items) {
        if (!item.image) continue
        const res = await cleanImageBackground(item.image.dataUrl)
        if (res.kind !== 'none') cleaned.set(item.id, res.dataUrl)
      }
    }
  }
  if (!cleaned.size) return 0
  useVokabeltest.getState().updateDoc((d) => {
    for (const variant of d.variants) {
      for (const block of variant.blocks) {
        if (block.kind !== 'picture') continue
        for (const item of block.items) {
          const url = cleaned.get(item.id)
          if (url && item.image) item.image.dataUrl = url
        }
      }
    }
  })
  return cleaned.size
}
