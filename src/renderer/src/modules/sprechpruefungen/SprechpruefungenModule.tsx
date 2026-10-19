/**
 * App „Sprechprüfungen" (19.10.2026, Leiste › Organisation, abgestimmt mit der Lehrkraft): Material für die
 * Sprechprüfung je Jahrgang – Interview-Sets, Bildkarten (Monolog) und Dialogkarten – im schulweiten Pool je Sprache
 * (server/sprechBank.ts). Das Sprechtraining der Lernenden nutzt diese Karten; dazu druckbare Prüfungssets für die echte
 * Prüfung. Nur für Lehrkräfte mit Englisch, Französisch oder Spanisch; Reiter je eigenem Fach.
 *
 * Aufbau (gewählt): Fach-Reiter › Jahrgangs-Kacheln (Lehrwerk-Cover, GER-Ziel, Ampel je Teil) › Jahrgang mit drei
 * Spalten. Erstellen je Teil auf Knopfdruck (KI im Hintergrund), danach Durchsicht; Bilder erst nach dem Speichern.
 * Grundlage wählbar: Lehrwerk bis Unit (Wortschatz, Grammatik) oder „wie eine Klasse" – dazu die Lehrplan-Themen.
 */
import { Alert, Badge, Button, Card, Container, Group, Image, Loader, Modal, SegmentedControl, Select, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput, Title, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconMicrophone, IconPencil, IconPhoto, IconPlus, IconPrinter, IconSparkles, IconTrash, IconUsers } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Textbook, TextbookMeta } from '@shared/types'
import type { BildKarte, DialogKarte, InterviewKarte, SprechKarte } from '@shared/sprechen/karten'
import { kartenAnfrage, type Grundlage, type KartenTeil } from '@shared/sprechen/erstellen'
import { zielNiveau, type SprechSprache } from '@shared/sprechen/niveaus'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { useAppSettings } from '../../shared/settingsStore'
import { BandCover } from '../../shared/components/BandCover'
import { starteAuftrag } from '../../shared/auftraege'
import { collectKnownVocab, grammatikStand } from '../../shared/knownVocab'
import { useLehrplanVorschlaege } from '../../shared/lehrplanVorschlaege'
import { drucken, pruefungsSetHtml } from './pruefungsset'

const FAECHER: { id: string; sprache: SprechSprache; name: string; ab: number }[] = [
  { id: 'englisch', sprache: 'en', name: 'Englisch', ab: 5 },
  { id: 'franzoesisch', sprache: 'fr', name: 'Französisch', ab: 6 },
  { id: 'spanisch', sprache: 'es', name: 'Spanisch', ab: 6 }
]
const TEILE: { id: KartenTeil; name: string; anzahl: number; knopf: string }[] = [
  { id: 'interview', name: 'Interview', anzahl: 3, knopf: '+ 3 Interview-Sets' },
  { id: 'monolog', name: 'Monolog (Bildkarten)', anzahl: 4, knopf: '+ 4 Bildkarten' },
  { id: 'dialog', name: 'Dialog', anzahl: 4, knopf: '+ 4 Dialogkarten' }
]

interface PoolKarte {
  id: string
  sprache: string
  jahrgang: number
  teil: KartenTeil
  karte: SprechKarte
  eigene: boolean
}

/** Entwürfe der KI zum Durchsehen (nur auf diesem Gerät, bis gespeichert oder verworfen) */
interface Entwurf {
  schluessel: string
  sprache: SprechSprache
  jahrgang: number
  teil: KartenTeil
  karte: SprechKarte & { bildPrompt?: string }
}
const ENTWURF_SCHLUESSEL = 'sa-sprech-entwuerfe'
const EREIGNIS = 'schulapps:sprech-entwuerfe'
const ladeEntwuerfe = (): Entwurf[] => {
  try {
    return JSON.parse(localStorage.getItem(ENTWURF_SCHLUESSEL) ?? '[]') as Entwurf[]
  } catch {
    return []
  }
}
const speichereEntwuerfe = (l: Entwurf[]): void => {
  try {
    localStorage.setItem(ENTWURF_SCHLUESSEL, JSON.stringify(l))
  } catch {
    /* voll */
  }
  window.dispatchEvent(new Event(EREIGNIS))
}
function useEntwuerfe(): Entwurf[] {
  const [l, setL] = useState(ladeEntwuerfe)
  useEffect(() => {
    const f = (): void => setL(ladeEntwuerfe())
    window.addEventListener(EREIGNIS, f)
    return () => window.removeEventListener(EREIGNIS, f)
  }, [])
  return l
}

