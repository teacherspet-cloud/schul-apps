import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { BandCover } from '../../shared/components/BandCover'
import { Button, Paper, Badge, Chip, Container, Group, Progress, ScrollArea, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { reiheTitel } from '@shared/lehrwerkReihe'
import { schulformName } from '@shared/lehrwerkSchulform'
import { notifyError } from '../../shared/util'
import { LANGUAGES } from '../vokabeltest/model/types'
import { FachPunkt } from '../../shared/components/FachFarbe'
import { LEHRWERK_GRAMMATIK, LEHRWERK_GRAMMATIK_EINGEBAUT, wendeGrammatikAn, type LehrwerkGrammatikEintrag } from '../../shared/lehrwerkGrammatik'
import { darfLehrwerkBearbeiten } from '../../shared/fachobleute'
import GrammatikformenEditor from './GrammatikformenEditor'
import LehrplanAnsicht from './LehrplanAnsicht'
import { tonVoll, tonZart } from './farbton'
import { useGrammatikFarbe } from './farbton'
import { useBankZahlen } from './GrammatikBank'
import { aufgabenAmpel, useSchulStufen } from './bank'
import { teilbereicheVon } from './grammatikformen'
import type { BankZahlen, Stufe } from '@shared/grammatikBank'
import { lateinBaende, zielAusDocId, type GrammatikformenZiel } from './grammatikformen'
import { useDokumentOeffner } from '../../shared/navigation'

const collator = new Intl.Collator('de', { numeric: true })
const SPRACHE_KEY = 'grammatikformen-sprache'

/** Zahl der Grammatikpunkte eines Bands */
const punkteIn = (buch: string): number =>
  Object.values(LEHRWERK_GRAMMATIK[buch] ?? {}).reduce((n, k) => n + Object.values(k).reduce((m, l) => m + l.length, 0), 0)

/**
 * App „Grammatikformen" (12.10.2026, Wunsch der Lehrkraft; Gruppe Organisation, für Admins und Fachobleute):
 * die Lehrwerke mit ihren Units und Abschnitten und je Abschnitt die zugeordneten Grammatikformen (Katalog-Kennungen).
 * Bearbeiten von Hand oder mit KI-Vorschlägen aus Schulbuchseiten (GrammatikformenEditor). Die eingebaute Liste für
 * Green Line Niedersachsen (shared/lehrwerkGrammatik.ts) ist hier sichtbar und bearbeitbar; gespeicherte Bearbeitungen
 * überlagern sie für alle Nutzer (Grammatikauswahl, Kurse, Vorwissen, Server).
 */
export default function GrammatikformenModule({ active = true }: { active?: boolean }): React.JSX.Element {
  const [books, setBooks] = useState<TextbookMeta[]>([])
  const [eintraege, setEintraege] = useState<LehrwerkGrammatikEintrag[]>([])
  const [offen, setOffen] = useState<string | null>(null)
  // „Öffnen" in der Auftragsleiste (13.10.2026): Band, Unit und Grammatikpunkt (grammatikformen.ts `zielDocId`)
  const [ziel, setZiel] = useState<GrammatikformenZiel | null>(null)
  useDokumentOeffner('grammatikformen', async (docId) => {
    const z = zielAusDocId(docId)
    if (!z) return
    const buecher = books.length ? books : await window.api.textbooks.list()
    if (!buecher.some((b) => b.id === z.buchId)) return
    setOffen(z.buchId)
    setZiel({ ...z })
  })
  const programmFarbe = useProgrammFarbe()
  const [sprache, setSprache] = useState<string>(() => {
    try {
      return localStorage.getItem(SPRACHE_KEY) || 'en'
    } catch {
      return 'en'
    }
  })

  const laden = (): void => {
    window.api.textbooks.list().then(setBooks).catch(notifyError)
    window.api.lehrwerkGrammatik
      .list()
      .then((l) => {
        // Frisch vom Server: gleich über die eingebaute Liste legen (auch Bearbeitungen anderer Fachobleute)
        wendeGrammatikAn(l)
        setEintraege(l)
      })
      .catch(notifyError)
  }
  useEffect(() => {
    if (active) laden()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
  useEffect(() => {
    try {
      localStorage.setItem(SPRACHE_KEY, sprache)
    } catch {
      // ohne lokalen Speicher nur für diese Sitzung
    }
  }, [sprache])

  // Deutsch und Latein immer (13.10.2026: Grammatikformen auch ohne Lehrwerk, Regal „Nach Lehrplan")
  const sprachen = useMemo(() => {
    const da = new Set([...books.map((b) => b.language), 'de', 'la'])
    return LANGUAGES.filter((l) => da.has(l.value)).map((l) => ({ value: l.value, label: l.value === 'de' ? 'Deutsch' : l.label }))
  }, [books])
  const [lehrplan, setLehrplan] = useState(false)
  // Fachfarbe und Stand der Übungsaufgaben (13.10.2026, abgestimmt)
  const farbe = useGrammatikFarbe(sprache)
  const bank = useBankZahlen(sprache)
  const schulStufen = useSchulStufen()
  // Latein (13.10.2026): die Lehrwerke aus der Lektionsübersicht der Verlage als Bände, sofern nicht eingelesen
  const alleBuecher = useMemo<TextbookMeta[]>(
    () => [
      ...books,
      ...lateinBaende()
        .filter((l) => !books.some((b) => b.language === 'la' && b.name === l.name))
        .map((l) => ({ ...l, units: l.units.map((u) => ({ name: u.name, sections: [] })), language: 'la', reihe: l.name, entryCount: 0 }))
    ],
    [books]
  )
  const liste = alleBuecher.filter((b) => b.language === sprache).sort((a, b) => collator.compare(a.name, b.name))
  // Nach Reihe gruppiert, wie in den Vokabellisten
  const reihen = useMemo(() => {
    const m = new Map<string, TextbookMeta[]>()
    for (const b of liste) {
      const r = reiheTitel(b) || b.name
      m.set(r, [...(m.get(r) ?? []), b])
    }
    return [...m.entries()]
  }, [liste])

  if (lehrplan)
    return (
      <ScrollArea h="100%">
        <Container size="lg" py="lg">
          <LehrplanAnsicht key={sprache} sprache={sprache} onBack={() => setLehrplan(false)} />
        </Container>
      </ScrollArea>
    )
  const buch = offen ? alleBuecher.find((b) => b.id === offen) : undefined
  if (buch)
    return (
      <ScrollArea h="100%">
        <Container size="lg" py="lg">
          <GrammatikformenEditor
            key={buch.id}
            buch={buch}
            alle={alleBuecher}
            eintrag={eintraege.find((e) => e.lehrwerkId === buch.id)}
            ziel={ziel?.buchId === buch.id ? ziel : null}
            onBack={() => {
              setOffen(null)
              setZiel(null)
              laden()
            }}
            onGespeichert={(l) => setEintraege(l)}
          />
        </Container>
      </ScrollArea>
    )

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <AppKopf
          suche={false}
          beschreibung="Grammatik je Lehrwerk, Unit und Abschnitt – Grundlage für die Grammatikauswahl, die Kurse im Sprachenlernen und das Vorwissen bei der Materialerstellung."
        />
        <Stack gap={6} mb="lg">
          <Chip.Group value={sprache} onChange={(v) => typeof v === 'string' && setSprache(v)}>
            <Group gap={6} data-grammatikformen-fach>
              {sprachen.map((s) => (
                <Chip key={s.value} value={s.value} color={programmFarbe} variant="light" data-grammatikformen-fach-chip={s.value}>
                  <Group gap={6} wrap="nowrap" component="span">
                    <FachPunkt fach={s.value} />
                    {s.label}
                  </Group>
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          {!darfLehrwerkBearbeiten(sprache) && (
            <Text size="xs" c="dimmed">
              Nur ansehen – bearbeiten dürfen Admins und die Fachobleute dieses Fachs.
            </Text>
          )}
        </Stack>
        <Paper
          withBorder
          radius="lg"
          p="md"
          mb="lg"
          style={{ borderLeft: `4px solid ${tonVoll(farbe)}`, background: tonZart(farbe) }}
          data-grammatikformen-lehrplan-kachel
        >
          <Group justify="space-between" wrap="wrap" gap="sm">
            <div>
              <Text fw={700}>Nach Lehrplan</Text>
              <Text size="sm" c="dimmed">
                Alle Grammatikformen des Fachs nach Jahrgang – auch ohne Lehrwerk. Übungsaufgaben gelten für alle Lehrwerke.
              </Text>
            </div>
            <Button color={farbe} variant="light" onClick={() => setLehrplan(true)} data-grammatikformen-lehrplan-oeffnen>
              Öffnen
            </Button>
          </Group>
        </Paper>
        {!liste.length && (
          <Text size="sm" c="dimmed" mb="md">
            Für dieses Fach ist kein Lehrwerk hinterlegt – Lehrwerke kommen über „Vokabellisten“ dazu.
          </Text>
        )}
        <Stack gap={36}>
          {reihen.map(([reihe, baende]) => (
            <section key={reihe} data-grammatikformen-reihe={reihe}>
              <Title order={4} mb="sm">
                {reihe}
              </Title>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 16,
                  alignItems: 'end',
                  paddingBottom: 10,
                  borderBottom: '6px solid var(--mantine-color-default-border)',
                  borderRadius: 2
                }}
              >
                {baende.map((b) => (
                  <BandKachel
                    key={b.id}
                    buch={b}
                    farbe={farbe}
                    zahlen={bank.geladen ? bank.zahlen : null}
                    stufen={schulStufen}
                    bearbeitet={eintraege.some((e) => e.lehrwerkId === b.id)}
                    onOpen={() => setOffen(b.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </Stack>
      </Container>
    </ScrollArea>
  )
}

/** Ein Band im Regal: Cover oben, darunter Name, Klasse, Zahl der Grammatikpunkte, Füllbalken und Kennzeichen */
function BandKachel({
  buch,
  farbe,
  zahlen,
  stufen,
  bearbeitet,
  onOpen
}: {
  buch: TextbookMeta
  farbe: string
  /** Aufgabenbank (nur am Server) – null: kein Balken */
  zahlen: BankZahlen | null
  stufen: Stufe[]
  bearbeitet: boolean
  onOpen: () => void
}): React.JSX.Element {
  const eingebaut = Boolean(LEHRWERK_GRAMMATIK_EINGEBAUT[buch.name])
  const zahl = punkteIn(buch.name)
  const punkteListe = Object.values(LEHRWERK_GRAMMATIK[buch.name] ?? {}).flatMap((k) => Object.values(k).flat())
  const g = LEHRWERK_GRAMMATIK[buch.name] ?? {}
  const mit = buch.units.filter((u) => Object.values(g[u.name] ?? {}).some((l) => l.length)).length
  const gesamt = buch.units.length
  const zeile = [buch.grade ? `Klasse ${buch.grade}` : '', schulformName(buch.schoolTypeId, buch.stateId) ?? '', buch.ausgabe ?? ''].filter(Boolean).join(' · ')
  return (
    <UnstyledButton
      onClick={onOpen}
      data-grammatikformen-buch={buch.id}
      aria-label={`${buch.name} ${darfLehrwerkBearbeiten(buch.language) ? 'bearbeiten' : 'ansehen'}`}
      className="grammatikformen-kachel"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--mantine-radius-md)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BandCover band={buch} land={buch.stateId ?? ''} breite={104} />
      </div>
      <Text fw={700} size="sm" lh={1.25} lineClamp={2}>
        {buch.name}
      </Text>
      {zeile && (
        <Text size="xs" c="dimmed" lh={1.25} lineClamp={2}>
          {zeile}
        </Text>
      )}
      <Text size="xs" c={zahl ? undefined : 'dimmed'}>
        {zahl ? `${zahl} ${zahl === 1 ? 'Grammatikpunkt' : 'Grammatikpunkte'}` : 'noch keine Grammatik'}
      </Text>
      {zahlen && zahl > 0 && (
        <div title="Formen mit Übungsaufgaben">
          <Progress
            value={(punkteListe.filter((p) => aufgabenAmpel(teilbereicheVon(p.t), zahlen, stufen) !== 'keine').length / zahl) * 100}
            size={4}
            color="teal"
            radius="xl"
            aria-label="Formen mit Übungsaufgaben"
          />
          <Text size="10px" c="dimmed" mt={2}>
            Übungsaufgaben: {punkteListe.filter((p) => aufgabenAmpel(teilbereicheVon(p.t), zahlen, stufen) !== 'keine').length} von {zahl} Formen
          </Text>
        </div>
      )}
      <div title="Units mit Grammatik">
        <Progress value={gesamt ? (mit / gesamt) * 100 : 0} size={4} color={farbe} radius="xl" aria-label="Units mit Grammatik" />
        <Text size="10px" c="dimmed" mt={2}>
          Units mit Grammatik {mit}/{gesamt}
        </Text>
      </div>
      {(bearbeitet || eingebaut) && (
        <Group gap={4}>
          {bearbeitet ? (
            <Badge size="xs" variant="light" color="gray" tt="none">
              bearbeitet
            </Badge>
          ) : (
            <Badge size="xs" variant="light" color="gray" tt="none">
              eingebaut
            </Badge>
          )}
        </Group>
      )}
    </UnstyledButton>
  )
}
