import { ActionIcon, Alert, Badge, Button, Card, Chip, Group, Select, Stack, Switch, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core'
import { IconDownload, IconExternalLink, IconFileTypeDocx, IconFileTypePdf, IconHeadphones, IconPlayerPlay, IconRefresh, IconVolume } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TtsVoice } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { imNetz } from '../../../shared/netzZugang'
import { useAppSettings } from '../../../shared/settingsStore'
import { estimateSeconds } from '../generation/convert'
import { subjectById } from '../model/subjects'
import type { AudioBlock, Sheet, Worksheet } from '../model/types'
import { useArbeitsblatt } from '../store'
import { audioLength } from '../render/BlockView'
import { akzentName, akzentVon, HERKUNFT, herkunftVon, sichtbareStimmen, stimmenName, vorhandeneAkzente, vorhandeneHerkunft } from '../../../shared/voiceFilter'
import type { Herkunft } from '../../../shared/voiceFilter'
import { settingsFuerNiveau } from '@shared/voiceSettings'
import { listeningRules } from '../didactics/listeningFormats'
import { VoiceSettings } from './VoiceSettings'

/** Sprecherzeilen „Name: Text“ aus dem Skript lesen; ohne Namen gilt der erste Sprecher. */
export function scriptTurns(block: AudioBlock): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  for (const line of block.transcript.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = /^([\p{Lu}][\p{L}\s.'-]{0,24}):\s*(.+)$/u.exec(trimmed)
    if (m) out.push({ name: m[1].trim(), text: m[2].trim() })
    else if (out.length) out[out.length - 1].text += ` ${trimmed}`
    else out.push({ name: '', text: trimmed })
  }
  return out
}

/** Namen, die im Skript sprechen – Grundlage für die Stimmenauswahl. */
export function speakerNames(block: AudioBlock): string[] {
  const names = scriptTurns(block)
    .map((t) => t.name)
    .filter(Boolean)
  return [...new Set(names)]
}

/**
 * Reiter „Hörtexte“: Skript bearbeiten, Stimmen wählen, vertonen und abspielen.
 *
 * Klassenarbeiten benutzen denselben Reiter. Sie liegen in einem eigenen Speicher, deshalb
 * kommt die Änderungsfunktion von außen; ohne Angabe gilt der Arbeitsblatt-Speicher.
 */
export function AudioPanel({ ws, onUpdate }: { ws: Worksheet; onUpdate?: (fn: (ws: Worksheet) => void) => void }): React.JSX.Element {
  const updateSheet = useArbeitsblatt((s) => s.update)
  const update = onUpdate ?? updateSheet
  const settings = useAppSettings((s) => s.settings)
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voicesError, setVoicesError] = useState('')
  const [busy, setBusy] = useState('')
  /** Stimme, deren Hörprobe gerade geladen wird */
  const [preview, setPreview] = useState('')
  /** Stimmenliste auf die Sprache des Fachs eingrenzen (Vorgabe: an) */
  const [sprachfilter, setSprachfilter] = useState(true)
  /** Gewählte Herkunftskategorien; leer = alle */
  const [herkunft, setHerkunft] = useState<Herkunft[]>([])
  /** Gewählte Akzente; leer = alle */
  const [akzente, setAkzente] = useState<string[]>([])

  /**
   * Die mitgelieferte Hörprobe der Stimme abspielen.
   *
   * Sie kommt über den Hauptprozess: Die Sicherheitsrichtlinie des Fensters lässt nur eigene
   * Quellen zu, eine fremde Adresse im Audio-Element würde sie blockieren.
   */
  const playPreview = async (voiceId: string): Promise<void> => {
    if (!voiceId) return
    setPreview(voiceId)
    try {
      const dataUrl = await window.api.audio.preview(voiceId)
      await new Audio(dataUrl).play()
    } catch (e) {
      notifyError(e, 'Die Hörprobe konnte nicht abgespielt werden')
    } finally {
      setPreview('')
    }
  }
  const language = subjectById(ws.meta.subjectId).foreignLanguage

  useEffect(() => {
    let active = true
    void window.api.audio
      .voices()
      .then((v) => active && setVoices(v))
      .catch((e) => active && setVoicesError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
  }, [])

  const blocks: { sheet: Sheet; block: AudioBlock }[] = ws.sheets.flatMap((sheet) =>
    sheet.blocks.filter((b): b is AudioBlock => b.type === 'audio').map((block) => ({ sheet, block }))
  )

  const setBlock = (id: string, fn: (b: AudioBlock) => void): void =>
    update((d) => {
      for (const s of d.sheets) for (const b of s.blocks) if (b.id === id && b.type === 'audio') fn(b)
    })

  /**
   * Stimmen, die das Konto auch wirklich benutzen darf.
   *
   * Der Filter in der Auswahlliste allein genügt NICHT: Zugewiesen wird auch automatisch
   * und über die Voreinstellung in den App-Einstellungen. Genau dort kam eine gesperrte
   * Bibliotheksstimme herein – die Liste zeigte sie nirgends, das Vertonen scheiterte
   * trotzdem mit „Free users cannot use library voices via the API". Deshalb wird hier an
   * der Wurzel gefiltert, nicht erst in der Anzeige.
   */
  const nutzbareStimmen = voices.filter((v) => v.usable !== false)

  /** Stimme für einen Namen: eigene Wahl, sonst die Voreinstellung der Sprache, sonst die erste nutzbare. */
  const voiceFor = (block: AudioBlock, name: string): string => {
    const gewaehlt = block.speakers.find((s) => s.name === name)?.voiceId
    if (gewaehlt) return gewaehlt
    // Auch die Voreinstellung kann auf eine inzwischen gesperrte Stimme zeigen
    const vorgabe = settings.audio.voices[language ?? 'en']
    if (vorgabe && nutzbareStimmen.some((v) => v.id === vorgabe)) return vorgabe
    return nutzbareStimmen[0]?.id ?? ''
  }

  /*
   * Sobald die Stimmen geladen sind, bekommt jeder Sprecher eine EIGENE.
   *
   * Vorher musste die Lehrkraft das für jeden Sprecher von Hand nachholen; tat sie es nicht,
   * fielen alle auf dieselbe Vorgabestimme zurück, und der Dialog klang wie ein Selbstgespräch.
   * Zugewiesen wird nur, was noch leer ist – eine getroffene Wahl bleibt unangetastet.
   * Verschiedene Geschlechter zuerst, das trennt die Sprecher am deutlichsten.
   */
  useEffect(() => {
    if (!voices.length) return
    for (const { block } of blocks) {
      const namen = [
        ...new Set(
          scriptTurns(block)
            .map((t) => t.name)
            .filter(Boolean)
        )
      ]
      if (namen.length < 2) continue
      const vergeben = new Set(namen.map((n) => block.speakers.find((sp) => sp.name === n)?.voiceId).filter(Boolean) as string[])
      const offen = namen.filter((n) => !block.speakers.find((sp) => sp.name === n)?.voiceId)
      if (!offen.length) continue
      // Nur nutzbare Stimmen: Eine gesperrte hier zuzuweisen, verschiebt den Fehler nur nach hinten
      const frei = nutzbareStimmen.filter((v) => !vergeben.has(v.id))
      if (frei.length < offen.length) continue
      offen.forEach((name, i) => {
        // Abwechselnd weiblich/männlich, soweit die Angaben es hergeben
        const wunsch = i % 2 === 0 ? 'female' : 'male'
        const stimme = frei.find((v) => v.gender === wunsch && !vergeben.has(v.id)) ?? frei.find((v) => !vergeben.has(v.id))
        if (!stimme) return
        vergeben.add(stimme.id)
        setBlock(block.id, (b) => {
          const da = b.speakers.find((sp) => sp.name === name)
          if (da) Object.assign(da, { voiceId: stimme.id, voiceName: stimme.name })
          else b.speakers.push({ id: `${b.id}-${b.speakers.length}`, name, voiceId: stimme.id, voiceName: stimme.name })
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices.length])

  /** Die vertonte Datei irgendwohin speichern – etwa in den Cloud-Ordner für den QR-Code. */
  const saveMp3 = async (block: AudioBlock): Promise<void> => {
    const url = block.audio?.dataUrl
    if (!url) return
    try {
      const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0))
      // Zeichen, die Windows in Dateinamen nicht zulässt
      const name = `${(block.title || 'Hoertext').replace(/[\\/:*?"<>|]/g, '')}.mp3`
      const path = await window.api.files.save(name, [{ name: 'MP3', extensions: ['mp3'] }], bytes)
      if (path) notifySuccess(`Gespeichert: ${path}`)
    } catch (e) {
      notifyError(e, 'Die MP3 konnte nicht gespeichert werden')
    }
  }

  const generate = async (block: AudioBlock): Promise<void> => {
    const turns = scriptTurns(block)
    if (!turns.length) {
      notifyError(new Error('Das Skript ist leer.'))
      return
    }
    /*
     * Ein Dialog wird als EINE Datei erzeugt: jede Sprecherzeile mit ihrer Stimme, danach
     * hintereinandergehängt. Das trägt nur, wenn die Sprecher auch verschiedene Stimmen
     * haben – sonst entsteht ein Dialog, den eine einzige Person führt, und das merkt man
     * erst beim Abhören. Deshalb hier der Riegel: Erst wird geprüft, dann vertont.
     */
    const namen = [...new Set(turns.map((t) => t.name).filter(Boolean))]
    if (namen.length > 1) {
      const stimmen = namen.map((n) => voiceFor(block, n))
      if (new Set(stimmen.filter(Boolean)).size < namen.length) {
        notifyError(
          new Error(`${namen.join(' und ')} hätten dieselbe Stimme – der Dialog klänge wie eine einzige Person. Weise oben je Sprecher eine eigene Stimme zu.`),
          'Vertonen abgebrochen'
        )
        return
      }
    }
    /*
     * Letzter Riegel vor dem Netz: Zeigt eine Zuweisung noch auf eine gesperrte Stimme –
     * etwa aus einem älteren Arbeitsblatt, das mit einem anderen Tarif entstanden ist –,
     * dann scheitert die Vertonung mit einer Meldung, die niemandem weiterhilft
     * („Free users cannot use library voices via the API"). Hier steht stattdessen, was zu
     * tun ist.
     */
    const gesperrteWahl = [...new Set(turns.map((t) => voiceFor(block, t.name)))]
      .map((id) => voices.find((v) => v.id === id))
      .filter((v) => v && v.usable === false)
    if (gesperrteWahl.length) {
      const v = gesperrteWahl[0]!
      notifyError(
        new Error(`„${v.name}" ist mit deinem ElevenLabs-Tarif nicht nutzbar. ${v.unusableReason ?? ''} Wähle oben eine andere Stimme.`),
        'Vertonen abgebrochen'
      )
      return
    }

    /*
     * Mehrere Stimmen bedeuten den Dialog-Weg (eleven_v3, alle Zeilen in einem Auftrag).
     * Der klingt von sich aus ruhiger als eine einzelne Stimme – deshalb hängt schon die
     * Tempo-Berechnung daran und nicht erst der Hauptprozess.
     */
    const mehrereStimmen = new Set(turns.map((t) => voiceFor(block, t.name)).filter(Boolean)).size > 1
    setBusy(block.id)
    try {
      const res = await window.api.audio.speak({
        id: block.id,
        languageCode: language,
        turns: turns.map((t) => ({ voiceId: voiceFor(block, t.name), text: t.text })),
        settings: block.voiceSettings ?? settingsFuerNiveau(listeningRules(ws.meta.cefrLevel).wpm, mehrereStimmen, undefined)
      })
      setBlock(block.id, (b) => {
        b.audio = { dataUrl: res.dataUrl, fileName: res.fileName }
        b.seconds = estimateSeconds(b.transcript)
      })
      // Der Weg gehört in die Meldung: „Dialog" heißt, dass die Sprecher aufeinander eingehen
      notifySuccess(`Hörtext vertont (${Math.round(res.bytes / 1024)} kB, ${res.mode === 'dialog' ? 'Dialog in einem Stück' : 'eine Stimme'}).`)
    } catch (e) {
      notifyError(e, 'Vertonen fehlgeschlagen')
    } finally {
      setBusy('')
    }
  }

  if (!blocks.length) {
    return (
      <Card withBorder w="210mm" maw="100%" p="lg">
        <Stack gap="sm">
          <Group gap="xs">
            <IconHeadphones size={22} />
            <Title order={4}>Hörtexte</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Dieses Arbeitsblatt enthält noch keinen Hörtext. Füge im Arbeitsblatt den Baustein „Hörtext“ hinzu oder wähle beim Erstellen eine Aufgabe zum
            Hörverstehen – die KI schreibt dann ein Skript, das hier vertont werden kann.
          </Text>
        </Stack>
      </Card>
    )
  }

  // Sprache und Herkunft filtern – die Begründungen stehen in shared/voiceFilter.ts
  const { nachSprache, sichtbar, sprachfilterGriff, gesperrt } = sichtbareStimmen(voices, { language, sprachfilter, herkunft, akzente })
  const herkunftDa = vorhandeneHerkunft(nachSprache)
  // Die Akzentwahl richtet sich nach dem, was nach Sprache und Herkunft übrig ist
  const nachHerkunft = herkunft.length ? nachSprache.filter((v) => herkunft.includes(herkunftVon(v))) : nachSprache
  const akzenteDa = vorhandeneAkzente(nachHerkunft)

  const voiceOptions = sichtbar.map((v) => ({ value: v.id, label: stimmenName(v) }))

  /**
   * Alle Hörtexte als eigenes Dokument.
   * Getrennt vom Material, damit das Skript nicht versehentlich mit den Blättern
   * in die Klasse wandert – auf dem Schülerblatt steht es bewusst nicht.
   */
  const saveTranscript = async (format: 'docx' | 'pdf'): Promise<void> => {
    try {
      const mod = await import('../export/transcriptDocx')
      const title = ws.meta.title || ws.meta.topic
      const info = { title, subtitle: [ws.meta.subjectLabel, ws.meta.grade ? `Klasse ${ws.meta.grade}` : ''].filter(Boolean).join(' · ') }
      const audio = blocks.map((b) => b.block)
      const path =
        format === 'docx'
          ? await window.api.files.save(
              mod.transcriptFileName(title),
              [{ name: 'Word-Dokument', extensions: ['docx'] }],
              await mod.buildTranscriptDocx(audio, info)
            )
          : await window.api.exporter.pdf(mod.buildTranscriptHtml(audio, info), mod.transcriptPdfName(title))
      if (path) notifySuccess('Transkript gespeichert.')
    } catch (e) {
      notifyError(e, 'Das Transkript konnte nicht gespeichert werden')
    }
  }

  return (
    <Stack w="210mm" maw="100%" gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {blocks.length === 1 ? 'Ein Hörtext' : `${blocks.length} Hörtexte`} – das Skript steht nur hier, nicht auf dem Schülerblatt.
        </Text>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Transkript speichern:
          </Text>
          <Button size="compact-sm" variant="light" leftSection={<IconFileTypeDocx size={14} />} onClick={() => void saveTranscript('docx')}>
            Word
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconFileTypePdf size={14} />} onClick={() => void saveTranscript('pdf')}>
            PDF
          </Button>
        </Group>
      </Group>
      {voicesError && (
        <Alert color="orange" title="Keine Stimmen geladen">
          {voicesError} Der Schlüssel steht in den Einstellungen unter „Hörtexte“.
        </Alert>
      )}
      {!voicesError && voices.length > 0 && language && (
        <Group gap="sm" align="center">
          <Switch
            size="xs"
            checked={sprachfilter}
            onChange={(e) => setSprachfilter(e.currentTarget.checked)}
            label={`Nur Stimmen zur Sprache des Fachs (${sichtbar.length} von ${voices.length})`}
          />
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
            {sprachfilter && !sprachfilterGriff
              ? 'Zu wenige passende Stimmen – es werden alle gezeigt.'
              : 'Jede Stimme kann den Text sprechen; die Angabe beschreibt nur den Akzent. Eigene Stimmen deines Kontos bleiben immer sichtbar.'}
          </Text>
        </Group>
      )}
      {/* Stimmen, die der Tarif nicht hergibt, stehen gar nicht erst zur Wahl – sonst scheitert
          erst das Vertonen, nachdem der Hörtext schon geschrieben ist. */}
      {gesperrt.length > 0 && (
        <Text size="xs" c="dimmed">
          {gesperrt.length} Stimme{gesperrt.length === 1 ? '' : 'n'} ausgeblendet: {gesperrt[0].unusableReason}
        </Text>
      )}
      {blocks.map(({ sheet, block }) => {
        const names = speakerNames(block)
        const seconds = estimateSeconds(block.transcript)
        return (
          <Card key={block.id} withBorder p="lg">
            <Stack gap="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <IconHeadphones size={20} />
                  <Title order={5}>{block.title}</Title>
                  <Badge variant="light">{block.textType}</Badge>
                  {ws.sheets.length > 1 && <Badge variant="outline">{sheet.label}</Badge>}
                </Group>
                <Text size="xs" c="dimmed">
                  ca. {audioLength(seconds)} · {block.plays}× abspielen
                </Text>
              </Group>

              <Textarea
                label="Skript (Sprecherzeilen als „Name: Text“)"
                autosize
                minRows={6}
                defaultValue={block.transcript}
                onBlur={(e) =>
                  setBlock(block.id, (b) => {
                    b.transcript = e.currentTarget.value
                    b.seconds = estimateSeconds(b.transcript)
                  })
                }
              />

              {/* Die Filter stehen dort, wo gewählt wird – nicht oben am Reiter. */}
              <Stack gap={6}>
                {herkunftDa.length > 1 && (
                  <Group gap="xs" align="center">
                    <Text size="xs" c="dimmed" w={54}>
                      Woher:
                    </Text>
                    <Chip.Group multiple value={herkunft} onChange={(x) => setHerkunft(x as Herkunft[])}>
                      <Group gap={6}>
                        {herkunftDa.map((k) => (
                          <Tooltip key={k} label={HERKUNFT[k].hilfe}>
                            <Chip value={k} size="xs">
                              {HERKUNFT[k].label} ({nachSprache.filter((x) => herkunftVon(x) === k).length})
                            </Chip>
                          </Tooltip>
                        ))}
                      </Group>
                    </Chip.Group>
                    {herkunft.length > 0 && (
                      <Button size="compact-xs" variant="subtle" onClick={() => setHerkunft([])}>
                        alle
                      </Button>
                    )}
                  </Group>
                )}
                {/* Akzent: nur die, zu denen es auch wirklich eine Stimme gibt */}
                {akzenteDa.length > 1 && (
                  <Group gap="xs" align="center">
                    <Text size="xs" c="dimmed" w={54}>
                      Akzent:
                    </Text>
                    <Chip.Group multiple value={akzente} onChange={setAkzente}>
                      <Group gap={6}>
                        {akzenteDa.map((a) => (
                          <Chip key={a} value={a} size="xs">
                            {akzentName(a)} ({nachHerkunft.filter((x) => akzentVon(x) === a).length})
                          </Chip>
                        ))}
                      </Group>
                    </Chip.Group>
                    {akzente.length > 0 && (
                      <Button size="compact-xs" variant="subtle" onClick={() => setAkzente([])}>
                        alle
                      </Button>
                    )}
                  </Group>
                )}
              </Stack>

              {/* Tempo folgt dem Niveau; ein Dialog läuft über das ruhigere Modell. */}
              <VoiceSettings
                wpm={listeningRules(ws.meta.cefrLevel).wpm}
                dialog={new Set((names.length ? names : ['Sprecher']).map((n) => voiceFor(block, n)).filter(Boolean)).size > 1}
                eigene={block.voiceSettings}
                onChange={(s) => setBlock(block.id, (b) => (s ? (b.voiceSettings = s) : delete b.voiceSettings))}
              />

              <Group align="flex-end" gap="sm" wrap="wrap">
                {(names.length ? names : ['Sprecher']).map((name) => (
                  <Group key={name} gap={4} align="flex-end" wrap="nowrap">
                    <Select
                      size="xs"
                      w={230}
                      label={`Stimme für ${name}`}
                      data={voiceOptions}
                      value={voiceFor(block, name) || null}
                      searchable
                      nothingFoundMessage="Keine Stimme gefunden"
                      onChange={(v) =>
                        v &&
                        setBlock(block.id, (b) => {
                          const voice = voices.find((x) => x.id === v)
                          const existing = b.speakers.find((s) => s.name === name)
                          if (existing) Object.assign(existing, { voiceId: v, voiceName: voice?.name ?? '' })
                          else b.speakers.push({ id: `${block.id}-${b.speakers.length}`, name, voiceId: v, voiceName: voice?.name ?? '' })
                        })
                      }
                    />
                    {/* Hörprobe: die mitgelieferte Aufnahme der Stimme – kostet kein Kontingent,
                      anders als eine eigene Probesynthese. */}
                    <Tooltip
                      label={
                        voices.find((v) => v.id === voiceFor(block, name))?.previewUrl
                          ? 'Stimme anhören (kostenlos)'
                          : 'Zu dieser Stimme gibt es keine Hörprobe'
                      }
                    >
                      <ActionIcon
                        variant="light"
                        size="input-xs"
                        aria-label={`Stimme für ${name} anhören`}
                        loading={preview === voiceFor(block, name)}
                        disabled={!voices.find((v) => v.id === voiceFor(block, name))?.previewUrl}
                        onClick={() => void playPreview(voiceFor(block, name))}
                      >
                        <IconPlayerPlay size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ))}
                <Button
                  size="xs"
                  leftSection={block.audio ? <IconRefresh size={14} /> : <IconVolume size={14} />}
                  loading={busy === block.id}
                  disabled={!voices.length}
                  onClick={() => void generate(block)}
                >
                  {block.audio ? 'Neu vertonen' : 'Vertonen'}
                </Button>
              </Group>

              {block.audio?.dataUrl && (
                <Group gap="sm" align="center">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={block.audio.dataUrl} style={{ height: 36 }} />
                  <Button size="compact-xs" variant="subtle" leftSection={<IconDownload size={14} />} onClick={() => void saveMp3(block)}>
                    MP3 speichern
                  </Button>
                  {/*
                   * „Im Ordner zeigen" öffnet den Explorer DIESES Rechners. Auf einem Tablet
                   * gibt es dort nichts zu sehen, und der Aufruf ist über das Netz gesperrt –
                   * der Knopf führte also nur in eine Fehlermeldung. Also steht er dort nicht.
                   * „MP3 speichern" bleibt: Das lädt die Datei auf das Gerät herunter.
                   */}
                  {!imNetz() && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<IconExternalLink size={14} />}
                      onClick={() => block.audio?.fileName && void window.api.audio.showInFolder(block.audio.fileName).catch(notifyError)}
                    >
                      Im Ordner zeigen
                    </Button>
                  )}
                </Group>
              )}

              <TextInput
                label="Adresse für den QR-Code auf dem Blatt (optional)"
                description="Lege die MP3 z. B. in einen Cloud-Ordner und trage den Link ein; dann können die Lernenden den Text selbst noch einmal hören."
                placeholder="https://…"
                defaultValue={block.url ?? ''}
                onBlur={(e) => setBlock(block.id, (b) => (b.url = e.currentTarget.value.trim() || undefined))}
              />
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
