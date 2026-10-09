/**
 * Kopf der Fachansicht in „Meine Klassen" (09.10.2026, abgestimmt mit der Lehrkraft: „Kopf + Reiter" wie die Kursseite
 * in Sprachenlernen): dieselbe ruhige Zeile mit Kennzahlen (shared/components/KennzahlenKopf.tsx) für JEDES Fach –
 * Lernende, Handlungsbedarf, Tests Ø, offene Blätter, laufende Reihen; in Sprachfächern dazu „Wörter sicher",
 * „aktiv diese Woche" und der nächste Vokabeltest. Klasse und Fach stehen schon in der Fach-Leiste darüber – deshalb
 * ohne eigenen Titel. Ein Klick auf eine Zahl führt in den passenden Reiter.
 */
import { IconAlertTriangle } from '@tabler/icons-react'
import { KennzahlenKopf, type Kennzahl } from '../../shared/components/KennzahlenKopf'

interface FachDaten {
  id: string
  sprachfach: boolean
  klassenKurs?: string | null
  lernende: unknown[]
  bedarf: unknown[]
  tests: { durchschnitt: number | null; status: string; offen: number }[]
  blaetter: { status: string }[]
  reihen: { status: string }[]
  vokabeln: { id: string; status: string; sicherSchnitt: number; aktiv7: number; lernende: number; testTermin: number | null; woerter: number }[]
}

const note = (x: number): string => x.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const kurzTag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })

/** Kennzahlen eines Fachs – rein rechnend (auch für Tests) */
export function fachKennzahlen(d: FachDaten, jetzt = Date.now()): {
  lernende: number
  bedarf: number
  testSchnitt: number | null
  tests: number
  zuPruefen: number
  blaetterOffen: number
  reihenOffen: number
  vokabeln: { sicher: number; aktiv: number; von: number; test: number | null } | null
} {
  const noten = d.tests.map((t) => t.durchschnitt).filter((x): x is number => x != null)
  const kurs = d.vokabeln.find((v) => v.id === d.klassenKurs) ?? d.vokabeln.find((v) => v.status === 'offen' && v.woerter > 0)
  const tests = d.vokabeln.map((v) => v.testTermin).filter((t): t is number => Boolean(t && t > jetzt - 86_400_000))
  return {
    lernende: d.lernende.length,
    bedarf: d.bedarf.length,
    testSchnitt: noten.length ? noten.reduce((a, b) => a + b, 0) / noten.length : null,
    tests: d.tests.length,
    zuPruefen: d.tests.reduce((s, t) => s + (t.offen || 0), 0),
    blaetterOffen: d.blaetter.filter((b) => b.status === 'offen').length,
    reihenOffen: d.reihen.filter((r) => r.status === 'offen').length,
    vokabeln: d.sprachfach && kurs ? { sicher: kurs.sicherSchnitt, aktiv: kurs.aktiv7, von: kurs.lernende, test: tests.length ? Math.min(...tests) : null } : null
  }
}

export function FachKopf({ d, gehe }: { d: FachDaten; gehe: (reiter: string) => void }): React.JSX.Element {
  const k = fachKennzahlen(d)
  const zumBedarf = (): void => {
    const el = document.querySelector<HTMLElement>(`[data-handlungsbedarf][data-gruppe="${CSS.escape(d.id)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const zahlen: Kennzahl[] = [
    ...(k.vokabeln
      ? [
          { id: 'sicher', label: 'Wörter sicher', wert: `${Math.round(k.vokabeln.sicher * 100)} %`, farbe: 'teal', klick: () => gehe('vokabeln') },
          { id: 'aktiv', label: 'aktiv diese Woche', wert: `${k.vokabeln.aktiv}/${k.vokabeln.von}`, klick: () => gehe('vokabeln') },
          ...(k.vokabeln.test ? [{ id: 'vokabeltest', label: 'nächster Vokabeltest', wert: kurzTag(k.vokabeln.test), klick: () => gehe('vokabeln') }] : [])
        ]
      : []),
    {
      id: 'tests',
      label: 'Tests Ø',
      wert: k.testSchnitt != null ? note(k.testSchnitt) : '–',
      zusatz: k.zuPruefen ? `${k.zuPruefen} zu prüfen` : `${k.tests} ${k.tests === 1 ? 'Test' : 'Tests'}`,
      klick: () => gehe('tests')
    },
    { id: 'blaetter', label: 'Blätter offen', wert: k.blaetterOffen, klick: () => gehe('reihen') },
    { id: 'reihen', label: 'Reihen laufend', wert: k.reihenOffen, klick: () => gehe('reihen') },
    { id: 'lernende', label: 'Lernende', wert: k.lernende, klick: () => gehe('lernende') },
    {
      id: 'bedarf',
      label: 'Handlungsbedarf',
      wert: k.bedarf,
      farbe: k.bedarf ? 'orange' : undefined,
      symbol: k.bedarf ? <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" /> : undefined,
      klick: zumBedarf
    }
  ]
  return <KennzahlenKopf zahlen={zahlen} data-fach-kopf={d.sprachfach ? 'sprache' : 'fach'} />
}