const bildUrl = (datei: string): string => `/server/sprech-bank/bild/${datei}`
const titelVon = (k: SprechKarte): string => (k.art === 'interview' ? k.thema : k.titel)

/** Bild zur Karte erzeugen und am Server ablegen (im Hintergrund) */
function bildErzeugen(p: PoolKarte, prompt: string, fertig: () => void): void {
  void starteAuftrag({
    moduleId: 'sprechpruefungen',
    docId: 'sprechpruefungen',
    titel: `Bild: ${titelVon(p.karte)}`,
    art: 'Sprechkarte-Bild',
    eingabe: { p, prompt },
    sperrt: false,
    fehlerTitel: 'Bild konnte nicht erzeugt werden',
    arbeit: async (e, k) => {
      k.melde('Bild wird gezeichnet …')
      const dataUrl = await k.bild(
        `${e.prompt} Style: friendly realistic illustration for a school speaking exam, clear scene, no text, no logos, no real persons.`
      )
      const { datei } = await senden<{ datei: string }>('/server/sprech-bank/bild', { dataUrl })
      const karte = e.p.karte as BildKarte
      await senden('/server/sprech-bank/speichern', { id: e.p.id, sprache: e.p.sprache, jahrgang: e.p.jahrgang, teil: e.p.teil, karte: { ...karte, bilder: [datei] } })
      return datei
    },
    ablegen: async () => fertig(),
    abschluss: () => 'Bild gespeichert'
  })
}

