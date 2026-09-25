import { useEffect, useRef } from 'react'
import { cleanImageBackground } from '../../shared/imageCleanup'
import type { SavedTestStats } from '@shared/types'
import { notifyError } from '../../shared/util'
import { variantPoints } from './model/blocks'
import { newId } from './model/random'
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

/** Speichert den aktuellen Vokabeltest in der App (neu oder unter der bisherigen ID). */
export async function saveCurrentTest(name?: string): Promise<void> {
  const state = useVokabeltest.getState()
  const finalName = (name ?? state.listName).trim() || `Vokabeltest vom ${new Date().toLocaleDateString('de-DE')}`
  if (finalName !== state.listName) state.setListName(finalName)
  const id = state.testId ?? newId()
  const { payload, stats } = currentPayload()
  const meta = await window.api.tests.save({ id, name: finalName, stats, payload })
  useVokabeltest.getState().markSaved(meta.id, meta.updatedAt)
}

/** Öffnet einen gespeicherten Vokabeltest. */
export async function openSavedTest(id: string): Promise<void> {
  const test = await window.api.tests.get(id)
  useVokabeltest.getState().openSaved(test.id, test.name, test.payload as TestPayload, test.updatedAt)
  void cleanTestImages()
}

/**
 * Automatisches Speichern: Sobald ein Test einmal in der App gespeichert wurde,
 * wird jede Änderung (Vokabeln, Name, Einstellungen, Test) kurz danach gesichert.
 */
export function useAutosave(): void {
  const timer = useRef<number | null>(null)
  useEffect(
    () =>
      useVokabeltest.subscribe((state, prev) => {
        if (!state.testId || state.testId !== prev.testId) return
        const changed = state.vocab !== prev.vocab || state.doc !== prev.doc || state.settings !== prev.settings || state.listName !== prev.listName
        if (!changed) return
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          saveCurrentTest().catch((e) => notifyError(e, 'Automatisches Speichern fehlgeschlagen'))
        }, 1200)
      }),
    []
  )
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
