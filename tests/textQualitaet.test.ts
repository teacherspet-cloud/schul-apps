import { describe, expect, it } from 'vitest'
import { ausschlussgruende, befundText, bewerte, rangwert, silben, untersuche } from '../src/renderer/src/modules/arbeitsblatt/generation/textQualitaet'

/*
 * Wunsch der Lehrkraft (24.09.2026): „Recherchiere außerdem ausführlich nach
 * Qualitätskriterien für Originalmaterial, um gefundenes Material zu filtern und zu ranken
 * bevor es den Nutzern gezeigt wird."
 *
 * Eine Archivsuche liefert zuverlässig auch Registerseiten, Scans mit Trennstrichen am
 * Zeilenende und Seiten, die zu 80 % aus Navigation bestehen. Diese Tests halten fest, dass
 * die App das erkennt, BEVOR die Lehrkraft jeden Treffer selbst öffnen muss.
 */
const wunsch = { zielWortzahl: 400, jahrgang: 9, sprache: 'de' }

const FLIESSTEXT = Array.from(
  { length: 40 },
  (_, i) =>
    `Der Rat beriet am ${i + 1}. Tag über die Lage der Stadt, und die Bürger verlangten, dass man ihnen die Gründe nenne. Es wurde beschlossen, die Sache zu vertagen.`
).join('\n')

describe('Fließtext erkennen', () => {
  it('nimmt einen gewöhnlichen Sachtext an', () => {
    expect(ausschlussgruende(untersuche(FLIESSTEXT), wunsch)).toEqual([])
  })

  it('wirft ein Register hinaus', () => {
    /*
     * jusText (corpus.tools): Ein Block mit niedriger Stoppwortdichte ist fast immer
     * Navigation oder ein Verzeichnis. Nachgemessen: Auf „Heinrich Heine Loreley" lieferte
     * Wikisource als beste Treffer genau solche Seiten.
     */
    const register = Array.from({ length: 60 }, (_, i) => `Müller, Anton ${100 + i}`).join('\n')
    expect(ausschlussgruende(untersuche(register), wunsch).join(' ')).toContain('Verzeichnis')
  })

  it('wirft Listenzeilen ohne Satzzeichen hinaus', () => {
    // C4 (Raffel u. a. 2019): „We only retained lines that ended in a terminal punctuation mark"
    const liste = Array.from({ length: 40 }, (_, i) => `Kapitel ${i} über die Stadt und ihre Bürger und deren Rat`).join('\n')
    expect(ausschlussgruende(untersuche(liste), wunsch).join(' ')).toContain('Listenzeilen')
  })

  it('wirft einen unaufbereiteten Scan hinaus', () => {
    /*
     * EPA Geschichte 3.3.3: „Die Materialien sind in drucktechnisch einwandfreiem Zustand
     * vorzulegen." Trennstriche am Zeilenende sind das häufigste Überbleibsel einer
     * Buchseite – auf dem Arbeitsblatt stünde dann „Bür- ger" mitten im Satz.
     */
    const scan = FLIESSTEXT.replace(/Bürger/g, 'Bür-\nger')
    expect(ausschlussgruende(untersuche(scan), wunsch).join(' ')).toContain('Scan')
  })

  it('wirft Seitenbeiwerk hinaus', () => {
    const beiwerk = `Zur Navigation springen Zur Suche springen\nAlle Rechte vorbehalten.\nImpressum und Datenschutzerklärung.\n${FLIESSTEXT}`
    expect(ausschlussgruende(untersuche(beiwerk), wunsch).join(' ')).toContain('Seitenbeiwerk')
  })

  it('wirft einen zu kurzen Text hinaus', () => {
    // EPA Geschichte 3.3.3: Material muss „ergiebig genug sein, um ein längeres Arbeiten zu ermöglichen"
    expect(ausschlussgruende(untersuche('Ein einziger kurzer Satz steht hier.'), wunsch).join(' ')).toContain('zu kurz')
  })

  it('wirft eine Zahlentabelle hinaus', () => {
    const tabelle = Array.from({ length: 80 }, (_, i) => `${i}\t${i * 3}\t${i * 7}\t${i * 11}`).join('\n')
    expect(ausschlussgruende(untersuche(tabelle), wunsch).length).toBeGreaterThan(0)
  })
})

