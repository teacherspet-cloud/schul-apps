import { describe, expect, it } from 'vitest'
import { kursGruppen, suchform, wortlisteFiltern, wortStatus, zusammenfuehren, type WortlisteGruppe } from '../src/shared/wortliste'
import { abschnitteEinordnen } from '../src/shared/kursAbschnitte'
import { neuerStand, TAG, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import { beschriftung } from '../src/renderer/src/modules/lernen/regal/beschriftung'

const w = (id: string, term: string, translation: string, example?: string): Vokabel => ({ id, term, translation, ...(example ? { example } : {}) })
const gruppe = (key: string, zeit: number, woerter: Vokabel[]): WortlisteGruppe => ({
  key,
  titel: key,
  zeit,
  folge: 0,
  woerter: woerter.map((v) => ({ ...v, status: 'neu' as const }))
})

describe('Wortliste: Stand je Wort', () => {
  it('neu, im Aufbau, sicher', () => {
    expect(wortStatus(undefined)).toBe('neu')
    expect(wortStatus(neuerStand())).toBe('neu')
    const aufbau: WortStand = { ...neuerStand(), fach: 2, versuche: 3 }
    expect(wortStatus(aufbau)).toBe('aufbau')
    const t = Date.now()
    expect(wortStatus({ ...aufbau, fach: 4, frei: [t - 8 * TAG, t] })).toBe('sicher')
    expect(wortStatus({ ...aufbau, fach: 6 })).toBe('sicher')
  })
})

describe('Wortliste: Gruppen', () => {
  it('teilt einen Kurs nach Abschnitten, Unit aus dem Titel, neueste zuerst', () => {
    const woerter = [w('a', 'dog', 'Hund'), w('b', 'cat', 'Katze'), w('c', 'house', 'Haus')]
    const teile = [
      { titel: 'Green Line 1 - Unit 1 - Station 1', anzahl: 2, zeit: 1000 },
      { titel: 'Unit 2 · Station 1', anzahl: 1, zeit: 2000 }
    ]
    const g = kursGruppen('k1', teile, abschnitteEinordnen(teile, null), woerter, { a: { ...neuerStand(), fach: 2, versuche: 1 } })
    expect(g.map((x) => x.woerter.length)).toEqual([2, 1])
    expect(g[0].titel).toContain('Unit 1')
    expect(g[0].woerter[0].status).toBe('aufbau')
    expect(g[0].woerter[1].status).toBe('neu')
    const z = zusammenfuehren(g)
    expect(z[0].key).toBe('k1:1')
  })
  it('übrige Wörter (Summe passt nicht) landen im letzten Abschnitt; leere fallen weg', () => {
    const g = kursGruppen(
      'k',
      [
        { titel: 'A', anzahl: 1, zeit: 1 },
        { titel: 'B', anzahl: 0, zeit: 2 }
      ],
      [],
      [w('1', 'a', 'x'), w('2', 'b', 'y'), w('3', 'c', 'z')],
      {}
    )
    expect(g.map((x) => [x.titel, x.woerter.length])).toEqual([
      ['A', 1],
      ['B', 2]
    ])
  })
  it('jedes Wort nur einmal – im Abschnitt, in dem es zuerst kam', () => {
    const z = zusammenfuehren([gruppe('neu', 200, [w('1', 'chien', 'Hund'), w('2', 'chat', 'Katze')]), gruppe('alt', 100, [w('9', 'Chien', 'Hund')])])
    expect(z.map((g) => g.key)).toEqual(['neu', 'alt'])
    expect(z[0].woerter.map((x) => x.term)).toEqual(['chat'])
    expect(z[1].woerter.map((x) => x.term)).toEqual(['Chien'])
  })
})

describe('Wortliste: Suche (alle Sprachen)', () => {
  const gruppen = [
    gruppe('fr', 3, [w('1', 'l’été', 'der Sommer', 'En été, il fait chaud.'), w('2', 'le château', 'das Schloss'), w('3', 'Où est la gare ?', 'Wo ist der Bahnhof?')]),
    gruppe('es', 2, [w('4', 'el niño', 'das Kind'), w('5', 'la señora', 'die Frau'), w('6', 'pingüino', 'Pinguin')]),
    gruppe('la', 1, [w('7', 'āmīcus', 'Freund'), w('8', 'rēx, rēgis m.', 'König'), w('9', 'puella', 'Mädchen')]),
    gruppe('ru', 0, [w('10', 'ёлка', 'Tannenbaum'), w('11', 'мой', 'mein'), w('12', 'книга', 'Buch'), w('13', 'Москва', 'Moskau')]),
    gruppe('grc', -1, [w('14', 'λόγος', 'Wort'), w('15', 'ἄνθρωπος', 'Mensch')])
  ]
  const finde = (q: string): string[] => wortlisteFiltern(gruppen, q).gruppen.flatMap((g) => g.woerter.map((x) => x.id))
  it('Suchform: klein, ohne Akzente, Apostroph vereinheitlicht', () => {
    expect(suchform('  L’ÉTÉ  ')).toBe("l'ete")
    expect(suchform('Straße')).toBe('strasse')
    expect(suchform('Œuvre')).toBe('oeuvre')
  })
  it('leere Suche: alles, mit Anzahl', () => {
    expect(wortlisteFiltern(gruppen, '  ').anzahl).toBe(15)
  })
  it('Französisch: é/è/ê und â egal, Apostroph egal, auch Deutsch', () => {
    expect(finde('ete')).toEqual(['1'])
    expect(finde("l'été")).toEqual(['1'])
    expect(finde('chateau')).toEqual(['2'])
    expect(finde('CHÂTEAU')).toEqual(['2'])
    expect(finde('schloss')).toEqual(['2'])
    expect(finde('ou est')).toEqual(['3'])
  })
  it('Spanisch: ñ und ü', () => {
    expect(finde('nino')).toEqual(['4'])
    expect(finde('niño')).toEqual(['4'])
    expect(finde('senora')).toEqual(['5'])
    expect(finde('pinguino')).toEqual(['6'])
  })
  it('Latein: Makra egal (getippt mit oder ohne)', () => {
    expect(finde('amicus')).toEqual(['7'])
    expect(finde('āmīcus')).toEqual(['7'])
    expect(finde('rex regis')).toEqual(['8'])
    expect(finde('könig')).toEqual(['8'])
  })
  it('Russisch: Kyrillisch wie getippt, ё = е, й bleibt eigener Buchstabe', () => {
    expect(finde('ёлка')).toEqual(['10'])
    expect(finde('елка')).toEqual(['10'])
    expect(finde('мой')).toEqual(['11'])
    expect(finde('мои')).toEqual([])
    expect(finde('МОСКВА')).toEqual(['13'])
    expect(finde('moskva')).toEqual([])
    expect(finde('buch')).toEqual(['12'])
  })
  it('Griechisch: Akzente und Hauchzeichen egal', () => {
    expect(finde('λογος')).toEqual(['14'])
    expect(finde('ανθρωπος')).toEqual(['15'])
  })
  it('findet auch im Beispielsatz; Treffer zählen, Gruppen ohne Treffer fallen weg', () => {
    const r = wortlisteFiltern(gruppen, 'chaud')
    expect(r.anzahl).toBe(1)
    expect(r.gruppen.map((g) => g.key)).toEqual(['fr'])
  })
  it('2000 Wörter filtern schnell', () => {
    const viele = Array.from({ length: 20 }, (_, g) =>
      gruppe(`g${g}`, g, Array.from({ length: 100 }, (_, i) => w(`${g}-${i}`, `mot${g}x${i} é`, `Wort ${g} ${i}`, `Phrase numéro ${i}.`)))
    )
    const t = performance.now()
    for (let i = 0; i < 20; i++) wortlisteFiltern(viele, `wort ${i}`)
    expect(performance.now() - t).toBeLessThan(1500)
  })
})

describe('Wortliste: Register im Ordner', () => {
  it('heißt in der Fremdsprache, sonst „Wortliste"', () => {
    expect(beschriftung('Englisch').wort).toBe('Word list')
    expect(beschriftung('Französisch').wort).toBe('Lexique')
    expect(beschriftung('Spanisch').wort).toBe('Léxico')
    expect(beschriftung('Latein').wort).toBe('Index verborum')
    expect(beschriftung('Russisch').wort).toBe('Словарь')
    expect(beschriftung('Geschichte').wort).toBe('Wortliste')
  })
})
