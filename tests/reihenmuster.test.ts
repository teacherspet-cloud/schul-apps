import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import type { Reihe } from '../src/shared/reihe'
import { FAECHER } from '../src/shared/faecher'
import { musterStufe, REIHENMUSTER, reihenmusterFuer, stufenHinweis } from '../src/shared/reihenmuster'
import { planAnfrage, planeReihe, type PlanRoh } from '../src/renderer/src/modules/unterrichtsreihe/reihePlanungKi'
import { reihenmusterZeilen } from '../src/renderer/src/modules/unterrichtsreihe/planungDidaktik'
import {
  behebeReihenmuster,
  nimmtLeitfrageAuf,
  pruefeReihenmuster,
  RISU_HINWEIS
} from '../src/renderer/src/modules/unterrichtsreihe/reihenmusterPruefung'

/* Fachtypische Reihenmuster (08.10.2026): Daten, Anfrage, Gegencheck mit Selbstreparatur */

type RohSchritt = PlanRoh['teile'][number]['schritte'][number]
const S = (titel: string, art: string, stunde: number, beschreibung = '', extra: Partial<RohSchritt> = {}): RohSchritt => ({
  titel,
  art,
  rolle: 'pflicht',
  stunde,
  minuten: 20,
  beschreibung,
  lernziele: [],
  material: '',
  begruendung: '',
  ...extra
})

const reihe: Reihe = {
  id: 'r1',
  titel: 'Julikrise',
  fachId: 'geschichte',
  fachLabel: 'Geschichte',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 9,
  oberthema: 'Erster Weltkrieg',
  lernziele: [],
  schritte: [],
  stunden: ['einzel', 'doppel', 'einzel']
}

