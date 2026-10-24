/**
 * Hilfen für die Partnerarbeit an den Sprechkarten (24.10.2026): Bereinigung, Rollenliste als Quelle der zwei festen
 * Dialogfelder, „was fehlt", Schema der KI (Hilfen Pflicht beim Erzeugen, nicht Teil der Prüfung) und das Anwenden
 * einer Ergänzungsantwort – auch der Fall, dass die KI eine Dialogkarte für drei Personen umarbeitet.
 */
import { describe, expect, it } from 'vitest'
import {
  dialogRollen,
  ergaenzbar,
  fehlendeInhalte,
  GRUNDKARTEN,
  hilfenBereinigt,
  karteBereinigt,
  karteFuer3,
  type DialogKarte,
  type SprechKarte
} from '../src/shared/sprechen/karten'
import { ergaenzungAnwenden, ergaenzungsAnfrage, HILFEN_SCHEMA, kartenAnfrage, KARTEN_SCHEMA, type Grundlage } from '../src/shared/sprechen/erstellen'
import { pruefAnfrage } from '../src/shared/sprechen/pruefen'

const g: Grundlage = { sprache: 'en', jahrgang: 7, niveau: 'A2', quelle: '', woerter: [], grammatikBekannt: [], grammatikNeu: [], themen: [] }
const dialog = GRUNDKARTEN.en!.A2![1] as DialogKarte
const interview = GRUNDKARTEN.en!.A1![0]

const rolle = (name: string, karte: string) => ({
  name,
  karte,
  vorschlaege: ['v1', 'v2', 'v3'],
  wortschatz: [{ wort: 'camp', deutsch: 'Lager' }],
  beispiele: ['I think …', 'We could …']
})

