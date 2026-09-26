// Bereichsnamen aus Lehrplantexten (Paket 13) – und welche Bäume die Automatik mit der echten
// Lehrplandatei Niedersachsen (resources/lehrplaene/NI.json) aus realistischen Materialien baut.
//
// Gemeldet von der Lehrkraft (26.09.2026): Die Automatik legte Bereiche mit Kompetenzsätzen als
// Namen an („lineare Funktionen … analysieren …").
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { bereichsName, istKompetenzsatz, lehrplanSchulform, MAX_WOERTER, pruefeLehrplan } from '../src/shared/lehrplan'
import { kinderVon, leereThemen, materialSchluessel, uebernehmen, zuordnen, type ThemenDaten } from '../src/shared/themen'
import { automatischEinsortieren, type ThemenMaterial } from '../src/renderer/src/shared/themenVorschlag'
import { katalogBaum, katalogFuer, type KatalogKnoten } from '../src/renderer/src/shared/themenKatalog'

const NI = pruefeLehrplan(JSON.parse(readFileSync(resolve(__dirname, '../resources/lehrplaene/NI.json'), 'utf8')), 'NI')!

describe('bereichsName', () => {
  it('kürzt lange amtliche Titel und behält den Wortlaut', () => {
    const t = 'Entwicklung der Medien seit dem Zeitalter der Hochkulturen bis in die Gegenwart (Längsschnitt)'
    expect(bereichsName(t)).toEqual({ name: 'Entwicklung der Medien', wortlaut: t })
    expect(bereichsName('Geschichte der Nutzung von Energie (Längsschnitt)')?.name).toBe('Geschichte der Nutzung von Energie')
    expect(bereichsName('Die Welt des Spätmittelalters zwischen Krise und Aufbruch in die Neuzeit')?.name).toBe('Die Welt des Spätmittelalters')
    expect(bereichsName('Inhaltsbereich QP 1 – Leben und Energie')?.name).toBe('Leben und Energie')
    expect(bereichsName('Wahlmodul Akustik')?.name).toBe('Akustik')
  })

  it('Doppelpunkt und Gedankenstrich: der Teil, der nach Thema klingt', () => {
    expect(bereichsName('Der Erste Weltkrieg: nationale und internationale Perspektiven')?.name).toBe('Der Erste Weltkrieg')
    expect(bereichsName('Ein eingespieltes Team: Atmungsorgane und Blutkreislaufsystem')?.name).toBe('Atmungsorgane und Blutkreislaufsystem')
    expect(bereichsName('Die europäische Einigung – eine Erfolgsgeschichte?')?.name).toBe('Die europäische Einigung')
  })

  it('Kompetenzsätze werden gekürzt oder abgelehnt – nie Ordnername', () => {
    // Der gemeldete Fall
    expect(bereichsName('lineare Funktionen und lineare Gleichungen analysieren und vergleichen')).toBeNull()
    expect(bereichsName('lineare Gleichungen lösen')?.name).toBe('Lineare Gleichungen')
    expect(bereichsName('Winkel schätzen, messen und zeichnen')?.name).toBe('Winkel')
    expect(bereichsName('mit Brüchen rechnen')).toBeNull()
    expect(bereichsName('vorab Hypothesen aufstellen')).toBeNull()
    expect(bereichsName('beschreiben die Daten mithilfe von relativer Häufigkeit')).toBeNull()
    expect(bereichsName('Enzyme steuern Lebensvorgänge in Zellen und ermöglichen Stoffwechsel')).toBeNull()
    expect(bereichsName('Wechselbeziehungen zwischen Organismen und Lebensraum bilden Ökosysteme; Biodiversität')).toBeNull()
    expect(bereichsName('Fakultative Erweiterungen')).toBeNull()
  })

  it('kurze Überschriften mit Verb bleiben (Themenfelder der Kerncurricula)', () => {
    expect(bereichsName('Nach Gott fragen')?.name).toBe('Nach Gott fragen')
    expect(bereichsName('Leben braucht Energie')?.name).toBe('Leben braucht Energie')
    expect(bereichsName('Erster Weltkrieg')).toEqual({ name: 'Erster Weltkrieg' })
  })

  it('über die ganze Datei NI: kein Bereichsname ist Kompetenzsatz oder länger als die Schwelle', () => {
    const alle: string[] = []
    const gehe = (u: { thema: string; unterthemen?: unknown[] }[] | undefined): void => {
      for (const x of u ?? []) {
        alle.push(x.thema)
        gehe(x.unterthemen as never)
      }
    }
    for (const e of NI.eintraege) {
      alle.push(e.thema)
      gehe(e.unterthemen)
    }
    expect(alle.length).toBeGreaterThan(5000)
    const namen = alle.map(bereichsName).filter((n): n is NonNullable<typeof n> => n !== null)
    for (const n of namen) {
      expect(istKompetenzsatz(n.name), n.name).toBe(false)
      expect(n.name.split(/\s+/).length, n.name).toBeLessThanOrEqual(MAX_WOERTER)
    }
    // Von den 66 langen Oberthemen bleibt der Großteil als Kurzform erhalten
    const lang = NI.eintraege.filter((e) => e.thema.split(/\s+/).length > MAX_WOERTER)
    expect(lang.filter((e) => bereichsName(e.thema)).length / lang.length).toBeGreaterThan(0.6)
  })

  it('kein Unterbereich heißt wie sein Oberbereich („Lineare Zusammenhänge" › „Lineare Zusammenhänge")', () => {
    const doppelt: string[] = []
    const gehe = (k: KatalogKnoten[], eltern: string): void => {
      for (const x of k) {
        if (x.name.toLocaleLowerCase('de') === eltern.toLocaleLowerCase('de')) doppelt.push(x.name)
        gehe(x.kinder, x.name)
      }
    }
    for (const fach of new Set(NI.eintraege.map((e) => e.fach))) gehe(katalogBaum(fach, NI, 'gymnasium'), '')
    expect(doppelt).toEqual([])
  })

  it('Schulform der App → Schulform der Lehrplandatei', () => {
    expect(lehrplanSchulform('gymnasium')).toBe('gymnasium')
    expect(lehrplanSchulform('oberschule')).toBe('integriert')
    expect(lehrplanSchulform('integrierte-gesamtschule')).toBe('integriert')
    expect(lehrplanSchulform('mittelschule')).toBe('hauptschule')
  })
})

