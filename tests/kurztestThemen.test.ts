import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { SUBJECTS } from '../src/renderer/src/modules/arbeitsblatt/model/subjects'
import {
  THEMENBLOECKE,
  themenFuer,
  themenHinweis,
  themenQuellen,
  zweigeFuer,
  themenAusZeile,
  TRENNER,
  themenZeile,
  type Themenblock
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/themen'

/*
 * Entscheidung der Lehrkraft (23.09.2026): Bei Doppeljahrgängen werden die Themen für BEIDE
 * Jahrgänge vorgeschlagen.
 *
 * Die meisten Länder führen ihre Lehrpläne in Doppeljahrgängen (5/6, 7/8, 9/10) und
 * überlassen die Reihenfolge der Schule. Die Themen künstlich auf 5 und 6 aufzuteilen wäre
 * eine Erfindung; sie nur in Klasse 5 zu zeigen wäre schlicht falsch. Nordrhein-Westfalen
 * geht noch weiter und nennt nur „bis zum Ende der Sekundarstufe I" – ein Band über vier
 * Jahrgänge.
 */
const block = (patch: Partial<Themenblock> = {}): Themenblock => ({
  stateId: 'NI',
  fach: 'mathematik',
  jahrgaenge: [5, 6],
  zuordnung: 'doppeljahrgang',
  themen: ['Brüche', 'Flächeninhalt'],
  quelle: 'Kerncurriculum Mathematik, Gymnasium 5–10',
  url: 'https://example.invalid/kc',
  stand: '2024',
  amtlich: true,
  ...patch
})

/** Setzt die Liste für einen Test und räumt danach auf. */
const mitBloecken = <T>(bloecke: Themenblock[], fn: () => T): T => {
  const vorher = [...THEMENBLOECKE]
  THEMENBLOECKE.length = 0
  THEMENBLOECKE.push(...bloecke)
  try {
    return fn()
  } finally {
    THEMENBLOECKE.length = 0
    THEMENBLOECKE.push(...vorher)
  }
}

describe('Doppeljahrgänge gelten für beide Jahre', () => {
  it('schlägt dieselben Themen in Klasse 5 und 6 vor', () => {
    mitBloecken([block()], () => {
      for (const grade of [5, 6]) {
        expect(
          themenFuer('NI', 'mathematik', grade).map((v) => v.thema),
          `Klasse ${grade}`
        ).toEqual(['Brüche', 'Flächeninhalt'])
      }
      expect(themenFuer('NI', 'mathematik', 7)).toEqual([])
    })
  })

  it('kennzeichnet sie als nicht auf ein Jahr festgelegt', () => {
    mitBloecken([block()], () => {
      expect(themenFuer('NI', 'mathematik', 5).every((v) => v.ausDoppeljahrgang)).toBe(true)
      expect(themenHinweis('NI', 'mathematik', 5)).toMatch(/gelten für beide Jahre/)
      expect(themenHinweis('NI', 'mathematik', 5)).toMatch(/Doppeljahrgang 5\/6/)
    })
  })

  it('sagt bei einem einzelnen Jahrgang nichts von Doppeljahrgang', () => {
    mitBloecken([block({ jahrgaenge: [9], zuordnung: 'jahrgang' })], () => {
      expect(themenHinweis('NI', 'mathematik', 9)).not.toMatch(/beide Jahre/)
      expect(themenHinweis('NI', 'mathematik', 9)).toMatch(/Vorschläge aus/)
      expect(themenFuer('NI', 'mathematik', 9).every((v) => v.ausDoppeljahrgang)).toBe(false)
    })
  })

  it('nennt bei einem Band über vier Jahrgänge genau das', () => {
    /*
     * Nordrhein-Westfalen ordnet die Inhaltsfelder nur „bis zum Ende der Sekundarstufe I" zu.
     * „Doppeljahrgang" zu schreiben wäre hier schon zu konkret.
     */
    mitBloecken([block({ stateId: 'NW', jahrgaenge: [7, 8, 9, 10], zuordnung: 'band' })], () => {
      expect(themenFuer('NW', 'mathematik', 9).map((v) => v.thema)).toEqual(['Brüche', 'Flächeninhalt'])
      const hinweis = themenHinweis('NW', 'mathematik', 9)
      expect(hinweis).toMatch(/keinem einzelnen Jahrgang/)
      expect(hinweis).toMatch(/Abschnitt 7–10/)
      expect(hinweis).not.toMatch(/Doppeljahrgang/)
    })
  })
})

describe('Kein Vorschlag ohne Beleg', () => {
  it('schlägt nichts vor, wo nichts erhoben ist', () => {
    // Ohne Daten bleibt das Themenfeld ein freies Eingabefeld – ohne irreführende Liste
    expect(themenFuer('XX', 'mathematik', 8)).toEqual([])
    expect(themenHinweis('XX', 'mathematik', 8)).toBe('')
  })

  it('zeigt Themen eines Landes NICHT in einem anderen', () => {
    /*
     * Die Lehrpläne setzen dieselben Inhalte in unterschiedlichen Jahrgängen an. Ein
     * Vorschlag aus dem falschen Land sähe aus wie eine Landesvorgabe.
     */
    mitBloecken([block({ stateId: 'NI' })], () => {
      expect(themenFuer('BY', 'mathematik', 5)).toEqual([])
    })
  })

  it('achtet auf die Schulform, wo der Block eine nennt', () => {
    mitBloecken([block({ schulformen: ['hauptschule'] })], () => {
      expect(themenFuer('NI', 'mathematik', 5, 'hauptschule')).toHaveLength(2)
      expect(themenFuer('NI', 'mathematik', 5, 'gymnasium')).toEqual([])
    })
  })

  it('trägt zu jedem Block eine Fundstelle', () => {
    expect(THEMENBLOECKE.length).toBeGreaterThan(0)
    for (const b of THEMENBLOECKE) {
      expect(b.quelle, `${b.stateId}/${b.fach}`).not.toBe('')
      expect(b.url, `${b.stateId}/${b.fach}`).toMatch(/^https?:\/\//)
      expect(b.themen.length, `${b.stateId}/${b.fach}`).toBeGreaterThan(0)
      expect(b.jahrgaenge.length, `${b.stateId}/${b.fach}`).toBeGreaterThan(0)
    }
  })

  it('nennt die Fundstelle im Hinweis', () => {
    mitBloecken([block()], () => {
      expect(themenHinweis('NI', 'mathematik', 5)).toMatch(/Kerncurriculum Mathematik/)
      expect(themenQuellen('NI', 'mathematik', 5)).toHaveLength(1)
    })
  })

  it('sagt dazu, wenn der Lehrplan die Themen nur als Beispiel führt', () => {
    /*
     * In Niedersachsen gibt es für Chemie und Biologie am Gymnasium keine verbindlichen
     * Themen, nur eine Beispielliste im Anhang. Sie ist brauchbar – ohne sie stünde dort
     * gar nichts –, darf aber nicht wie eine Vorgabe aussehen.
     */
    mitBloecken([block({ hinweis: 'Der Lehrplan führt diese Themen als Beispiel, nicht als Vorgabe.' })], () => {
      expect(themenHinweis('NI', 'mathematik', 5)).toMatch(/als Beispiel, nicht als Vorgabe/)
    })
  })
})

describe('Zweige innerhalb einer Schulform', () => {
  /*
   * Mehrere Länder teilen dieselbe Schulform in Zweige mit UNTERSCHIEDLICHEN Themen:
   * Sachsen die Oberschule ab Klasse 7 in Haupt- und Realschulbildungsgang, Bayern die
   * Realschule in Wahlpflichtfächergruppen. Beide Listen vermischt anzubieten hieße, einer
   * Lehrkraft Themen vorzuschlagen, die ihr Zweig gar nicht hat.
   */
  const zweigBloecke = [
    block({
      stateId: 'SN',
      jahrgaenge: [7],
      zuordnung: 'jahrgang',
      schulformen: ['oberschule'],
      zweig: 'Hauptschulbildungsgang',
      themen: ['Anteile und Prozente']
    }),
    block({
      stateId: 'SN',
      jahrgaenge: [7],
      zuordnung: 'jahrgang',
      schulformen: ['oberschule'],
      zweig: 'Realschulbildungsgang',
      themen: ['Prozent- und Zinsrechnung']
    }),
    block({ stateId: 'SN', jahrgaenge: [6], zuordnung: 'jahrgang', schulformen: ['oberschule'], themen: ['Gebrochene Zahlen'] })
  ]

  it('nennt die Zweige, zwischen denen es etwas zu wählen gibt', () => {
    mitBloecken(zweigBloecke, () => {
      expect(zweigeFuer('SN', 'mathematik', 7, 'oberschule')).toEqual(['Hauptschulbildungsgang', 'Realschulbildungsgang'])
      // Klasse 6 ist noch gemeinsam – dort darf die Oberfläche gar keine Auswahl anbieten
      expect(zweigeFuer('SN', 'mathematik', 6, 'oberschule')).toEqual([])
    })
  })

  it('zeigt ohne Auswahl alle Zweige und sagt das auch', () => {
    mitBloecken(zweigBloecke, () => {
      expect(themenFuer('SN', 'mathematik', 7, 'oberschule').map((v) => v.thema)).toEqual(['Anteile und Prozente', 'Prozent- und Zinsrechnung'])
      expect(themenHinweis('SN', 'mathematik', 7, 'oberschule')).toMatch(/trennt hier nach Zweig/)
    })
  })

  it('zeigt mit Auswahl nur den gewählten Zweig', () => {
    mitBloecken(zweigBloecke, () => {
      expect(themenFuer('SN', 'mathematik', 7, 'oberschule', 'Realschulbildungsgang').map((v) => v.thema)).toEqual(['Prozent- und Zinsrechnung'])
      expect(themenHinweis('SN', 'mathematik', 7, 'oberschule', 'Realschulbildungsgang')).not.toMatch(/trennt hier nach Zweig/)
    })
  })

  it('behält gemeinsame Themen, auch wenn ein Zweig gewählt ist', () => {
    /*
     * In Bayern hat die Realschule bis Klasse 6 einen gemeinsamen Lehrplan und erst ab 7
     * getrennte Gruppen. Wer Gruppe I gewählt hat, muss in Klasse 6 trotzdem etwas sehen.
     */
    mitBloecken(zweigBloecke, () => {
      expect(themenFuer('SN', 'mathematik', 6, 'oberschule', 'Realschulbildungsgang').map((v) => v.thema)).toEqual(['Gebrochene Zahlen'])
    })
  })

  it('trennt in den echten Daten Sachsen und Bayern korrekt', () => {
    // Sachsen, Oberschule, Mathematik 7 – die beiden Bildungsgänge haben andere Themen
    const hs = themenFuer('SN', 'mathematik', 7, 'oberschule', 'Hauptschulbildungsgang').map((v) => v.thema)
    const rs = themenFuer('SN', 'mathematik', 7, 'oberschule', 'Realschulbildungsgang').map((v) => v.thema)
    expect(hs).toContain('Zusammengesetzte Flächen und Körper')
    expect(rs).toContain('Prozent- und Zinsrechnung')
    expect(rs).not.toContain('Zusammengesetzte Flächen und Körper')

    // Bayern, Realschule, Mathematik 7 – nur Gruppe I hat „Dreiecke" und „Raumgeometrie"
    const eins = themenFuer('BY', 'mathematik', 7, 'realschule', 'Wahlpflichtfächergruppe I').map((v) => v.thema)
    const zwei = themenFuer('BY', 'mathematik', 7, 'realschule', 'Wahlpflichtfächergruppe II/III').map((v) => v.thema)
    expect(eins).toContain('Dreiecke')
    expect(zwei).not.toContain('Dreiecke')
    expect(zwei).toContain('Potenzen')
  })
})

describe('Die erhobenen Daten', () => {
  it('führt kein Thema, das nur eine Arbeitsweise benennt', () => {
    /*
     * Die Lehrpläne stellen jedem Fach einen Lernbereich über Arbeitsweisen voran. Eine
     * Lernzielkontrolle „über Erkenntnisse gewinnen" gibt es nicht – solche Überschriften
     * gehören nicht in die Vorschlagsliste.
     */
    const verboten = [/^Erkenntnisse gewinnen/, /^Profilbereich/, /^Sprechen und Zuhören$/, /^Kommunikative Kompetenzen$/, /^Wie Chemiker denken/]
    for (const b of THEMENBLOECKE) {
      for (const t of b.themen) {
        for (const v of verboten) expect(t, `${b.stateId}/${b.fach}`).not.toMatch(v)
      }
    }
  })

  it('ist von der Oberfläche aus überhaupt erreichbar', () => {
    /*
     * Ein Block mit einem Fach oder einer Schulform, die es in der App nicht gibt, fällt
     * niemandem auf: Er erscheint einfach nie. Bei den Operatorenprofilen ist genau das
     * passiert – ein Profil für „Werte und Normen" lag monatelang tot im Code, weil es das
     * Fach noch nicht gab. Deshalb wird hier jede Kennung gegen die echten Listen geprüft.
     */
    const tabelle = JSON.parse(readFileSync(resolve(__dirname, '../resources/cefr/levels.json'), 'utf8')) as {
      states: { id: string; schoolTypes: { id: string }[] }[]
    }
    const faecher = new Set(SUBJECTS.map((s) => s.id))
    for (const b of THEMENBLOECKE) {
      expect(faecher, `Fach ${b.fach}`).toContain(b.fach)
      const land = tabelle.states.find((s) => s.id === b.stateId)
      expect(land, `Bundesland ${b.stateId}`).toBeDefined()
      for (const sf of b.schulformen ?? []) {
        expect(
          land!.schoolTypes.map((t) => t.id),
          `${b.stateId} kennt die Schulform ${sf} nicht – der Block wäre unerreichbar`
        ).toContain(sf)
      }
    }
  })

  it('bringt für Bayern jahrgangsscharfe Themen mit', () => {
    const m9 = themenFuer('BY', 'mathematik', 9, 'gymnasium')
    expect(m9.map((v) => v.thema)).toContain('Satz des Pythagoras')
    expect(m9.every((v) => v.zuordnung === 'jahrgang')).toBe(true)
    // In Bayern beginnt Geschichte erst in Jahrgang 6
    expect(themenFuer('BY', 'geschichte', 5, 'gymnasium')).toEqual([])
    expect(themenFuer('BY', 'geschichte', 6, 'gymnasium').length).toBeGreaterThan(0)
  })

  it('bringt Berlin und Brandenburg dieselben Themenfelder in beiden Jahren', () => {
    for (const land of ['BE', 'BB']) {
      const acht = themenFuer(land, 'chemie', 8).map((v) => v.thema)
      expect(acht, land).toEqual(themenFuer(land, 'chemie', 7).map((v) => v.thema))
      expect(acht, land).toContain('Wasser – eine Verbindung')
    }
  })

  it('führt Nordrhein-Westfalen als Band über die ganze Sekundarstufe I', () => {
    for (const grade of [7, 8, 9, 10]) {
      expect(
        themenFuer('NW', 'biologie', grade, 'gymnasium').some((v) => v.thema === 'Genetik'),
        `Klasse ${grade}`
      ).toBe(true)
    }
    expect(themenHinweis('NW', 'biologie', 9, 'gymnasium')).toMatch(/Abschnitt 7–10/)
  })

  it('lässt weg, wo der Lehrplan keine Themen nennt', () => {
    // Bayern Deutsch: in allen Jahrgängen dasselbe Verzeichnis, keine Themenüberschriften
    expect(themenFuer('BY', 'deutsch', 7, 'gymnasium')).toEqual([])
    // Nordrhein-Westfalen Englisch: der Kernlehrplan kennt keine Inhaltsfelder
    expect(themenFuer('NW', 'englisch', 8, 'gymnasium')).toEqual([])
  })
})

describe('Mehrere Themen in einer Zeile', () => {
  it('fügt sie zusammen, wie man sie aufs Blatt schriebe', () => {
    expect(themenZeile(['Brüche', 'Flächeninhalt'])).toBe('Brüche · Flächeninhalt')
  })

  it('lässt Leeres weg', () => {
    expect(themenZeile(['Brüche', '', '   '])).toBe('Brüche')
  })

  it('überlebt ein Thema, das selbst ein Komma oder Semikolon enthält', () => {
    /*
     * „Prozentrechnung, Daten und Diagramme" ist EIN Lernbereich des bayerischen
     * Lehrplans – 63 der erhobenen Themen tragen ein Komma im Namen, eines sogar ein
     * Semikolon. Mit einem dieser Zeichen als Trenner zerfiel so ein Thema beim
     * Wiederöffnen in zwei, und es sah aus, als hätte die Lehrkraft zwei Themen gewählt.
     */
    const gewaehlt = ['Prozentrechnung, Daten und Diagramme', 'Werkzeuge als Kraftwandler; Arbeit, Energie']
    expect(themenAusZeile(themenZeile(gewaehlt))).toEqual(gewaehlt)
  })

  it('macht aus einem alten, von Hand getippten Thema ein einziges', () => {
    expect(themenAusZeile('Potenzgesetze, Wurzeln')).toEqual(['Potenzgesetze, Wurzeln'])
  })

  it('kommt mit einem leeren Feld zurecht', () => {
    expect(themenAusZeile('')).toEqual([])
    expect(themenAusZeile('  ·  ')).toEqual([])
  })

  it('führt kein erhobenes Thema, das den Trenner selbst enthält', () => {
    // Bricht, sobald ein nachgetragenes Bundesland ein Thema mit „·" im Namen mitbringt
    for (const b of THEMENBLOECKE) {
      for (const t of b.themen) expect(t, `${b.stateId}/${b.fach}`).not.toContain(TRENNER.trim())
    }
  })
})
