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
    // Runden verbraucht (25.10.2026): rot, aber zweimal Feedback geholt → die nächste Aufgabe öffnet sich trotzdem
    const zweimalRot = { '1': [{ einschaetzung: 'noch nicht' }, { einschaetzung: 'noch nicht' }] }
    expect(sichtbarBis([1, 2, 3], zweimalRot, [], true, 2)).toBe(2)
    expect(sichtbarBis([1, 2, 3], zweimalRot, [], true, 3)).toBe(1)
    // Einträge vom Einreichen zählen nicht als Runde
    expect(
      sichtbarBis(
        [1, 2, 3],
        {
          '1': [
            { einschaetzung: 'noch nicht', abgabe: true },
            { einschaetzung: 'noch nicht', abgabe: true }
          ]
        },
        [],
        true,
        2
      )
    ).toBe(1)
  })
  it('vollständig bearbeitet: alle mindestens gelb – Einreichen allein genügt nicht', () => {
    expect(vollstaendigBearbeitet([1, 2], { '1': [{ einschaetzung: 'sicher' }] }, [])).toBe(false)
    expect(vollstaendigBearbeitet([1, 2], { '1': [{ einschaetzung: 'sicher' }] }, [2])).toBe(true)
    expect(vollstaendigBearbeitet([1, 2], { '1': [{ einschaetzung: 'noch nicht' }], '2': [{ einschaetzung: 'teilweise' }] }, [])).toBe(false)
  })
})
