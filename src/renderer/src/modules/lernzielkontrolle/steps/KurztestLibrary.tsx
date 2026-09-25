import { Badge, Button, Container, ScrollArea, Stack, Title } from '@mantine/core'
import { IconFilePlus } from '@tabler/icons-react'
import type { SavedKurztestMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { BibliothekKopf, BibliothekLeer, EintragZeile, gruppiere, useBibliothek } from '../../../shared/components/Bibliothek'
import { stateInfo } from '../../arbeitsblatt/didactics/states'
import { openSavedKurztest } from '../library'
import { useLernzielkontrolle } from '../store'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Übersicht der gespeicherten Lernzielkontrollen, nach Fach gruppiert; mit Suche eine flache
 * Trefferliste. Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 *
 * Die Kennzeichnung in der Zeile ist bewusst eine andere als beim Grammatiktest: Hier stehen
 * das Landesformat und das Bundesland, denn daran erkennt man eine Lernzielkontrolle wieder.
 * Dieselbe Kontrolle heißt in Bayern „Stegreifaufgabe" und in Rheinland-Pfalz „Schriftliche
 * Überprüfung" – ohne diese Angabe sähen zwei Einträge gleich aus, die es nicht sind.
 */
export default function KurztestLibrary({
  onNew,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  onOpened: () => void
  /** Name der offenen Kontrolle – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useLernzielkontrolle((s) => s.docId)
  const bib = useBibliothek<SavedKurztestMeta>(window.api.kurztests, {
    offeneId: () => useLernzielkontrolle.getState().docId,
    umbenannt: (meta) => useLernzielkontrolle.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    geloescht: () => useLernzielkontrolle.getState().forgetSaved()
  })
  const tests = bib.eintraege ?? []
  const treffer = bib.treffer((t) => [t.thema, t.subjectLabel, `Klasse ${t.grade}`, t.grade, t.bezeichnung, stateInfo(t.stateId).name])
  const gruppen: [string, SavedKurztestMeta[]][] = bib.suche.trim() ? [['', treffer]] : gruppiere(treffer, (t) => t.subjectLabel)

  const oeffnen = (id: string): void => {
    if (id === docId && zurueck !== null) return onZurueck()
    openSavedKurztest(id).then(onOpened).catch(notifyError)
  }

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <BibliothekKopf
          titel="Meine Lernzielkontrollen"
          untertitel={tests.length === 1 ? 'Eine gespeicherte Kontrolle' : `${tests.length} gespeicherte Kontrollen`}
          zurueck={zurueck}
          onZurueck={onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, Thema, Fach, Klasse, Bundesland"
        >
          <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            Neue Kontrolle
          </Button>
        </BibliothekKopf>

        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer
            leer={tests.length === 0}
            text="Noch nichts gespeichert. Sobald ein Thema eingetragen ist, wird die Kontrolle automatisch gesichert."
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
                      <Badge variant="light" color="grape">
                        {t.bezeichnung}
                      </Badge>
                      {/* Entwürfe werden ab dem Thema gesichert – noch ohne Aufgaben */}
                      {t.taskCount === 0 && (
                        <Badge variant="light" color="gray">
                          Entwurf
                        </Badge>
                      )}
                      {t.varianten > 1 && (
                        <Badge variant="outline" color="gray">
                          {t.varianten} Fassungen
                        </Badge>
                      )}
                    </>
                  }
                  info={[
                    bib.suche.trim() ? t.subjectLabel : '',
                    t.thema,
                    stateInfo(t.stateId).name,
                    `${t.taskCount} ${t.taskCount === 1 ? 'Teilaufgabe' : 'Teilaufgaben'}`,
                    t.points > 0 ? `${t.points} Punkte` : '',
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
