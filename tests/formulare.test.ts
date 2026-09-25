/**
 * Formulare und Arbeitsblatt-Editor – Paket 6 (25.09.2026).
 *
 * - „Mehr“: Der erste Satz eines Erklärtextes steht da, der Rest klappt auf. Die Hinweise sind
 *   voller Abkürzungen („§ 21 Abs. 2 S. 8“) – daran darf der Satz nicht zerbrechen.
 * - „Weitere Optionen“: Die eingeklappte Überschrift nennt, was vom Standard abweicht.
 * - Duplizieren: neue Kennung, ohne frühere Entwürfe und ohne freie Lage.
 */
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '@shared/design'
import { ersterSatz } from '../src/renderer/src/shared/ersterSatz'
import { geaenderteOptionen as abOptionen } from '../src/renderer/src/modules/arbeitsblatt/steps/TopicStep'
import { geaenderteOptionen as lzkOptionen } from '../src/renderer/src/modules/lernzielkontrolle/steps/SetupStep'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { dupliziereBaustein, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

describe('Erster Satz für „Mehr“', () => {
  it('teilt nach dem ersten Satz', () => {
    expect(ersterSatz('Das ist der erste Satz. Und hier der zweite.')).toEqual(['Das ist der erste Satz.', 'Und hier der zweite.'])
  })
  it('lässt Paragraphen und Abkürzungen ganz', () => {
    const t = 'Im Ermessen der Lehrkraft (§ 21 Abs. 2 S. 8). Zweiter Satz.'
    expect(ersterSatz(t)[0]).toBe('Im Ermessen der Lehrkraft (§ 21 Abs. 2 S. 8).')
    expect(ersterSatz('Zum Beispiel z. B. Potenzen und u. a. Wurzeln. Rest.')[0]).toBe('Zum Beispiel z. B. Potenzen und u. a. Wurzeln.')
  })
  it('trennt nach einer Jahrgangsangabe, aber nicht nach einer Ordnungszahl', () => {
    expect(ersterSatz('Vorschläge aus dem Kerncurriculum, Jg. 7/8. Der Lehrplan führt sie als Beispiel.')[0]).toBe(
      'Vorschläge aus dem Kerncurriculum, Jg. 7/8.'
    )
    expect(ersterSatz('Gilt ab dem 5. Lernjahr. Vorher nicht.')[0]).toBe('Gilt ab dem 5. Lernjahr.')
  })
  it('gibt einen einzelnen Satz ohne Rest zurück', () => {
    expect(ersterSatz('Nur ein Satz.')).toEqual(['Nur ein Satz.', ''])
  })
})

describe('„Weitere Optionen“: was vom Standard abweicht', () => {
  const designs = presetDesigns()
  it('Arbeitsblatt: ein frisches Blatt hat nichts geändert', () => {
    expect(abOptionen(defaultMeta('NI', 'gymnasium', 'Gymnasium'), designs[0], designs)).toEqual([])
  })
  it('Arbeitsblatt: nennt Differenzierung, Piktogramme und ein fehlendes Lösungsblatt', () => {
    const m = {
      ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
      differentiation: { levels: 2 as const, mode: 'separate' as const },
      pictograms: true,
      answerKey: false
    }
    expect(abOptionen(m, designs[0], designs)).toEqual(['Differenzierung ★/★★', 'Piktogramme', 'ohne Lösungsblatt'])
  })
  it('LZK: eine frische Kontrolle hat nichts geändert, ein Nachteilsausgleich zählt', () => {
    const t = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    expect(lzkOptionen(t.meta, t.meta.bezeichnung)).toEqual([])
    const m = { ...t.meta, nachteilsausgleich: { ...t.meta.nachteilsausgleich, aktiv: true }, nameFeld: false }
    expect(lzkOptionen(m, t.meta.bezeichnung)).toEqual(['ohne Namensfelder', 'Nachteilsausgleich'])
  })
})

describe('Baustein duplizieren', () => {
  it('bekommt eine neue Kennung, aber keine Entwürfe und keine freie Lage', () => {
    const b = { ...newBlock('infoBox'), body: 'Merke', free: { page: 1, x: 0, y: 0, width: 50 }, versions: [], versionIndex: 0 } as WsBlock
    const k = dupliziereBaustein(b)
    expect(k.id).not.toBe(b.id)
    expect(k).toMatchObject({ type: 'infoBox', body: 'Merke' })
    expect('free' in k || 'versions' in k || 'versionIndex' in k).toBe(false)
    // Das Original bleibt unberührt
    expect(b.free).toBeDefined()
  })
})
