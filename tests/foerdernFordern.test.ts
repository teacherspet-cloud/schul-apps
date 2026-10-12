import { describe, expect, it } from 'vitest'
import { alleBestaetigt, befundVon, gruppenVorschlagen, istForder, kindVerschieben, zielSatz, type KindDaten } from '../src/shared/foerderGruppen'
import {
  bandVon,
  bedarfName,
  foerderBaustein,
  foerderbedarfeFuer,
  neutralerTitel,
  niveausFuer,
  niveauVorwahl,
  regelnFuer,
  wettbewerbeFuer,
  type FoerderBlattWahl
} from '../src/renderer/src/modules/arbeitsblatt/didactics/foerdernFordern'

/*
 * Förder- und Fordermaterial (12.10.2026, Entscheidungen der Lehrkraft): Gruppen nach Bedarf nur VORSCHLAGEN (jede
 * einzeln bestätigen), Prompt-Baustein je Fach/Jahrgang/Land aus der didaktischen Datei.
 */

const kind = (id: string, p: Partial<KindDaten> = {}): KindDaten => ({ id, name: `Kind ${id}`, benutzer: `k.${id}`, ...p })
const schwachIn = (titel: string, quote = 0.3): KindDaten['grammatik'] => [{ titel, ampel: 'schwaeche', quote }]
const sicher = (): Partial<KindDaten> => ({
  vokabeln: { sicher: 90, gesamt: 100 },
  grammatik: [{ titel: 'simple past', ampel: 'sicher', quote: 0.95 }],
  tests: { schnitt: 1.5, prozent: 92, anzahl: 2 }
})

describe('Gruppen nach Bedarf (reine Funktion)', () => {
  it('bündelt gleiche Schwächen und legt sichere Kinder in eine Forder-Gruppe', () => {
    const g = gruppenVorschlagen([
      kind('a', { grammatik: schwachIn('simple past') }),
      kind('b', { grammatik: schwachIn('simple past', 0.4) }),
      kind('c', { wackelig: [1, 2, 3, 4].map((i) => ({ term: `w${i}`, translation: `t${i}` })) }),
      kind('d', sicher()),
      kind('e', sicher())
    ])
    expect(g.length).toBeGreaterThanOrEqual(2)
    expect(g.length).toBeLessThanOrEqual(4)
    const gram = g.find((x) => x.kinder.includes('a'))!
    expect(gram.kinder).toEqual(['a', 'b'])
    expect(gram.art).toBe('foerder')
    expect(gram.begruendung).toContain('simple past')
    expect(gram.ziel).toContain('simple past')
    const forder = g.find((x) => x.art === 'forder')!
    expect(forder.kinder).toEqual(['d', 'e'])
    expect(g.find((x) => x.kinder.includes('c'))!.schwerpunkt).toMatch(/Vokabeln/)
    // Neutrale Titel ohne Rangfolge
    expect(g.map((x) => x.titel)).toEqual(g.map((_, i) => `Gruppe ${'ABCD'[i]}`))
  })

  it('höchstens 4 Gruppen – kleine Schwerpunkte gehen in eine passende Gruppe', () => {
    const kinder = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'].map((t, i) => kind(`k${i}`, { grammatik: schwachIn(t) }))
    const g = gruppenVorschlagen(kinder)
    expect(g.length).toBeLessThanOrEqual(4)
    expect(g.flatMap((x) => x.kinder).sort()).toEqual(kinder.map((k) => k.id).sort())
  })

  it('teilt eine einzige Gruppe ab 4 Kindern nach dem Stand in zwei', () => {
    const kinder = [0.2, 0.3, 0.7, 0.75].map((q, i) => kind(`s${i}`, { grammatik: schwachIn('if-clauses', q), vokabeln: { sicher: q * 100, gesamt: 100 } }))
    const g = gruppenVorschlagen(kinder)
    expect(g).toHaveLength(2)
    expect(g[0].kinder.sort()).toEqual(['s0', 's1'])
    expect(g[1].kinder.sort()).toEqual(['s2', 's3'])
  })

  it('Bedarf von Hand wiegt am schwersten; „forder:" macht eine Forder-Gruppe', () => {
    const g = gruppenVorschlagen([kind('a', { vonHand: ['bildbeschreibung'], grammatik: schwachIn('x') }), kind('b', { vonHand: ['forder:'] })], {
      bedarfName: (id) => (id === 'bildbeschreibung' ? 'Bildbeschreibung ohne Ordnung' : id)
    })
    expect(g.find((x) => x.kinder.includes('a'))!.schwerpunkt).toBe('Bildbeschreibung ohne Ordnung')
    expect(g.find((x) => x.kinder.includes('a'))!.bedarfe).toEqual(['bildbeschreibung'])
    expect(g.find((x) => x.kinder.includes('b'))!.art).toBe('forder')
  })

  it('Nachteilsausgleich bei Rechtschreibung: Rechtschreibung ist kein Förderziel', () => {
    const b = befundVon(kind('a', { vonHand: ['rechtschreibung'], ohneRechtschreibung: true, nachteilsausgleich: true }))
    expect(b.schwerpunkte).toEqual([])
    expect(b.zeilen.join(' ')).toContain('Nachteilsausgleich')
    const g = gruppenVorschlagen([kind('a', { vonHand: ['rechtschreibung'], ohneRechtschreibung: true }), kind('b', { vonHand: ['rechtschreibung'] })])
    expect(g.find((x) => x.kinder.includes('b'))!.kinder).not.toContain('a')
  })

  it('ohne Lerndaten: kein Stand, Hinweis auf Bedarf von Hand, kein Forder', () => {
    const b = befundVon(kind('a'))
    expect(b.stand).toBeNull()
    expect(b.zeilen[0]).toMatch(/von Hand/)
    expect(istForder(b)).toBe(false)
  })

  it('verschieben und JEDE Gruppe einzeln bestätigen (kein Sammelklick)', () => {
    const g = [
      { schluessel: 'a', kinder: ['1', '2'], bestaetigt: true },
      { schluessel: 'b', kinder: ['3'], bestaetigt: false }
    ]
    const v = kindVerschieben(g, '2', 'b')
    expect(v.find((x) => x.schluessel === 'a')!.kinder).toEqual(['1'])
    expect(v.find((x) => x.schluessel === 'b')!.kinder).toEqual(['3', '2'])
    expect(kindVerschieben(g, '2', 'gibtsnicht')).toBe(g)
    expect(alleBestaetigt(g)).toBe(false)
    expect(alleBestaetigt(g.map((x) => ({ ...x, bestaetigt: true })))).toBe(true)
    // Leere Gruppen zählen nicht, aber ohne jede Gruppe gibt es nichts zu erstellen
    expect(
      alleBestaetigt([
        { kinder: [], bestaetigt: false },
        { kinder: ['1'], bestaetigt: true }
      ])
    ).toBe(true)
    expect(alleBestaetigt([])).toBe(false)
  })

  it('Ziel als ein positiver Satz', () => {
    expect(zielSatz('foerder', { schluessel: 'gram:x', text: 'Grammatik: present perfect' })).toBe(
      'Du kannst „present perfect" sicher erkennen und richtig anwenden.'
    )
    expect(zielSatz('forder', null)).toMatch(/^Du /)
  })
})

