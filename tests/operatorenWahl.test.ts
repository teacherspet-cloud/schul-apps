import { describe, expect, it } from 'vitest'
import { wahlEintraege, wahlGruppen } from '../src/renderer/src/shared/operatorenWahl'
import {
  bilingualMoeglich,
  bilingualProfil,
  kennzeichnung,
  profilFuer,
  profilFuerKurztest
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatoren'
import { pruefeOperatoren, spracheDesProfils } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatorPruefung'
import { kurztestPrompt } from '../src/renderer/src/modules/lernzielkontrolle/generation/generateKurztest'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { checkSubjectOperator } from '../src/renderer/src/modules/arbeitsblatt/didactics/subjectOperators'

/*
 * Operatorenauswahl vor der Erstellung und bilingualer Unterricht (30.09.2026).
 *
 * Rückmeldung der Lehrkraft: Die Auswahl listet die Operatoren „unübersichtlich auf und auch
 * ungetrennt zwischen bilingual und normalem Fachunterricht".
 */

const aufgabe = (instruction: string) => ({
  id: 'a',
  instruction,
  answerKind: 'lines',
  hatMaterial: true
})

describe('Aufbereitung für die Auswahl', () => {
  it('gruppiert nach Anforderungsbereich, alphabetisch innerhalb', () => {
    const p = profilFuer('NI', 'geschichte', 'sek2')!
    const gruppen = wahlGruppen(wahlEintraege(p.operatoren, 'de'))
    expect(gruppen.map((g) => g.titel)).toEqual(expect.arrayContaining(['AFB I', 'AFB II', 'AFB III']))
    expect(gruppen.findIndex((g) => g.titel === 'AFB I')).toBeLessThan(gruppen.findIndex((g) => g.titel === 'AFB III'))
    const zwei = gruppen.find((g) => g.titel === 'AFB II')!.eintraege.map((e) => e.name)
    expect(zwei).toContain('herausarbeiten')
    expect(zwei).toContain('erläutern')
    expect([...zwei].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))).toEqual(zwei)
  })

  it('führt doppelte und zusammengesetzte Zeilen zu je einem Eintrag zusammen', () => {
    const e = wahlEintraege(
      [
        { name: 'Analysieren / Untersuchen', afb: ['II'] },
        { name: 'analysieren', definition: 'zerlegen' },
        { name: '(be)nennen', afb: ['I'] },
        { name: 'ein-, zuordnen', afb: ['II'] }
      ],
      'de'
    )
    expect(e.map((x) => x.name)).toEqual(['analysieren', 'nennen', 'einordnen'])
    expect(e[0].weitere).toEqual(['untersuchen'])
    expect(e[0].definition).toBe('zerlegen')
    expect(e[1].weitere).toEqual(['benennen'])
  })

  it('trennt in Fremdsprachenlisten die deutschen Entsprechungen ab', () => {
    const e = wahlEintraege([{ name: 'describe', synonyme: ['beschreiben'] }, { name: 'analyze, examine' }, { name: 'describe …' }], 'en')
    expect(e.map((x) => x.name)).toEqual(['describe', 'analyze'])
    expect(e[0].deutsch).toEqual(['beschreiben'])
    expect(e[1].weitere).toEqual(['examine'])
  })

  it('Suche über Name, Formen, Entsprechung und Erläuterung', () => {
    const e = wahlEintraege(
      [
        { name: 'assess', deutsch: 'beurteilen', afb: 'III' },
        { name: 'describe', afb: 'I' }
      ],
      'en'
    )
    expect(wahlGruppen(e, 'beurt').flatMap((g) => g.eintraege.map((x) => x.name))).toEqual(['assess'])
    expect(wahlGruppen(e, 'xyz')).toEqual([])
  })
})

