/**
 * Kurzvorschau eines Tests im Fenster „Test zum Termin" (28.10.2026): Wörter des Vokabeltests, Grammatik und Aufgabenzahl
 * des Grammatiktests, Art/Thema/Termin des Onlinetests. Nur lesen – die Tests selbst bleiben unberührt.
 */
import { holen } from '../modules/onlinetest/serverApi'
import { kennungLabel } from '../modules/grammatikformen/grammatikformen'
import type { TestApp } from '@shared/testMaterial'

export async function testVorschauZeilen(x: { moduleId: TestApp; docId: string }): Promise<string[]> {
  if (x.moduleId === 'vokabeltest') {
    const p = (await window.api.tests.get(x.docId)).payload as {
      vocab?: { term: string; translation: string }[]
      doc?: { variants?: unknown[]; header?: { title?: string } } | null
    }
    const woerter = p.vocab ?? []
    const fassungen = p.doc?.variants?.length ?? 0
    return [
      fassungen ? `${fassungen} Fassung${fassungen === 1 ? '' : 'en'} erstellt` : 'Noch kein Test erstellt – nur die Wortliste',
      `${woerter.length} Wörter:`,
      ...woerter.slice(0, 30).map((w) => `${w.term} – ${w.translation}`),
      ...(woerter.length > 30 ? [`… und ${woerter.length - 30} weitere`] : [])
    ]
  }
  if (x.moduleId === 'grammatiktest') {
    const p = (await window.api.grammarTests.get(x.docId)).payload as {
      meta?: { title?: string; topics?: string[]; teilformen?: string[]; minutes?: number }
      blocks?: unknown[]
    }
    const formen = [...(p.meta?.teilformen?.length ? p.meta.teilformen : (p.meta?.topics ?? []))]
    return [
      `${p.blocks?.length ?? 0} Aufgaben${p.meta?.minutes ? ` · ${p.meta.minutes} Minuten` : ''}`,
      formen.length ? 'Grammatik:' : 'Noch keine Grammatik gewählt',
      ...formen.map((k) => `• ${kennungLabel(k)}`)
    ]
  }
  const t = await holen<{ art?: string; thema?: string; termin?: string | null; status?: string; einstellungen?: { termin?: string; art?: string; thema?: string } }>(
    `/server/onlinetest/${x.docId}`
  )
  const art = t.art ?? t.einstellungen?.art ?? ''
  const thema = t.thema ?? t.einstellungen?.thema ?? ''
  const termin = t.termin ?? t.einstellungen?.termin ?? ''
  return [
    art ? `Art: ${art}` : '',
    thema ? `Thema: ${thema}` : '',
    termin ? `Termin: ${new Date(`${termin}T08:00:00`).toLocaleDateString('de-DE')}` : '',
    t.status ? `Stand: ${t.status === 'wartend' ? 'noch nicht gestartet' : t.status === 'offen' ? 'läuft' : 'beendet'}` : ''
  ].filter(Boolean)
}
