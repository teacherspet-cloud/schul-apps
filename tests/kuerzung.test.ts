import { describe, expect, it } from 'vitest'
import { kuerzungsHinweis, kuerzungsProtokoll, pruefeKuerzung, wortzahl } from '../src/renderer/src/modules/arbeitsblatt/generation/kuerzung'

/*
 * Wunsch der Lehrkraft (24.09.2026): Originalmaterialien sollen gesucht und mit „[...]“ auf
 * die Längenvorgabe gekürzt werden dürfen.
 *
 * Erlaubt ist das nach § 62 Abs. 5 UrhG nur, wenn die Änderung „deutlich sichtbar kenntlich
 * gemacht" wird – und der Grundsatz aus § 62 Abs. 1 (Änderungsverbot) bleibt bestehen. Eine
 * KI, die beim Kürzen einen Satz glättet, erzeugt also keinen gekürzten Originaltext mehr,
 * sondern eine unzulässige Bearbeitung. Am fertigen Blatt sieht man ihr das nicht an: Sie
 * steht dort mit Quellenangabe und liest sich wie ein Zitat.
 *
 * Deshalb wird hier geprüft, ob die Prüfung selbst scharf ist.
 */
const ORIGINAL = [
  'Die Stadt hatte sich verändert, und niemand sprach darüber.',
  'Am Hafen standen die Kräne still, die Werft war seit zwei Jahren geschlossen.',
  'Müller, der dreißig Jahre dort gearbeitet hatte, ging trotzdem jeden Morgen hinunter.',
  'Er sagte, das Wasser sehe anders aus, wenn niemand mehr darauf hinausfahre.',
  'Die Kinder kannten die Schiffe nur noch von Fotografien.',
  'Und doch blieb die Stadt eine Hafenstadt, weil sie sich nichts anderes vorstellen konnte.'
].join(' ')

describe('Nachweis, dass nur gekürzt wurde', () => {
  it('erkennt eine saubere Kürzung mit Auslassungszeichen', () => {
    const gekuerzt =
      'Die Stadt hatte sich verändert, und niemand sprach darüber. [...] Die Kinder kannten die Schiffe nur noch von Fotografien. Und doch blieb die Stadt eine Hafenstadt, weil sie sich nichts anderes vorstellen konnte.'
    const p = pruefeKuerzung(ORIGINAL, gekuerzt)
    expect(p.ok).toBe(true)
    expect(p.verstoesse).toEqual([])
    expect(p.auslassungen).toHaveLength(1)
    expect(p.anfangErhalten).toBe(true)
    expect(p.schlussErhalten).toBe(true)
  })

  it('nimmt die typografische Schreibweise […] genauso an', () => {
    // In Prüfungsaufgaben steht meist das echte Auslassungszeichen, in KI-Text oft drei Punkte
    const a = pruefeKuerzung(
      ORIGINAL,
      'Die Stadt hatte sich verändert, und niemand sprach darüber. […] Die Kinder kannten die Schiffe nur noch von Fotografien.'
    )
    expect(a.ok).toBe(true)
    expect(a.auslassungen).toHaveLength(1)
  })

  it('schlägt Alarm, wenn ein Satz umgeschrieben wurde', () => {
    /*
     * Das ist der Kern. „die Werft war seit zwei Jahren geschlossen" wird zu „die Werft war
     * lange geschlossen" – sprachlich harmlos, rechtlich eine Bearbeitung, und für die
     * Lehrkraft unsichtbar.
     */
    const gekuerzt = 'Am Hafen standen die Kräne still, die Werft war lange geschlossen.'
    const p = pruefeKuerzung(ORIGINAL, gekuerzt)
    expect(p.ok).toBe(false)
    expect(p.verstoesse.join(' ')).toContain('steht so nicht im Original')
  })

  it('schlägt Alarm, wenn ohne Kennzeichnung gekürzt wurde', () => {
    // Zwei echte Sätze, dazwischen fehlen vier – aber kein […]
    const gekuerzt = 'Am Hafen standen die Kräne still, die Werft war seit zwei Jahren geschlossen. Die Kinder kannten die Schiffe nur noch von Fotografien.'
    const p = pruefeKuerzung(ORIGINAL, gekuerzt)
    expect(p.ok).toBe(false)
    expect(p.verstoesse.join(' ')).toContain('ohne Kennzeichnung gekürzt')
  })

  it('erlaubt ein ersetztes Bezugswort in eckigen Klammern', () => {
    /*
     * Durch die Kürzung verliert „Er" seinen Bezug. Das Bezugswort in eckigen Klammern
     * nachzutragen, ist die übliche und einzige zulässige Ergänzung – sie ist sichtbar.
     */
    const gekuerzt =
      'Die Stadt hatte sich verändert, und niemand sprach darüber. [...] [Müller] sagte, das Wasser sehe anders aus, wenn niemand mehr darauf hinausfahre.'
    const p = pruefeKuerzung(ORIGINAL, gekuerzt)
    expect(p.ok).toBe(true)
    expect(p.einfuegungen).toEqual(['Müller'])
  })

  it('lässt hinter einer eckigen Klammer keine stille Kürzung durch', () => {
    /*
     * Sonst wäre die eckige Klammer ein Schlupfloch: „[Müller]" davor, und dahinter fehlt
     * ein halber Absatz, den niemand bemerkt.
     */
    const gekuerzt = 'Die Stadt hatte sich verändert, und niemand sprach darüber. [Müller] Die Kinder kannten die Schiffe nur noch von Fotografien.'
    const p = pruefeKuerzung(ORIGINAL, gekuerzt)
    expect(p.ok).toBe(false)
    expect(p.verstoesse.join(' ')).toContain('eckigen Klammer')
  })

  it('merkt, wenn die Reihenfolge vertauscht wurde', () => {
    // Umstellen verändert die Argumentation, sieht aber wie ein Zitat aus
    const gekuerzt =
      'Die Kinder kannten die Schiffe nur noch von Fotografien. [...] Am Hafen standen die Kräne still, die Werft war seit zwei Jahren geschlossen.'
    expect(pruefeKuerzung(ORIGINAL, gekuerzt).ok).toBe(false)
  })

  it('stört sich nicht an Anführungszeichen und Bindestrichen', () => {
    /*
     * Fundort und Abschrift unterscheiden sich fast immer in der Typografie. Daran darf die
     * Prüfung nicht scheitern – sonst meldet sie ständig Fehlalarm und wird ignoriert.
     */
    const original = 'Er nannte es einen »Aufbruch« – und meinte das ernst.'
    const gekuerzt = 'Er nannte es einen "Aufbruch" - und meinte das ernst.'
    expect(pruefeKuerzung(original, gekuerzt).ok).toBe(true)
  })

  it('meldet, wenn Anfang oder Schluss fehlen', () => {
    // Kein Verstoß, aber die Lehrkraft soll es wissen: Ein Text ohne Schluss wirkt anders
    const p = pruefeKuerzung(ORIGINAL, 'Am Hafen standen die Kräne still, die Werft war seit zwei Jahren geschlossen.')
    expect(p.ok).toBe(true)
    expect(p.anfangErhalten).toBe(false)
    expect(p.schlussErhalten).toBe(false)
  })
})

