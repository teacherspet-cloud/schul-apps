import { describe, expect, it } from 'vitest'
import { commonsHits, quoteCoverage, stripHtml } from '../src/main/services/images/sources'
import { sourceSearchVariants } from '../src/renderer/src/shared/images'
import { stripManualLineNumbers } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { completeOriginalSources, isTextSource, SourceServices } from '../src/renderer/src/modules/arbeitsblatt/generation/originalSources'
import { originalSourceRules, originalSourcesActive } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { TextBlock, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta>): WorksheetMeta => ({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), ...patch })

describe('Originalquellen: wann und wie', () => {
  it('automatisch in Quellenfächern ab Klasse 7, in Klasse 5–6 nur für ★★★', () => {
    expect(originalSourcesActive(meta({ subjectId: 'geschichte', grade: 9 }))).toBe(true)
    expect(originalSourcesActive(meta({ subjectId: 'geschichte', grade: 6 }))).toBe(false)
    expect(originalSourcesActive(meta({ subjectId: 'geschichte', grade: 6 }), 3)).toBe(true)
    expect(originalSourcesActive(meta({ subjectId: 'mathematik', grade: 11 }))).toBe(false)
    expect(originalSourcesActive(meta({ subjectId: 'mathematik', grade: 11, originalSources: 'on' }))).toBe(true)
    expect(originalSourcesActive(meta({ subjectId: 'geschichte', grade: 11, originalSources: 'off' }))).toBe(false)
  })

  it('Regeln verbieten erfundene Zitate und verlangen Fundort und Suchbegriff', () => {
    const rules = originalSourceRules(meta({ subjectId: 'geschichte', grade: 10 }), 3)
    expect(rules).toContain('Erfinde NIEMALS')
    expect(rules).toContain('Wikimedia Commons')
    expect(rules).toContain('imageSearch')
    expect(rules).toContain('Originalwortlaut')
    expect(originalSourceRules(meta({ subjectId: 'biologie', grade: 10 }))).toBe('')
  })
})

describe('Originalquellen: Wortlaut prüfen', () => {
  const page = `<html><body><script>var x = 1</script><p>Wir sind das Volk! Keine Gewalt!</p>
    <p>Die Würde des Menschen ist unantastbar. Sie zu achten und zu schützen ist Verpflichtung aller staatlichen Gewalt.</p>
    <p>Das Deutsche Volk bekennt sich darum zu unverletzlichen und unveräußerlichen Menschenrechten.</p></body></html>`

  it('findet exakte Zitate trotz Satzzeichen, Umbrüchen und Kürzungen', () => {
    const quote =
      'Die Würde des Menschen ist unantastbar. Sie zu achten und zu schützen ist Verpflichtung aller staatlichen Gewalt. […] Das Deutsche Volk bekennt sich darum zu unverletzlichen und unveräußerlichen Menschenrechten.'
    expect(quoteCoverage(quote, stripHtml(page)).ratio).toBe(1)
  })

  it('erkennt erfundene oder stark abweichende Zitate', () => {
    const invented = 'Die Freiheit des Menschen ist das höchste Gut und muss von jeder Regierung immer verteidigt werden.'
    expect(quoteCoverage(invented, stripHtml(page)).ratio).toBeLessThan(0.3)
  })

  it('liest Urheber, Lizenz und Datum aus Wikimedia Commons', () => {
    const hits = commonsHits({
      query: {
        pages: {
          '2': {
            pageid: 2,
            index: 2,
            title: 'File:B.png',
            imageinfo: [{ url: 'https://u/b.png', descriptionurl: 'https://c/b', mime: 'image/png' }]
          },
          '1': {
            pageid: 1,
            index: 1,
            title: 'File:Sturm auf die Bastille.jpg',
            imageinfo: [
              {
                thumburl: 'https://thumb/a.jpg',
                url: 'https://u/a.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
                mime: 'image/jpeg',
                extmetadata: {
                  Artist: { value: '<bdi><a href="x">Jean-Pierre Houël</a></bdi>' },
                  LicenseShortName: { value: 'Public domain' },
                  DateTimeOriginal: { value: '1789<div style="display: none;">date QS:P571</div>' },
                  ObjectName: { value: 'Prise de la Bastille' }
                }
              }
            ]
          },
          '3': {
            pageid: 3,
            index: 3,
            title: 'File:C.pdf',
            imageinfo: [{ url: 'https://u/c.pdf', descriptionurl: 'https://c/c', mime: 'application/pdf' }]
          }
        }
      }
    })
    expect(hits.map((h) => h.id)).toEqual(['1', '2'])
    expect(hits[0]).toMatchObject({
      creator: 'Jean-Pierre Houël',
      license: 'Public domain',
      date: '1789',
      title: 'Prise de la Bastille',
      url: 'https://thumb/a.jpg',
      source: 'wikimedia'
    })
    expect(hits[1].creator).toBe('unbekannt')
  })
})

