/**
 * Länder, Schulformen und Fächer in allen Programmen (Auftrag der Lehrkraft, 30.09.2026):
 * „Stelle sicher, dass alle Bundesländer, Schulformen und Fächer in jeder App verfügbar und
 * vollständig eingepflegt sind – einschließlich bilingualer Varianten."
 *
 * Geprüft ohne Oberfläche: der gemeinsame Katalog (@shared/schulformen, @shared/faecher), dass
 * jedes Programm ihn nutzt, dass die Listen der Programme zueinander passen und dass Schulformen
 * ohne eigene Landesdaten gekennzeichnet auf ihre Bezugsform zurückfallen.
 * Bericht: recherche/audit-laender-schulformen-faecher-2026-09-30.md
 */
import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import levels from '../resources/cefr/levels.json'
import type { CefrTable } from '../src/shared/types'
import { FOERDERSCHULE_ID, LAENDER, SCHULFORMEN, datenSchulform, schulformenDes, schulformVon, vollstaendigeGerTabelle } from '../src/shared/schulformen'
import { FAECHER, FACH_ZU_SPRACHE, SPRACHFAECHER, bilingualFaehig, fachAusName } from '../src/shared/faecher'
import { STATES } from '../src/renderer/src/modules/arbeitsblatt/didactics/states'
import { gradeRange, hasCourseLevels, schoolProfileFor, schoolTypesForState } from '../src/renderer/src/modules/arbeitsblatt/didactics/schoolProfiles'
import { languageTracks, gradeOptions } from '../src/renderer/src/shared/cefr'
import { SUBJECTS } from '../src/renderer/src/modules/arbeitsblatt/model/subjects'
import { GRAMMAR_SUBJECTS } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { bilingualAktiv } from '../src/renderer/src/modules/arbeitsblatt/didactics/bilingual'
import { bilingualMoeglich } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatoren'
import { LANGUAGES } from '../src/renderer/src/modules/vokabeltest/model/types'
import { GRAMMATIK_FAECHER, KLASSENARBEIT_FAECHER, SPRACH_FAECHER } from '../src/renderer/src/shared/programmSichtbarkeit'
import { KLASSENARBEIT_FAECHER as KA_FAECHER } from '../src/renderer/src/modules/klassenarbeit/model/faecher'
import { formatsFor } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import { nachweisFuer } from '../src/renderer/src/modules/klassenarbeit/model/nachweise'
import { FACH_PALETTE, FACH_VORSCHLAG, fachIdVon } from '../src/renderer/src/shared/fachfarben'
import { appSchulform } from '../src/shared/schulsuche'
import { operatorenAuswahl } from '../src/shared/operatoren/zugriff'
import { rueckmeldungSystem } from '../src/renderer/src/modules/rueckmeldung/auftrag'
import type { Rueckmeldung } from '../src/renderer/src/modules/rueckmeldung/model/types'

const table = levels as unknown as CefrTable

