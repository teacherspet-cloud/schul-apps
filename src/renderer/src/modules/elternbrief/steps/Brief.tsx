import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Menu,
  Modal,
  MultiSelect,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconAlertTriangle, IconFileTypeDocx, IconFileTypePdf, IconHistory, IconLanguage, IconRefresh, IconTrash, IconWand } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { speichereAusgabe, WORD_FILTER } from '../../../shared/export/ausgabe'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { FAMILIENSPRACHEN, spracheNach } from '../../../shared/familiensprachen'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, safeFileName } from '../../../shared/util'
import { briefNeuFormulieren, briefUebersetzen, teileNachuebersetzen, teilUeberarbeiten } from '../auftrag'
import { briefDocx, briefHtml, type Briefkopf } from '../ausgabe'
import { AKTIONEN, geaenderteTeile, gleicherAufbau, pruefeBrief, teilLesen, type Aktion } from '../bearbeiten'
import { DEUTSCHER_VERMERK, TOENE, type BriefText } from '../model'
import { useElternbrief } from '../store'

/** Zauberstab an einem Teil des deutschen Briefes: Schnellwahl oder eigener Änderungshinweis */
function Zauberstab({ onAktion }: { onAktion: (aktion: Aktion | null, hinweis: string) => void }): React.JSX.Element {
  const [hinweis, setHinweis] = useState('')
  const [offen, setOffen] = useState(false)
  return (
    <Menu opened={offen} onChange={setOffen} position="bottom-end" width={300} withinPortal closeOnItemClick>
      <Menu.Target>
        <Tooltip label="Mit KI überarbeiten">
          <ActionIcon variant="subtle" aria-label="Mit KI überarbeiten" data-eb-zauberstab>
            <IconWand size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {AKTIONEN.map((a) => (
          <Menu.Item key={a.value} onClick={() => onAktion(a.value, '')} data-eb-aktion={a.value}>
            {a.label}
          </Menu.Item>
        ))}
        <Divider my={4} />
        <Stack gap={6} p={6}>
          <TextInput
            size="xs"
            placeholder="Eigener Änderungshinweis, z. B. „Kosten zuerst nennen“"
            value={hinweis}
            onChange={(e) => setHinweis(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hinweis.trim()) {
                onAktion(null, hinweis)
                setHinweis('')
                setOffen(false)
              }
            }}
            data-eb-hinweis
          />
          <Button
            size="xs"
            disabled={!hinweis.trim()}
            onClick={() => {
              onAktion(null, hinweis)
              setHinweis('')
              setOffen(false)
            }}
          >
            Mit Hinweis überarbeiten
          </Button>
        </Stack>
      </Menu.Dropdown>
    </Menu>
  )
}

/**
 * Schritt 2 des Elternbriefs (Großprogramm 0.4, F7; Nacharbeit 29.09.2026): Brief bearbeiten –
 * ganz neu formulieren oder Teil für Teil mit dem Zauberstab –, übersetzen lassen, als PDF oder
 * Word speichern (deutsche Fassung plus Übersetzungen). Änderungen am deutschen Text ziehen die
 * Übersetzungen der geänderten Teile automatisch nach.
 */
