/**
 * Ablauf einer Gruppe in der Partnerarbeit (24.10.2026): Jede Karte – mit oder ohne Hilfen, mit oder ohne dritte
 * Rolle, ein oder zwei Bilder – ergibt für Gruppengröße 2 UND 3 eine gültige Sicht; Rotation (jede Person einmal A),
 * Dreier-Monolog verteilt Bilder, Dialog ohne dritte Rolle hat einen Helfer, Freischalten nur durch Berechtigte, keine
 * fremde Rollenkarte (Info-Gap), keine Namen, keine Kartenwiederholung je Gruppe, Rückmeldung nur im Speicher.
 */
import { describe, expect, it } from 'vitest'
import { GRUNDKARTEN, karteBereinigt, type SprechKarte } from '../src/shared/sprechen/karten'
import { gruppeStarten, kartenWaehlen, probeGruppe, schrittAktion, sichtSchritt, type Karten, type Umfeld } from '../src/shared/partnerarbeit/ablauf'
import { einstellungenBereinigt, type PaEinstellungen, type PaGruppe } from '../src/shared/partnerarbeit/typen'
import { partnerPersonEntfernen } from '../src/shared/partnerarbeit/entfernen'

const rolle = (name: string, karte: string) => ({
  name,
  karte,
  vorschlaege: [`${name}: idea 1`, `${name}: idea 2`, `${name}: idea 3`],
  wortschatz: [{ wort: `${name}-word`, deutsch: 'Wort' }],
  beispiele: [`${name} says …`]
})
const grund = GRUNDKARTEN.en!
const interviewOhne = grund.A1![0]
const interviewMit = karteBereinigt(
  {
    ...grund.A2![0],
    id: 'i-mit',
    hilfen: {
      nachfragen: ['Why?', 'Since when?', 'With whom?', 'Where?', 'What else?'],
      wortschatz: [{ wort: 'hobby', deutsch: 'Hobby' }],
      beispiele: ['I play football.']
    }
  },
  'i-mit'
)!
const dialogZwei = grund.A1![2]
const dialogInfogap = grund.A2![1]
const dialogDrei = karteBereinigt(
  {
    ...grund.B1![1],
    id: 'd-drei',
    hilfen: {
      rollen: [
        rolle('Council 1', 'You are a student on the school council.'),
        rolle('Council 2', 'You are another student.'),
        rolle('Teacher', 'You chair the meeting and think about costs.')
      ]
    }
  },
  'd-drei'
)!
const bild1: SprechKarte = {
  art: 'monolog',
  id: 'b1',
  titel: 'Market',
  bilder: ['a1b2c3d4e5f6a1b2c3d4e5f6.png'],
  bildBeschreibung: 'A market',
  leitfragen: ['Who?', 'Where?']
}
const bild2: SprechKarte = karteBereinigt(
  {
    art: 'monolog',
    id: 'b2',
    titel: 'Park',
    bilder: ['b1b2c3d4e5f6a1b2c3d4e5f6.png', 'c1b2c3d4e5f6a1b2c3d4e5f6.png'],
    bildBeschreibung: 'Two pictures',
    leitfragen: ['Compare.'],
    hilfen: { auftrag: 'Describe your picture.', zusatzfragen: ['Weather?'], wortschatz: [{ wort: 'bench', deutsch: 'Bank' }], beispiele: ['I can see …'] }
  },
  'b2'
)!
const bildOhne: SprechKarte = { art: 'monolog', id: 'b0', titel: 'No image', bilder: [], bildBeschreibung: 'x', leitfragen: ['q'] }

