import { describe, expect, it } from 'vitest'
import {
  gesamtpunkte,
  imBereich,
  notenspiegel,
  pruefeBewertung,
  SCHLUESSEL,
  schluesselById,
  schluesselHinweis,
  STANDARD_BEWERTUNG,
  type Bewertungseinstellung
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/bewertung'
import { verteilePunkte } from '../src/renderer/src/modules/lernzielkontrolle/generation/generateKurztest'

const aufgabe = (points: number, parts: number[] = []) => ({
  type: 'task',
  points,
  parts: parts.map((p) => ({ points: p }))
})

/*
 * Entscheidung der Lehrkraft (23.09.2026): Punkte je Aufgabe auf dem Schülerblatt,
 * Notenschlüssel NUR auf dem Lösungsblatt. Rechtlich die sichere Seite: Einen Notenspiegel
 * verlangt Berlin (Sek I-VO § 19 Abs. 7) ausdrücklich nur bei Klassenarbeiten.
 */
describe('Voreinstellung', () => {
  it('zeigt Punkte und den eigenen Schlüssel aus den Einstellungen', () => {
    /*
     * Wunsch der Lehrkraft (23.09.2026): 91/78/64/50/25 als Voreinstellung, je Fach in den
     * Einstellungen änderbar. Vorher stand hier „kein Schlüssel" – das entsprach den echten
     * bayerischen Vorlagen, verlangte aber bei jeder Arbeit eine Umstellung von Hand.
     */
    expect(STANDARD_BEWERTUNG.punkteAufBlatt).toBe(true)
    expect(STANDARD_BEWERTUNG.schluessel).toBe('standard')
  })

  it('nimmt die Schwellen aus den Einstellungen, nicht aus der Liste', () => {
    const ausEinstellungen = [90, 75, 60, 45, 20]
    const spiegel = notenspiegel(20, STANDARD_BEWERTUNG, ausEinstellungen)
    expect(spiegel.map((z) => z.abProzent)).toEqual(ausEinstellungen)
  })

  it('fällt auf 91/78/64/50/25 zurück, wenn nichts hinterlegt ist', () => {
    expect(notenspiegel(20, STANDARD_BEWERTUNG).map((z) => z.abProzent)).toEqual([91, 78, 64, 50, 25])
  })
})

describe('Beleglage der Notenschlüssel', () => {
  it('kennt genau einen verbindlichen Schlüssel', () => {
    const verbindlich = SCHLUESSEL.filter((s) => s.verbindlich)
    expect(verbindlich).toHaveLength(1)
    expect(verbindlich[0].id).toBe('mv')
  })

  it('gibt die MV-Grenzen wörtlich wieder', () => {
    // LeistBewVO § 4 Abs. 3: 96 / 80 / 60 / 40 / 20
    expect(schluesselById('mv')!.grenzen).toEqual([96, 80, 60, 40, 20])
  })

  it('nennt die Einschränkung für Lernerfolgskontrollen', () => {
    // § 4 Abs. 4: gilt hier nur „als Orientierung"
    expect(schluesselById('mv')!.herkunft).toMatch(/als „?Orientierung/)
  })

  it('bezeichnet die übrigen offen als Faustregeln', () => {
    for (const s of SCHLUESSEL.filter((x) => !x.verbindlich)) {
      // Jeder nicht verbindliche Schlüssel muss sagen, dass er keine Vorschrift ist
      expect(s.herkunft, s.id).toMatch(/ohne Rechtsgrundlage|keine Rechtsgrundlage|Keine Rechtsvorschrift/)
    }
  })

  it('schreibt die Herkunft an den Schlüssel auf dem Lösungsblatt', () => {
    expect(schluesselHinweis({ punkteAufBlatt: true, schluessel: 'linear' })).toMatch(/ohne Rechtsgrundlage/)
    // Der voreingestellte Schlüssel nennt seine Schwellen und sagt, dass er keine Vorschrift ist
    expect(schluesselHinweis(STANDARD_BEWERTUNG)).toMatch(/Keine Rechtsvorschrift/)
    expect(schluesselHinweis({ punkteAufBlatt: true, schluessel: 'keiner' })).toBe('')
  })
})

describe('Punktzahl', () => {
  it('zählt die Punkte der Aufgaben', () => {
    /*
     * Die Punktzahl hängt an der AUFGABE, nicht an den Teilaufgaben. Bei zwei bis vier
     * Aufgaben wäre eine Bepunktung je Teilaufgabe mehr Buchhaltung als Nutzen – und das
     * Datenmodell der Teilaufgabe kennt auch kein Punktefeld.
     */
    expect(gesamtpunkte([aufgabe(5, [2, 3]), aufgabe(4)])).toBe(9)
  })

  it('zählt Material nicht mit', () => {
    expect(gesamtpunkte([{ type: 'text' }, aufgabe(3)])).toBe(3)
  })
})

describe('Notenspiegel auf dem Lösungsblatt', () => {
  it('rundet die Punktgrenze auf', () => {
    /*
     * MV § 4 Abs. 3: „Maßgeblich … sind ganze Prozentwerte. Eine Rundung findet nicht statt."
     * Bei 20 Punkten sind 96 % = 19,2 Punkte. Abrunden auf 19 würde die Eins bei 95 % geben.
     */
    const spiegel = notenspiegel(20, { punkteAufBlatt: true, schluessel: 'mv' })
    expect(spiegel[0]).toEqual({ note: 1, abProzent: 96, abPunkten: 19.2 })
    expect(spiegel[2].abPunkten).toBe(12) // 60 % von 20
  })

  it('schweigt ohne Schlüssel und ohne Punkte', () => {
    expect(notenspiegel(20, { punkteAufBlatt: true, schluessel: 'keiner' })).toEqual([])
    expect(notenspiegel(0, { punkteAufBlatt: true, schluessel: 'mv' })).toEqual([])
  })

  it('nimmt eigene Grenzen der Fachkonferenz', () => {
    const eigen: Bewertungseinstellung = { punkteAufBlatt: true, schluessel: 'eigen', eigeneGrenzen: [90, 75, 60, 45, 20] }
    expect(notenspiegel(40, eigen)[1]).toEqual({ note: 2, abProzent: 75, abPunkten: 30 })
  })
})

describe('Prüfung der Bepunktung', () => {
  it('meldet einen Schlüssel ohne Bezugsgröße', () => {
    const w = pruefeBewertung([aufgabe(0), aufgabe(0)], { punkteAufBlatt: true, schluessel: 'mv' })
    expect(w[0].message).toMatch(/keine Bezugsgröße/)
  })

  it('meldet halb bepunktete Blätter', () => {
    const w = pruefeBewertung([aufgabe(3), aufgabe(0)], STANDARD_BEWERTUNG)
    expect(w[0].message).toMatch(/Entweder alle oder keine/)
  })

  it('schweigt, wenn die Punkte bewusst abgeschaltet sind', () => {
    /*
     * Die echten bayerischen Vorlagen haben gar keine Punkte – das ist zulässig. Seit der
     * Notenschlüssel voreingestellt ist, hätte die Warnung „Schlüssel ohne Bezugsgröße"
     * sonst jedes solche Blatt getroffen.
     */
    expect(pruefeBewertung([aufgabe(0), aufgabe(0)], { punkteAufBlatt: false, schluessel: 'standard' })).toEqual([])
  })

  it('meldet den Schlüssel ohne Punkte, solange Punkte gewollt sind', () => {
    const w = pruefeBewertung([aufgabe(0), aufgabe(0)], STANDARD_BEWERTUNG)
    expect(w[0].message).toMatch(/keine Bezugsgröße/)
  })

  it('meldet einen Schlüssel, der nicht fällt', () => {
    const kaputt: Bewertungseinstellung = { punkteAufBlatt: true, schluessel: 'eigen', eigeneGrenzen: [90, 75, 80, 45, 20] }
    expect(pruefeBewertung([aufgabe(10)], kaputt)[0].message).toMatch(/steigt nicht/)
  })

  it('schweigt bei einem stimmigen Blatt', () => {
    expect(pruefeBewertung([aufgabe(3), aufgabe(2)], { punkteAufBlatt: true, schluessel: 'mv' })).toEqual([])
  })
})

/*
 * Aus dem ersten Prüfdurchlauf mit echter KI (23.09.2026): Der erzeugte Test war fachlich
 * sauber, trug aber an jeder Aufgabe null Punkte. Ursache war nicht die KI, sondern der
 * gemeinsame Umwandlungsweg (fest `points: 0`, behoben in Paket 6 – tests/punkte.test.ts).
 * Die Verteilung hier bleibt der Rückfall, wenn wirklich keine Punkte kommen.
 */
describe('Punkte notfalls selbst verteilen', () => {
  const task = (points: number, parts: number) =>
    ({
      id: `t${points}${parts}`,
      type: 'task',
      instruction: '**Berechne.**',
      operator: 'berechnen',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      minutes: 4,
      points,
      solution: '',
      answer: { kind: 'none' },
      parts: Array.from({ length: parts }, (_, i) => ({ instruction: `Teil ${i}`, answer: { kind: 'lines' }, solution: '' }))
    }) as never

  it('vergibt Punkte nach der Zahl der Teilaufgaben', () => {
    const blocks = [task(0, 3), task(0, 1)]
    verteilePunkte(blocks)
    expect(gesamtpunkte(blocks)).toBe(4)
  })

  it('lässt vergebene Punkte unangetastet', () => {
    // Die KI weiß besser als eine Faustregel, was eine Aufgabe wert ist – wenn sie etwas sagt
    const blocks = [task(5, 3), task(0, 1)]
    verteilePunkte(blocks)
    expect(gesamtpunkte(blocks)).toBe(5)
  })

  it('gibt jeder Aufgabe mindestens einen Punkt', () => {
    const blocks = [task(0, 0)]
    verteilePunkte(blocks)
    expect(gesamtpunkte(blocks)).toBe(1)
  })
})

/*
 * Punktebereich (Wunsch der Lehrkraft, 23.09.2026).
 *
 * Bewusst eine SPANNE und keine feste Zahl: Eine feste Vorgabe zwingt dazu, Punkte auf
 * Aufgaben zu verteilen, die den Aufwand nicht abbilden. Belegt ist die Spanne nicht –
 * keine der geprüften Länderverordnungen schreibt eine Punktzahl für kurze
 * Leistungsnachweise vor. Sie ist ein Wunsch, kein Sollwert.
 */
describe('Punktebereich', () => {
  const task = (points: number) =>
    ({
      id: `t${points}`,
      type: 'task',
      instruction: '**Berechne.**',
      operator: 'berechnen',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      minutes: 4,
      points,
      solution: '',
      answer: { kind: 'none' },
      parts: []
    }) as never

  it('lässt eine Summe in der Spanne unangetastet', () => {
    // Die Bepunktung der KI ist näher am Aufwand als jede Rechnung
    const blocks = [task(4), task(6)]
    verteilePunkte(blocks, { min: 8, max: 12 })
    expect(gesamtpunkte(blocks)).toBe(10)
  })

  it('skaliert nach oben und erhält die Gewichtung', () => {
    const blocks = [task(1), task(2), task(1)]
    verteilePunkte(blocks, { min: 12, max: 16 })
    expect(gesamtpunkte(blocks)).toBe(12)
    // Die mittlere Aufgabe bleibt doppelt so schwer wie die anderen
    const punkte = blocks.map((b) => (b as { points: number }).points)
    expect(punkte[1]).toBeGreaterThan(punkte[0])
  })

  it('skaliert nach unten', () => {
    const blocks = [task(20), task(20)]
    verteilePunkte(blocks, { min: 8, max: 12 })
    expect(gesamtpunkte(blocks)).toBe(12)
  })

  it('gibt jeder Aufgabe mindestens einen Punkt', () => {
    const blocks = [task(10), task(1), task(1)]
    verteilePunkte(blocks, { min: 3, max: 4 })
    for (const b of blocks) expect((b as { points: number }).points).toBeGreaterThanOrEqual(1)
  })

  it('meldet eine Summe außerhalb der Spanne', () => {
    const w = pruefeBewertung([task(30)], { punkteAufBlatt: true, schluessel: 'keiner', bereich: { min: 8, max: 12 } })
    expect(w[0].message).toMatch(/30 Punkte, gewünscht waren 8 bis 12/)
  })

  it('meldet eine verdrehte Spanne', () => {
    const w = pruefeBewertung([task(10)], { punkteAufBlatt: true, schluessel: 'keiner', bereich: { min: 20, max: 5 } })
    expect(w[0].message).toMatch(/verdreht/)
  })

  it('schweigt ohne Spanne', () => {
    expect(imBereich(99, undefined)).toBe(true)
    expect(pruefeBewertung([task(30)], STANDARD_BEWERTUNG)).toEqual([])
  })
})
