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
import { legeVokabeltestAb, statsVon, vokabeltestOffen } from './library'
import type { TestDocument, TestSettings, VocabEntry } from './model/types'
import { useVokabeltest, type TestPayload } from './store'
import { regenerateBlock } from './generation/edit'
import { describeBlock } from './generation/quality'
import { ohnePraefix } from '../../shared/kiBeheben'
import { sichereAlles } from '../../shared/autosave'
import type { Block } from './model/types'

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
      const header = e.header ?? defaultHeader((await window.api.settings.get()).schoolName, settings.targetLanguage)
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

/**
 * „Mit KI beheben" an einer Aufgabe des Vokabeltests (Paket 12) – z. B. „Die Lösung ergibt sich
 * aus einer anderen Aufgabe". Die Aufgabe wird mit denselben Vokabeln neu erzeugt; die Hinweise
 * und die übrigen Aufgaben der Fassung gehen in den Auftrag ein, damit die KI weiß, was sie
 * vermeiden muss. Die lokalen Prüfungen laufen beim Erzeugen ohnehin (checkBlock) – die neue
 * Aufgabe trägt danach nur noch, was wirklich übrig ist. Ein kleiner Auftrag, sperrt nichts;
 * im offenen Test ein Rückgängig-Schritt.
 */
export function aufgabeBeheben(docId: string, doc: TestDocument, variantId: string, blockId: string, hinweise: string[]): void {
  const variant = doc.variants.find((v) => v.id === variantId)
  const block = variant?.blocks.find((b) => b.id === blockId)
  if (!variant || !block || !hinweise.length) return
  const andere = variant.blocks.filter((b) => b.id !== blockId).map((b, i) => `Task ${i + 1}: ${describeBlock(b)}`)
  const hinweis = [
    'The teacher asked to fix these problems of this task (reported by the checks):',
    ...hinweise.map((h) => `- ${ohnePraefix(h)}`),
    andere.length ? `The other tasks of the same test – no item of this task may give away or repeat a solution from them:\n${andere.join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  void starteAuftrag({
    moduleId: 'vokabeltest',
    docId,
    titel: useVokabeltest.getState().listName.trim() || 'Vokabeltest',
    art: 'Hinweis mit KI beheben',
    eingabe: { doc, variantId, blockId },
    istOffen: () => vokabeltestOffen(docId),
    sperrt: false,
    schluessel: blockId,
    fehlerTitel: 'Der Hinweis ließ sich nicht beheben',
    arbeit: async (e, k) => {
      k.melde('Die KI erzeugt die Aufgabe ohne die gemeldeten Probleme neu …')
      const v = e.doc.variants.find((x) => x.id === e.variantId)!
      const b = v.blocks.find((x) => x.id === e.blockId)!
      return regenerateBlock(
        e.doc,
        v,
        b,
        k.ai,
        b.kind === 'picture' ? await pictureOptions(e.doc.settings.pictureSource, { ai: k.ai, bild: k.bild }) : {},
        hinweis
      )
    },
    abschluss: () => 'Fertig – Aufgabe im Test ersetzt',
    ablegen: async (neu) => {
      const ersetze = (d: TestDocument): void => {
        const liste = d.variants.find((v) => v.id === variantId)?.blocks
        const i = liste?.findIndex((b) => b.id === blockId) ?? -1
        if (liste && i >= 0) liste[i] = neu as Block
      }
      if (vokabeltestOffen(docId)) {
        // Ein Schritt im Verlauf – Strg+Z holt die alte Aufgabe zurück
        useVokabeltest.getState().updateDoc(ersetze)
        await sichereAlles()
        return
      }
      const t = await window.api.tests.get(docId)
      const payload = structuredClone(t.payload as TestPayload)
      if (payload.doc) ersetze(payload.doc)
      await window.api.tests.save({ id: docId, name: t.name, stats: statsVon(payload), payload })
    }
  })
}
