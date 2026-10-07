/**
 * Tests aus der Reihe an beliebiger Stelle (06.10.2026, abgestimmt mit der Lehrkraft; Recherche Abschnitt 5 und 7.7):
 * „Test hier erstellen" zwischen zwei Schritten → Klassenarbeit, Lernzielkontrolle oder Vokabeltest.
 *
 *  - Grundlage sind ALLE Schritte bis zu dieser Stelle (Lernziele, Aufgaben, Wörter aus Lernkarten und Vokabelschritten),
 *    auf Wunsch 10–20 % Wiederholung früherer Reihen (Constructive Alignment: nur Behandeltes prüfen).
 *  - Der jeweilige Editor öffnet sich vorbefüllt (Stoff/Lernziele bzw. Wortliste); erzeugt wird dort wie gewohnt im
 *    Hintergrund. An der Stelle steht solange ein Platzhalter; ist der Test fertig, wird er dort zum Schritt
 *    (Onlinetest bzw. Präsenzschritt „schriftlich" für Klassenarbeiten).
 *  - Testaufgaben werden neu formuliert, nicht aus dem Buch kopiert (Hinweis im Auftrag an die KI).
 *  - Rückweg: Im Test-Editor führt „Zurück zur Reihe" wieder hierher (shared/navigation.ts, Rückweg).
 */
import { leererInhalt, neueSchrittId, SCHRITT_ARTEN, type Lernziel, type Reihe, type Schritt } from '@shared/reihe'
import type { Vokabel } from '@shared/vokabeltrainer'

export type TestZiel = 'klassenarbeit' | 'lernzielkontrolle' | 'vokabeltest'

export const TEST_ZIELE: { id: TestZiel; label: string; text: string }[] = [
  { id: 'lernzielkontrolle', label: 'Lernzielkontrolle', text: 'Kurz und formativ (15–25 min), AFB I–II – wird als Onlinetest ein Schritt der Reihe.' },
  { id: 'vokabeltest', label: 'Vokabeltest', text: 'Wörter aus den Lernkarten und Vokabelschritten bis hier – wird als Onlinetest ein Schritt.' },
  {
    id: 'klassenarbeit',
    label: 'Klassenarbeit',
    text: 'Alle Lernziele bis hier, AFB I–III, neue Kontexte – wird als Präsenzschritt „schriftlich" eingetragen.'
  }
]

export interface TestGrundlage {
  titel: string
  thema: string
  /** Stoff samt Auftrag an die KI – für die Felder „Inhalte"/„Stoff" der Editoren */
  stoff: string
  lernziele: Lernziel[]
  woerter: Pick<Vokabel, 'term' | 'translation' | 'example' | 'exampleTranslation'>[]
  /** Zahl der berücksichtigten Schritte */
  schritte: number
}

export interface Wiederholung {
  /** Anteil in Prozent (10–20) */
  anteil: number
  reihen: Pick<Reihe, 'titel' | 'oberthema' | 'lernziele'>[]
}

const kurz = (t: string, n: number): string => {
  const x = t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return x.length > n ? `${x.slice(0, n)} …` : x
}

/** Was ein Schritt behandelt – kurz für den Stoff */
function schrittInhalt(s: Schritt): string {
  if (s.platzhalter) return kurz(s.platzhalter.beschreibung, 220)
  const i = s.inhalt
  switch (i.art) {
    case 'arbeitsblatt':
      return i.aufgaben.length
        ? `Aufgaben: ${i.aufgaben
            .slice(0, 6)
            .map((a) => kurz(a.anweisung, 110))
            .join(' | ')}`
        : kurz(i.titel, 120)
    case 'aufgabe':
      return kurz([i.anweisung, ...i.fragen].join(' '), 220)
    case 'lernkarten':
      return `Begriffe: ${i.karten
        .slice(0, 20)
        .map((k) => k.vorne)
        .join(', ')}`
    case 'vokabeln':
      return `${i.woerter.length} Vokabeln${i.titel ? ` (${i.titel})` : ''}`
    case 'hefter':
      return `Merkkasten: ${kurz(i.text, 260)}`
    case 'abschluss':
    case 'praesenz':
    case 'sprechen':
      return kurz(i.anweisung, 200)
    default:
      return ''
  }
}

