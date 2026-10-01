import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { bereinigeArtikeltext, keineSchlagzeile, ohneSeitenname, seitentitelAusHtml } from '../src/shared/artikelText'
import { fliesstext } from '../src/main/services/sources/fliesstext'
import { pruefeKuerzung, wortzahl } from '../src/renderer/src/modules/arbeitsblatt/generation/kuerzung'
import {
  absatzAuswahl,
  bereinigterSeitentitel,
  laengeBewerten,
  mitteDesBereichs,
  schneideZu,
  zielWortzahl
} from '../src/renderer/src/modules/arbeitsblatt/generation/zuschnitt'
import bewertung from './fixtures/artikel-bewertung.json'

/*
 * Befunde der Lehrkraft vom 01.10.2026 (Klassenarbeit Englisch, NI, Sek II, Sprachmittlung):
 * 1. Das Material hieß „M1 Bewertung: 2" – die Schlagzeilenerkennung nahm ein Bewertungswidget.
 * 2. Der Text war mit 455 Wörtern bei 450–650 „etwa 150 Wörter zu kurz": 90 % des MINIMUMS galten
 *    als getroffen, und die Absatzkürzung suchte nur unter dem Maximum statt nah am Ziel.
 */

const seite = (): string => fliesstext(bewertung.html, 'de')

describe('Titel: kein Bewertungswidget als Schlagzeile', () => {
  it('die Extraktion behält das Widget – die Bereinigung entfernt es und nimmt die echte Schlagzeile', () => {
    const roh = seite()
    // Genau so sah der Befund aus: kurze Widget-Zeilen direkt über der Schlagzeile
    expect(roh).toContain('Bewertung: 2')
    const a = bereinigeArtikeltext(roh, { seitentitel: bewertung.seitentitel })
    expect(a.titel).toBe('Shakespeares Werke: Betörend, verstörend')
    for (const m of ['Bewertung', '★', '12 Kommentare', 'hilfreich', 'Jetzt bewerten', 'von 5 Sternen', 'Ja / Nein']) expect(a.text).not.toContain(m)
    expect(a.entfernt.some((z) => z.startsWith('Bewertung: Bewertung: 2'))).toBe(true)
    expect(wortzahl(a.text)).toBe(bewertung.absaetze.reduce((n, x) => n + wortzahl(x), 0))
  })

  it('auch ohne Seitentitel und ohne Fettdruck fällt die Wahl nicht auf Bewertung, Zähler oder Datum', () => {
    const text = ['Bewertung: 2', '★★☆☆☆', '12 Kommentare', '10.03.2025', 'Teilen', 'Shakespeares Werke heute', ...bewertung.absaetze].join('\n\n')
    expect(bereinigeArtikeltext(text).titel).toBe('Shakespeares Werke heute')
  })

  it('Rangfolge im HTML: og:title, <h1> im <article>, erstes <h1>, <title> ohne Website-Namen', () => {
    expect(seitentitelAusHtml(bewertung.html)).toBe('Shakespeares Werke: Betörend, verstörend')
    const ohneOg = bewertung.html.replace(/<meta[^>]*og:title[^>]*>/, '')
    expect(seitentitelAusHtml(ohneOg)).toBe('Shakespeares Werke: Betörend, verstörend')
    const artikel = '<html><head><title>Startseite | Zeitung</title></head><body><h1>Zeitung</h1><article><h1>Neue Wege im Theater</h1><p>…</p></article></body></html>'
    expect(seitentitelAusHtml(artikel)).toBe('Neue Wege im Theater')
    const nurTitel = '<html><head><title>Neue Wege im Theater – Kulturmagazin</title></head><body><p>…</p></body></html>'
    expect(seitentitelAusHtml(nurTitel)).toBe('Neue Wege im Theater')
    // Bewertung im og:title bzw. <h1>: abgelehnt, der nächste Kandidat zählt
    const widget = '<html><head><meta property="og:title" content="Bewertung: 2"><title>Neue Wege im Theater | Kulturmagazin</title></head><body><h1>★★☆☆☆</h1></body></html>'
    expect(seitentitelAusHtml(widget)).toBe('Neue Wege im Theater')
  })

  it('Seitentitel: Website-Name ab, Bewertungen und Zähler nie', () => {
    expect(ohneSeitenname('Shakespeares Werke | LMU München')).toBe('Shakespeares Werke')
    expect(ohneSeitenname('LMU | Shakespeares Werke: Betörend, verstörend')).toBe('Shakespeares Werke: Betörend, verstörend')
    expect(bereinigterSeitentitel('Bewertung: 2')).toBe('')
    const widgets = ['Bewertung: 2', 'Rating: 4.5/5', '4,5 von 5 Sternen', '(12 Bewertungen)', '★★★☆☆', 'Jetzt bewerten', 'Artikel teilen', '12 Kommentare']
    for (const z of [...widgets, '10.03.2025', 'News']) expect(keineSchlagzeile(z), z).toBe(true)
    const titel = ['Shakespeares Werke: Betörend, verstörend', 'Neue Wege im Theater', 'Bewertungen im Wandel der Zeit: Kritik und Publikum']
    for (const z of titel) expect(keineSchlagzeile(z), z).toBe(false)
  })
})

