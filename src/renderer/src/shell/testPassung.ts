/**
 * Welche vorhandenen Tests passen zu einem Termin? (29.10.2026, Befund der Lehrkraft: „Es werden Vokabeltests empfohlen,
 * die weder zur Lerngruppe passen – 5. Klasse erhält Green Line 2 –, noch zu den freigeschalteten Vokabeln.") Vorher
 * entschieden Stichwörter wie „Unit 2" im Titel – das traf jeden Band. Jetzt nach Inhalt:
 *  - Vokabeltest: Anteil seiner Wörter, die die Lerngruppe schon freigeschaltet hat (ab 60 % und mindestens 3 Wörtern);
 *    Wörter der Termin-Abschnitte zählen für die Reihenfolge zusätzlich.
 *  - Grammatiktest: fragt mindestens eine Grammatik des Termins ab.
 *  - Onlinetest: für dieselbe Lerngruppe angelegt.
 */
import type { TestApp } from '@shared/testMaterial'

export interface Passung {
  passt: boolean
  /** Für die Reihenfolge (höher = besser) */
  wert: number
  grund: string
}

export interface TerminDaten {
  woerter: { term: string }[]
  freigeschaltet: string[]
  grammatik: string[]
  gruppe: string
}

/** Wortvergleich: Kleinschreibung, ohne Satzzeichen und „to "/Artikel am Anfang */
export const wortSchluessel = (s: string): string =>
  s
    .toLocaleLowerCase('de')
    .replace(/[.,;:!?()"'„“”‘’]/g, ' ')
    .replace(/^\s*(to|the|a|an|le|la|les|l|el|los|las|un|une|der|die|das)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()

export const AB_ANTEIL = 0.6

/** Passung eines Vokabeltests aus seinen Wörtern */
export function vokabelPassung(test: readonly string[], t: Pick<TerminDaten, 'woerter' | 'freigeschaltet'>): Passung {
  const frei = new Set(t.freigeschaltet.map(wortSchluessel))
  const imTest = new Set(t.woerter.map((w) => wortSchluessel(w.term)))
  const w = [...new Set(test.map(wortSchluessel).filter(Boolean))]
  if (w.length < 3) return { passt: false, wert: 0, grund: 'zu wenige Wörter' }
  const anteil = w.filter((x) => frei.has(x)).length / w.length
  const termin = imTest.size ? w.filter((x) => imTest.has(x)).length / w.length : 0
  return {
    passt: anteil >= AB_ANTEIL,
    wert: anteil + termin / 2,
    grund: `${Math.round(anteil * 100)} % der Wörter freigeschaltet${termin ? ` · ${Math.round(termin * 100)} % aus dem Termin` : ''}`
  }
}

/** Passung eines Grammatiktests aus seinen Katalog-Kennungen */
export function grammatikPassung(kennungen: readonly string[], t: Pick<TerminDaten, 'grammatik'>): Passung {
  const themen = new Set(t.grammatik.map((k) => k.split('/')[0]))
  const genau = new Set(t.grammatik)
  const treffer = kennungen.filter((k) => genau.has(k) || themen.has(k.split('/')[0])).length
  return treffer ? { passt: true, wert: treffer, grund: 'fragt Grammatik des Termins ab' } : { passt: false, wert: 0, grund: '' }
}

/** Alle Kandidaten bewerten – Inhalte der Tests werden dafür gelesen (höchstens `grenze` je App) */
export async function bewerteTests(
  kandidaten: readonly { moduleId: TestApp; docId: string; gruppe?: string }[],
  t: TerminDaten,
  grenze = 80
): Promise<Map<string, Passung>> {
  const aus = new Map<string, Passung>()
  const schluessel = (x: { moduleId: string; docId: string }): string => `${x.moduleId}:${x.docId}`
  const vok = kandidaten.filter((x) => x.moduleId === 'vokabeltest').slice(0, grenze)
  const gram = kandidaten.filter((x) => x.moduleId === 'grammatiktest').slice(0, grenze)
  await Promise.all([
    ...vok.map(async (x) => {
      try {
        const p = (await window.api.tests.get(x.docId)).payload as { vocab?: { term: string }[] }
        aus.set(schluessel(x), vokabelPassung((p.vocab ?? []).map((v) => v.term), t))
      } catch {
        /* nicht lesbar: nicht passend */
      }
    }),
    ...gram.map(async (x) => {
      try {
        const p = (await window.api.grammarTests.get(x.docId)).payload as { meta?: { topics?: string[]; teilformen?: string[] } }
        aus.set(schluessel(x), grammatikPassung([...(p.meta?.topics ?? []), ...(p.meta?.teilformen ?? [])], t))
      } catch {
        /* nicht lesbar */
      }
    })
  ])
  for (const x of kandidaten.filter((k) => k.moduleId === 'onlinetest'))
    aus.set(
      schluessel(x),
      x.gruppe && t.gruppe && x.gruppe.trim() === t.gruppe.trim() ? { passt: true, wert: 1, grund: 'für diese Lerngruppe' } : { passt: false, wert: 0, grund: '' }
    )
  return aus
}