/** Die Grundlage eines Tests nach den ersten `bis` Schritten der Reihe */
export function testGrundlage(r: Reihe, bis: number, ziel: TestZiel, wiederholung?: Wiederholung): TestGrundlage {
  const vorher = r.schritte
    .slice(0, Math.max(0, bis))
    // Tests, Diagnosen und Selbsteinschätzungen sind kein Stoff
    .filter((s) => !s.test && !['diagnose', 'reflexion', 'onlinetest'].includes(s.inhalt.art))
  const ziele: Lernziel[] = []
  for (const l of vorher.flatMap((s) => s.lernziele)) if (!ziele.some((z) => z.text === l.text)) ziele.push(l)
  // Am Ende der Reihe (oder ohne Schritt-Lernziele) gelten die Lernziele der Reihe
  const lernziele = ziele.length && bis < r.schritte.length ? ziele : [...r.lernziele, ...ziele.filter((z) => !r.lernziele.some((x) => x.text === z.text))]
  const woerter: TestGrundlage['woerter'] = []
  const dazu = (w: TestGrundlage['woerter'][number]): void => {
    if (w.term.trim() && !woerter.some((x) => x.term.trim().toLowerCase() === w.term.trim().toLowerCase())) woerter.push(w)
  }
  for (const s of vorher) {
    if (s.inhalt.art === 'lernkarten') for (const k of s.inhalt.karten) dazu({ term: k.vorne, translation: k.hinten })
    if (s.inhalt.art === 'vokabeln')
      for (const v of s.inhalt.woerter as Vokabel[])
        dazu({ term: v.term, translation: v.translation, ...(v.example ? { example: v.example, exampleTranslation: v.exampleTranslation } : {}) })
  }
  const thema = r.oberthema || r.titel
  const art = TEST_ZIELE.find((t) => t.id === ziel)!.label
  const anteil = Math.min(20, Math.max(10, Math.round(wiederholung?.anteil ?? 15)))
  const auftrag =
    ziel === 'klassenarbeit'
      ? 'Klassenarbeit (summativ): alle Lernziele unten, Anforderungsbereiche I–III gemischt, Aufgaben analog zu den Übungsformaten der Reihe, aber mit NEUEN Texten und Kontexten.'
      : ziel === 'lernzielkontrolle'
        ? 'Lernzielkontrolle mitten in der Reihe (formativ): kurz, 1–2 Aufgaben je Lernziel, vorwiegend Anforderungsbereich I–II; keine Transferaufgabe, die noch nicht geübt wurde.'
        : 'Vokabeltest: nur Wörter, die in der Reihe bis hier geübt wurden.'
  const stoff = [
    `AUFTRAG: ${auftrag}`,
    'Prüfe nur, was in der Reihe bis zu dieser Stelle behandelt wurde. Formuliere alle Testaufgaben NEU – keine Aufgaben, Texte oder Beispielsätze wörtlich aus dem Schulbuch oder den Materialien der Reihe übernehmen.',
    `BEHANDELT IN DER REIHE „${r.titel}" (bis hier ${vorher.length} Schritte):`,
    ...vorher.map((s) => {
      const label = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label ?? s.inhalt.art
      const was = schrittInhalt(s)
      return `- ${s.titel || label} (${label})${was ? `: ${was}` : ''}`
    }),
    lernziele.length ? `LERNZIELE:\n${lernziele.map((l) => `- ${l.text}`).join('\n')}` : '',
    woerter.length && ziel !== 'vokabeltest'
      ? `WORTSCHATZ: ${woerter
          .slice(0, 60)
          .map((w) => `${w.term} – ${w.translation}`)
          .join('; ')}`
      : '',
    wiederholung?.reihen.length
      ? `WIEDERHOLUNG (etwa ${anteil} % der Aufgaben bzw. Punkte) aus früheren Reihen:\n${wiederholung.reihen
          .map((x) => `- ${x.titel}${x.oberthema ? ` (${x.oberthema})` : ''}: ${x.lernziele.map((l) => l.text).join('; ') || 'ohne Lernziele'}`)
          .join('\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
  return { titel: `${art}: ${thema}`, thema, stoff, lernziele, woerter, schritte: vorher.length }
}

/** Platzhalter an der Stelle des Tests – wird zum fertigen Schritt, sobald der Test erzeugt ist */
export function testPlatzhalter(ziel: TestZiel, docId: string, g: Pick<TestGrundlage, 'titel' | 'lernziele'>, abschnitt?: string): Schritt {
  const art = ziel === 'klassenarbeit' ? 'praesenz' : 'onlinetest'
  return {
    id: neueSchrittId(),
    titel: ziel === 'klassenarbeit' ? `${g.titel} (schriftlich)` : g.titel,
    lernziele: g.lernziele.slice(0, 10),
    rolle: 'pflicht',
    erfolg: ziel === 'klassenarbeit' ? { art: 'lehrkraft' } : { art: 'punkte', prozent: 60 },
    inhalt: leererInhalt(art),
    ...(abschnitt ? { abschnitt } : {}),
    platzhalter: { beschreibung: `Wird im Programm „${TEST_ZIELE.find((t) => t.id === ziel)!.label}" erstellt und erscheint hier, sobald er fertig ist.` },
    test: { modul: ziel, docId }
  }
}

