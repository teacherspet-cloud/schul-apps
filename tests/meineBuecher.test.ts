import { describe, expect, it } from 'vitest'
import {
  abcEintraege,
  alphabetisch,
  anfangsbuchstabe,
  baendeWahl,
  bandRang,
  buchKurz,
  fenster,
  mitKoepfen,
  sortierform,
  unitKurz,
  type MeinBuch
} from '../src/shared/meineBuecher'
import type { WortlisteWort, WortStatus } from '../src/shared/wortliste'
import { sichtbarerTeil } from '../src/renderer/src/modules/lernen/regal/ordnerAnimation'
import { mitWortliste } from '../src/renderer/src/modules/lernen/regal/Ordner'
import { BUECHER_DEUTSCH, BUECHER_TEXTE, buecherTexte } from '../src/renderer/src/modules/lernen/regal/buecherTexte'

const w = (term: string, translation: string, status: WortStatus = 'neu', id = term): WortlisteWort => ({ id, term, translation, status })
const GL = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `green-line-${n}`, band: String(n), grade: n + 4 }))

describe('Meine Bücher: Bände nach Klassenstufe', () => {
  it('frühere Bände vollständig, der aktuelle aus den Freigaben', () => {
    expect(baendeWahl(GL, 'green-line-3', 7)).toEqual({ frueher: ['green-line-1', 'green-line-2'], aktuell: 'green-line-3' })
    // Reihenfolge der Eingabe egal
    expect(baendeWahl([...GL].reverse(), 'green-line-3', 7).frueher).toEqual(['green-line-1', 'green-line-2'])
  })
  it('Band 1 hat keine früheren; die Klasse hinkt hinterher: es zählt der freigegebene Band', () => {
    expect(baendeWahl(GL, 'green-line-1', 5)).toEqual({ frueher: [], aktuell: 'green-line-1' })
    expect(baendeWahl(GL, 'green-line-2', 8)).toEqual({ frueher: ['green-line-1'], aktuell: 'green-line-2' })
  })
  it('ohne Freigabe aus der Reihe: Bände unterhalb der Klassenstufe, kein aktueller', () => {
    expect(baendeWahl(GL, null, 8)).toEqual({ frueher: ['green-line-1', 'green-line-2', 'green-line-3'], aktuell: null })
    expect(baendeWahl(GL, null, null)).toEqual({ frueher: [], aktuell: null })
    expect(baendeWahl(GL, 'gibt-es-nicht', null)).toEqual({ frueher: [], aktuell: null })
  })
  it('ohne Klassenstufe am Band: Bandnummer, Wortbände („Transition") zuletzt', () => {
    expect(bandRang({ band: '2' })).toBe(6)
    expect(bandRang({ band: 'Transition' })).toBe(99)
    expect(bandRang({ band: 'Transition', grade: 11 })).toBe(11)
    const ohne = [{ id: 't', band: 'Transition' }, { id: 'b2', band: '2' }, { id: 'b1', band: '1' }]
    expect(baendeWahl(ohne, 't')).toEqual({ frueher: ['b1', 'b2'], aktuell: 't' })
  })
})

describe('Meine Bücher: Kurzformen der Fundstellen', () => {
  it('Band und Unit', () => {
    expect(buchKurz({ name: 'Green Line 2', reihe: 'Green Line', band: '2' })).toBe('GL 2')
    expect(buchKurz({ name: 'Green Line Transition', reihe: 'Green Line', band: 'Transition' })).toBe('GL T')
    expect(buchKurz({ name: 'Découvertes 1', reihe: 'Découvertes', band: '1' })).toBe('Déc 1')
    expect(unitKurz('Unit 3')).toBe('U3')
    expect(unitKurz('Topic 1')).toBe('T1')
    expect(unitKurz('Across cultures 2')).toBe('AC2')
    expect(unitKurz('Welcome back')).toBe('WB')
    expect(unitKurz('Hello')).toBe('Hello')
  })
})

