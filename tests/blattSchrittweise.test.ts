import { describe, expect, it } from 'vitest'
import { ampelVon, sichtbarBis, vollstaendigBearbeitet } from '../src/shared/blattFreigabe'

describe('Schrittweise Freischaltung und Ampel (05.10.2026)', () => {
  it('Ampel: bestes Urteil zählt, Lehrkraft-Freigabe = gelb', () => {
    expect(ampelVon(undefined)).toBe('rot')
    expect(ampelVon([{ einschaetzung: 'noch nicht' }])).toBe('rot')
    expect(ampelVon([{ einschaetzung: 'teilweise' }, { einschaetzung: 'noch nicht' }])).toBe('gelb')
    expect(ampelVon([{ einschaetzung: 'teilweise' }, { einschaetzung: 'sicher' }])).toBe('gruen')
    expect(ampelVon([], true)).toBe('gelb')
  })
  it('nächste Aufgabe erst, wenn die vorige mindestens gelb ist', () => {
    expect(sichtbarBis([1, 2, 3], {}, [], true)).toBe(1)
    expect(sichtbarBis([1, 2, 3], { '1': [{ einschaetzung: 'teilweise' }] }, [], true)).toBe(2)
    expect(sichtbarBis([1, 2, 3], { '1': [{ einschaetzung: 'sicher' }] }, [2], true)).toBe(Number.POSITIVE_INFINITY)
    expect(sichtbarBis([1, 2, 3], {}, [], false)).toBe(Number.POSITIVE_INFINITY)
  })
  it('vollständig bearbeitet: alle mindestens gelb – Einreichen allein genügt nicht', () => {
    expect(vollstaendigBearbeitet([1, 2], { '1': [{ einschaetzung: 'sicher' }] }, [])).toBe(false)
    expect(vollstaendigBearbeitet([1, 2], { '1': [{ einschaetzung: 'sicher' }] }, [2])).toBe(true)
    expect(vollstaendigBearbeitet([1, 2], { '1': [{ einschaetzung: 'noch nicht' }], '2': [{ einschaetzung: 'teilweise' }] }, [])).toBe(false)
  })
})
