import { describe, expect, it } from 'vitest'
import {
  bogenAnfrage,
  bogenAus,
  grundlageAusBlatt,
  grundlageAusVokabeltest,
  ohneNamen,
  pruefeBogen,
  transkriptUebernehmen
} from '../src/renderer/src/modules/rueckmeldung/generation'
import { boegenHtml } from '../src/renderer/src/modules/rueckmeldung/ausgabe'
import { naechstesKuerzel, type Abgabe, type Rueckmeldung } from '../src/renderer/src/modules/rueckmeldung/model/types'
import { sampleWorksheet } from './worksheetExport.test'

/*
 * Programm „Rückmeldung" (Großprogramm 0.4, F3): keine Noten und Punkte auf dem Bogen, Namen nur
 * lokal (Kürzel an die KI), Grundlage aus gespeichertem Material.
 */
const abgabe = (over: Partial<Abgabe> = {}): Abgabe => ({ id: 'a1', kuerzel: 'S1', name: '', dateiname: 'x', text: 'Text', bilder: [], ...over })

describe('Rückmeldung', () => {
  it('der Bogen bleibt ohne Note und Punkte – Lob mit „sehr gut" bleibt stehen', () => {
    const b = pruefeBogen({
      staerken: ['Deine Einleitung gelingt dir sehr gut.', 'Das wäre eine 2+.', 'Du erreichst 14 von 20 Punkten.'],
      schritte: ['Achte auf die Kommasetzung vor „dass".', 'Für eine bessere Note brauchst du mehr Belege.'],
      kriterien: [
        { kriterium: 'Aufbau', einschaetzung: 'sicher', beleg: 'klare Absätze' },
        { kriterium: 'Punktzahl', einschaetzung: 'teilweise', beleg: '12 Punkte' }
      ],
      schluss: 'Insgesamt befriedigend.'
    })
    expect(b.staerken).toEqual(['Deine Einleitung gelingt dir sehr gut.'])
    expect(b.schritte).toEqual(['Achte auf die Kommasetzung vor „dass".'])
    expect(b.kriterien.map((k) => k.kriterium)).toEqual(['Aufbau'])
    expect(b.schluss).toBeUndefined()
    expect(b.entfernt).toBe(5)
  })

  it('die KI-Antwort wird bereinigt; unbekannte Einschätzung wird „teilweise"', () => {
    const b = bogenAus({ staerken: ['A', ''], schritte: ['B'], kriterien: [{ kriterium: 'K', einschaetzung: 'toll' }, { kriterium: '' }], schluss: '' })
    expect(b.staerken).toEqual(['A'])
    expect(b.kriterien).toEqual([{ kriterium: 'K', einschaetzung: 'teilweise' }])
    expect(() => bogenAus({ staerken: [], schritte: [] })).toThrow()
  })

  it('Übertragung: erkannte Namen werden durch Kürzel ersetzt, die Bilder fallen weg', () => {
    const a = transkriptUebernehmen(abgabe({ text: '', bilder: ['data:image/png;base64,x'] }), {
      text: 'Name: Lea Schmidt\nMein Freund Ben hat mir geholfen.',
      unleserlich: '',
      erkannteNamen: ['Lea Schmidt', 'Ben']
    })
    expect(a.text).not.toMatch(/Lea|Schmidt|Ben/)
    expect(a.text).toMatch(/S1/)
    expect(a.bilder).toEqual([])
    expect(a.pseudonyme?.map((z) => z.name)).toEqual(['Lea Schmidt', 'Ben'])
    expect(() => transkriptUebernehmen(abgabe(), { text: '' })).toThrow()
  })

  it('Kürzel fortlaufend, auch nach dem Entfernen einer Abgabe', () => {
    expect(naechstesKuerzel([])).toBe('S1')
    expect(naechstesKuerzel([abgabe({ kuerzel: 'S1' }), abgabe({ kuerzel: 'S3' })])).toBe('S4')
  })

  it('Grundlage aus einem Arbeitsblatt: Aufgaben und Erwartungshorizont', () => {
    const g = grundlageAusBlatt(sampleWorksheet(), 'arbeitsblatt', 'id1', 'Fotosynthese')
    expect(g.aufgaben.length).toBeGreaterThan(50)
    expect(g).toMatchObject({ art: 'arbeitsblatt', docId: 'id1', titel: 'Fotosynthese' })
  })

  it('der Name steht erst im Ausdruck – eingesetzt anstelle des Kürzels', () => {
    const r = {
      version: 1,
      meta: {
        title: '',
        subjectId: 'deutsch',
        subjectLabel: 'Deutsch',
        grade: 7,
        stateId: 'NI',
        schoolTypeId: 'gymnasium',
        schoolTypeName: 'Gymnasium',
        anrede: 'du',
        schwerpunkt: ''
      },
      grundlage: { art: 'frei', titel: 'Leserbrief', aufgaben: 'Schreibe …' },
      abgaben: [],
      createdAt: ''
    } as unknown as Rueckmeldung
    const a = abgabe({
      name: 'Lea',
      bogen: { staerken: ['S1 gliedert klar.'], schritte: ['Belege ergänzen.'], kriterien: [{ kriterium: 'Aufbau', einschaetzung: 'sicher' }] }
    })
    const html = boegenHtml(r, [a, abgabe({ id: 'a2', kuerzel: 'S2' })])
    expect(html).toContain('für Lea')
    expect(html).toContain('Lea gliedert klar.')
    expect(html).toContain('Das gelingt dir schon')
    // Abgaben ohne Bogen erscheinen nicht
    expect(html.match(/<section class="blatt/g)).toHaveLength(1)
  })
})

describe('Grundlage aus einem Vokabeltest', () => {
  it('nimmt Aufgaben und Musterantworten der ersten Fassung', () => {
    const doc = {
      variants: [
        {
          id: 'v1',
          label: 'A',
          blocks: [
            {
              id: 'b1',
              kind: 'open',
              taskType: 'writeSentences',
              title: 'Sentences',
              instruction: 'Write a sentence with each word.',
              pointsPerItem: 2,
              items: [{ id: 'i1', vocabId: 'e1', prompt: 'journey – your way to school', modelAnswer: 'My journey to school takes twenty minutes.' }]
            }
          ]
        }
      ]
    }
    const g = grundlageAusVokabeltest(doc as never, 'vt-1', 'Unit 3')
    expect(g).toMatchObject({ art: 'vokabeltest', docId: 'vt-1', titel: 'Unit 3' })
    expect(g.aufgaben).toContain('Aufgabe 1')
    expect(g.aufgaben).toContain('Write a sentence with each word.')
    expect(g.aufgaben).toContain('model answer: My journey to school takes twenty minutes.')
    expect(g.erwartung).toMatch(/→ answer/)
  })
})

describe('Namen verlassen den Rechner nicht (Praxislauf 28.09.2026)', () => {
  it('ersetzt den eigenen Namen und weitere Vornamen in eingetippten Abgaben', () => {
    const a = abgabe({
      name: 'Lea Schmidt',
      text: 'Liebe Redaktion, ich finde das Verbot falsch. Lea Schmidt sagt auch, dass es unfair ist, und Jonas findet das auch. Viele Grüße, Lea'
    })
    const { text, pseudonyme } = ohneNamen(a)
    expect(text).not.toMatch(/Lea|Schmidt|Jonas/)
    expect(text).toContain('S1 sagt auch')
    expect(text).toMatch(/S1-P1 findet/)
    expect(pseudonyme).toEqual([{ kuerzel: 'S1-P1', name: 'Jonas' }])
  })

  it('schickt den bereinigten Text in der Anfrage', () => {
    const r = {
      meta: { anrede: 'du', subjectLabel: 'Deutsch', grade: 8, schwerpunkt: '' },
      grundlage: { titel: 'Leserbrief', aufgaben: 'Schreibe einen Leserbrief.' }
    }
    const a = abgabe({ name: 'Lea Schmidt', text: 'Lea Schmidt findet das Verbot falsch.' })
    const anfrage = bogenAnfrage(r as never, { ...a, text: ohneNamen(a).text }, 'System')
    expect(anfrage.user).not.toMatch(/Lea|Schmidt/)
  })
})

describe('Eigene Aufgabe aus einer Datei (29.09.2026)', () => {
  it('Anfrage verlangt Aufgabe wörtlich, nötiges Material, Erwartungshorizont nur aus dem Material; Bilder nur ohne Text', async () => {
    const { aufgabeAnfrage } = await import('../src/renderer/src/modules/rueckmeldung/aufgabeAusMaterial')
    const a = aufgabeAnfrage([
      { fileName: 'blatt.docx', text: '<p>Deutsch 8b</p><p>1. Schreibe einen Leserbrief.</p>' },
      { fileName: 'foto.jpg', text: '', pageImages: ['data:image/jpeg;base64,AAAA'] }
    ])
    expect(a.schemaName).toBe('rueckmeldung_aufgabe')
    expect(a.user).toMatch(/wörtlich/)
    expect(a.user).toContain('1. Schreibe einen Leserbrief.')
    expect(a.user).not.toContain('<p>')
    expect(a.images).toEqual(['data:image/jpeg;base64,AAAA'])
  })

  it('übernimmt nur gültige Fächer und Jahrgänge', async () => {
    const { aufgabeAus } = await import('../src/renderer/src/modules/rueckmeldung/aufgabeAusMaterial')
    expect(aufgabeAus({ titel: 'X', aufgaben: 'A', erwartung: '', fach: 'deutsch', jahrgang: 8, erkennbar: ['Kopfzeile'] })).toMatchObject({
      fach: 'deutsch',
      jahrgang: 8
    })
    expect(aufgabeAus({ aufgaben: 'A', fach: 'astrologie', jahrgang: 17 })).toMatchObject({ fach: '', jahrgang: 0 })
    expect(() => aufgabeAus({ aufgaben: '' })).toThrow(/keine Aufgabenstellung/)
  })

  it('Entwurf des Erwartungshorizonts ohne Punkte und Noten', async () => {
    const { erwartungsEntwurfAnfrage } = await import('../src/renderer/src/modules/rueckmeldung/aufgabeAusMaterial')
    const a = erwartungsEntwurfAnfrage('Schreibe einen Leserbrief.', 'Deutsch', 8)
    expect(a.user).toMatch(/KEINE Punkte und KEINE Noten/)
    expect(a.user).toContain('(Deutsch, Klasse 8)')
  })
})
