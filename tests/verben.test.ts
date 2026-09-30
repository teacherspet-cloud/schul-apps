import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

/*
 * Unregelmäßige Verben (30.09.2026): Listen je Lehrwerk-Band, Übernahme aus dem Scan, Aufgaben
 * ohne KI (Lösungen = Formen der Liste), Sätze im Zusammenhang mit geprüfter KI-Lösung, Punkte je
 * Form – und derselbe Erzeuger in Grammatiktest, Arbeitsblatt und Vokabeltest.
 */
const ablage = mkdtempSync(join(tmpdir(), 'verben-'))
vi.mock('electron', () => ({ app: { getPath: () => ablage } }))

const { bereinigeVerbListe, grundformVon, listenIdAusName, varianten, verbSchluessel, VERB_SPALTEN } = await import('../src/shared/verben')
const { deleteVerbList, getVerbList, listVerbLists, saveVerbList } = await import('../src/main/services/storage/verbListen')
const { leseTextTabelle, uebernehmeKiAntwort, importSchema } = await import('../src/renderer/src/shared/verben/import')
const { alsWsBlock, bewertungsHinweis, erzeugeOhneKi, formatHinweis, punkteVon, verbenDerFassung } = await import('../src/renderer/src/shared/verben/erzeugen')
const { edForm, fehlformen, musterVon } = await import('../src/renderer/src/shared/verben/muster')
const { erzeugeMitKi, passendeLoesung } = await import('../src/renderer/src/shared/verben/kontext')
const { dubletten, fruehereBaende, fuehreZusammen, neueVerbAufgabe, verbenAusVokabeln, vokabelnAusVerbliste } = await import('../src/renderer/src/shared/verben/quellen')
const { standardBis, standardListe } = await import('../src/renderer/src/shared/verben/standard')
const { formateFuerLernjahr } = await import('../src/renderer/src/shared/verben/formate')
const { erzeugeVerbBloecke } = await import('../src/renderer/src/shared/verben/aufgaben')

type Aufgabe = ReturnType<typeof neueVerbAufgabe>
type Eintrag = Aufgabe['verben'][number]

const e = (id: string, inf: string, past: string, pp: string, de: string): Eintrag => ({ id, formen: { inf, past, pp, de } })
const GL3 = [
  e('1', 'go', 'went', 'gone', 'gehen'),
  e('2', 'bring', 'brought', 'brought', 'bringen'),
  e('3', 'burn', 'burnt/burned', 'burnt/burned', 'brennen'),
  e('4', 'sing', 'sang', 'sung', 'singen'),
  e('5', 'cut', 'cut', 'cut', 'schneiden'),
  e('6', 'come', 'came', 'come', 'kommen'),
  e('7', 'buy', 'bought', 'bought', 'kaufen'),
  e('8', 'swim', 'swam', 'swum', 'schwimmen'),
  e('9', 'put', 'put', 'put', 'legen'),
  e('10', 'drink', 'drank', 'drunk', 'trinken'),
  e('11', 'write', 'wrote', 'written', 'schreiben'),
  e('12', 'choose', 'chose', 'chosen', 'wählen')
]
const aufgabe = (p: Partial<Aufgabe> = {}): Aufgabe => ({ ...neueVerbAufgabe('en', 3, 42), verben: GL3, ...p })
const zellenVon = (verbId: string) => GL3.find((x) => x.id === verbId)!.formen