/** Amtliche Schulformen, die je Land auswählbar sein müssen (Kennungen) */
const ERWARTET: Record<string, string[]> = {
  BW: ['grundschule', 'werkrealschule', 'realschule', 'gemeinschaftsschule', 'gymnasium', 'berufliches-gymnasium'],
  BY: ['grundschule', 'mittelschule', 'realschule', 'gymnasium', 'wirtschaftsschule', 'fos', 'bos'],
  BE: ['grundschule', 'integrierte-sekundarschule', 'gemeinschaftsschule', 'gymnasium', 'berufliches-gymnasium'],
  BB: ['grundschule', 'oberschule', 'gesamtschule', 'gymnasium', 'berufliches-gymnasium'],
  HB: ['grundschule', 'oberschule', 'gymnasium', 'berufliches-gymnasium'],
  HH: ['grundschule', 'stadtteilschule', 'gymnasium', 'berufliches-gymnasium'],
  HE: [
    'grundschule',
    'foerderstufe',
    'hauptschule',
    'realschule',
    'mittelstufenschule',
    'integrierte-gesamtschule',
    'kooperative-gesamtschule',
    'gymnasium',
    'berufliches-gymnasium'
  ],
  MV: ['grundschule', 'regionale-schule', 'gesamtschule', 'kooperative-gesamtschule', 'gymnasium', 'fachgymnasium'],
  NI: ['grundschule', 'hauptschule', 'realschule', 'oberschule', 'integrierte-gesamtschule', 'kooperative-gesamtschule', 'gymnasium', 'berufliches-gymnasium'],
  NW: ['grundschule', 'hauptschule', 'realschule', 'sekundarschule', 'gesamtschule', 'gymnasium', 'berufskolleg'],
  RP: ['grundschule', 'realschule-plus', 'integrierte-gesamtschule', 'gymnasium', 'berufliches-gymnasium'],
  SL: ['grundschule', 'gemeinschaftsschule', 'gymnasium', 'berufliches-oberstufengymnasium'],
  SN: ['grundschule', 'oberschule', 'gemeinschaftsschule', 'gymnasium', 'berufliches-gymnasium'],
  ST: ['grundschule', 'sekundarschule', 'gemeinschaftsschule', 'gesamtschule', 'gymnasium', 'fachgymnasium'],
  SH: ['grundschule', 'gemeinschaftsschule', 'gymnasium', 'berufliches-gymnasium'],
  TH: ['grundschule', 'regelschule', 'gemeinschaftsschule', 'gesamtschule', 'gymnasium', 'berufliches-gymnasium']
}

describe('Länder', () => {
  it('alle 16 Länder – im Katalog, in der Länderliste der Programme und in der GER-Tabelle gleich', () => {
    expect(LAENDER).toHaveLength(16)
    expect(LAENDER.map((l) => l.id)).toEqual(STATES.map((s) => s.id))
    expect(LAENDER.map((l) => l.name)).toEqual(STATES.map((s) => s.name))
    expect(table.states.map((s) => s.id).sort()).toEqual(LAENDER.map((l) => l.id).sort())
    for (const s of table.states) expect(s.name, s.id).toBe(LAENDER.find((l) => l.id === s.id)!.name)
  })
})

