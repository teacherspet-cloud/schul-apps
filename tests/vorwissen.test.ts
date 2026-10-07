import { describe, expect, it } from 'vitest'
import {
  alsZeile,
  grammatikNiveau,
  stoffVorschlaege,
  teileVorwissen,
  vorwissenRegeln,
  vorwissenVorschlaege,
  zeileEinfuegen,
  type VorwissenAnfrage,
  type VorwissenArt
} from '../src/renderer/src/modules/arbeitsblatt/didactics/vorwissen/vorwissen'
import { KNOTEN } from '../src/renderer/src/modules/arbeitsblatt/didactics/vorwissen/ketten'
import { kiVorwissen, KI_QUELLE } from '../src/renderer/src/modules/arbeitsblatt/didactics/vorwissen/ki'
import { taskContext } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'

/*
 * Wunsch der Lehrkraft (25.09.2026): Vorschläge zum Vorwissen, „die dynamisch auf Fach, Thema,
 * Jahrgang, Lernziel usw. reagieren“. Entscheidungen: Chips, Herkunft sichtbar, Reihenfolge statt
 * Jahrgang, Fachbeginn und Integrationsfächer beachten, „noch nicht behandelt“ als eigene Gruppe.
 */
const anfrage = (patch: Partial<VorwissenAnfrage> = {}): VorwissenAnfrage => ({
  subjectId: 'mathematik',
  topic: 'Prozentrechnung',
  grade: 7,
  stateId: 'BY',
  schoolTypeId: 'gymnasium',
  ...patch
})
const von = (a: VorwissenAnfrage, art: VorwissenArt) => vorwissenVorschlaege(a).vorschlaege.filter((v) => v.art === art)

describe('Datenbasis', () => {
  it('verweist nur auf Knoten, die es gibt', () => {
    const ids = new Set(KNOTEN.map((k) => k.id))
    for (const k of KNOTEN) for (const n of k.nach ?? []) expect(ids.has(n), `${k.id} → ${n}`).toBe(true)
    expect(ids.size).toBe(KNOTEN.length)
  })
})

describe('Voraussetzungen aus den Ketten', () => {
  it('schlägt zur Prozentrechnung die Bruchrechnung vor – belegt, wo der Jahrgang nachgelesen ist', () => {
    const fach = von(anfrage(), 'fach')
    const brueche = fach.find((v) => v.text.startsWith('Bruchrechnung'))
    expect(brueche).toBeDefined()
    expect(brueche!.sicher).toBe(true)
    expect(brueche!.quelle).toMatch(/LehrplanPLUS Bayern, Kl\. 6/)
  })

  it('schiebt Voraussetzungen, die im Land noch nicht dran waren, nach „noch nicht behandelt“', () => {
    const fuenf = anfrage({ grade: 5 })
    expect(von(fuenf, 'fach').some((v) => v.text.startsWith('Bruchrechnung'))).toBe(false)
    expect(von(fuenf, 'nochNicht').some((v) => v.text.startsWith('Bruchrechnung'))).toBe(true)
  })

  it('nennt ohne nachgelesenen Jahrgang die Reihenfolge und bittet um Prüfung', () => {
    const hessen = von(anfrage({ stateId: 'SN' }), 'fach').find((v) => v.text.startsWith('Bruchrechnung'))
    expect(hessen?.sicher).toBe(false)
    expect(hessen?.quelle).toMatch(/fachliche Reihenfolge.*bitte prüfen/)
  })

  it('gilt an anderen Schulformen nicht als sicher', () => {
    const real = von(anfrage({ schoolTypeId: 'realschule' }), 'fach').find((v) => v.text.startsWith('Bruchrechnung'))
    expect(real?.sicher).toBe(false)
    expect(real?.quelle).toMatch(/an dieser Schulform ggf\. später/)
  })

  it('bringt die Fehlvorstellungen des Themas und die Fachbegriffe der Voraussetzungen', () => {
    expect(von(anfrage(), 'fehlvorstellung').some((v) => v.text.includes('+20 %'))).toBe(true)
    expect(von(anfrage(), 'begriff').some((v) => v.text.includes('Hauptnenner'))).toBe(true)
  })

  it('nennt, was auf dem Thema aufbaut, als „noch nicht behandelt“', () => {
    expect(von(anfrage(), 'nochNicht').some((v) => v.text.startsWith('Exponentielles Wachstum'))).toBe(true)
  })

  it('reagiert auf Lernziele, auch wenn das Thema nichts trifft', () => {
    const a = anfrage({ subjectId: 'erdkunde', topic: 'Afrika', grade: 8, learningGoals: 'Klimadiagramme von Wüste und Regenwald vergleichen' })
    const r = vorwissenVorschlaege(a)
    expect(r.treffer.length).toBeGreaterThan(0)
    expect(r.vorschlaege.some((v) => v.art === 'fehlvorstellung' && v.text.includes('Wüste'))).toBe(true)
  })

  it('sagt ehrlich, wenn es zum Thema keine Kette gibt', () => {
    expect(vorwissenVorschlaege(anfrage({ topic: 'Knobelaufgaben zum Schuljahresende' })).hinweise.join(' ')).toMatch(/keine Voraussetzungskette/)
  })

  it('schlägt zum Stromkreis die Vorstellung vom verbrauchten Strom vor', () => {
    const a = anfrage({ subjectId: 'physik', topic: 'Reihen- und Parallelschaltung', stateId: 'NW', grade: 6 })
    expect(von(a, 'fehlvorstellung').some((v) => v.text.includes('verbraucht'))).toBe(true)
  })
})

