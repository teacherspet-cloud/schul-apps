import { Badge, Button, Container, ScrollArea, Stack } from '@mantine/core'
import { IconFilePlus, IconFolderOpen } from '@tabler/icons-react'
import type { SavedExamMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { useMemo } from 'react'
import { BibliothekKopf, BibliothekLeer, EintragZeile, useBibliothek } from '../../../shared/components/Bibliothek'
import { ThemenAnsicht } from '../../../shared/components/Themenbereiche'
import { nurListe } from '../../../shell/materialien'
import { openSavedExam } from '../library'
import { useKlassenarbeit } from '../store'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Übersicht der gespeicherten Klassenarbeiten: Fach › Themenbereich (Paket 10b,
 * shared/components/Themenbereiche.tsx); mit Suche eine flache Trefferliste. Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function ExamLibrary({
  onNew,
  onNeuImBereich,
  onOpenFile,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  /** Eine .klassenarbeit-Datei öffnen (27.09.2026) */
  onOpenFile: () => void
  /** Neu anlegen und die Kennung liefern („Neu in diesem Bereich") */
  onNeuImBereich: () => Promise<string>
  onOpened: () => void
  /** Name der offenen Arbeit – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useKlassenarbeit((s) => s.docId)
  const bib = useBibliothek<SavedExamMeta>(window.api.exams, {
    offeneId: () => useKlassenarbeit.getState().docId,
    umbenannt: (meta) => useKlassenarbeit.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    geloescht: () => useKlassenarbeit.getState().forgetSaved(),
    moduleId: 'klassenarbeit'
  })
  const exams = bib.eintraege ?? []
  const treffer = bib.treffer((e) => [e.topic, e.subjectLabel, `Klasse ${e.grade}`, e.grade])
  const suche = bib.suche.trim() !== ''
  const eigene = useMemo(() => nurListe({ exams: bib.eintraege ?? [] }), [bib.eintraege])
  const nachId = useMemo(() => new Map(exams.map((x) => [x.id, x])), [exams])

  const oeffnen = (id: string): void => {
    if (id === docId && zurueck !== null) return onZurueck()
    openSavedExam(id).then(onOpened).catch(notifyError)
  }

  const zeile = (e: SavedExamMeta): React.JSX.Element => (
    <EintragZeile
      bib={bib}
      eintrag={e}
      offen={e.id === docId && zurueck !== null}
      onOeffnen={() => oeffnen(e.id)}
      // Bei der Suche fehlt die Fach-Überschrift – dann steht der Farbpunkt am Eintrag
      fach={suche ? e.subjectLabel : undefined}
      kennzeichen={
        <>
          <Badge variant="light">Klasse {e.grade}</Badge>
          {e.hasTasks ? (
            <Badge variant="light" color="teal">
              Aufgaben erstellt
            </Badge>
          ) : (
            // Entwürfe werden ab dem ersten Schritt gesichert – auch ganz ohne geplante Teile
            <Badge variant="outline" color="gray">
              {e.partCount ? 'nur Rahmen' : 'Entwurf'}
            </Badge>
          )}
        </>
      }
      info={[
        suche ? e.subjectLabel : '',
        e.topic || 'ohne Thema',
        `${e.partCount} ${e.partCount === 1 ? 'Teil' : 'Teile'}`,
        `${e.minutes} Minuten`,
        dateFormat.format(new Date(e.updatedAt))
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  )

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel="Meine Klassenarbeiten"
          untertitel={exams.length === 1 ? 'Eine gespeicherte Arbeit' : `${exams.length} gespeicherte Arbeiten`}
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
            Neue Klassenarbeit
          </Button>
        </BibliothekKopf>

        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer
            leer={exams.length === 0}
            text="Noch keine Klassenarbeit gespeichert. Neue Arbeiten werden ab dem ersten Schritt automatisch gesichert."
          />
        )}

        {suche ? (
          <Stack gap="xs">
            {treffer.map((x) => (
              <div key={x.id}>{zeile(x)}</div>
            ))}
          </Stack>
        ) : (
          <ThemenAnsicht
            moduleId="klassenarbeit"
            artPlural="Klassenarbeiten"
            eigene={eigene}
            renderEigen={(m) => {
              const x = nachId.get(m.id)
              return x ? zeile(x) : null
            }}
            onNeu={onNeuImBereich}
          />
        )}
      </Container>
    </ScrollArea>
  )
}
