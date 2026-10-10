/**
 * Kopf der Fachansicht in „Meine Klassen" (09.10.2026, abgestimmt mit der Lehrkraft: „Kopf + Reiter" wie die Kursseite
 * in Sprachenlernen): dieselbe ruhige Zeile mit Kennzahlen (shared/components/KennzahlenKopf.tsx) für JEDES Fach –
 * Lernende, Handlungsbedarf, Tests Ø, offene Blätter, laufende Reihen; in Sprachfächern dazu „Wörter sicher",
 * „aktiv diese Woche" und der nächste Vokabeltest. Klasse und Fach stehen schon in der Fach-Leiste darüber – deshalb
 * ohne eigenen Titel. Ein Klick auf eine Zahl führt in den passenden Reiter; „Handlungsbedarf" öffnet seit 10.10.2026 das
 * Pop-up mit den Einträgen nach Art (Handlungsbedarf.tsx) – der eigene Kasten darunter entfällt.
 *
 * Kompakt (10.10.2026, Wunsch der Lehrkraft): in Sprachklassen steht der Kasten klein neben „Lernstand im Karteikasten"
 * und „Units" und zeigt nur, was etwas sagt – „Wörter sicher" und „aktiv diese Woche" immer, alles andere nur mit Inhalt
 * (kein Test geplant → keine Test-Kachel, 0 offen → weg; „Lernende" steckt schon in „aktiv n von m"). Die beiden
 * Kernzahlen als Bild: „Wörter sicher" als Ring mit Prozent in der Mitte und „im Schnitt x von y Wörtern" darunter,
 * „aktiv diese Woche" als Reihe kleiner Punkte je Lernende (gefüllt = aktiv; ab 40 Lernenden ein Ring). Einen
 * Tagesverlauf der letzten 7 Tage liefert der Server nicht billig – deshalb keine Mini-Säulen.
 */
import { SimpleGrid, Text, UnstyledButton } from '@mantine/core'
import { FortschrittsRing } from '../../shared/components/diagramme'
import { IconAlertTriangle } from '@tabler/icons-react'
import { KennzahlenKopf, type Kennzahl } from '../../shared/components/KennzahlenKopf'
import { useBedarfFenster } from './Handlungsbedarf'

interface FachDaten {
  id: string
  sprachfach: boolean
  klassenKurs?: string | null
  lernende: unknown[]
  bedarf: unknown[]
  tests: { durchschnitt: number | null; status: string; offen: number }[]
  blaetter: { status: string }[]
  reihen: { status: string }[]
  vokabeln: {
    id: string
    status: string
    sicherSchnitt: number
    aktiv7: number
    lernende: number
    testTermin: number | null
    woerter: number
    heuteAktiv?: number
    probleme?: unknown[]
  }[]
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
  vokabeln: { sicher: number; aktiv: number; von: number; test: number | null; woerter: number; heute: number; probleme: number } | null
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
    vokabeln: d.sprachfach && kurs ? {
            sicher: kurs.sicherSchnitt,
            aktiv: kurs.aktiv7,
            von: kurs.lernende,
            test: tests.length ? Math.min(...tests) : null,
            woerter: kurs.woerter,
            heute: kurs.heuteAktiv ?? 0,
            probleme: kurs.probleme?.length ?? 0
          } : null
  }
}

/** Kompakt: nur Kacheln mit Aussage – die beiden Kernzahlen bleiben immer */
export function relevanteKennzahlen<T extends { id: string }>(zahlen: T[], k: ReturnType<typeof fachKennzahlen>): T[] {
  return zahlen.filter((z) => {
    switch (z.id) {
      case 'sicher':
      case 'aktiv':
        return true
      case 'probleme':
        return (k.vokabeln?.probleme ?? 0) > 0
      case 'vokabeltest':
        return Boolean(k.vokabeln?.test)
      case 'tests':
        return k.testSchnitt != null || k.zuPruefen > 0
      case 'blaetter':
        return k.blaetterOffen > 0
      case 'reihen':
        return k.reihenOffen > 0
      case 'bedarf':
        return k.bedarf > 0
      case 'lernende':
        return !k.vokabeln && k.lernende > 0
      default:
        return true
    }
  })
}

