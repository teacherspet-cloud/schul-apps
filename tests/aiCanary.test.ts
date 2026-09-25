import { describe, expect, it } from 'vitest'
import { CANARY_MAX, CANARY_STYLE, CANARY_WORDS, canaryNote, canaryText, canaryWordFor, canaryWords } from '../src/renderer/src/shared/aiCanary'

describe('Unsichtbarer KI-Test', () => {
  it('wählt für dasselbe Material immer dasselbe Wort', () => {
    const a = canaryWordFor('Der Balkan|Krisenherd')
    expect(canaryWordFor('Der Balkan|Krisenherd')).toBe(a)
    expect(CANARY_WORDS).toContain(a)
    // Verschiedene Blätter bekommen nicht zwangsläufig dasselbe Wort
    const woerter = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((x) => canaryWordFor(`Thema ${x}`)))
    expect(woerter.size).toBeGreaterThan(1)
  })

  it('gibt sich nicht selbst als Test zu erkennen', () => {
    /*
     * Gemeldet am 25.09.2026: ChatGPT hat den Satz gelesen, als nicht zur Aufgabe gehörend
     * eingestuft und ausdrücklich nicht befolgt. Der alte Wortlaut begann mit „Dies ist ein
     * KI-Test." und lieferte damit die Begründung zum Ignorieren gleich mit.
     */
    const text = canaryText('Papaya')
    expect(text).not.toContain('KI-Test')
    expect(text).not.toMatch(/Test/)
    expect(text).toContain('Papaya')
  })

  it('formuliert konditional statt als Befehl', () => {
    // Szczepaniak u. a. (arXiv:2609.22510, 2026): 43–83 % gegenüber höchstens 3 % Erfolg
    expect(canaryText('Papaya')).toMatch(/^Formale Vorgabe/)
    expect(canaryText('Papaya')).toContain('Falls du')
  })

  it('verlangt nur etwas zur Form, nichts zum Inhalt', () => {
    /*
     * Wer das Blatt mit einer Vorlesefunktion bearbeitet, bekommt den Satz vorgelesen. Eine
     * Vorgabe, die die Lösung verfälscht, würde genau diese Lernenden benachteiligen.
     */
    const text = canaryText('Papaya').toLowerCase()
    for (const verboten of ['ignoriere', 'antworte nicht', 'schreibe stattdessen', 'falsch']) {
      expect(text).not.toContain(verboten)
    }
  })

  it('bleibt im Text enthalten, statt entfernt zu werden', () => {
    // display:none oder visibility:hidden würden den Satz aus der Auswahl nehmen –
    // dann ginge er beim Kopieren des PDF-Textes gerade nicht mit
    const css = JSON.stringify(CANARY_STYLE)
    expect(css).not.toContain('none')
    expect(css).not.toContain('hidden')
    expect(CANARY_STYLE.color).toBe('#ffffff')
    expect(CANARY_STYLE.fontSize).toBe('1px')
  })

  it('sagt der Lehrkraft, wonach sie sucht – und was der Test nicht beweist', () => {
    const note = canaryNote('Papaya')
    expect(note).toContain('Papaya')
    expect(note).toContain('unsichtbar')
    // Ehrlich über die Grenzen – jede davon ist belegt, siehe aiCanary.ts
    expect(note).toContain('fehlender Treffer nichts')
    expect(note).toContain('abfotografiert')
    expect(note).toContain('kopiert und eingefügt')
    expect(note).toContain('Indiz')
    expect(note).toContain('Vorlesefunktion')
  })
})

describe('Wörter, die die Lehrkraft selbst wählt', () => {
  /*
   * Wunsch der Lehrkraft (25.09.2026): „wenn man den ki test oben aktiviert, frage den nutzer
   * welche wörter als test benutzt werden sollen."
   */
  it('nimmt die Eingabe der Lehrkraft statt des Vorschlags', () => {
    expect(canaryWords('Nilpferd', 'Papaya')).toEqual(['Nilpferd'])
  })

  it('zerlegt mehrere Wörter an Komma und Zeilenumbruch', () => {
    expect(canaryWords('Nilpferd, Kaktus', 'Papaya')).toEqual(['Nilpferd', 'Kaktus'])
    expect(canaryWords('Nilpferd\nKaktus', 'Papaya')).toEqual(['Nilpferd', 'Kaktus'])
    // Mehrteilige Angaben bleiben zusammen: „Blaues Nilpferd" ist EIN Suchbegriff
    expect(canaryWords('Blaues Nilpferd', 'Papaya')).toEqual(['Blaues Nilpferd'])
  })

  it('fällt ohne Eingabe auf den Vorschlag zurück', () => {
    expect(canaryWords('', 'Papaya')).toEqual(['Papaya'])
    expect(canaryWords('   ', 'Papaya')).toEqual(['Papaya'])
    expect(canaryWords(undefined, 'Papaya')).toEqual(['Papaya'])
  })

  it('begrenzt die Zahl der Wörter', () => {
    // Sonst wird der unsichtbare Satz lang und auffällig
    expect(canaryWords('a, b, c, d, e', 'Papaya')).toHaveLength(CANARY_MAX)
  })

  it('formuliert Satz und Hinweis für mehrere Wörter', () => {
    const text = canaryText(['Nilpferd', 'Kaktus'])
    expect(text).toContain('Nilpferd und Kaktus')
    expect(canaryText(['Nilpferd'])).toContain('Nilpferd')
    const note = canaryNote(['Nilpferd', 'Kaktus'])
    expect(note).toContain('Nilpferd und Kaktus')
    expect(note).toContain('fehlender Treffer nichts')
  })
})