/** Schritte mit dem Platzhalter hinter `nach` (null = ganz vorn) – im Teil des vorigen bzw. folgenden Schritts */
export function fuegeEin(schritte: Schritt[], nach: string | null, neu: Schritt): Schritt[] {
  const i = nach ? schritte.findIndex((s) => s.id === nach) + 1 : 0
  const nachbar = schritte[i - 1] ?? schritte[i]
  const s = { ...neu, ...(neu.abschnitt || !nachbar?.abschnitt ? {} : { abschnitt: nachbar.abschnitt }) }
  return [...schritte.slice(0, i), s, ...schritte.slice(i)]
}

// ---------------------------------------------------------------- Offene Tests merken (überlebt Schließen und Neustart)

export interface OffenerTest {
  modul: TestZiel
  docId: string
  reiheId: string
  schrittId: string
  zeit: number
}

const OFFEN_KEY = 'reihe-tests-offen'

export function offeneTests(): OffenerTest[] {
  try {
    const d = JSON.parse(localStorage.getItem(OFFEN_KEY) ?? '[]') as unknown
    return Array.isArray(d) ? (d as OffenerTest[]) : []
  } catch {
    return []
  }
}

export function setzeOffeneTests(liste: OffenerTest[]): void {
  try {
    // Nach 30 Tagen vergessen
    const grenze = Date.now() - 30 * 24 * 3600 * 1000
    localStorage.setItem(OFFEN_KEY, JSON.stringify(liste.filter((o) => o.zeit > grenze)))
  } catch {
    /* ohne lokalen Speicher bleibt der Platzhalter – „Zum Test" öffnet ihn trotzdem */
  }
}

/** Ein fertiger Auftrag gehört zu einem offenen Test, wenn er dessen Dokument (sperrend) erzeugt hat */
export function passenderTest(
  offen: OffenerTest[],
  a: { moduleId: string; docId: string; status: string; sperrt: boolean; ende?: number }
): OffenerTest | undefined {
  if (a.status !== 'fertig' || !a.sperrt) return undefined
  return offen.find((o) => o.modul === a.moduleId && o.docId === a.docId && (a.ende ?? Date.now()) >= o.zeit)
}
