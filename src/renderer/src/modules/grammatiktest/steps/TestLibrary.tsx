import { Badge, Button, Container, ScrollArea, Stack } from '@mantine/core'
import { IconFilePlus, IconFolderOpen } from '@tabler/icons-react'
import type { SavedGrammarTestMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { useMemo } from 'react'
import { BibliothekKopf, BibliothekLeer, EintragZeile, useBibliothek } from '../../../shared/components/Bibliothek'
import { ThemenAnsicht } from '../../../shared/components/Themenbereiche'
import { nurListe } from '../../../shell/materialien'
import { openSavedTest } from '../library'
import { useGrammatiktest } from '../store'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Übersicht der gespeicherten Grammatiktests: Fach › Themenbereich (Paket 10b,
 * shared/components/Themenbereiche.tsx); mit Suche eine flache Trefferliste. Verhalten (Suche, Umbenennen, Kopie, Löschen) aus shared/components/Bibliothek.
 */
export default function TestLibrary({
  onNew,
  onNeuImBereich,
  onOpenFile,
  onOpened,
  zurueck,
  onZurueck
}: {
  onNew: () => void
  /** Neu anlegen und die Kennung liefern („Neu in diesem Bereich") */
  onNeuImBereich: () => Promise<string>
  /** Eine Datei des Programms öffnen (27.09.2026) */
  onOpenFile: () => void
  onOpened: () => void
  /** Name des offenen Tests – dann gibt es „Zurück zu …" */
  zurueck: string | null
  onZurueck: () => void
}): React.JSX.Element {
  const docId = useGrammatiktest((s) => s.docId)
  const bib = useBibliothek<SavedGrammarTestMeta>(window.api.grammarTests, {
    offeneId: () => useGrammatiktest.getState().docId,
    umbenannt: (meta) => useGrammatiktest.getState().markSaved(meta.id, meta.updatedAt, meta.name),
    geloescht: () => useGrammatiktest.getState().forgetSaved(),
    moduleId: 'grammatiktest'
  })
  const tests = bib.eintraege ?? []
  const treffer = bib.treffer((t) => [t.topics, t.subjectLabel, `Klasse ${t.grade}`, t.grade])
  const suche = bib.suche.trim() !== ''
  const eigene = useMemo(() => nurListe({ grammarTests: bib.eintraege ?? [] }), [bib.eintraege])
  const nachId = useMemo(() => new Map(tests.map((x) => [x.id, x])), [tests])

  const oeffnen = (id: string): void => {
    if (id === docId && zurueck !== null) return onZurueck()
    openSavedTest(id).then(onOpened).catch(notifyError)
  }

  const zeile = (t: SavedGrammarTestMeta): React.JSX.Element => (
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
        suche ? t.subjectLabel : '',
        t.topics || 'ohne Form',
        `${t.taskCount} ${t.taskCount === 1 ? 'Aufgabe' : 'Aufgaben'}`,
        `${t.points} Punkte`,
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
          titel="Meine Grammatiktests"
          untertitel={tests.length === 1 ? 'Ein gespeicherter Test' : `${tests.length} gespeicherte Tests`}
          zurueck={zurueck}
          onZurueck={onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Name, Form, Fach, Klasse"
        >
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={onOpenFile}>
            Datei öffnen …
          </Button>
          <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            Neuer Test
          </Button>
        </BibliothekKopf>

        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer leer={tests.length === 0} text="Noch kein Grammatiktest gespeichert. Neue Tests werden automatisch gesichert." />
        )}

        {suche ? (
          <Stack gap="xs">
            {treffer.map((x) => (
              <div key={x.id}>{zeile(x)}</div>
            ))}
          </Stack>
        ) : (
          <ThemenAnsicht
            moduleId="grammatiktest"
            artPlural="Grammatiktests"
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
