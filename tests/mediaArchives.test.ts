import { describe, expect, it } from 'vitest'
import {
  archivesForSubject,
  MEDIA_ARCHIVES,
  mediaSourceRules,
  searchesMediaSources,
  textArchivesForSubject,
  textSourceRules
} from '../src/renderer/src/modules/arbeitsblatt/didactics/mediaArchives'
import { checkMediaSources, type SourceServices } from '../src/renderer/src/modules/arbeitsblatt/generation/originalSources'
import type { MediaCheck } from '../src/shared/types'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const video = (patch: Partial<Extract<WsBlock, { type: 'video' }>> = {}): WsBlock => ({
  id: 'v1',
  type: 'video',
  title: 'Zeitzeugin über den Mauerfall',
  kind: 'dokumentation',
  sourceTitle: 'Zeitzeugen-Portal, Interview mit Erika Meyer, 1989',
  url: 'https://www.zeitzeugen-portal.de/videos/beispiel',
  platform: 'Zeitzeugen-Portal',
  minutes: 4,
  section: '',
  summary: '',
  beforeViewing: '',
  plays: 2,
  teacherNote: '',
  ...patch
})

const dienste = (res: Partial<MediaCheck>): SourceServices => ({
  checkQuote: async () => ({ status: 'found', ratio: 1, message: '' }),
  checkMedia: async () => ({ status: 'ok', matched: [], missing: [], message: '', ...res }) as MediaCheck
})

/*
 * Hintergrund: In den Fremdsprachen schreibt die KI den Hörtext selbst und lässt ihn
 * vertonen. In Geschichte wäre dasselbe eine Fälschung – ein nachgesprochenes
 * „Zeitzeugeninterview" sieht aus wie Überlieferung, ist aber erfunden. Deshalb sucht die
 * KI dort eine echte Aufnahme, und die App prüft die Fundstelle nach.
 */
describe('Ton- und Filmarchive für Geschichte und Politik', () => {
  it('gilt für Geschichte und Politik, nicht für die Fremdsprachen', () => {
    expect(searchesMediaSources('geschichte')).toBe(true)
    expect(searchesMediaSources('politik')).toBe(true)
    expect(searchesMediaSources('englisch')).toBe(false)
  })

  it('nennt zu jedem Fach echte Archive', () => {
    expect(archivesForSubject('geschichte').length).toBeGreaterThan(3)
    expect(archivesForSubject('politik').map((a) => a.id)).toContain('bundestag-mediathek')
    /*
     * Englisch kennt seit dem 23.09.2026 archive.org (Sammlung librivoxaudio für
     * gemeinfreie Literaturaufnahmen). Das macht daraus aber KEIN Quellenfach – die
     * Suchregel haengt an SEARCHES_MEDIA, nicht am Vorhandensein eines Archivs.
     */
    expect(archivesForSubject('englisch').map((a) => a.id)).toEqual(['archive-org'])
    expect(searchesMediaSources('englisch')).toBe(false)
    expect(mediaSourceRules('englisch')).toBe('')
  })

  it('kennzeichnet Archive mit Zugangshürde', () => {
    /*
     * Ein Archiv, für das man ein Konto braucht, taugt nicht für einen QR-Code auf dem
     * Arbeitsblatt. Das muss unterscheidbar sein, sonst steht die Klasse vor einer
     * Anmeldemaske.
     */
    const gesperrt = MEDIA_ARCHIVES.filter((a) => !a.frei)
    expect(gesperrt.length).toBeGreaterThan(0)
    for (const a of gesperrt) expect(a.hinweis, a.id).toBeTruthy()
  })

  it('verbietet der KI das Erfinden einer Aufnahme', () => {
    const r = mediaSourceRules('geschichte')
    expect(r).toMatch(/NICHT erfunden und NICHT nachgesprochen/)
    expect(r).toMatch(/Fälschung/)
    /*
     * Lieber gar keine Quelle als eine erfundene – aber nicht einfach nichts: Statt der
     * Adresse kommen Suchbegriffe, aus denen die App einen sichtbaren Suchhilfe-Kasten baut
     * (Entscheidung der Lehrkraft: eine Lücke, die man sieht, schließt man mit einem Griff).
     */
    expect(r).toMatch(/lass die Adresse LEER/)
    expect(r).toMatch(/searchTerms/)
  })

  it('gibt der KI nur frei zugängliche Archive als Suchort', () => {
    const r = mediaSourceRules('geschichte')
    expect(r).toContain('zeitzeugen-portal.de')
    // Das anmeldepflichtige Archiv steht NICHT in der Suchliste
    expect(r).not.toContain('zwangsarbeit-archiv.de')
  })

  it('schweigt in Fächern ohne Archive', () => {
    expect(mediaSourceRules('englisch')).toBe('')
  })
})

