/**
 * Feld „Schulname" mit Schulsuche (Paket 13, Wunsch der Lehrkraft vom 26.09.2026).
 *
 * Beim Tippen schlägt das Feld Schulen aus dem mitgelieferten Verzeichnis vor (alle Länder,
 * offline; gesucht wird im Hauptprozess, siehe src/shared/schulsuche.ts). Die Auswahl setzt nur
 * den Namen – Bundesland und Schulform bietet ein unaufdringlicher Hinweis zur Übernahme an,
 * falls sie abweichen. Frei tippen bleibt möglich: Nicht jede Schule steht im Verzeichnis
 * (Lücken je Land in resources/schulen/README.md), und manche Schule nennt sich im Kopf ihrer
 * Blätter kürzer als amtlich.
 *
 * Vorgabe-Logo: Liegt für die gewählte Schule eines bei (bisher nur das Gymnasium Wesermünde),
 * wird es gesetzt, wenn noch kein Logo da ist – sonst nach kurzer Rückfrage. Ein eigenes Logo
 * wird nie ungefragt ersetzt.
 */
import { Anchor, Badge, Button, CloseButton, Combobox, Group, List, Loader, Modal, Paper, Stack, Text, TextInput, useCombobox } from '@mantine/core'
import { IconSchool } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { appSchulform, type SchulQuelle, type SchulTreffer } from '@shared/schulsuche'
import type { AppSettings, CefrTable, DeepPartial } from '@shared/types'
import { useAppSettings } from '../shared/settingsStore'
import { notifyError, notifySuccess } from '../shared/util'

/** Kurzbezeichnungen der Kürzel für die Trefferliste */
const FORM_NAME: Record<string, string> = {
  gs: 'Grundschule',
  hs: 'Hauptschule',
  rs: 'Realschule',
  igs: 'Gesamtschule',
  gym: 'Gymnasium',
  fs: 'Förderschule',
  bbs: 'Berufsbildende Schule'
}

const formenText = (t: SchulTreffer): string =>
  t.schulformen
    .map((f) => FORM_NAME[f])
    .filter(Boolean)
    .join(', ')

interface Props {
  settings: AppSettings
  update: (patch: DeepPartial<AppSettings>) => Promise<void> | void
  table: CefrTable | null
  disabled?: boolean
}

