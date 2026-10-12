import { AppKopf } from '../../shared/components/AppKopf'
import { Alert, Badge, Button, Card, Container, Group, ScrollArea, Select, Stack, Text, Title } from '@mantine/core'
import { IconPencil } from '@tabler/icons-react'
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

  const sprachen = useMemo(() => {
    const da = new Set(books.map((b) => b.language))
    return LANGUAGES.filter((l) => da.has(l.value)).map((l) => ({ value: l.value, label: l.label }))
  }, [books])
  const liste = books.filter((b) => b.language === sprache).sort((a, b) => collator.compare(a.name, b.name))
  // Nach Reihe gruppiert, wie in den Vokabellisten
  const reihen = useMemo(() => {
    const m = new Map<string, TextbookMeta[]>()
    for (const b of liste) {
      const r = reiheTitel(b) || b.name
      m.set(r, [...(m.get(r) ?? []), b])
    }
    return [...m.entries()]
  }, [liste])

  const buch = offen ? books.find((b) => b.id === offen) : undefined
  if (buch)
    return (
      <ScrollArea h="100%">
        <Container size="lg" py="lg">
          <GrammatikformenEditor
            key={buch.id}
            buch={buch}
            alle={books}
            eintrag={eintraege.find((e) => e.lehrwerkId === buch.id)}
            onBack={() => {
              setOffen(null)
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
        <Card withBorder mb="md">
          <Group align="flex-end">
            <Select
              label="Fach"
              data={sprachen}
              value={sprache}
              onChange={(v) => v && setSprache(v)}
              allowDeselect={false}
              leftSection={<FachPunkt fach={sprache} />}
              w={240}
              data-grammatikformen-fach
            />
            {!darfLehrwerkBearbeiten(sprache) && (
              <Text size="sm" c="dimmed">
                Nur ansehen – bearbeiten dürfen Admins und die Fachobleute dieses Fachs.
              </Text>
            )}
          </Group>
        </Card>
        {!liste.length && <Alert color="gray">Für dieses Fach ist noch kein Lehrwerk hinterlegt. Lehrwerke kommen über „Vokabellisten“ dazu.</Alert>}
        <Stack gap="lg">
          {reihen.map(([reihe, baende]) => (
            <Stack key={reihe} gap="xs">
              <Title order={4}>{reihe}</Title>
              {baende.map((b) => {
                const bearbeitet = eintraege.some((e) => e.lehrwerkId === b.id)
                const eingebaut = Boolean(LEHRWERK_GRAMMATIK_EINGEBAUT[b.name])
                const zahl = punkteIn(b.name)
                return (
                  <Card key={b.id} withBorder padding="sm" data-grammatikformen-buch={b.id}>
                    <Group justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={600}>{b.name}</Text>
                          {bearbeitet ? (
                            <Badge variant="light" color="violet">
                              bearbeitet
                            </Badge>
                          ) : eingebaut ? (
                            <Badge variant="light">eingebaut</Badge>
                          ) : null}
                          <Badge variant="light" color={zahl ? 'teal' : 'gray'}>
                            {zahl ? `${zahl} ${zahl === 1 ? 'Grammatikpunkt' : 'Grammatikpunkte'}` : 'noch keine Grammatik'}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {[
                            b.grade ? `Klasse ${b.grade}` : '',
                            schulformName(b.schoolTypeId, b.stateId) ?? '',
                            b.edition ?? '',
                            b.ausgabe ?? '',
                            `${b.units.length} Units`
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </div>
                      <Button size="xs" leftSection={<IconPencil size={14} />} onClick={() => setOffen(b.id)}>
                        {darfLehrwerkBearbeiten(b.language) ? 'Bearbeiten' : 'Ansehen'}
                      </Button>
                    </Group>
                  </Card>
                )
              })}
            </Stack>
          ))}
        </Stack>
      </Container>
    </ScrollArea>
  )
}