describe('Fachbeginn und Integrationsfächer', () => {
  it('warnt, wenn Politik noch gar nicht begonnen hat, und verzichtet auf Politik-Voraussetzungen', () => {
    const a = anfrage({ subjectId: 'politik', topic: 'Der Bundestag und die Gesetzgebung', grade: 8 })
    const r = vorwissenVorschlaege(a)
    expect(r.hinweise.join(' ')).toMatch(/Sozialkunde beginnt in Bayern .* erst in Klasse 10/)
    const fach = r.vorschlaege.filter((v) => v.art === 'fach')
    expect(fach.some((v) => v.text.startsWith('Gewaltenteilung'))).toBe(false)
    expect(fach.some((v) => v.text.startsWith('Vorwissen aus'))).toBe(true)
    // Ab Klasse 10 ist das Fach da, die Voraussetzungen kommen wieder
    expect(von({ ...a, grade: 10 }, 'fach').some((v) => v.text.startsWith('Gewaltenteilung'))).toBe(true)
  })

  it('kennt Gesellschaftswissenschaften 5/6 in Berlin – ohne doppelten Fachbeginn-Hinweis', () => {
    const r = vorwissenVorschlaege(anfrage({ subjectId: 'geschichte', topic: 'Das Römische Reich', grade: 6, stateId: 'BE', schoolTypeId: 'grundschule' }))
    expect(r.hinweise.some((h) => h.includes('Gesellschaftswissenschaften 5/6'))).toBe(true)
    expect(r.hinweise.some((h) => h.includes('beginnt'))).toBe(false)
  })

  it('kennt Gesellschaftslehre an der Gesamtschule in NRW und mischt die Teilfächer', () => {
    const r = vorwissenVorschlaege(anfrage({ subjectId: 'erdkunde', topic: 'Leben in der Wüste', grade: 7, stateId: 'NW', schoolTypeId: 'gesamtschule' }))
    expect(r.hinweise.some((h) => h.includes('Gesellschaftslehre'))).toBe(true)
  })

  it('weist in Berlin auf Informatik ohne Pflichtfach hin', () => {
    expect(vorwissenVorschlaege(anfrage({ subjectId: 'informatik', topic: 'Schleifen', stateId: 'BE' })).hinweise.join(' ')).toMatch(/kein Pflichtfach/)
  })
})