describe('Schulformen je Land', () => {
  it('jede amtliche Schulform ist auswählbar, dazu die Förderschule', () => {
    for (const land of LAENDER) {
      const ids = schulformenDes(land.id).map((s) => s.id)
      expect(ids, land.id).toEqual([...ERWARTET[land.id], FOERDERSCHULE_ID])
      expect(
        schoolTypesForState(table, land.id).map((t) => t.value),
        land.id
      ).toEqual(ids)
    }
  })

  it('Kennungen eindeutig, Jahrgangsspanne sinnvoll, Bezugsform im selben Land', () => {
    for (const land of LAENDER) {
      const liste = schulformenDes(land.id)
      expect(new Set(liste.map((s) => s.id)).size, land.id).toBe(liste.length)
      for (const s of liste) {
        expect(s.von, `${land.id} ${s.id}`).toBeGreaterThanOrEqual(1)
        expect(s.bis, `${land.id} ${s.id}`).toBeLessThanOrEqual(13)
        expect(s.von, `${land.id} ${s.id}`).toBeLessThanOrEqual(s.bis)
        if (s.bezug) expect(schulformVon(land.id, s.bezug), `${land.id} ${s.id} → ${s.bezug}`).toBeDefined()
        expect(gradeRange(table, land.id, s.id), `${land.id} ${s.id}`).toMatchObject({ min: s.von, max: s.bis })
        expect(schoolProfileFor(s.id, land.id).id).toBe(s.profil)
        expect(hasCourseLevels(s.id, land.id)).toBe(Boolean(s.kurse))
      }
    }
  })

  it('Grundschule 6 Jahre in Berlin und Brandenburg, sonst 4; G8-Länder mit Abitur nach 12', () => {
    for (const land of STATES) {
      expect(schulformVon(land.id, 'grundschule')!.bis, land.id).toBe(land.primaryYears)
      expect(schulformVon(land.id, 'gymnasium')!.bis, land.id).toBe(land.gymnasium === 'G8' ? 12 : 13)
    }
  })

  it('jede Schulform der GER-Tabelle steht im Katalog (keine verwaiste Kennung)', () => {
    for (const s of table.states)
      for (const t of s.schoolTypes)
        expect(
          SCHULFORMEN[s.id].some((x) => x.id === t.id),
          `${s.id} ${t.id}`
        ).toBe(true)
  })

  it('die vervollständigte GER-Tabelle kennt jede Schulform; übernommene Niveaus sind gekennzeichnet und liegen in der Spanne', () => {
    const voll = vollstaendigeGerTabelle(table)
    for (const land of LAENDER) {
      const state = voll.states.find((s) => s.id === land.id)!
      expect(state.schoolTypes.map((t) => t.id)).toEqual(schulformenDes(land.id).map((s) => s.id))
      const roh = table.states.find((s) => s.id === land.id)!
      for (const t of state.schoolTypes) {
        const sf = schulformVon(land.id, t.id)!
        if (roh.schoolTypes.some((x) => x.id === t.id)) continue
        for (const l of t.languages)
          for (const [g, e] of Object.entries(l.grades)) {
            expect(Number(g)).toBeGreaterThanOrEqual(sf.von)
            expect(Number(g)).toBeLessThanOrEqual(sf.bis)
            expect(e.basis).toContain('nicht gesichert')
          }
      }
    }
    // Kooperative Gesamtschule NI: Englisch-Niveaus von der IGS
    expect(gradeOptions(table, 'NI', 'kooperative-gesamtschule', 1).length).toBeGreaterThan(0)
    expect(languageTracks(table, 'NI', 'kooperative-gesamtschule')[0].grades['7'].basis).toContain('übernommen von Integrierte Gesamtschule')
    // Berufliches Gymnasium: nur 11–13
    expect(gradeOptions(table, 'NI', 'berufliches-gymnasium', 1).map((o) => o.value)).toEqual(['11', '12', '13'])
  })

  it('Schulverzeichnis: berufsbildende Schulen → berufliches Gymnasium, Förderschulen → Förderschule', () => {
    const ni = schulformenDes('NI').map((s) => s.id)
    expect(appSchulform(['bbs'], ni)).toBe('berufliches-gymnasium')
    expect(appSchulform(['fs'], ni)).toBe(FOERDERSCHULE_ID)
    expect(appSchulform(['hs', 'rs'], ni)).toBe('oberschule')
    expect(appSchulform(['gym'], ni)).toBe('gymnasium')
  })
})

