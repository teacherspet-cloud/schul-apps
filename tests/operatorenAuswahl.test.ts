import { describe, expect, it } from 'vitest'
import { abgeloest, BESTAND, operatorenAuswahl } from '../src/shared/operatoren/zugriff'
import { istBelegt, kennzeichnung, namenAus, profilFuer } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatoren'
import { amtlicheListe } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { STATES } from '../src/renderer/src/modules/arbeitsblatt/didactics/states'

/*
 * EINE Auswahlfunktion für alle Programme (30.09.2026).
 *
 * Anlass (Rückmeldung der Lehrkraft): Lernzielkontrolle, Niedersachsen, Englisch – angezeigt
 * wurde „ohne Landesliste" mit berechnen, skizzieren, zeichnen … Die Lernzielkontrolle kannte
 * die niedersächsischen Listen nicht, und ihr Rückfall war fächerübergreifend und stammte aus
 * Mathematik-/Naturwissenschaftslisten.
 */

const KERNFAECHER = ['deutsch', 'englisch', 'franzoesisch', 'spanisch', 'latein', 'mathematik', 'biologie', 'chemie', 'physik', 'geschichte', 'erdkunde', 'politik', 'religion', 'ethik', 'informatik']
const FREMDSPRACHEN = ['englisch', 'franzoesisch', 'spanisch']

/** Operatoren, die es nur in Mathematik und Naturwissenschaften gibt – in einer Fremdsprachenliste ein sicheres Zeichen für die falsche Liste */
const MINT = ['berechnen', 'zeichnen', 'skizzieren', 'beweisen', 'herleiten', 'ermitteln', 'bestimmen', 'abschätzen', 'nachweisen']

const klein = (s: string): string => s.toLocaleLowerCase('de')

describe('Niedersachsen, Englisch (Fehlerbericht)', () => {
  it('Oberstufe: die amtliche niedersächsische Liste', () => {
    const p = profilFuer('NI', 'englisch', 'sek2', 'gymnasium')!
    expect(istBelegt(p)).toBe(true)
    expect(kennzeichnung(p).text).toBe('amtliche Liste')
    expect(p.quelle).toMatch(/Operatoren für das Fach Englisch/)
    expect(p.quelle).toMatch(/Niedersächsisch/)
    expect(p.quelle).toMatch(/Stand 1\. Februar 2024/)
    expect(namenAus(p)).toEqual(expect.arrayContaining(['analyse', 'assess', 'describe', 'discuss', 'explain']))
    // Die Erläuterungen der Liste im Wortlaut
    expect(p.operatoren.find((o) => o.name.startsWith('analyse'))!.definition).toBe('describe and explain in detail')
  })

  it('Sek I: eine Englischliste in der Zielsprache, nie der naturwissenschaftliche Kern', () => {
    for (const schulform of ['gymnasium', 'realschule', 'oberschule', 'integrierte-gesamtschule']) {
      const p = profilFuer('NI', 'englisch', 'sek1', schulform)!
      expect(p, schulform).toBeDefined()
      expect(p.fach, schulform).toBe('englisch')
      const namen = p.operatoren.map((o) => klein(o.name))
      for (const m of MINT) expect(namen, `${schulform}: ${m}`).not.toContain(m)
      expect(p.quelle, schulform).not.toMatch(/acht gelesenen Länderlisten/)
      // Seit 1.8.2026: Kerncurriculum Englisch für alle Schulformen des Sekundarbereichs I, Anhang „Operatoren und Arbeitsanweisungen"
      expect(istBelegt(p), schulform).toBe(true)
      expect(p.quelle, schulform).toMatch(/Kerncurriculum Englisch/)
      expect(namen.some((n) => n.startsWith('describe')), schulform).toBe(true)
    }
  })

  it('Klassenarbeit und Lernzielkontrolle nennen dieselbe Fundstelle', () => {
    const ka = amtlicheListe('NI', 'englisch', { sprache: 'en', stufe: 'sek2' })!
    const lzk = profilFuer('NI', 'englisch', 'sek2')!
    expect(lzk.quelle.split('; ').some((q) => ka.quelle.includes(q.slice(0, 40)))).toBe(true)
  })
})

