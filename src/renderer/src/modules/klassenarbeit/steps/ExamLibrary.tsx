import { Badge, Button, Container, ScrollArea, Stack, Title } from '@mantine/core'
import { IconFilePlus } from '@tabler/icons-react'
import type { SavedExamMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { BibliothekKopf, BibliothekLeer, EintragZeile, gruppiere, useBibliothek } from '../../../shared/components/Bibliothek'
import { openSavedExam } from '../library'
import { useKlassenarbeit } from '../store'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Übersicht der gespeicherten Klassenarbeiten, nach Fach gruppiert; mit Suche eine flache
 * Trefferliste. Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function ExamLibrary({
  onNew,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  onOpened: () => void
  /** Name der offenen Arbeit – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useKlassenarbeit((s) => s.docId)
  const bib = useBibliothek<SavedExamMeta>(window.api.exams, {
    offeneId: () => useKlassenarbeit.getState().docId,
    umbenannt: (meta) => useKlassenarbeit.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    geloescht: () => useKlassenarbeit.getState().forgetSaved()
  })
  const exams = bib.eintraege ?? []
  const treffer = bib.treffer((e) => [e.topic, e.subjectLabel, `Klasse ${e.grade}`, e.grade])
  const gruppen: [string, SavedExamMeta[]][] = bib.suche.trim() ? [['', treffer]] : gruppiere(treffer, (e) => e.subjectLabel)

  const oeffnen = (id: string): void => {
    if (id === docId && zurueck !== null) return onZurueck()
    openSavedExam(id).then(onOpened).catch(notifyError)
  }

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

        {gruppen.map(([fach, liste]) => (
          <div key={fach || 'treffer'}>
            {fach && (
              <Title order={4} mt="md" mb="xs">
                {fach}
              </Title>
            )}
            <Stack gap="xs">
              {liste.map((e) => (
                <EintragZeile
                  key={e.id}
                  bib={bib}
                  eintrag={e}
                  offen={e.id === docId && zurueck !== null}
                  onOeffnen={() => oeffnen(e.id)}
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
                    bib.suche.trim() ? e.subjectLabel : '',
                    e.topic || 'ohne Thema',
                    `${e.partCount} ${e.partCount === 1 ? 'Teil' : 'Teile'}`,
                    `${e.minutes} Minuten`,
                    dateFormat.format(new Date(e.updatedAt))
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </Stack>
          </div>
        ))}
      </Container>
    </ScrollArea>
  )
}
