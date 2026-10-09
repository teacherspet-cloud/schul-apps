/**
 * Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln" (05.10.2026): Standardstimmen je Sprache,
 * mit denen die Sprach-KI (ElevenLabs bzw. OpenAI-Stimmen) Wörter und Beispielsätze der Medienbank spricht.
 * Am Server gilt die Wahl für alle und nur Admins ändern sie; in der Exe für die eigene Medienbank.
 *
 * Nachtrag 06.10.2026 (Wunsch der Lehrkraft):
 * - Deutsch als Sprache (DaZ/DaF-Listen).
 * - Angeboten werden nur Stimmen, die mit dem hinterlegten Schlüssel und Tarif WIRKLICH sprechen dürfen: Die Liste
 *   kommt aus dem Konto (/v2/voices, main/services/audio/elevenlabs.ts), gesperrte Bibliotheksstimmen (im kostenlosen
 *   Tarif ist jede Bibliotheksstimme über die Schnittstelle gesperrt – „paid_plan_required") fallen heraus. Ist eine
 *   schon gewählte Stimme nicht mehr nutzbar, steht der Grund darunter.
 * - „Hörprobe" kommt immer über den Hauptprozess bzw. Server (audio:preview) als data:-Adresse.
 *
 * Nachtrag 07.10.2026 (Wunsch der Lehrkraft):
 * - Je Sprache eine WEIBLICHE und eine MÄNNLICHE Stimme – erzeugt werden beide Fassungen, die Lernenden wählen.
 * - Nur Stimmen, die zur Sprache passen: zuerst die für die Sprache geprüften (ElevenLabs `verified_languages`,
 *   Akzent), dann mehrsprachige. Vorher erschien bei fehlender Angabe die ganze Liste – fast nur englische Stimmen.
 * - Muttersprachliche Stimmen anderer Sprachen stehen in der ElevenLabs-Bibliothek: „Weitere Stimmen suchen" zeigt
 *   sie nach Sprache und Geschlecht und übernimmt eine ins Konto (nur mit bezahltem Tarif nutzbar).
 */
import { ActionIcon, Badge, Button, Card, Group, Loader, Modal, Select, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconPlayerPlay, IconPlayerStop, IconSearch } from '@tabler/icons-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { BibliotheksStimme, TtsVoice } from '@shared/types'
import { STIMMLAGE_NAME, STIMMLAGEN, type Stimmen, type Stimmlage } from '@shared/medienbank'
import { passtZurLage, stimmeEignung } from '../voiceFilter'
import { notifyError, notifySuccess } from '../util'
import { useMedienAdmin } from './MedienUi'
import { KlappKarte } from '../components/KlappKarte'
import { stimmenStatus } from '@shared/einstellungsStatus'

const SPRACHEN: { code: string; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'Englisch' },
  { code: 'fr', name: 'Französisch' },
  { code: 'es', name: 'Spanisch' },
  { code: 'it', name: 'Italienisch' },
  { code: 'nl', name: 'Niederländisch' },
  { code: 'pl', name: 'Polnisch' },
  { code: 'ru', name: 'Russisch' },
  { code: 'tr', name: 'Türkisch' }
]

/** Auswahlliste einer Fassung: geprüfte Stimmen, mehrsprachige, eigene ohne Angabe */
function auswahl(nutzbar: TtsVoice[], sprache: string, lage: Stimmlage): { group: string; items: { value: string; label: string }[] }[] {
  const gruppen: Record<'geprueft' | 'mehrsprachig' | 'ohne', { value: string; label: string }[]> = { geprueft: [], mehrsprachig: [], ohne: [] }
  for (const v of nutzbar) {
    if (!passtZurLage(v, lage)) continue
    const e = stimmeEignung(v, sprache)
    if (!e) continue
    gruppen[e].push({ value: v.id, label: `${v.name}${v.language && v.language !== 'multilingual' ? ` (${v.language})` : ''}` })
  }
  const name = SPRACHEN.find((s) => s.code === sprache)?.name ?? sprache
  return [
    { group: `Für ${name} geprüft`, items: gruppen.geprueft },
    { group: `Mehrsprachig (spricht auch ${name})`, items: gruppen.mehrsprachig },
    { group: 'Eigene Stimmen ohne Sprachangabe', items: gruppen.ohne }
  ].filter((g) => g.items.length)
}