export default function SchulnameFeld({ settings, update, table, disabled }: Props): React.JSX.Element {
  const [text, setText] = useState(settings.schoolName)
  const [treffer, setTreffer] = useState<SchulTreffer[]>([])
  const [sucht, setSucht] = useState(false)
  const [gewaehlt, setGewaehlt] = useState<SchulTreffer | null>(null)
  const [logoFrage, setLogoFrage] = useState<{ schule: string; png: string } | null>(null)
  const [quellenOffen, setQuellenOffen] = useState(false)
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })
  const lauf = useRef(0)
  const { stateId, schoolTypeId } = settings.defaults

  // Von außen geändert (Sicherung eingelesen, zweites Fenster): Feld nachziehen
  useEffect(() => setText(settings.schoolName), [settings.schoolName])

  useEffect(() => {
    const q = text.trim()
    if (q.length < 2 || !combobox.dropdownOpened) {
      setTreffer([])
      return
    }
    const nr = ++lauf.current
    setSucht(true)
    // Kurz warten: Bei schnellem Tippen nicht für jeden Buchstaben suchen
    const t = setTimeout(() => {
      window.api.schulen
        .suche(q, { land: stateId, schulform: schoolTypeId })
        .then((r) => nr === lauf.current && setTreffer(r))
        .catch(() => nr === lauf.current && setTreffer([]))
        .finally(() => nr === lauf.current && setSucht(false))
    }, 120)
    return () => clearTimeout(t)
  }, [text, stateId, schoolTypeId, combobox.dropdownOpened])

  const waehle = async (t: SchulTreffer): Promise<void> => {
    setText(t.name)
    combobox.closeDropdown()
    // Anschrift für den Briefkopf der Elternbriefe (29.09.2026). Andere Schule: Anschrift ganz aus dem
    // Verzeichnis (Fehlendes bleibt leer). Dieselbe Schule erneut gewählt: nur Leeres ergänzen.
    const { settings: aktuell } = useAppSettings.getState()
    const bisher = aktuell.briefkopf ?? {}
    const gleich = aktuell.schoolName.trim() === t.name
    const wert = (neu: string, alt?: string): string => (gleich ? alt || neu : neu)
    await update({
      schoolName: t.name,
      briefkopf: {
        ...bisher,
        strasse: wert(t.strasse, bisher.strasse),
        plz: wert(t.plz, bisher.plz),
        ort: wert(t.ort, bisher.ort),
        telefon: wert(t.telefon, bisher.telefon)
      }
    })
    setGewaehlt(t)
    setLogoFrage(null)
    if (!t.logo) return
    try {
      const png = await window.api.schulen.logo(t.id)
      if (!png) return
      const { logoDataUrl, setLogo } = useAppSettings.getState()
      if (logoDataUrl === png) return
      if (!logoDataUrl) {
        await setLogo(png)
        notifySuccess(`Schullogo von „${t.name}“ übernommen.`)
      } else setLogoFrage({ schule: t.name, png })
    } catch (e) {
      notifyError(e, 'Das Logo der Schule ließ sich nicht laden')
    }
  }

  // Weichen Bundesland/Schulform des Treffers von den Einstellungen ab?
  const land = gewaehlt ? table?.states.find((s) => s.id === gewaehlt.land) : undefined
  const form =
    gewaehlt && land
      ? appSchulform(
          gewaehlt.schulformen,
          land.schoolTypes.map((s) => s.id)
        )
      : null
  const abweichend = Boolean(land && (land.id !== stateId || (form && form !== schoolTypeId)))
  const vorschlag = land ? [land.name, form ? land.schoolTypes.find((s) => s.id === form)?.name : null].filter(Boolean).join(' · ') : ''

  return (
    <Stack gap={6}>
      <Combobox store={combobox} onOptionSubmit={(id) => void waehle(treffer.find((t) => t.id === id)!)} withinPortal>
        <Combobox.Target>
          <TextInput
            label="Schulname (erscheint im Kopf von Tests und Arbeitsblättern)"
            description="Beim Tippen erscheinen Schulen aus dem Schulverzeichnis der Länder – eigener Wortlaut bleibt möglich."
            placeholder="Namen oder Ort der Schule eingeben"
            value={text}
            disabled={disabled}
            rightSection={sucht ? <Loader size={14} /> : null}
            data-schulsuche
            onChange={(e) => {
              setText(e.currentTarget.value)
              setGewaehlt(null)
              combobox.openDropdown()
              combobox.updateSelectedOptionIndex()
            }}
            onFocus={() => combobox.openDropdown()}
            onClick={() => combobox.openDropdown()}
            onBlur={() => {
              combobox.closeDropdown()
              if (text !== settings.schoolName) void update({ schoolName: text })
            }}
          />
        </Combobox.Target>
        <Combobox.Dropdown hidden={text.trim().length < 2 || (!treffer.length && sucht)}>
          <Combobox.Options mah={340} style={{ overflowY: 'auto' }} aria-label="Gefundene Schulen">
            {treffer.length ? (
              treffer.map((t) => (
                <Combobox.Option value={t.id} key={t.id}>
                  <Group gap={8} wrap="nowrap" justify="space-between">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {t.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {[[t.plz, t.ort].filter(Boolean).join(' '), t.land, formenText(t)].filter(Boolean).join(' · ')}
                      </Text>
                    </div>
                    {t.logo && (
                      <Badge size="xs" variant="light" leftSection={<IconSchool size={10} />}>
                        Logo
                      </Badge>
                    )}
                  </Group>
                </Combobox.Option>
              ))
            ) : (
              <Combobox.Empty>Keine Schule gefunden – der Name bleibt so, wie er eingetippt ist.</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {gewaehlt && abweichend && (
        <Paper withBorder p="xs" radius="sm" data-schule-uebernehmen>
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Text size="xs">
              Laut Schulverzeichnis: <b>{vorschlag}</b>
            </Text>
            <Group gap={4} wrap="nowrap">
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => {
                  void update({ defaults: { stateId: land!.id, schoolTypeId: form ?? land!.schoolTypes[0]?.id ?? '' } })
                  setGewaehlt(null)
                }}
              >
                Übernehmen
              </Button>
              <CloseButton size="sm" aria-label="Hinweis schließen" onClick={() => setGewaehlt(null)} />
            </Group>
          </Group>
        </Paper>
      )}

      {logoFrage && (
        <Paper withBorder p="xs" radius="sm" data-logo-frage>
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <img src={logoFrage.png} alt="" style={{ height: 28, width: 'auto' }} />
              <Text size="xs">Logo der Schule übernehmen? Das bisherige Logo wird dabei ersetzt.</Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <Button
                size="compact-xs"
                variant="light"
                onClick={() =>
                  void useAppSettings
                    .getState()
                    .setLogo(logoFrage.png)
                    .then(() => notifySuccess('Schullogo übernommen.'))
                    .catch(notifyError)
                    .finally(() => setLogoFrage(null))
                }
              >
                Übernehmen
              </Button>
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setLogoFrage(null)}>
                Nein
              </Button>
            </Group>
          </Group>
        </Paper>
      )}

      <Text size="xs" c="dimmed">
        Schulverzeichnis: amtliche Verzeichnisse der Länder (u. a. über JedeSchule.de) und © OpenStreetMap-Mitwirkende (ODbL) –{' '}
        <Anchor component="button" type="button" size="xs" onClick={() => setQuellenOffen(true)}>
          Quellen und Lizenzen
        </Anchor>
      </Text>
      <Modal opened={quellenOffen} onClose={() => setQuellenOffen(false)} title="Quellen des Schulverzeichnisses" size="lg">
        <SchulQuellen />
      </Modal>
    </Stack>
  )
}

