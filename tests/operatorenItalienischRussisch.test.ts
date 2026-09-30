import { describe, expect, it } from 'vitest'
import { BESTAND, anlageFuer, operatorenAuswahl } from '../src/shared/operatoren/zugriff'
import { pruefeAnweisung } from '../src/shared/operatoren/erkennung'
import { schulformenDes } from '../src/shared/schulformen'
import { LAENDERPROFILE, profilFuer } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatoren'
import { amtlicheListe, anlageWunsch } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'

/*
 * Operatoren-Bestand, Nachtrag 30.09.2026:
 * - Italienisch/Russisch: amtliche Listen aus Hessen (Landesabitur 2027), Hamburg (A-Heft 2027)
 *   und NRW (Standardsicherung, ab Abitur 2025; Italienisch nur Hörverstehen) – Listensprache it/ru.
 * - Schulform-Kennungen: jede Kennung in den Listen muss eine Schulform des Landes aus
 *   @shared/schulformen sein. Anlass: Die hessische ZAA-Liste nannte „gesamtschule", die App-Kennung
 *   ist „integrierte-gesamtschule" – die Liste griff dort nie.
 */
describe('Datenkonsistenz des Bestands', () => {
  it('jede Schulform-Kennung in den Listen ist eine Schulform des Landes', () => {
    const falsch: string[] = []
    for (const land of Object.values(BESTAND)) {
      if (land.stateId === 'KMK') {
        // Der KMK-Grundstock gilt länderübergreifend: Kennungen müssen in irgendeinem Land vorkommen
        const alle = new Set(Object.keys(BESTAND).flatMap((l) => schulformenDes(l).map((s) => s.id)))
        for (const l of land.listen) for (const s of l.schulformen ?? []) if (!alle.has(s)) falsch.push(`KMK: ${s}`)
        continue
      }
      const ids = new Set(schulformenDes(land.stateId).map((s) => s.id))
      expect(ids.size, land.stateId).toBeGreaterThan(3)
      for (const l of land.listen) for (const s of l.schulformen ?? []) if (!ids.has(s)) falsch.push(`${land.stateId}: ${s} (${l.quelle.slice(0, 50)})`)
    }
    expect(falsch).toEqual([])
  })

  it('auch die Handprofile der Lernzielkontrolle nennen nur Schulformen ihres Landes', () => {
    const falsch = LAENDERPROFILE.flatMap((p) => {
      const ids = new Set(schulformenDes(p.stateId).map((s) => s.id))
      return (p.schulformen ?? []).filter((s) => !ids.has(s)).map((s) => `${p.stateId}/${p.fach}: ${s}`)
    })
    expect(falsch).toEqual([])
  })

  it('Sprache und Stufe passen zum Fach', () => {
    for (const land of Object.values(BESTAND))
      for (const l of land.listen) {
        expect(['sek1', 'sek2']).toContain(l.stufe)
        if (l.sprache === 'it') expect(l.faecher, l.quelle).toEqual(['italienisch'])
        if (l.sprache === 'ru') expect(l.faecher, l.quelle).toEqual(['russisch'])
        // Listen nur für Italienisch/Russisch stehen in der Zielsprache oder auf Deutsch (Definitionen HE deutsch, Operatoren zielsprachig)
        if (l.faecher.length === 1 && l.faecher[0] === 'italienisch') expect(l.sprache).toBe('it')
        if (l.faecher.length === 1 && l.faecher[0] === 'russisch') expect(l.sprache).toBe('ru')
      }
  })

  it('keine lateinischen Doppelgänger in kyrillischen Wörtern (PDF-Text vereinheitlicht)', () => {
    const text = JSON.stringify(Object.values(BESTAND).flatMap((b) => b.listen.filter((l) => l.sprache === 'ru')))
    expect(text.match(/[Ѐ-ӿ]+[aeopcxyAEOPCXY]+[Ѐ-ӿ]*|[aeopcxy]+[Ѐ-ӿ]+/g) ?? []).toEqual([])
  })
})

