import { Badge, Box, Button, Card, Container, Group, Image, Menu, ScrollArea, SimpleGrid, Text } from '@mantine/core'
import { FachPunkt } from '../../../shared/components/FachFarbe'
import { IconChalkboard, IconFilePlus, IconFolderOpen } from '@tabler/icons-react'
import { useEffect, useMemo, useRef } from 'react'
import { ThemenAnsicht } from '../../../shared/components/Themenbereiche'
import { nurListe } from '../../../shell/materialien'
import type { SavedWorksheetMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { openSavedWorksheet, vorschauenNachtragen } from '../library'
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

const dateText = (iso: string): string => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * Startseite des Arbeitsblatt-Programms: gespeicherte Blätter nach Fach › Themenbereich
 * (Paket 10b, shared/components/Themenbereiche.tsx), der Jahrgang als Filter oben. Mit Suche
 * statt der Ordner eine flache Trefferliste über alle Fächer.
 *
 * Bis Paket 10b gab es hier Ordner „nach Jahrgang" oder „nach Thema" – die Themenordner
 * entstanden aus dem wörtlichen Themen-Text und zersplitterten: „Fotosynthese" und
 * „Photosynthese – Versuch" lagen in zwei Ordnern mit je einem Blatt.
 * Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function WorksheetLibrary({
  onNew,
  onNeuImBereich,
  onOpenFile,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  /** Neues Blatt anlegen und seine Kennung liefern („Neu in diesem Bereich") */
  onNeuImBereich: () => Promise<string>
  onOpenFile: () => void
  onOpened: () => void
  /** Name des offenen Blattes – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useArbeitsblatt((s) => s.docId)
  const bib = useBibliothek<SavedWorksheetMeta>(window.api.sheets, {
    offeneId: () => useArbeitsblatt.getState().docId,
    // Ist das Blatt gerade offen, übernimmt es den Namen – sonst schriebe die nächste Sicherung den alten zurück
    umbenannt: (meta) => useArbeitsblatt.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    // Das offene Blatt darf nicht weiter auf den gelöschten Eintrag zeigen – sonst legte die
    // nächste Sicherung ihn unter derselben Kennung stillschweigend wieder an
    geloescht: () => useArbeitsblatt.getState().forgetSaved(),
    moduleId: 'arbeitsblatt'
  })
  // Fehlende Vorschaubilder nachtragen (Blätter, die ohne offenen Editor fertig wurden) – einmal je Öffnen
  const nachgetragen = useRef(false)
  useEffect(() => {
    if (!bib.eintraege || nachgetragen.current) return
    nachgetragen.current = true
    void vorschauenNachtragen(bib.eintraege).then((etwas) => etwas && bib.neuLaden())
  }, [bib.eintraege, bib])
  const sheets = useMemo(() => bib.eintraege ?? [], [bib.eintraege])
  const suche = bib.suche.trim()
  const treffer = bib.treffer((s) => [s.topic, s.subjectLabel, `Klasse ${s.grade}`, s.grade, s.schoolTypeName])
  const eigene = useMemo(() => nurListe({ sheets }), [sheets])
  const nachId = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets])

  const open = async (id: string): Promise<void> => {
    if (id === docId && zurueck !== null) return onZurueck()
    try {
      await openSavedWorksheet(id)
      onOpened()
    } catch (e) {
      notifyError(e, 'Arbeitsblatt konnte nicht geöffnet werden')
    }
  }

  const karte = (s: SavedWorksheetMeta): React.JSX.Element => (
    <BlattKarte bib={bib} sheet={s} offen={s.id === docId && zurueck !== null} onOeffnen={() => void open(s.id)} />
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
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {treffer.map((s) => (
              <div key={s.id}>{karte(s)}</div>
            ))}
          </SimpleGrid>
        ) : (
          <ThemenAnsicht
            moduleId="arbeitsblatt"
            artPlural="Arbeitsblätter"
            eigene={eigene}
            darstellung="karten"
            renderEigen={(m) => {
              const s = nachId.get(m.id)
              return s ? karte(s) : null
            }}
            onNeu={onNeuImBereich}
          />
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
          <Group gap={6} wrap="nowrap">
            <FachPunkt fach={s.subjectId} groesse={8} />
            <Text size="xs" c="dimmed" lineClamp={1}>
              {s.subjectLabel} · Klasse {s.grade} · {dateText(s.updatedAt)}
            </Text>
          </Group>
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