/**
 * Karte „Aussprache der Vokabeln". `klappbar` (Einstellungen, 09.10.2026): eingeklappt mit Statuszeile („4 Stimmen für
 * 2 Sprachen"); die Stimmen des Kontos werden erst beim Aufklappen abgefragt.
 */
export function VokabelStimmenCard({ klappbar = false }: { klappbar?: boolean }): React.JSX.Element {
  const [wahl, setWahl] = useState<Record<string, Stimmen> | null>(null)
  useEffect(() => {
    if (klappbar) void window.api.medien.stimmen().then(setWahl, () => setWahl({}))
  }, [klappbar])
  if (!klappbar) return <VokabelStimmenInhalt />
  return (
    <KlappKarte id="vokabel-stimmen" titel="Aussprache der Vokabeln" status={stimmenStatus(wahl)} rahmen={{ 'data-vokabel-stimmen': true }}>
      <VokabelStimmenInhalt rahmen={false} onWahl={setWahl} />
    </KlappKarte>
  )
}

function VokabelStimmenInhalt({ rahmen = true, onWahl }: { rahmen?: boolean; onWahl?: (w: Record<string, Stimmen>) => void }): React.JSX.Element {
  const Rahmen = rahmen ? KartenRahmen : Fragment
  const admin = useMedienAdmin()
  const [stimmen, setStimmen] = useState<TtsVoice[] | null>(null)
  const [wahl, setWahl] = useState<Record<string, Stimmen>>({})
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState<{ sprache: string; lage: Stimmlage } | null>(null)
  const ladeStimmen = (): void =>
    void window.api.audio.voices().then(
      (v) => setStimmen(v),
      (e: unknown) => {
        setStimmen([])
        setFehler(e instanceof Error ? e.message : String(e))
      }
    )
  useEffect(() => {
    void window.api.medien.stimmen().then(setWahl, () => setWahl({}))
    ladeStimmen()
  }, [])
  const setzen = (sprache: string, lage: Stimmlage, stimme: string): void =>
    void window.api.medien.stimmeSetzen(sprache, stimme, lage).then(
      (w) => {
        setWahl(w)
        onWahl?.(w)
      },
      (e: unknown) => notifyError(e)
    )
  // Hörprobe: welche Zeile gerade lädt bzw. spielt (Sprache + Fassung oder Bibliotheksstimme)
  const [probe, setProbe] = useState<{ schluessel: string; laedt: boolean } | null>(null)
  const ton = useRef<HTMLAudioElement | null>(null)
  const hoerprobe = async (schluessel: string, voiceId: string): Promise<void> => {
    ton.current?.pause()
    if (probe?.schluessel === schluessel && !probe.laedt) return setProbe(null)
    setProbe({ schluessel, laedt: true })
    try {
      // Immer über den Hauptprozess/Server: eine fremde Adresse im Audio-Element blockiert die Sicherheitsrichtlinie
      const src = await window.api.audio.preview(voiceId)
      const a = new Audio(src)
      ton.current = a
      a.onended = () => setProbe((p) => (p?.schluessel === schluessel ? null : p))
      await a.play()
      setProbe({ schluessel, laedt: false })
    } catch (e) {
      setProbe(null)
      notifyError(e, 'Die Hörprobe konnte nicht abgespielt werden')
    }
  }
  // Nur Stimmen, die mit diesem Schlüssel und Tarif sprechen dürfen
  const nutzbar = (stimmen ?? []).filter((v) => v.usable !== false)
  return (
    <Rahmen>
      {rahmen && (
        <Title order={4} mb={4}>
          Aussprache der Vokabeln
        </Title>
      )}
      <Text size="xs" c="dimmed" mb="sm">
        Je Sprache eine weibliche und eine männliche Stimme für die Aussprache von Wörtern und Beispielsätzen in den Vokabellisten. Erzeugt wird jede Fassung,
        für die eine Stimme gewählt ist; die Lernenden wählen in ihren Einstellungen, welche sie hören (fehlt sie, die andere).
        {admin ? '' : ' Festlegen dürfen nur Admins.'}
      </Text>
      {stimmen === null ? (
        <Loader size="sm" />
      ) : !nutzbar.length ? (
        <Text size="sm" c="orange.8">
          {stimmen.length
            ? 'Keine der Stimmen des Kontos ist im aktuellen Tarif über die Schnittstelle nutzbar.'
            : 'Keine Stimmen verfügbar – zuerst oben einen ElevenLabs- oder OpenAI-Schlüssel hinterlegen.'}
          {fehler ? ` (${fehler})` : ''}
        </Text>
      ) : (
        <Stack gap="sm">
          {SPRACHEN.map((s) => (
            <Stack key={s.code} gap={4} data-stimmen-sprache={s.code}>
              <Text size="sm" fw={600}>
                {s.name}
              </Text>
              {STIMMLAGEN.map((lage) => {
                const liste = auswahl(nutzbar, s.code, lage)
                const gewaehlt = wahl[s.code]?.[lage]
                const v = nutzbar.find((x) => x.id === gewaehlt)
                // Gewählt, aber (nicht mehr) nutzbar – oder nicht mehr im Konto: sagen, statt still zu scheitern
                const gesperrt = gewaehlt ? stimmen.find((x) => x.id === gewaehlt && x.usable === false) : undefined
                const fehlt = gewaehlt && !v && !gesperrt
                const schluessel = `${s.code}:${lage}`
                const spielt = probe?.schluessel === schluessel
                const daten =
                  v || !gewaehlt
                    ? liste
                    : [{ group: 'Gewählt', items: [{ value: gewaehlt, label: gesperrt ? `${gesperrt.name} (nicht nutzbar)` : 'unbekannte Stimme' }] }, ...liste]
                return (
                  <Stack key={lage} gap={2}>
                    <Group gap="xs" wrap="nowrap">
                      <Text size="sm" w={80} c="dimmed">
                        {STIMMLAGE_NAME[lage]}
                      </Text>
                      <Select
                        size="xs"
                        style={{ flex: 1 }}
                        data={daten}
                        value={gewaehlt ?? null}
                        onChange={(id) => setzen(s.code, lage, id ?? '')}
                        searchable
                        clearable
                        disabled={!admin}
                        placeholder={liste.length ? `keine – ohne ${STIMMLAGE_NAME[lage]}e Fassung` : 'keine passende Stimme im Konto'}
                        nothingFoundMessage="Keine passende Stimme"
                        data-stimme-sprache={s.code}
                        data-stimme-lage={lage}
                      />
                      <Tooltip label={spielt && !probe?.laedt ? 'Hörprobe anhalten' : 'Hörprobe'}>
                        <ActionIcon
                          variant="subtle"
                          disabled={!v}
                          loading={spielt && probe?.laedt}
                          onClick={() => v && void hoerprobe(schluessel, v.id)}
                          aria-label={`Hörprobe ${s.name} ${STIMMLAGE_NAME[lage]}`}
                          data-hoerprobe={schluessel}
                        >
                          {spielt ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                        </ActionIcon>
                      </Tooltip>
                      {admin && (
                        <Tooltip
                          label={`${STIMMLAGE_NAME[lage] === 'weiblich' ? 'Weibliche' : 'Männliche'} Stimmen für ${s.name} in der ElevenLabs-Bibliothek suchen`}
                        >
                          <ActionIcon
                            variant="subtle"
                            onClick={() => setSuche({ sprache: s.code, lage })}
                            aria-label="Weitere Stimmen suchen"
                            data-stimmen-suchen={schluessel}
                          >
                            <IconSearch size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                    {(gesperrt || fehlt) && (
                      <Text size="xs" c="orange.8" pl={88}>
                        {gesperrt
                          ? `Die gewählte Stimme ist mit diesem Schlüssel nicht nutzbar: ${gesperrt.unusableReason ?? 'Tarif'} Bitte eine andere wählen.`
                          : 'Die gewählte Stimme gibt es im Konto nicht mehr. Bitte eine andere wählen.'}
                      </Text>
                    )}
                  </Stack>
                )
              })}
            </Stack>
          ))}
        </Stack>
      )}
      {suche && (
        <BibliothekDialog
          sprache={suche.sprache}
          lage={suche.lage}
          probe={probe}
          hoerprobe={hoerprobe}
          schliessen={() => setSuche(null)}
          uebernommen={(id) => {
            ladeStimmen()
            setzen(suche.sprache, suche.lage, id)
            setSuche(null)
          }}
        />
      )}
    </Rahmen>
  )
}

/** Stimmen der ElevenLabs-Bibliothek zu Sprache und Geschlecht – übernehmen setzt sie zugleich als Standardstimme */
function KartenRahmen({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <Card withBorder padding="lg" data-vokabel-stimmen>
      {children}
    </Card>
  )
}

function BibliothekDialog({
  sprache,
  lage,
  probe,
  hoerprobe,
  schliessen,
  uebernommen
}: {
  sprache: string
  lage: Stimmlage
  probe: { schluessel: string; laedt: boolean } | null
  hoerprobe: (schluessel: string, voiceId: string) => Promise<void>
  schliessen: () => void
  uebernommen: (voiceId: string) => void
}): React.JSX.Element {
  const [ergebnis, setErgebnis] = useState<{ stimmen: BibliotheksStimme[]; gesperrt: string } | null>(null)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const name = SPRACHEN.find((s) => s.code === sprache)?.name ?? sprache
  useEffect(() => {
    void window.api.audio
      .bibliothek(sprache, lage === 'm' ? 'male' : 'female')
      .then(setErgebnis, (e: unknown) => setFehler(e instanceof Error ? e.message : String(e)))
  }, [sprache, lage])
  const uebernehmen = async (v: BibliotheksStimme): Promise<void> => {
    setLaeuft(v.voiceId)
    try {
      const id = await window.api.audio.bibliothekUebernehmen(v.publicOwnerId, v.voiceId, v.name)
      notifySuccess(`„${v.name}" ist jetzt im Konto und die ${STIMMLAGE_NAME[lage]}e Stimme für ${name}.`)
      uebernommen(id)
    } catch (e) {
      notifyError(e, 'Die Stimme konnte nicht übernommen werden')
    } finally {
      setLaeuft(null)
    }
  }
  return (
    <Modal
      opened
      onClose={schliessen}
      title={`${STIMMLAGE_NAME[lage] === 'weiblich' ? 'Weibliche' : 'Männliche'} Stimmen für ${name}`}
      size="lg"
      data-stimmen-bibliothek
    >
      {fehler ? (
        <Text size="sm" c="red">
          {fehler}
        </Text>
      ) : !ergebnis ? (
        <Loader size="sm" />
      ) : ergebnis.gesperrt ? (
        <Text size="sm" c="orange.8">
          {ergebnis.gesperrt} Mit einem bezahlten Tarif lassen sich hier muttersprachliche Stimmen übernehmen; bis dahin sprechen die mehrsprachigen Stimmen des
          Kontos auch {name}.
        </Text>
      ) : !ergebnis.stimmen.length ? (
        <Text size="sm" c="dimmed">
          In der Bibliothek wurde keine passende Stimme gefunden.
        </Text>
      ) : (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Muttersprachliche Stimmen aus der ElevenLabs-Bibliothek. „Übernehmen“ fügt die Stimme dem ElevenLabs-Konto hinzu und wählt sie hier aus.
          </Text>
          {ergebnis.stimmen.map((v) => {
            const schluessel = `bib:${v.voiceId}`
            const spielt = probe?.schluessel === schluessel
            return (
              <Group key={v.voiceId} justify="space-between" wrap="nowrap" data-bibliothek-stimme={v.voiceId}>
                <div style={{ minWidth: 0 }}>
                  <Group gap={6}>
                    <Text size="sm" fw={600}>
                      {v.name}
                    </Text>
                    {v.accent && (
                      <Badge size="xs" variant="light">
                        {v.accent}
                      </Badge>
                    )}
                  </Group>
                  {v.description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {v.description}
                    </Text>
                  )}
                </div>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    disabled={!v.previewUrl}
                    loading={spielt && probe?.laedt}
                    onClick={() => void hoerprobe(schluessel, v.voiceId)}
                    aria-label={`Hörprobe ${v.name}`}
                  >
                    {spielt ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                  </ActionIcon>
                  <Button size="compact-xs" loading={laeuft === v.voiceId} disabled={Boolean(laeuft)} onClick={() => void uebernehmen(v)}>
                    Übernehmen
                  </Button>
                </Group>
              </Group>
            )
          })}
        </Stack>
      )}
    </Modal>
  )
}
