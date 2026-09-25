/**
 * Einen Vokabeltest im Hintergrund erstellen (shared/auftraege.ts) – gemeinsam für
 * „Test erstellen" (Schritt 2) und „Test automatisch erstellen" (Schritt 1).
 *
 * Getrennte Erzeugungswege: Bis 25.09.2026 hatten beide Wege ihr eigenes Fenster ohne
 * Schließen-Knopf, und nur der automatische sicherte das Ergebnis. Jetzt laufen beide über
 * diese eine Funktion – mit derselben Ablage in genau diesem Test.
 */
import type { KnownVocab } from '../../shared/knownVocab'
import { starteAuftrag, type AuftragsKontext } from '../../shared/auftraege'
import { defaultHeader, generateTest } from './generation/generate'
import { pictureOptions } from './generation/pictureOptions'
import { legeVokabeltestAb, vokabeltestOffen } from './library'
import type { TestDocument, TestSettings, VocabEntry } from './model/types'
import { useVokabeltest, type TestPayload } from './store'

export interface VokabeltestLauf {
  art: string
  /** Die abgefragten Vokabeln */
  usable: VocabEntry[]
  settings: TestSettings
  review: boolean
  economy: boolean
  known?: KnownVocab
  /** Vorab (z. B. Aufgabenformate wählen lassen) – bekommt dieselben KI-Aufrufe */
  vorbereiten?: (settings: TestSettings, k: AuftragsKontext) => Promise<TestSettings>
  abschluss?: (doc: TestDocument) => string
}

export function erstelleVokabeltest(lauf: VokabeltestLauf): void {
  const s = useVokabeltest.getState()
  const docId = s.testId
  const name = s.listName
  const payload: TestPayload = { vocab: s.vocab, settings: lauf.settings, doc: s.doc }
  void starteAuftrag({
    moduleId: 'vokabeltest',
    docId,
    titel: name.trim() || 'Vokabeltest',
    art: lauf.art,
    eingabe: { usable: lauf.usable, settings: lauf.settings, header: s.doc?.header ?? null, known: lauf.known, payload },
    istOffen: () => vokabeltestOffen(docId),
    fehlerTitel: 'Test konnte nicht erstellt werden',
    arbeit: async (e, k) => {
      const settings = lauf.vorbereiten ? await lauf.vorbereiten(e.settings, k) : e.settings
      const header = e.header ?? defaultHeader((await window.api.settings.get()).schoolName)
      return generateTest(e.usable, settings, header, {
        ai: k.ai,
        review: lauf.review,
        combined: lauf.economy,
        // Wortschatz früherer Units/Bände: Die Sätze bleiben in dem, was die Klasse kennt
        known: e.known,
        ...(await pictureOptions(settings.pictureSource, { ai: k.ai, bild: k.bild })),
        onProgress: (done, total, message) => k.melde(message, done, total)
      })
    },
    abschluss: lauf.abschluss,
    ablegen: (doc, e) => legeVokabeltestAb(docId, e.payload, doc, name)
  })
}
