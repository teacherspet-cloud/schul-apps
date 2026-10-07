import {
  ActionIcon,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Image,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import ZahlFeld from '../shared/components/ZahlFeld'
import { IconChevronLeft, IconChevronRight, IconPhoto, IconRefresh, IconSparkles, IconStar, IconStarFilled, IconTrash, IconUpload } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { BESCHREIBUNGS_AUFTRAG, MASKOTTCHEN_POSEN, maskottchenId, posePrompt, vorlagePrompt, type MaskottchenInfo } from '@shared/maskottchen'
import { obj, str } from '../shared/aiSchema'
import { starteAuftrag } from '../shared/auftraege'
import { cleanImageBackground } from '../shared/imageCleanup'
import { useMaskottchen, useMaskottchenZiel } from '../shared/maskottchenStore'
import { normalizeImage, notifyError, notifySuccess, readFileAsDataUrl } from '../shared/util'
import { ILLUSTRATIONEN_BIS_KLASSE } from '../modules/arbeitsblatt/generation/illustrationen'
import { hatClient } from '../shared/plattform'

/**
 * Einstellungen → Maskottchen (26.09.2026).
 *
 * Mehrere Figuren, eine als Standard; je Figur eine Vorlage (von der KI aus einer Angabe
 * gezeichnet oder hochgeladen) und zwölf Posen, die die Bild-KI aus einer genauen
 * Beschreibung der Vorlage zeichnet. Beim Upload beschreibt die KI die Vorlage zuerst
 * (Bildanalyse), damit die Posen dieselbe Figur zeigen – auch bei Anbietern, deren Bildmodell
 * kein Referenzbild annimmt (Entscheidung der Lehrkraft: „Beschreiben, dann zeichnen").
 *
 * Jede Pose ist eine Bildanfrage (Abo: rund 45 s). Deshalb laufen die Zeichnungen als
 * Auftrag im Hintergrund, abbrechbar, mit Fortschritt in der Auftragsleiste.
 *
 * Ergänzt 27.09.2026 (Wunsch der Lehrkraft): Ein Druck auf eine Pose öffnet sie GROSS in
 * einem Fenster; erst dort gibt es „neu zeichnen lassen". Vorher löste der kleine Knopf die
 * Zeichnung sofort aus – ein Fehlgriff kostete eine Bildanfrage. Die Bilder entstehen auf
 * Neongrün und werden freigestellt (shared/maskottchen.ts), damit auf dem Blatt kein Kasten steht.
 */

/** Bilder auf eine handliche Größe bringen – 1,5 MB je Pose wären auf jedem Blatt zu viel */
const handlich = (dataUrl: string): Promise<string> => normalizeImage(dataUrl, 640, 'png')

/**
 * `schule`: Ansicht in der Verwaltung (Admin) – nur die Figuren der Schule, ohne die persönlichen Einstellungen.
 * Sonst (Einstellungen der Lehrkraft): die eigenen Figuren bearbeitbar, die der Schule nur zum Ansehen und als Standard wählbar.
 */
export default function MaskottchenSettings({
  settings,
  update,
  schule = false
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  schule?: boolean
}): React.JSX.Element {
  const alle = useMaskottchen((s) => s.liste)
  const liste = alle.filter((m) => Boolean(m.schule) === schule)
  const derSchule = schule ? [] : alle.filter((m) => m.schule)
  const modul = schule ? 'verwaltung' : 'einstellungen'
  const geladen = useMaskottchen((s) => s.geladen)
  const setze = useMaskottchen((s) => s.setze)
  const [name, setName] = useState('')
  const [angabe, setAngabe] = useState('')
  const [laeuft, setLaeuft] = useState<string | null>(null)
  /** Groß gezeigte Pose (Figur und Pose) – null = Fenster zu */
  const [ansicht, setAnsicht] = useState<{ figurId: string; poseId: string } | null>(null)
  const illu = settings.illustrationen ?? { bisKlasse: ILLUSTRATIONEN_BIS_KLASSE }

  useEffect(() => {
    if (!geladen) void useMaskottchen.getState().lade()
  }, [geladen])

  // „Öffnen" aus der Auftragsleiste: die gerade gezeichnete Figur/Pose groß zeigen
  const ziel = useMaskottchenZiel((s) => s.ziel)
  useEffect(() => {
    if (!ziel || !alle.some((m) => m.id === ziel.figurId && Boolean(m.schule) === schule)) return
    setAnsicht(ziel)
    useMaskottchenZiel.getState().setze(null)
    window.setTimeout(() => document.querySelector(`[data-maskottchen="${ziel.figurId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }, [ziel, alle, schule])

  const posenZeichnen = (figur: MaskottchenInfo, nur?: string[]): void => {
    const posen = MASKOTTCHEN_POSEN.filter((p) => !nur || nur.includes(p.id))
    void starteAuftrag<MaskottchenInfo, MaskottchenInfo>({
      moduleId: modul,
      docId: `maskottchen-${figur.id}`,
      titel: figur.name,
      art: posen.length === 1 ? `Pose „${posen[0].label}" zeichnen` : 'Posen zeichnen',
      eingabe: figur,
      istOffen: () => true,
      sperrt: false,
      // Figur und (erste) Pose – „Öffnen" zeigt genau dieses Bild groß
      schluessel: `maskottchen-${figur.id}:${posen[0]?.id ?? 'winkend'}`,
      fehlerTitel: 'Die Posen konnten nicht gezeichnet werden',
      arbeit: async (f, k) => {
        let beschreibung = f.beschreibung
        if (!beschreibung.trim()) {
          // Hochgeladene Vorlage ohne Beschreibung: die KI beschreibt sie zuerst
          k.melde('Die KI beschreibt die Vorlage …', 0, posen.length + 1)
          const d = await k.ai<{ beschreibung: string }>({
            system: BESCHREIBUNGS_AUFTRAG.system,
            user: BESCHREIBUNGS_AUFTRAG.user(),
            images: [f.vorlage],
            schemaName: 'figurbeschreibung',
            schema: obj({ beschreibung: str() })
          })
          beschreibung = String(d.beschreibung ?? '').trim()
          if (!beschreibung) throw new Error('Die KI konnte die Vorlage nicht beschreiben.')
          await window.api.maskottchen.save({ id: f.id, name: f.name, beschreibung, quelle: f.quelle })
        }
        let aktuell = f
        for (let i = 0; i < posen.length; i++) {
          if (k.signal.aborted) break
          k.melde(`Pose ${i + 1} von ${posen.length}: ${posen[i].label} …`, i + 1, posen.length + 1)
          const roh = await k.bild(posePrompt(beschreibung, posen[i]))
          const sauber = (await cleanImageBackground(roh)).dataUrl
          aktuell = await window.api.maskottchen.pose(f.id, posen[i].id, await handlich(sauber))
        }
        return aktuell
      },
      abschluss: (f) => `Fertig – ${Object.keys(f.posen).length} Posen für ${f.name}`,
      ablegen: async () => {
        setze(await window.api.maskottchen.list())
      }
    })
  }

  const neuPerKi = async (): Promise<void> => {
    if (!name.trim() || !angabe.trim()) return
    const id = maskottchenId(name)
    if (alle.some((m) => m.id === id)) {
      notifyError(new Error('Eine Figur mit diesem Namen gibt es schon.'))
      return
    }
    const eingabe = { id, name: name.trim(), angabe: angabe.trim() }
    setName('')
    setAngabe('')
    void starteAuftrag<typeof eingabe, MaskottchenInfo>({
      moduleId: modul,
      docId: `maskottchen-${id}`,
      titel: eingabe.name,
      art: 'Maskottchen zeichnen',
      eingabe,
      istOffen: () => true,
      sperrt: false,
      schluessel: `maskottchen-${id}:winkend`,
      fehlerTitel: 'Das Maskottchen konnte nicht gezeichnet werden',
      arbeit: async (e, k) => {
        k.melde('Die Bild-KI zeichnet die Vorlage …', 0, 2)
        const roh = await k.bild(vorlagePrompt(e.angabe))
        const sauber = (await cleanImageBackground(roh)).dataUrl
        k.melde('Die KI beschreibt die Figur für die Posen …', 1, 2)
        const d = await k.ai<{ beschreibung: string }>({
          system: BESCHREIBUNGS_AUFTRAG.system,
          user: BESCHREIBUNGS_AUFTRAG.user(e.angabe),
          images: [sauber],
          schemaName: 'figurbeschreibung',
          schema: obj({ beschreibung: str() })
        })
        const vorlage = await handlich(sauber)
        await window.api.maskottchen.save({ id: e.id, name: e.name, beschreibung: String(d.beschreibung ?? e.angabe).trim(), quelle: 'ki', vorlage, schule })
        // Die Vorlage winkt – sie ist zugleich die erste Pose
        return window.api.maskottchen.pose(e.id, 'winkend', vorlage)
      },
      abschluss: (f) => `Fertig – ${f.name} ist angelegt. Posen zeichnen lassen?`,
      ablegen: async () => {
        setze(await window.api.maskottchen.list())
      }
    })
  }

  const hochladen = async (file: File | null): Promise<void> => {
    if (!file) return
    const figurName = name.trim() || file.name.replace(/\.[^.]+$/, '')
    const id = maskottchenId(figurName)
    if (alle.some((m) => m.id === id)) {
      notifyError(new Error('Eine Figur mit diesem Namen gibt es schon.'))
      return
    }
    setLaeuft('upload')
    try {
      const roh = await readFileAsDataUrl(file)
      const sauber = (await cleanImageBackground(roh)).dataUrl
      const vorlage = await handlich(sauber)
      await window.api.maskottchen.save({ id, name: figurName, beschreibung: '', quelle: 'upload', vorlage, schule })
      setze(await window.api.maskottchen.list())
      setName('')
      notifySuccess(`${figurName} ist angelegt. „Posen zeichnen" lässt die KI die Figur beschreiben und in zwölf Posen zeichnen.`)
    } catch (e) {
      notifyError(e, 'Das Bild konnte nicht übernommen werden')
    } finally {
      setLaeuft(null)
    }
  }

  const loeschen = async (m: MaskottchenInfo): Promise<void> => {
    try {
      setze(await window.api.maskottchen.delete(m.id))
      if (illu.standardId === m.id) update({ illustrationen: { ...illu, standardId: undefined } })
    } catch (e) {
      notifyError(e)
    }
  }

  const standardId = illu.standardId ?? alle[0]?.id

  // Exe „Schul-Apps Online": Figuren der Exe ohne Server am selben PC auf den Server übernehmen (02.10.2026)
  const [uebertrage, setUebertrage] = useState(false)
  const ausExeUebernehmen = async (): Promise<void> => {
    const lesen = window.__schulappsClient?.lokaleMaskottchen
    if (!lesen) return
    setUebertrage(true)
    try {
      const lokal = await lesen()
      if (!lokal.length) return notifySuccess('In der Exe an diesem PC gibt es keine Figuren.')
      for (const m of lokal) {
        await window.api.maskottchen.save({ id: m.id, name: m.name, beschreibung: m.beschreibung, quelle: m.quelle, ...(m.vorlage ? { vorlage: m.vorlage } : {}) })
        for (const [pose, bild] of Object.entries(m.posen)) await window.api.maskottchen.pose(m.id, pose, bild)
      }
      useMaskottchen.getState().setze(await window.api.maskottchen.list())
      notifySuccess(`${lokal.length} Figur${lokal.length === 1 ? '' : 'en'} übernommen: ${lokal.map((m) => m.name).join(', ')}.`)
    } catch (e) {
      notifyError(e, 'Figuren nicht übernommen')
    } finally {
      setUebertrage(false)
    }
  }

  return (
    <Card withBorder padding="lg">
      <Title order={4} mb={4}>
        {schule ? 'Maskottchen und Illustrationen der Schule' : derSchule.length ? 'Eigene Maskottchen und Illustrationen' : 'Maskottchen und Illustrationen'}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {schule
          ? 'Diese Figuren stehen allen Lehrkräften zur Verfügung; nur Admins bearbeiten sie. Lehrkräfte können sich in ihren Einstellungen zusätzlich eigene Figuren anlegen.'
          : 'Für jüngere Jahrgänge setzen die Programme altersgerechte Figuren auf die Materialien – an Merkkästen, Aufgaben und als Begrüßung; auf Arbeiten nur am Kopf und am Schluss. Jede Figur hat eine Vorlage und zwölf Posen (winkend, zeigend, denkend, schreibend, sprechend …).'}
      </Text>
      {!schule && derSchule.length > 0 && (
        <Card withBorder padding="sm" mb="md" data-maskottchen-schule>
          <Text size="sm" fw={600} mb={6}>
            Figuren der Schule
          </Text>
          <Group gap="md">
            {derSchule.map((m) => (
              <Tooltip key={m.id} label={`${m.name} – von der Schule (Verwaltung), hier nur ansehen`}>
                <Stack gap={2} align="center" style={{ cursor: 'pointer' }} onClick={() => setAnsicht({ figurId: m.id, poseId: 'winkend' })}>
                  <Image src={m.vorlage || m.posen.winkend} w={56} h={72} fit="contain" alt={m.name} />
                  <Text size="xs">
                    {m.name}
                    {standardId === m.id ? ' ★' : ''}
                  </Text>
                </Stack>
              </Tooltip>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Als Standardfigur wählbar. Eigene Figuren entstehen unten.
          </Text>
        </Card>
      )}
      {!schule && hatClient() && window.__schulappsClient?.lokaleMaskottchen && (
        <Group mb="md">
          <Button variant="light" leftSection={<IconUpload size={16} />} loading={uebertrage} onClick={() => void ausExeUebernehmen()} data-figuren-uebernehmen>
            Figuren aus der Exe an diesem PC übernehmen
          </Button>
          <Text size="xs" c="dimmed">
            Liest die Figuren der Schul-Apps-Exe (ohne Server) auf diesem PC und legt sie hier ab. Gleichnamige werden aktualisiert.
          </Text>
        </Group>
      )}
      <Group align="flex-end" mb="md" display={schule ? 'none' : undefined}>
        <ZahlFeld
          label="Illustrationen bis Klasse"
          description="Darüber nur, wenn sie am Blatt eingeschaltet werden"
          min={4}
          max={10}
          value={illu.bisKlasse}
          onChange={(v) => update({ illustrationen: { ...illu, bisKlasse: Math.max(4, Math.min(10, Number(v) || ILLUSTRATIONEN_BIS_KLASSE)) } })}
          w={220}
        />
        <Select
          label="Standardfigur"
          data={alle.map((m) => ({ value: m.id, label: m.schule ? `${m.name} (Schule)` : m.name }))}
          value={standardId ?? null}
          onChange={(v) => v && update({ illustrationen: { ...illu, standardId: v } })}
          placeholder="Noch keine Figur"
          w={260}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="md">
        {liste.map((m) => {
          const fertig = MASKOTTCHEN_POSEN.filter((p) => m.posen[p.id]).length
          const fehlend = MASKOTTCHEN_POSEN.filter((p) => !m.posen[p.id]).map((p) => p.id)
          return (
            <Card key={m.id} withBorder padding="sm" data-maskottchen={m.id}>
              <Group align="flex-start" wrap="nowrap">
                <Image src={m.vorlage || m.posen.winkend} w={72} h={96} fit="contain" alt={m.name} />
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text fw={600} truncate>
                      {m.name}
                    </Text>
                    {!schule && standardId === m.id && <Badge size="xs">Standard</Badge>}
                    <Badge size="xs" variant="light" color={fertig === MASKOTTCHEN_POSEN.length ? 'green' : 'gray'}>
                      {fertig} / {MASKOTTCHEN_POSEN.length} Posen
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {m.beschreibung || (m.quelle === 'upload' ? 'Hochgeladene Vorlage – die KI beschreibt sie beim Zeichnen der Posen.' : '')}
                  </Text>
                  <Group gap={4}>
                    {MASKOTTCHEN_POSEN.map((p) => (
                      <Tooltip key={p.id} label={`${p.label} – ${p.zweck}${m.posen[p.id] ? '' : ' (fehlt)'} · vergrößern`}>
                        <ActionIcon
                          size="sm"
                          variant={m.posen[p.id] ? 'light' : 'default'}
                          color={m.posen[p.id] ? 'green' : 'gray'}
                          aria-label={`Pose ${p.label}`}
                          onClick={() => setAnsicht({ figurId: m.id, poseId: p.id })}
                        >
                          {m.posen[p.id] ? <img src={m.posen[p.id]} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> : <IconPhoto size={12} />}
                        </ActionIcon>
                      </Tooltip>
                    ))}
                  </Group>
                  <Group gap={6}>
                    <Button
                      size="compact-xs"
                      variant="light"
                      leftSection={<IconSparkles size={12} />}
                      onClick={() => posenZeichnen(m, fehlend.length ? fehlend : undefined)}
                    >
                      {fehlend.length ? `${fehlend.length} fehlende Posen zeichnen` : 'Alle Posen neu zeichnen'}
                    </Button>
                    {!schule && standardId !== m.id && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconStar size={12} />}
                        onClick={() => update({ illustrationen: { ...illu, standardId: m.id } })}
                      >
                        Als Standard
                      </Button>
                    )}
                    {!schule && standardId === m.id && <IconStarFilled size={14} color="var(--mantine-color-yellow-6)" />}
                    <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => void loeschen(m)}>
                      Löschen
                    </Button>
                  </Group>
                </Stack>
              </Group>
            </Card>
          )
        })}
      </SimpleGrid>

      {/* Leicht abgesetzt in Hell UND Dunkel – ein fester Grauton stand im dunklen Thema als weißer Kasten da */}
      <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
        <Text size="sm" fw={600} mb={6}>
          Neue Figur
        </Text>
        <Stack gap={6}>
          <TextInput label="Name" placeholder="z. B. Professor Pengu" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <Textarea
            label="Beschreibung für die KI"
            description="Tier oder Figur, Kleidung, Merkmale – die Bild-KI zeichnet daraus die Vorlage und danach die Posen"
            placeholder="ein freundlicher Pinguin als Professor mit runder Brille und blauer Fliege"
            autosize
            minRows={2}
            value={angabe}
            onChange={(e) => setAngabe(e.currentTarget.value)}
          />
          <Group>
            <Button leftSection={<IconSparkles size={14} />} disabled={!name.trim() || !angabe.trim()} onClick={() => void neuPerKi()}>
              Von der KI zeichnen lassen
            </Button>
            <FileButton onChange={(f) => void hochladen(f)} accept="image/png,image/jpeg,image/webp">
              {(props) => (
                <Button {...props} variant="default" leftSection={<IconUpload size={14} />} loading={laeuft === 'upload'}>
                  Eigene Vorlage hochladen
                </Button>
              )}
            </FileButton>
            <Tooltip label="Liste neu laden">
              <ActionIcon variant="subtle" aria-label="Maskottchen neu laden" onClick={() => void useMaskottchen.getState().lade()}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Text size="xs" c="dimmed">
            Die KI zeichnet Vorlage und Posen auf neongrünem Grund, der anschließend entfernt wird – auf dem Blatt steht nur die Figur. Beim Hochladen wird der
            Hintergrund ebenso freigestellt; die Posen zeichnet die KI aus einer Beschreibung der Vorlage. Jede Pose ist eine Bildanfrage.
          </Text>
        </Stack>
      </Card>

      <PosenAnsicht
        ansicht={ansicht}
        liste={alle}
        nurAnsehen={Boolean(ansicht && alle.find((m) => m.id === ansicht.figurId)?.schule) && !schule}
        onWechsel={setAnsicht}
        onZeichnen={(m, poseId) => {
          posenZeichnen(m, [poseId])
          setAnsicht(null)
        }}
      />
    </Card>
  )
}

/**
 * Eine Pose groß – mit Blättern zur nächsten und dem Knopf zum (Neu-)Zeichnen.
 * Die Figur kommt bei jedem Zeichnen frisch aus der Liste, damit ein gerade fertiges Bild sofort hier steht.
 */
function PosenAnsicht({
  ansicht,
  liste,
  onWechsel,
  onZeichnen,
  nurAnsehen = false
}: {
  ansicht: { figurId: string; poseId: string } | null
  liste: MaskottchenInfo[]
  nurAnsehen?: boolean
  onWechsel: (a: { figurId: string; poseId: string } | null) => void
  onZeichnen: (figur: MaskottchenInfo, poseId: string) => void
}): React.JSX.Element {
  const figur = ansicht ? liste.find((m) => m.id === ansicht.figurId) : undefined
  const index = ansicht ? MASKOTTCHEN_POSEN.findIndex((p) => p.id === ansicht.poseId) : -1
  const pose = index >= 0 ? MASKOTTCHEN_POSEN[index] : undefined
  const bild = figur && pose ? figur.posen[pose.id] : undefined
  const blaettere = (schritt: number): void => {
    if (!figur) return
    const n = MASKOTTCHEN_POSEN.length
    onWechsel({ figurId: figur.id, poseId: MASKOTTCHEN_POSEN[(index + schritt + n) % n].id })
  }
  return (
    <Modal opened={Boolean(figur && pose)} onClose={() => onWechsel(null)} title={figur && pose ? `${figur.name} – ${pose.label}` : ''} size="md" centered>
      {figur && pose && (
        <Stack gap="sm" data-posen-ansicht={pose.id}>
          <Group wrap="nowrap" align="center" gap="xs">
            <ActionIcon variant="subtle" aria-label="Vorige Pose" onClick={() => blaettere(-1)}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            {/* Getönter Grund statt Weiß: So sieht man, dass die Figur wirklich freigestellt ist */}
            <div
              style={{
                flex: 1,
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--mantine-radius-md)',
                background: 'var(--mantine-color-default-hover)'
              }}
            >
              {bild ? (
                <Image src={bild} alt={`${figur.name} ${pose.label}`} fit="contain" h={320} w="auto" />
              ) : (
                <Stack align="center" gap={4}>
                  <IconPhoto size={36} opacity={0.5} />
                  <Text size="sm" c="dimmed">
                    Diese Pose gibt es noch nicht.
                  </Text>
                </Stack>
              )}
            </div>
            <ActionIcon variant="subtle" aria-label="Nächste Pose" onClick={() => blaettere(1)}>
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
          <Text size="sm">
            <Text span fw={600}>
              {pose.label}
            </Text>{' '}
            · {pose.zweck} · Pose {index + 1} von {MASKOTTCHEN_POSEN.length}
          </Text>
          <Text size="xs" c="dimmed">
            Die Figur {pose.prompt}.
          </Text>
          <Group justify="space-between">
            <Button variant="default" onClick={() => onWechsel(null)}>
              Schließen
            </Button>
            {!nurAnsehen && (
              <Button leftSection={<IconSparkles size={14} />} onClick={() => onZeichnen(figur, pose.id)}>
                {bild ? 'Pose neu zeichnen lassen' : 'Pose zeichnen lassen'}
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
