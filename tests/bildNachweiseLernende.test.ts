import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { lernendenNachweis, nachweisAusBildquelle, nachweisOhneLoesung, nachweisTeile } from '../src/shared/bildLizenz'
import { BildNachweis, BildNachweisListe, nachweiseOhneDoppelte } from '../src/renderer/src/shared/components/BildNachweis'
import { onlineFassung } from '../src/renderer/src/modules/onlinetest/kern'
import { bildNachweiseVon } from '../src/renderer/src/modules/onlinetest/kernBlatt'
import { blattBildNachweise, testBildNachweise } from '../src/renderer/src/modules/onlinetest/testBildNachweise'
import { vokItems } from '../src/shared/mehrspieler/inhalt'
import type { Block, Variant } from '../src/renderer/src/modules/vokabeltest/model/types'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Bildnachweise für Lernende in Spielen, Onlinetest und Onlineblatt (23.10.2026): vorhanden, aber nicht dominant –
 * ein kleines ⓘ mit Aufklapper, dazu eine gesammelte Liste. Während Spiel/Test verrät der Nachweis nie das Lösungswort.
 */

const MEDIENBANK = 'Red apple – J. Smith, CC BY-SA 4.0, Wikimedia Commons https://commons.wikimedia.org/wiki/File:Red_apple.jpg'

describe('Nachweis ohne Lösung', () => {
  it('Titel, Dateiname und Adresse mit dem Wort fallen weg – Urheber und Lizenz bleiben', () => {
    const voll = lernendenNachweis({ herkunft: 'suche', nachweis: MEDIENBANK })!
    expect(voll).toContain('apple')
    const kurz = nachweisOhneLoesung(voll, ['apple', 'Apfel'])!
    expect(kurz.toLowerCase()).not.toContain('apple')
    expect(kurz).toContain('J. Smith')
    expect(kurz).toContain('CC BY-SA 4.0')
    expect(kurz.startsWith('Bild: ')).toBe(true)
  })

  it('auch die Übersetzung, Artikel und „(to)“ verraten nichts', () => {
    const kurz = nachweisOhneLoesung('Bild: Der Apfel am Baum · Fotograf: K. Lee · CC BY 4.0 · pixabay', ['the apple', 'der Apfel'])!
    expect(kurz.toLowerCase()).not.toContain('apfel')
    expect(kurz).toContain('K. Lee')
    const verb = nachweisOhneLoesung('Bild: Gordon Ramsay · CC BY 2.0 · going_home.png', ['(to) go'])!
    expect(verb).toContain('Gordon Ramsay')
    expect(verb).not.toContain('going_home')
  })

  it('KI-Bilder bleiben „KI-generiert“; ohne verbleibende Angabe ein neutraler Hinweis', () => {
    expect(nachweisOhneLoesung('KI-generiert', ['apple'])).toBe('KI-generiert')
    expect(nachweisOhneLoesung('Bild: apple.jpg', ['apple'])).toBe('Bild: Nachweis nach der Runde')
    expect(nachweisOhneLoesung('', ['apple'])).toBeNull()
  })

  it('zufällige Spielwörter tauchen nie im Nachweis auf', () => {
    const woerter = ['dog', 'house', 'river', 'bicycle', 'tree', 'cat', 'bread', 'school']
    for (const w of woerter) {
      for (const muster of [`${w} – A. Author, CC BY 4.0, Wikimedia Commons`, `Bild: ${w} photo · CC0 · openverse`, `File:${w}_1.jpg – B. B., CC BY 3.0`]) {
        const kurz = nachweisOhneLoesung(muster, [w])
        expect(kurz?.toLowerCase() ?? '').not.toMatch(new RegExp(`\\b${w}\\b`))
      }
    }
  })
})

