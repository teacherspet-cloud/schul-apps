import { describe, expect, it } from 'vitest'
import { abcEintraege, alphabetisch, anfangsbuchstabe, bedeutungen, begriffSchluessel, doppelteZaehlen, sortierform, type MeinBuch } from '../src/shared/meineBuecher'
import type { WortlisteWort, WortStatus } from '../src/shared/wortliste'

const w = (term: string, translation: string, status: WortStatus = 'neu', pos?: string, id = `${term}|${translation}|${pos ?? ''}`): WortlisteWort => ({
  id,
  term,
  translation,
  status,
  ...(pos ? { pos } : {})
})
const buchstabe = (term: string, sprache: string): string => anfangsbuchstabe(sortierform(term, sprache))

describe('Sortierform (10.10.2026: „the … the" stand unter „#")', () => {
  it('Ursache: NFKD macht aus „…" drei Punkte – danach blieb der Rest „... the" mit Zeichen vorn', () => {
    expect('…'.normalize('NFKD')).toBe('...')
    expect(sortierform('the … the', 'en')).toBe('the')
    expect(buchstabe('the … the', 'en')).toBe('T')
  })
  it('Englisch: Artikel und „to" fallen nur weg, wenn danach ein Wort kommt', () => {
    expect(sortierform('the more … the better', 'en')).toBe('more ... the better')
    expect(buchstabe('the more … the better', 'en')).toBe('M')
    expect(sortierform('to go', 'en')).toBe('go')
    expect(sortierform('(to) look after sb.', 'en')).toBe('look after sb.')
    expect(sortierform('a lot of', 'en')).toBe('lot of')
    expect(sortierform('an apple', 'en')).toBe('apple')
    expect(sortierform('a', 'en')).toBe('a')
    expect(sortierform('the', 'en')).toBe('the')
    expect(sortierform('a/one hundred', 'en')).toBe('a/one hundred')
    expect(buchstabe('a/one hundred', 'en')).toBe('A')
    expect(sortierform('the 1920s', 'en')).toBe('the 1920s')
    expect(sortierform('…ago', 'en')).toBe('ago')
    expect(sortierform('...ago', 'en')).toBe('ago')
    expect(sortierform('“Hi!”', 'en')).toBe('hi!”')
    expect(buchstabe('- ish', 'en')).toBe('I')
  })
  it('Französisch: le/la/les/l\'/un/une/des (und se/s\')', () => {
    expect(sortierform('la école', 'fr')).toBe('ecole')
    expect(sortierform("l'élève", 'fr')).toBe('eleve')
    expect(sortierform('les Champs-Élysées', 'fr')).toBe('champs-elysees')
    expect(sortierform('un ami', 'fr')).toBe('ami')
    expect(sortierform('une amie', 'fr')).toBe('amie')
    expect(sortierform('des amis', 'fr')).toBe('amis')
    expect(sortierform('se laver', 'fr')).toBe('laver')
    expect(sortierform("s'appeler", 'fr')).toBe('appeler')
    expect(sortierform('le … le', 'fr')).toBe('le')
    expect(buchstabe('le … le', 'fr')).toBe('L')
  })
  it('Spanisch: el/la/los/las/un/una', () => {
    expect(sortierform('el niño', 'es')).toBe('nino')
    expect(sortierform('las manzanas', 'es')).toBe('manzanas')
    expect(sortierform('los amigos', 'es')).toBe('amigos')
    expect(sortierform('una casa', 'es')).toBe('casa')
    expect(sortierform('¿Qué tal?', 'es')).toBe('que tal?')
    expect(buchstabe('¡Hola!', 'es')).toBe('H')
  })
  it('Italienisch: il/lo/la/i/gli/le/l\'/un/uno/una', () => {
    expect(sortierform('il libro', 'it')).toBe('libro')
    expect(sortierform('lo zaino', 'it')).toBe('zaino')
    expect(sortierform('gli amici', 'it')).toBe('amici')
    expect(sortierform("l'amico", 'it')).toBe('amico')
    expect(sortierform('uno studente', 'it')).toBe('studente')
  })
  it('Latein: keine Artikel – nichts fällt weg, Makra zählen nicht', () => {
    expect(sortierform('la', 'la')).toBe('la')
    expect(sortierform('āmīcus', 'la')).toBe('amicus')
    expect(sortierform('… et …', 'la')).toBe('et ...')
  })
  it('in der Liste: „the … the" unter T, „the more … the better" unter M – nicht unter „#"', () => {
    const z = alphabetisch(
      [w('the … the', 'je … desto'), w('the more … the better', 'je mehr, desto besser'), w('100', 'hundert'), w('apple', 'Apfel')].map((x) => ({ w: x, quelle: 'GL 3 · U2' })),
      'en'
    )
    expect(z.map((x) => `${x.buchstabe}:${x.term}`)).toEqual(['#:100', 'A:apple', 'M:the more … the better', 'T:the … the'])
  })
})