describe('Datenmodell der Verblisten', () => {
  it('hat für Englisch die Spalten des Schulbuchs', () => {
    expect(VERB_SPALTEN.en.map((s) => s.label)).toEqual(['infinitive', 'simple past', 'past participle', 'German'])
  })

  it('bereinigt eine Liste: bekannte Spalten, keine leeren Zeilen, Varianten und Hinweise bleiben', () => {
    const l = bereinigeVerbListe({
      id: 'green-line-3',
      name: ' Green Line 3 ',
      sprache: 'en',
      eintraege: [
        { id: 'a', formen: { inf: 'burn', past: 'burnt / burned', pp: 'burnt/burned', de: 'brennen', quatsch: 'x' }, hinweis: 'AE: burned' },
        { id: 'b', formen: { de: 'nur Deutsch' } },
        { id: 'c', formen: {} }
      ]
    })
    expect(l.name).toBe('Green Line 3')
    expect(l.eintraege).toHaveLength(1)
    expect(l.eintraege[0].formen).toEqual({ inf: 'burn', past: 'burnt / burned', pp: 'burnt/burned', de: 'brennen' })
    expect(l.eintraege[0].hinweis).toBe('AE: burned')
    expect(() => bereinigeVerbListe({ id: 'x y', name: 'a', sprache: 'en', eintraege: [] })).toThrow()
    expect(() => bereinigeVerbListe({ id: 'abc', name: 'a', sprache: 'nl', eintraege: [] })).toThrow()
  })

  it('kennt Varianten, Grundform und Vergleichsschlüssel', () => {
    expect(varianten('burnt/burned')).toEqual(['burnt', 'burned'])
    expect(varianten('learnt or learned')).toEqual(['learnt', 'learned'])
    expect(varianten('(to) be')).toEqual(['be'])
    expect(verbSchluessel('to go')).toBe('go')
    expect(verbSchluessel('Wake up (sb)')).toBe('wake up')
    expect(grundformVon(GL3[0], 'en')).toBe('go')
    expect(listenIdAusName('Découvertes 2')).toBe('verben-decouvertes-2')
  })

  it('speichert je Band im geschützten Ordner der Lehrwerke und liest die Übersicht', () => {
    saveVerbList({ id: 'green-line-2', name: 'Green Line 2', reihe: 'Green Line', band: '2', sprache: 'en', eintraege: GL3.slice(0, 3), aktualisiert: '' })
    const uebersicht = saveVerbList({ id: 'green-line-3', name: 'Green Line 3', reihe: 'Green Line', band: '3', sprache: 'en', eintraege: GL3, aktualisiert: '' })
    expect(uebersicht.map((l) => [l.id, l.anzahl])).toEqual([
      ['green-line-2', 3],
      ['green-line-3', 12]
    ])
    expect(getVerbList('green-line-3').eintraege[2].formen.past).toBe('burnt/burned')
    expect(listVerbLists()).toHaveLength(2)
    expect(deleteVerbList('green-line-2').map((l) => l.id)).toEqual(['green-line-3'])
    expect(() => getVerbList('../geheim')).toThrow()
  })
})

describe('Übernahme aus dem Scan', () => {
  it('überträgt die KI-Antwort zeilenweise wörtlich – mit Varianten, Hinweisen und unsicheren Zellen', () => {
    const r = uebernehmeKiAntwort(
      {
        band: 'Green Line 3',
        seite: 'S. 212',
        zeilen: [
          { inf: 'be', past: 'was / were', pp: 'been', de: 'sein', hinweis: '', unsicher: [] },
          { inf: 'learn', past: 'learnt/learned', pp: 'learnt/learned', de: 'lernen', hinweis: 'AE: learned', unsicher: ['pp', 'quatsch'] },
          { inf: '', past: '', pp: '', de: 'Unregelmäßige Verben', hinweis: '', unsicher: [] }
        ]
      },
      'en'
    )
    expect(r.band).toBe('Green Line 3')
    expect(r.seite).toBe('S. 212')
    expect(r.eintraege).toHaveLength(2)
    expect(r.eintraege[0].formen).toEqual({ inf: 'be', past: 'was/were', pp: 'been', de: 'sein' })
    expect(r.eintraege[1]).toMatchObject({ hinweis: 'AE: learned', unsicher: ['pp'] })
    expect(r.unsicher).toBe(1)
  })

  it('verlangt je Sprache genau deren Spalten', () => {
    const schema = importSchema('la') as { properties: { zeilen: { items: { properties: Record<string, unknown> } } } }
    expect(Object.keys(schema.properties.zeilen.items.properties)).toEqual(['praes', 'inf', 'perf', 'ppp', 'de', 'hinweis', 'unsicher'])
  })

  it('liest Textdateien ohne KI und überspringt die Kopfzeile', () => {
    const l = leseTextTabelle('infinitive\tsimple past\tpast participle\tGerman\ngo\twent\tgone\tgehen\nburn | burnt/burned | burnt/burned | brennen', 'en')
    expect(l.map((x) => x.formen)).toEqual([
      { inf: 'go', past: 'went', pp: 'gone', de: 'gehen' },
      { inf: 'burn', past: 'burnt/burned', pp: 'burnt/burned', de: 'brennen' }
    ])
  })

  it('erkennt Dubletten', () => {
    expect(dubletten([...GL3.slice(0, 2), e('x', 'to go', 'went', 'gone', 'gehen')], 'en')).toEqual([[0, 2]])
  })
})

