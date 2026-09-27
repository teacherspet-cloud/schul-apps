import { Badge, Button, Container, ScrollArea, Stack } from '@mantine/core'
import { IconFilePlus, IconFolderOpen } from '@tabler/icons-react'
import type { SavedKurztestMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { useMemo } from 'react'
import { BibliothekKopf, BibliothekLeer, EintragZeile, useBibliothek } from '../../../shared/components/Bibliothek'
import { ThemenAnsicht } from '../../../shared/components/Themenbereiche'
import { nurListe } from '../../../shell/materialien'
import { stateInfo } from '../../arbeitsblatt/didactics/states'
import { openSavedKurztest } from '../library'
import { useLernzielkontrolle } from '../store'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Übersicht der gespeicherten Lernzielkontrollen: Fach › Themenbereich (Paket 10b,
 * shared/components/Themenbereiche.tsx); mit Suche eine flache Trefferliste. Verhalten
 * (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 *
 * Die Kennzeichnung in der Zeile ist bewusst eine andere als beim Grammatiktest: Hier stehen
 * das Landesformat und das Bundesland, denn daran erkennt man eine Lernzielkontrolle wieder.
 * Dieselbe Kontrolle heißt in Bayern „Stegreifaufgabe" und in Rheinland-Pfalz „Schriftliche
 * Überprüfung" – ohne diese Angabe sähen zwei Einträge gleich aus, die es nicht sind.
 */
export default function KurztestLibrary({
  onNew,
  onNeuImBereich,
  onOpenFile,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  /** Neue Kontrolle anlegen und ihre Kennung liefern („Neu in diesem Bereich") */
  onNeuImBereich: () => Promise<string>
  /** Eine Datei des Programms öffnen (27.09.2026) */
  onOpenFile: () => void
  onOpened: () => void
  /** Name der offenen Kontrolle – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useLernzielkontrolle((s) => s.docId)
  const bib = useBibliothek<SavedKurztestMeta>(window.api.kurztests, {
    offeneId: () => useLernzielkontrolle.getState().docId,
    umbenannt: (meta) => useLernzielkontrolle.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    geloescht: () => useLernzielkontrolle.getState().forgetSaved(),
    moduleId: 'lernzielkontrolle'
  })
  const tests = bib.eintraege ?? []
  const treffer = bib.treffer((t) => [t.thema, t.subjectLabel, `Klasse ${t.grade}`, t.grade, t.bezeichnung, stateInfo(t.stateId).name])
  const suche = bib.suche.trim() !== ''
  const eigene = useMemo(() => nurListe({ kurztests: bib.eintraege ?? [] }), [bib.eintraege])
  const nachId = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests])

  const oeffnen = (id: string): void => {
    if (id === docId && zurueck !== null) return onZurueck()
    openSavedKurztest(id).then(onOpened).catch(notifyError)
  }

  const zeile = (t: SavedKurztestMeta): React.JSX.Element => (
    <EintragZeile
      bib={bib}
      eintrag={t}
      offen={t.id === docId && zurueck !== null}
      onOeffnen={() => oeffnen(t.id)}
      // Bei der Suche fehlt die Fach-Überschrift – dann steht der Farbpunkt am Eintrag
      fach={suche ? t.subjectLabel : undefined}
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
        suche ? t.subjectLabel : '',
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
  )

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
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={onOpenFile}>
            Datei öffnen …
          </Button>
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

        {suche ? (
          <Stack gap="xs">
            {treffer.map((t) => (
              <div key={t.id}>{zeile(t)}</div>
            ))}
          </Stack>
        ) : (
          <ThemenAnsicht
            moduleId="lernzielkontrolle"
            artPlural="Lernzielkontrollen"
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