export default function Brief(): React.JSX.Element | null {
  const { dok: b, update, docId } = useElternbrief()
  const [sprachen, setSprachen] = useState<string[]>([])
  const [neu, setNeu] = useState({ ton: '', hinweis: '', einfach: false, kuerzer: false })
  const [passwortFrage, setPasswortFrage] = useState(false)
  const [passwort, setPasswort] = useState('')
  const [unterschrift, setUnterschrift] = useState<string | null>(null)
  // Wert eines deutschen Feldes beim Betreten – beim Verlassen entscheidet er, ob nachübersetzt wird
  const beimBetreten = useRef<Record<string, string>>({})
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  useEffect(() => {
    window.api.branding
      .getUnterschrift()
      .then(setUnterschrift)
      .catch(() => setUnterschrift(null))
  }, [])
  if (!b?.text) return null
  const bk = settings.briefkopf ?? {}
  const zeigeSchule = settings.showSchool !== false
  const kopf: Briefkopf = {
    schule: zeigeSchule ? settings.schoolName : '',
    logo: zeigeSchule ? logo : null,
    lehrkraft: bk.lehrkraft,
    strasse: zeigeSchule ? bk.strasse : '',
    plz: zeigeSchule ? bk.plz : '',
    ort: bk.ort,
    telefon: zeigeSchule ? bk.telefon : '',
    unterschrift
  }
  const name = safeFileName(b.meta.title || b.text.betreff || 'Elternbrief')
  const signieren = Boolean(bk.zertifikat && bk.signieren)
  const ton = neu.ton || b.meta.ton

  const speichern = (art: 'pdf' | 'docx', pw?: string): void => {
    const anzahl = b.uebersetzungen.length
    void speichereAusgabe(
      art === 'pdf'
        ? [
            {
              name: `${name}.pdf`,
              html: briefHtml(b, kopf),
              ...(pw ? { pdf: { signatur: { passwort: pw, grund: b.text?.betreff || 'Elternbrief', name: b.meta.absender || bk.lehrkraft } } } : {})
            }
          ]
        : [{ name: `${name}.docx`, filter: WORD_FILTER, daten: () => briefDocx(b, kopf) }],
      `Elternbrief${anzahl ? ` mit ${anzahl} Übersetzung${anzahl === 1 ? '' : 'en'}` : ''} gespeichert${pw ? ' und digital signiert' : ''}.`,
      ablageZiel('elternbrief', docId)
    ).catch(notifyError)
  }

  /** Nach eigenem Tippen: Hat sich der Teil geändert, ziehen die Übersetzungen nach */
  const verlassen = (schluessel: string): void => {
    const vorher = beimBetreten.current[schluessel]
    delete beimBetreten.current[schluessel]
    const jetzt = useElternbrief.getState().dok
    if (vorher === undefined || !jetzt?.text) return
    if (teilLesen(jetzt.text, schluessel) === vorher) return
    update((d) => d.text && (d.pruefung = pruefeBrief(d, d.text)))
    if (jetzt.uebersetzungen.length) teileNachuebersetzen(jetzt, docId, [schluessel])
  }

  /** Bearbeitbares Feld; im deutschen Text mit Zauberstab und Nachübersetzen */
  const feld = (t: BriefText, schluessel: string, label: string, setzen: (wert: string) => void, deutsch: boolean, mehrzeilig = false): React.JSX.Element => {
    const wert = teilLesen(t, schluessel)
    const gemeinsam = {
      value: wert,
      'aria-label': label,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setzen(e.currentTarget.value),
      onFocus: () => deutsch && (beimBetreten.current[schluessel] = wert),
      onBlur: () => deutsch && verlassen(schluessel)
    }
    const eingabe = mehrzeilig ? (
      <Textarea {...gemeinsam} autosize minRows={2} style={{ flex: 1 }} />
    ) : (
      <TextInput {...gemeinsam} size={schluessel.startsWith('rl-') ? 'xs' : 'sm'} style={{ flex: 1 }} />
    )
    return (
      <Group gap={4} align="flex-start" wrap="nowrap" data-eb-teil={deutsch ? schluessel : undefined}>
        {eingabe}
        {deutsch && <Zauberstab onAktion={(aktion, hinweis) => teilUeberarbeiten(b, docId, schluessel, aktion, hinweis)} />}
      </Group>
    )
  }

  /** Alle Felder eines Brieftextes (deutsch oder übersetzt) */
  const felder = (t: BriefText, setzen: (fn: (x: BriefText) => void, gruppe: string) => void, deutsch: boolean, rtl = false): React.JSX.Element => (
    <Stack gap="xs" dir={rtl ? 'rtl' : 'ltr'}>
      <Text size="sm" fw={500}>
        Betreff
      </Text>
      {feld(t, 'betreff', 'Betreff', (x) => setzen((d) => (d.betreff = x), 'betreff'), deutsch)}
      <Text size="sm" fw={500}>
        Anrede
      </Text>
      {feld(t, 'anrede', 'Anrede', (x) => setzen((d) => (d.anrede = x), 'anrede'), deutsch)}
      {t.absaetze.map((_, i) => (
        <div key={i}>{feld(t, `absatz-${i}`, `Absatz ${i + 1}`, (x) => setzen((d) => (d.absaetze[i] = x), `absatz-${i}`), deutsch, true)}</div>
      ))}
      <Text size="sm" fw={500}>
        Gruß
      </Text>
      {feld(t, 'gruss', 'Gruß', (x) => setzen((d) => (d.gruss = x), 'gruss'), deutsch)}
      {t.ruecklauf && (
        <Card withBorder padding="xs">
          <Text size="sm" fw={600} mb={4}>
            Rücklaufzettel
          </Text>
          <Stack gap={4}>
            {feld(t, 'rl-titel', 'Überschrift des Rücklaufzettels', (x) => setzen((d) => d.ruecklauf && (d.ruecklauf.titel = x), 'rl-titel'), deutsch)}
            {t.ruecklauf.zeilen.map((_, i) => (
              <div key={i}>
                {feld(t, `rl-${i}`, `Zeile ${i + 1} des Rücklaufzettels`, (x) => setzen((d) => d.ruecklauf && (d.ruecklauf.zeilen[i] = x), `rl-${i}`), deutsch)}
              </div>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  )

  const fassungen = b.fassungen ?? []

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md">
          <Title order={2}>{b.text.betreff || 'Elternbrief'}</Title>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFileTypePdf size={14} />}
              onClick={() => (signieren ? setPasswortFrage(true) : speichern('pdf'))}
              data-eb-pdf
            >
              {signieren ? 'PDF (signiert)' : 'PDF'}
            </Button>
            <Button size="xs" variant="light" leftSection={<IconFileTypeDocx size={14} />} onClick={() => speichern('docx')}>
              Word
            </Button>
          </Group>
        </Group>

        {/* Ganzen Brief neu formulieren (29.09.2026) */}
        <Card withBorder mb="md" data-eb-kopfleiste>
          <Text fw={600} mb="xs">
            Ganzen Brief neu formulieren
          </Text>
          <Group align="flex-end" gap="sm" wrap="wrap">
            <Select label="Ton" data={TOENE} value={ton} onChange={(v) => v && setNeu((n) => ({ ...n, ton: v }))} allowDeselect={false} w={150} />
            <TextInput
              label="Änderungshinweis (optional)"
              placeholder="z. B. „Kosten und Frist zuerst nennen“"
              value={neu.hinweis}
              onChange={(e) => {
                const x = e.currentTarget.value
                setNeu((n) => ({ ...n, hinweis: x }))
              }}
              style={{ flex: 1, minWidth: 220 }}
              data-eb-neu-hinweis
            />
            <Button leftSection={<IconRefresh size={16} />} onClick={() => briefNeuFormulieren(b, docId, { ...neu, ton })} data-eb-neu>
              Neu formulieren
            </Button>
          </Group>
          <Group gap="lg" mt="xs">
            <Switch
              label="Einfache Sprache"
              checked={neu.einfach}
              onChange={(e) => {
                const x = e.currentTarget.checked
                setNeu((n) => ({ ...n, einfach: x }))
              }}
            />
            <Switch
              label="Kürzer"
              checked={neu.kuerzer}
              onChange={(e) => {
                const x = e.currentTarget.checked
                setNeu((n) => ({ ...n, kuerzer: x }))
              }}
            />
            {fassungen.length > 0 && (
              <Menu position="bottom-start" withinPortal>
                <Menu.Target>
                  <Button size="xs" variant="subtle" leftSection={<IconHistory size={14} />} data-eb-fassungen>
                    Frühere Fassungen ({fassungen.length})
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Fassung zurückholen</Menu.Label>
                  {fassungen.map((f, i) => (
                    <Menu.Item
                      key={f.am + i}
                      onClick={() => {
                        const jetzt = b.text!
                        const zurueck = structuredClone(f.text)
                        const geaendert = gleicherAufbau(jetzt, zurueck) ? geaenderteTeile(jetzt, zurueck) : null
                        update((d) => {
                          d.fassungen = [
                            { am: new Date().toISOString(), anlass: 'Vor dem Zurückholen', text: structuredClone(jetzt) },
                            ...fassungen.filter((_, k) => k !== i)
                          ].slice(0, 10)
                          d.text = zurueck
                          // Anderer Aufbau: Die Übersetzungen passen nicht mehr
                          if (!geaendert) d.uebersetzungen = []
                          d.pruefung = pruefeBrief(d, zurueck)
                        })
                        const nachher = useElternbrief.getState().dok
                        if (geaendert?.length && nachher) teileNachuebersetzen(nachher, docId, geaendert)
                      }}
                    >
                      {f.anlass} · {new Date(f.am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Datum, Uhrzeit, Beträge, Fristen und Platzhalter bleiben dabei unverändert; fehlt danach eine Angabe, erscheint ein Hinweis. Die Übersetzungen
            werden angepasst.
          </Text>
        </Card>

        {(b.pruefung ?? []).map((p, i) => (
          <Alert key={i} color="orange" variant="light" icon={<IconAlertTriangle size={16} />} mb="xs" data-eb-pruefung>
            {p}
          </Alert>
        ))}

        <Card withBorder mb="md">
          <Group align="flex-end" gap="sm">
            <MultiSelect
              style={{ flex: 1 }}
              label="Übersetzen in"
              placeholder="Familiensprachen wählen"
              data={FAMILIENSPRACHEN.map((s) => ({ value: s.code, label: `${s.name} – ${s.eigen}` }))}
              value={sprachen}
              onChange={setSprachen}
              searchable
              data-eb-sprachen
            />
            <Button
              leftSection={<IconLanguage size={16} />}
              disabled={!sprachen.length}
              onClick={() => {
                briefUebersetzen(b, docId, sprachen)
                setSprachen([])
              }}
              data-eb-uebersetzen
            >
              Übersetzen
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Jede Übersetzung trägt den Vermerk „{DEUTSCHER_VERMERK}" – in der Zielsprache und auf Deutsch. Änderungen am deutschen Text werden in allen
            Übersetzungen nachgezogen.
          </Text>
        </Card>
        <Tabs defaultValue="de" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="de">Deutsch</Tabs.Tab>
            {b.uebersetzungen.map((u) => (
              <Tabs.Tab key={u.code} value={u.code}>
                {spracheNach(u.code)?.name ?? u.code}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="de" pt="sm">
            {felder(b.text, (fn, g) => update((d) => d.text && fn(d.text), `eb-de-${g}`), true)}
          </Tabs.Panel>
          {b.uebersetzungen.map((u, i) => (
            <Tabs.Panel key={u.code} value={u.code} pt="sm">
              <Group justify="flex-end" mb="xs">
                <ActionIcon variant="subtle" color="red" aria-label="Übersetzung entfernen" onClick={() => update((d) => d.uebersetzungen.splice(i, 1))}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
              {u.text.vermerk && (
                <Alert variant="light" color="gray" p="xs" mb="xs">
                  {u.text.vermerk}
                </Alert>
              )}
              {felder(u.text, (fn, g) => update((d) => fn(d.uebersetzungen[i].text), `eb-${u.code}-${g}`), false, Boolean(spracheNach(u.code)?.rtl))}
            </Tabs.Panel>
          ))}
        </Tabs>
      </Container>

      <Modal
        opened={passwortFrage}
        onClose={() => {
          setPasswortFrage(false)
          setPasswort('')
        }}
        title="PDF digital signieren"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPasswortFrage(false)
            speichern('pdf', passwort)
            setPasswort('')
          }}
        >
          <Stack gap="sm">
            <Text size="sm">Passwort des Zertifikats – es wird nicht gespeichert.</Text>
            <PasswordInput value={passwort} onChange={(e) => setPasswort(e.currentTarget.value)} data-autofocus data-eb-passwort />
            <Group justify="space-between">
              <Button
                variant="subtle"
                onClick={() => {
                  setPasswortFrage(false)
                  setPasswort('')
                  speichern('pdf')
                }}
              >
                Ohne Signatur speichern
              </Button>
              <Button type="submit" disabled={!passwort}>
                Signieren und speichern
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </ScrollArea>
  )
}
