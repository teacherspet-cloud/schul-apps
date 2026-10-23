/**
 * „Schüleransicht zeigen" (13.10.2026, Wunsch der Lehrkraft) in der App „Grammatikformen": je Grammatikpunkt und für den
 * ganzen Band eine Vorschau, wie die Grammatik bei den Lernenden erscheint, sobald sie einem Kurs hinzugefügt ist –
 * mit der echten Ansicht der Lernenden (lernen/GrammatikTrainer.tsx im Vorschau-Modus: Antworten werden hier geprüft,
 * nichts wird gespeichert, kein Kurs nötig). Die Aufgaben kommen aus der Aufgabenbank, so wie „Grammatik hinzufügen" sie
 * zuweist (Teilbereiche, dazu „Gemischt" je Punkt).
 */
import { Alert, Badge, Button, Card, Group, Loader, Modal, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconEye } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { bankPaket, mixSchluessel, unitSchluessel, type BankEintrag } from '@shared/grammatikBank'
import type { GrammatikPaket } from '@shared/grammatiktrainer'
import { fachVon } from '@shared/faecher'
import { fachDerSprache } from '@shared/fachobleute'
import type { LehrwerkGrammatikPunkt } from '../../shared/lehrwerkGrammatik'
import { notifyError } from '../../shared/util'
import GrammatikTrainer from '../lernen/GrammatikTrainer'
import { bankLesen, kurseFreigegeben } from './bank'
import { teilbereicheVon } from './grammatikformen'

export interface VorschauPunkt {
  unit: string
  abschnitt: string
  punkt: LehrwerkGrammatikPunkt
}

interface Eintrag {
  schluessel: string
  titel: string
  unit: string
  paket: GrammatikPaket
  themen: string[]
}

/** Schlüssel eines Punkts in der Reihenfolge, in der der Kurs sie bekommt: Teilbereiche, dann „Gemischt" */
const schluesselVon = (p: LehrwerkGrammatikPunkt): string[] => {
  const teile = teilbereicheVon(p.t)
  return teile.length >= 2 ? [...teile, mixSchluessel(p.t)] : teile
}

async function alleLesen(schluessel: string[]): Promise<Map<string, BankEintrag>> {
  const m = new Map<string, BankEintrag>()
  const liste = [...new Set(schluessel)]
  for (let i = 0; i < liste.length; i += 80) for (const e of await bankLesen(liste.slice(i, i + 80))) m.set(e.schluessel, e)
  return m
}

export function SchuelerAnsichtKnopf({
  buch,
  punkte,
  titel,
  farbe,
  klein
}: {
  buch: TextbookMeta
  punkte: VorschauPunkt[]
  /** Kopf des Fensters: Name des Punkts bzw. des Bands */
  titel: string
  farbe: string
  klein?: boolean
}): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  if (!kurseFreigegeben()) return null
  return (
    <>
      <Button
        size={klein ? 'xs' : 'sm'}
        variant="light"
        color={farbe}
        radius="xl"
        leftSection={<IconEye size={klein ? 14 : 16} />}
        onClick={() => setOffen(true)}
        data-grammatikformen-schueleransicht
      >
        Schüleransicht zeigen
      </Button>
      {offen && <SchuelerAnsicht buch={buch} punkte={punkte} titel={titel} schliessen={() => setOffen(false)} />}
    </>
  )
}