describe('Daten der Reihenmuster', () => {
  const ids = new Set(FAECHER.map((f) => f.id))
  it('jedes Fach gibt es im Fächerkatalog, keins doppelt', () => {
    const alle = REIHENMUSTER.flatMap((m) => m.faecher)
    for (const f of alle) expect(ids.has(f), f).toBe(true)
    expect(new Set(alle).size).toBe(alle.length)
    expect(new Set(REIHENMUSTER.map((m) => m.id)).size).toBe(REIHENMUSTER.length)
  })

  it('die abgestimmten Fachfamilien haben ein Muster', () => {
    for (const f of [
      'geschichte',
      'politik',
      'wirtschaft',
      'gesellschaftslehre',
      'erdkunde',
      'religion',
      'ethik',
      'werte-und-normen',
      'philosophie',
      'deutsch',
      'englisch',
      'franzoesisch',
      'spanisch',
      'russisch',
      'chinesisch',
      'latein',
      'griechisch',
      'daz',
      'mathematik',
      'biologie',
      'chemie',
      'physik',
      'naturwissenschaften',
      'informatik',
      'technik',
      'arbeitslehre',
      'kunst',
      'musik',
      'sport',
      'sachunterricht'
    ])
      expect(reihenmusterFuer(f), f).toBeDefined()
    // Alle modernen Fremdsprachen teilen ein Muster und haben einen GER-Hinweis
    const fs = reihenmusterFuer('englisch')!
    for (const f of FAECHER.filter((x) => x.art === 'fremdsprache')) {
      expect(reihenmusterFuer(f.id)).toBe(fs)
      expect(fs.fachHinweise?.[f.id], f.id).toBeTruthy()
    }
  })

  it('keine leeren Felder; jedes Muster hat harte Regeln; Belege mit URL', () => {
    for (const m of REIHENMUSTER) {
      const listen = [m.einstiege, m.ungeeigneteEinstiege, m.materialarten, m.methoden, m.sicherung, m.abschlussprodukte, m.nieRegeln]
      for (const l of listen) {
        expect(l.length, m.id).toBeGreaterThan(0)
        for (const e of l) expect(e.trim(), m.id).not.toBe('')
      }
      expect(m.reihentypen.length, m.id).toBeGreaterThan(0)
      for (const t of m.reihentypen) {
        expect(t.id && t.label, m.id).toBeTruthy()
        expect(t.phasen.length, `${m.id}/${t.id}`).toBeGreaterThanOrEqual(3)
        if (t.beleg) expect(t.beleg).toMatch(/^https:\/\//)
      }
      expect(new Set(m.reihentypen.map((t) => t.id)).size, m.id).toBe(m.reihentypen.length)
      expect(m.lernkartenNutzung.trim(), m.id).not.toBe('')
      expect(Object.keys(m.stufenUnterschiede).length, m.id).toBeGreaterThan(0)
      for (const v of Object.values(m.stufenUnterschiede)) expect(String(v).trim(), m.id).not.toBe('')
      for (const v of Object.values(m.schulformHinweise)) expect(String(v).trim(), m.id).not.toBe('')
      expect(m.nieRegeln.some((r) => /Lernkarten/.test(r)), m.id).toBe(true)
      expect(m.belege.length, m.id).toBeGreaterThan(0)
      for (const b of m.belege) {
        expect(b.url, m.id).toMatch(/^https:\/\//)
        expect(b.aussage.trim(), m.id).not.toBe('')
      }
    }
  })

  it('Sekundarfächer haben alle vier Stufen, Sachunterricht die Grundschule', () => {
    for (const m of REIHENMUSTER.filter((x) => x.id !== 'sachunterricht'))
      for (const s of ['5/6', '7/8', '9/10', 'Oberstufe'] as const) expect(m.stufenUnterschiede[s], `${m.id} ${s}`).toBeTruthy()
    expect(reihenmusterFuer('sachunterricht')!.stufenUnterschiede.Grundschule).toBeTruthy()
    expect(musterStufe(3)).toBe('Grundschule')
    expect(musterStufe(9)).toBe('9/10')
    expect(musterStufe(12)).toBe('Oberstufe')
    // Fehlt die Stufe, gilt die nächstgelegene
    expect(stufenHinweis(reihenmusterFuer('sachunterricht')!, 9)?.stufe).toBe('5/6')
  })
})

describe('Muster in der Planungsanfrage', () => {
  it('Geschichte, Klasse 9, Gymnasium NI: Reihentypen, Phasen als Funktionen, Stufe, Schulform, harte Regeln, Leitfrage', () => {
    const a = planAnfrage(reihe, { auszug: [], quelle: '' }, [])
    expect(a.user).toContain('FACHTYPISCHES REIHENMUSTER (Geschichte, Stufe 9/10, Gymnasium)')
    expect(a.user).toContain('leitfrage-urteil: Leitfrage → Quellen → Sachurteil → Werturteil')
    expect(a.user).toContain('keine starre Reihenfolge')
    expect(a.user).toContain('NS und Holocaust')
    expect(a.user).toContain('Schulform: Längere Textquellen')
    expect(a.user).toContain('NIE (harte Regeln')
    expect(a.user).toContain('Nie das Werturteil vor dem Sachurteil.')
    expect(a.user).toContain('Beutelsbacher Konsens')
    expect(a.user).toContain('Formuliere in "leitfrage" EINE Leitfrage')
    expect(a.user).toContain('Der LETZTE Schritt der Reihe nimmt die Leitfrage ausdrücklich auf')
  })

  it('gewählter Reihentyp und Leitfrage der Lehrkraft gehen vor', () => {
    const a = planAnfrage({ ...reihe, reihentyp: 'laengsschnitt', leitfrage: 'Wie wurde Frieden gemacht?' }, { auszug: [], quelle: '' }, [])
    expect(a.user).toContain('REIHENTYP (von der Lehrkraft gewählt – "reihentyp" = "laengsschnitt")')
    expect(a.user).not.toContain('leitfrage-urteil:')
    expect(a.user).toContain('übernimm sie wörtlich in "leitfrage"')
  })

  it('Fremdsprache mit GER-Hinweis; Fach ohne Muster ohne Musterzeilen', () => {
    const z = reihenmusterZeilen({ ...reihe, fachId: 'russisch', fachLabel: 'Russisch', grade: 7 }).join('\n')
    expect(z).toContain('Kyrillisch')
    expect(z).toContain('Stufe 7/8')
    expect(reihenmusterZeilen({ ...reihe, fachId: 'paedagogik', fachLabel: 'Pädagogik' })).toEqual([])
  })
})

describe('Gegencheck nach der Planung', () => {
  const k = { fachId: 'geschichte' }
  const plan = (schritte: RohSchritt[][], leitfrage = 'Warum kam es zum Krieg?'): PlanRoh => ({
    leitfrage,
    hinweis: '',
    teile: schritte.map((s, i) => ({ name: `Teil ${i + 1}`, schritte: s }))
  })

  it('Lernkarten als erster Schritt: Verstoß und feste Reparatur hinter die erste Erarbeitung', () => {
    const d = plan([
      [S('Begriffe', 'lernkarten', 1), S('Einstieg: Das Attentat', 'aufgabe', 1, 'Bildimpuls')],
      [S('Quellen zur Julikrise', 'arbeitsblatt', 2, 'Quellen analysieren'), S('Antwort', 'aufgabe', 3, 'Beantworte die Leitfrage')]
    ])
    const v = pruefeReihenmuster(d, k)
    expect(v.map((x) => x.code)).toEqual(['einstieg'])
    const f = behebeReihenmuster(d, k)
    const titel = f.plan.teile.flatMap((t) => t.schritte.map((s) => s.titel))
    expect(titel).toEqual(['Einstieg: Das Attentat', 'Quellen zur Julikrise', 'Begriffe', 'Antwort'])
    // Stunde wie die Erarbeitung, Teil wie dort
    expect(f.plan.teile[1].schritte[1]).toMatchObject({ titel: 'Begriffe', stunde: 2 })
    expect(pruefeReihenmuster(f.plan, k)).toEqual([])
    expect(f.behoben.join(' ')).toContain('„Begriffe" hinter die erste Erarbeitung verschoben')
    // Eingabe unverändert
    expect(d.teile[0].schritte[0].titel).toBe('Begriffe')
  })

  it('Lernkarten vor jeder Erarbeitung (nach dem Einstieg) und Begriffsdefinition als Einstieg', () => {
    const d = plan([[S('Impuls', 'aufgabe', 1), S('Karten', 'lernkarten', 1), S('Blatt', 'arbeitsblatt', 2), S('Schluss', 'aufgabe', 2, 'Leitfrage beantworten')]])
    expect(pruefeReihenmuster(d, k).map((x) => x.code)).toEqual(['lernkarten-frueh'])
    expect(behebeReihenmuster(d, k).plan.teile[0].schritte.map((s) => s.titel)).toEqual(['Impuls', 'Blatt', 'Karten', 'Schluss'])
    const def = plan([[S('Fachbegriffe klären', 'aufgabe', 1, 'Definitionen der Begriffe lernen'), S('Blatt', 'arbeitsblatt', 1), S('Schluss', 'aufgabe', 1, 'zur Leitfrage')]])
    expect(pruefeReihenmuster(def, k).map((x) => x.code)).toEqual(['einstieg'])
  })

  it('fehlende Leitfrage und fehlender Rückbezug', () => {
    const d = plan([[S('Impuls', 'aufgabe', 1), S('Blatt', 'arbeitsblatt', 1, 'Quellen'), S('Plakat', 'abschluss', 2, 'Plakat gestalten')]], '')
    expect(pruefeReihenmuster(d, k).map((x) => x.code)).toEqual(['leitfrage-fehlt', 'leitfrage-rueckbezug'])
    // Ohne Leitfrage bleibt das offen; mit Leitfrage der Lehrkraft behebt die App beides
    expect(behebeReihenmuster(d, k).offen.join(' ')).toContain('keine Leitfrage')
    const f = behebeReihenmuster(d, { ...k, leitfrage: 'Wer war schuld?' })
    expect(f.plan.leitfrage).toBe('Wer war schuld?')
    expect(f.plan.teile[0].schritte[2].beschreibung).toContain('Rückbezug auf die Leitfrage „Wer war schuld?"')
    expect(pruefeReihenmuster(f.plan, k)).toEqual([])
    // Letzter Schritt ist vorhandenes Material: eigener Schritt „Zurück zur Leitfrage"
    const m = plan([[S('Impuls', 'aufgabe', 1), S('Blatt', 'arbeitsblatt', 1, '', { material: 'blatt-1' })]])
    const fm = behebeReihenmuster(m, k)
    expect(fm.plan.teile[0].schritte.at(-1)).toMatchObject({ titel: 'Zurück zur Leitfrage', art: 'aufgabe', stunde: 1 })
    // Inhaltswörter der Leitfrage zählen als Rückbezug
    expect(nimmtLeitfrageAuf({ titel: 'Fazit', beschreibung: 'Warum begann der Krieg? Begründet antworten.' }, 'Warum begann der Erste Weltkrieg?')).toBe(true)
  })

  it('Chemie: Versuch ohne RiSU – Verstoß, Hinweis wird ergänzt', () => {
    const kc = { fachId: 'chemie' }
    const d = plan([[S('Brausetablette', 'aufgabe', 1, 'Was passiert?'), S('Schülerversuch', 'praesenz', 1, 'Versuch: Gas nachweisen'), S('Fazit', 'aufgabe', 2, 'Leitfrage beantworten')]])
    const v = pruefeReihenmuster(d, kc)
    expect(v.map((x) => x.code)).toEqual(['risu'])
    const f = behebeReihenmuster(d, kc)
    expect(f.plan.teile[0].schritte[1].beschreibung).toContain(RISU_HINWEIS)
    expect(pruefeReihenmuster(f.plan, kc)).toEqual([])
    // Geschichte kennt die RiSU-Prüfung nicht
    expect(pruefeReihenmuster(d, k)).toEqual([])
  })

  it('Politik: Urteil ohne Beutelsbacher Konsens; Sport: Praxis-Arbeitsblatt; Religion: Bekenntnis', () => {
    const pol = plan([[S('Fall', 'aufgabe', 1), S('Urteil', 'aufgabe', 1, 'Beurteile das Wahlalter 16 und nimm Stellung.'), S('Fazit', 'abschluss', 1, 'Leitfrage, Bewertungsraster')]])
    expect(pruefeReihenmuster(pol, { fachId: 'politik' }).map((x) => x.code)).toEqual(['beutelsbacher'])
    expect(behebeReihenmuster(pol, { fachId: 'politik' }).plan.teile[0].schritte[1].beschreibung).toContain('Beutelsbacher Konsens')
    const sp = plan([[S('Handstand', 'aufgabe', 1, 'Bewegungsaufgabe'), S('Übungsreihe Handstand', 'arbeitsblatt', 1, 'Üben an Stationen'), S('Fazit', 'aufgabe', 1, 'Leitfrage')]])
    expect(pruefeReihenmuster(sp, { fachId: 'sport' }).map((x) => x.code)).toEqual(['sport-blatt'])
    expect(behebeReihenmuster(sp, { fachId: 'sport' }).plan.teile[0].schritte[1].art).toBe('praesenz')
    expect(behebeReihenmuster(sp, { fachId: 'sport', art: 'digital' }).plan.teile[0].schritte[1].art).toBe('aufgabe')
    const rel = plan([[S('Gott?', 'aufgabe', 1, 'Glaubst du an Gott? Begründe.'), S('Psalm', 'arbeitsblatt', 1), S('Fazit', 'aufgabe', 1, 'Leitfrage')]])
    expect(pruefeReihenmuster(rel, { fachId: 'religion' }).map((x) => x.code)).toEqual(['bekenntnis'])
    expect(pruefeReihenmuster(behebeReihenmuster(rel, { fachId: 'religion' }).plan, { fachId: 'religion' })).toEqual([])
  })
})

describe('Gegencheck im Planungsauftrag (Attrappe statt KI)', () => {
  const kc = { auszug: [], quelle: '' }
  const schlecht: PlanRoh = {
    leitfrage: '',
    reihentyp: 'gibt-es-nicht',
    hinweis: 'Plenum.',
    teile: [{ name: 'Teil', schritte: [S('Begriffe', 'lernkarten', 1), S('Impuls', 'aufgabe', 1), S('Quellen', 'arbeitsblatt', 2), S('Test', 'aufgabe', 3)] }]
  }

  it('fragt einmal nach (gleicher Auftrag) und übernimmt die korrigierte Fassung', async () => {
    const anfragen: StructuredRequest[] = []
    const gut: PlanRoh = {
      leitfrage: 'Warum kam es zum Krieg?',
      reihentyp: 'leitfrage-urteil',
      hinweis: '',
      teile: [{ name: 'Teil', schritte: [S('Impuls', 'aufgabe', 1), S('Quellen', 'arbeitsblatt', 2), S('Begriffe', 'lernkarten', 2), S('Antwort', 'aufgabe', 3, 'Leitfrage beantworten')] }]
    }
    const antworten = [schlecht, gut]
    const ki = async <T,>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      return antworten.shift() as T
    }
    const meldungen: string[] = []
    const p = await planeReihe(reihe, kc, [], ki, '', '', (m) => meldungen.push(m))
    expect(anfragen.map((a) => a.schemaName)).toEqual(['reihe_planung', 'reihe_planung_reihenmuster'])
    expect(anfragen[1].user).toContain('BEFUND')
    expect(anfragen[1].user).toContain('Lernkarten-Schritt')
    expect(anfragen[1].user).toContain('BISHERIGER PLAN')
    expect(meldungen[0]).toContain('Reihenmuster')
    expect(p.leitfrage).toBe('Warum kam es zum Krieg?')
    expect(p.reihentyp).toBe('leitfrage-urteil')
    expect(p.gegencheck?.nachgefragt).toBe(true)
    expect(p.hinweis).toContain('Gegencheck Reihenmuster')
    // Schema verlangt Leitfrage und Reihentyp (Kennungen des Fachs)
    const schema = anfragen[0].schema as { required: string[]; properties: { reihentyp: { enum: string[] } } }
    expect(schema.required).toEqual(expect.arrayContaining(['leitfrage', 'reihentyp']))
    expect(schema.properties.reihentyp.enum).toContain('leitfrage-urteil')
  })

  it('hilft die Nachfrage nicht, behebt die App fest und meldet das im Hinweis; unbekannter Reihentyp fällt weg', async () => {
    const ki = async <T,>(): Promise<T> => JSON.parse(JSON.stringify(schlecht)) as T
    const p = await planeReihe({ ...reihe, leitfrage: 'Wer trägt die Verantwortung?' }, kc, [], ki)
    expect(p.schritte[0].titel).toBe('Impuls')
    expect(p.schritte.findIndex((s) => s.titel === 'Begriffe')).toBeGreaterThan(p.schritte.findIndex((s) => s.titel === 'Quellen'))
    expect(p.leitfrage).toBe('Wer trägt die Verantwortung?')
    expect(p.reihentyp).toBeUndefined()
    expect(p.schritte.at(-1)?.platzhalter?.beschreibung).toContain('Rückbezug auf die Leitfrage')
    expect(p.hinweis).toContain('von der App behoben')
    expect(p.gegencheck?.behoben.length).toBeGreaterThanOrEqual(2)
  })
})
