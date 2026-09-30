import { ActionIcon, Button, Group, Loader, Popover, Stack, Text, Textarea, Tooltip } from '@mantine/core'
import { IconRefresh, IconSparkles, IconWand } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { fuegeVorschlagEin, inhaltsSchluessel, kiVorschlaegeAus, kiVorschlagAnfrage, regelVorschlaege, type WunschArt, type WunschKontext } from '../kiWunsch'
import { useKiZugang } from '../useKiZugang'

/** KI-Vorschläge je Baustein und Inhalt – ein erneutes Öffnen fragt nicht noch einmal */
const kiSpeicher = new Map<string, string[]>()

/**
 * Zauberstab „Überarbeiten" und Kreis „Neu erzeugen" an einem Baustein – mit EINEM Wunschfeld.
 *
 * Wunsch der Lehrkraft (30.09.2026): Beim Kreis zum Neugenerieren einen Änderungswunsch mit
 * angeben können. Vorher gab es dafür zwei Wege („Mit KI überarbeiten …" mit Feld und „Mit KI
 * neu erzeugen" ohne Feld). Jetzt öffnen beide Knöpfe dasselbe Feld; unten stehen beide
 * Aktionen, der angeklickte Knopf ist vorgewählt. Ohne Wunsch arbeiten beide wie bisher.
 *
 * Vorschläge unter dem Feld: sofort die Regelvorschläge (shared/kiWunsch.ts), dazu – wenn ein
 * KI-Zugang eingerichtet ist – 4–6 Vorschläge der KI für genau diesen Baustein. Sie werden
 * angehängt, sobald sie da sind; beim Schließen wird die Anfrage abgebrochen.
 *
 * `menue` bekommt die Öffnen-Funktion, damit ein KI-Menü dieselben Einträge anbieten kann,
 * ohne einen zweiten Weg zu bauen.
 */