describe('Typische Fehlformen und Muster', () => {
  it('bildet die Fehler, die Lernende machen', () => {
    expect(edForm('go')).toBe('goed')
    expect(edForm('swim')).toBe('swimmed')
    expect(edForm('buy')).toBe('buyed')
    expect(fehlformen(GL3[0], 'past', 'en')).toContain('goed')
    expect(fehlformen(GL3[0], 'pp', 'en')).toContain('went')
    expect(fehlformen(GL3[1], 'past', 'en')).toEqual(expect.arrayContaining(['bringed', 'brang']))
    expect(fehlformen(GL3[10], 'pp', 'en')).toContain('writen')
    // Nie die richtige Form – auch keine Variante
    expect(fehlformen(GL3[2], 'past', 'en')).not.toContain('burned')
    const venir = standardListe('fr').find((x) => x.formen.inf === 'venir')!
    expect(fehlformen(venir, 'pc', 'fr')).toContain("j'ai venu")
    const hacer = standardListe('es').find((x) => x.formen.inf === 'hacer')!
    expect(fehlformen(hacer, 'part', 'es')).toContain('hacido')
    const prendere = standardListe('it').find((x) => x.formen.inf === 'prendere')!
    expect(fehlformen(prendere, 'pp', 'it')).toContain('ho prenduto')
  })

  it('ordnet Bildungsmuster zu', () => {
    expect(musterVon(GL3[4], 'en')?.id).toBe('AAA')
    expect(musterVon(GL3[1], 'en')?.id).toBe('ABB')
    expect(musterVon(GL3[5], 'en')?.id).toBe('ABA')
    expect(musterVon(GL3[3], 'en')?.id).toBe('IAU')
    expect(musterVon(GL3[0], 'en')?.id).toBe('ABC')
    const la = (praes: string) => musterVon(standardListe('la').find((x) => x.formen.praes === praes)!, 'la')?.id
    expect([la('do'), la('dico'), la('teneo'), la('peto'), la('video')]).toEqual(['redupl', 's', 'u', 'v', 'dehn'])
  })
})