function KartenEditor({ k, schliessen, speichern }: { k: SprechKarte; schliessen: () => void; speichern: (k: SprechKarte) => void }): React.JSX.Element {
  const [x, setX] = useState<SprechKarte>(k)
  const zeilen = (l: string[]): string => l.join('\n')
  const aus = (s: string): string[] => s.split('\n').map((z) => z.trim()).filter(Boolean)
  return (
    <Modal opened onClose={schliessen} title="Karte bearbeiten" size="lg">
      <Stack gap="sm">
        {x.art === 'interview' && (
          <>
            <TextInput label="Thema" value={x.thema} onChange={(e) => setX({ ...x, thema: e.currentTarget.value })} />
            <Textarea label="Fragen (eine je Zeile, offene zuerst)" autosize minRows={5} value={zeilen(x.fragen)} onChange={(e) => setX({ ...x, fragen: aus(e.currentTarget.value) })} />
          </>
        )}
        {x.art === 'monolog' && (
          <>
            <TextInput label="Titel" value={x.titel} onChange={(e) => setX({ ...x, titel: e.currentTarget.value })} />
            <Textarea label="Was auf dem Bild zu sehen ist (für die KI-Prüferin)" autosize minRows={2} value={x.bildBeschreibung} onChange={(e) => setX({ ...x, bildBeschreibung: e.currentTarget.value })} />
            <Textarea label="Leitfragen (eine je Zeile)" autosize minRows={3} value={zeilen(x.leitfragen)} onChange={(e) => setX({ ...x, leitfragen: aus(e.currentTarget.value) })} />
          </>
        )}
        {x.art === 'dialog' && (
          <>
            <Select
              label="Form"
              data={[
                { value: 'rollenspiel', label: 'Rollenspiel' },
                { value: 'infogap', label: 'Info-Gap (Info- und Fragekarte)' },
                { value: 'diskussion', label: 'Diskussion mit Einigung' }
              ]}
              value={x.form}
              onChange={(v) => v && setX({ ...x, form: v as DialogKarte['form'] })}
            />
            <TextInput label="Titel" value={x.titel} onChange={(e) => setX({ ...x, titel: e.currentTarget.value })} />
            <Textarea label="Situation (Text der Karte)" autosize minRows={2} value={x.situation} onChange={(e) => setX({ ...x, situation: e.currentTarget.value })} />
            <TextInput label="Rolle Schüler/in" value={x.rolleSchueler} onChange={(e) => setX({ ...x, rolleSchueler: e.currentTarget.value })} />
            <Textarea label="Rolle der Partnerin (bei Info-Gap: ihre Infos)" autosize minRows={2} value={x.rolleKi} onChange={(e) => setX({ ...x, rolleKi: e.currentTarget.value })} />
            <Textarea label="Punkte / Optionen (eine je Zeile)" autosize minRows={3} value={zeilen(x.punkte)} onChange={(e) => setX({ ...x, punkte: aus(e.currentTarget.value) })} />
            <TextInput label="Ziel" value={x.ziel} onChange={(e) => setX({ ...x, ziel: e.currentTarget.value })} />
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button onClick={() => speichern(x)} data-sprechkarte-speichern>
            Speichern
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Vorschau einer Karte (Kachel) */
function KartenKachel({ k, onClick, aktionen, entwurf }: { k: SprechKarte; onClick?: () => void; aktionen?: React.ReactNode; entwurf?: boolean }): React.JSX.Element {
  return (
    <Card withBorder radius="md" padding="sm" style={{ borderColor: entwurf ? 'var(--mantine-color-yellow-6)' : undefined }} data-sprechkarte={k.art}>
      <UnstyledButton onClick={onClick} style={{ display: 'block', width: '100%' }}>
        {k.art === 'monolog' &&
          (k.bilder[0] ? (
            <Image src={bildUrl(k.bilder[0])} h={110} radius="sm" fit="cover" alt="" mb={6} />
          ) : (
            <Group h={60} justify="center" mb={6} style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6 }}>
              <IconPhoto size={22} opacity={0.5} />
              <Text size="xs" c="dimmed">
                {entwurf ? 'Bild nach dem Speichern' : 'Bild wird erstellt …'}
              </Text>
            </Group>
          ))}
        <Text fw={700} size="sm" lineClamp={2}>
          {titelVon(k)}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={2}>
          {k.art === 'interview'
            ? `${k.fragen.length} Fragen · ${k.fragen[0] ?? ''}`
            : k.art === 'monolog'
              ? k.leitfragen.join(' · ')
              : `${k.form === 'infogap' ? 'Info-Gap' : k.form === 'diskussion' ? 'Diskussion' : 'Rollenspiel'} · ${k.situation}`}
        </Text>
      </UnstyledButton>
      {aktionen && (
        <Group gap={4} mt={6} justify="flex-end">
          {aktionen}
        </Group>
      )}
    </Card>
  )
}

function Jahrgang({
  fach,
  jahrgang,
  pool,
  darfAlle,
  zurueck,
  laden
}: {
  fach: (typeof FAECHER)[number]
  jahrgang: number
  pool: PoolKarte[]
  darfAlle: boolean
  zurueck: () => void
  laden: () => void
}): React.JSX.Element {
  const settings = useAppSettings((s) => s.settings)
  const niveau = zielNiveau(fach.sprache, jahrgang)
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  useEffect(() => void window.api.textbooks.list().then(setBuecher, () => setBuecher([])), [])
  const baende = buecher.filter((b) => b.language === fach.sprache && !b.platzhalter)
  const [modus, setModus] = useState<'lehrwerk' | 'klasse'>('lehrwerk')
  const vorschlag = baende.find((b) => b.grade === jahrgang && b.stateId === settings.defaults.stateId) ?? baende.find((b) => b.grade === jahrgang)
  const [bandId, setBandId] = useState<string | null>(null)
  const band = baende.find((b) => b.id === (bandId ?? vorschlag?.id))
  const [unit, setUnit] = useState<string | null>(null)
  const unitName = unit ?? band?.units[band.units.length - 1]?.name ?? null
  // „Wie eine Klasse": eigene Lerngruppen dieser Sprache → Band und Unit des Kurses
  const [klassen, setKlassen] = useState<{ value: string; label: string }[]>([])
  const [klasse, setKlasse] = useState<string | null>(null)
  useEffect(() => {
    if (modus !== 'klasse') return
    void holen<{ klassen: { name: string; faecher: { id: string; fach: string }[] }[] }>('/server/klassen').then(
      (r) =>
        setKlassen(
          r.klassen.flatMap((k) => k.faecher.filter((f) => f.fach.toLowerCase() === fach.name.toLowerCase()).map((f) => ({ value: f.id, label: `${k.name} ${f.fach}` })))
        ),
      () => setKlassen([])
    )
  }, [modus, fach.name])
  useEffect(() => {
    if (modus !== 'klasse' || !klasse) return
    void (async () => {
      try {
        const d = await holen<{ klassenKurs?: string | null }>(`/server/klassen/${klasse}`)
        if (!d.klassenKurs) return
        const k = await holen<{ teile?: { buch?: string; unit?: string; zeit: number }[] }>(`/server/vokabeln/${d.klassenKurs}`)
        // Zuletzt freigegebener Abschnitt mit Band (Name wie „Green Line 3" – im Lehrwerk ggf. mit Zusatz)
        const letzte = (k.teile ?? []).filter((t) => t.buch).sort((a, b) => b.zeit - a.zeit)[0]
        const name = (letzte?.buch ?? '').toLowerCase()
        const b = name ? (baende.find((x) => x.name.toLowerCase() === name) ?? baende.find((x) => x.name.toLowerCase().startsWith(name))) : undefined
        if (b) {
          setBandId(b.id)
          setUnit(letzte?.unit ?? null)
        }
      } catch (e) {
        notifyError(e)
      }
    })()
  }, [modus, klasse]) // eslint-disable-line react-hooks/exhaustive-deps
  const lehrplan = useLehrplanVorschlaege(settings.defaults.stateId, settings.defaults.schoolTypeId, fach.id, jahrgang)
  const themen = useMemo(() => lehrplan.gruppen.flatMap((g) => [g.group, ...g.items]).slice(0, 30), [lehrplan])
  const entwuerfe = useEntwuerfe().filter((e) => e.sprache === fach.sprache && e.jahrgang === jahrgang)
  const [bearbeiten, setBearbeiten] = useState<{ p?: PoolKarte; e?: Entwurf } | null>(null)
  const [druck, setDruck] = useState(false)

  const erstellen = (teil: (typeof TEILE)[number]): void => {
    const vorhanden = pool.filter((p) => p.teil === teil.id).map((p) => titelVon(p.karte))
    void starteAuftrag({
      moduleId: 'sprechpruefungen',
      docId: 'sprechpruefungen',
      titel: `${teil.knopf.replace('+ ', '')} · ${fach.name} Jg ${jahrgang}`,
      art: 'Sprechkarten',
      eingabe: { teil: teil.id, anzahl: teil.anzahl, bandId: band?.id ?? null, unitName, vorhanden },
      sperrt: false,
      fehlerTitel: 'Karten konnten nicht erstellt werden',
      arbeit: async (e, k) => {
        k.melde('Grundlage wird zusammengestellt …')
        let woerter: string[] = []
        let bekannt: string[] = []
        let neu: string[] = []
        let quelle = ''
        if (e.bandId && e.unitName) {
          const voll: Textbook = await window.api.textbooks.get(e.bandId)
          const kv = await collectKnownVocab(voll, e.unitName, [], jahrgang, buecher, (id) => window.api.textbooks.get(id))
          woerter = kv?.words ?? []
          quelle = kv?.source ?? ''
          const gs = grammatikStand(kv)
          bekannt = gs?.bekannt ?? []
          neu = gs?.neu ?? []
        }
        const g: Grundlage = { sprache: fach.sprache, jahrgang, niveau, quelle, woerter, grammatikBekannt: bekannt, grammatikNeu: neu, themen }
        k.melde('Die KI schreibt die Karten …')
        const r = await k.ai<{ karten: Record<string, unknown>[] }>(kartenAnfrage(e.teil, e.anzahl, g, e.vorhanden))
        return (r.karten ?? []).map((x, i) => ({ ...x, art: e.teil, id: `e${Date.now().toString(36)}${i}`, bilder: [] }))
      },
      ablegen: async (karten) => {
        speichereEntwuerfe([
          ...ladeEntwuerfe(),
          ...karten.map((karte) => ({ schluessel: String(karte.id), sprache: fach.sprache, jahrgang, teil: teil.id, karte: karte as unknown as Entwurf['karte'] }))
        ])
      },
      abschluss: (karten) => `${karten.length} Karten zum Durchsehen in „Sprechprüfungen"`
    })
    notifySuccess('Die KI erstellt die Karten im Hintergrund – danach hier durchsehen und speichern.')
  }

  const speichern = async (teil: KartenTeil, karte: SprechKarte, id?: string, bildPrompt?: string): Promise<void> => {
    try {
      const r = await senden<{ id: string }>('/server/sprech-bank/speichern', { id, sprache: fach.sprache, jahrgang, teil, karte })
      if (teil === 'monolog' && bildPrompt && !(karte as BildKarte).bilder.length)
        bildErzeugen({ id: r.id, sprache: fach.sprache, jahrgang, teil, karte, eigene: true }, bildPrompt, laden)
      laden()
    } catch (e) {
      notifyError(e)
    }
  }
  const entwurfWeg = (s: string): void => speichereEntwuerfe(ladeEntwuerfe().filter((x) => x.schluessel !== s))
  const loeschen = (p: PoolKarte): void => void senden('/server/sprech-bank/loeschen', { id: p.id }).then(laden, (e: unknown) => notifyError(e))

  return (
    <Stack gap="md" data-sprech-jahrgang={jahrgang}>
      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck} px={4}>
            Alle Jahrgänge
          </Button>
          <Title order={3}>
            {fach.name} · Jahrgang {jahrgang}
          </Title>
          <Badge variant="light">GER {niveau}</Badge>
        </Group>
        <Button leftSection={<IconPrinter size={16} />} variant="light" onClick={() => setDruck(true)} disabled={!pool.length} data-pruefungsset-knopf>
          Prüfungsset drucken
        </Button>
      </Group>
      <Card withBorder radius="md" padding="sm">
        <Group gap="md" align="flex-end" wrap="wrap">
          <SegmentedControl
            value={modus}
            onChange={(v) => setModus(v as 'lehrwerk' | 'klasse')}
            data={[
              { value: 'lehrwerk', label: 'Lehrwerk bis Unit' },
              { value: 'klasse', label: 'Wie eine Klasse' }
            ]}
          />
          {modus === 'klasse' && (
            <Select label="Klasse" leftSection={<IconUsers size={14} />} data={klassen} value={klasse} onChange={setKlasse} placeholder="wählen …" w={200} />
          )}
          <Select
            label="Band"
            data={baende.map((b) => ({ value: b.id, label: b.name }))}
            value={band?.id ?? null}
            onChange={(v) => (setBandId(v), setUnit(null))}
            w={200}
            placeholder={baende.length ? 'wählen …' : 'kein Lehrwerk'}
          />
          <Select label="bis" data={(band?.units ?? []).map((u) => u.name)} value={unitName} onChange={setUnit} w={140} />
          <Text size="xs" c="dimmed" maw={360}>
            Grundlage: Wortschatz und Grammatik bis zu dieser Stelle, dazu {themen.length} Lehrplan-Themen des Jahrgangs.
          </Text>
        </Group>
      </Card>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {TEILE.map((t) => {
          const karten = pool.filter((p) => p.teil === t.id)
          const offen = entwuerfe.filter((e) => e.teil === t.id)
          return (
            <Stack key={t.id} gap="xs" data-sprech-spalte={t.id}>
              <Group justify="space-between" gap="xs">
                <Text fw={800}>
                  {t.name} <Text span c="dimmed" size="sm">({karten.length})</Text>
                </Text>
              </Group>
              <Group gap={4}>
                <Button size="xs" variant="light" color="violet" leftSection={<IconSparkles size={14} />} onClick={() => erstellen(t)} data-sprech-erstellen={t.id}>
                  {t.knopf}
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    setBearbeiten({
                      p: {
                        id: '',
                        sprache: fach.sprache,
                        jahrgang,
                        teil: t.id,
                        eigene: true,
                        karte:
                          t.id === 'interview'
                            ? ({ art: 'interview', id: '', thema: '', fragen: [] } as InterviewKarte)
                            : t.id === 'monolog'
                              ? ({ art: 'monolog', id: '', titel: '', bilder: [], bildBeschreibung: '', leitfragen: [] } as BildKarte)
                              : ({ art: 'dialog', id: '', form: 'rollenspiel', titel: '', situation: '', rolleSchueler: '', rolleKi: '', punkte: [], ziel: '' } as DialogKarte)
                      }
                    })
                  }
                >
                  Von Hand
                </Button>
              </Group>
              {offen.map((e) => (
                <KartenKachel
                  key={e.schluessel}
                  k={e.karte}
                  entwurf
                  onClick={() => setBearbeiten({ e })}
                  aktionen={
                    <>
                      <Badge color="yellow" variant="light" size="xs">
                        Entwurf
                      </Badge>
                      <Button
                        size="compact-xs"
                        onClick={() => {
                          void speichern(e.teil, { ...e.karte, id: '' } as SprechKarte, undefined, e.karte.bildPrompt)
                          entwurfWeg(e.schluessel)
                        }}
                        data-entwurf-speichern
                      >
                        Speichern
                      </Button>
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => entwurfWeg(e.schluessel)}>
                        Verwerfen
                      </Button>
                    </>
                  }
                />
              ))}
              {karten.map((p) => (
                <KartenKachel
                  key={p.id}
                  k={p.karte}
                  onClick={() => (p.eigene || darfAlle ? setBearbeiten({ p }) : undefined)}
                  aktionen={
                    p.eigene || darfAlle ? (
                      <>
                        <Button size="compact-xs" variant="subtle" leftSection={<IconPencil size={12} />} onClick={() => setBearbeiten({ p })}>
                          Bearbeiten
                        </Button>
                        <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => loeschen(p)}>
                          Löschen
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              ))}
              {!karten.length && !offen.length && (
                <Text size="sm" c="dimmed">
                  Noch keine Karten.
                </Text>
              )}
            </Stack>
          )
        })}
      </SimpleGrid>
      {bearbeiten && (
        <KartenEditor
          k={(bearbeiten.p?.karte ?? bearbeiten.e!.karte) as SprechKarte}
          schliessen={() => setBearbeiten(null)}
          speichern={(k) => {
            const teil = (bearbeiten.p?.teil ?? bearbeiten.e!.teil) as KartenTeil
            if (bearbeiten.e) {
              void speichern(teil, k, undefined, bearbeiten.e.karte.bildPrompt)
              entwurfWeg(bearbeiten.e.schluessel)
            } else void speichern(teil, k, bearbeiten.p?.id || undefined, teil === 'monolog' && !(k as BildKarte).bilder.length ? (k as BildKarte).bildBeschreibung : undefined)
            setBearbeiten(null)
          }}
        />
      )}
      {druck && <DruckDialog fach={fach} jahrgang={jahrgang} pool={pool} schliessen={() => setDruck(false)} />}
    </Stack>
  )
}

