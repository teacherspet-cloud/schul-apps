import { describe, expect, it } from 'vitest'
import { pruefeKurztest, teilaufgaben } from '../src/renderer/src/modules/lernzielkontrolle/didactics/pruefungen'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import type { Kurztest, StoffQuelle } from '../src/renderer/src/modules/lernzielkontrolle/model/types'
import { bilderAus, kurztestPrompt } from '../src/renderer/src/modules/lernzielkontrolle/generation/generateKurztest'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const aufgabe = (id: string, instruction: string, teile: string[], points = 3): WsBlock => ({
  id,
  type: 'task',
  instruction,
  operator: instruction.replace(/\*\*/g, '').split(/[ .]/)[0],
  afb: 'I',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points,
  solution: 'siehe Lösungsblatt',
  answer: emptyAnswer('none'),
  parts: teile.map((t, i) => ({ id: `${id}-p${i}`, instruction: t, answer: emptyAnswer('lines'), solution: '' }))
})

const test = (blocks: WsBlock[], patch: Partial<Kurztest['meta']> = {}): Kurztest => {
  const t = emptyKurztest('BY', 'gymnasium', 'Gymnasium')
  t.meta = { ...t.meta, subjectId: 'mathematik', subjectLabel: 'Mathematik', grade: 10, thema: 'Potenzgesetze', minutes: 20, ...patch }
  t.varianten = [{ id: 'v1', label: '', blocks }]
  return t
}

/*
 * Diese Tests halten fest, was im PRÜFDURCHLAUF MIT ECHTER KI (23.09.2026) herauskam –
 * und was dabei an der Prüfung selbst falsch war.
 *
 * Der zweite Durchlauf lieferte fachlich einwandfreie Aufgaben in genau der Bauform, die die
 * App verlangt: der Operator einmal oben, darunter nur noch die Terme. Die Prüfung meldete
 * trotzdem sieben Mal „beginnt mit keinem erkennbaren Operator", weil sie nur die
 * Teilaufgaben ansah. Der Fehler lag nicht bei der KI, sondern bei mir.
 */
describe('Der Operator vererbt sich auf die Teilaufgaben', () => {
  const echteAufgaben = [
    aufgabe('t1', '**Berechne.**', ['a) $2^4\\cdot 2^3$', 'b) $\\dfrac{5^8}{5^5}$', 'c) $(3^2)^3$']),
    aufgabe('t2', '**Vereinfache.**', [
      'a) $a^7\\cdot a^4$',
      'b) $\\dfrac{x^{12}}{x^5}$ für $x\\neq 0$',
      'c) $\\dfrac{(b^3)^4\\cdot b^2}{b^9}$ für $b\\neq 0$'
    ]),
    aufgabe('t3', '**Begründe.**', ['Für jede Zahl $c\\neq 0$ gilt: $\\dfrac{(c^2)^3}{c^6}=1$.'], 1)
  ]

  it('schweigt bei der Bauform, die die App selbst verlangt', () => {
    expect(pruefeKurztest(test(echteAufgaben))).toEqual([])
  })

  it('zählt die Teilaufgaben, nicht die Aufgaben', () => {
    expect(teilaufgaben(echteAufgaben)).toBe(7)
  })

  it('meldet weiterhin den nackten Term ohne jede Anweisung', () => {
    // Steht oben NICHTS, kann sich auch nichts vererben
    const befunde = pruefeKurztest(test([aufgabe('t1', '', ['a) $2^4 \\cdot 2^3$'])]))
    expect(befunde.some((b) => /keine Arbeitsanweisung/.test(b.message))).toBe(true)
    expect(befunde.some((b) => /keinem erkennbaren Operator/.test(b.message))).toBe(true)
  })

  it('prüft den geerbten Operator gegen die Antwortform der Teilaufgabe', () => {
    /*
     * Die Vererbung darf die inhaltliche Prüfung nicht aushebeln: „Bestimme" oben und eine
     * Zuordnung unten bleibt derselbe Fehler wie zuvor.
     */
    const b = aufgabe('t1', '**Bestimme.**', ['Ordne die Umformungen zu.'])
    if (b.type === 'task') b.parts[0].answer = emptyAnswer('matching')
    expect(pruefeKurztest(test([b])).some((x) => /keinen Weg zum Darstellen/.test(x.message))).toBe(true)
  })
})

describe('Fehlende Arbeitsanweisung', () => {
  it('wird gemeldet, auch wenn alles in den Teilaufgaben steht', () => {
    /*
     * Erster Prüfdurchlauf mit echter KI: Die Anweisung blieb leer, alles stand in den
     * Teilaufgaben. Auf dem Blatt erschien an ihrer Stelle der Platzhalter des Editors.
     */
    const befunde = pruefeKurztest(test([aufgabe('t1', '', ['Berechne $2^4 \\cdot 2^3$.'])]))
    expect(befunde.find((b) => /keine Arbeitsanweisung/.test(b.message))?.schwere).toBe('warnung')
  })

  it('schweigt, wenn sie da ist', () => {
    expect(pruefeKurztest(test([aufgabe('t1', '**Berechne.**', ['a) $2^4 \\cdot 2^3$'])]))).toEqual([])
  })
})

