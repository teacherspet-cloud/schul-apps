/**
 * Gemeinsames Gerüst der Bibliothek für Grammatiktest, Lernzielkontrolle und Klassenarbeit
 * (Großprogramm 0.4, Aufräumen D1).
 *
 * Die drei `library.ts` waren bis auf Namen und zwei, drei Stellen gleich: speichern, öffnen,
 * „ist offen?", Ergebnis eines Hintergrund-Auftrags ablegen, neu beginnen, automatisch
 * speichern. Eine Korrektur in einer Kopie galt nicht in den anderen (siehe Notiz „Getrennte
 * Erzeugungswege"). Jetzt liefert `erzeugeBibliothek` diese Funktionen aus einer Beschreibung;
 * die Module geben sie unter ihren bisherigen Namen weiter.
 */
import { legeAb } from '../auftraege'
import { dokumentName, sichereAlles } from '../autosave'
import { einsortierenNachSpeichern } from '../themenbereiche'
import { useStoreAutosave } from '../useAutosave'

/** Was der Store eines Testprogramms mindestens können muss */
export interface TestStoreZustand<D> {
  docId: string
  docName: string
  savedAt: string | null
  setStep: (step: number) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  openSaved: (id: string, name: string, dok: D, savedAt: string) => void
  reset: () => void
}

export interface TestStore<S> {
  getState: () => S
  subscribe: (listener: (state: S, prev: S) => void) => () => void
}

export interface BibliotheksBeschreibung<D, S extends TestStoreZustand<D>, Stats> {
  store: TestStore<S>
  /** Das offene Dokument im Store (`exam`, `test` …) */
  dokument: (s: S) => D | null
  /** Ein geändertes Dokument in den Store (mit Rückgängig-Schritt) */
  setzeDokument: (s: S, d: D) => void
  api: {
    save: (input: { id: string; name: string; stats: Stats; payload: D }) => Promise<{ id: string; updatedAt: string; name: string }>
    get: (id: string) => Promise<{ id: string; name: string; updatedAt: string; payload: unknown }>
  }
  stats: (d: D) => Stats
  standardName: (d: D) => string
  /** Lohnt sich das Sichern? Ein leeres Formular soll die Übersicht nicht füllen. */
  lohntSicherung: (d: D | null) => boolean
  /** Ältere gespeicherte Stände auf den heutigen Aufbau bringen (Klassenarbeit: Fassungen) */
  normalisiere?: (d: D) => D
  /** Verzögerung des automatischen Speicherns (ms) */
  verzoegerung?: number
}

export interface Bibliothek<D> {
  speichern: (name?: string) => Promise<void>
  oeffnen: (id: string) => Promise<void>
  istOffen: (docId: string) => boolean
  legeAb: (docId: string, schnappschuss: D, einarbeiten: (d: D) => D, schritt?: number) => Promise<void>
  neuSicher: () => Promise<void>
  useAutosave: () => void
}

export function erzeugeBibliothek<D, S extends TestStoreZustand<D>, Stats>(b: BibliotheksBeschreibung<D, S, Stats>): Bibliothek<D> {
  const normal = (d: D): D => (b.normalisiere ? b.normalisiere(d) : d)

  const speichern = async (name?: string): Promise<void> => {
    const state = b.store.getState()
    const dok = b.dokument(state)
    if (!dok || !b.lohntSicherung(dok)) return
    const id = state.docId
    const meta = await b.api.save({ id, name: name?.trim() || dokumentName(id, state.docName, b.standardName(dok)), stats: b.stats(dok), payload: dok })
    void einsortierenNachSpeichern()
    b.store.getState().markSaved(meta.id, meta.updatedAt, meta.name)
  }

  const oeffnen = async (id: string): Promise<void> => {
    // Was am bisherigen Dokument noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
    await sichereAlles()
    const saved = await b.api.get(id)
    b.store.getState().openSaved(saved.id, saved.name, saved.payload as D, saved.updatedAt)
  }

  const istOffen = (docId: string): boolean => {
    const s = b.store.getState()
    return s.docId === docId && b.dokument(s) !== null
  }

  /*
   * Ergebnis eines Hintergrund-Auftrags im Dokument `docId` ablegen (siehe shared/auftraege.ts):
   * im offenen Dokument als Rückgängig-Schritt, sonst direkt in der Bibliothek.
   */
  const ablegen = (docId: string, schnappschuss: D, einarbeiten: (d: D) => D, schritt?: number): Promise<void> =>
    legeAb<D>(
      {
        istOffen,
        imOffenen: (f) => {
          const s = b.store.getState()
          const dok = b.dokument(s)
          if (!dok) return
          b.setzeDokument(s, f(dok))
          if (schritt !== undefined) s.setStep(schritt)
        },
        laden: async (id) => {
          const t = await b.api.get(id)
          return { name: t.name, dok: normal(t.payload as D) }
        },
        speichern: async (id, name, dok) => {
          await b.api.save({ id, name: name ?? b.standardName(dok), stats: b.stats(dok), payload: dok })
          void einsortierenNachSpeichern()
        }
      },
      docId,
      schnappschuss,
      einarbeiten
    )

  /** Neues Dokument beginnen – das bisherige vorher sichern. */
  const neuSicher = async (): Promise<void> => {
    await sichereAlles()
    b.store.getState().reset()
  }

  /*
   * Automatisches Speichern – als Entwurf, sobald sich das Sichern lohnt, danach nach jeder
   * Änderung. Verzögert, damit nicht jeder Tastendruck im Editor eine Datei schreibt.
   */
  const useAutosave = (): void =>
    useStoreAutosave({
      store: b.store,
      dokument: (s) => s.docId,
      gesichert: (s) => Boolean(s.savedAt),
      bereit: (s) => b.lohntSicherung(b.dokument(s)),
      // Ein geänderter Name zählt nur, wenn ihn die Lehrkraft geändert hat – nicht die Bestätigung des Speicherns
      geaendert: (s, prev) => b.dokument(s) !== b.dokument(prev) || (s.docName !== prev.docName && s.savedAt === prev.savedAt),
      ...(b.verzoegerung ? { verzoegerung: b.verzoegerung } : {}),
      speichern: () => speichern()
    })

  return { speichern, oeffnen, istOffen, legeAb: ablegen, neuSicher, useAutosave }
}
