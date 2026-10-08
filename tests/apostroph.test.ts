import { describe, expect, it } from 'vitest'
import { apostrophNormal, falschesApostroph, istApostroph } from '../src/shared/apostroph'
import { bewerte, buchstaben, kernform, mitLeerzeichen } from '../src/shared/vokabeltrainer'
import { normiert } from '../src/shared/grammatiktrainer'
import { formPasst } from '../src/shared/verbTraining'
import { normalisiere, vergleiche } from '../src/renderer/src/modules/onlinetest/kern'
import { suchselLinie } from '../src/renderer/src/modules/lernen/spiele/SpieleSchreiben'

/* Apostroph-Toleranz in allen Vergleichen (08.10.2026, Befund: „l’école" vom iPad galt als falsch) */
const ZEICHEN = ['’', '‘', 'ʼ', '´', '`', '′', '‛']

describe('Apostroph-Helfer', () => {
  it('faltet alle Apostroph-Zeichen zum geraden', () => {
    for (const z of ZEICHEN) expect(apostrophNormal(`don${z}t`)).toBe("don't")
    expect(apostrophNormal("don't")).toBe("don't")
  })
  it('erkennt das falsche Zeichen, das gerade nicht', () => {
    for (const z of ZEICHEN) expect(falschesApostroph(`l${z}école`)).toBe(true)
    expect(falschesApostroph("l'école")).toBe(false)
    expect(falschesApostroph('école')).toBe(false)
    // mehrfach hintereinander (kein lastIndex-Rest einer globalen Regex)
    expect(falschesApostroph('it’s')).toBe(true)
    expect(falschesApostroph('it’s')).toBe(true)
  })
  it('istApostroph', () => {
    expect(istApostroph("'")).toBe(true)
    expect(istApostroph('’')).toBe(true)
    expect(istApostroph('a')).toBe(false)
  })
})

describe('bewerte mit typografischen Apostrophen', () => {
  it('jedes Zeichen zählt wie das gerade – in beide Richtungen', () => {
    for (const z of ZEICHEN) {
      expect(bewerte(`don${z}t`, "don't").urteil).toBe('richtig')
      expect(bewerte("don't", `don${z}t`).urteil).toBe('richtig')
      expect(bewerte(`l${z}école`, "l'école").urteil).toBe('richtig')
    }
  })
  it('Artikel „l’" fällt in der Kernform weg wie „l\'"', () => {
    expect(kernform("l' homme")).toBe('homme')
    expect(kernform('l’ homme')).toBe('homme')
    expect(bewerte('homme', 'l’ homme').urteil).toBe('richtig')
  })
  it('falsches Wort bleibt falsch', () => {
    expect(bewerte('l’ecale', "l'école").urteil).not.toBe('richtig')
  })
})

describe('Buchstaben legen mit Apostroph', () => {
  it('Apostrophe sind keine Kacheln und stehen vorbelegt', () => {
    const k = buchstaben("l'école", () => 0.5)
    expect(k.some(istApostroph)).toBe(false)
    expect(k.length).toBe(6)
    expect(mitLeerzeichen("l'école", '')).toBe('')
    expect(mitLeerzeichen("l'école", 'l')).toBe("l'")
    expect(mitLeerzeichen("l'école", 'lécole')).toBe("l'école")
    expect(mitLeerzeichen("dogs'", 'dogs')).toBe("dogs'")
    expect(bewerte(mitLeerzeichen('l’école', 'lécole'), "l'école").urteil).toBe('richtig')
  })
})

describe('Grammatik, Verben, Onlinetest', () => {
  it('normiert/formPasst/normalisiere falten alle Zeichen', () => {
    for (const z of ZEICHEN) {
      expect(normiert(`I${z}m`)).toBe(normiert("I'm"))
      expect(formPasst(`don${z}t`, "don't")).toBe(true)
      expect(normalisiere(`it${z}s`)).toBe("it's")
      expect(vergleiche(`it${z}s`, ["it's"])).toBe('richtig')
    }
  })
})

describe('Suchsel: Ziehen rastet auf gerade Linien ein', () => {
  // 5×5-Gitter: Zelle = Zeile * 5 + Spalte
  it('waagerecht, senkrecht, diagonal', () => {
    expect(suchselLinie(5, 0, 3)).toEqual([0, 1, 2, 3])
    expect(suchselLinie(5, 0, 15)).toEqual([0, 5, 10, 15])
    expect(suchselLinie(5, 0, 18)).toEqual([0, 6, 12, 18])
    expect(suchselLinie(5, 4, 20)).toEqual([4, 8, 12, 16, 20])
  })
  it('schiefe Richtung rastet auf die nächste ein, endet am Rand', () => {
    // 3 nach rechts, 1 nach unten → waagerecht
    expect(suchselLinie(5, 0, 8)).toEqual([0, 1, 2, 3])
    // 2 rechts, 2 runter mit kleiner Abweichung → diagonal
    expect(suchselLinie(5, 0, 13)).toEqual([0, 6, 12, 18])
    expect(suchselLinie(5, 7, 7)).toEqual([7])
  })
})