describe('Landesdaten mit Rückfall auf die Bezugsform', () => {
  it('Klassenarbeitsregeln: Kooperative Gesamtschule und berufliches Gymnasium – übernommen und „nicht gesichert"', () => {
    const kgs = nachweisFuer({ stateId: 'NI', schoolTypeId: 'kooperative-gesamtschule', subjectId: 'englisch', grade: 7 })
    const igs = nachweisFuer({ stateId: 'NI', schoolTypeId: 'integrierte-gesamtschule', subjectId: 'englisch', grade: 7 })
    expect(kgs.bezeichnung).toBe(igs.bezeichnung)
    expect(kgs.nichtGesichert).toBe(true)
    expect(kgs.hinweis).toContain('Kooperative Gesamtschule')
    const bg = nachweisFuer({ stateId: 'NI', schoolTypeId: 'berufliches-gymnasium', subjectId: 'deutsch', grade: 12 })
    expect(bg.bezeichnung).toBe('Klausur')
    expect(bg.nichtGesichert).toBe(true)
    // Eigene Schulform ohne Bezug: unverändert
    expect(nachweisFuer({ stateId: 'NI', schoolTypeId: 'gymnasium', subjectId: 'englisch', grade: 7 }).hinweis ?? '').not.toContain('nicht eigens belegt')
  })

  it('Operatorenlisten: Schulformen ohne eigene Liste bekommen die ihrer Bezugsform', () => {
    const kgs = operatorenAuswahl({ stateId: 'NI', fach: 'geschichte', stufe: 'sek1', schulform: 'kooperative-gesamtschule' })
    const igs = operatorenAuswahl({ stateId: 'NI', fach: 'geschichte', stufe: 'sek1', schulform: 'integrierte-gesamtschule' })
    expect(kgs?.listen.map((l) => l.quelle)).toEqual(igs?.listen.map((l) => l.quelle))
    const fos = operatorenAuswahl({ stateId: 'BY', fach: 'geschichte', stufe: 'sek2', schulform: 'fos' })
    const gym = operatorenAuswahl({ stateId: 'BY', fach: 'geschichte', stufe: 'sek2', schulform: 'gymnasium' })
    expect(fos?.listen.map((l) => l.quelle)).toEqual(gym?.listen.map((l) => l.quelle))
    expect(datenSchulform('HE', 'mittelstufenschule')).toBe('integrierte-gesamtschule')
  })
})

