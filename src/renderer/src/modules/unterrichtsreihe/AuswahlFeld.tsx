/**
 * Aufgaben und Bausteine eines Arbeitsblatt-Schritts: Pflicht / Freiwillig ★ / Ausgeblendet (05.10.2026,
 * auswahl.ts). Das Original bleibt unverändert; neu berechnet wird nur die Schülerfassung des Schritts.
 * Die KI schlägt vor (mit Begründung), die Lehrkraft übernimmt oder verwirft.
 */
import { Accordion, Alert, Badge, Button, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { Reihe, Schritt } from '@shared/reihe'
import { notifyError } from '../../shared/util'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { auswahlEintraege, auswahlVorschlagen, auswahlWarnungen, pflichtMinuten, stufeVon, type Auswahl, type Stufe } from './auswahl'
import { blattAlsSchrittGemessen } from './schrittAusBlatt'

const ki = <T,>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

type BlattInhalt = Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>

const STUFEN = [
  { value: 'pflicht', label: 'Pflicht' },
  { value: 'frei', label: 'Freiwillig' },
  { value: 'aus', label: 'Aus' }
]

export function AuswahlFeld({
  reihe,
  schritt,
  inhalt,
  setzeInhalt,
  beschaeftigt
}: {
  reihe: Reihe
  schritt: Schritt
  inhalt: BlattInhalt
  setzeInhalt: (t: Partial<BlattInhalt>) => void
  /** Meldet das Neusetzen an den Dialog („Übernehmen" wartet) */
  beschaeftigt?: <T>(p: Promise<T>) => Promise<T>
}): React.JSX.Element | null {
  const [ws, setWs] = useState<Worksheet | null>(null)
  const [fehlt, setFehlt] = useState(false)
  const [denkt, setDenkt] = useState(false)
  const [setzt, setSetzt] = useState(false)
  useEffect(() => {
    if (!inhalt.quelle) return
    let aktiv = true
    window.api.sheets.get(inhalt.quelle).then(
      (w) => aktiv && setWs(w.payload as Worksheet),
      () => aktiv && setFehlt(true)
    )
    return () => {
      aktiv = false
    }
  }, [inhalt.quelle])
  if (!inhalt.quelle) return null
  if (fehlt)
    return (
      <Text size="xs" c="dimmed">
        Das Original-Arbeitsblatt ist nicht mehr in der Ablage – Aufgaben lassen sich hier nicht mehr ausblenden.
      </Text>
    )
  if (!ws) return null
  const auswahl = inhalt.auswahl ?? {}
  const vorschlag = inhalt.auswahlVorschlag
  const sheet = ws.sheets[0]
  if (!sheet) return null

  // Neu setzen und die Seiten messen (wie im Editor) – dauert einen Augenblick
  const anwenden = (neu: Auswahl, extra: Partial<BlattInhalt> = {}): void => {
    setzeInhalt({ auswahl: neu, ...extra })
    setSetzt(true)
    const lauf = blattAlsSchrittGemessen(inhalt.quelle, ws, '', neu, inhalt.korrekturrand !== false)
    void (beschaeftigt ? beschaeftigt(lauf) : lauf)
      .then((b) => setzeInhalt({ ...b.inhalt, titel: inhalt.titel || b.inhalt.titel, auswahl: neu, ...extra }), notifyError)
      .finally(() => setSetzt(false))
  }
  const setzeStufe = (schluessel: string, stufe: Stufe): void => {
    const neu = { ...auswahl }
    if (stufe === 'pflicht') delete neu[schluessel]
    else neu[schluessel] = stufe
    anwenden(neu)
  }
  const anzahl = { aus: Object.values(auswahl).filter((v) => v === 'aus').length, frei: Object.values(auswahl).filter((v) => v === 'frei').length }
  const warnungen = auswahlWarnungen(sheet, auswahl)
  const minuten = pflichtMinuten(sheet, auswahl)

  const Zeile = ({
    schluessel,
    kennung,
    text,
    eingerueckt,
    nurSichtbar
  }: {
    schluessel: string
    kennung: string
    text: string
    eingerueckt?: boolean
    /** Bausteine ohne Aufgabe: nur sichtbar/aus – „freiwillig" ergibt dort keinen Sinn */
    nurSichtbar?: boolean
  }): React.JSX.Element => {
    const stufe = stufeVon(auswahl, schluessel)
    const vorgeschlagen = vorschlag ? stufeVon(vorschlag.auswahl, schluessel) : null
    return (
      <Group justify="space-between" wrap="nowrap" pl={eingerueckt ? 'lg' : 0} data-auswahl-zeile={schluessel} style={{ opacity: stufe === 'aus' ? 0.55 : 1 }}>
        <Text size="sm" style={{ flex: 1, minWidth: 0 }} lineClamp={2}>
          <b>{kennung}</b> {text}
        </Text>
        {vorgeschlagen && vorgeschlagen !== stufe && (
          <Tooltip label={vorschlag?.gruende[schluessel] ?? 'Vorschlag der KI'} multiline w={280}>
            <Badge variant="light" color="grape" size="sm">
              KI: {STUFEN.find((x) => x.value === vorgeschlagen)?.label}
            </Badge>
          </Tooltip>
        )}
        <SegmentedControl
          size="xs"
          data={nurSichtbar ? [{ value: 'pflicht', label: 'Sichtbar' }, STUFEN[2]] : STUFEN}
          value={nurSichtbar && stufe === 'frei' ? 'pflicht' : stufe}
          onChange={(v) => setzeStufe(schluessel, v as Stufe)}
        />
      </Group>
    )
  }

  return (
    <Accordion variant="contained" data-auswahl-feld>
      <Accordion.Item value="auswahl">
        <Accordion.Control>
          <Text size="sm" fw={600}>
            Aufgaben und Bausteine für diesen Schritt
            {anzahl.aus || anzahl.frei ? ` – ${anzahl.aus} ausgeblendet, ${anzahl.frei} freiwillig` : ' – alles Pflicht'}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap={6}>
            <Text size="xs" c="dimmed">
              Das Original bleibt unverändert. Ausgeblendetes sehen die Lernenden nicht; Freiwilliges (★) ist sichtbar und bekommt Feedback, zählt aber nicht
              für Freischalten und Erfolg. Aufgaben werden für die Lernenden neu durchgezählt, Materialnummern bleiben wie im Original.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="grape"
                leftSection={<IconSparkles size={14} />}
                loading={denkt}
                onClick={async () => {
                  setDenkt(true)
                  try {
                    const v = await auswahlVorschlagen(reihe, schritt, sheet, ki)
                    setzeInhalt({ auswahlVorschlag: v })
                  } catch (e) {
                    notifyError(e, 'Kein Vorschlag')
                  } finally {
                    setDenkt(false)
                  }
                }}
                data-auswahl-ki
              >
                KI-Vorschlag
              </Button>
              {vorschlag && (
                <>
                  <Button size="xs" onClick={() => anwenden(vorschlag.auswahl, { auswahlVorschlag: undefined })} data-auswahl-uebernehmen>
                    Vorschlag übernehmen
                  </Button>
                  <Button size="xs" variant="default" onClick={() => setzeInhalt({ auswahlVorschlag: undefined })}>
                    Verwerfen
                  </Button>
                </>
              )}
              {(anzahl.aus > 0 || anzahl.frei > 0) && (
                <Button size="xs" variant="subtle" onClick={() => anwenden({})}>
                  Alles Pflicht
                </Button>
              )}
              {setzt && (
                <Text size="xs" c="dimmed" data-auswahl-setzt>
                  Seiten werden neu gesetzt …
                </Text>
              )}
              <Text size="xs" c="dimmed" ml="auto">
                Pflichtaufgaben laut Blatt: {minuten} min{schritt.minuten ? ` · geplant: ${schritt.minuten} min` : ''}
              </Text>
            </Group>
            {vorschlag?.hinweis && (
              <Alert variant="light" color="grape" p="xs">
                <Text size="xs">
                  {vorschlag.hinweis} (geschätzt {vorschlag.minuten} min)
                </Text>
              </Alert>
            )}
            {warnungen.map((w) => (
              <Alert key={w} variant="light" color="orange" p="xs">
                <Text size="xs">{w}</Text>
              </Alert>
            ))}
            {auswahlEintraege(sheet).map((e) => (
              <Stack key={e.schluessel} gap={4}>
                <Zeile schluessel={e.schluessel} kennung={e.kennung} text={e.text} nurSichtbar={e.art !== 'aufgabe'} />
                {stufeVon(auswahl, e.schluessel) !== 'aus' &&
                  e.teile.map((t) => <Zeile key={t.schluessel} schluessel={t.schluessel} kennung={t.kennung} text={t.text} eingerueckt />)}
              </Stack>
            ))}
            {ws.sheets.length > 1 && (
              <Text size="xs" c="dimmed">
                Die Auswahl gilt für die erste Niveaustufe; die übrigen Stufen haben eigene Bausteine und bleiben vollständig.
              </Text>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}