describe('Doppelte zusammenführen (10.10.2026: „a/one hundred" zweimal)', () => {
  it('Begriff und Bedeutung vergleichen', () => {
    expect(begriffSchluessel('a / one hundred')).toBe(begriffSchluessel('a/one hundred'))
    expect(begriffSchluessel('the more ... the better')).toBe(begriffSchluessel('the more … the better'))
    expect(begriffSchluessel('(to) look after')).toBe(begriffSchluessel('to look after'))
    expect([...bedeutungen('(ein)hundert')].sort()).toEqual(['einhundert', 'hundert'])
    expect([...bedeutungen('100, hundert, einhundert')].sort()).toEqual(['100', 'einhundert', 'hundert'])
  })
  it('echte Green-Line-Doppelte: a/one hundred als „phrase" und als „number" → EINE Zeile', () => {
    const z = alphabetisch(
      [
        { w: w('a/one hundred', '(ein)hundert', 'aufbau', 'phrase'), quelle: 'GL 1 · U2' },
        { w: w('a/one hundred', '100, hundert, einhundert', 'neu', 'number'), quelle: 'GL 1 · U2' },
        { w: w('a / one hundred', 'hundert', 'sicher', 'number'), quelle: 'GL 2 · U1' }
      ],
      'en'
    )
    expect(z.length).toBe(1)
    expect(z[0].status).toBe('sicher')
    expect(z[0].quellen).toEqual(['GL 1 · U2', 'GL 2 · U1'])
    // Wortart nur, wenn alle übereinstimmen
    expect(z[0].pos).toBeUndefined()
    expect(z[0].translation).toBe('100, hundert, einhundert')
  })
  it('gleiche Wortart bleibt stehen', () => {
    const z = alphabetisch([w('dog', 'Hund', 'neu', 'noun'), w('dog', 'Hund', 'aufbau', 'noun')].map((x) => ({ w: x, quelle: 'GL 1 · U1' })), 'en')
    expect(z.length).toBe(1)
    expect(z[0].pos).toBe('noun')
    expect(z[0].status).toBe('aufbau')
  })
  it('gleicher Begriff mit anderer Bedeutung bleibt getrennt', () => {
    const z = alphabetisch([w('bank', 'Bank'), w('bank', 'Ufer')].map((x) => ({ w: x, quelle: 'GL 2 · U3' })), 'en')
    expect(z.length).toBe(2)
  })
  it('Zählung für die Prüfung beim Start (je Kurs, nur Zahlen)', () => {
    expect(doppelteZaehlen([w('a/one hundred', '(ein)hundert'), w('a/one hundred', '100, hundert, einhundert'), w('bank', 'Bank'), w('bank', 'Ufer')])).toBe(1)
    expect(doppelteZaehlen([])).toBe(0)
  })
})

describe('„Meine Wörter | Alle Wörter"', () => {
  const buch = (id: string, woerter: WortlisteWort[], unit = 'Unit 1'): MeinBuch => ({
    id,
    name: id,
    aktuell: false,
    kurz: id.toUpperCase(),
    gruppen: [{ key: `${id}-a`, titel: `${unit} · Station 1`, unit, abschnitt: 'Station 1', zeit: 0, folge: 0, woerter }]
  })
  it('nicht Freigegebenes ist „noch nicht dran", eigene Wörter behalten ihren Stand; gleiche verschmelzen', () => {
    const eintraege = abcEintraege([buch('gl1', [w('dog', 'Hund', 'sicher')])], [], 'Weitere', [buch('gl2', [w('dog', 'Hund'), w('cat', 'Katze')], 'Unit 3')])
    const z = alphabetisch(eintraege, 'en')
    const dog = z.find((x) => x.term === 'dog')!
    const cat = z.find((x) => x.term === 'cat')!
    expect(dog.nichtDran).toBeUndefined()
    expect(dog.status).toBe('sicher')
    expect(dog.quellen).toEqual(['GL1 · U1', 'GL2 · U3'])
    expect(cat.nichtDran).toBe(true)
  })
  it('erst nicht dran, dann freigegeben → zählt als eigenes Wort', () => {
    const z = alphabetisch(
      [
        { w: w('cat', 'Katze'), quelle: 'GL2 · U3', nichtDran: true },
        { w: w('cat', 'Katze', 'aufbau'), quelle: 'GL1 · U1' }
      ],
      'en'
    )
    expect(z[0].nichtDran).toBeUndefined()
    expect(z[0].status).toBe('aufbau')
  })
})
