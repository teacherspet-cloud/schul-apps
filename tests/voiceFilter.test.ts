import { describe, expect, it } from 'vitest'
import {
  akzentName,
  HERKUNFT,
  herkunftVon,
  passtZurSprache,
  sichtbareStimmen,
  stimmenName,
  vorhandeneAkzente,
  vorhandeneHerkunft
} from '../src/renderer/src/shared/voiceFilter'
import type { TtsVoice } from '../src/shared/types'

const v = (patch: Partial<TtsVoice> & { id: string }): TtsVoice => ({ name: 'Stimme', language: '', gender: '', description: '', ...patch })

const konto: TtsVoice[] = [
  v({ id: 'en1', name: 'Rachel', language: 'american', gender: 'female', category: 'premade' }),
  v({ id: 'en2', name: 'Adam', language: 'american', gender: 'male', category: 'premade' }),
  v({ id: 'en3', name: 'George', language: 'british', gender: 'male', category: 'premade' }),
  v({ id: 'de1', name: 'Lukas', language: 'german', gender: 'male', category: 'premade' }),
  v({ id: 'hi1', name: 'Aditi', language: 'hindi', gender: 'female', category: 'premade' }),
  v({ id: 'own', name: 'Frau Meier', category: 'cloned', isOwner: true }),
  v({ id: 'lib', name: 'Studio-Stimme', language: 'french', category: 'professional', fromLibrary: true })
]

describe('Woher eine Stimme kommt', () => {
  it('benennt die Gruppen ohne Fachjargon', () => {
    // „erzeugt / mitgeliefert / professionell" sind Begriffe der Schnittstelle, keine Auskunft
    expect(HERKUNFT.standard.label).toBe('Standardstimmen')
    expect(HERKUNFT.eigene.label).toBe('Eigene Stimmen')
    expect(HERKUNFT.bibliothek.label).toBe('Aus der Bibliothek')
    for (const h of Object.values(HERKUNFT)) expect(h.hilfe.length).toBeGreaterThan(20)
  })

  it('zählt eine Bibliotheksstimme NICHT zu den eigenen', () => {
    /*
     * Der Kern der Verwechslung: Eine aus der Bibliothek übernommene Stimme trägt ebenfalls
     * „cloned" oder „professional". Die Kategorie allein sagt also nicht, ob sie dem Konto
     * gehört – und genau daran hing, dass der Sprachfilter sie durchwinkte.
     */
    expect(herkunftVon(konto[6])).toBe('bibliothek')
    expect(herkunftVon(konto[5])).toBe('eigene')
    expect(herkunftVon(konto[0])).toBe('standard')
  })

  it('schreibt die Gruppe an die Stimme', () => {
    expect(stimmenName(konto[5])).toMatch(/Eigene Stimmen/)
    expect(stimmenName(konto[0])).toMatch(/Standardstimmen/)
  })

  it('bietet nur Gruppen an, die es wirklich gibt', () => {
    expect(vorhandeneHerkunft(konto)).toEqual(['standard', 'eigene', 'bibliothek'])
    expect(vorhandeneHerkunft([konto[0], konto[1]])).toEqual(['standard'])
  })
})

describe('Sprachfilter', () => {
  it('blendet deutsche und Hindi-Stimmen bei Englisch aus – der gemeldete Fehler', () => {
    const r = sichtbareStimmen(konto, { language: 'en', sprachfilter: true, herkunft: [] })
    expect(r.sichtbar.map((x) => x.id)).not.toContain('de1')
    expect(r.sichtbar.map((x) => x.id)).not.toContain('hi1')
    expect(r.sichtbar.map((x) => x.id)).toContain('en1')
  })

  it('lässt Stimmen ohne Sprachangabe stehen – über sie ist nichts bekannt', () => {
    expect(passtZurSprache(konto[5], 'en')).toBe(true)
  })

  it('verbirgt eine Bibliotheksstimme der falschen Sprache trotzdem', () => {
    // Früher hebelte jede nicht-mitgelieferte Stimme den Filter aus
    expect(passtZurSprache(konto[6], 'en')).toBe(false)
  })

  it('trifft das Sprachkürzel nur als ganzes Wort', () => {
    // „en" steckt in „french", „it" in „british" – als Wortteil wäre der Abgleich falsch
    expect(passtZurSprache(v({ id: 'x', language: 'french' }), 'en')).toBe(false)
    expect(passtZurSprache(v({ id: 'y', language: 'british' }), 'it')).toBe(false)
    expect(passtZurSprache(v({ id: 'z', language: 'en' }), 'en')).toBe(true)
  })

  it('zeigt alle Stimmen, wenn zu wenige passen', () => {
    const italienisch = sichtbareStimmen(konto, { language: 'it', sprachfilter: true, herkunft: [] })
    expect(italienisch.sprachfilterGriff).toBe(false)
    expect(italienisch.sichtbar).toHaveLength(konto.length)
  })
})