describe('Kompakter Bildnachweis', () => {
  // Ohne die Stilblöcke, die Mantine mitzeichnet
  const zeichne = (el: React.ReactElement): string => renderToStaticMarkup(h(MantineProvider, null, el)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  it('ⓘ-Knopf mit aria-label, Aufklapper mit Urheber · Lizenz und Link', () => {
    const html = zeichne(h(BildNachweis, { kompakt: true, text: 'Bild: J. Smith · CC BY 4.0 · https://example.org/werk', anfangsOffen: true }))
    expect(html).toContain('aria-label="Bildnachweis"')
    expect(html).toContain('data-bild-nachweis-knopf="fremd"')
    expect(html).toContain('data-bild-nachweis-inhalt="fremd"')
    expect(html).toContain('J. Smith · CC BY 4.0')
    expect(html).toContain('href="https://example.org/werk"')
  })

  it('KI-Bild: „KI-generiert“', () => {
    const html = zeichne(h(BildNachweis, { kompakt: true, text: 'KI-generiert', anfangsOffen: true }))
    expect(html).toContain('data-bild-nachweis-knopf="ki"')
    expect(html).toContain('KI-generiert')
  })

  it('im Spiel ohne das Wort; geschlossen nur das kleine ⓘ (kein Text)', () => {
    const offen = zeichne(h(BildNachweis, { kompakt: true, text: lernendenNachweis({ herkunft: 'suche', nachweis: MEDIENBANK }), loesung: ['apple'], anfangsOffen: true }))
    expect(offen.toLowerCase()).not.toContain('apple')
    const zu = zeichne(h(BildNachweis, { kompakt: true, text: 'Bild: J. Smith · CC BY 4.0' }))
    expect(zu).toContain('aria-label="Bildnachweis"')
    expect(zu).not.toContain('J. Smith')
  })

  it('ohne Nachweis (eigenes Foto, OpenMoji) nichts', () => {
    expect(zeichne(h(BildNachweis, { kompakt: true, text: null }))).toBe('')
    expect(zeichne(h(BildNachweis, { kompakt: true, bild: { herkunft: 'own' } }))).toBe('')
  })

  it('Liste: klein, aufklappbar, doppelte nur einmal', () => {
    const e = [
      { label: 'apple', text: 'Bild: J. Smith · CC BY 4.0' },
      { label: 'apple', text: 'Bild: J. Smith · CC BY 4.0' },
      { label: 'dog', text: 'KI-generiert' }
    ]
    expect(nachweiseOhneDoppelte(e)).toHaveLength(2)
    const zu = zeichne(h(BildNachweisListe, { eintraege: e }))
    expect(zu).toContain('Bildnachweise (2)')
    expect(zu).not.toContain('J. Smith')
    const auf = zeichne(h(BildNachweisListe, { eintraege: e, anfangsOffen: true }))
    expect(auf).toContain('J. Smith')
    expect(zeichne(h(BildNachweisListe, { eintraege: [] }))).toBe('')
  })

  it('Link nur als http(s)-Adresse', () => {
    expect(nachweisTeile('Bild: A · CC BY 4.0 · https://x.org/a').link).toBe('https://x.org/a')
    expect(nachweisTeile('Bild: A · javascript:alert(1)').link).toBeUndefined()
  })
})

describe('Daten tragen den Nachweis', () => {
  it('Onlinetest: Bildaufgabe bekommt den Nachweis ohne Lösungswort, KI-Bild „KI-generiert“', () => {
    const variante: Variant = {
      id: 'A',
      label: 'A',
      blocks: [
        {
          id: 'b-pic',
          kind: 'picture',
          taskType: 'gapSentences',
          title: 'T',
          instruction: 'Write the word.',
          pointsPerItem: 1,
          items: [
            { id: 'p1', answer: 'a pen', imageKeywords: [], image: { dataUrl: 'data:image/png;base64,AA', source: 'wikimedia', credit: 'Blue pen – M. Muster, CC BY 4.0, Wikimedia Commons' } },
            { id: 'p2', answer: 'a cup', imageKeywords: [], image: { dataUrl: 'data:image/png;base64,AA', source: 'ai' } },
            { id: 'p3', answer: 'a dog', imageKeywords: [], image: { dataUrl: 'data:image/png;base64,AA', source: 'openmoji' } }
          ],
          wordBank: false,
          columns: 3
        } as Block
      ]
    }
    const f = onlineFassung(variante)
    const eintraege = f.aufgaben.flatMap((a) => a.eintraege)
    expect(eintraege[0].bildNachweis).toBe('Bild: M. Muster · CC BY 4.0 · Wikimedia Commons')
    expect(eintraege[0].bildNachweis!.toLowerCase()).not.toContain('pen')
    expect(eintraege[1].bildNachweis).toBe('KI-generiert')
    expect(eintraege[2].bildNachweis).toBeUndefined()
    const liste = testBildNachweise(f.aufgaben)
    expect(liste.map((x) => x.text)).toEqual(['Bild: M. Muster · CC BY 4.0 · Wikimedia Commons', 'KI-generiert'])
  })

  it('Material: Bildausschnitt aus dem Schulbuch mit Quellenangabe, KI-Bild gekennzeichnet', () => {
    const b = {
      id: 'm1',
      type: 'image',
      description: '',
      caption: '',
      widthPercent: 60,
      items: [
        { id: 'i1', caption: '', description: '', image: { dataUrl: 'x', source: 'material', credit: 'Green Line 2, Klett 2020, S. 34' } },
        { id: 'i2', caption: '', description: '', image: { dataUrl: 'x', source: 'ai' } },
        { id: 'i3', caption: '', description: '', image: { dataUrl: 'x', source: 'own' } }
      ]
    } as unknown as WsBlock
    expect(bildNachweiseVon(b)).toEqual(['Bild: Green Line 2, Klett 2020, S. 34', 'KI-generiert'])
    expect(nachweisAusBildquelle({ source: 'pixabay', credit: 'Foto: A. B., Pixabay-Lizenz' })).toBe('Bild: A. B., Pixabay-Lizenz')
  })

  it('Onlineblatt: Schlussseite und Quellenanhang werden ausgelesen', () => {
    const schluss = '<div class="ws-credits-page"><h2>Bildnachweise</h2><ul><li><b>Bild 1 – Hafen</b>: K. Lee, CC BY 4.0 &amp; mehr</li></ul></div>'
    expect(blattBildNachweise(schluss)).toEqual([{ label: 'Bild 1 – Hafen', text: 'Bild: K. Lee, CC BY 4.0 & mehr' }])
    const anhang =
      '<div data-quellen-anhang><h2>Quellen und Urheberrecht</h2><section><h3>Bilder</h3><ul><li><b>Bild 1</b>: KI-generiert (Bild-KI), von der Lehrkraft ausgewählt</li></ul></section><section><h3>Texte</h3><ul><li><b>M1</b>: Eigene Darstellung</li></ul></section></div>'
    expect(blattBildNachweise(anhang)).toEqual([{ label: 'Bild 1', text: 'KI-generiert' }])
  })

  it('Mehrspieler: das Wort trägt seinen Bildnachweis mit', () => {
    const items = vokItems([{ id: 'w1', term: 'apple', translation: 'Apfel', bild: '/medien/x.webp', bildNachweis: 'KI-generiert' }])
    expect(items[0].vok?.bildNachweis).toBe('KI-generiert')
  })
})