describe('Sprachen und Deutsch', () => {
  it('Englisch: Grammatik der Vorjahre bekannt, die nächsten Themen noch nicht', () => {
    const a = anfrage({ subjectId: 'englisch', topic: 'My dream holiday', grade: 7, stateId: 'NI', languageOrder: 1 })
    expect(von(a, 'fach').some((v) => v.text.startsWith('Grammatik:'))).toBe(true)
    expect(von(a, 'nochNicht').some((v) => v.text.startsWith('Grammatik:'))).toBe(true)
    expect(von(a, 'fach').some((v) => v.text.includes('Großbritannien'))).toBe(true)
  })

  it('nennt das gewählte Lehrwerk als belegte Quelle', () => {
    const a = anfrage({ subjectId: 'englisch', topic: 'School life', grade: 6, languageOrder: 1, lehrwerk: 'Green Line 1 bis Green Line 2, bis Unit 3' })
    const lw = von(a, 'fach').find((v) => v.quelle === 'gewähltes Lehrwerk')
    expect(lw?.text).toMatch(/Green Line 2, bis Unit 3/)
    expect(lw?.sicher).toBe(true)
  })

  it('2. Fremdsprache: überträgt Methoden aus Englisch', () => {
    const a = anfrage({ subjectId: 'franzoesisch', topic: 'La famille', grade: 8, languageOrder: 2 })
    expect(von(a, 'methode').some((v) => v.text.startsWith('Aus Englisch bekannt'))).toBe(true)
    // In Englisch selbst natürlich nicht
    expect(von({ ...a, subjectId: 'englisch', languageOrder: 1 }, 'methode').some((v) => v.text.startsWith('Aus Englisch'))).toBe(false)
  })

  it('Deutsch ab Klasse 5: der KMK-Übergangsbestand gilt als sicher', () => {
    const begriffe = von(anfrage({ subjectId: 'deutsch', topic: 'Satzglieder bestimmen', grade: 5, stateId: 'NI' }), 'begriff')
    const kmk = begriffe.find((v) => v.text.includes('Subjekt, Prädikat'))
    expect(kmk?.sicher).toBe(true)
    expect(kmk?.quelle).toMatch(/KMK-Bildungsstandards Deutsch Primarbereich/)
  })
})

describe('Zeilen im Feld und Wirkung im Prompt', () => {
  it('setzt Vorsilben und fügt nicht doppelt ein', () => {
    const zeile = alsZeile({ art: 'fehlvorstellung', text: 'Strom wird verbraucht.' })
    expect(zeile).toBe('Fehlvorstellung: Strom wird verbraucht.')
    const feld = zeileEinfuegen('Bruchrechnung', zeile)
    expect(zeileEinfuegen(feld, zeile)).toBe(feld)
    expect(feld.split('\n')).toHaveLength(2)
  })

  it('trennt das Feld nach Wirkung', () => {
    const t = teileVorwissen('Bruchrechnung\nFehlvorstellung: +20 % und −20 % heben sich auf\nNoch nicht behandelt: Zinseszins')
    expect(t).toEqual({ vorwissen: ['Bruchrechnung'], fehlvorstellungen: ['+20 % und −20 % heben sich auf'], nochNicht: ['Zinseszins'] })
  })

  it('verlangt voraussetzen, aktivieren, aufgreifen und nicht voraussetzen', () => {
    const regeln = vorwissenRegeln('Bruchrechnung\nFehlvorstellung: A\nNoch nicht behandelt: B')
    expect(regeln).toMatch(/Erkläre es NICHT neu/)
    expect(regeln).toMatch(/Einstieg knüpft ausdrücklich/)
    expect(regeln).toMatch(/Stelle sie NIE als richtig dar/)
    expect(regeln).toMatch(/NOCH NICHT BEHANDELT[\s\S]*- B/)
  })

  it('steht so im Auftrag des Arbeitsblatts – in einer Lernkontrolle nicht', () => {
    const meta = {
      ...defaultMeta('BY', 'gymnasium', 'Gymnasium'),
      subjectId: 'mathematik',
      subjectLabel: 'Mathematik',
      topic: 'Prozent',
      priorKnowledge: 'Bruchrechnung'
    }
    expect(taskContext(meta, profileFromMeta(meta))).toMatch(/VORWISSEN DER LERNGRUPPE/)
    const kontrolle = { ...meta, sheetType: 'lernkontrolle' as const }
    const text = taskContext(kontrolle, profileFromMeta(kontrolle))
    expect(text).toMatch(/Vorwissen der Lerngruppe: Bruchrechnung/)
    expect(text).not.toMatch(/Einstieg knüpft/)
  })
})

describe('Stoff für Klassenarbeit und Kurztest', () => {
  it('liefert typische Inhalte der Einheit statt Voraussetzungen', () => {
    const r = stoffVorschlaege(anfrage({ subjectId: 'geschichte', topic: 'Die Weimarer Republik', grade: 9, stateId: 'NW' }))
    expect(r.vorschlaege.every((v) => v.art === 'stoff')).toBe(true)
    expect(r.vorschlaege.some((v) => v.text.includes('Krisenjahr 1923'))).toBe(true)
  })
})