describe('Aufgaben ohne KI: Lösungen aus der Liste, je Form ein Punkt', () => {
  it('Tabelle mit vorgegebener Spalte: Lücken tragen genau die Formen der Liste', () => {
    const [t] = erzeugeOhneKi(aufgabe({ formate: ['tabelle'], vorgabe: 'de', anzahl: { tabelle: 5 } }), 'du')
    expect(t.teil.art).toBe('tabelle')
    if (t.teil.art !== 'tabelle') return
    expect(t.teil.kopf).toEqual(['infinitive', 'simple past', 'past participle', 'German'])
    expect(t.teil.zeilen).toHaveLength(5)
    for (const z of t.teil.zeilen) {
      const f = zellenVon(z.verbId)
      expect(z.zellen).toEqual(['', '', '', f.de])
      expect(z.loesung).toEqual([f.inf, f.past, f.pp, ''])
    }
    expect(t.punkte).toBe(15)
    expect(t.anweisung).toBe('Complete the table with the missing verb forms.')
  })

  it('Gemischte Lücken: in jeder Zeile genau eine Form vorgegeben', () => {
    const [t] = erzeugeOhneKi(aufgabe({ formate: ['tabelleGemischt'], anzahl: { tabelleGemischt: 8 } }), 'du')
    if (t.teil.art !== 'tabelle') throw new Error('Tabelle erwartet')
    for (const z of t.teil.zeilen) {
      expect(z.zellen.filter(Boolean)).toHaveLength(1)
      const f = zellenVon(z.verbId)
      z.zellen.forEach((c, i) => expect(c || z.loesung[i]).toBe([f.inf, f.past, f.pp, f.de][i]))
    }
    expect(t.punkte).toBe(24)
  })

  it('Ankreuzen: richtige Form genau einmal, Ablenker sind typische Fehlformen', () => {
    const [t] = erzeugeOhneKi(aufgabe({ formate: ['auswahl'], anzahl: { auswahl: 6 } }), 'du')
    if (t.teil.art !== 'auswahl') throw new Error('Auswahl erwartet')
    expect(t.teil.items.length).toBeGreaterThan(3)
    for (const it of t.teil.items) {
      const f = zellenVon(it.verbId)
      const richtig = it.optionen[it.richtig]
      expect([...varianten(f.past), ...varianten(f.pp)]).toContain(richtig)
      // Lernjahr 3: vier Möglichkeiten
      expect(it.optionen).toHaveLength(4)
      expect(new Set(it.optionen).size).toBe(4)
    }
    // In Lernjahr 1–2 höchstens drei Möglichkeiten
    const [frueh] = erzeugeOhneKi(aufgabe({ lernjahr: 2, formate: ['auswahl'] }), 'du')
    if (frueh.teil.art === 'auswahl') expect(frueh.teil.items.every((it) => it.optionen.length === 3)).toBe(true)
  })

  it('Fehler finden: genau eine falsche Form je Zeile, Berichtigung in der Lösung', () => {
    const [t] = erzeugeOhneKi(aufgabe({ formate: ['fehler'], anzahl: { fehler: 5 } }), 'du')
    if (t.teil.art !== 'tabelle') throw new Error('Tabelle erwartet')
    expect(t.teil.kopf.at(-1)).toBe('correction')
    for (const z of t.teil.zeilen) {
      const f = zellenVon(z.verbId)
      const richtig = [f.inf, varianten(f.past)[0], varianten(f.pp)[0]]
      const falsch = z.zellen.slice(0, 3).filter((c, i) => c !== richtig[i])
      expect(falsch).toHaveLength(1)
      expect(z.loesung.at(-1)).toMatch(new RegExp(`^${falsch[0]} → `))
    }
    expect(t.punkte).toBe(5)
  })

  it('Zuordnen nach Muster und „Was passt nicht?"', () => {
    const [m, o] = erzeugeOhneKi(aufgabe({ formate: ['muster', 'ausreisser'], anzahl: { muster: 8, ausreisser: 3 } }), 'du')
    if (m.teil.art !== 'zuordnung' || o.teil.art !== 'auswahl') throw new Error('Formate erwartet')
    m.teil.links.forEach((l, i) => expect(m.teil.art === 'zuordnung' && m.teil.rechts[m.teil.paare[i]]).toBe(musterVon(GL3.find((x) => x.id === l.verbId)!, 'en')!.label))
    for (const it of o.teil.items) {
      const odd = GL3.find((x) => x.id === it.verbId)!
      expect(it.optionen[it.richtig]).toContain(odd.formen.inf)
    }
    expect(formatHinweis(aufgabe({ verben: GL3.slice(0, 1) }), 'muster')).toBeTruthy()
  })

  it('Gruppe A und B nehmen andere Verben, wenn die Auswahl reicht', () => {
    const a = aufgabe({ formate: ['tabelle'], anzahl: { tabelle: 5 } })
    const [ga, gb] = [verbenDerFassung(a, 0, 2), verbenDerFassung(a, 1, 2)]
    expect(ga.filter((x) => gb.includes(x))).toEqual([])
    const knapp = aufgabe({ formate: ['tabelle'], anzahl: { tabelle: 10 } })
    expect(verbenDerFassung(knapp, 1, 2)).toHaveLength(12)
  })

  it('Latein bekommt deutsche Anweisungen und „—" wird nie zur Lücke', () => {
    const a = { ...neueVerbAufgabe('la', 3, 7), formate: ['tabelle' as const], vorgabe: 'praes' }
    a.verben = standardBis('la', 3).filter((x) => ['sum', 'fero', 'volo'].includes(x.formen.praes))
    const [t] = erzeugeOhneKi(a, 'du')
    if (t.teil.art !== 'tabelle') throw new Error('Tabelle erwartet')
    expect(t.anweisung).toBe('Ergänze die fehlenden Verbformen in der Tabelle.')
    const sum = t.teil.zeilen.find((z) => z.zellen[0] === 'sum')!
    expect(sum.zellen[3]).toBe('—')
    expect(punkteVon(t.teil)).toBe(t.teil.zeilen.reduce((n, z) => n + z.zellen.filter((c) => !c).length, 0))
  })

  it('als Baustein: Punkte je Form, Lösungen im Lösungsteil, Fehlerprofil', () => {
    const [t] = erzeugeOhneKi(aufgabe({ formate: ['tabelle'], vorgabe: 'inf', anzahl: { tabelle: 4 } }), 'du')
    const b = alsWsBlock(t)
    expect(b.points).toBe(12)
    expect(b.answer.kind).toBe('tableFill')
    expect(b.answer.solutionRows[0].slice(1)).toEqual([zellenVon(t.teil.art === 'tabelle' ? t.teil.zeilen[0].verbId : '').past, expect.any(String), expect.any(String)])
    expect(b.grammar?.topicId).toBe('Unregelmäßige Verben')
    expect(bewertungsHinweis({ rechtschreibung: 'halb', sprache: 'en' })).toContain('½ Punkt')
    expect(bewertungsHinweis({ rechtschreibung: 'streng', sprache: 'en' })).not.toContain('½ Punkt')
  })
})