const alleKarten: SprechKarte[] = [interviewOhne, interviewMit, dialogZwei, dialogInfogap, dialogDrei, bild1, bild2, bildOhne]
const karten = (l: SprechKarte[] = alleKarten): Karten => new Map(l.map((k) => [k.id, k]))
const umfeld: Umfeld = { sprache: 'en', niveau: 'A2', uhr: true, jetzt: 1000 }
const e = (t: Partial<PaEinstellungen> = {}): PaEinstellungen => ({
  ...einstellungenBereinigt({ ende: 10 ** 13 }, 0),
  teile: ['interview', 'monolog', 'dialog'],
  uhr: true,
  ...t
})
const fest = (): (() => number) => {
  let n = 0
  return () => ((n = (n * 9301 + 49297) % 233280), n / 233280)
}
const text = (x: unknown): string => JSON.stringify(x)

describe('Ablauf der Partnerarbeit', () => {
  it('jede Karte ergibt zu zweit und zu dritt eine gültige Sicht für alle Rollen', () => {
    for (const k of alleKarten.filter((x) => x !== bildOhne))
      for (const groesse of [2, 3] as const) {
        const teil = k.art
        const g = gruppeStarten(probeGruppe(groesse), e({ teile: [teil] }), karten([k]), 0, fest())
        expect(g.schritt, `${k.id} zu ${groesse}`).not.toBeNull()
        for (const wer of g.mitglieder) {
          const s = sichtSchritt(g, wer, karten([k]), umfeld, [])
          expect(s, `${k.id} ${wer}`).not.toBeNull()
          expect(s!.teil).toBe(teil)
          expect(['A', 'B', 'C', 'helfer']).toContain(s!.rolle)
          if (teil === 'interview') {
            if (s!.rolle === 'A') expect(s!.interview?.fragen.length).toBeGreaterThan(0)
            else expect(s!.interview).toBeUndefined()
          }
          if (teil === 'monolog') expect(s!.monolog?.bilder.length).toBeGreaterThan(0)
          if (teil === 'dialog') expect(s!.dialog?.situation).toBeTruthy()
          expect(text(s)).not.toContain('pa"') // keine Kennungen anderer außer dranId bei A
        }
      }
  })

  it('Monolog ohne Bild bleibt außen vor; ohne Karten kein Schritt', () => {
    expect(kartenWaehlen('monolog', 2, karten([bildOhne]), [])).toEqual([])
    const g = gruppeStarten(probeGruppe(2), e({ teile: ['monolog'] }), karten([bildOhne]), 0)
    expect(g.schritt).toBeNull()
  })

  it('Dreier: Dialog bevorzugt die dritte Rolle, sonst Helfer; Monolog verteilt zwei Bilder', () => {
    for (let i = 0; i < 10; i++) expect(kartenWaehlen('dialog', 3, karten([dialogZwei, dialogDrei]), [])[0].id).toBe('d-drei')
    const helfer = gruppeStarten(probeGruppe(3), e({ teile: ['dialog'] }), karten([dialogInfogap]), 0)
    const rollen = Object.values(helfer.schritt!.rollen)
    expect(rollen).toContain('helfer')
    const h = helfer.mitglieder.find((m) => helfer.schritt!.rollen[m] === 'helfer')!
    const sH = sichtSchritt(helfer, h, karten([dialogInfogap]), umfeld, [])!
    expect(sH.dialog?.alleRollen).toHaveLength(2)
    expect(sH.schalter.length).toBeGreaterThan(0)
    // Info-Gap: A sieht die Infokarte von B nicht
    const a = helfer.mitglieder.find((m) => helfer.schritt!.rollen[m] === 'A')!
    const sA = sichtSchritt(helfer, a, karten([dialogInfogap]), umfeld, [])!
    expect(text(sA)).not.toContain('Lakeside')
    const b = helfer.mitglieder.find((m) => helfer.schritt!.rollen[m] === 'B')!
    expect(text(sichtSchritt(helfer, b, karten([dialogInfogap]), umfeld, []))).toContain('Lakeside')

    const mono = gruppeStarten(probeGruppe(3), e({ teile: ['monolog'] }), karten([bild2]), 0)
    const [sa, sb, sc] = mono.mitglieder.map((m) => sichtSchritt(mono, m, karten([bild2]), umfeld, [])!)
    expect(sa.rolle).toBe('A')
    // Zu dritt (25.10.2026): nur B spricht; C sieht dasselbe Bild mit Auftrag, aber ohne Hilfen, und wer dran ist
    expect(sb.monolog!.bilder).toEqual(bild2.art === 'monolog' ? bild2.bilder : [])
    expect(sa.monolog!.bilder).toEqual(sb.monolog!.bilder)
    expect(sc.rolle).toBe('C')
    expect(sc.monolog!.bilder).toEqual(sb.monolog!.bilder)
    expect(sc.monolog!.auftrag).toBe(sb.monolog!.auftrag)
    expect(sc.hilfen).toEqual({})
    expect(sb.dran).toBe(true)
    expect(sc.dran).toBe(false)
    expect(sa.dranId).toBe(mono.mitglieder.find((m) => mono.schritt!.rollen[m] === 'B'))
    expect(sa.kann.naechste).toBe(false)
    expect(
      schrittAktion(mono, mono.mitglieder.find((m) => mono.schritt!.rollen[m] === 'A')!, 'naechste', {}, e({ teile: ['monolog'] }), karten([bild2]), 1)
    ).toMatch(/Interview/)
    // Freischalten erreicht nur B, nicht C
    const aMono = mono.mitglieder.find((m) => mono.schritt!.rollen[m] === 'A')!
    expect(schrittAktion(mono, aMono, 'freischalten', { was: 'wortschatz' }, e({ teile: ['monolog'] }), karten([bild2]), 1)).toBeNull()
    expect(Object.keys(mono.schritt!.frei)).toEqual([mono.mitglieder.find((m) => mono.schritt!.rollen[m] === 'B')])
    // Bildkarte (Befund 24.10.2026): der Sprechende sieht keine Leitfragen, A sieht Impulse (Leitfragen + Zusatzfragen ohne Doppelung)
    expect(sb.monolog!.leitfragen).toEqual([])
    expect(sa.monolog!.impulse).toEqual(['Compare.', 'Weather?'])
    expect(sa.schalter.some((x) => x.was === 'leitfragen')).toBe(true)
    const a3 = mono.mitglieder.find((m) => mono.schritt!.rollen[m] === 'A')!
    expect(schrittAktion(mono, a3, 'freischalten', { was: 'leitfragen' }, e({ teile: ['monolog'] }), karten([bild2]), 1)).toBeNull()
    expect(sichtSchritt(mono, mono.mitglieder[1], karten([bild2]), umfeld, [])!.monolog!.leitfragen).toEqual(['Compare.'])
    // C bekommt die freigeschalteten Leitfragen nicht
    expect(sichtSchritt(mono, mono.mitglieder[2], karten([bild2]), umfeld, [])!.monolog!.leitfragen).toEqual([])
    // Karte ohne eigenen Auftrag: allgemeiner Auftrag statt aufgezählter Leitfragen
    const ohne = gruppeStarten(probeGruppe(2), e({ teile: ['monolog'] }), karten([bild1]), 0)
    const sOhne = sichtSchritt(ohne, ohne.mitglieder[1], karten([bild1]), umfeld, [])!
    expect(sOhne.monolog!.auftrag).toMatch(/^Describe the picture/)
    expect(sOhne.monolog!.auftrag).not.toContain('Who?')
    // Monolog zu dritt: immer EINE Karte je Unterrunde (25.10.2026)
    expect(kartenWaehlen('monolog', 3, karten([bild1, { ...bild1, id: 'b1b' }]), [])).toHaveLength(1)
  })

  it('Rotation: jede Person einmal A, dann der nächste Teil, dann eine neue Runde', () => {
    const k = karten([interviewOhne, interviewMit, bild1, bild2, dialogZwei, dialogDrei])
    const g = gruppeStarten(probeGruppe(3), e(), k, 0, fest())
    const warA: string[] = []
    const durch = (): void => {
      const a = g.mitglieder.find((m) => g.schritt!.rollen[m] === 'A')!
      warA.push(a)
      expect(schrittAktion(g, a, 'wechsel', {}, e(), k, 5)).toBeNull()
      expect(g.schritt!.rueckmeldung).toBe(true)
      // „Weiter" nur A (25.10.2026): ein Partner könnte sonst die Rückmeldung für alle überspringen
      const nichtA = g.mitglieder.find((m) => m !== a)!
      expect(schrittAktion(g, nichtA, 'weiter', {}, e(), k, 6)).toMatch(/Rückmeldung/)
      expect(sichtSchritt(g, nichtA, k, umfeld, [])!.kann.weiter).toBe(false)
      expect(sichtSchritt(g, a, k, umfeld, [])!.kann.weiter).toBe(true)
      expect(schrittAktion(g, a, 'weiter', {}, e(), k, 6)).toBeNull()
    }
    expect(g.schritt!.teil).toBe('interview')
    durch()
    durch()
    durch()
    expect(new Set(warA).size).toBe(3)
    expect(g.schritt!.teil).toBe('monolog')
    // Monolog zu dritt: über die drei Unterrunden ist jede Person genau einmal A, einmal B (spricht) und einmal C (hört zu)
    const monoRollen: Record<string, string[]> = {}
    for (let i = 0; i < 3; i++) {
      for (const [id, r] of Object.entries(g.schritt!.rollen)) (monoRollen[id] ??= []).push(r)
      durch()
    }
    for (const id of g.mitglieder) expect([...monoRollen[id]].sort()).toEqual(['A', 'B', 'C'])
    expect(g.schritt!.teil).toBe('dialog')
    const irgendwer = g.mitglieder[1]
    expect(schrittAktion(g, irgendwer, 'fertig', {}, e(), k, 7)).toBeNull()
    expect(schrittAktion(g, irgendwer, 'weiter', {}, e(), k, 8)).toBeNull()
    expect(g.runde).toBe(2)
    expect(g.schritt!.teil).toBe('interview')
    // keine Wiederholung, solange es frische Karten gibt; danach von vorn
    expect(kartenWaehlen('interview', 2, karten([interviewOhne, interviewMit]), [interviewOhne.id])[0].id).toBe('i-mit')
    expect(kartenWaehlen('interview', 2, karten([interviewOhne, interviewMit]), [interviewOhne.id, 'i-mit'])).toHaveLength(1)
  })

  it('Freischalten: A für die Antwortenden, im Dialog jede Person für sich; B darf nicht', () => {
    const k = karten([interviewMit])
    const g = gruppeStarten(probeGruppe(2), e({ teile: ['interview'] }), k, 0)
    const a = g.mitglieder.find((m) => g.schritt!.rollen[m] === 'A')!
    const b = g.mitglieder.find((m) => g.schritt!.rollen[m] === 'B')!
    expect(sichtSchritt(g, b, k, umfeld, [])!.hilfen).toEqual({})
    expect(schrittAktion(g, b, 'freischalten', { was: 'wortschatz' }, e(), k, 1)).toMatch(/fragt/)
    expect(schrittAktion(g, a, 'freischalten', { was: 'wortschatz' }, e(), k, 1)).toBeNull()
    expect(sichtSchritt(g, b, k, umfeld, [])!.hilfen.wortschatz).toEqual([{ wort: 'hobby', deutsch: 'Hobby' }])
    expect(sichtSchritt(g, a, k, umfeld, [])!.schalter.find((x) => x.was === 'wortschatz')?.an).toBe(true)
    expect(schrittAktion(g, a, 'freischalten', { was: 'wortschatz', an: false }, e(), k, 1)).toBeNull()
    expect(sichtSchritt(g, b, k, umfeld, [])!.hilfen.wortschatz).toBeUndefined()
    // A hakt ab, sieht Nachfragen und die Uhr; B nicht
    expect(schrittAktion(g, a, 'haken', { index: 1 }, e(), k, 1)).toBeNull()
    const sA = sichtSchritt(g, a, k, umfeld, [])!
    expect(sA.interview!.fragen[1].haken).toBe(true)
    expect(sA.interview!.fragen[0].nachfrage).toBe('Why?')
    expect(sA.uhr?.zielMinuten).toBeGreaterThan(0)
    expect(sichtSchritt(g, b, k, umfeld, [])!.uhr).toBeUndefined()

    const kd = karten([dialogDrei])
    const d = gruppeStarten(probeGruppe(3), e({ teile: ['dialog'] }), kd, 0)
    const c = d.mitglieder.find((m) => d.schritt!.rollen[m] === 'C')!
    expect(schrittAktion(d, c, 'freischalten', { was: 'vorschlaege' }, e(), kd, 1)).toBeNull()
    const sC = sichtSchritt(d, c, kd, umfeld, [])!
    expect(sC.dialog!.rolle?.name).toBe('Teacher')
    expect(sC.hilfen.vorschlaege?.[0]).toContain('Teacher')
    // die anderen sehen Cs Vorschläge nicht
    const sA2 = sichtSchritt(d, d.mitglieder[0], kd, umfeld, [])!
    expect(text(sA2.hilfen)).not.toContain('Teacher: idea')
  })

  it('Rückmeldung: Geber und Empfänger, nur aus dem Speicher', () => {
    const k = karten([interviewOhne])
    const g = gruppeStarten(probeGruppe(2), e({ teile: ['interview'] }), k, 0)
    const a = g.mitglieder.find((m) => g.schritt!.rollen[m] === 'A')!
    const b = g.mitglieder.find((m) => g.schritt!.rollen[m] === 'B')!
    schrittAktion(g, a, 'wechsel', {}, e(), k, 10)
    const r = [{ von: a, smileys: [2, 1, 2], satz: 'Well done', zeit: 11 }]
    expect(sichtSchritt(g, a, k, umfeld, r)!.rueckmeldung).toEqual({ geber: true, abgegeben: true, erhalten: [] })
    expect(sichtSchritt(g, b, k, umfeld, r)!.rueckmeldung).toEqual({ geber: false, abgegeben: false, erhalten: [{ smileys: [2, 1, 2], satz: 'Well done' }] })
    expect(text(g)).not.toContain('Well done')
  })

  it('Löschkonzept: eine Person verschwindet aus Gruppen, Symbolen und Regeln', () => {
    const g: PaGruppe = {
      id: 'g',
      mitglieder: ['x', 'y', 'z'],
      runde: 1,
      teilIndex: 0,
      schritt: {
        teil: 'interview',
        karten: ['k'],
        rollen: { x: 'A', y: 'B', z: 'C' },
        dran: 'y',
        unterrunde: 0,
        haken: [],
        frei: { y: ['wortschatz'] },
        fertig: [],
        seit: 0
      },
      benutzt: [],
      seit: 0
    }
    const daten = { anwesend: ['x', 'y'], symbole: { x: '1F98A', y: '1F422' }, gruppen: [g, { ...g, id: 'h', mitglieder: ['y'] }] }
    const neu = partnerPersonEntfernen(daten, new Set(['y'])) as typeof daten
    expect(neu.anwesend).toEqual(['x'])
    expect(neu.symbole).toEqual({ x: '1F98A' })
    expect(neu.gruppen).toHaveLength(1)
    expect(neu.gruppen[0].mitglieder).toEqual(['x', 'z'])
    expect(neu.gruppen[0].schritt!.rollen).toEqual({ x: 'A', z: 'C' })
    expect(neu.gruppen[0].schritt!.frei).toEqual({})
    const regeln = partnerPersonEntfernen(
      {
        einstufung: { x: 'stark', y: 'schwach' },
        nichtMit: [
          ['x', 'y'],
          ['x', 'z']
        ],
        zuletzt: { x: ['y', 'z'], y: ['x'] }
      },
      new Set(['y'])
    )
    expect(regeln).toEqual({ einstufung: { x: 'stark' }, nichtMit: [['x', 'z']], zuletzt: { x: ['z'] } })
  })
})
