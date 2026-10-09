import { Badge, Button, Container, Popover, ScrollArea, Stack, TextInput, Tooltip } from '@mantine/core'
import { IconDeviceFloppy, IconFileImport, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { SavedTestMeta } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { hasContent, openSavedTest, saveCurrentTest } from '../library'
import { sichereAlles } from '../../../shared/autosave'
import { formatPoints } from '../model/blocks'
import { parseProjectFile, PROJECT_FILTER } from '../project'
import { TestPayload, useVokabeltest } from '../store'
import { BibliothekKopf, BibliothekLeer, EintragZeile, useBibliothek } from '../../../shared/components/Bibliothek'
import { ThemenAnsicht } from '../../../shared/components/Themenbereiche'
import { nurListe } from '../../../shell/materialien'

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

/** Neuer Test – der bisherige wird vorher gesichert (Knopf „Neuer Vokabeltest" und „Neu in diesem Bereich") */
export async function neuerTestMitSicherung(): Promise<void> {
  await keepCurrent()
  useVokabeltest.getState().newTest()
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
  onNeuImBereich,
  zurueck
}: {
  /** Schließt die Bibliothek (nach dem Öffnen, „Zurück zu …", „Neuer Vokabeltest") */
  onClose: () => void
  /** Neuen Test anlegen und seine Kennung liefern („Neu in diesem Bereich", Paket 10b) */
  onNeuImBereich: () => Promise<string>
  /** Name des offenen Tests – dann gibt es „Zurück zu …" */
  zurueck: string | null
}): React.JSX.Element {
  const testId = useVokabeltest((s) => s.testId)
  const bib = useBibliothek<SavedTestMeta>(window.api.tests, {
    offeneId: () => useVokabeltest.getState().testId,
    umbenannt: (meta) => useVokabeltest.getState().setListName(meta.name),
    geloescht: () => useVokabeltest.getState().forgetSaved(),
    moduleId: 'vokabeltest'
  })
  const tests = bib.eintraege ?? []
  // Fach und Klasse seit Paket 7 (ältere Tests haben sie nicht – dort zählt nur der Name)
  const treffer = bib.treffer((t) => [t.subjectLabel, t.grade ? `Klasse ${t.grade}` : '', t.hasTest ? 'Test erstellt' : 'noch kein Test'])
  const suche = bib.suche.trim() !== ''
  // Themenbereiche (Paket 10b): ohne Suche Fach › Themenbereich, wie in den übrigen Bibliotheken
  const eigene = useMemo(() => nurListe({ tests: bib.eintraege ?? [] }), [bib.eintraege])
  const nachId = useMemo(() => new Map((bib.eintraege ?? []).map((t) => [t.id, t])), [bib.eintraege])

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

  const zeile = (t: SavedTestMeta): React.JSX.Element => (
    <EintragZeile
      bib={bib}
      eintrag={t}
      offen={t.id === testId && zurueck !== null}
      onOeffnen={() => void open(t.id)}
      // Farbpunkt der Sprache (Paket 10a) bei der Suche; sonst steht er an der Fach-Überschrift
      fach={suche ? (t.language ?? t.subjectLabel) : undefined}
      kennzeichen={
        !t.hasTest && (
          <Badge size="sm" variant="outline" color="gray">
            noch kein Test
          </Badge>
        )
      }
      info={[
        t.subjectLabel,
        t.grade ? `Klasse ${t.grade}` : '',
        `${t.vocabCount} Vokabeln (${t.includedCount} abgefragt)`,
        t.hasTest ? `Test erstellt${t.variantCount > 1 ? `, ${t.variantCount} Varianten` : ''}, ${formatPoints(t.totalPoints)} Punkte` : '',
        dateFormat.format(new Date(t.updatedAt))
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  )

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
          suchHinweis="Name, Fach, Klasse"
          reihe={bib.reihe}
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
                await neuerTestMitSicherung()
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
          <BibliothekLeer ausgeblendet={bib.reihe.anzahl} leer={tests.length === 0} text="Noch keine Vokabeltests gespeichert. Gesichert wird automatisch ab der ersten Vokabel." />
        )}

        {suche ? (
          <Stack gap="xs">
            {treffer.map((t) => (
              <div key={t.id}>{zeile(t)}</div>
            ))}
          </Stack>
        ) : (
          <ThemenAnsicht
            moduleId="vokabeltest"
            artPlural="Vokabeltests"
            eigene={eigene}
            renderEigen={(m) => {
              const t = nachId.get(m.id)
              return t ? zeile(t) : null
            }}
            onNeu={onNeuImBereich}
          />
        )}
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
