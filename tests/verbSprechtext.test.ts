import { describe, expect, it } from 'vitest'
import {
  fuerGeraetestimme,
  mitPausenMarken,
  ohneSchraegstrich,
  sprechText,
  sprechTextFuerWort,
  verbFormSprechtext,
  verbReiheSprechtext,
  VARIANTEN_PAUSE
} from '@shared/sprechtext'
import { formenGesprochen, formGesprochen, formSchluessel, sprechtext } from '@shared/verbTraining'
import { alsVokabel, sprechFormen } from '../src/renderer/src/shared/verben/VerbMedien'
import { standardListe } from '../src/renderer/src/shared/verben/standard'
import type { VerbEintrag } from '@shared/verben'

/* Aussprache unregelmäßiger Verben (09.10.2026): nie „slash", kurze Pause zwischen Varianten, Homographen je Spalte */

const zeile = (inf: string, past: string, pp: string, de = ''): VerbEintrag => ({ id: 'v1', formen: { inf, past, pp, de } })

describe('Varianten mit Pause statt Schrägstrich', () => {
  it('„was / were" wird „was … were" – in jeder Schreibweise, auch im alten Sprechtext', () => {
    for (const z of ['was/were', 'was / were', 'was, were', 'was or were']) expect(verbFormSprechtext(z, 'en', 'past')).toBe('was … were')
    expect(VARIANTEN_PAUSE).toBe(' … ')
  })

  it('nie ein Schrägstrich im Sprechtext – Standardlisten aller Sprachen', () => {
    for (const sp of ['en', 'fr', 'es', 'it', 'ru', 'la'] as const)
      for (const e of standardListe(sp))
        for (const [spalte, zelle] of Object.entries(e.formen)) {
          if (spalte === 'de') continue
          const t = verbFormSprechtext(zelle, sp, spalte)
          expect(t, `${sp} ${zelle}`).not.toMatch(/[/()[\]]|slash/)
        }
  })

  it('freier Text: Schrägstrich zwischen Wörtern als Pause, Zahlen und Adressen bleiben', () => {
    expect(sprechText('was/were', 'en')).toBe('was … were')
    expect(sprechText('he/she', 'en')).toBe('he … she')
    expect(sprechText('to point at sb/sth', 'en')).toBe('to point at somebody … something')
    expect(sprechText('be (was/were, been)', 'en')).toBe('be (was … were, been)')
    expect(sprechText('il/elle', 'fr')).toBe('il … elle')
    expect(sprechText('Add 1/2 cup of milk.', 'en')).toBe('Add 1/2 cup of milk.')
    expect(sprechText('Visit www.example.org/help today', 'en')).toBe('Visit www.example.org/help today')
    expect(sprechText('50 km/h', 'en')).toBe('50 kilometres per hour')
    expect(sprechTextFuerWort({ term: 'learnt/learned' }, 'en')).toBe('learnt … learned')
    expect(ohneSchraegstrich('Schüler/innen')).toBe('Schüler')
  })

  it('Endungen: nur die Grundform („stato/a", „allé(e)", „cansado/a")', () => {
    expect(verbFormSprechtext('sono stato/a', 'it', 'pp')).toBe('sono stato')
    expect(verbFormSprechtext('sono stato, a', 'it', 'pp')).toBe('sono stato')
    expect(verbFormSprechtext('cansado/a', 'es', 'part')).toBe('cansado')
    expect(verbFormSprechtext('je suis allé(e)', 'fr', 'pc')).toBe('je suis allé')
    expect(verbFormSprechtext('je suis mort(e)', 'fr', 'pc')).toBe('je suis mort')
    expect(verbFormSprechtext('je me suis assis(e)', 'fr', 'pc')).toBe('je me suis assis')
    expect(verbFormSprechtext('nous sommes allé(e)s', 'fr', 'pc')).toBe('nous sommes allés')
    // Alter Sprechtext („allé(e)" ohne Klammerzeichen) ebenso
    expect(verbFormSprechtext('je suis allée', 'fr', 'pc')).toBe('je suis allé')
    // Ausdrücklich weiblich bleibt weiblich, männliche Formen unberührt
    expect(verbFormSprechtext('elle est morte', 'fr', 'pc')).toBe('elle est morte')
    expect(verbFormSprechtext('ils sont allés', 'fr', 'pc')).toBe('ils sont allés')
    expect(verbFormSprechtext("j'ai été", 'fr', 'pc')).toBe("j'ai été")
  })

  it('Klammern: vorn mitsprechen, sonst Variante; Angaben fallen weg', () => {
    expect(verbFormSprechtext('(to) be', 'en', 'inf')).toBe('to be')
    expect(verbFormSprechtext("(s')asseoir", 'fr', 'inf')).toBe("s'asseoir")
    expect(verbFormSprechtext('learnt (learned)', 'en', 'past')).toBe('learnt … learned')
    expect(verbFormSprechtext('learnt/learned', 'en', 'pp')).toBe('learnt … learned')
    expect(verbFormSprechtext('dreamt or dreamed', 'en', 'past')).toBe('dreamt … dreamed')
    expect(verbFormSprechtext('got/gotten (AE)', 'en', 'pp')).toBe('got … gotten')
    expect(verbFormSprechtext('gotten [AE]', 'en', 'pp')).toBe('gotten')
    expect(verbFormSprechtext('gotten AE', 'en', 'pp')).toBe('gotten')
    expect(verbFormSprechtext('dove (AE)', 'en', 'past')).toBe('dohv')
    expect(verbFormSprechtext('—', 'la', 'ppp')).toBe('')
    expect(verbFormSprechtext('', 'en', 'inf')).toBe('')
  })

  it('Reihen: Pause statt Strich („be – was/were – been")', () => {
    expect(verbFormSprechtext('be – was/were – been', 'en')).toBe('be. was … were. been')
    expect(verbReiheSprechtext([{ spalte: 'inf', zelle: '(to) be' }, { spalte: 'past', zelle: 'was/were' }, { spalte: 'pp', zelle: 'been' }])).toBe(
      'to be. was … were. been'
    )
    expect(verbReiheSprechtext([{ spalte: 'praes', zelle: 'sum' }, { spalte: 'inf', zelle: 'esse' }, { spalte: 'perf', zelle: 'fui' }, { spalte: 'ppp', zelle: '—' }], 'la')).toBe(
      'sum. esse. fui'
    )
  })
})

