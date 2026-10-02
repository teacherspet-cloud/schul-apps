import { ActionIcon, Alert, Badge, Button, Card, Chip, FileButton, Group, Select, Stack, Switch, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core'
import { aufServer } from '../../../shared/plattform'
import {
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconHeadphones,
  IconMusic,
  IconPlayerPlay,
  IconPlaylistAdd,
  IconRefresh,
  IconVolume
} from '@tabler/icons-react'
import { importiereHoerdatei, leseTranskript } from '../../../shared/verstehen/hoerdatei'
import { useEffect, useState } from 'react'
import type { TtsVoice } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { imNetz } from '../../../shared/netzZugang'
import { aufIos } from '../../../shared/plattform'
import { useAppSettings } from '../../../shared/settingsStore'
import { estimateSeconds } from '../generation/convert'
import { subjectById } from '../model/subjects'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { meldeAblage } from '../../../shared/export/ausgabe'
import type { AblageZiel } from '@shared/types'
import { anzeigeOrt } from '@shared/schulmaterial'
import type { AudioBlock, Sheet, Worksheet } from '../model/types'
import { useArbeitsblatt } from '../store'
import { akzentName, akzentVon, HERKUNFT, herkunftVon, sichtbareStimmen, stimmenName, vorhandeneAkzente, vorhandeneHerkunft } from '../../../shared/voiceFilter'
import type { Herkunft } from '../../../shared/voiceFilter'
import { settingsFuerNiveau } from '@shared/voiceSettings'
import { listeningRules } from '../didactics/listeningFormats'
import { VoiceSettings } from './VoiceSettings'
import EinstellungenLink from '../../../shared/components/EinstellungenLink'
import KiWunschKnoepfe from '../../../shared/components/KiWunschKnoepfe'
import type { WunschArt, WunschKontext } from '../../../shared/kiWunsch'
import { dauerAngabe, ersetzeDauerangaben, hoertextZu, hoerzeit, minSek, scriptTurns, skriptFingerabdruck } from '../../../shared/verstehen/hoerzeit'

// Sprecherzeilen lesen – seit 01.10.2026 in shared/verstehen/hoerzeit.ts (auch für die Zeitmarken)
export { scriptTurns }

/** Namen, die im Skript sprechen – Grundlage für die Stimmenauswahl. */
/** Eine vom Schul-Apps-Server vergebene Hörtext-Adresse (…/h/<kennung>) */
const istServerHoertext = (url: string): boolean => /\/h\/[A-Za-z0-9_-]{16,40}$/.test(url)

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
export function AudioPanel({
  ws,
  onUpdate,
  onZusatzfragen,
  ablage,
  onWunsch,
  wunschKontext,
  wunschLaeuft,
  onVertont
}: {
  ws: Worksheet
  onUpdate?: (fn: (ws: Worksheet) => void, gruppe?: string) => void
  /** Wohin MP3 und Transkript gehören (iPad); Vorgabe: das offene Arbeitsblatt */
  ablage?: AblageZiel
  /** Klassenarbeit (29.09.2026): „Weitere Fragen im gleichen Format" zum Hörtext mit dieser id */
  onZusatzfragen?: (audioId: string) => void
  /** Änderungswunsch an das Skript (01.10.2026): Zauberstab/Kreis wie an den Bausteinen; die Aufgaben ziehen mit */
  onWunsch?: (audioId: string, art: WunschArt, wunsch: string) => void
  wunschKontext?: (block: AudioBlock) => WunschKontext
  /** Läuft für diesen Hörtext gerade ein Änderungswunsch? */
  wunschLaeuft?: (audioId: string) => boolean
  /** Nach dem Vertonen: gemessene Spieldauer (Klassenarbeit passt die Bearbeitungszeit des Hörteils an) */
  onVertont?: (audioId: string, sekunden: number) => void
}): React.JSX.Element {
  const updateSheet = useArbeitsblatt((s) => s.update)
  const ziel = (): AblageZiel => ablage ?? ablageZiel('arbeitsblatt', useArbeitsblatt.getState().docId, ws.meta.subjectLabel || ws.meta.subjectId)
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

  const setBlock = (id: string, fn: (b: AudioBlock) => void, gruppe?: string): void =>
    update((d) => {
      for (const s of d.sheets) for (const b of s.blocks) if (b.id === id && b.type === 'audio') fn(b)
    }, gruppe)

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
      const path = await window.api.files.save(name, [{ name: 'MP3', extensions: ['mp3'] }], bytes, ziel())
      // Unter Schulmaterial (iPad) nennt die Meldung den Ort selbst; am PC wie bisher der ganze Pfad
      if (path) meldeAblage(path, anzeigeOrt(path) ? 'MP3 gespeichert.' : `Gespeichert: ${path}`)
    } catch (e) {
      notifyError(e, 'Die MP3 konnte nicht gespeichert werden')
    }
  }

  /**
   * Original-Hördatei einbinden (29.09.2026, Entscheidung der Lehrkraft): Die MP3 – etwa von der
   * Verlags-CD – landet im Hörtext-Ordner wie eine Vertonung und wird genauso abgespielt,
   * gespeichert und beim Öffnen wieder geladen. Keine KI-Aufnahme: 'archiv' verhindert den
   * Vermerk „KI-erzeugt" auf dem Schülerblatt.
   */
  const importMp3 = async (block: AudioBlock, file: File | null): Promise<void> => {
    if (!file) return
    setBusy(block.id)
    try {
      const res = await importiereHoerdatei(block.id, file)
      setBlock(block.id, (b) => {
        b.audio = { dataUrl: res.dataUrl, fileName: res.fileName, ...(res.seconds > 0 ? { sekunden: res.seconds } : {}) }
        b.origin = 'archiv'
        if (res.seconds > 0) b.seconds = res.seconds
        // Server: auch die eigene Hördatei bekommt eine Adresse für den QR-Code
        if (res.freigabe && (!b.url || istServerHoertext(b.url))) b.url = res.freigabe
      })
      notifySuccess(`Hördatei eingebunden (${Math.round(res.bytes / 1024)} kB) – im Unterricht läuft diese Aufnahme.`)
    } catch (e) {
      notifyError(e, 'Die Hördatei konnte nicht eingebunden werden')
    } finally {
      setBusy('')
    }
  }

  /** Transkript aus einer Datei (Text, Word, PDF) als Skript übernehmen – nur für die Lehrkraft und die KI */
  const importTranskript = async (block: AudioBlock, file: File | null): Promise<void> => {
    if (!file) return
    try {
      const text = await leseTranskript(file)
      setBlock(block.id, (b) => {
        b.transcript = text
        // Ein Transkript aus fremdem Material ist kein KI-Text (Kennzeichnung und Rechtshinweis hängen daran)
        b.origin = 'archiv'
        b.transkriptFremd = true
        if (!b.audio?.dataUrl) b.seconds = estimateSeconds(text)
      })
      notifySuccess('Transkript übernommen.')
    } catch (e) {
      notifyError(e, 'Das Transkript konnte nicht gelesen werden')
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
          new Error(
            `${namen.join(' und ')} hätten dieselbe Stimme – der Dialog klänge wie eine einzige Person. Bitte oben jeder Person eine eigene Stimme zuweisen.`
          ),
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
        new Error(`„${v.name}" ist mit dem hinterlegten ElevenLabs-Tarif nicht nutzbar. ${v.unusableReason ?? ''} Bitte oben eine andere Stimme wählen.`),
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
        settings: block.voiceSettings ?? settingsFuerNiveau(listeningRules(ws.meta.cefrLevel).wpm, mehrereStimmen, undefined),
        /*
         * Bisherige eigene Vertonung (01.10.2026): Unveränderte Zeilen übernimmt der Hauptprozess
         * Byte für Byte, nur Geändertes geht an den Dienst. Eine Originalaufnahme ist keine Vorlage.
         */
        ...(block.audio?.fileName && block.origin !== 'archiv' ? { vorher: { fileName: block.audio.fileName, segmente: block.audio.segmente ?? [] } } : {})
      })
      const vorher = hoerzeit(block)
      let neueDauer = 0
      update((d) => {
        const alle = d.sheets.flatMap((s) => s.blocks)
        const b = alle.find((x): x is AudioBlock => x.id === block.id && x.type === 'audio')
        if (!b) return
        b.audio = {
          dataUrl: res.dataUrl,
          fileName: res.fileName,
          ...(res.sekunden ? { sekunden: res.sekunden } : {}),
          ...(res.zeitmarken ? { zeitmarken: res.zeitmarken } : {}),
          ...(res.segmente ? { segmente: res.segmente } : {}),
          skript: skriptFingerabdruck(b.transcript)
        }
        // Vertont von der Sprachsynthese: wieder als KI-Aufnahme kennzeichnen (29.09.2026)
        delete b.origin
        // Server (02.10.2026): Adresse der Abspielseite als QR-Adresse – eine eigene Adresse bleibt
        if (res.freigabe && (!b.url || istServerHoertext(b.url))) b.url = res.freigabe
        const nach = hoerzeit(b)
        b.seconds = Math.round(nach.sekunden)
        neueDauer = nach.sekunden
        /*
         * Längenangaben zu diesem Hörtext (Hinweis vor dem Hören, Arbeitsanweisungen der Aufgaben dazu,
         * Hinweise für die Lehrkraft) folgen der gemessenen Dauer – 01.10.2026.
         */
        b.beforeListening = ersetzeDauerangaben(b.beforeListening, vorher.sekunden, nach)
        for (const t of alle) {
          if (t.type !== 'task' || hoertextZu(t, alle)?.id !== b.id) continue
          t.instruction = ersetzeDauerangaben(t.instruction, vorher.sekunden, nach)
          for (const p of t.parts) p.instruction = ersetzeDauerangaben(p.instruction, vorher.sekunden, nach)
        }
        if (typeof d.meta.teacherNote === 'string') d.meta.teacherNote = ersetzeDauerangaben(d.meta.teacherNote, vorher.sekunden, nach)
      })
      if (neueDauer) onVertont?.(block.id, neueDauer)
      // Der Weg gehört in die Meldung: „Dialog" heißt, dass die Sprecher aufeinander eingehen; „nur Geändertes" spart Kontingent
      const dauer = neueDauer ? ` – ${minSek(neueDauer)} min` : ''
      if (res.weg === 'teilweise')
        notifySuccess(
          res.neu
            ? `Nur die geänderten Stellen neu vertont (${res.neu} von ${res.zeilen} Zeilen), der Rest der Aufnahme ist unverändert übernommen${dauer}.`
            : `Gestrichene Stellen aus der Aufnahme entfernt, nichts neu vertont${dauer}.`
        )
      else
        notifySuccess(
          `Hörtext vertont (${Math.round(res.bytes / 1024)} kB, ${res.mode === 'dialog' ? 'Dialog in einem Stück' : 'eine Stimme'}${dauer}).${res.grund ? ` Ganz neu vertont: ${res.grund}` : ''}`
        )
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
            Dieses Arbeitsblatt enthält noch keinen Hörtext. Dafür im Arbeitsblatt den Baustein „Hörtext“ einfügen oder beim Erstellen eine Aufgabe zum
            Hörverstehen wählen – die KI schreibt dann ein Skript, das hier vertont werden kann.
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
      const info = { title, subtitle: [ws.meta.subjectLabel, ws.meta.grade ? `Klasse ${ws.meta.grade}` : ''].filter(Boolean).join(' · '), ki: ws.meta.ki }
      const audio = blocks.map((b) => b.block)
      const path =
        format === 'docx'
          ? await window.api.files.save(
              mod.transcriptFileName(title),
              [{ name: 'Word-Dokument', extensions: ['docx'] }],
              await mod.buildTranscriptDocx(audio, info),
              ziel()
            )
          : await window.api.exporter.pdf(mod.buildTranscriptHtml(audio, info), mod.transcriptPdfName(title), undefined, ziel())
      if (path) meldeAblage(path, 'Transkript gespeichert.')
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
          {voicesError} Der Schlüssel steht in den Einstellungen unter <EinstellungenLink tab="dienste">Bilder und Hörtexte</EinstellungenLink>.
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
              : 'Jede Stimme kann den Text sprechen; die Angabe beschreibt nur den Akzent. Eigene Stimmen des ElevenLabs-Kontos bleiben immer sichtbar.'}
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
        // Dauer und Zeitmarken: gemessen, sobald eine passende Aufnahme da ist, sonst geschätzt (01.10.2026)
        const zeit = hoerzeit(block)
        const zeilen = scriptTurns(block)
        return (
          <Card key={block.id} withBorder p="lg" data-hoertext={block.id}>
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="xs">
                  <IconHeadphones size={20} />
                  <Title order={5}>{block.title}</Title>
                  <Badge variant="light">{block.textType}</Badge>
                  {ws.sheets.length > 1 && <Badge variant="outline">{sheet.label}</Badge>}
                  {zeit.veraltet && (
                    <Tooltip label="Das Skript wurde nach dem Vertonen geändert. Neu vertonen ersetzt nur die geänderten Stellen." multiline w={260}>
                      <Badge color="orange" variant="light" data-aufnahme-veraltet>
                        Aufnahme veraltet
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Text size="xs" c="dimmed" data-hoerdauer={zeit.echt ? 'gemessen' : 'geschaetzt'}>
                    {dauerAngabe(zeit)}
                    {zeit.echt ? ' (gemessen)' : ''} · {block.plays}× abspielen
                  </Text>
                  {/* Änderungswunsch an das Skript – die Aufgaben zum Hörtext werden mit angepasst */}
                  {onWunsch && wunschKontext && block.transcript.trim() && (
                    <KiWunschKnoepfe
                      blockId={block.id}
                      kontext={() => wunschKontext(block)}
                      busy={wunschLaeuft?.(block.id) ?? false}
                      onAusfuehren={(art, wunsch) => onWunsch(block.id, art, wunsch)}
                      name={block.title}
                    />
                  )}
                </Group>
              </Group>

              <Textarea
                // Neu aufbauen, wenn ein eingelesenes Transkript das Feld von außen ändert
                key={`${block.id}-${block.transcript.length}`}
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

              {/* Original-Hördatei und Transkript (29.09.2026): im Unterricht läuft das Original */}
              <Group gap="xs" wrap="wrap">
                <FileButton onChange={(f) => void importMp3(block, f)} accept="audio/mpeg,.mp3">
                  {(props) => (
                    <Button {...props} size="compact-sm" variant="light" leftSection={<IconMusic size={14} />} loading={busy === block.id}>
                      Eigene Hördatei (MP3)
                    </Button>
                  )}
                </FileButton>
                <FileButton onChange={(f) => void importTranskript(block, f)} accept=".txt,.docx,.pdf,text/plain">
                  {(props) => (
                    <Button {...props} size="compact-sm" variant="light" leftSection={<IconFileText size={14} />}>
                      Transkript einlesen
                    </Button>
                  )}
                </FileButton>
                {onZusatzfragen && block.transcript.trim() && (
                  <Button size="compact-sm" variant="light" leftSection={<IconPlaylistAdd size={14} />} onClick={() => onZusatzfragen(block.id)}>
                    Weitere Fragen ergänzen
                  </Button>
                )}
                {block.origin === 'archiv' && (
                  <Text size="xs" c="dimmed">
                    Originalaufnahme – ohne KI-Vermerk auf dem Blatt.
                  </Text>
                )}
              </Group>

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
                // Ein Zug an den Stimmreglern ist ein Verlaufsschritt
                onChange={(s) => setBlock(block.id, (b) => (s ? (b.voiceSettings = s) : delete b.voiceSettings), `stimme:${block.id}`)}
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
                  title={block.origin === 'archiv' && block.audio ? 'Ersetzt die eingebundene Originalaufnahme durch eine Vertonung' : undefined}
                >
                  {!block.audio ? 'Vertonen' : zeit.veraltet && block.audio.segmente?.length ? 'Geänderte Stellen neu vertonen' : 'Neu vertonen'}
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
                      {/* iPad: kein Explorer – die Datei geht ins Teilen-Menü */}
                      {aufIos() ? 'Teilen' : 'Im Ordner zeigen'}
                    </Button>
                  )}
                </Group>
              )}

              {/* Zeitmarken je Sprecherzeile (01.10.2026): gemessen aus der Aufnahme, sonst geschätzt */}
              {zeilen.length > 1 && (
                <Text size="xs" c="dimmed" data-zeitmarken={zeit.markenEcht ? 'gemessen' : 'geschaetzt'}>
                  {zeit.markenEcht ? 'Zeitmarken (gemessen): ' : 'Zeitmarken (geschätzt): '}
                  {zeilen.map((z, i) => `${minSek(zeit.marken[i] ?? 0)} ${z.name || '–'}`).join(' · ')}
                </Text>
              )}

              <TextInput
                key={block.url ?? ''}
                label="Adresse für den QR-Code auf dem Blatt (optional)"
                description={
                  aufServer()
                    ? 'Wird beim Vertonen automatisch gesetzt: Die Lernenden öffnen den Hörtext über den QR-Code auf dem Schul-Apps-Server – ohne Anmeldung.'
                    : 'Die MP3 z. B. in einen Cloud-Ordner legen und den Link hier eintragen; dann können die Lernenden den Text selbst noch einmal hören.'
                }
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