describe('Originalquellen nach dem Erzeugen', () => {
  const services = (status: 'found' | 'notFound'): SourceServices & { calls: string[] } => {
    const calls: string[] = []
    return {
      calls,
      checkQuote: async (url) => {
        calls.push(`text:${url}`)
        return { status, ratio: status === 'found' ? 1 : 0, message: '' }
      },
      // Ton-/Filmquellen werden hier nicht geprüft – eigener Test weiter unten
      checkMedia: async (url) => {
        calls.push(`media:${url}`)
        return { status: 'ok', matched: [], missing: [], message: '' }
      }
    }
  }
  const text = (source: string): TextBlock => ({
    id: 't',
    type: 'text',
    title: 'Q1: Erklärung der Menschenrechte',
    body: 'Die Menschen werden frei und gleich an Rechten geboren.',
    lineNumbers: true,
    source,
    glossary: []
  })

  it('markiert abweichende Zitate und fehlende Fundorte für die Lehrkraft', async () => {
    const s = services('notFound')
    const withUrl = text('Nationalversammlung, 26.8.1789. Fundort: https://de.wikisource.org/wiki/Erklärung_der_Menschen-_und_Bürgerrechte.')
    const noUrl = text('Nationalversammlung, 26.8.1789')
    await completeOriginalSources([withUrl, noUrl], s)
    expect(s.calls).toContain('text:https://de.wikisource.org/wiki/Erklärung_der_Menschen-_und_Bürgerrechte')
    expect(withUrl.warnings?.[0]).toContain('nicht in der angegebenen Quelle gefunden')
    expect(noUrl.warnings?.[0]).toContain('keine Internetadresse')
    expect(isTextSource({ ...noUrl, title: 'Der Igel', source: '' })).toBe(false)
  })

  it('bestätigte Zitate bekommen keinen Hinweis', async () => {
    const t = text('Fundort: https://de.wikisource.org/wiki/X')
    await completeOriginalSources([t], services('found'))
    expect(t.warnings ?? []).toEqual([])
  })
})

describe('Originalquellen: Erfahrungen aus dem Praxistest', () => {
  it('Bildsuche wird schrittweise lockerer (lange Originaltitel finden sonst nichts)', () => {
    const v = sourceSearchVariants("A faut espérer q'eu s'jeu la finira ben tôt 1789 caricature")
    expect(v[0]).toContain('caricature')
    expect(v).toContain('faut espérer finira 1789')
    expect(v).toContain('faut espérer finira')
  })

  it('entfernt selbst geschriebene Zeilennummern, lässt normale Zahlen stehen', () => {
    expect(stripManualLineNumbers('1 Was ist der Dritte Stand? Alles.\n2 Was ist er bis jetzt? Nichts.\n3 Was verlangt er?')).toBe(
      'Was ist der Dritte Stand? Alles.\nWas ist er bis jetzt? Nichts.\nWas verlangt er?'
    )
    expect(stripManualLineNumbers('1789 begann die Revolution.\n2 Jahre später …')).toBe('1789 begann die Revolution.\n2 Jahre später …')
  })

  it('Übersetzungen werden mitgeprüft; bestätigte Übersetzungen ohne Hinweis', async () => {
    const quotes: string[] = []
    const block = (): TextBlock => ({
      id: 't',
      type: 'text',
      title: 'Q2: Menschenrechte',
      body: 'Die Menschen werden frei und gleich an Rechten geboren und bleiben es.',
      lineNumbers: true,
      source: 'Nationalversammlung 1789 (Übersetzung). Fundort: https://de.wikisource.org/wiki/X',
      glossary: []
    })
    const run = async (status: 'found' | 'notFound') => {
      const b = block()
      await completeOriginalSources([b], {
        checkQuote: async (_u, q) => (quotes.push(q), { status, ratio: 0, message: '' }),
        checkMedia: async () => ({ status: 'ok', matched: [], missing: [], message: '' })
      })
      return b
    }
    expect((await run('found')).warnings ?? []).toEqual([])
    expect((await run('notFound')).warnings?.[0]).toContain('Übersetzung')
    expect(quotes[0]).toContain('frei und gleich')
  })
})