describe('Homographen nur in der passenden Spalte', () => {
  it('„read – read – read": nur Vergangenheit und Partizip /rɛd/', () => {
    expect(verbFormSprechtext('read', 'en', 'inf')).toBe('read')
    expect(verbFormSprechtext('read', 'en', 'past')).toBe('red')
    expect(verbFormSprechtext('read', 'en', 'pp')).toBe('red')
    expect(verbReiheSprechtext([{ spalte: 'inf', zelle: 'read' }, { spalte: 'past', zelle: 'read' }, { spalte: 'pp', zelle: 'read' }])).toBe('read. red. red')
    // Nie im freien Text, nie ohne Spalte, nie in anderen Sprachen
    expect(sprechText('I read a book yesterday.', 'en')).toBe('I read a book yesterday.')
    expect(verbFormSprechtext('read', 'en')).toBe('read')
    // Nur das ganze Wort
    expect(verbFormSprechtext('spread', 'en', 'past')).toBe('spread')
  })

  it('wind/wound, lead, tear', () => {
    expect(verbFormSprechtext('wind', 'en', 'inf')).toBe('wined')
    expect(verbFormSprechtext('wound', 'en', 'past')).toBe('wownd')
    expect(verbFormSprechtext('wound', 'en', 'inf')).toBe('wound')
    expect(verbFormSprechtext('(to) lead', 'en', 'inf')).toBe('to leed')
    expect(verbFormSprechtext('led', 'en', 'past')).toBe('led')
    expect(verbFormSprechtext('tear', 'en', 'inf')).toBe('tare')
    expect(verbFormSprechtext('tore', 'en', 'past')).toBe('tore')
  })

  it('„read" der Vergangenheit bekommt einen eigenen Schlüssel, alle anderen behalten ihren', () => {
    expect(formSchluessel('read', 'en', 'inf')).toBe('read')
    expect(formSchluessel('read', 'en', 'past')).toBe('read (Vergangenheit)')
    expect(formSchluessel('was/were', 'en', 'past')).toBe('was, were')
    expect(formSchluessel('burnt/burned', 'en', 'pp')).toBe(sprechtext('burnt/burned'))
    expect(formSchluessel('wound', 'en', 'past')).toBe('wound')
    expect(formGesprochen('read', 'en', 'past')).toBe('red')
    expect(formenGesprochen({ inf: 'be', past: 'was/were', pp: 'been' }, 'en')).toBe('be. was … were. been')
  })
})

describe('Angezeigter Text bleibt unverändert', () => {
  it('Zeile der Verbliste: Schlüssel wie bisher, gesprochen getrennt', () => {
    const e = zeile('(to) be', 'was/were', 'been', 'sein')
    const vorher = JSON.stringify(e)
    const f = sprechFormen(e, 'en')
    expect(f.map((x) => x.text)).toEqual(['to be', 'was, were', 'been'])
    expect(f.map((x) => x.gesprochen)).toEqual(['to be', 'was … were', 'been'])
    expect(JSON.stringify(e)).toBe(vorher)
    const v = alsVokabel(e, 'en')
    expect(v.formen).toEqual(['to be', 'was, were', 'been'])
    expect(v.formenGesprochen).toEqual({ 'to be': 'to be', 'was, were': 'was … were', been: 'been' })
  })

  it('„read – read – read": drei Knöpfe, zwei Aufnahmen', () => {
    const f = sprechFormen(zeile('read', 'read', 'read'), 'en')
    expect(f.map((x) => [x.text, x.gesprochen])).toEqual([
      ['read', 'read'],
      ['read (Vergangenheit)', 'red'],
      ['read (Vergangenheit)', 'red']
    ])
  })

  it('Latein: „—" bekommt keinen Knopf', () => {
    const e: VerbEintrag = { id: 'v', formen: { praes: 'sum', inf: 'esse', perf: 'fui', ppp: '—', de: 'sein' } }
    expect(sprechFormen(e, 'la').map((x) => x.text)).toEqual(['sum', 'esse', 'fui'])
  })
})

describe('Pause je Stimme', () => {
  it('eleven_multilingual_v2: <break>-Marke; Gerät: Komma', () => {
    expect(mitPausenMarken('was … were')).toBe('was <break time="0.4s" /> were')
    expect(mitPausenMarken('be. was … were. been')).toBe('be. was <break time="0.4s" /> were. been')
    // Am Anfang oder Ende keine Marke
    expect(mitPausenMarken('… and then')).toBe('… and then')
    expect(mitPausenMarken('Well …')).toBe('Well …')
    expect(fuerGeraetestimme('was … were')).toBe('was, were')
    expect(fuerGeraetestimme('Well …')).toBe('Well')
  })
})