describe('Umfang gegen die Zeit', () => {
  it('meldet den Umfang der vorgelegten Potenzgesetze-Kontrolle', () => {
    // 10 Aufgaben über drei Seiten – der Anlass für dieses Programm
    const viele = Array.from({ length: 10 }, (_, i) => aufgabe(`t${i}`, '**Berechne.**', ['a)', 'b)']))
    const befunde = pruefeKurztest(test(viele))
    expect(befunde.some((b) => /der Sache nach eine Klassenarbeit/.test(b.message))).toBe(true)
  })

  it('lässt sieben Teilaufgaben in 20 Minuten durchgehen', () => {
    // Echte bayerische Stegreifaufgaben haben 4 bis 9 Teilaufgaben für 20 Minuten
    const sieben = [
      aufgabe('t1', '**Berechne.**', ['a)', 'b)', 'c)']),
      aufgabe('t2', '**Vereinfache.**', ['a)', 'b)', 'c)']),
      aufgabe('t3', '**Begründe.**', ['a)'])
    ]
    expect(pruefeKurztest(test(sieben)).filter((b) => b.bereich === 'Umfang und Zeit')).toEqual([])
  })
})

/*
 * Tafelbilder und Buchseiten als Stoffbeleg.
 *
 * Eine getippte Stoffangabe bleibt grob („Potenzgesetze"). Ein abfotografiertes Tafelbild
 * zeigt die Schreibweise, die Beispiele und die Reihenfolge, die die Klasse kennt – und
 * genau darauf muss sich ein Kurztest beschränken, der laut GSO § 23 höchstens zwei
 * vorangegangene Unterrichtsstunden abdecken darf.
 */
describe('Hineingezogene Unterlagen', () => {
  const quelle = (patch: Partial<StoffQuelle> = {}): StoffQuelle => ({
    id: 'q1',
    fileName: 'Tafelbild 12.09.jpg',
    kind: 'image',
    text: '',
    bilder: ['data:image/png;base64,AAA'],
    aktiv: true,
    ...patch
  })

  const mitQuellen = (quellen: StoffQuelle[]): Kurztest => test([aufgabe('t1', '**Berechne.**', ['a)'])], { stoffQuellen: quellen })

  it('nennt die Unterlagen im Auftrag und bindet die KI an sie', () => {
    const p = kurztestPrompt(mitQuellen([quelle({ text: 'a^m · a^n = a^(m+n)' })]), '')
    expect(p).toMatch(/WAS IM UNTERRICHT DRAN WAR/)
    expect(p).toMatch(/Bleibe INNERHALB dessen/)
    expect(p).toMatch(/a\^m · a\^n/)
    expect(p).toMatch(/Tafelbild 12\.09\.jpg/)
  })

  it('sagt es dazu, wenn eine Unterlage keinen Text hergibt', () => {
    // Ein handschriftliches Tafelbild hat keine Textebene – dort trägt allein das Bild
    expect(kurztestPrompt(mitQuellen([quelle()]), '')).toMatch(/kein auslesbarer Text – siehe das beigefügte Bild/)
  })

  it('gibt die Seitenbilder an die KI weiter', () => {
    expect(bilderAus(mitQuellen([quelle()]))).toEqual(['data:image/png;base64,AAA'])
  })

  it('übergeht abgewählte Unterlagen', () => {
    const t = mitQuellen([quelle({ aktiv: false })])
    expect(kurztestPrompt(t, '')).not.toMatch(/WAS IM UNTERRICHT DRAN WAR/)
    expect(bilderAus(t)).toEqual([])
  })

  it('schweigt ohne Unterlagen', () => {
    expect(kurztestPrompt(mitQuellen([]), '')).not.toMatch(/WAS IM UNTERRICHT DRAN WAR/)
  })

  it('deckelt sehr lange Unterlagen', () => {
    // Ein ganzes Schulbuchkapitel würde den Auftrag sprengen und die Aufgabe verwässern
    const lang = quelle({ text: 'x'.repeat(20000), kind: 'pdf' })
    expect(kurztestPrompt(mitQuellen([lang]), '').length).toBeLessThan(12000)
  })
})

/*
 * Bevorzugte Operatoren (Wunsch der Lehrkraft, 23.09.2026).
 *
 * Bewusst als VORSCHLAG an die KI formuliert und nicht als Zwang. Manche Antwortformen
 * verlangen einen bestimmten Operator – eine Zuordnung braucht „Ordne zu" oder „Gib an",
 * keinen, der einen Lösungsweg verlangt. Ein erzwungener Operator erzeugte also genau den
 * Fehler, den die App an anderer Stelle meldet.
 */
describe('Bevorzugte Operatoren', () => {
  const mit = (ops: string[]): Kurztest => test([aufgabe('t1', '**Berechne.**', ['a)'])], { bevorzugteOperatoren: ops })

  it('gibt die Auswahl an die KI weiter', () => {
    const p = kurztestPrompt(mit(['berechne', 'gib an']), '')
    expect(p).toMatch(/BEVORZUGTE OPERATOREN/)
    expect(p).toMatch(/berechne, gib an/)
  })

  it('formuliert sie als Vorschlag, nicht als Vorschrift', () => {
    const p = kurztestPrompt(mit(['begründe']), '')
    expect(p).toMatch(/nimm den fachlich richtigen/)
    expect(p).toMatch(/unpassender Operator wäre schlimmer als ein nicht gewünschter/)
  })

  it('schweigt ohne Auswahl', () => {
    expect(kurztestPrompt(mit([]), '')).not.toMatch(/BEVORZUGTE OPERATOREN/)
  })

  it('hebelt die Operatorprüfung nicht aus', () => {
    /*
     * Auch wenn „bestimme" gewünscht ist: Bei einer Zuordnung bleibt es der falsche
     * Operator. Die Prüfung richtet sich nach der Aufgabe, nicht nach dem Wunsch.
     */
    const b = aufgabe('t1', '**Bestimme.**', ['Ordne zu.'])
    if (b.type === 'task') b.parts[0].answer = emptyAnswer('matching')
    const t = test([b], { bevorzugteOperatoren: ['bestimme'] })
    expect(pruefeKurztest(t).some((x) => /keinen Weg zum Darstellen/.test(x.message))).toBe(true)
  })
})