describe('Sprachliche Passung', () => {
  it('hält einen frühneuhochdeutschen Text aus der Mittelstufe heraus', () => {
    /*
     * Frühneuhochdeutsch war orthografisch nicht geregelt. In der Oberstufe ist das
     * Gegenstand des Unterrichts, in Klasse 7 eine Hürde, die mit dem Lernziel nichts zu tun
     * hat.
     */
    const alt = FLIESSTEXT.replace(/und/g, 'vnd').replace(/auf/g, 'auff')
    expect(ausschlussgruende(untersuche(alt), { ...wunsch, jahrgang: 7 }).join(' ')).toContain('zu alt')
  })

  it('lässt denselben Text in der Oberstufe zu', () => {
    const alt = FLIESSTEXT.replace(/und/g, 'vnd').replace(/auf/g, 'auff')
    expect(ausschlussgruende(untersuche(alt), { ...wunsch, jahrgang: 12 }).join(' ')).not.toContain('zu alt')
  })
})

describe('Rangfolge', () => {
  it('setzt den Text mit passendem Umfang nach vorn', () => {
    const passend = bewerte(FLIESSTEXT, { ...wunsch, zielWortzahl: 400 })
    const zuLang = bewerte(FLIESSTEXT.repeat(20), { ...wunsch, zielWortzahl: 400 })
    expect(passend.rang).toBeGreaterThan(zuLang.rang)
  })

  it('setzt den sprachlich passenden Text nach vorn', () => {
    /*
     * Zu schwer wiegt stärker als zu leicht: Ein unverständlicher Text blockiert die
     * Aufgabe, ein leichter macht sie nur weniger ergiebig.
     */
    const einfach = 'Die Stadt war alt. Viele Leute lebten dort. Sie hatten Arbeit. '.repeat(30)
    const schwer =
      'Die infrastrukturelle Transformationsdynamik kommunaler Verwaltungseinheiten unterliegt multifaktoriellen Determinanten, deren Interdependenzen sich einer monokausalen Erklärungsstruktur entziehen. '.repeat(
        20
      )
    const a = bewerte(einfach, { ...wunsch, jahrgang: 7, zielWortzahl: 300 })
    const b = bewerte(schwer, { ...wunsch, jahrgang: 7, zielWortzahl: 300 })
    expect(a.rang).toBeGreaterThan(b.rang)
  })

  it('bleibt zwischen 0 und 1', () => {
    for (const text of [FLIESSTEXT, FLIESSTEXT.repeat(30), 'Kurz.', '1 2 3 4 5']) {
      const r = rangwert(untersuche(text), wunsch)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })
})

describe('Messwerte', () => {
  it('zählt Silben brauchbar', () => {
    expect(silben('Haus')).toBe(1)
    expect(silben('Stadtrat')).toBe(2)
    expect(silben('Verwaltung')).toBe(3)
  })

  it('rechnet die Wiener Sachtextformel als Schulstufe', () => {
    /*
     * WSTF1 = 0,1935·MS + 0,1672·SL + 0,1297·IW − 0,0327·ES − 0,875
     * (Bamberger/Vanecek 1984). Die Skala reicht von Schulstufe 4 bis 15.
     */
    const b = untersuche(FLIESSTEXT)
    expect(b.wstf).toBeGreaterThanOrEqual(4)
    expect(b.wstf).toBeLessThanOrEqual(15)
    // Und ein deutlich schwererer Text bekommt auch eine hoehere Stufe
    const schwer =
      'Die infrastrukturelle Transformationsdynamik kommunaler Verwaltungseinheiten unterliegt multifaktoriellen Determinanten, deren Interdependenzen sich einer monokausalen Erklaerungsstruktur weitgehend entziehen. '.repeat(
        20
      )
    expect(untersuche(schwer).wstf).toBeGreaterThan(b.wstf)
  })

  it('beschreibt den Befund in einem Satz, den man versteht', () => {
    // Die Lehrkraft muss die Reihenfolge nachvollziehen können, um ihr zu widersprechen
    const text = befundText(untersuche(FLIESSTEXT), wunsch)
    expect(text).toContain('Wörter')
    expect(text).toMatch(/leicht|passend|anspruchsvoll/)
  })
})
