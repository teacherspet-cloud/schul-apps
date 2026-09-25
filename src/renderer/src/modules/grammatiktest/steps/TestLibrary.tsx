import { Badge, Button, Container, ScrollArea, Stack, Title } from '@mantine/core'
import { IconFilePlus } from '@tabler/icons-react'
import type { SavedGrammarTestMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { BibliothekKopf, BibliothekLeer, EintragZeile, gruppiere, useBibliothek } from '../../../shared/components/Bibliothek'
import { openSavedTest } from '../library'
import { useGrammatiktest } from '../store'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Übersicht der gespeicherten Grammatiktests, nach Fach gruppiert; mit Suche eine flache
 * Trefferliste. Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function TestLibrary({
  onNew,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  onOpened: () => void
  /** Name des offenen Tests – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useGrammatiktest((s) => s.docId)
  const bib = useBibliothek<SavedGrammarTestMeta>(window.api.grammarTests, {
    offeneId: () => useGrammatiktest.getState().docId,
    umbenannt: (meta) => useGrammatiktest.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    geloescht: () => useGrammatiktest.getState().forgetSaved()
  })
  const tests = bib.eintraege ?? []
  const treffer = bib.treffer((t) => [t.topics, t.subjectLabel, `Klasse ${t.grade}`, t.grade])
  const gruppen: [string, SavedGrammarTestMeta[]][] = bib.suche.trim() ? [['', treffer]] : gruppiere(treffer, (t) => t.subjectLabel)

  const oeffnen = (id: string): void => {
    if (id === docId && zurueck !== null) return onZurueck()
    openSavedTest(id).then(onOpened).catch(notifyError)
  }

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel="Meine Grammatiktests"
          untertitel={tests.length === 1 ? 'Ein gespeicherter Test' : `${tests.length} gespeicherte Tests`}
          zurueck={zurueck}
          onZurueck={onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, Form, Fach, Klasse"
        >
          <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            Neuer Test
          </Button>
        </BibliothekKopf>

        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer leer={tests.length === 0} text="Noch kein Grammatiktest gespeichert. Neue Tests werden automatisch gesichert." />
        )}

        {gruppen.map(([fach, liste]) => (
          <div key={fach || 'treffer'}>
            {fach && (
              <Title order={4} mt="md" mb="xs">
                {fach}
              </Title>
            )}
            <Stack gap="xs">
              {liste.map((t) => (
                <EintragZeile
                  key={t.id}
                  bib={bib}
                  eintrag={t}
                  offen={t.id === docId && zurueck !== null}
                  onOeffnen={() => oeffnen(t.id)}
                  kennzeichen={
                    <>
                      <Badge variant="light">Klasse {t.grade}</Badge>
                      {/* Entwürfe werden ab dem ersten Schritt gesichert – noch ohne Aufgaben */}
                      {t.taskCount === 0 && (
                        <Badge variant="light" color="gray">
                          Entwurf
                        </Badge>
                      )}
                      {t.graded ? (
                        <Badge variant="light" color="grape">
                          benotet
                        </Badge>
                      ) : (
                        <Badge variant="outline" color="gray">
                          ohne Note
                        </Badge>
                      )}
                    </>
                  }
                  info={[
                    bib.suche.trim() ? t.subjectLabel : '',
                    t.topics || 'ohne Form',
                    `${t.taskCount} ${t.taskCount === 1 ? 'Aufgabe' : 'Aufgaben'}`,
                    `${t.points} Punkte`,
                    `${t.minutes} Minuten`,
                    dateFormat.format(new Date(t.updatedAt))
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