describe('Alphabetisch: Sortierform', () => {
  it('ohne „to ", Artikel und Akzente', () => {
    expect(sortierform('to go', 'en')).toBe('go')
    expect(sortierform('(to) look after sb.', 'en')).toBe('look after sb.')
    expect(sortierform('the UK', 'en')).toBe('uk')
    expect(sortierform('an apple', 'en')).toBe('apple')
    expect(sortierform('a', 'en')).toBe('a')
    expect(sortierform('la école', 'fr')).toBe('ecole')
    expect(sortierform("l'élève", 'fr')).toBe('eleve')
    expect(sortierform('les Champs-Élysées', 'fr')).toBe('champs-elysees')
    expect(sortierform('el niño', 'es')).toBe('nino')
    expect(sortierform('las manzanas', 'es')).toBe('manzanas')
    // Ohne bekannte Sprache bleibt der Artikel (Latein hat keinen)
    expect(sortierform('the end')).toBe('the end')
    expect(sortierform('…ever', 'en')).toBe('ever')
  })
  it('Buchstabe für die Sprungleiste', () => {
    expect(anfangsbuchstabe('apple')).toBe('A')
    expect(anfangsbuchstabe(sortierform('école', 'fr'))).toBe('E')
    expect(anfangsbuchstabe('1st')).toBe('#')
    expect(anfangsbuchstabe('дом')).toBe('Д')
  })
})

describe('Alphabetisch: sortieren und zusammenführen', () => {
  const buch = (id: string, kurz: string, gruppen: [string, WortlisteWort[]][], aktuell = false): MeinBuch => ({
    id,
    name: id,
    aktuell,
    kurz,
    gruppen: gruppen.map(([titel, woerter], i) => ({ key: `${id}:${i}`, titel, zeit: 0, folge: i, woerter }))
  })
  const buecher = [
    buch('gl1', 'GL 1', [
      ['Unit 1 · Station 1', [w('to go', 'gehen', 'sicher'), w('the house', 'das Haus'), w('apple', 'Apfel')]],
      ['Unit 2 · Station 1', [w('bank', 'Bank'), w('Zebra', 'Zebra')]]
    ]),
    buch('gl2', 'GL 2', [['Unit 3 · Check-in', [w('to Go', 'gehen', 'aufbau'), w('bank', 'Ufer'), w('ábc', 'Abc')]]], true)
  ]
  const zeilen = alphabetisch(abcEintraege(buecher, [{ key: 'k', titel: 'Wetter', zeit: 1, folge: 0, woerter: [w('apple', 'Apfel')] }], 'Weitere Wörter'), 'en')
  it('A–Z nach der Sortierform, gleiche Wörter einmal mit allen Fundstellen', () => {
    expect(zeilen.map((z) => z.term)).toEqual(['ábc', 'apple', 'bank', 'bank', 'to go', 'the house', 'Zebra'])
    const go = zeilen.find((z) => z.term === 'to go')!
    expect(go.quellen).toEqual(['GL 1 · U1', 'GL 2 · U3'])
    // bester Stand
    expect(go.status).toBe('sicher')
    expect(zeilen.find((z) => z.term === 'apple')!.quellen).toEqual(['GL 1 · U1', 'Weitere Wörter'])
    // gleiches Wort, andere Bedeutung: eigene Zeilen
    expect(zeilen.filter((z) => z.term === 'bank').map((z) => z.translation)).toEqual(['Bank', 'Ufer'])
  })
  it('Buchstaben-Überschriften nur für Buchstaben mit Wörtern', () => {
    const p = mitKoepfen(zeilen)
    const koepfe = p.flatMap((x) => (x.art === 'kopf' ? [`${x.buchstabe}${x.anzahl}`] : []))
    expect(koepfe).toEqual(['A2', 'B2', 'G1', 'H1', 'Z1'])
    expect(p.length).toBe(zeilen.length + 5)
  })
  it('schnell genug für Tausende Wörter', () => {
    const viele = Array.from({ length: 8000 }, (_, i) => ({ w: w(`word${(i * 7919) % 8000}`, `Wort ${i}`, 'neu', `id${i}`), quelle: `GL ${1 + (i % 5)} · U${1 + (i % 6)}` }))
    const t = performance.now()
    const z = alphabetisch(viele, 'en')
    expect(z.length).toBe(8000)
    expect(z[0].term).toBe('word0')
    expect(performance.now() - t).toBeLessThan(2000)
  })
})