export default function KiWunschKnoepfe({
  blockId,
  kontext,
  busy,
  onAusfuehren,
  ohneUeberarbeiten,
  fassungen,
  name,
  menue
}: {
  blockId: string
  /** Wird beim Öffnen gelesen – so rechnet niemand Kontexte für Bausteine aus, die keiner anfasst */
  kontext: () => WunschKontext
  busy: boolean
  onAusfuehren: (art: WunschArt, wunsch: string) => void
  /** Kein Zauberstab (leerer Baustein: dort füllt der eigene Zauberstab) */
  ohneUeberarbeiten?: boolean
  /** Das Programm hebt ältere Fassungen auf („Fassung 1 / 2") */
  fassungen?: boolean
  /** Für Bildschirmleser, z. B. „Aufgabe 2" */
  name?: string
  menue?: (oeffne: (art: WunschArt) => void) => React.ReactNode
}): React.JSX.Element {
  const [art, setArt] = useState<WunschArt | null>(null)
  const [text, setText] = useState('')
  const [regel, setRegel] = useState<string[]>([])
  const [ki, setKi] = useState<string[]>([])
  const [kiLaeuft, setKiLaeuft] = useState(false)
  const kiDa = useKiZugang()
  const anfrage = useRef<string | null>(null)

  const abbrechen = (): void => {
    const id = anfrage.current
    anfrage.current = null
    setKiLaeuft(false)
    if (id) window.api.ai.cancel(id).catch(() => undefined)
  }
  useEffect(() => abbrechen, [])

  const oeffne = (a: WunschArt): void => {
    setArt(a)
    if (art) return
    const k = kontext()
    const r = regelVorschlaege(k)
    setRegel(r)
    const schluessel = inhaltsSchluessel(blockId, k.inhalt)
    const gemerkt = kiSpeicher.get(schluessel)
    setKi(gemerkt ?? [])
    if (gemerkt || !kiDa || !k.inhalt.trim()) return
    const id = `wunsch-${blockId}-${Date.now().toString(36)}`
    anfrage.current = id
    setKiLaeuft(true)
    window.api.ai
      .structured<unknown>({ ...kiVorschlagAnfrage(k, r), progressId: id })
      .then((antwort) => {
        const liste = kiVorschlaegeAus(antwort, r)
        kiSpeicher.set(schluessel, liste)
        if (anfrage.current === id) setKi(liste)
      })
      // Ohne KI-Vorschläge bleibt das Feld voll nutzbar – kein Fehlerfenster
      .catch(() => undefined)
      .finally(() => {
        if (anfrage.current === id) {
          anfrage.current = null
          setKiLaeuft(false)
        }
      })
  }
  const schliesse = (): void => {
    abbrechen()
    setArt(null)
  }
  const los = (a: WunschArt): void => {
    onAusfuehren(a, text.trim())
    setText('')
    schliesse()
  }
  const vorschlag = (s: string, vonKi: boolean): React.JSX.Element => (
    <Button
      key={`${vonKi ? 'k' : 'r'}-${s}`}
      size="compact-xs"
      variant={text.split(/,\s*/).includes(s) ? 'filled' : 'light'}
      color={vonKi ? 'grape' : 'blue'}
      leftSection={vonKi ? <IconSparkles size={11} /> : undefined}
      data-vorschlag={vonKi ? 'ki' : 'regel'}
      styles={{ label: { whiteSpace: 'normal', textAlign: 'left' }, root: { height: 'auto', minHeight: 22, paddingBlock: 2 } }}
      onClick={() => setText((t) => fuegeVorschlagEin(t, s))}
    >
      {s}
    </Button>
  )

  const zusatz = name ? ` (${name})` : ''
  return (
    <Popover opened={art !== null} onChange={(o) => !o && schliesse()} width={380} position="left-start" withArrow shadow="md" trapFocus>
      <Popover.Target>
        <Stack gap={4} className="ki-wunsch-knoepfe">
          {!ohneUeberarbeiten && (
            <Tooltip label="Überarbeiten – der Baustein bleibt erkennbar, auf Wunsch mit Änderungswunsch" position="left" multiline w={240} disabled={art !== null}>
              <ActionIcon
                className="editor-ai-ueberarbeiten"
                size="sm"
                variant="filled"
                color="grape"
                loading={busy}
                aria-label={`Baustein überarbeiten${zusatz}`}
                aria-expanded={art === 'ueberarbeiten'}
                onClick={() => (art ? schliesse() : oeffne('ueberarbeiten'))}
              >
                <IconWand size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Neu erzeugen – ein ganz neuer Entwurf, auf Wunsch mit Änderungswunsch" position="left" multiline w={240} disabled={art !== null}>
            <ActionIcon
              className="editor-ai-neu"
              size="sm"
              variant="default"
              loading={busy}
              aria-label={`Baustein neu erzeugen${zusatz}`}
              aria-expanded={art === 'neu'}
              onClick={() => (art ? schliesse() : oeffne('neu'))}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          {menue?.(oeffne)}
        </Stack>
      </Popover.Target>
      <Popover.Dropdown data-ki-wunsch>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {art === 'neu' ? 'Baustein neu erzeugen' : 'Baustein überarbeiten'}
          </Text>
          <Textarea
            aria-label="Änderungswunsch"
            placeholder="Änderungswunsch (optional), z. B. „Einfachere Sprache“ – ohne Wunsch arbeitet die KI wie bisher"
            autosize
            minRows={2}
            maxRows={6}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && art) los(art)
            }}
            data-autofocus
          />
          <Group gap={4} data-vorschlaege>
            {regel.map((s) => vorschlag(s, false))}
            {ki.map((s) => vorschlag(s, true))}
            {kiLaeuft && (
              <Group gap={4} data-ki-vorschlaege-laden>
                <Loader size={12} color="grape" />
                <Text size="xs" c="dimmed">
                  KI-Vorschläge für diesen Baustein …
                </Text>
              </Group>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Überarbeiten behält den Baustein erkennbar bei, Neu erzeugen schreibt einen ganz neuen Entwurf. Das Ergebnis ersetzt den Baustein; Strg+Z nimmt es
            zurück{fassungen ? ', und über dem Baustein lässt sich zur vorigen Fassung blättern' : ''}. Andere Bausteine bleiben unverändert.
          </Text>
          <Group gap="xs" grow>
            {!ohneUeberarbeiten && (
              <Button size="xs" variant={art === 'ueberarbeiten' ? 'filled' : 'light'} color="grape" leftSection={<IconWand size={14} />} onClick={() => los('ueberarbeiten')}>
                Überarbeiten
              </Button>
            )}
            <Button size="xs" variant={art === 'neu' ? 'filled' : 'light'} leftSection={<IconRefresh size={14} />} onClick={() => los('neu')}>
              Neu erzeugen
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
