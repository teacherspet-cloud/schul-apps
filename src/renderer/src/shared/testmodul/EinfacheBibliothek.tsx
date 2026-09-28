import { Badge, Button, Container, ScrollArea, Stack } from '@mantine/core'
import { IconFilePlus, IconFolderOpen } from '@tabler/icons-react'
import type { SavedDokumentMeta } from '@shared/apiShape'
import { BibliothekKopf, BibliothekLeer, EintragZeile, FachUeberschrift, gruppiere, useBibliothek, type BibliotheksApi } from '../components/Bibliothek'
import { notifyError } from '../util'
import type { BibliotheksSeiteProps } from './ZweiSchrittModul'

const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Bibliotheksseite der neuen Programme (Rückmeldung, Elternbrief – Großprogramm 0.4): Suche,
 * Umbenennen, Kopie, Löschen wie überall (shared/components/Bibliothek), nach Fach gruppiert.
 * Die Themenbereiche der älteren Programme kommen später dazu, wenn die neuen Programme
 * dort als Materialart geführt werden.
 */
export default function EinfacheBibliothek({
  props,
  api,
  moduleId,
  titel,
  einzahl,
  mehrzahl,
  neuText,
  offeneId,
  umbenannt,
  geloescht,
  oeffnen,
  kennzeichen,
  info
}: {
  props: BibliotheksSeiteProps
  api: BibliotheksApi<SavedDokumentMeta>
  moduleId: string
  titel: string
  einzahl: string
  mehrzahl: string
  neuText: string
  offeneId: () => string
  umbenannt: (m: SavedDokumentMeta) => void
  geloescht: () => void
  oeffnen: (id: string) => Promise<void>
  kennzeichen?: (m: SavedDokumentMeta) => React.ReactNode
  info?: (m: SavedDokumentMeta) => string[]
}): React.JSX.Element {
  const bib = useBibliothek<SavedDokumentMeta>(api, { offeneId, umbenannt, geloescht, moduleId })
  const alle = bib.eintraege ?? []
  const treffer = bib.treffer((m) => [m.subjectLabel, m.thema, m.grade ? `Klasse ${m.grade}` : ''])
  const suche = bib.suche.trim() !== ''
  const offen = offeneId()

  const zeile = (m: SavedDokumentMeta): React.JSX.Element => (
    <EintragZeile
      key={m.id}
      bib={bib}
      eintrag={m}
      offen={m.id === offen && props.zurueck !== null}
      onOeffnen={() => (m.id === offen && props.zurueck !== null ? props.onZurueck() : oeffnen(m.id).then(props.onOpened).catch(notifyError))}
      fach={suche ? m.subjectLabel : undefined}
      kennzeichen={
        <>
          {m.grade ? <Badge variant="light">Klasse {m.grade}</Badge> : null}
          {kennzeichen?.(m)}
        </>
      }
      info={[...(info?.(m) ?? [m.thema ?? '']), datum.format(new Date(m.updatedAt))].filter(Boolean).join(' · ')}
    />
  )

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel={titel}
          untertitel={alle.length === 1 ? `${einzahl} gespeichert` : `${alle.length} ${mehrzahl} gespeichert`}
          zurueck={props.zurueck}
          onZurueck={props.onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, Fach, Thema, Klasse"
        >
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={props.onOpenFile}>
            Datei öffnen …
          </Button>
          <Button leftSection={<IconFilePlus size={16} />} onClick={props.onNew}>
            {neuText}
          </Button>
        </BibliothekKopf>
        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer leer={alle.length === 0} text="Noch nichts gespeichert – es wird automatisch gesichert, sobald etwas eingetragen ist." />
        )}
        {suche ? (
          <Stack gap="xs">{treffer.map(zeile)}</Stack>
        ) : (
          gruppiere(alle, (m) => m.subjectLabel || 'Ohne Fach').map(([fach, liste]) => (
            <div key={fach}>
              <FachUeberschrift fach={fach} />
              <Stack gap="xs">{liste.map(zeile)}</Stack>
            </div>
          ))
        )}
      </Container>
    </ScrollArea>
  )
}
