import { describe, expect, it } from 'vitest'
import { CITATION_STYLES, formatCitation, missingForSourceCriticism } from '../src/renderer/src/shared/citation'
import { onlineCitation } from '../src/renderer/src/shared/imageChoice'
import type { OnlineImageHit } from '../src/shared/types'

const karikatur = {
  creator: 'Leonard Raven-Hill',
  title: 'The Boiling Point',
  date: '1912-10-02',
  repository: 'Punch',
  license: 'Public domain',
  url: 'https://commons.wikimedia.org/wiki/File:Balkan_troubles1.jpg',
  retrieved: '2026-09-21T10:00:00.000Z'
}

describe('Quellenangaben', () => {
  it('nimmt die Adresse der Fundstelle in jeden Stil mit auf', () => {
    for (const style of CITATION_STYLES) {
      const text = formatCitation(karikatur, style.value)
      expect(text, style.value).toContain('commons.wikimedia.org')
      expect(text, style.value).toContain('Raven-Hill')
      expect(text, style.value).toContain('The Boiling Point')
    }
  })

  it('unterscheidet die Stile erkennbar', () => {
    expect(formatCitation(karikatur, 'deutsch')).toContain('abgerufen am')
    expect(formatCitation(karikatur, 'apa')).toContain('(1912)')
    expect(formatCitation(karikatur, 'apa')).toContain('[Bild]')
    // MLA und Chicago stellen den Urheber unterschiedlich
    expect(formatCitation(karikatur, 'mla')).toContain('Raven-Hill, Leonard')
    expect(formatCitation(karikatur, 'chicago')).toContain('Leonard Raven-Hill,')
  })

  it('erfindet nichts, wenn Angaben fehlen', () => {
    const text = formatCitation({ title: 'Ohne alles' }, 'deutsch')
    expect(text).toContain('Urheber unbekannt')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('abgerufen')
  })

  it('meldet, was eine quellenkritische Einleitung noch braucht', () => {
    expect(missingForSourceCriticism(karikatur)).toEqual([])
    // Genau der Fall aus dem Arbeitsblatt: Urheber und Erscheinungsort fehlten
    const luecken = missingForSourceCriticism({ title: 'Politische Gliederung des Balkans 1878', creator: 'unbekannt' })
    expect(luecken).toContain('Urheber')
    expect(luecken).toContain('Entstehungsdatum')
    expect(luecken).toContain('Erscheinungsort oder Publikationsorgan')
  })

  it('übernimmt die Adresse aus einem Bildtreffer', () => {
    const hit: OnlineImageHit = {
      id: '1',
      thumbnail: '',
      url: 'https://upload.wikimedia.org/x.jpg',
      title: 'Europe 1878 map de',
      creator: 'Alexander Altenhof',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://commons.wikimedia.org/wiki/File:Europe_1878_map_de.png',
      date: '2016-09-11',
      source: 'wikimedia'
    }
    const c = onlineCitation(hit)
    expect(c.url).toContain('commons.wikimedia.org')
    expect(c.creator).toBe('Alexander Altenhof')
    expect(c.repository).toBe('Wikimedia Commons')
    expect(formatCitation(c, 'deutsch')).toContain('CC BY-SA 4.0')
  })
})
