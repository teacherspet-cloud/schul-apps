import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  RingProgress,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconChevronDown, IconExternalLink, IconPlayerStop, IconRefresh, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { restAnzeige } from '../shared/restzeit'
import {
  brichAb,
  brichAlleAb,
  dauerLabel,
  dokumentOffen,
  laeuft,
  laufendeAuftraege,
  setzeFehlerMeldung,
  useAuftraege,
  useSekundentakt,
  versucheErneut,
  type Auftrag
} from '../shared/auftraege'
import { sichereAlles } from '../shared/autosave'
import { openDocument, openModule } from '../shared/navigation'
import { notifyError } from '../shared/util'
import { modules } from '../modules/registry'

/**
 * Die Auftragsleiste unten rechts – über allen Programmen.
 *
 * Wunsch der Lehrkraft (25.09.2026): „Ein Fortschritt soll unten rechts in der Hauptapp
 * sichtbar sein als Layer über den anderen Apps (aus- und einklappbar)."
 *
 * Eingeklappt ist sie eine kleine Pille („2 laufen · 1 fertig") mit einem Kreis für den
 * gemeinsamen Fortschritt; ausgeklappt eine Liste je Auftrag mit Abbrechen, Öffnen und
 * Entfernen. Der Zustand wird gemerkt. Kommt ein neuer Auftrag hinzu, pulsiert die Pille
 * einmal kurz – sie klappt nicht ungefragt auf und verdeckt nichts. Gibt es keine Aufträge,
 * ist sie weg.
 *
 * Sie liegt über dem Inhalt, aber unter Dialogen (z-index unter dem der Mantine-Modale),
 * und ist am Tablet schmal (app.css, `.auftrags-layer`).
 *
 * Dazu gehört die Rückfrage beim Schließen: Laufen noch Aufträge, fragt das Programm, bevor
 * das Fenster zugeht – sonst wäre die Arbeit der letzten Minuten ohne Ergebnis verloren.
 */