const wahl = (p: Partial<FoerderBlattWahl>): FoerderBlattWahl => ({
  fachId: 'englisch',
  jahrgang: 7,
  land: 'NI',
  schulform: 'gymnasium',
  art: 'foerder',
  ziel: 'Du kannst X.',
  bedarfe: [],
  ...p
})

describe('Prompt-Baustein je Fach, Jahrgang und Land', () => {
  it('Jahrgangsbänder', () => {
    expect([1, 4, 5, 6, 7, 8, 9, 10, 11, 13].map(bandVon)).toEqual(['gs', 'gs', '56', '56', '78', '78', '910', '910', 'sek2', 'sek2'])
  })

  it('Förderblatt: fester Aufbau mit Ziel, Standortbestimmung, Hilfekarten – ohne Selbsteinschätzung', () => {
    const t = foerderBaustein(wahl({ ziel: 'Du kannst das present perfect bilden.' }))
    expect(t).toContain('„Du kannst das present perfect bilden."')
    expect(t).toContain('Standortbestimmung')
    expect(t).toContain('Impuls → Strategie → Teillösung')
    expect(t).toContain('KEINE Selbsteinschätzung')
    expect(t).toContain('present perfect, going to/will') // Band 7/8 Englisch
    expect(t).not.toContain('AUSBLICK')
    // Kennzeichnung belegt/Faustregel mit Quellenkürzel
    expect(t).toMatch(/\[B M-20\]/)
    expect(t).toMatch(/\[F\]/)
  })

  it('Forderblatt: komplexer statt mehr, keine Lösungsbeispiele, Wettbewerbe passend zum Jahrgang', () => {
    const t9 = foerderBaustein(wahl({ art: 'forder', jahrgang: 9 }))
    expect(t9).toContain('KEINE Lösungsbeispiele')
    expect(t9).toContain('SOLO')
    expect(t9).toContain('im Stil von')
    const t5 = foerderBaustein(wahl({ art: 'forder', jahrgang: 5 }))
    expect(t5).not.toContain('SOLO')
    expect(t5).not.toContain('TEAM Schule')
    expect(wettbewerbeFuer('englisch', 6).map((w) => w.name)).toContain('Bundeswettbewerb Fremdsprachen – TEAM Schule')
    expect(wettbewerbeFuer('mathematik', 3).map((w) => w.name)).toEqual(['Mathematik-Olympiade', 'Känguru der Mathematik'])
    // Diercke WISSEN: Kl. 7–10, Altersgrenze 16
    expect(wettbewerbeFuer('erdkunde', 6)).toEqual([])
    expect(wettbewerbeFuer('erdkunde', 8).map((w) => w.name)).toEqual(['Diercke WISSEN'])
    // Deutsch: keine Fremdsprachen-Wettbewerbe
    expect(wettbewerbeFuer('deutsch', 9)).toEqual([])
  })

  it('Länder- und Schulformregeln nur, wo sie gelten', () => {
    const ni = foerderBaustein(wahl({ schulform: 'oberschule' }))
    expect(ni).toContain('G-, E- und Z-Kurse')
    expect(foerderBaustein(wahl({ land: 'NW', schulform: 'gesamtschule' }))).toContain('ab Klasse 7')
    expect(foerderBaustein(wahl({ land: 'NW', schulform: 'gesamtschule' }))).not.toContain('G-, E- und Z-Kurse')
    expect(foerderBaustein(wahl({ fachId: 'deutsch', land: 'BY' }))).toContain('BaySchO')
  })

  it('Politik, Religion, Ethik: Beutelsbacher Konsens immer', () => {
    for (const f of ['politik', 'religion', 'ethik', 'werte-und-normen', 'wirtschaft', 'gesellschaftslehre'])
      expect(foerderBaustein(wahl({ fachId: f }))).toContain('Beutelsbacher Konsens')
    expect(foerderBaustein(wahl({ fachId: 'mathematik' }))).not.toContain('Beutelsbacher')
  })

  it('Geschichte: Festlegung der Lehrkraft zu „zusammenfassen"/„beurteilen" mit den Hilfen der Stufe', () => {
    const f = foerderBaustein(wahl({ fachId: 'geschichte', jahrgang: 8, bedarfe: ['beurteilen'] }))
    expect(f).toContain('Festlegung der Lehrkraft (keine KC-Vorgabe')
    expect(f).toContain('Gemessen an (Kriterium)')
    const forder = foerderBaustein(wahl({ fachId: 'geschichte', jahrgang: 10, bedarfe: ['zusammenfassen'], art: 'forder' }))
    expect(forder).toContain('Deutung kennzeichnen')
    expect(foerderBaustein(wahl({ fachId: 'geschichte', bedarfe: ['urteil'] }))).not.toContain('Festlegung der Lehrkraft (keine KC')
  })

  it('Nachteilsausgleich: nur Darstellung; Rechtschreibung fällt als Ziel heraus', () => {
    const t = foerderBaustein(wahl({ bedarfe: ['rechtschreibung', 'zeiten'], nachteilsausgleich: true, ohneRechtschreibung: true }))
    expect(t).toContain('Anforderungen und Niveau bleiben GLEICH')
    expect(t).toContain('Rechtschreibung ist KEIN Ziel')
    expect(t).toContain('Bedarf der Lerngruppe: Zeiten')
    expect(t).not.toMatch(/Bedarf der Lerngruppe:[^\n]*Rechtschreibung/)
  })

  it('Fächergruppe als Rückfall; jedes Fach hat Förderbedarfe zur Auswahl', () => {
    expect(regelnFuer('anderes').bedarfe.length).toBeGreaterThan(0)
    expect(foerderbedarfeFuer('sport').map((b) => b.value)).toContain('regelkunde')
    expect(foerderbedarfeFuer('chemie').map((b) => b.value)).toEqual(expect.arrayContaining(['teilchenmodell', 'fehlvorstellung']))
    expect(bedarfName('musik', 'intervalle')).toMatch(/Intervalle/)
    expect(bedarfName('musik', 'eigener Text')).toBe('eigener Text')
    expect(foerderBaustein(wahl({ fachId: 'russisch' }))).toContain('Kasus, Aspekt, Kyrillisch')
  })

  it('Niveau: Oberschule/IGS G/E/Z, NRW G/E, BW G/M/E – vorbelegt aus Kurs bzw. Blattart', () => {
    expect(niveausFuer('NI', 'oberschule').map((n) => n.value)).toEqual(['G', 'E', 'Z'])
    expect(niveausFuer('NI', 'integrierte-gesamtschule').map((n) => n.value)).toEqual(['G', 'E', 'Z'])
    expect(niveausFuer('NW', 'gesamtschule').map((n) => n.value)).toEqual(['G', 'E'])
    expect(niveausFuer('BW', 'gemeinschaftsschule').map((n) => n.value)).toEqual(['G', 'M', 'E'])
    expect(niveausFuer('NI', 'gymnasium')).toEqual([])
    expect(niveauVorwahl('NI', 'oberschule', '9c E-Kurs', 'foerder')).toBe('E')
    expect(niveauVorwahl('NI', 'oberschule', '9c', 'foerder')).toBe('G')
    expect(niveauVorwahl('NI', 'oberschule', '9c', 'forder')).toBe('Z')
    expect(niveauVorwahl('NI', 'gymnasium', '9c E-Kurs', 'foerder')).toBeNull()
    expect(foerderBaustein(wahl({ niveau: 'E' }))).toContain('Niveau E nur dezent')
  })

  it('neutrale Titel', () => {
    expect(neutralerTitel('foerder', 'present perfect')).toBe('Training: present perfect')
    expect(neutralerTitel('forder', 'Training: x')).toBe('Weiterdenken: x')
  })
})
