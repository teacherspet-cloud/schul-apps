import { ActionIcon, Alert, Button, Card, Container, Group, MultiSelect, ScrollArea, Stack, Tabs, Text, Textarea, TextInput, Title } from '@mantine/core'
import { IconFileTypeDocx, IconFileTypePdf, IconLanguage, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { speichereAusgabe, WORD_FILTER } from '../../../shared/export/ausgabe'
import { FAMILIENSPRACHEN, spracheNach } from '../../../shared/familiensprachen'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, safeFileName } from '../../../shared/util'
import { briefUebersetzen } from '../auftrag'
import { briefDocx, briefHtml } from '../ausgabe'
import { DEUTSCHER_VERMERK, type BriefText } from '../model'
import { useElternbrief } from '../store'

/**
 * Schritt 2 des Elternbriefs (Großprogramm 0.4, F7): den Brief bearbeiten, übersetzen lassen,
 * als PDF oder Word speichern (deutsche Fassung plus die Übersetzungen).
 */
export default function Brief(): React.JSX.Element | null {
  const { dok: b, update, docId } = useElternbrief()
  const [sprachen, setSprachen] = useState<string[]>([])
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  if (!b?.text) return null
  const kopf = { schule: settings.schoolName, logo: settings.showSchool === false ? null : logo }
  const name = safeFileName(b.meta.title || b.text.betreff || 'Elternbrief')

  const speichern = (art: 'pdf' | 'docx'): void => {
    const anzahl = b.uebersetzungen.length
    void speichereAusgabe(
      art === 'pdf' ? [{ name: `${name}.pdf`, html: briefHtml(b, kopf) }] : [{ name: `${name}.docx`, filter: WORD_FILTER, daten: () => briefDocx(b, kopf) }],
      anzahl ? `Elternbrief mit ${anzahl} Übersetzung${anzahl === 1 ? '' : 'en'} gespeichert.` : 'Elternbrief gespeichert.'
    ).catch(notifyError)
  }

  /** Bearbeitbare Felder eines Brieftextes (deutsch oder übersetzt) */
  const felder = (t: BriefText, setzen: (fn: (x: BriefText) => void, gruppe: string) => void, rtl = false): React.JSX.Element => (
    <Stack gap="xs" dir={rtl ? 'rtl' : 'ltr'}>
      <TextInput
        label="Betreff"
        value={t.betreff}
        onChange={(e) => {
          const x = e.currentTarget.value
          setzen((d) => (d.betreff = x), 'betreff')
        }}
      />
      <TextInput
        label="Anrede"
        value={t.anrede}
        onChange={(e) => {
          const x = e.currentTarget.value
          setzen((d) => (d.anrede = x), 'anrede')
        }}
      />
      {t.absaetze.map((a, i) => (
        <Textarea
          key={i}
          autosize
          minRows={2}
          value={a}
          onChange={(e) => {
            const x = e.currentTarget.value
            setzen((d) => (d.absaetze[i] = x), `absatz-${i}`)
          }}
          aria-label={`Absatz ${i + 1}`}
        />
      ))}
      <TextInput
        label="Gruß"
        value={t.gruss}
        onChange={(e) => {
          const x = e.currentTarget.value
          setzen((d) => (d.gruss = x), 'gruss')
        }}
      />
      {t.ruecklauf && (
        <Card withBorder padding="xs">
          <Text size="sm" fw={600}>
            Rücklaufzettel
          </Text>
          <TextInput
            size="xs"
            value={t.ruecklauf.titel}
            onChange={(e) => {
              const x = e.currentTarget.value
              setzen((d) => d.ruecklauf && (d.ruecklauf.titel = x), 'rl-titel')
            }}
          />
          {t.ruecklauf.zeilen.map((z, i) => (
            <TextInput
              key={i}
              size="xs"
              mt={4}
              value={z}
              onChange={(e) => {
                const x = e.currentTarget.value
                setzen((d) => d.ruecklauf && (d.ruecklauf.zeilen[i] = x), `rl-${i}`)
              }}
            />
          ))}
        </Card>
      )}
    </Stack>
  )

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md">
          <Title order={2}>{b.text.betreff || 'Elternbrief'}</Title>
          <Group gap="xs">
            <Button size="xs" variant="light" leftSection={<IconFileTypePdf size={14} />} onClick={() => speichern('pdf')}>
              PDF
            </Button>
            <Button size="xs" variant="light" leftSection={<IconFileTypeDocx size={14} />} onClick={() => speichern('docx')}>
              Word
            </Button>
          </Group>
        </Group>
        <Card withBorder mb="md">
          <Group align="flex-end" gap="sm">
            <MultiSelect
              style={{ flex: 1 }}
              label="Übersetzen in"
              placeholder="Familiensprachen wählen"
              data={FAMILIENSPRACHEN.map((s) => ({ value: s.code, label: `${s.name} – ${s.eigen}` }))}
              value={sprachen}
              onChange={setSprachen}
              searchable
              data-eb-sprachen
            />
            <Button
              leftSection={<IconLanguage size={16} />}
              disabled={!sprachen.length}
              onClick={() => {
                briefUebersetzen(b, docId, sprachen)
                setSprachen([])
              }}
              data-eb-uebersetzen
            >
              Übersetzen
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Jede Übersetzung trägt den Vermerk „{DEUTSCHER_VERMERK}" – in der Zielsprache und auf Deutsch. Wird der deutsche Brief neu geschrieben, fallen die
            Übersetzungen weg.
          </Text>
        </Card>
        <Tabs defaultValue="de" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="de">Deutsch</Tabs.Tab>
            {b.uebersetzungen.map((u) => (
              <Tabs.Tab key={u.code} value={u.code}>
                {spracheNach(u.code)?.name ?? u.code}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="de" pt="sm">
            {felder(b.text, (fn, g) => update((d) => d.text && fn(d.text), `eb-de-${g}`))}
          </Tabs.Panel>
          {b.uebersetzungen.map((u, i) => (
            <Tabs.Panel key={u.code} value={u.code} pt="sm">
              <Group justify="flex-end" mb="xs">
                <ActionIcon variant="subtle" color="red" aria-label="Übersetzung entfernen" onClick={() => update((d) => d.uebersetzungen.splice(i, 1))}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
              {u.text.vermerk && (
                <Alert variant="light" color="gray" p="xs" mb="xs">
                  {u.text.vermerk}
                </Alert>
              )}
              {felder(u.text, (fn, g) => update((d) => fn(d.uebersetzungen[i].text), `eb-${u.code}-${g}`), Boolean(spracheNach(u.code)?.rtl))}
            </Tabs.Panel>
          ))}
        </Tabs>
      </Container>
    </ScrollArea>
  )
}
