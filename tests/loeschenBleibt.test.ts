import { mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Gelöscht bleibt gelöscht (29.09.2026).
 *
 * Befund der Lehrkraft: „Oftmals ist ein Löschen von Material erst nach dem zweiten Löschen
 * erfolgreich – beim ersten Löschen verschwindet es, ist aber nach Neustart der App noch
 * vorhanden." Ursache: Wurde das gerade offene Dokument gelöscht, bekam es im Programm nur
 * eine neue Kennung und blieb mit Inhalt stehen – das automatische Sichern legte es 200 ms
 * später unter der neuen Kennung wieder an. Dazu kamen wartende Sicherungen und Ergebnisse
 * von Hintergrund-Aufträgen, die nach dem Löschen eintrafen.
 *
 * Geprüft wird mit der echten Ablage des Hauptprozesses in einem Temp-Ordner, dem echten
 * Store, der echten Bibliothek und den echten Regeln des automatischen Sicherns.
 */

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
// Das Einsortieren in Themenbereiche braucht die Oberfläche – hier nicht Gegenstand
vi.mock('../src/renderer/src/shared/themenbereiche', () => ({ einsortierenNachSpeichern: async () => undefined }))

const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
})
;(globalThis as unknown as { window: unknown }).window = { api: { ai: { onProgress: () => () => undefined, onPlatz: () => () => undefined } } }

const { erzeugeAblage } = await import('../src/main/services/storage/dokumente')
const { mitWiederholung, loescheDatei } = await import('../src/main/services/storage/atomar')
const { erzeugeDokumentStore } = await import('../src/renderer/src/shared/testmodul/dokumentStore')
const { erzeugeBibliothek } = await import('../src/renderer/src/shared/testmodul/bibliothek')
const { verzoegerteSicherung, istGeloescht } = await import('../src/renderer/src/shared/autosave')
const { beobachteStore } = await import('../src/renderer/src/shared/useAutosave')
const { loescheDokument } = await import('../src/renderer/src/shared/bibliothek')

interface Dok {
  titel: string
}

let wurzel = ''
let aufraeumen: (() => void)[] = []

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'schul-apps-loeschen-'))
  vi.useFakeTimers()
})
afterEach(() => {
  for (const f of aufraeumen) f()
  aufraeumen = []
  vi.useRealTimers()
  rmSync(wurzel, { recursive: true, force: true })
})

/** Ein Programm wie Elternbrief oder Rückmeldung: Ablage, Store, Bibliothek, automatisches Sichern */
function programm() {
  const ablage = erzeugeAblage('dokumente', 'Dokument', () => wurzel)
  const store = erzeugeDokumentStore<Dok>({ startSchritt: () => 0 })
  const bib = erzeugeBibliothek({
    store,
    dokument: (s) => s.dok,
    setzeDokument: (s, d) => s.setDok(d),
    api: { save: async (i) => ablage.save(i), get: async (id) => ablage.get(id) },
    stats: () => ({}),
    standardName: (d: Dok) => d.titel,
    lohntSicherung: (d) => Boolean(d?.titel.trim())
  })
  const fehler: unknown[] = []
  const sicherung = verzoegerteSicherung(
    () => bib.speichern(),
    (e) => void fehler.push(e)
  )
  const abmelden = beobachteStore(
    () => ({
      store,
      dokument: (s) => s.docId,
      gesichert: (s) => Boolean(s.savedAt),
      bereit: (s) => Boolean(s.dok?.titel.trim()),
      geaendert: (s, prev) => s.dok !== prev.dok || (s.docName !== prev.docName && s.savedAt === prev.savedAt),
      speichern: () => bib.speichern()
    }),
    sicherung
  )
  aufraeumen.push(abmelden, () => sicherung.beende())
  // Bibliothek-Knopf „Löschen" wie in shared/components/Bibliothek.tsx
  const loeschen = (id: string): Promise<unknown[]> =>
    loescheDokument(async (i) => ablage.delete(i), id, { offeneId: () => store.getState().docId, geloescht: () => store.getState().forgetSaved() })
  /** Was nach einem Neustart in der Bibliothek stünde: frisch vom Datenträger gelesen */
  const nachNeustart = (): string[] =>
    erzeugeAblage('dokumente', 'Dokument', () => wurzel)
      .list()
      .map((m) => m.name)
  const dateien = (): string[] => readdirSync(join(wurzel, 'dokumente')).filter((f) => f !== 'index.json')
  return { ablage, store, bib, fehler, loeschen, nachNeustart, dateien }
}

