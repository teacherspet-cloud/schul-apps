import { Badge, Box, Breadcrumbs, Button, Card, Container, Group, Image, Menu, ScrollArea, SegmentedControl, SimpleGrid, Text } from '@mantine/core'
import { IconChalkboard, IconFilePlus, IconFolder, IconFolderOpen } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { SavedWorksheetMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { openSavedWorksheet } from '../library'
import { useArbeitsblatt } from '../store'
import {
  type Bibliothek,
  BibliothekKopf,
  BibliothekLeer,
  EintragMenue,
  EintragRueckfragen,
  Oeffnen,
  useBibliothek
} from '../../../shared/components/Bibliothek'

export type FolderMode = 'grade' | 'topic'

/** Ordnername eines Blattes: Jahrgang („Klasse 7“) oder Thema */
export function folderOf(sheet: SavedWorksheetMeta, mode: FolderMode): string {
  return mode === 'grade' ? `Klasse ${sheet.grade}` : sheet.topic || 'Ohne Thema'
}

export interface Folder {
  name: string
  sheets: SavedWorksheetMeta[]
}

/** Gruppiert die Blätter und sortiert: Jahrgänge nach Zahl, Themen alphabetisch. */
export function buildFolders(sheets: SavedWorksheetMeta[], mode: FolderMode): Folder[] {
  const map = new Map<string, SavedWorksheetMeta[]>()
  for (const s of sheets) {
    const name = folderOf(s, mode)
    map.set(name, [...(map.get(name) ?? []), s])
  }
  const collator = new Intl.Collator('de', { numeric: true })
  return [...map.entries()]
    .map(([name, list]) => ({ name, sheets: [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }))
    .sort((a, b) => collator.compare(a.name, b.name))
}

const dateText = (iso: string): string => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Kachel, die per Klick und per Tastatur (Enter/Leertaste) aufgeht */
const kachelTasten = (
  auf: () => void
): { role: string; tabIndex: number; onClick: () => void; onKeyDown: (e: React.KeyboardEvent) => void; style: React.CSSProperties } => ({
  role: 'button',
  tabIndex: 0,
  onClick: auf,
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      auf()
    }
  },
  style: { cursor: 'pointer' }
})

