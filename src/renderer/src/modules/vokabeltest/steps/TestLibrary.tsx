import { Badge, Button, Container, Popover, ScrollArea, Stack, TextInput, Tooltip } from '@mantine/core'
import { IconDeviceFloppy, IconFileImport, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import type { SavedTestMeta } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { hasContent, openSavedTest, saveCurrentTest } from '../library'
import { sichereAlles } from '../../../shared/autosave'
import { formatPoints } from '../model/blocks'
import { parseProjectFile, PROJECT_FILTER } from '../project'
import { TestPayload, useVokabeltest } from '../store'
import { BibliothekKopf, BibliothekLeer, EintragZeile, useBibliothek } from '../../../shared/components/Bibliothek'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Ungespeicherte Arbeit wird vor dem Wechsel gesichert, damit nichts verloren geht. */
async function keepCurrent(): Promise<void> {
  // Anstehendes automatisches Sichern zuerst – danach ist ein Test mit Inhalt schon in der Bibliothek
  await sichereAlles()
  if (hasContent() && !useVokabeltest.getState().lastSavedAt) {
    await saveCurrentTest()
    notifySuccess(`Der bisherige Test wurde als „${useVokabeltest.getState().listName}" gespeichert.`)
  }
}

/**
 * „Meine Vokabeltests" – die gespeicherten Tests, neueste zuerst.
 *
 * Bis 25.09.2026 ein Fenster über dem Programm, dazu eine eigene Liste „Gespeicherten
 * Vokabeltest weiterbearbeiten" in Schritt 1 und ein dritter Knopf dort. Jetzt eine Seite wie
 * in den anderen Programmen, erreichbar über „Meine Vokabeltests" in der Leiste; beim Start
 * erscheint sie, sobald es gespeicherte Tests gibt (die Liste ist nach „zuletzt bearbeitet"
 * sortiert und ersetzt so die frühere Zeile in Schritt 1).
 * Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function TestLibrary({
  onClose,
  zurueck
}: {
  /** Schließt die Bibliothek (nach dem Öffnen, „Zurück zu …", „Neuer Vokabeltest") */
  onClose: () => void
  /** Name des offenen Tests – dann gibt es „Zurück zu …" */
  zurueck: string | null
}): React.JSX.Element {
  const testId = useVokabeltest((s) => s.testId)
  const bib = useBibliothek<SavedTestMeta>(window.api.tests, {
    offeneId: () => useVokabeltest.getState().testId,
    umbenannt: (meta) => useVokabeltest.getState().setListName(meta.name),
    geloescht: () => useVokabeltest.getState().forgetSaved()
  })
  const tests = bib.eintraege ?? []
  const treffer = bib.treffer((t) => [t.hasTest ? 'Test erstellt' : 'noch kein Test'])

  const open = async (id: string): Promise<void> => {
    try {
      if (id !== useVokabeltest.getState().testId) {
        await keepCurrent()
        await openSavedTest(id)
      }
      onClose()
    } catch (e) {
      notifyError(e)
    }
  }

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel="Meine Vokabeltests"
          untertitel={
            tests.length === 1
              ? 'Ein gespeicherter Test – bei jeder Änderung automatisch aktualisiert'
              : `${tests.length} gespeicherte Tests – bei jeder Änderung automatisch aktualisiert`
          }
          zurueck={zurueck}
          onZurueck={onClose}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, z. B. Green Line 5"
        >
          <Button
            variant="default"
            leftSection={<IconFileImport size={16} />}
            onClick={async () => {
              try {
                const file = await window.api.files.open(PROJECT_FILTER)
                if (!file) return
                const doc = parseProjectFile(file.data)
                await keepCurrent()
                useVokabeltest.getState().newTest()
                useVokabeltest.getState().loadDocument(doc)
                onClose()
              } catch (e) {
                notifyError(e)
              }
            }}
          >
            Datei öffnen …
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={async () => {
              try {
                await keepCurrent()
                useVokabeltest.getState().newTest()
                onClose()
              } catch (e) {
                notifyError(e)
              }
            }}
          >
            Neuer Vokabeltest
          </Button>
        </BibliothekKopf>

        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer leer={tests.length === 0} text="Noch keine Vokabeltests gespeichert. Gesichert wird automatisch ab der ersten Vokabel." />
        )}

        <Stack gap="xs">
          {treffer.map((t) => (
            <EintragZeile
              key={t.id}
              bib={bib}
              eintrag={t}
              offen={t.id === testId && zurueck !== null}
              onOeffnen={() => void open(t.id)}
              kennzeichen={
                !t.hasTest && (
                  <Badge size="sm" variant="outline" color="gray">
                    noch kein Test
                  </Badge>
                )
              }
              info={[
                `${t.vocabCount} Vokabeln (${t.includedCount} im Test)`,
                t.hasTest ? `Test erstellt${t.variantCount > 1 ? `, ${t.variantCount} Varianten` : ''}, ${formatPoints(t.totalPoints)} Punkte` : '',
                dateFormat.format(new Date(t.updatedAt))
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </Stack>
      </Container>
    </ScrollArea>
  )
}

/** Speichern in der App; beim ersten Speichern wird ein Name abgefragt. */
export function SaveTestButton({ size = 'sm' }: { size?: 'xs' | 'sm' }): React.JSX.Element {
  const { listName, lastSavedAt } = useVokabeltest()
  const [opened, setOpened] = useState(false)
  const [name, setName] = useState(listName)
  const [saving, setSaving] = useState(false)

  const save = async (value: string): Promise<void> => {
    setSaving(true)
    try {
      await saveCurrentTest(value)
      notifySuccess(`„${useVokabeltest.getState().listName}" gespeichert.`)
      setOpened(false)
    } catch (e) {
      notifyError(e)
    } finally {
      setSaving(false)
    }
  }

  if (lastSavedAt) {
    return (
      <Tooltip label={lastSavedAt ? `Automatisch gespeichert: ${dateFormat.format(new Date(lastSavedAt))}` : 'Gespeichert'}>
        <Button size={size} variant="default" leftSection={<IconDeviceFloppy size={14} />} loading={saving} onClick={() => void save(listName)}>
          Gespeichert
        </Button>
      </Tooltip>
    )
  }
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow trapFocus>
      <Popover.Target>
        <Button
          size={size}
          variant="default"
          leftSection={<IconDeviceFloppy size={14} />}
          onClick={() => {
            setName(listName)
            setOpened((o) => !o)
          }}
        >
          Speichern
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={300}>
          <TextInput
            label="Name des Vokabeltests"
            placeholder="z. B. Green Line 5 – Unit 1, Station 1"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save(name)}
            data-autofocus
          />
          <Button size="xs" onClick={() => void save(name)} loading={saving} disabled={!name.trim()}>
            In der App speichern
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export type { TestPayload }