describe('Umfang', () => {
  it('zählt die Auslassungszeichen nicht als Wörter mit', () => {
    expect(wortzahl('Ein Satz [...] und noch einer')).toBe(5)
  })

  it('gibt den Anteil des Originals an', () => {
    const p = pruefeKuerzung(
      ORIGINAL,
      'Die Stadt hatte sich verändert, und niemand sprach darüber. [...] Die Kinder kannten die Schiffe nur noch von Fotografien.'
    )
    expect(p.wortzahlOriginal).toBe(69)
    expect(p.anteil).toBeGreaterThan(0.2)
    expect(p.anteil).toBeLessThan(0.4)
  })
})

describe('Kennzeichnung für das Blatt', () => {
  it('nennt den Eingriff im Klartext', () => {
    /*
     * § 62 Abs. 5 UrhG verlangt, dass die Änderung „deutlich sichtbar kenntlich gemacht"
     * wird. Die […] im Text allein leisten das nicht für jemanden, der das Original nicht
     * kennt.
     */
    const p = pruefeKuerzung(
      ORIGINAL,
      'Die Stadt hatte sich verändert, und niemand sprach darüber. [...] [Müller] sagte, das Wasser sehe anders aus, wenn niemand mehr darauf hinausfahre.'
    )
    const hinweis = kuerzungsHinweis(p)
    expect(hinweis).toContain('gekürzt')
    expect(hinweis).toContain('eckigen Klammern')
  })

  it('schweigt, wenn gar nicht gekürzt wurde', () => {
    expect(kuerzungsHinweis(pruefeKuerzung(ORIGINAL, ORIGINAL))).toBe('')
  })

  it('schreibt der Lehrkraft auf, was wo fehlt', () => {
    const p = pruefeKuerzung(
      ORIGINAL,
      'Die Stadt hatte sich verändert, und niemand sprach darüber. [...] Die Kinder kannten die Schiffe nur noch von Fotografien.'
    )
    const protokoll = kuerzungsProtokoll(p).join('\n')
    expect(protokoll).toContain('von 69 Wörtern')
    expect(protokoll).toContain('Auslassung 1')
    expect(protokoll).toContain('Am Hafen')
  })

  it('stellt einen Verstoß im Protokoll deutlich heraus', () => {
    const p = pruefeKuerzung(ORIGINAL, 'Am Hafen standen die Kräne still, die Werft war lange geschlossen.')
    expect(kuerzungsProtokoll(p).join('\n')).toContain('ACHTUNG')
  })
})