describe('Jedes Land × Kernfach × Stufe', () => {
  it('liefert eine Liste DESSELBEN Fachs', () => {
    for (const st of STATES)
      for (const fach of KERNFAECHER)
        for (const stufe of ['sek1', 'sek2'] as const) {
          const k = `${st.id}/${fach}/${stufe}`
          const p = profilFuer(st.id, fach, stufe, 'gymnasium')
          expect(p, k).toBeDefined()
          // Fach „alle" nur als ausdrücklich fächerübergreifende Landesliste (Sachsen) – nie bei Fremdsprachen
          if (p!.fach === 'alle') expect(FREMDSPRACHEN, k).not.toContain(fach)
          else expect(p!.fach, k).toBe(fach)
          expect(p!.operatoren.length, k).toBeGreaterThan(3)
        }
  })

  it('kein MINT-Operator bei Fremdsprachen – in keinem Land, keiner Stufe, keiner Schulform', () => {
    for (const st of STATES)
      for (const fach of FREMDSPRACHEN)
        for (const stufe of ['sek1', 'sek2'] as const)
          for (const sf of ['gymnasium', 'realschule', 'hauptschule', undefined]) {
            const p = profilFuer(st.id, fach, stufe, sf)!
            // Die Operatoren selbst – deutsche Entsprechungen als Nebenform („delineate" = skizzieren, Hessen) sind kein Fehler
            const namen = p.operatoren.map((o) => klein(o.name))
            for (const m of MINT) expect(namen, `${st.id}/${fach}/${stufe}/${sf}: ${m}`).not.toContain(m)
          }
  })

  it('der alte fächerübergreifende Rückfall erscheint nirgends mehr', () => {
    for (const st of STATES)
      for (const fach of KERNFAECHER)
        for (const stufe of ['sek1', 'sek2'] as const) {
          const p = profilFuer(st.id, fach, stufe)!
          expect(p.quelle, `${st.id}/${fach}/${stufe}`).not.toMatch(/acht gelesenen Länderlisten/)
        }
  })

  it('nur Listen des Landes oder des Landesverweises gelten als belegt; alles andere ohne Definitionen', () => {
    for (const st of STATES)
      for (const fach of KERNFAECHER)
        for (const stufe of ['sek1', 'sek2'] as const) {
          const p = profilFuer(st.id, fach, stufe)!
          if (istBelegt(p)) continue
          expect(
            p.operatoren.every((o) => o.definition === ''),
            `${st.id}/${fach}/${stufe}`
          ).toBe(true)
          expect(p.hinweis, `${st.id}/${fach}/${stufe}`).toBeTruthy()
        }
  })
})

describe('Schulform', () => {
  it('Niedersachsen, Naturwissenschaften Sek I: Realschule bekommt ihr Kerncurriculum, nicht das des Gymnasiums', () => {
    expect(profilFuer('NI', 'biologie', 'sek1', 'realschule')!.quelle).toMatch(/Hauptschule und die Realschule/)
    expect(profilFuer('NI', 'biologie', 'sek1', 'gymnasium')!.quelle).toMatch(/Gymnasium/)
  })

  it('Bayern, Mathematik Sek I: das Gymnasium bekommt nicht die Mittelschulliste', () => {
    expect(profilFuer('BY', 'mathematik', 'sek1', 'gymnasium')!.quelle).toMatch(/Gymnasium/)
    expect(profilFuer('BY', 'mathematik', 'sek1', 'mittelschule')!.quelle).toMatch(/Mittelschule/)
  })
})

describe('operatorenAuswahl', () => {
  it('nimmt nie die Liste eines anderen Fachs', () => {
    for (const st of [...STATES.map((s) => s.id)])
      for (const fach of KERNFAECHER)
        for (const stufe of ['sek1', 'sek2'] as const) {
          const a = operatorenAuswahl({ stateId: st, fach, stufe })
          if (a) for (const l of a.listen) expect(l.faecher, `${st}/${fach}/${stufe}`).toContain(fach)
        }
  })

  it('fällt für ein Land ohne eigene Englischliste auf den IQB-Grundstock Englisch zurück', () => {
    const a = operatorenAuswahl({ stateId: 'XX', fach: 'englisch', stufe: 'sek2' })!
    expect(a.herkunft).toBe('kmk')
    expect(a.sprache).toBe('en')
    expect(a.quelle).toMatch(/Englisch/)
  })

  it('nimmt keine Fassung, die erst später gilt (NI Spanisch ab Abitur 2029)', () => {
    const a = operatorenAuswahl({ stateId: 'NI', fach: 'spanisch', stufe: 'sek2', heute: new Date('2026-09-30') })!
    expect(a.quelle).not.toMatch(/ab 2029/)
    expect(a.quelle).toMatch(/Spanisch/)
  })

  it('lässt abgelöste Fassungen weg (Grundstock „letztmalig Prüfungsjahr 2026")', () => {
    const alt = BESTAND.KMK.listen.find((l) => /letztmalig Prüfungsjahr 2026/.test(l.quelle))!
    expect(abgeloest(alt, new Date('2026-09-30'))).toBe(true)
    expect(abgeloest(alt, new Date('2026-03-01'))).toBe(false)
    const a = operatorenAuswahl({ stateId: 'XX', fach: 'englisch', stufe: 'sek2', heute: new Date('2026-09-30') })!
    expect(a.listen.some((l) => /letztmalig/.test(l.quelle))).toBe(false)
  })

  it('Klausur-Anlage: nur Listen des Landes (nurLand)', () => {
    expect(operatorenAuswahl({ stateId: 'XX', fach: 'englisch', stufe: 'sek2', nurLand: true })).toBeNull()
  })

  it('eine fächerübergreifende deutsche Liste gilt nicht für eine Fremdsprache', () => {
    // Sachsen, Mittelschule 2008: Abschnitt „alle Fächer" – für Englisch zählt die zielsprachige Liste
    const a = operatorenAuswahl({ stateId: 'SN', fach: 'englisch', stufe: 'sek1' })!
    expect(a.sprache).toBe('en')
  })
})