describe('Sätze im Zusammenhang (KI) – Lösung aus der Liste, geprüft', () => {
  it('nimmt nur Sätze mit genau einer Lücke und einer Lösung der Liste (auch Variante)', async () => {
    const a = aufgabe({ verben: [GL3[0], GL3[2], GL3[3]], formate: ['lueckensatz'], anzahl: { lueckensatz: 3 } })
    // Die Reihenfolge der Items bestimmt die App (gemischt) – die Attrappe liest sie aus dem Auftrag
    const saetze: Record<string, { satz: string; loesung: string }> = {
      go: { satz: 'Yesterday we ___ to the zoo.', loesung: 'went' },
      burn: { satz: 'The fire ___ all night.', loesung: 'burned' },
      // falsche Lösung: fliegt raus
      sing: { satz: 'She ___ a song.', loesung: 'singed' }
    }
    const ai = vi.fn(async (req: { system: string }) => ({
      items: [...req.system.matchAll(/^(\d+)\. (\w+) →/gm)].map((m) => ({ nr: Number(m[1]), ...saetze[m[2]], deutsch: '' }))
    }))
    const [t] = await erzeugeMitKi(a, 'du', ai as never)
    expect(t.teil).toMatchObject({ art: 'lueckentext', luecken: 2 })
    if (t.teil.art === 'lueckentext') {
      expect(t.teil.text).toContain('[[went]] (go)')
      expect(t.teil.text).toContain('[[burned]] (burn)')
      expect(t.teil.text).not.toContain('singed')
    }
    expect(t.punkte).toBe(2)
    expect(passendeLoesung(' Burnt ', ['burnt', 'burned'])).toBe('burnt')
  })

  it('Grammatiktest-Bausteine: ohne KI-Formate kein KI-Aufruf', async () => {
    const bloecke = await erzeugeVerbBloecke(aufgabe({ formate: ['tabelle', 'auswahl'] }), 'du', null)
    expect(bloecke.filter((b) => b.type === 'task')).toHaveLength(2)
    expect(bloecke.at(-1)).toMatchObject({ type: 'infoBox', nurLoesung: true })
  })
})

describe('Quellen: Lehrwerk, frühere Bände, Vokabelliste', () => {
  it('nimmt auf Wunsch die Verben früherer Bände mit – ohne Dubletten, der spätere Band gilt', () => {
    const meta = (id: string, band: string) => ({ id, name: `Green Line ${band}`, reihe: 'Green Line', band, sprache: 'en' as const, anzahl: 0, aktualisiert: '' })
    const alle = [meta('gl2', '2'), meta('gl3', '3'), meta('gl4', '4'), { ...meta('dec2', '2'), reihe: 'Découvertes', sprache: 'fr' as const }]
    expect(fruehereBaende(alle, alle[1]).map((l) => l.id)).toEqual(['gl2'])
    const zusammen = fuehreZusammen([
      { id: 'gl2', sprache: 'en', eintraege: [e('1', 'go', 'went', 'gone', 'gehen'), e('2', 'learn', 'learned', 'learned', 'lernen')] },
      { id: 'gl3', sprache: 'en', eintraege: [e('1', 'learn', 'learnt/learned', 'learnt/learned', 'lernen')] }
    ])
    expect(zusammen.map((x) => [x.id, x.formen.past])).toEqual([
      ['gl2:1', 'went'],
      ['gl3:1', 'learnt/learned']
    ])
  })

  it('findet unregelmäßige Verben einer Vokabelliste und macht aus einer Verbliste Vokabeln', () => {
    const treffer = verbenAusVokabeln([{ term: 'to go' }, { term: 'to play' }, { term: 'to write (sth)' }], GL3, 'en')
    expect(treffer.map((x) => x.formen.inf)).toEqual(['go', 'write'])
    expect(vokabelnAusVerbliste({ sprache: 'en', eintraege: [GL3[0]] })).toEqual([{ term: 'go', translation: 'gehen', pos: 'verb', note: 'went – gone' }])
  })

  it('Voreinstellung nach Lernjahr', () => {
    expect(formateFuerLernjahr(1, 'en')).toEqual(['tabelle', 'lueckensatz'])
    expect(formateFuerLernjahr(3, 'en')).toContain('tabelleGemischt')
    expect(formateFuerLernjahr(5, 'fr')).toEqual(['lueckensatz', 'zeitform'])
    expect(neueVerbAufgabe('en', 1).verben.every((x) => (x as { lernjahr?: number }).lernjahr === 1)).toBe(true)
    for (const s of ['en', 'fr', 'es', 'it', 'ru', 'la'] as const) {
      const liste = standardListe(s)
      expect(liste.length).toBeGreaterThan(30)
      // Jede Zeile hat alle Spalten der Sprache
      for (const v of liste) expect(Object.keys(v.formen).sort()).toEqual(VERB_SPALTEN[s].map((x) => x.id).sort())
    }
  })
})