describe('Länge: Ziel ≈ 90 % des Maximums, unter der Mitte zu kurz', () => {
  const ziel = { min: 450, max: 650, grund: 'NRW-Abitur' }

  it('Ziel, Mitte und Bewertung', () => {
    expect(zielWortzahl(ziel)).toBe(585)
    expect(mitteDesBereichs(ziel)).toBe(550)
    expect(laengeBewerten(455, ziel)).toBe('zuKurz')
    expect(laengeBewerten(549, ziel)).toBe('zuKurz')
    expect(laengeBewerten(550, ziel)).toBe('passt')
    expect(laengeBewerten(650, ziel)).toBe('passt')
    expect(laengeBewerten(651, ziel)).toBe('zuLang')
  })

  /** Absatz aus `saetze` Sätzen zu je zehn Wörtern, wortgleich wiederholbar */
  const absatz = (k: number, saetze: number): string =>
    Array.from({ length: saetze }, (_, i) => `Absatz ${k} Satz ${i} handelt von Theater, Sprache, Macht und jungen Menschen heute.`).join(' ')

  it('Absatzkürzung füllt mit ganzen Sätzen bis nahe ans Ziel, statt bei 520 Wörtern stehen zu bleiben', () => {
    // Vier Absätze zu je 260 Wörtern: ganze Absätze ergeben 520 (zu kurz) oder 780 (zu lang)
    const original = [0, 1, 2, 3].map((k) => absatz(k, 26)).join('\n\n')
    const aus = absatzAuswahl(original, ziel, 'Theater', 'de')
    const n = wortzahl(aus)
    expect(n).toBeGreaterThanOrEqual(550)
    expect(n).toBeLessThanOrEqual(650)
    expect(Math.abs(n - 585)).toBeLessThanOrEqual(10)
    expect(pruefeKuerzung(original, aus).ok).toBe(true)
  })

  it('ganze Absätze nah am Ziel schlagen knapp über dem Minimum', () => {
    const original = bewertung.absaetze.join('\n\n')
    const n = wortzahl(absatzAuswahl(original, ziel, 'Shakespeare heute', 'de'))
    expect(n).toBeGreaterThanOrEqual(550)
    expect(n).toBeLessThanOrEqual(650)
  })

  const ausschnitt = (indizes: number[]): string => {
    const teile: string[] = []
    indizes.forEach((i, k) => {
      if (k > 0 && i !== indizes[k - 1] + 1) teile.push('[…]')
      teile.push(bewertung.absaetze[i])
    })
    return teile.join('\n\n')
  }
  const eingabe = {
    text: seite(),
    seitentitel: seitentitelAusHtml(bewertung.html),
    url: bewertung.url,
    ziel,
    thema: 'Shakespeare today',
    teil: 'Sprachmittlung',
    sprache: 'de',
    zielsprache: 'en',
    fach: 'Englisch',
    jahrgang: 12,
    mediation: true
  }

  it('ein KI-Ausschnitt unter der Mitte gilt als zu kurz: zweiter Auftrag mit Rückmeldung, dann der längere', async () => {
    const auftraege: string[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      if (req.schemaName === 'material_zuschnitt') {
        auftraege.push(req.user)
        // Erst rund 505 Wörter (im Bereich, aber unter der Mitte), dann rund 593
        return { gekuerzt: auftraege.length === 1 ? ausschnitt([0, 1, 3, 4, 5, 7]) : ausschnitt([0, 1, 2, 3, 4, 5, 7]), begruendung: '', worthilfen: [] } as T
      }
      if (req.schemaName === 'material_artikelpruefung') return { nurArtikeltext: true, fremd: [] } as T
      throw new Error(req.schemaName)
    }
    const r = await schneideZu(eingabe, ai)
    expect(auftraege).toHaveLength(2)
    expect(auftraege[0]).toContain('etwa 585 Wörter')
    expect(auftraege[0]).toContain('zulässig 550 bis 650')
    expect(auftraege[1]).toMatch(/hatte 50\d Wörter – zu kurz/)
    expect(r.weg).toBe('ki')
    expect(wortzahl(r.ablage.text)).toBeGreaterThanOrEqual(550)
    expect(r.ablage.titel).toBe('Shakespeares Werke: Betörend, verstörend')
  })

  it('bleibt die KI zu kurz, kürzt die App absatzweise – mindestens bis zur Mitte', async () => {
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      if (req.schemaName === 'material_zuschnitt') return { gekuerzt: ausschnitt([0, 1, 3, 4, 5, 7]), begruendung: '', worthilfen: [] } as T
      if (req.schemaName === 'material_artikelpruefung') return { nurArtikeltext: true, fremd: [] } as T
      throw new Error(req.schemaName)
    }
    const r = await schneideZu(eingabe, ai)
    expect(r.weg).toBe('app')
    expect(r.pruefung.ok).toBe(true)
    const n = wortzahl(r.ablage.text)
    expect(n).toBeGreaterThanOrEqual(550)
    expect(n).toBeLessThanOrEqual(650)
    expect(r.ablage.protokoll.join(' ')).toContain(`absatzweise auf ${n} Wörter`)
    expect(r.ablage.titel).not.toMatch(/Bewertung/)
  })
})