describe('Löschen aus der Bibliothek', () => {
  it('das gerade offene Dokument bleibt nach dem Löschen gelöscht – auch nach dem Neustart', async () => {
    const p = programm()
    p.store.getState().setDok({ titel: 'Bruchrechnen' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(p.nachNeustart()).toEqual(['Bruchrechnen'])
    const id = p.store.getState().docId

    const rest = await p.loeschen(id)
    expect(rest).toEqual([])
    // Früher: 200 ms später lag es unter neuer Kennung wieder in der Ablage
    await vi.advanceTimersByTimeAsync(5000)
    expect(p.nachNeustart()).toEqual([])
    expect(p.dateien()).toEqual([])
    // Das Programm hat das Dokument geschlossen
    expect(p.store.getState().dok).toBeNull()
    expect(p.fehler).toEqual([])
  })

  it('eine noch wartende Sicherung des Dokuments legt es nach dem Löschen nicht wieder an', async () => {
    const p = programm()
    p.store.getState().setDok({ titel: 'Photosynthese' })
    await vi.advanceTimersByTimeAsync(2000)
    const id = p.store.getState().docId
    // Letzte Änderung – die Sicherung wartet noch, als gelöscht wird
    p.store.getState().setDok({ titel: 'Photosynthese 2' })
    await p.loeschen(id)
    await vi.advanceTimersByTimeAsync(5000)
    expect(p.nachNeustart()).toEqual([])
    expect(p.dateien()).toEqual([])
  })

  it('ein nicht offenes Dokument zu löschen lässt das offene unberührt', async () => {
    const p = programm()
    p.store.getState().setDok({ titel: 'Alt' })
    await vi.advanceTimersByTimeAsync(2000)
    const altId = p.store.getState().docId
    p.store.getState().reset()
    p.store.getState().setDok({ titel: 'Neu' })
    await vi.advanceTimersByTimeAsync(2000)
    await p.loeschen(altId)
    await vi.advanceTimersByTimeAsync(5000)
    expect(p.nachNeustart()).toEqual(['Neu'])
    expect(p.store.getState().dok).toEqual({ titel: 'Neu' })
  })

  it('das Ergebnis eines Hintergrund-Auftrags legt ein gelöschtes Dokument nicht wieder an', async () => {
    const p = programm()
    p.store.getState().setDok({ titel: 'Elternabend' })
    await vi.advanceTimersByTimeAsync(2000)
    const id = p.store.getState().docId
    await p.loeschen(id)
    expect(istGeloescht(id)).toBe(true)
    // Der Auftrag lief noch und kommt jetzt mit seinem Schnappschuss an
    await p.bib.legeAb(id, { titel: 'Elternabend' }, (d) => ({ ...d, titel: `${d.titel} (fertig)` }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(p.nachNeustart()).toEqual([])
  })

  it('ein noch nie gesichertes Dokument bekommt das Ergebnis eines Auftrags weiterhin', async () => {
    const p = programm()
    await p.bib.legeAb('nie-gesichert-1', { titel: 'Entwurf' }, (d) => ({ ...d, titel: `${d.titel} (fertig)` }))
    expect(p.nachNeustart()).toEqual(['Entwurf (fertig)'])
  })
})

describe('Gesperrte Dateien (Dropbox, Virenscanner)', () => {
  const fehlerMit = (code: string): Error => Object.assign(new Error(code), { code })

  it('wiederholt bei EPERM/EBUSY und gelingt dann', () => {
    vi.useRealTimers()
    let versuche = 0
    const wert = mitWiederholung(
      () => {
        versuche++
        if (versuche < 3) throw fehlerMit(versuche === 1 ? 'EPERM' : 'EBUSY')
        return 'fertig'
      },
      5,
      1
    )
    expect(wert).toBe('fertig')
    expect(versuche).toBe(3)
  })

  it('wirft andere Fehler sofort und eine bleibende Sperre nach dem letzten Versuch', () => {
    vi.useRealTimers()
    let versuche = 0
    expect(() =>
      mitWiederholung(
        () => {
          versuche++
          throw fehlerMit('ENOSPC')
        },
        5,
        1
      )
    ).toThrow('ENOSPC')
    expect(versuche).toBe(1)
    versuche = 0
    expect(() =>
      mitWiederholung(
        () => {
          versuche++
          throw fehlerMit('EBUSY')
        },
        4,
        1
      )
    ).toThrow('EBUSY')
    expect(versuche).toBe(4)
  })

  it('eine schon fehlende Datei zu löschen ist kein Fehler', () => {
    expect(() => loescheDatei(join(wurzel, 'gibt-es-nicht.json'))).not.toThrow()
  })
})