describe('Hilfen an Sprechkarten', () => {
  it('bereinigt Hilfen je Kartenart und verwirft Leeres', () => {
    expect(hilfenBereinigt('interview', { nachfragen: ['Why?'], wortschatz: [{ wort: 'pet', deutsch: 'Haustier' }, { wort: '' }], beispiele: [] })).toEqual({
      nachfragen: ['Why?'],
      wortschatz: [{ wort: 'pet', deutsch: 'Haustier' }],
      beispiele: []
    })
    expect(hilfenBereinigt('interview', { nachfragen: [], wortschatz: [], beispiele: [] })).toBeUndefined()
    expect(hilfenBereinigt('monolog', { auftrag: 'Describe the picture.', zusatzfragen: [], wortschatz: [], beispiele: [] })).toMatchObject({
      auftrag: 'Describe the picture.'
    })
    expect(hilfenBereinigt('dialog', { rollen: [rolle('A', 'a')] })).toBeUndefined()
    expect((hilfenBereinigt('dialog', { rollen: [rolle('A', 'a'), rolle('B', 'b'), rolle('C', 'c'), rolle('D', 'd')] }) as { rollen: unknown[] }).rollen).toHaveLength(3)
  })

  it('karteBereinigt behält Hilfen und Status; die Rollenliste ist die Quelle der zwei festen Dialogfelder', () => {
    const roh = {
      ...dialog,
      hilfen: { rollen: [rolle('Guest', 'You ask about the camp.'), rolle('Host', 'Info: Lakeside …'), rolle('Friend', 'You also ask.')] },
      hilfenStatus: 'ki'
    }
    const k = karteBereinigt(roh, 'k1') as DialogKarte
    expect(k.hilfen?.rollen).toHaveLength(3)
    expect(k.hilfenStatus).toBe('ki')
    expect(k.rolleSchueler).toBe('You ask about the camp.')
    expect(k.rolleKi).toBe('Info: Lakeside …')
    expect(karteFuer3(k)).toBe(true)
    // Unbekannter Status fällt weg, Karte ohne Hilfen bleibt wie bisher
    expect(karteBereinigt({ ...interview, hilfenStatus: 'egal' }, 'k2')).not.toHaveProperty('hilfenStatus')
    expect(karteBereinigt(dialog, 'k3')).not.toHaveProperty('hilfen')
  })

  it('dialogRollen liefert ohne Hilfen die zwei festen Felder – jedes Set geht zu zweit', () => {
    const r = dialogRollen(dialog)
    expect(r).toHaveLength(2)
    expect(r[0].karte).toBe(dialog.rolleSchueler)
    expect(r[1].karte).toBe(dialog.rolleKi)
    expect(karteFuer3(dialog)).toBe(false)
  })

  it('fehlendeInhalte nennt Hilfen, Beispielsätze, dritte Rolle und Bild', () => {
    expect(fehlendeInhalte(interview)).toEqual(['hilfen', 'beispiele'])
    expect(fehlendeInhalte(dialog)).toEqual(['hilfen', 'beispiele', 'dritteRolle'])
    const bild: SprechKarte = { art: 'monolog', id: 'b', titel: 'P', bilder: [], bildBeschreibung: 'x', leitfragen: ['q'] }
    expect(fehlendeInhalte(bild)).toEqual(['bild', 'hilfen', 'beispiele'])
    expect(ergaenzbar(bild)).toEqual(['hilfen', 'beispiele'])
    const voll = karteBereinigt({ ...interview, hilfen: { nachfragen: ['Why?'], wortschatz: [{ wort: 'a', deutsch: 'b' }], beispiele: ['I like …'] } }, 'v')!
    expect(fehlendeInhalte(voll)).toEqual([])
    const nurRollen = karteBereinigt({ ...dialog, hilfen: { rollen: [rolle('A', 'a'), rolle('B', 'b')] } }, 'd2')!
    expect(fehlendeInhalte(nurRollen)).toEqual(['dritteRolle'])
    const drei = karteBereinigt({ ...dialog, hilfen: { rollen: [rolle('A', 'a'), rolle('B', 'b'), rolle('C', 'c')] } }, 'd3')!
    expect(fehlendeInhalte(drei)).toEqual([])
  })

  it('Schema: neue Karten bringen Hilfen mit, die Prüfung lässt sie aus', () => {
    for (const teil of ['interview', 'monolog', 'dialog'] as const) {
      expect((KARTEN_SCHEMA[teil].required as string[]).includes('hilfen')).toBe(true)
      expect(KARTEN_SCHEMA[teil].properties).toHaveProperty('hilfen', HILFEN_SCHEMA[teil])
      const anfrage = kartenAnfrage(teil, 2, g, [])
      expect(anfrage.user).toContain('hilfen')
      const pruefung = pruefAnfrage(teil, [{}], g, [])
      const felder = (pruefung.schema as { properties: { urteile: { items: { required: string[] } } } }).properties.urteile.items.required
      expect(felder).not.toContain('hilfen')
    }
    expect(kartenAnfrage('dialog', 2, g, []).user).toContain('complete two-person task')
  })

  it('Ergänzungsanfrage: Interview nur Hilfen, Dialog die ganze Karte mit Zweier-Regel', () => {
    const a = ergaenzungsAnfrage('interview', interview, ['hilfen', 'beispiele'], g)
    expect(a.schemaName).toBe('sprechkarten_ergaenzung_interview')
    expect((a.schema as { required: string[] }).required).toEqual(['hilfen'])
    const d = ergaenzungsAnfrage('dialog', dialog, ['dritteRolle'], g)
    expect((d.schema as { required: string[] }).required).toContain('situation')
    expect(d.user).toContain('rollen[0] and rollen[1] must remain a complete two-person task')
    expect(d.user).toContain(dialog.titel)
  })

  it('ergaenzungAnwenden: Hilfen mit Status ki; die Dialogkarte darf umgearbeitet werden, Bild und Kennung bleiben', () => {
    const i = ergaenzungAnwenden(interview, {
      hilfen: { nachfragen: ['Why?'], wortschatz: [{ wort: 'pet', deutsch: 'Haustier' }], beispiele: ['I have a cat.'] }
    })!
    expect(i.hilfenStatus).toBe('ki')
    expect(i.id).toBe(interview.id)
    expect(fehlendeInhalte(i)).toEqual([])
    expect(ergaenzungAnwenden(interview, { hilfen: {} })).toBeNull()

    const neu = ergaenzungAnwenden(dialog, {
      form: 'infogap',
      titel: 'A summer camp',
      situation: 'Two of your friends know about two camps. Ask them and decide.',
      rolleSchueler: 'ignored',
      rolleKi: 'ignored',
      punkte: ['Where?', 'Cost?', 'When?'],
      ziel: 'Decide on one camp.',
      hilfen: { rollen: [rolle('Asker', 'You want to find out about the camps.'), rolle('Friend 1', 'Info: Lakeside …'), rolle('Friend 2', 'Info: Hilltop …')] }
    }) as DialogKarte
    expect(neu.situation).toContain('Two of your friends')
    expect(neu.rolleSchueler).toBe('You want to find out about the camps.')
    expect(neu.rolleKi).toBe('Info: Lakeside …')
    expect(neu.hilfen?.rollen).toHaveLength(3)
    expect(neu.hilfenStatus).toBe('ki')
    expect(neu.id).toBe(dialog.id)
    // zu zweit bleibt das Set vollständig: die ersten zwei Rollen
    expect(
      dialogRollen(neu)
        .slice(0, 2)
        .every((r) => r.karte)
    ).toBe(true)
    expect(karteFuer3(neu)).toBe(true)
  })
})