describe('Nutzbarkeit nach Tarif', () => {
  const gesperrteBibliothek = [
    ...konto,
    v({ id: 'lib2', name: 'Gesperrt', usable: false, unusableReason: 'Im kostenlosen Tarif gesperrt.', fromLibrary: true })
  ]

  it('nimmt gesperrte Stimmen gar nicht erst in die Auswahl', () => {
    // Sonst scheitert erst das Vertonen – nachdem der Hörtext schon geschrieben ist
    const r = sichtbareStimmen(gesperrteBibliothek, { sprachfilter: false, herkunft: [] })
    expect(r.sichtbar.map((x) => x.id)).not.toContain('lib2')
    expect(r.gesperrt.map((x) => x.id)).toEqual(['lib2'])
  })

  it('nennt den Grund, damit die Sperre erklärbar ist', () => {
    expect(sichtbareStimmen(gesperrteBibliothek, { sprachfilter: false, herkunft: [] }).gesperrt[0].unusableReason).toMatch(/kostenlosen Tarif/)
  })

  it('zeigt sie auf Wunsch trotzdem', () => {
    const r = sichtbareStimmen(gesperrteBibliothek, { sprachfilter: false, herkunft: [], auchGesperrte: true })
    expect(r.sichtbar.map((x) => x.id)).toContain('lib2')
  })
})

describe('Filter nach Herkunft', () => {
  it('grenzt auf eine Gruppe ein', () => {
    expect(sichtbareStimmen(konto, { sprachfilter: false, herkunft: ['eigene'] }).sichtbar.map((x) => x.id)).toEqual(['own'])
  })

  it('lässt sich mit dem Sprachfilter verbinden', () => {
    const r = sichtbareStimmen(konto, { language: 'en', sprachfilter: true, herkunft: ['standard'] })
    expect(r.sichtbar.map((x) => x.id)).toEqual(['en1', 'en2', 'en3'])
  })
})

describe('Akzentfilter', () => {
  it('bietet nur Akzente an, zu denen es auch eine Stimme gibt', () => {
    // Eine Auswahl „Australisches Englisch" ohne solche Stimme führt in eine leere Liste
    expect(vorhandeneAkzente(konto)).toEqual(['american', 'british', 'french', 'german', 'hindi'])
    expect(vorhandeneAkzente([konto[0], konto[1]])).toEqual(['american'])
  })

  it('übersetzt bekannte Akzente, sonst bleibt die Angabe stehen', () => {
    expect(akzentName('british')).toBe('Britisches Englisch')
    expect(akzentName('american')).toBe('Amerikanisches Englisch')
    expect(akzentName('klingonisch')).toBe('Klingonisch')
  })

  it('grenzt auf den gewählten Akzent ein', () => {
    const r = sichtbareStimmen(konto, { sprachfilter: false, herkunft: [], akzente: ['british'] })
    expect(r.sichtbar.map((x) => x.id)).toEqual(['en3', 'own'])
  })

  it('lässt Stimmen ohne Akzentangabe stehen', () => {
    // Die eigene Aufnahme trägt keine Angabe – sie darf durch die Akzentwahl nicht verschwinden
    const r = sichtbareStimmen(konto, { sprachfilter: false, herkunft: [], akzente: ['american'] })
    expect(r.sichtbar.map((x) => x.id)).toContain('own')
  })

  it('zeigt ohne Auswahl alle', () => {
    expect(sichtbareStimmen(konto, { sprachfilter: false, herkunft: [], akzente: [] }).sichtbar).toHaveLength(konto.length)
  })
})