export function FachKopf({ d, gehe, kompakt = false }: { d: FachDaten; gehe: (reiter: string) => void; kompakt?: boolean }): React.JSX.Element {
  const k = fachKennzahlen(d)
  // Handlungsbedarf als Pop-up (10.10.2026, Entscheidung der Lehrkraft) – nach Art gruppiert, mit nächstem Schritt
  const zumBedarf = (): void => useBedarfFenster.getState().oeffne(d.id)
  const zahlen: Kennzahl[] = [
    ...(k.vokabeln
      ? [
          { id: 'sicher', label: 'Wörter sicher', wert: `${Math.round(k.vokabeln.sicher * 100)} %`, farbe: 'teal', klick: () => gehe('vokabeln') },
          { id: 'aktiv', label: 'aktiv diese Woche', wert: `${k.vokabeln.aktiv}/${k.vokabeln.von}`, klick: () => gehe('vokabeln') },
          ...(kompakt && k.vokabeln.probleme
            ? [{ id: 'probleme', label: 'Problemwörter', wert: k.vokabeln.probleme, farbe: 'orange', klick: () => gehe('vokabeln') }]
            : []),
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
      klick: k.bedarf ? zumBedarf : undefined
    }
  ]
  if (kompakt && k.vokabeln) {
    const v = k.vokabeln
    const sicherWoerter = Math.round(v.sicher * v.woerter)
    return (
      <KennzahlenKopf
        titel={<Text fw={700}>Auf einen Blick</Text>}
        oben={
          <SimpleGrid cols={2} spacing={6} data-kennzahlen-bild>
            <UnstyledButton onClick={() => gehe('vokabeln')} className="kennzahl kennzahl-knopf kennzahl-bild" data-kennzahl="sicher">
              <Text size="xs" c="dimmed" lh={1.2}>
                Wörter sicher
              </Text>
              <FortschrittsRing anteil={v.sicher} titel="Wörter sicher" unten={`im Schnitt ${sicherWoerter} von ${v.woerter} Wörtern`} groesse={64} farbe="var(--mantine-color-teal-6)" ampel={false} />
              <Text size="xs" c="dimmed" lh={1.25} ta="center">
                {sicherWoerter} von {v.woerter} Wörtern
              </Text>
            </UnstyledButton>
            <UnstyledButton onClick={() => gehe('vokabeln')} className="kennzahl kennzahl-knopf kennzahl-bild" data-kennzahl="aktiv">
              <Text size="xs" c="dimmed" lh={1.2}>
                aktiv diese Woche
              </Text>
              {v.von > 0 && v.von <= 40 ? (
                <LernendenPunkte aktiv={v.aktiv} von={v.von} />
              ) : (
                <FortschrittsRing anteil={v.von ? v.aktiv / v.von : 0} titel="aktiv diese Woche" groesse={64} ampel={false} />
              )}
              <Text size="xs" c="dimmed" lh={1.25} ta="center">
                {v.aktiv} von {v.von} Lernenden{v.heute ? ` · heute ${v.heute}` : ''}
              </Text>
            </UnstyledButton>
          </SimpleGrid>
        }
        zahlen={relevanteKennzahlen(zahlen, k).filter((z) => z.id !== 'sicher' && z.id !== 'aktiv')}
        kacheln
        data-fach-kopf={d.sprachfach ? 'sprache' : 'fach'}
        data-fach-kopf-kompakt
      />
    )
  }
  return <KennzahlenKopf zahlen={zahlen} data-fach-kopf={d.sprachfach ? 'sprache' : 'fach'} />
}

/** Ein Punkt je Lernende: gefüllt = diese Woche geübt (10.10.2026) */
function LernendenPunkte({ aktiv, von }: { aktiv: number; von: number }): React.JSX.Element {
  const groesse = von > 24 ? 8 : 11
  return (
    <div
      role="img"
      aria-label={`${aktiv} von ${von} Lernenden diese Woche aktiv`}
      data-lernenden-punkte
      style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', alignContent: 'center', minHeight: 64, maxWidth: 150, margin: '0 auto' }}
    >
      {Array.from({ length: von }, (_, i) => (
        <span
          key={i}
          style={{
            width: groesse,
            height: groesse,
            borderRadius: '50%',
            background: i < aktiv ? 'var(--mantine-color-blue-6)' : 'transparent',
            border: `1.5px solid ${i < aktiv ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-default-border)'}`
          }}
        />
      ))}
    </div>
  )
}