export default function AuftragsLayer(): React.JSX.Element | null {
  const auftraege = useAuftraege((s) => s.auftraege)
  const offen = useAuftraege((s) => s.offen)
  const neu = useAuftraege((s) => s.neu)
  const setzeOffen = useAuftraege((s) => s.setzeOffen)
  const laufend = auftraege.filter(laeuft)
  const jetzt = useSekundentakt(laufend.length > 0)
  const [puls, setPuls] = useState(false)
  const [schliessenFrage, setSchliessenFrage] = useState(false)

  /*
   * Solange die Leiste da ist, bekommt der Inhalt unten einen Streifen Platz (app.css,
   * `data-auftraege`). Sonst läge die Pille genau über dem Hauptknopf der Formulare, der unten
   * rechts steht („Gliederung planen", „Test erstellen") – aufgefallen in der Wache
   * hintergrund-auftraege.mjs.
   */
  const da = auftraege.length > 0
  useEffect(() => {
    document.documentElement.toggleAttribute('data-auftraege', da)
  }, [da])

  // Fehler eines Auftrags erscheinen wie überall als roter Hinweis (ein Abbruch nicht)
  useEffect(() => setzeFehlerMeldung((e, titel) => notifyError(e, titel)), [])

  // Neuer Auftrag: kurz pulsieren statt aufklappen – nicht aufdringlich
  useEffect(() => {
    if (!neu) return
    setPuls(true)
    const t = setTimeout(() => setPuls(false), 2400)
    return () => clearTimeout(t)
  }, [neu])

  /*
   * Fenster schließen, während noch Aufträge laufen: erst fragen. Der Hauptprozess wartet
   * nach `rueckfrage()` auf die Entscheidung, statt nach drei Sekunden zu schließen.
   */
  useEffect(
    () =>
      window.api.fenster.onSchliessen(() => {
        if (laufendeAuftraege().length) {
          void window.api.fenster.rueckfrage().catch(() => undefined)
          setSchliessenFrage(true)
          return
        }
        void sichereAlles().finally(() => void window.api.fenster.gesichert().catch(() => undefined))
      }),
    []
  )

  const frage = (
    <Modal opened={schliessenFrage} onClose={() => weiterarbeiten()} title="Aufträge laufen noch" centered>
      <Stack>
        <Text size="sm">
          {laufend.length === 1 ? 'Ein Auftrag läuft' : `${laufend.length} Aufträge laufen`} noch. Beim Beenden wird {laufend.length === 1 ? 'er' : 'sie'}{' '}
          abgebrochen; Entwürfe bleiben in der Bibliothek.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => weiterarbeiten()}>
            Weiterarbeiten
          </Button>
          <Button
            color="red"
            onClick={() => {
              setSchliessenFrage(false)
              brichAlleAb()
              void sichereAlles().finally(() => void window.api.fenster.gesichert().catch(() => undefined))
            }}
          >
            Trotzdem beenden
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
  function weiterarbeiten(): void {
    setSchliessenFrage(false)
    void window.api.fenster.bleiben().catch(() => undefined)
  }

  if (!auftraege.length) return frage

  const fertig = auftraege.filter((a) => a.status === 'fertig').length
  const fehler = auftraege.filter((a) => a.status === 'fehler').length
  const wartend = laufend.filter((a) => a.status === 'wartend').length
  const gesamt = laufend.length ? laufend.reduce((s, a) => s + a.anteil, 0) / laufend.length : 1
  const teile = [
    laufend.length - wartend > 0 ? `${laufend.length - wartend} ${laufend.length - wartend === 1 ? 'läuft' : 'laufen'}` : '',
    wartend ? `${wartend} ${wartend === 1 ? 'wartet' : 'warten'}` : '',
    fertig ? `${fertig} fertig` : '',
    fehler ? `${fehler} mit Fehler` : ''
  ].filter(Boolean)
  const zusammenfassung = teile.join(' · ') || `${auftraege.length} beendet`

  return (
    <>
      {frage}
      <div className="auftrags-layer" data-offen={offen}>
        {offen ? (
          <Paper shadow="lg" withBorder radius="md" className="auftrags-liste" role="region" aria-label="Aufträge">
            <Group justify="space-between" px="sm" py={6} className="auftrags-kopf" wrap="nowrap">
              <Text size="sm" fw={600}>
                Aufträge · {zusammenfassung}
              </Text>
              <Group gap={4} wrap="nowrap">
                {auftraege.some((a) => !laeuft(a)) && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => auftraege.filter((a) => !laeuft(a)).forEach((a) => useAuftraege.getState().entferne(a.id))}
                  >
                    Erledigte entfernen
                  </Button>
                )}
                <ActionIcon variant="subtle" color="gray" aria-label="Aufträge einklappen" onClick={() => setzeOffen(false)}>
                  <IconChevronDown size={18} />
                </ActionIcon>
              </Group>
            </Group>
            <ScrollArea.Autosize mah={360} type="auto">
              <Stack gap={0}>
                {[...auftraege].reverse().map((a) => (
                  <AuftragsZeile key={a.id} auftrag={a} jetzt={jetzt} />
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Paper>
        ) : (
          <UnstyledButton
            className="auftrags-pille"
            data-puls={puls}
            onClick={() => setzeOffen(true)}
            aria-label={`Aufträge anzeigen: ${zusammenfassung}`}
            aria-expanded={false}
          >
            <Paper shadow="md" withBorder radius="xl" px="sm" py={4}>
              <Group gap={8} wrap="nowrap">
                <RingProgress
                  size={28}
                  thickness={4}
                  roundCaps
                  sections={[{ value: gesamt * 100, color: fehler && !laufend.length ? 'red' : laufend.length ? 'blue' : 'teal' }]}
                  label={!laufend.length ? <Group justify="center">{fehler ? <IconAlertTriangle size={12} /> : <IconCheck size={12} />}</Group> : undefined}
                />
                <Text size="sm" fw={500}>
                  {zusammenfassung}
                </Text>
              </Group>
            </Paper>
          </UnstyledButton>
        )}
      </div>
    </>
  )
}

function AuftragsZeile({ auftrag: a, jetzt }: { auftrag: Auftrag; jetzt: number }): React.JSX.Element {
  const modul = modules.find((m) => m.id === a.moduleId)
  const Symbol = modul?.icon
  const vergangen = (a.ende ?? jetzt) - a.start
  const rest = laeuft(a) ? restAnzeige(a, jetzt) : ''
  // „Öffnen": Ist das Dokument im Programm schon offen, genügt der Wechsel dorthin
  const oeffnen = (): void => {
    if (dokumentOffen(a.id)) openModule(a.moduleId)
    else void openDocument(a.moduleId, a.docId)
  }
  const farbe = a.status === 'fertig' ? 'teal' : a.status === 'fehler' ? 'red' : a.status === 'abgebrochen' ? 'gray' : (modul?.color ?? 'blue')
  return (
    <div className="auftrags-zeile" data-status={a.status} data-auftrag={a.id} data-anteil={Math.round(a.anteil * 100)}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color={farbe} size={30} radius="md" aria-hidden>
          {Symbol ? <Symbol size={18} /> : null}
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} truncate="end" title={a.titel}>
            {a.titel}
          </Text>
          <Text size="xs" c="dimmed" truncate="end">
            {modul?.name ?? a.moduleId} · {a.art}
          </Text>
          {laeuft(a) &&
            (a.anteil > 0 || a.status === 'wartend' ? (
              <Progress value={a.anteil * 100} size="sm" animated={a.status === 'laufend'} color={a.status === 'wartend' ? 'gray' : undefined} />
            ) : (
              <Loader size="xs" type="dots" />
            ))}
          <Text size="xs" c={a.status === 'fehler' ? 'red' : undefined} lineClamp={3}>
            {a.status === 'wartend' ? (a.wartegrund ?? 'Wartet auf freien Platz …') : a.meldung}
          </Text>
          <Text size="xs" c="dimmed">
            {laeuft(a) ? `${dauerLabel(vergangen)}${rest ? ` · ${rest}` : ''}` : a.status === 'fertig' ? `nach ${dauerLabel(vergangen)}` : ''}
          </Text>
          <Group gap={6} mt={2}>
            {a.rueckfrage && (
              <Button size="compact-xs" variant="filled" onClick={oeffnen}>
                Auswahl treffen
              </Button>
            )}
            {laeuft(a) && (
              <Button size="compact-xs" variant="default" leftSection={<IconPlayerStop size={12} />} onClick={() => brichAb(a.id)}>
                Abbrechen
              </Button>
            )}
            {a.status === 'fertig' && (
              <Button size="compact-xs" variant="light" color="teal" leftSection={<IconExternalLink size={12} />} onClick={oeffnen}>
                Öffnen
              </Button>
            )}
            {a.status === 'fehler' && a.kannErneut && (
              <Button size="compact-xs" variant="light" leftSection={<IconRefresh size={12} />} onClick={() => versucheErneut(a.id)}>
                Erneut versuchen
              </Button>
            )}
          </Group>
        </Stack>
        {!laeuft(a) && (
          <Tooltip label="Aus der Liste entfernen" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Auftrag entfernen" onClick={() => useAuftraege.getState().entferne(a.id)}>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </div>
  )
}