// ---------- Realistische Materialien, NI Gymnasium ----------

let nr = 0
const mat = (moduleId: string, fachId: string, grade: number, name: string, thema = name, land = 'NI'): ThemenMaterial => ({
  moduleId,
  id: `m${++nr}`,
  name,
  thema,
  fachId,
  grade,
  land,
  schulform: 'gymnasium',
  updatedAt: '2026-09-26T10:00:00.000Z'
})

const MATERIALIEN: ThemenMaterial[] = [
  mat('arbeitsblatt', 'geschichte', 8, 'Julikrise 1914', 'Erster Weltkrieg'),
  mat('lernzielkontrolle', 'geschichte', 8, 'LZK Erster Weltkrieg', 'Erster Weltkrieg'),
  mat('klassenarbeit', 'geschichte', 9, 'Klassenarbeit Weimarer Republik', 'Weimarer Republik'),
  mat('arbeitsblatt', 'geschichte', 9, 'Krisenjahr 1923', 'Weimarer Republik'),
  mat('arbeitsblatt', 'geschichte', 12, 'Krisenherd Balkan', 'Der Balkan vor 1914'),
  mat('arbeitsblatt', 'mathematik', 8, 'Lineare Gleichungen lösen', 'Lineare Gleichungen'),
  mat('lernzielkontrolle', 'mathematik', 8, 'Lineare Zusammenhänge', 'Lineare Funktionen'),
  mat('klassenarbeit', 'mathematik', 8, 'Lineare Funktionen – Steigung und Achsenabschnitt', 'Lineare Zusammenhänge'),
  // Passt gleich gut zum Unterthema „Abgrenzung gegen nicht-lineare Zusammenhänge" – der ganz genannte Name gewinnt
  mat('arbeitsblatt', 'mathematik', 8, 'Lineare Zusammenhänge im Alltag', 'Lineare Zusammenhänge'),
  mat('arbeitsblatt', 'mathematik', 7, 'Laplace-Wahrscheinlichkeit', 'Wahrscheinlichkeit'),
  mat('grammatiktest', 'biologie', 8, 'Nahrungsnetze im Wald', 'Leben im Wald'),
  mat('arbeitsblatt', 'biologie', 8, 'Leben im Wald – Stockwerke', 'Leben im Wald'),
  mat('lernzielkontrolle', 'biologie', 7, 'Atmungsorgane und Blutkreislauf', 'Atmungsorgane und Blutkreislaufsystem'),
  mat('arbeitsblatt', 'biologie', 12, 'Zellatmung', 'Leben und Energie'),
  mat('klassenarbeit', 'biologie', 12, 'Fotosynthese', 'Leben und Energie'),
  // Ein Blatt für Bayern: Die Datei NI gilt dafür nicht (BY hat keine Datei → mitgebrachte Themen Bayerns)
  mat('arbeitsblatt', 'geschichte', 8, 'Erster Weltkrieg Bayern', 'Erster Weltkrieg', 'BY')
]