describe('Alphabetisch: Fenster', () => {
  const oben = Array.from({ length: 1001 }, (_, i) => i * 30)
  it('zeichnet nur den sichtbaren Ausschnitt mit Vorrat', () => {
    expect(fenster(oben, 0, 600, 0)).toEqual({ von: 0, bis: 21 })
    const f = fenster(oben, 3000, 3600, 300)
    expect(f.von).toBe(90)
    expect(f.bis).toBe(131)
    expect(fenster(oben, 40000, 41000, 0)).toEqual({ von: 999, bis: 1000 })
    expect(fenster([0], 0, 100)).toEqual({ von: 0, bis: 0 })
  })
})

describe('Ordner: Register und Deckelmaß', () => {
  it('„Meine Bücher" und „Alphabetisch" gleich hinter „Vokabeln"', () => {
    expect(mitWortliste(['vok', 'gram', 'mat'])).toEqual(['vok', 'wort', 'abc', 'gram', 'mat'])
    expect(mitWortliste(['gram'])).toEqual(['gram'])
  })
  it('Deckel genau so breit wie der Ordner, bei langem Inhalt bis zum Bildrand', () => {
    expect(sichtbarerTeil({ left: 20, top: 100, width: 700, bottom: 600 }, 900)).toEqual({ x: 20, y: 100, b: 700, h: 500 })
    expect(sichtbarerTeil({ left: 20, top: 100, width: 700, bottom: 3000 }, 900)).toEqual({ x: 20, y: 100, b: 700, h: 800 })
    expect(sichtbarerTeil({ left: 0, top: -50, width: 390, bottom: 2000 }, 844)).toEqual({ x: 0, y: 0, b: 390, h: 844 })
  })
})

describe('Meine Bücher: Texte in der Fremdsprache', () => {
  it('alle 17 Sprachen vollständig und übersetzt, sonst deutsch (auch DaZ)', () => {
    const de = buecherTexte('Geschichte')
    expect(de.weitere).toBe('Weitere Wörter')
    expect(de.bisJetzt).toBe('bis jetzt')
    expect(buecherTexte('Deutsch als Zweitsprache').weitere).toBe('Weitere Wörter')
    expect(buecherTexte('Englisch').weitere).toBe('More words')
    expect(buecherTexte('Englisch').woerter(1)).toBe('1 word')
    expect(buecherTexte('Englisch').nichts('xyz')).toBe('Nothing found for “xyz”.')
    expect(buecherTexte('Französisch').bisJetzt).toBe("jusqu'ici")
    expect(buecherTexte('Latein').weitere).toBe('Alia verba')
    expect(Object.keys(BUECHER_TEXTE).sort()).toEqual(['ar', 'cs', 'da', 'el', 'en', 'es', 'fr', 'grc', 'it', 'ja', 'la', 'nl', 'pl', 'pt', 'ru', 'tr', 'zh'])
    for (const [sp, t] of Object.entries(BUECHER_TEXTE)) {
      for (const k of ['suche', 'weitere', 'bisJetzt', 'freigegeben', 'ganzerBand', 'ohneBuch', 'mehr', 'leer', 'bord', 'springen', 'beispiel'] as const) {
        expect(t[k], `${sp}.${k}`).toBeTruthy()
        expect(t[k], `${sp}.${k} übersetzt`).not.toBe(BUECHER_DEUTSCH[k])
      }
      for (const f of [t.treffer, t.trefferAlle, t.woerter, t.sicher]) expect(f(12)).toContain('12')
      expect(t.nichts('qq')).toContain('qq')
      expect(t.anhoeren('ww')).toContain('ww')
      expect(t.oeffnen('bb')).toContain('bb')
      expect(new Set(Object.values(t.status)).size, `${sp}: drei Stände`).toBe(3)
    }
  })
})