/**
 * Quellenvermerk des Schulverzeichnisses. Die Lizenzen der Länder (CC BY, Datenlizenz
 * Deutschland – Namensnennung, ODbL) verlangen, die Quelle zu nennen und anzugeben, dass die
 * Daten verändert wurden – das steht hier, in den Einstellungen unter „Schule" (Link am Feld)
 * und unter „Wartung". Die Angaben selbst kommen aus schulen.json, damit sie beim nächsten
 * Aktualisieren der Daten nicht veralten.
 */
export function SchulQuellen(): React.JSX.Element {
  const [daten, setDaten] = useState<{ stand: string; anzahl: number; quellen: SchulQuelle[] } | null>(null)
  useEffect(() => {
    window.api.schulen
      .quellen()
      .then(setDaten)
      .catch(() => setDaten({ stand: '', anzahl: 0, quellen: [] }))
  }, [])
  if (!daten) return <Loader size="sm" />
  return (
    <Stack gap="xs" data-schulquellen>
      <Text size="sm">
        Zusammengestellt aus den amtlichen Schulverzeichnissen der Länder, teils über das Projekt JedeSchule.de (Open Knowledge Foundation Deutschland, CC0).
        Die Daten wurden gefiltert und vereinheitlicht{daten.stand ? ` (Stand ${daten.stand.split('-').reverse().join('.')}` : ''}
        {daten.anzahl ? `, ${daten.anzahl.toLocaleString('de-DE')} Schulen` : ''}
        {daten.stand ? ')' : ''}. Sachsen und Sachsen-Anhalt: © OpenStreetMap-Mitwirkende, Open Database License (ODbL) 1.0.
      </Text>
      <List size="xs" spacing={6}>
        {daten.quellen.map((q) => (
          <List.Item key={q.name}>
            <Text size="xs" fw={500}>
              {q.name}
              {q.laender?.length ? ` (${q.laender.join(', ')})` : ''}
            </Text>
            {q.lizenz && (
              <Text size="xs" c="dimmed">
                {q.lizenz}
              </Text>
            )}
            {q.url && (
              <Text size="xs" c="dimmed">
                {q.url}
              </Text>
            )}
          </List.Item>
        ))}
      </List>
      <Text size="xs" c="dimmed">
        Lizenztexte: govdata.de/dl-de/by-2-0 · creativecommons.org/licenses/by/4.0 · opendatacommons.org/licenses/odbl/1-0
      </Text>
    </Stack>
  )
}
