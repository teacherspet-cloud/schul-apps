import { describe, expect, it } from 'vitest'
import type { TextBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import {
  absaetzeVon,
  aufgabeMitZitat,
  auslassen,
  erklaerSprache,
  fassungWechseln,
  findeImRohtext,
  formatiere,
  fussnoteEinfuegen,
  quelleMitVermerk,
  quelleOhneVermerk,
  vereinfachen,
  worthilfeSprache,
  zeilenAngabe,
  zeilenAusLage,
  zitiere,
  zuLuecken,
  type TextAuswahl
} from '../src/renderer/src/modules/arbeitsblatt/didactics/textauswahl'
import { anmerkungenVon } from '../src/renderer/src/modules/arbeitsblatt/didactics/anmerkungen'
import { parseInline, plainText } from '../src/renderer/src/shared/richtext/parse'

const text = (patch: Partial<TextBlock> = {}): TextBlock => ({
  id: 'm1',
  type: 'text',
  title: 'Shakespeare today',
  body: 'We must preserve the old plays. They are more relevant than ever.\n\nThe theatre is full every night.',
  lineNumbers: true,
  source: 'Claudia Olk: Interview, 2025',
  glossary: [],
  ...patch
})

/** Markierung eines Worts im ersten Absatz */
const wort = (body: string, w: string, absatz = 0): TextAuswahl => {
  const p = absaetzeVon(body)[absatz]
  const i = p.indexOf(w)
  return { von: { absatz, index: i }, bis: { absatz, index: i + w.length } }
}

describe('Fußnoten: Zählung je Material', () => {
  it('setzt die Marke hinter das Wort und zählt in der Reihenfolge im Text', () => {
    const b = text()
    fussnoteEinfuegen(b, wort(b.body, 'relevant'), { wort: 'relevant', text: 'important now' })
    fussnoteEinfuegen(b, wort(b.body, 'preserve'), { wort: 'to preserve', text: 'to keep sth. as it is' })
    expect(b.body).toContain('preserve[^f2] the')
    const { anzeige, anmerkungen } = anmerkungenVon(b)
    // „preserve" steht vor „relevant" – also ¹ preserve, ² relevant, obwohl später eingefügt
    expect(anzeige).toContain('preserve^{1} the')
    expect(anzeige).toContain('relevant^{2} than')
    expect(anmerkungen.map((a) => `${a.nr} ${a.wort}`)).toEqual(['1 to preserve', '2 relevant'])
  })

  it('zählt nach dem Löschen einer Marke neu', () => {
    const b = text()
    fussnoteEinfuegen(b, wort(b.body, 'preserve'), { wort: 'to preserve', text: 'keep' })
    fussnoteEinfuegen(b, wort(b.body, 'relevant'), { wort: 'relevant', text: 'important' })
    b.body = b.body.replace('[^f1]', '')
    const { anzeige, anmerkungen } = anmerkungenVon(b)
    expect(anzeige).toContain('relevant^{1}')
    expect(anmerkungen).toHaveLength(1)
    expect(anmerkungen[0]).toMatchObject({ nr: 1, wort: 'relevant' })
  })

  it('Satzzeichen am Ende der Markierung stehen hinter der Marke', () => {
    const b = text()
    const p = absaetzeVon(b.body)[0]
    const i = p.indexOf('plays.')
    fussnoteEinfuegen(b, { von: { absatz: 0, index: i }, bis: { absatz: 0, index: i + 6 } }, { wort: 'play', text: 'drama' })
    expect(b.body).toContain('plays[^f1].')
  })

  it('zählt Worthilfen und Fußnoten gemeinsam – die Worthilfe bekommt ihre Ziffer im Text', () => {
    const b = text({ glossary: [{ term: 'theatre', explanation: 'Theater' }] })
    fussnoteEinfuegen(b, wort(b.body, 'preserve'), { wort: 'to preserve', text: 'keep' })
    const { anzeige, anmerkungen } = anmerkungenVon(b)
    expect(anzeige).toContain('preserve^{1}')
    expect(anzeige).toContain('theatre^{2} is')
    expect(anmerkungen.map((a) => [a.nr, a.art])).toEqual([
      [1, 'fussnote'],
      [2, 'worthilfe']
    ])
  })
})

describe('Bestehende Worthilfen bekommen hochgestellte Ziffern', () => {
  it('findet das erste Vorkommen (auch gebeugt) und setzt keine doppelte Marke', () => {
    const b = text({
      body: 'Die Pfandflaschen werden gesammelt. Das Pfand bekommt man zurück. Das Pfandes wegen.',
      glossary: [
        { term: 'Pfand', explanation: 'deposit' },
        { term: 'sammeln', explanation: 'to collect' }
      ]
    })
    const a = anmerkungenVon(b)
    expect(a.anzeige).toContain('Das Pfand^{1} bekommt')
    expect(a.anzeige.match(/\^\{1\}/g)).toHaveLength(1)
    // „sammeln" steht nicht wörtlich im Text: Ziffer vor der Anmerkung, aber keine im Text
    expect(a.anmerkungen[1]).toMatchObject({ nr: 2, imText: false })
    // Idempotent: dieselbe Anzeige bei erneutem Aufruf
    expect(anmerkungenVon(b).anzeige).toBe(a.anzeige)
  })

  it('überführt alte Kennzeichnungen („(1)", „[2]", „¹", „*") in hochgestellte Ziffern', () => {
    const b = text({
      body: 'We must preserve (1) the plays. They are relevant[2] today. The stage¹ is old. A ghost* appears.',
      glossary: [
        { term: '(1) preserve', explanation: 'bewahren' },
        { term: '[2] relevant', explanation: 'wichtig' },
        { term: '¹ stage', explanation: 'Bühne' },
        { term: '* ghost', explanation: 'Geist' }
      ]
    })
    const a = anmerkungenVon(b)
    expect(a.anzeige).toBe('We must preserve^{1} the plays. They are relevant^{2} today. The stage^{3} is old. A ghost^{4} appears.')
    expect(a.anmerkungen.map((x) => x.wort)).toEqual(['preserve', 'relevant', 'stage', 'ghost'])
    expect(plainText(a.anzeige)).not.toMatch(/\(1\)|\[2\]|¹|\*/)
  })

  it('setzt keine Marke in Formeln oder Lücken', () => {
    const b = text({ body: 'Die Masse $m$ und die [[Masse]] und die Masse.', glossary: [{ term: 'Masse', explanation: 'Gewicht' }] })
    expect(anmerkungenVon(b).anzeige).toBe('Die Masse^{1} $m$ und die [[Masse]] und die Masse.')
  })
})

describe('Hochgestellt, unterstrichen, markiert im Textformat', () => {
  it('liest ^{n}, ++…++ und ==…== verschachtelt', () => {
    const inl = parseInline('a ==**wichtig** und ++klar++== b^{1}')
    expect(inl).toEqual([
      { t: 'text', text: 'a ' },
      { t: 'text', text: 'wichtig', bold: true, mark: true },
      { t: 'text', text: ' und ', mark: true },
      { t: 'text', text: 'klar', mark: true, underline: true },
      { t: 'text', text: ' b' },
      { t: 'text', text: '1', sup: true }
    ])
  })

  it('lässt alte Texte unverändert (Sternchen in Rechnungen bleiben stehen)', () => {
    expect(parseInline('5 * 3 = 15 und 2 * 4')).toEqual([{ t: 'text', text: '5 * 3 = 15 und 2 * 4' }])
    expect(parseInline('**fett** und *kursiv*')).toEqual([
      { t: 'text', text: 'fett', bold: true },
      { t: 'text', text: ' und ' },
      { t: 'text', text: 'kursiv', italic: true }
    ])
  })
})

describe('Markierung im Blatt → Stelle im Rohtext', () => {
  it('findet die Stelle trotz Auszeichnungen und Fußnotenmarken', () => {
    const roh = 'We **must** preserve[^f1] the plays.'
    const [von, bis] = findeImRohtext(roh, 'must preserve the')!
    expect(roh.slice(von, bis)).toBe('must** preserve[^f1] the')
  })
  it('nimmt das gezählte Vorkommen', () => {
    const roh = 'the cat and the dog'
    expect(findeImRohtext(roh, 'the', 1)).toEqual([12, 15])
  })
})

describe('Auslassen […]', () => {
  it('ersetzt die Markierung, bereinigt Leerraum und vermerkt die Kürzung in der Quelle', () => {
    const b = text()
    auslassen(b, wort(b.body, 'They are more relevant than ever.'))
    expect(absaetzeVon(b.body)[0]).toBe('We must preserve the old plays. […]')
    expect(b.source).toBe('Claudia Olk: Interview, 2025 (gekürzt)')
    // Zweimal kürzen: kein doppelter Vermerk, benachbarte Auslassungen verschmelzen
    auslassen(b, wort(b.body, 'the old plays.'))
    expect(absaetzeVon(b.body)[0]).toBe('We must preserve […]')
    expect(b.source).toBe('Claudia Olk: Interview, 2025 (gekürzt)')
  })
  it('lässt Worthilfen fallen, deren Begriff mit ausgelassen wurde', () => {
    const b = text({ glossary: [{ term: 'relevant', explanation: 'wichtig' }] })
    auslassen(b, wort(b.body, 'They are more relevant than ever.'))
    expect(b.glossary).toEqual([])
  })
  it('über zwei Absätze: die Absätze verschmelzen', () => {
    const b = text()
    const p = absaetzeVon(b.body)
    b.body = b.body
    auslassen(b, { von: { absatz: 0, index: p[0].indexOf('They') }, bis: { absatz: 1, index: p[1].indexOf('full') } })
    expect(absaetzeVon(b.body)).toEqual(['We must preserve the old plays. […] full every night.'])
  })
})

describe('Quellenvermerk', () => {
  it('fasst Vermerke zusammen und lässt vorhandene Hinweise stehen', () => {
    expect(quelleMitVermerk('A (gekürzt)', 'vereinfacht')).toBe('A (gekürzt, vereinfacht)')
    expect(quelleMitVermerk('A. Der Text wurde für diese Aufgabe gekürzt.', 'gekürzt')).toBe('A. Der Text wurde für diese Aufgabe gekürzt.')
    expect(quelleMitVermerk('', 'gekürzt')).toBe('')
    expect(quelleOhneVermerk('A (gekürzt, vereinfacht)', 'vereinfacht')).toBe('A (gekürzt)')
    expect(quelleOhneVermerk('A (vereinfacht)', 'vereinfacht')).toBe('A')
  })
})

describe('Einfacher formulieren', () => {
  it('behält das Original als Fassung und schaltet zurück', () => {
    const b = text()
    const original = b.body
    vereinfachen(b, wort(b.body, 'They are more relevant than ever.'), 'They are very important today.')
    expect(b.body).toContain('They are very important today.')
    expect(b.source).toContain('(vereinfacht)')
    fassungWechseln(b)
    expect(b.body).toBe(original)
    expect(b.source).toBe('Claudia Olk: Interview, 2025')
    fassungWechseln(b)
    expect(b.body).toContain('very important')
  })
})

describe('Lücken', () => {
  it('macht aus jedem markierten Wort eine eigene Lücke, Satzzeichen bleiben', () => {
    const b = text()
    expect(absaetzeVon(zuLuecken(b.body, wort(b.body, 'old plays.')))[0]).toBe('We must preserve the [[old]] [[plays]]. They are more relevant than ever.')
    // Hintereinander: vorhandene Lücken bleiben unverändert
    const einmal = zuLuecken(b.body, wort(b.body, 'old'))
    const zweimal = zuLuecken(einmal, wort(einmal, '[[old]] plays'))
    expect(absaetzeVon(zweimal)[0]).toContain('the [[old]] [[plays]].')
  })
})

describe('Hervorheben', () => {
  it('setzt und entfernt Auszeichnungen', () => {
    const b = text()
    const fett = formatiere(b.body, wort(b.body, 'preserve'), 'fett')
    expect(absaetzeVon(fett)[0]).toContain('must **preserve** the')
    const wieder = formatiere(fett, wort(fett, 'preserve'), 'fett')
    expect(absaetzeVon(wieder)[0]).toContain('must preserve the')
    const markiert = formatiere(b.body, wort(b.body, 'old plays'), 'markiert')
    expect(absaetzeVon(markiert)[0]).toContain('the ==old plays==.')
    const unter = formatiere(b.body, wort(b.body, 'relevant'), 'unterstrichen')
    expect(parseInline(absaetzeVon(unter)[0]).find((i) => i.t === 'text' && i.underline)).toMatchObject({ text: 'relevant' })
  })
})

describe('Sprache der Erklärung', () => {
  it('wählt Deutsch oder einsprachig die Zielsprache', () => {
    // Sek II Englisch → Englisch
    expect(erklaerSprache({ zielsprache: 'en', jahrgang: 12 })).toBe('en')
    // niedriger Jahrgang → Deutsch
    expect(erklaerSprache({ zielsprache: 'en', jahrgang: 6 })).toBe('de')
    // Niveau B1 schon in Klasse 9 → Zielsprache
    expect(erklaerSprache({ zielsprache: 'fr', jahrgang: 9, cefr: 'B1' })).toBe('fr')
    // deutscher Ausgangstext einer Sprachmittlung → Deutsch; Worthilfe dort in der Zielsprache
    expect(erklaerSprache({ zielsprache: 'en', jahrgang: 12 }, 'de')).toBe('de')
    expect(worthilfeSprache({ zielsprache: 'en', jahrgang: 12 }, 'de')).toBe('en')
    // Sachfach und Latein → Deutsch
    expect(erklaerSprache({ jahrgang: 12 })).toBe('de')
    expect(erklaerSprache({ zielsprache: 'la', jahrgang: 12 })).toBe('de')
  })
})

describe('Aufgabe mit eingebautem Zitat', () => {
  it('Deutsch, Sie-Form: Nebensatz mit Komma, „…“ im Satz, Zeilenangabe vor dem Punkt', () => {
    const satz = aufgabeMitZitat({
      operator: 'erläutern',
      rahmen: 'inwiefern Shakespeare laut Olk {ZITAT} überschreitet',
      zitat: 'die Grenzen des Möglichen und Vorstellbaren',
      sprache: 'de',
      anrede: 'sie',
      zeilen: [12, 14]
    })
    expect(satz).toBe('**Erläutern** Sie, inwiefern Shakespeare laut Olk „die Grenzen des Möglichen und Vorstellbaren“ überschreitet (Z. 12–14).')
  })

  it('Deutsch, trennbares Verb in du-Form: Partikel an der richtigen Stelle', () => {
    const satz = aufgabeMitZitat({
      operator: 'herausarbeiten',
      rahmen: 'wie die Autorin ihre These {ZITAT} begründet',
      zitat: 'Theater ist Gegenwart.',
      sprache: 'de',
      anrede: 'du',
      zeilen: [3, 3]
    })
    expect(satz).toBe('**Arbeite** heraus, wie die Autorin ihre These „Theater ist Gegenwart“ begründet (Z. 3).')
  })

  it('Englisch: “…” und „l."', () => {
    const satz = aufgabeMitZitat({
      operator: 'explain',
      rahmen: "why the author claims that Shakespeare's plays are {ZITAT}",
      zitat: 'more relevant than ever.',
      sprache: 'en',
      anrede: 'sie',
      zeilen: [5, 5]
    })
    expect(satz).toBe("**Explain** why the author claims that Shakespeare's plays are “more relevant than ever” (l. 5).")
  })

  it('Französisch: « … » mit schmalem Leerzeichen', () => {
    const satz = aufgabeMitZitat({
      operator: 'expliquer',
      rahmen: "pourquoi l'auteure affirme que les pièces sont {ZITAT}",
      zitat: 'plus actuelles que jamais',
      sprache: 'fr',
      anrede: 'sie',
      zeilen: [7, 9]
    })
    expect(satz).toContain('« plus actuelles que jamais »'.replace(/ /g, ' ').replace(' plus actuelles que jamais', ' plus actuelles que jamais'))
    expect(satz).toContain('(l. 7–9).')
    expect(satz.startsWith('**')).toBe(true)
  })

  it('baut ein abgesetztes Zitat hinter einem Doppelpunkt in den Satz ein', () => {
    const satz = aufgabeMitZitat({ operator: 'erläutern', rahmen: 'die folgende Aussage: {ZITAT}', zitat: 'Theater lebt', sprache: 'de', anrede: 'sie' })
    expect(satz).toBe('**Erläutern** Sie die folgende Aussage „Theater lebt“.')
    expect(satz).not.toMatch(/:\s*„/)
  })

  it('ohne Platzhalter: das Zitat bleibt Teil des Satzes', () => {
    const satz = aufgabeMitZitat({ operator: 'explain', rahmen: '', zitat: '“more relevant than ever”', sprache: 'en', anrede: 'sie', zeilen: [5, 6] })
    expect(satz).toBe('**Explain** the statement “more relevant than ever” (ll. 5–6).')
  })

  it('setzt innere Anführungszeichen halb und nennt das Material bei mehreren', () => {
    expect(zitiere('er sagt „nein“ dazu', 'de')).toBe('„er sagt ‚nein‘ dazu“')
    const satz = aufgabeMitZitat({
      operator: 'analysieren',
      rahmen: 'die Wirkung von {ZITAT}',
      zitat: 'Sturm',
      sprache: 'de',
      anrede: 'du',
      zeilen: [2, 2],
      material: 'M{q1}'
    })
    expect(satz).toBe('**Analysiere** die Wirkung von „Sturm“ (M{q1}, Z. 2).')
  })
})

describe('Zeilen', () => {
  it('Zeilenangaben je Sprache', () => {
    expect(zeilenAngabe(12, 14, 'de')).toBe('Z. 12–14')
    expect(zeilenAngabe(5, 5, 'en')).toBe('l. 5')
    expect(zeilenAngabe(5, 7, 'en')).toBe('ll. 5–7')
  })
  it('Zeilen aus der Lage im Blatt, auch auf der Folgeseite', () => {
    expect(zeilenAusLage(0, 20, 24)).toEqual([1, 1])
    expect(zeilenAusLage(48, 92, 24)).toEqual([3, 4])
    expect(zeilenAusLage(0, 20, 24, 30)).toEqual([31, 31])
  })
})