describe('Fächer', () => {
  it('ein Katalog: Kennungen und Kürzel eindeutig, jedes Fach mit eigener Palettenfarbe', () => {
    expect(new Set(FAECHER.map((f) => f.id)).size).toBe(FAECHER.length)
    expect(new Set(FAECHER.map((f) => f.kuerzel)).size).toBe(FAECHER.length)
    expect(SUBJECTS.map((s) => s.id)).toEqual(FAECHER.map((f) => f.id))
    const palette = new Map(FACH_PALETTE.map((p) => [p.name, p.hex]))
    for (const f of FAECHER) expect(FACH_VORSCHLAG[f.id], f.id).toBe(palette.get(f.farbe))
    expect(new Set(FAECHER.map((f) => f.farbe)).size).toBe(FAECHER.length)
  })

  it('Fremdsprachen tragen ihre Zielsprache, alte Sprachen ihre Übersetzungssprache', () => {
    for (const f of FAECHER) {
      if (f.art === 'fremdsprache') expect(f.sprache, f.id).toBeTruthy()
      else expect(f.sprache, f.id).toBeUndefined()
      if (f.art === 'alte-sprache') expect(f.uebersetzungssprache, f.id).toBeTruthy()
    }
    for (const code of ['en', 'fr', 'es', 'it', 'ru', 'nl', 'pl', 'cs', 'pt', 'tr', 'zh', 'la', 'grc']) expect(FACH_ZU_SPRACHE[code], code).toBeTruthy()
  })

  it('Landesnamen werden erkannt (Gemeinschaftskunde, WAT, NaWi, LER …)', () => {
    expect(fachAusName('Gemeinschaftskunde')?.id).toBe('politik')
    expect(fachIdVon('WAT')).toBe('arbeitslehre')
    expect(fachIdVon('NaWi')).toBe('naturwissenschaften')
    expect(fachIdVon('LER')).toBe('ethik')
    expect(fachIdVon('Erziehungswissenschaft')).toBe('paedagogik')
  })

  it('Fachprogramme bieten jedes Fach an (Arbeitsblatt, Lernzielkontrolle, Rückmeldung aus SUBJECTS)', () => {
    for (const datei of [
      'src/renderer/src/modules/arbeitsblatt/steps/TopicStep.tsx',
      'src/renderer/src/modules/lernzielkontrolle/steps/SetupStep.tsx',
      'src/renderer/src/modules/rueckmeldung/steps/Einrichten.tsx'
    ])
      expect(readFileSync(datei, 'utf8'), datei).toMatch(/data=\{SUBJECTS\.map\(/)
  })

  it('Sprachprogramme: Programmsichtbarkeit passt zu den Sprachen von Vokabeltest und Grammatiktest', () => {
    const vokabel = [...LANGUAGES.map((l) => FACH_ZU_SPRACHE[l.value]), 'daz'].sort()
    expect([...SPRACH_FAECHER].sort()).toEqual(vokabel)
    expect([...GRAMMATIK_FAECHER].sort()).toEqual([...GRAMMAR_SUBJECTS].sort())
    for (const id of [...SPRACH_FAECHER, ...GRAMMATIK_FAECHER]) expect(SPRACHFAECHER.includes(id) || id === 'deutsch', id).toBe(true)
  })

  it('Klassenarbeit: Programmsichtbarkeit = Fächer des Moduls, jedes Fach im Katalog und mit Formaten in Sek I und Sek II', () => {
    expect([...KLASSENARBEIT_FAECHER].sort()).toEqual(KA_FAECHER.map((f) => f.id).sort())
    for (const f of KA_FAECHER) {
      expect(
        FAECHER.some((x) => x.id === f.id),
        f.id
      ).toBe(true)
      expect(formatsFor(f.id, 7).length, `${f.id} Kl. 7`).toBeGreaterThan(0)
      expect(formatsFor(f.id, 12).length, `${f.id} Kl. 12`).toBeGreaterThan(0)
    }
    const gl = formatsFor('gesellschaftslehre', 7)
    expect(gl.every((f) => f.note?.includes('nicht eigens belegt'))).toBe(true)
  })
})

describe('Bilingualer Sachfachunterricht', () => {
  const an = { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'sachfach' as const }

  it('in allen Sachfächern möglich, nicht in Deutsch, DaZ und den Sprachen – in allen Programmen dieselbe Regel', () => {
    for (const f of FAECHER) {
      const erwartet = !['deutsch', 'fremdsprache', 'alte-sprache'].includes(f.art)
      expect(bilingualFaehig(f.id), f.id).toBe(erwartet)
      expect(bilingualAktiv({ subjectId: f.id, bilingual: an }), f.id).toBe(erwartet)
      expect(bilingualMoeglich(f.id), f.id).toBe(erwartet)
    }
  })

  it('Programme mit Fachauswahl und Sachfächern bieten den Schalter an', () => {
    for (const datei of [
      'src/renderer/src/modules/arbeitsblatt/steps/TopicStep.tsx',
      'src/renderer/src/modules/klassenarbeit/steps/FrameStep.tsx',
      'src/renderer/src/modules/rueckmeldung/steps/Einrichten.tsx'
    ])
      expect(readFileSync(datei, 'utf8'), datei).toContain('<BilingualSchalter')
    expect(readFileSync('src/renderer/src/modules/lernzielkontrolle/steps/SetupStep.tsx', 'utf8')).toContain('bilingualMoeglich(')
  })

  it('Rückmeldung: Arbeitssprache und Bewertungsregel des Landes im Auftrag', () => {
    const rm = (subjectId: string, bilingual?: typeof an): Rueckmeldung =>
      ({
        version: 1,
        meta: {
          title: '',
          subjectId,
          subjectLabel: subjectId,
          grade: 9,
          stateId: 'NW',
          schoolTypeId: 'gymnasium',
          schoolTypeName: 'Gymnasium',
          anrede: 'du',
          schwerpunkt: '',
          bilingual
        },
        grundlage: { art: 'frei', titel: '', aufgaben: '' },
        abgaben: [],
        createdAt: ''
      } as Rueckmeldung)
    const bili = rueckmeldungSystem(rm('geschichte', an))
    expect(bili).toContain('Arbeitssprache (Englisch)')
    expect(bili).toContain('20 %')
    expect(rueckmeldungSystem(rm('geschichte'))).toContain('auf Deutsch')
    // Englisch ist kein Sachfach: der Schalter wirkt dort nicht
    expect(rueckmeldungSystem(rm('englisch', an))).not.toContain('Bilingualer Sachfachunterricht')
  })
})
