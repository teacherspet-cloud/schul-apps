import { describe, expect, it } from 'vitest'
import { alsVokabel, sprechFormen, sprechtext, verbSchluessel } from '../src/renderer/src/shared/verben/VerbMedien'

/**
 * Bild und Aussprache der unregelmäßigen Verben (07.10.2026): Schlüssel ist die Grundform – so teilen alle Bände
 * (Green Line 2 und 3 …) und die Vokabellisten Bild und Aussprache eines Verbs.
 */
const zeile = (inf: string, past: string, pp: string, de = '', hinweis?: string) => ({
  id: 'x',
  formen: { inf, past, pp, de },
  ...(hinweis ? { hinweis } : {})
})

describe('Verben in der Medienbank', () => {
  it('Schlüssel: Grundform ohne to, Klammern und Varianten', () => {
    expect(verbSchluessel(zeile('(to) be', 'was/were', 'been'), 'en')).toBe('be')
    expect(verbSchluessel(zeile('to go', 'went', 'gone'), 'en')).toBe('go')
    expect(verbSchluessel(zeile('burn (sth)', 'burnt/burned', 'burnt/burned'), 'en')).toBe('burn')
  })
  it('gleiches Verb in zwei Bänden → gleicher Schlüssel', () => {
    expect(verbSchluessel(zeile('go', 'went', 'gone'), 'en')).toBe(verbSchluessel(zeile('(to) go', 'went', 'gone'), 'en'))
  })
  it('gesprochen werden alle drei Formen, nicht die deutsche Bedeutung', () => {
    expect(sprechtext('burnt/burned')).toBe('burnt, burned')
    expect(sprechFormen(zeile('(to) be', 'was/were', 'been', 'sein'), 'en').map((f) => f.text)).toEqual(['to be', 'was, were', 'been'])
    const v = alsVokabel(zeile('go', 'went', 'gone', 'gehen', 'go home'), 'en')
    expect(v).toEqual({ term: 'go', translation: 'gehen', formen: ['go', 'went', 'gone'], hinweis: 'go home' })
  })
})