describe('KI-Ergänzung', () => {
  it('kennzeichnet jeden Vorschlag als KI und entfernt mitgeschickte Vorsilben', async () => {
    let gesendet = ''
    const ai = async <T>(req: { system: string; user: string }): Promise<T> => {
      gesendet = req.system + '\n' + req.user
      return {
        vorschlaege: [
          { art: 'fehlvorstellung', text: 'Fehlvorstellung: Prozent ist immer von 100' },
          { art: 'quatsch', text: 'x' }
        ]
      } as T
    }
    const a = anfrage({ learningGoals: 'Prozentwerte berechnen' })
    const liste = await kiVorwissen(a, vorwissenVorschlaege(a), ai)
    expect(liste).toEqual([{ art: 'fehlvorstellung', text: 'Prozent ist immer von 100', quelle: KI_QUELLE, sicher: false, ki: true }])
    // Lernziele und schon Vorgeschlagenes gehen mit, damit nichts doppelt kommt
    expect(gesendet).toMatch(/Prozentwerte berechnen/)
    expect(gesendet).toMatch(/Schon vorgeschlagen:[\s\S]*Bruchrechnung/)
    expect(gesendet).toMatch(/NIE etwas vor, das selbst ein Lernziel ist/)
  })
})

describe('Lehrwerk-Themen je Unit', () => {
  const englisch = (unit: string, patch: Partial<VorwissenAnfrage> = {}) =>
    anfrage({
      subjectId: 'englisch',
      topic: 'Sports',
      grade: 6,
      stateId: 'NI',
      languageOrder: 1,
      lehrwerkStand: { buch: 'Green Line 2', unit, fruehereBaende: ['Green Line 1'] },
      ...patch
    })

  it('nennt Themen und Grammatik der Units VOR der gewählten – belegt', () => {
    const fach = von(englisch('Unit 4'), 'fach')
    const unit2 = fach.find((v) => v.text.startsWith('Aus Unit 2'))
    expect(unit2?.text).toMatch(/London: Wow!.*London/)
    expect(unit2?.sicher).toBe(true)
    expect(unit2?.quelle).toMatch(/Green Line 2, Unit 2 – Klett/)
    expect(fach.some((v) => v.text === 'Grammatik aus Unit 3: present perfect: Aussagen, present perfect: Fragen, Vergleich: present perfect und simple past, Zusammensetzungen mit some und any')).toBe(true)
    // Die gewählte Unit selbst ist kein Vorwissen
    expect(fach.some((v) => v.text.startsWith('Aus Unit 4'))).toBe(false)
  })

  it('fasst frühere Bände zusammen', () => {
    expect(von(englisch('Unit 1'), 'fach').some((v) => v.text.startsWith('Aus Green Line 1: A new school'))).toBe(true)
  })

  it('nennt die nächsten Units als noch nicht behandelt', () => {
    const noch = von(englisch('Unit 4'), 'nochNicht')
    expect(noch.some((v) => v.text.startsWith('Unit 5: „Scotland, here we come!“'))).toBe(true)
  })

  it('liefert in der Klassenarbeit Thema und Grammatik der gewählten Unit als Stoff', () => {
    const r = stoffVorschlaege(englisch('Unit 2'))
    expect(r.vorschlaege.map((v) => v.text)).toEqual(
      expect.arrayContaining([
        'Unit 2: „London: Wow!“ (London; Sehenswürdigkeiten, Tube, Wegbeschreibung)',
        'Grammatik: going to-future: Aussagen, Fragen, Steigerung von Adjektiven'
      ])
    )
  })

  it('schweigt bei einem Band, dessen Units nicht hinterlegt sind', () => {
    const fremd = anfrage({ subjectId: 'englisch', grade: 6, lehrwerkStand: { buch: 'Access 2', unit: 'Unit 3' }, lehrwerk: 'Access 2, bis Unit 3' })
    const fach = von(fremd, 'fach')
    expect(fach.some((v) => v.text.startsWith('Aus Unit'))).toBe(false)
    expect(fach.some((v) => v.text === 'Wortschatz und Themen aus Access 2, bis Unit 3')).toBe(true)
  })
})