describe('Fundstellen nachprüfen', () => {
  it('nimmt die Warnung weg, wenn die Seite erreichbar ist und passt', async () => {
    const b = video({ warnings: ['Aufnahme: alt'] })
    const res = await checkMediaSources([b], dienste({ status: 'ok' }))
    expect(res).toEqual({ videos: 1, verified: 1 })
    expect(b.warnings).toEqual([])
  })

  it('warnt deutlich bei einer nicht erreichbaren Adresse', async () => {
    // Der gefährlichste Fall: Eine erfundene Fundstelle sieht auf dem Blatt echt aus
    const b = video()
    await checkMediaSources([b], dienste({ status: 'unreachable', message: 'Die Quelle ist nicht erreichbar (404).' }))
    expect(b.warnings?.[0]).toMatch(/erfunden sein/)
    expect(b.warnings?.[0]).toMatch(/404/)
  })

  it('warnt, wenn die Seite nicht von der genannten Aufnahme handelt', async () => {
    const b = video()
    await checkMediaSources([b], dienste({ status: 'mismatch', message: 'Die Seite ist erreichbar, nennt aber nicht: Erika Meyer.', title: 'Startseite' }))
    expect(b.warnings?.[0]).toMatch(/nennt aber nicht/)
    expect(b.warnings?.[0]).toMatch(/Startseite/)
  })

  it('lässt die Quelle stehen, statt sie stillschweigend zu entfernen', async () => {
    // Eine Lehrkraft, die die Warnung sieht, sucht weiter; eine verschwundene Quelle erklärt niemand
    const b = video()
    await checkMediaSources([b], dienste({ status: 'unreachable', message: 'nicht erreichbar' }))
    expect(b.type === 'video' && b.url).toBeTruthy()
  })

  it('rührt Videos ohne Adresse nicht an', async () => {
    const b = video({ url: '' })
    expect(await checkMediaSources([b], dienste({ status: 'unreachable', message: 'x' }))).toEqual({ videos: 0, verified: 0 })
    expect(b.warnings ?? []).toEqual([])
  })
})

/*
 * Textquellen aus Archiven (Entscheidung des Nutzers, 22.09.2026).
 *
 * Bisher gab die KI den Wortlaut aus dem Gedächtnis wieder; die App glich ihn nachträglich
 * gegen Wikisource ab. Das fängt den Fehler auf, verhindert ihn aber nicht.
 */
describe('Textquellen aus Archiven', () => {
  it('nennt Sammlungen, in denen Quellen wirklich liegen', () => {
    const ids = textArchivesForSubject('geschichte').map((a) => a.id)
    expect(ids).toContain('wikisource')
    expect(ids).toContain('schluesseldokumente')
  })

  it('verlangt eine Fundstelle statt eines Zitats aus dem Gedächtnis', () => {
    const r = textSourceRules('geschichte')
    expect(r).toMatch(/nicht aus dem Gedaechtnis/)
    expect(r).toContain('de.wikisource.org')
    // Ohne Fundstelle: lieber eine Darstellung in eigenen Worten als ein erfundenes Zitat
    expect(r).toMatch(/DARSTELLUNG in eigenen Worten/)
  })

  it('schweigt in Fächern ohne Quellenarbeit', () => {
    expect(textSourceRules('englisch')).toBe('')
  })
})

/*
 * archive.org – am 23.09.2026 mit der öffentlichen Schnittstelle geprüft.
 *
 * Es ist eine HOCHLADEPLATTFORM, kein kuratiertes Archiv. Eine offene Suche nach
 * „Nationalsozialismus" liefert als Top-Treffer „Mein Kampf"; nur 14 % der Tondokumente
 * (2,0 von 14,0 Mio.) tragen überhaupt eine Lizenzangabe. Für Geschichte ist es deshalb
 * NICHT als Suchort freigegeben.
 */
describe('archive.org', () => {
  const ia = MEDIA_ARCHIVES.find((a) => a.id === 'archive-org')!

  it('ist für Geschichte und Politik NICHT als Suchort freigegeben', () => {
    expect(ia.subjects).not.toContain('geschichte')
    expect(ia.subjects).not.toContain('politik')
    expect(mediaSourceRules('geschichte')).not.toContain('archive.org')
    expect(textSourceRules('geschichte')).not.toContain('archive.org')
  })

  it('trägt den Grund als Hinweis, nicht nur ein Häkchen', () => {
    expect(ia.frei).toBe(false)
    expect(ia.hinweis).toMatch(/Hochladeplattform/)
    expect(ia.hinweis).toMatch(/Mein Kampf/)
    expect(ia.hinweis).toMatch(/14 %/)
  })

  it('nennt die Sammlungen, die brauchbar sind', () => {
    // Kuratierte Bestände statt offener Suche
    expect(ia.hinweis).toMatch(/librivoxaudio/)
    expect(ia.hinweis).toMatch(/prelinger/)
  })
})