describe('bilingual getrennt vom Fachunterricht', () => {
  it('nur Sachfächer', () => {
    expect(bilingualMoeglich('geschichte')).toBe(true)
    expect(bilingualMoeglich('englisch')).toBe(false)
    expect(bilingualMoeglich('deutsch')).toBe(false)
  })

  it('NRW Geschichte Oberstufe: die zielsprachige Landesliste, ohne deutsche Operatoren', () => {
    const p = bilingualProfil('NW', 'geschichte', 'sek2', 'en')!
    expect(p.sprache).toBe('en')
    expect(kennzeichnung(p).text).toBe('amtliche Liste')
    expect(p.quelle).toMatch(/bilingual/)
    const namen = p.operatoren.map((o) => o.name)
    expect(namen).toEqual(expect.arrayContaining(['analyse', 'assess', 'explain']))
    expect(namen).not.toContain('erläutern')
    // Die deutsche Liste des Fachs bleibt ohne englische Operatoren
    expect(profilFuer('NW', 'geschichte', 'sek2')!.operatoren.map((o) => o.name)).not.toContain('assess')
  })

  it('ohne Landesliste: gekennzeichnete Entsprechungen mit deutscher Form', () => {
    const p = bilingualProfil('NI', 'biologie', 'sek1', 'en')!
    expect(p.herkunft).toBe('entsprechung')
    expect(kennzeichnung(p).text).toBe('bilinguale Entsprechungen')
    expect(p.operatoren.find((o) => o.name === 'describe')?.deutsch).toBe('beschreiben')
    expect(bilingualProfil('NI', 'biologie', 'sek1', 'fr')!.operatoren.some((o) => o.name === 'décrire')).toBe(true)
  })

  it('die Lernzielkontrolle wählt die Liste nach dem Schalter', () => {
    const t = emptyKurztest('NW', 'gymnasium', 'Gymnasium')
    t.meta = {
      ...t.meta,
      subjectId: 'geschichte',
      subjectLabel: 'Geschichte',
      stufe: 'sek2',
      grade: 12
    }
    expect(spracheDesProfils(profilFuerKurztest(t.meta))).toBe('de')
    t.meta.bilingual = { an: true, sprache: 'en' }
    const p = profilFuerKurztest(t.meta)!
    expect(spracheDesProfils(p)).toBe('en')
    const prompt = kurztestPrompt(t, '')
    expect(prompt).toMatch(/BILINGUALER SACHFACHUNTERRICHT \(Arbeitssprache Englisch\)/)
    expect(prompt).toMatch(/assess/)
    // Geprüft wird gegen die englische Liste
    expect(pruefeOperatoren([aufgabe('Assess the role of the press in 1914.')], p).filter((w) => w.art === 'fehlt')).toEqual([])
    // Im Fach bilingual abgeschaltet: kein bilingualer Teil
    t.meta.bilingual = { an: false, sprache: 'en' }
    expect(kurztestPrompt(t, '')).not.toMatch(/BILINGUALER/)
  })
})

describe('Lernzielkontrolle: Formen aus der Rückmeldung und Landesliste', () => {
  const ni = profilFuer('NI', 'geschichte', 'sek2')

  it('„Erläutern Sie" und „Arbeiten Sie … heraus" sind Operatoren', () => {
    for (const t of [
      'Erläutern Sie die Ursachen.',
      'Arbeiten Sie die Position des Autors heraus.',
      'Nehmen Sie Stellung zur These.',
      'Ordnen Sie die Quelle ein.'
    ])
      expect(
        pruefeOperatoren([aufgabe(t)], ni).filter((w) => w.art === 'fehlt' || w.art === 'fremd'),
        t
      ).toEqual([])
  })

  it('ein Verb anderer Listen: „kein Operator der Landesliste" mit Vorschlag', () => {
    const w = pruefeOperatoren([aufgabe('Diskutieren Sie die These.')], ni)
    const fremd = w.find((x) => x.art === 'fremd' || x.art === 'unbekannt')
    expect(fremd?.message).toMatch(/Operator/)
    expect(fremd?.message).toMatch(/„erörtern"/)
  })
})

describe('Arbeitsblatt: Prüfung gegen die Landesliste', () => {
  const kontext = {
    stateId: 'NI',
    stufe: 'sek2' as const,
    schulform: 'gymnasium'
  }

  it('erkennt Sie-Form und trennbare Verben', () => {
    expect(checkSubjectOperator('Arbeiten Sie die Positionen heraus.', 'geschichte', undefined, kontext)).toMatchObject({
      known: true,
      listed: 'herausarbeiten'
    })
    expect(checkSubjectOperator('Erläutern Sie die Folgen.', 'geschichte', undefined, kontext)).toMatchObject({ known: true, listed: 'erläutern', afb: 'II' })
  })

  it('meldet ein Verb anderer Listen mit Vorschlag', () => {
    const r = checkSubjectOperator('Diskutieren Sie die These.', 'geschichte', undefined, kontext)!
    expect(r.known).toBe(false)
    expect(r.landesliste).toMatch(/Niedersächs/)
    expect(r.vorschlag).toBe('erörtern')
  })
})