function SchuelerAnsicht({
  buch,
  punkte,
  titel,
  schliessen
}: {
  buch: TextbookMeta
  punkte: VorschauPunkt[]
  titel: string
  schliessen: () => void
}): React.JSX.Element {
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<Eintrag | null>(null)
  const einzeln = punkte.length === 1
  useEffect(() => {
    let aktiv = true
    const units = [...new Set(punkte.map((p) => p.unit))]
    const mitUnit = !einzeln
    alleLesen([...punkte.flatMap((p) => schluesselVon(p.punkt)), ...(mitUnit ? units.map((u) => unitSchluessel(buch.name, u)) : [])]).then(
      (bank) => {
        if (!aktiv) return
        const aus: Eintrag[] = punkte.map((p, i) => {
          const s = schluesselVon(p.punkt)
          return {
            schluessel: `p${i}`,
            titel: p.punkt.text,
            unit: p.unit,
            paket: bankPaket(
              p.punkt.text,
              s.map((k) => bank.get(k)).filter((e): e is BankEintrag => Boolean(e))
            ),
            themen: [...new Set(p.punkt.t.map((k) => k.split('/')[0]))]
          }
        })
        if (mitUnit)
          for (const u of units) {
            const e = bank.get(unitSchluessel(buch.name, u))
            if (e?.aufgaben.length) {
              const letzter = aus.map((x) => x.unit).lastIndexOf(u)
              aus.splice(letzter + 1, 0, {
                schluessel: `u:${u}`,
                titel: e.regel.titel || `Wiederholung ${u}`,
                unit: u,
                paket: bankPaket(e.regel.titel, [e]),
                themen: []
              })
            }
          }
        setEintraege(aus)
        if (einzeln && aus[0]?.paket.aufgaben.length) setGewaehlt(aus[0])
      },
      (e: unknown) => (notifyError(e), aktiv && setEintraege([]))
    )
    return () => {
      aktiv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const fach = fachVon(fachDerSprache(buch.language))?.label ?? buch.language
  const daten = (e: Eintrag): Parameters<typeof GrammatikTrainer>[0]['vorschau'] => ({
    id: `vorschau-${e.schluessel}`,
    titel: e.titel,
    fach,
    sprache: buch.language,
    paket: e.paket,
    staende: {},
    rekorde: {},
    ansehen: [],
    info: { themen: e.themen, teilformen: e.paket.regeln.map((r) => r.kennung ?? '').filter((k) => k.includes('/')) },
    erstellt: new Date().toISOString(),
    vorschau: true
  })
  return (
    <Modal
      opened
      onClose={schliessen}
      size={1100}
      fullScreen={window.matchMedia?.('(max-width: 700px)').matches}
      title={
        <Group gap="xs">
          <IconEye size={18} />
          <Text fw={700}>Schüleransicht – {titel}</Text>
        </Group>
      }
      data-grammatikformen-schueleransicht-fenster
    >
      <Stack>
        <Alert color="blue" p="xs">
          Vorschau: So sehen Lernende diese Grammatik, sobald sie einem Kurs hinzugefügt ist. Antworten werden geprüft, aber nicht gespeichert.
        </Alert>
        {eintraege === null ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : gewaehlt ? (
          <Stack gap="sm">
            {!einzeln && (
              <Button variant="subtle" leftSection={<IconArrowLeft size={14} />} onClick={() => setGewaehlt(null)} style={{ alignSelf: 'flex-start' }}>
                Alle Grammatikformen
              </Button>
            )}
            <div style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 16, padding: 12 }} data-schueleransicht-trainer>
              <GrammatikTrainer key={gewaehlt.schluessel} id={`vorschau-${gewaehlt.schluessel}`} vorschau={daten(gewaehlt)} />
            </div>
          </Stack>
        ) : !eintraege.some((e) => e.paket.aufgaben.length) ? (
          <Alert color="gray">
            Noch keine Übungsaufgaben hinterlegt – Lernende sähen hier noch nichts. Aufgaben entstehen im Pop-up eines Grammatikpunkts.
          </Alert>
        ) : (
          <Stack gap="lg">
            {[...new Set(eintraege.map((e) => e.unit))].map((u) => (
              <div key={u}>
                <Title order={5} mb="xs">
                  {u}
                </Title>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                  {eintraege
                    .filter((e) => e.unit === u)
                    .map((e) => {
                      const n = e.paket.aufgaben.length
                      return (
                        <UnstyledButton key={e.schluessel} disabled={!n} onClick={() => setGewaehlt(e)} data-schueleransicht-form={e.titel}>
                          <Card withBorder radius="lg" padding="sm" style={{ opacity: n ? 1 : 0.55, height: '100%' }}>
                            <Text fw={600} size="sm" lineClamp={2}>
                              {e.titel}
                            </Text>
                            <Group gap={6} mt={6}>
                              <Badge size="sm" variant="light" tt="none" color={n ? 'blue' : 'gray'}>
                                {n ? `${n} Aufgaben` : 'noch keine Aufgaben'}
                              </Badge>
                              {e.paket.regeln.length > 0 && (
                                <Badge size="sm" variant="outline" color="gray" tt="none">
                                  {e.paket.regeln.length} {e.paket.regeln.length === 1 ? 'Regelkarte' : 'Regelkarten'}
                                </Badge>
                              )}
                            </Group>
                          </Card>
                        </UnstyledButton>
                      )
                    })}
                </SimpleGrid>
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  )
}