function DruckDialog({ fach, jahrgang, pool, schliessen }: { fach: (typeof FAECHER)[number]; jahrgang: number; pool: PoolKarte[]; schliessen: () => void }): React.JSX.Element {
  const von = (teil: KartenTeil): { value: string; label: string }[] => pool.filter((p) => p.teil === teil).map((p) => ({ value: p.id, label: titelVon(p.karte) }))
  const erste = (teil: KartenTeil, n = 0): string | null => pool.filter((p) => p.teil === teil)[n]?.id ?? null
  const [i, setI] = useState(erste('interview'))
  const [a, setA] = useState(erste('monolog'))
  const [b, setB] = useState(erste('monolog', 1) ?? erste('monolog'))
  const [d, setD] = useState(erste('dialog'))
  const karte = <T,>(id: string | null): T | undefined => pool.find((p) => p.id === id)?.karte as T | undefined
  return (
    <Modal opened onClose={schliessen} title={`Prüfungsset drucken – ${fach.name} Jg ${jahrgang}`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Für ein Prüflingspaar: Prüferblatt, Kandidatenkarten A und B und zwei Bewertungsbögen (30 Punkte).
        </Text>
        <Select label="Interview-Set" data={von('interview')} value={i} onChange={setI} clearable />
        <Select label="Bildkarte Kandidat/in A" data={von('monolog')} value={a} onChange={setA} clearable />
        <Select label="Bildkarte Kandidat/in B" data={von('monolog')} value={b} onChange={setB} clearable />
        <Select label="Dialogkarte" data={von('dialog')} value={d} onChange={setD} clearable />
        <Button
          leftSection={<IconPrinter size={16} />}
          onClick={() =>
            drucken(
              pruefungsSetHtml({
                fach: fach.name,
                jahrgang,
                niveau: zielNiveau(fach.sprache, jahrgang),
                interview: karte<InterviewKarte>(i),
                monologA: karte<BildKarte>(a),
                monologB: karte<BildKarte>(b),
                dialog: karte<DialogKarte>(d),
                bildUrl: (x) => `${window.location.origin}${bildUrl(x)}`
              })
            )
          }
          data-pruefungsset-drucken
        >
          Drucken
        </Button>
      </Stack>
    </Modal>
  )
}

export default function SprechpruefungenModule({ active }: { active: boolean }): React.JSX.Element | null {
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  const faecher = FAECHER.filter((f) => !eigene?.length || eigene.includes(f.id))
  const [fachId, setFachId] = useState<string>(faecher[0]?.id ?? 'englisch')
  const fach = FAECHER.find((f) => f.id === fachId) ?? FAECHER[0]
  const [daten, setDaten] = useState<{ karten: PoolKarte[]; darfAlle: boolean } | null>(null)
  const [jahrgang, setJahrgang] = useState<number | null>(null)
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  const laden = useCallback(() => {
    void holen<{ karten: PoolKarte[]; darfAlle: boolean }>(`/server/sprech-bank?sprache=${fach.sprache}`).then(setDaten, (e: unknown) => (notifyError(e), setDaten({ karten: [], darfAlle: false })))
  }, [fach.sprache])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  useEffect(() => void window.api.textbooks.list().then(setBuecher, () => setBuecher([])), [])
  if (!active) return null
  const jahrgaenge = Array.from({ length: 13 - fach.ab + 1 }, (_, i) => fach.ab + i)
  return (
    <Container size="xl" py="lg" data-sprechpruefungen>
      <Group gap="sm" mb="md">
        <IconMicrophone size={26} />
        <div>
          <Title order={2}>Sprechprüfungen</Title>
          <Text size="sm" c="dimmed">
            Material je Jahrgang für die Sprechprüfung und das Sprechtraining der Lernenden – für die ganze Fachschaft.
          </Text>
        </div>
      </Group>
      {faecher.length > 1 && (
        <Tabs value={fachId} onChange={(v) => v && (setFachId(v), setJahrgang(null))} mb="md">
          <Tabs.List>
            {faecher.map((f) => (
              <Tabs.Tab key={f.id} value={f.id} data-sprech-fach={f.id}>
                {f.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      {!daten ? (
        <Loader />
      ) : jahrgang ? (
        <Jahrgang fach={fach} jahrgang={jahrgang} pool={daten.karten.filter((k) => k.jahrgang === jahrgang)} darfAlle={daten.darfAlle} zurueck={() => setJahrgang(null)} laden={laden} />
      ) : (
        <>
          <Alert variant="light" mb="md" p="xs">
            <Text size="sm">
              Jahrgang auswählen. Die Punkte zeigen, wie viele Karten es je Teil gibt (grau = keine, orange = wenige, grün = genug zum Üben).
            </Text>
          </Alert>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
            {jahrgaenge.map((j) => {
              const k = daten.karten.filter((x) => x.jahrgang === j)
              const band = buecher.find((b) => b.language === fach.sprache && b.grade === j && !b.platzhalter)
              return (
                <UnstyledButton key={j} onClick={() => setJahrgang(j)} data-sprech-jahrgang-kachel={j}>
                  <Card withBorder radius="md" padding="md" h="100%">
                    <Stack gap={6} align="center">
                      {band ? <BandCover band={band} land={band.stateId ?? ''} breite={56} /> : <IconMicrophone size={40} opacity={0.4} />}
                      <Text fw={800}>Jahrgang {j}</Text>
                      <Badge variant="light">GER {zielNiveau(fach.sprache, j)}</Badge>
                      <Group gap={6}>
                        {TEILE.map((t) => {
                          const n = k.filter((x) => x.teil === t.id).length
                          return (
                            <div
                              key={t.id}
                              title={`${t.name}: ${n}`}
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: n >= 3 ? 'var(--mantine-color-teal-6)' : n > 0 ? 'var(--mantine-color-orange-5)' : 'var(--mantine-color-gray-4)'
                              }}
                              data-ampel={`${t.id}:${n}`}
                            />
                          )
                        })}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {k.length} Karten
                      </Text>
                    </Stack>
                  </Card>
                </UnstyledButton>
              )
            })}
          </SimpleGrid>
        </>
      )}
    </Container>
  )
}