describe('Ausbau: Niedersachsen, Hessen, Religion/Ethik, neue Themen', () => {
  it('Niedersachsen: Doppeljahrgang aus dem Kerncurriculum, belegt', () => {
    const b = von(anfrage({ stateId: 'NI' }), 'fach').find((v) => v.text.startsWith('Bruchrechnung'))
    expect(b?.quelle).toMatch(/Kerncurriculum Niedersachsen, Kl\. 5–6/)
    expect(b?.sicher).toBe(true)
  })

  it('Hessen: nur Richtwert, nie sicher', () => {
    const b = von(anfrage({ stateId: 'HE' }), 'fach').find((v) => v.text.startsWith('Bruchrechnung'))
    expect(b?.quelle).toMatch(/Lehrplan G9 Hessen, Kl\. 6 \(Richtwert/)
    expect(b?.sicher).toBe(false)
  })

  it('Hessen: Chemie beginnt am Gymnasium erst in Klasse 8', () => {
    expect(vorwissenVorschlaege(anfrage({ subjectId: 'chemie', topic: 'Stoffeigenschaften', grade: 7, stateId: 'HE' })).hinweise.join(' ')).toMatch(
      /Chemie beginnt in Hessen .* erst in Klasse 8/
    )
  })

  it('Religion: Gleichnisse mit Voraussetzung und belegter Fehlvorstellung', () => {
    const a = anfrage({ subjectId: 'religion', topic: 'Gleichnisse vom Reich Gottes', grade: 8, stateId: 'NW' })
    expect(von(a, 'fach').some((v) => v.text.startsWith('Jesus in seiner Zeit'))).toBe(true)
    expect(von(a, 'fehlvorstellung').some((v) => v.quelle.includes('Bucher'))).toBe(true)
    expect(vorwissenVorschlaege(a).hinweise.join(' ')).not.toMatch(/keine Voraussetzungskette/)
  })

  it('Werte und Normen findet die Ethik-Kette', () => {
    const a = anfrage({ subjectId: 'werte-und-normen', topic: 'Menschenwürde', grade: 8, stateId: 'NI' })
    expect(von(a, 'fach').some((v) => v.text.startsWith('Regeln für das Zusammenleben'))).toBe(true)
    expect(von(a, 'methode').some((v) => v.text.includes('Gedankenexperimenten'))).toBe(true)
  })

  it('Neue Themen: Kreis setzt Flächeninhalt voraus', () => {
    expect(von(anfrage({ topic: 'Der Kreis', grade: 9, stateId: 'NI' }), 'fach').some((v) => v.text.startsWith('Umfang und Flächeninhalt'))).toBe(true)
  })

  it('Gegenproben: kurze Stichwörter treffen keine fremden Themen', () => {
    const molekuel = vorwissenVorschlaege(anfrage({ subjectId: 'chemie', topic: 'Moleküle und Elektronenpaarbindung', grade: 9 }))
    expect(molekuel.treffer).not.toContain('Stoffmenge und Mol')
    const einfluss = vorwissenVorschlaege(anfrage({ subjectId: 'biologie', topic: 'Einfluss des Menschen auf den Wald', grade: 8 }))
    expect(einfluss.treffer).not.toContain('Ökosystem Gewässer')
    const aktiv = vorwissenVorschlaege(anfrage({ subjectId: 'deutsch', topic: 'Aktiv und Passiv', grade: 6 }))
    expect(aktiv.treffer).not.toContain('Drama: Aufbau, Figurenrede, geschlossene Form')
    const rede = vorwissenVorschlaege(anfrage({ subjectId: 'deutsch', topic: 'Indirekte Rede', grade: 8 }))
    expect(rede.treffer).not.toContain('Rhetorische Mittel und ihre Wirkung')
  })
})

describe('GER-Kennzeichen an den Stoff-Vorschlägen (Paket 12, Klassenarbeit)', () => {
  it('Grammatikthemen tragen das Niveau aus der Grammatiktabelle', () => {
    const r = stoffVorschlaege(anfrage({ subjectId: 'englisch', topic: 'Going abroad', grade: 7, stateId: 'NI' }))
    const grammatik = r.vorschlaege.filter((v) => v.text.startsWith('Grammatik:'))
    expect(grammatik.length).toBeGreaterThan(0)
    for (const g of grammatik) expect(g.niveau).toMatch(/^(A1|A2|B1|B2|C1)/)
  })

  it('findet das Niveau zu einer Lehrwerks-Grammatik, sonst bleibt es offen', () => {
    expect(grammatikNiveau('englisch', 'Grammatik: present perfect')).toMatch(/^(A1|A2|B1)/)
    expect(grammatikNiveau('englisch', 'Grammatik: etwas völlig Unbekanntes')).toBeUndefined()
    // Geschichte kennt kein GER-Niveau
    const g = stoffVorschlaege(anfrage({ subjectId: 'geschichte', topic: 'Die Weimarer Republik', grade: 9, stateId: 'NW' }))
    expect(g.vorschlaege.every((v) => !v.niveau)).toBe(true)
  })
})