/** Baum eines Fachs als eingerückter Text – so, wie ihn die Bibliothek zeigt */
function baumText(d: ThemenDaten, fachId: string): string[] {
  const zeilen: string[] = []
  const gehe = (eltern: string | null, tiefe: number): void => {
    for (const b of kinderVon(d, fachId, eltern)) {
      const drin = Object.entries(d.zuordnungen)
        .filter(([, z]) => z.bereichId === b.id)
        .map(([k]) => MATERIALIEN.find((m) => materialSchluessel(m.moduleId, m.id) === k)!.name)
      zeilen.push(`${'  '.repeat(tiefe)}${b.name}${b.wortlaut ? ` [Wortlaut: ${b.wortlaut}]` : ''}${drin.length ? ` ← ${drin.join(', ')}` : ''}`)
      gehe(b.id, tiefe + 1)
    }
  }
  gehe(null, 0)
  return zeilen
}

describe('Automatik mit der Lehrplandatei NI', () => {
  const lehrplaene: Record<string, typeof NI | null> = { NI, BY: null }
  let z = 0
  const { zuordnungen, uebernahmen } = automatischEinsortieren(MATERIALIEN, leereThemen(), (fachId, m) =>
    katalogFuer(fachId, lehrplaene[m.land ?? 'NI'] ?? null, m.schulform, m.land)
  )
  const d = zuordnen(
    uebernehmen(leereThemen(), uebernahmen, [], () => `bereich${++z}`),
    zuordnungen
  )
  const baeume = Object.fromEntries(['geschichte', 'mathematik', 'biologie'].map((f) => [f, baumText(d, f)]))
  // Für den Bericht an die Lehrkraft: die entstandenen Bäume
  console.log(
    Object.entries(baeume)
      .map(([f, z]) => `${f}\n  ${z.join('\n  ')}`)
      .join('\n')
  )

  it('legt nur sinnvolle Namen an – keine Kompetenzsätze, keine Überlängen', () => {
    for (const b of d.bereiche) {
      expect(istKompetenzsatz(b.name), b.name).toBe(false)
      expect(b.name.split(/\s+/).length, b.name).toBeLessThanOrEqual(MAX_WOERTER)
    }
  })

  it('Sek I und Oberstufe getrennt: Klasse 8 unter „Erster Weltkrieg", Q-Phase unter „Der Erste Weltkrieg › Ursachen …"', () => {
    const g = baeume.geschichte.join('\n')
    expect(g).toMatch(/^Erster Weltkrieg ← Julikrise 1914, LZK Erster Weltkrieg$/m)
    expect(g).toMatch(/Der Erste Weltkrieg \[Wortlaut: Der Erste Weltkrieg: nationale und internationale Perspektiven\]/)
    expect(g).toMatch(/Krisenherd Balkan ← Krisenherd Balkan/)
  })

  it('Mathematik: lineare Funktionen und Gleichungen in Lehrplanbereichen, nie in einem Satz-Ordner', () => {
    const m = baeume.mathematik.join('\n')
    expect(m).toMatch(/^Lineare Zusammenhänge ← Lineare Zusammenhänge, Lineare Funktionen – Steigung und Achsenabschnitt, Lineare Zusammenhänge im Alltag$/m)
    // „Lineare Gleichungen" steht im KC unter „Elementare Termumformungen" – als Kurzform der Kompetenz „einfache lineare Gleichungen lösen"
    expect(m).toMatch(/^ {2}Lineare Gleichungen \[Wortlaut: einfache lineare Gleichungen lösen\] ← Lineare Gleichungen lösen$/m)
    expect(m).not.toMatch(/analysieren|vergleichen/)
  })

  it('Biologie: Einheiten der Themenfolge und Inhaltsbereiche der Oberstufe', () => {
    const b = baeume.biologie.join('\n')
    expect(b).toMatch(/^Leben im Wald ← /m)
    expect(b).toMatch(/^Leben und Energie \[Wortlaut: Inhaltsbereich QP 1 – Leben und Energie\] ← Zellatmung, Fotosynthese$/m)
    // Ein einzelnes Material zu einem flachen Thema bleibt ohne Ordner (Paket 12: erst ab zwei)
    expect(b).not.toMatch(/Atmungsorgane/)
  })

  it('das Blatt für Bayern bekommt keinen Bereich aus dem niedersächsischen Lehrplan', () => {
    const by = MATERIALIEN.find((m) => m.land === 'BY')!
    const bereich = d.zuordnungen[materialSchluessel(by.moduleId, by.id)]?.bereichId
    const b = d.bereiche.find((x) => x.id === bereich)
    expect(b?.wortlaut ?? '').not.toMatch(/nationale und internationale/)
    // Der bayerische Lehrplan (mitgebrachte Themen) führt den Ersten Weltkrieg nicht in Klasse 8
    expect(bereich).toBeUndefined()
  })
})