describe('Italienisch und Russisch', () => {
  it('Hessen: Landesabitur 2027 in der Zielsprache, AFB mehrfach, deutsche Entsprechungen als Formen', () => {
    const it_ = operatorenAuswahl({ stateId: 'HE', fach: 'italienisch', stufe: 'sek2' })!
    expect(it_.herkunft).toBe('land')
    expect(it_.sprache).toBe('it')
    expect(it_.quelle).toMatch(/Landesabitur 2027 – Operatoren im Fach Italienisch/)
    expect(it_.operatoren).toHaveLength(15)
    const analizzare = it_.operatoren.find((o) => o.operator === 'analizzare')!
    expect(analizzare.afb).toBe('II')
    expect(analizzare.formen).toEqual(['esaminare', 'analysieren', 'untersuchen'])
    const ru = operatorenAuswahl({ stateId: 'HE', fach: 'russisch', stufe: 'sek2' })!
    expect(ru.sprache).toBe('ru')
    expect(ru.operatoren.map((o) => o.operator)).toContain('охарактеризовать')
    // Silbentrennung aufgelöst, „Pro- und Kontra" bleibt
    expect(ru.operatoren.find((o) => o.operator === 'обсудить')!.definition).toMatch(/Pro- und Kontraargumenten/)
  })

  it('Hamburg: A-Heft 2027 nach Kompetenzbereichen', () => {
    for (const [fach, sprache, erster] of [
      ['italienisch', 'it', 'analizzare'],
      ['russisch', 'ru', 'выделить']
    ] as const) {
      const a = operatorenAuswahl({ stateId: 'HH', fach, stufe: 'sek2' })!
      expect(a.sprache).toBe(sprache)
      expect(a.operatoren[0].operator).toBe(erster)
      expect(new Set(a.operatoren.map((o) => o.kompetenzbereich))).toEqual(new Set(['Schreiben', 'Sprachmittlung', 'Hör-/Hörsehverstehen']))
    }
  })

  it('NRW: Russisch vollständig, Italienisch nur Hörverstehen', () => {
    const ru = operatorenAuswahl({ stateId: 'NW', fach: 'russisch', stufe: 'sek2' })!
    expect(ru.sprache).toBe('ru')
    expect(ru.operatoren.filter((o) => o.kompetenzbereich === 'Schreiben').map((o) => o.operator)).toContain('проинтерпретировать')
    const it_ = operatorenAuswahl({ stateId: 'NW', fach: 'italienisch', stufe: 'sek2' })!
    expect(it_.sprache).toBe('it')
    expect(it_.operatoren.every((o) => o.kompetenzbereich === 'Hör-/Hörsehverstehen')).toBe(true)
  })

  it('Sek I ohne eigene Liste: Oberstufenliste als Orientierung; Länder ohne Liste: keine', () => {
    const a = operatorenAuswahl({ stateId: 'HE', fach: 'italienisch', stufe: 'sek1' })!
    expect(a.stufeAbweichend).toBe(true)
    expect(a.sprache).toBe('it')
    // Nie die Liste eines anderen Fachs oder einer anderen Sprache
    expect(operatorenAuswahl({ stateId: 'BY', fach: 'italienisch', stufe: 'sek2' })).toBeNull()
    expect(operatorenAuswahl({ stateId: 'BW', fach: 'russisch', stufe: 'sek2' })).toBeNull()
  })

  it('Klausur-Anlage der Klassenarbeit: zielsprachige Landesliste', () => {
    expect(anlageFuer('HH', 'russisch')!.sprache).toBe('ru')
    const meta = { ...defaultExamMeta('HE', 'gymnasium', 'Gymnasium', 12), subjectId: 'italienisch' as const }
    const liste = amtlicheListe('HE', 'italienisch', anlageWunsch(meta))!
    expect(liste.sprache).toBe('it')
    expect(liste.quelle).toMatch(/Italienisch/)
  })

  it('Lernzielkontrolle: amtliche Liste statt fachüblicher Operatoren', () => {
    const p = profilFuer('HH', 'russisch', 'sek2', 'gymnasium')!
    expect(p.herkunft ?? 'land').toBe('land')
    expect(p.operatoren.map((o) => o.name)).toContain('охарактеризовать')
  })

  it('Erkennung: Imperativ der Aufgabe ↔ Infinitiv der Liste', () => {
    const ru = operatorenAuswahl({ stateId: 'NW', fach: 'russisch', stufe: 'sek2' })!.operatoren
    const treffer = (text: string, liste = ru, sprache: 'ru' | 'it' = 'ru'): string | null => {
      const b = pruefeAnweisung(text, liste, { sprache })
      return b.art === 'operator' ? b.treffer[0].operator : null
    }
    expect(treffer('Опишите героя рассказа.')).toBe('описать')
    expect(treffer('Проанализируйте поведение героини.')).toBe('проанализировать')
    expect(treffer('Напишите другу электронное письмо.')).toMatch(/^написать/)
    expect(treffer('Оцените поступок героя.')).toBe('оценить')
    const he = operatorenAuswahl({ stateId: 'HE', fach: 'russisch', stufe: 'sek2' })!.operatoren
    expect(treffer('Дайте оценку предложению президента.', he)).toBe('оценить')
    const it_ = operatorenAuswahl({ stateId: 'HE', fach: 'italienisch', stufe: 'sek2' })!.operatoren
    expect(treffer('Analizzi il comportamento del protagonista.', it_, 'it')).toBe('analizzare')
    expect(treffer('Confronti i due personaggi.', it_, 'it')).toBe('paragonare')
  })
})

describe('Hessen: ZAA-Liste Deutsch (Bildungsgang Haupt-/Realschule)', () => {
  it('greift an IGS, KGS und Mittelstufenschule, nicht am Gymnasium', () => {
    for (const schulform of ['hauptschule', 'realschule', 'integrierte-gesamtschule', 'kooperative-gesamtschule', 'mittelstufenschule']) {
      const a = operatorenAuswahl({ stateId: 'HE', fach: 'deutsch', stufe: 'sek1', schulform, nurLand: true })
      expect(a?.quelle, schulform).toMatch(/Zentrale Abschlussarbeiten/)
      expect(a!.stufeAbweichend).toBe(false)
    }
    const gym = operatorenAuswahl({ stateId: 'HE', fach: 'deutsch', stufe: 'sek1', schulform: 'gymnasium', nurLand: true })
    expect(gym?.quelle ?? '').not.toMatch(/Zentrale Abschlussarbeiten/)
  })
})
