import { describe, expect, it } from 'vitest'
import { inIservGruppe, klasseDerLerngruppe, klassenGruppe } from '../src/server/klassenliste'
import { gehoertZu, type Lerngruppe } from '../src/server/onlinetest'

/*
 * Befund 20.10.2026: „Max Mustermann" (IServ, von der Verwaltung der 5b zugeordnet) fehlte in der Lerngruppe 5b. Die
 * Lerngruppe trug die IServ-Gruppe nur als Namen („Klasse 5b"), die Konten bringen die Kennung („klasse.5b") mit; die
 * Klassenzuordnung der Verwaltung („klasse:5b") zählte für die Lerngruppe gar nicht.
 */
const gruppe = (o: Partial<Lerngruppe>): Lerngruppe =>
  ({ id: 'g1', lehrkraft_id: 'l1', name: '5b', fach: 'Englisch', iserv_gruppe: '', mitglieder: [], erstellt: '', ...o }) as Lerngruppe

describe('Mitglieder einer Lerngruppe', () => {
  it('IServ-Gruppe passt über Kennung oder Namen, ohne Groß-/Kleinschreibung', () => {
    const g = [{ id: 'klasse.5b', name: 'Klasse 5b' }]
    expect(inIservGruppe('klasse.5b', g)).toBe(true)
    expect(inIservGruppe('Klasse 5b', g)).toBe(true)
    expect(inIservGruppe('klasse 5b', g)).toBe(true)
    expect(inIservGruppe('Klasse 5a', g)).toBe(false)
    expect(inIservGruppe('', g)).toBe(false)
  })

  it('Klasse einer Lerngruppe aus Name oder IServ-Gruppe; Kurse sind keine Klasse', () => {
    expect(klasseDerLerngruppe({ name: '5b' })).toBe('klasse:5b')
    expect(klasseDerLerngruppe({ name: 'Englisch', iserv_gruppe: 'Klasse 10b' })).toBe('klasse:10b')
    expect(klasseDerLerngruppe({ name: 'EN 13 eA Kon', iserv_gruppe: 'EN 13 eA Kon' })).toBe('')
    expect(klasseDerLerngruppe({ name: '5b' })).toBe(klassenGruppe('5b').id)
  })

  it('IServ-Lernende der Klasse gehören zur verknüpften Lerngruppe (Name „Klasse 5b")', () => {
    const g = gruppe({ iserv_gruppe: 'Klasse 5b' })
    expect(gehoertZu(g, { benutzer: 'a.b', gruppen: [{ id: 'klasse.5b', name: 'Klasse 5b' }] })).toBe(true)
    expect(gehoertZu(g, { benutzer: 'a.b', gruppen: [{ id: 'klasse.5a', name: 'Klasse 5a' }] })).toBe(false)
  })

  it('von der Verwaltung der 5b zugeordnet → in jeder Lerngruppe der 5b, nicht in Kursen', () => {
    const max = { benutzer: 'max.mustermann', gruppen: [{ id: 'klasse.5a', name: 'Klasse 5a' }, klassenGruppe('5b')] }
    expect(gehoertZu(gruppe({ iserv_gruppe: 'Klasse 5b' }), max)).toBe(true)
    expect(gehoertZu(gruppe({ fach: 'Geschichte' }), max)).toBe(true)
    expect(gehoertZu(gruppe({ name: '5c' }), max)).toBe(false)
    expect(gehoertZu(gruppe({ name: 'EN 13 eA Kon', iserv_gruppe: 'EN 13 eA Kon' }), max)).toBe(false)
  })

  it('die Zuordnung von Hand überschreibt die IServ-Klasse; IServ-Kurse bleiben', () => {
    const max = { benutzer: 'max.mustermann', gruppen: [{ id: 'klasse.5a', name: 'Klasse 5a' }, { id: 'en-5-kon', name: 'EN 5 Kon' }, klassenGruppe('5b')] }
    expect(gehoertZu(gruppe({ name: '5a', iserv_gruppe: 'Klasse 5a' }), max)).toBe(false)
    expect(gehoertZu(gruppe({ name: 'EN 5 Kon', iserv_gruppe: 'EN 5 Kon' }), max)).toBe(true)
    // Ohne Zuordnung gilt die IServ-Klasse
    const ohne = { benutzer: 'a.b', gruppen: [{ id: 'klasse.5a', name: 'Klasse 5a' }] }
    expect(gehoertZu(gruppe({ name: '5a', iserv_gruppe: 'Klasse 5a' }), ohne)).toBe(true)
  })
})