/**
 * Startseite des Arbeitsblatt-Programms: gespeicherte Blätter nach Fach, darin nach Jahrgang
 * oder Thema. Mit Suche statt der Ordner eine flache Trefferliste über alle Fächer – vorher
 * filterte die Suche nur die Ordner, und man musste sich trotzdem durchklicken.
 * Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function WorksheetLibrary({
  onNew,
  onOpenFile,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  onOpenFile: () => void
  onOpened: () => void
  /** Name des offenen Blattes – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const [subject, setSubject] = useState<string | null>(null)
  const [mode, setMode] = useState<FolderMode>('grade')
  const [folder, setFolder] = useState<string | null>(null)
  const docId = useArbeitsblatt((s) => s.docId)
  const bib = useBibliothek<SavedWorksheetMeta>(window.api.sheets, {
    offeneId: () => useArbeitsblatt.getState().docId,
    // Ist das Blatt gerade offen, übernimmt es den Namen – sonst schriebe die nächste Sicherung den alten zurück
    umbenannt: (meta) => useArbeitsblatt.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    // Das offene Blatt darf nicht weiter auf den gelöschten Eintrag zeigen – sonst legte die
    // nächste Sicherung ihn unter derselben Kennung stillschweigend wieder an
    geloescht: () => useArbeitsblatt.getState().forgetSaved()
  })
  const sheets = useMemo(() => bib.eintraege ?? [], [bib.eintraege])
  const suche = bib.suche.trim()
  const treffer = bib.treffer((s) => [s.topic, s.subjectLabel, `Klasse ${s.grade}`, s.grade, s.schoolTypeName])

  const subjects = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const s of sheets) {
      const entry = map.get(s.subjectId) ?? { label: s.subjectLabel, count: 0 }
      map.set(s.subjectId, { label: entry.label, count: entry.count + 1 })
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'de'))
  }, [sheets])

  const inSubject = useMemo(() => (subject ? sheets.filter((s) => s.subjectId === subject) : []), [sheets, subject])
  const folders = useMemo(() => (subject ? buildFolders(inSubject, mode) : []), [inSubject, mode, subject])
  const openFolder = folder ? folders.find((f) => f.name === folder) : null
  const subjectLabel = subjects.find(([id]) => id === subject)?.[1].label ?? ''

  const open = async (id: string): Promise<void> => {
    if (id === docId && zurueck !== null) return onZurueck()
    try {
      await openSavedWorksheet(id)
      onOpened()
    } catch (e) {
      notifyError(e, 'Arbeitsblatt konnte nicht geöffnet werden')
    }
  }

  const karten = (liste: SavedWorksheetMeta[]): React.JSX.Element => (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
      {liste.map((s) => (
        <BlattKarte key={s.id} bib={bib} sheet={s} offen={s.id === docId && zurueck !== null} onOeffnen={() => void open(s.id)} />
      ))}
    </SimpleGrid>
  )

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel="Meine Arbeitsblätter"
          untertitel={`${sheets.length} gespeicherte Arbeitsblätter – automatisch gesichert und hier weiter bearbeitbar.`}
          zurueck={zurueck}
          onZurueck={onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, Thema, Fach, Klasse"
        >
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={onOpenFile}>
            Datei öffnen …
          </Button>
          <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            Neues Arbeitsblatt
          </Button>
        </BibliothekKopf>

        {bib.eintraege && (suche ? treffer.length === 0 : sheets.length === 0) && (
          <BibliothekLeer
            leer={sheets.length === 0}
            text="Noch keine Arbeitsblätter gespeichert. Neue Blätter werden ab dem ersten Schritt automatisch gesichert."
          />
        )}

        {suche ? (
          karten(treffer)
        ) : (
          <>
            {sheets.length > 0 && (
              <Group justify="space-between" mb="sm">
                <Breadcrumbs separator="›">
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => {
                      setSubject(null)
                      setFolder(null)
                    }}
                  >
                    Alle Fächer
                  </Button>
                  {subject && (
                    <Button variant="subtle" size="compact-sm" onClick={() => setFolder(null)}>
                      {subjectLabel}
                    </Button>
                  )}
                  {openFolder && (
                    <Text size="sm" fw={600}>
                      {openFolder.name}
                    </Text>
                  )}
                </Breadcrumbs>
                {subject && (
                  <SegmentedControl
                    size="xs"
                    value={mode}
                    onChange={(v) => {
                      setMode(v as FolderMode)
                      setFolder(null)
                    }}
                    data={[
                      { value: 'grade', label: 'Nach Jahrgang' },
                      { value: 'topic', label: 'Nach Thema' }
                    ]}
                  />
                )}
              </Group>
            )}

            {!subject && (
              <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
                {subjects.map(([id, { label, count }]) => (
                  <Card key={id} withBorder padding="md" className="picker-tile" {...kachelTasten(() => setSubject(id))}>
                    <Group gap="sm" wrap="nowrap">
                      <IconFolder size={28} />
                      <div style={{ minWidth: 0 }}>
                        <Text fw={600} lineClamp={1}>
                          {label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {count} {count === 1 ? 'Arbeitsblatt' : 'Arbeitsblätter'}
                        </Text>
                      </div>
                    </Group>
                  </Card>
                ))}
              </SimpleGrid>
            )}

            {subject && !openFolder && (
              <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
                {folders.map((f) => (
                  <Card key={f.name} withBorder padding="md" className="picker-tile" {...kachelTasten(() => setFolder(f.name))}>
                    <Group gap="sm" wrap="nowrap">
                      <IconFolder size={28} />
                      <div style={{ minWidth: 0 }}>
                        <Text fw={600} lineClamp={2}>
                          {f.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {f.sheets.length} {f.sheets.length === 1 ? 'Blatt' : 'Blätter'}
                        </Text>
                      </div>
                    </Group>
                  </Card>
                ))}
              </SimpleGrid>
            )}

            {openFolder && karten(openFolder.sheets)}
          </>
        )}

        <Box h="lg" />
      </Container>
    </ScrollArea>
  )
}

/** Ein Blatt als Karte mit Vorschaubild; Umbenennen und Löschen-Rückfrage direkt darin */
function BlattKarte({
  bib,
  sheet: s,
  offen,
  onOeffnen
}: {
  bib: Bibliothek<SavedWorksheetMeta>
  sheet: SavedWorksheetMeta
  offen: boolean
  onOeffnen: () => void
}): React.JSX.Element {
  const neu = bib.neuId === s.id
  return (
    <Card withBorder padding="sm" data-bibliothek-eintrag={s.name} style={neu ? { borderColor: 'var(--mantine-color-teal-5)' } : undefined}>
      <Card.Section
        onClick={onOeffnen}
        style={{
          cursor: 'pointer',
          background: 'var(--mantine-color-gray-1)',
          height: 170,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {s.thumb ? (
          <Image src={s.thumb} h={166} fit="contain" alt="" />
        ) : (
          <Text size="xs" c="dimmed">
            {s.sheetCount === 0 ? 'Entwurf – noch nicht ausformuliert' : 'Keine Vorschau'}
          </Text>
        )}
      </Card.Section>
      <Group justify="space-between" mt="xs" wrap="nowrap" align="flex-start">
        <Oeffnen name={s.name} onOeffnen={onOeffnen}>
          <Text fw={600} lineClamp={2}>
            {s.name}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {s.subjectLabel} · Klasse {s.grade} · {dateText(s.updatedAt)}
          </Text>
          <Group gap={4} mt={4}>
            {offen && (
              <Badge size="xs" variant="filled" color="gray">
                geöffnet
              </Badge>
            )}
            {neu && (
              <Badge size="xs" variant="light" color="teal">
                neu
              </Badge>
            )}
            {/* Entwürfe werden ab dem ersten Schritt gesichert – noch ohne ausformuliertes Blatt */}
            {s.sheetCount === 0 && (
              <Badge size="xs" variant="light" color="gray">
                Entwurf
              </Badge>
            )}
            {s.sheetCount > 1 && (
              <Badge size="xs" variant="light">
                {s.sheetCount} Niveaustufen
              </Badge>
            )}
            {s.hasBoard && (
              <Badge size="xs" variant="light" leftSection={<IconChalkboard size={11} />}>
                Tafelbild
              </Badge>
            )}
          </Group>
        </Oeffnen>
        <EintragMenue
          bib={bib}
          eintrag={s}
          vorne={
            <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={onOeffnen}>
              Öffnen
            </Menu.Item>
          }
        />
      </Group>
      <EintragRueckfragen bib={bib} eintrag={s} />
    </Card>
  )
}
