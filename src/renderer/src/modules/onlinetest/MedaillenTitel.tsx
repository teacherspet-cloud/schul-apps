/**
 * Medaillen und Titel je Sprache (10.10.2026, mit der Lehrkraft abgestimmt; Konzept
 * recherche/achievements-medaillen-titel.md, Rechnung shared/auszeichnungen.ts, Bilder shared/auszeichnungenBilder.ts).
 *
 *  - Je Sprache ein Reiter: sieben Medaillen (aktuelle Stufe, Fortschritt bis zur nächsten), die Titelleiter mit dem
 *    aktuellen Titel und dem Weg zum nächsten, die Sammlung der Bilder (gesperrt/frei, x von y).
 *  - Die Form des Titels (männlich, weiblich, neutral) wählen die Lernenden selbst – beim ersten Titel fragt ein kleines
 *    Fenster, ändern lässt sie sich jederzeit hier und in den Einstellungen. Ebenso, welcher Titel neben dem Namen steht
 *    (oder keiner) und welches freigeschaltete Bild als Profilbild dient.
 *  - Keine Vergleiche mit anderen: nur der eigene Weg.
 */
import { Badge, Button, Card, Group, Loader, Modal, Progress, Select, SegmentedControl, SimpleGrid, Stack, Tabs, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { stufenName, type TitelForm, type TitelWahl } from '@shared/auszeichnungen'
import { bildAdresse, leiterVon } from '@shared/auszeichnungenBilder'
import { holen, senden } from './serverApi'
import { fuerServer, useDarstellung } from './schuelerDarstellung'

interface MedailleSicht {
  kategorie: string
  name: string
  text: string
  stufe: number
  wert: number
  ziel: number | null
  von: number
  am: number | null
}
interface Leiterstufe {
  stufe: number
  ab: number
  m: string
  w: string
  n: string
  de: string
}
interface SprachSicht {
  sprache: string
  name: string
  jahrgang: number | null
  band: string
  punkte: number
  medaillen: MedailleSicht[]
  titel: { stufe: number; text: string | null; am: number | null; naechsteAb: number | null; leiter: Leiterstufe[] }
  sammlung: { id: string; art: 'medaille' | 'titel'; name: string; wie: string; stufe: number; frei: boolean }[]
}
export interface TitelKurz {
  wahl: TitelWahl
  anzeige: { sprache: string; stufe: number; text: string } | null
  formOffen: boolean
  avatar?: string | null
  beispiel?: { m: string; w: string; n: string } | null
}
type Antwort = TitelKurz & { sprachen: SprachSicht[] }

/** Stufenfarben (Bronze … Meister), in Hell und Dunkel gut zu sehen */
export const STUFEN_FARBEN = ['#868e96', '#b8733a', '#8f9aa6', '#d4a017', '#4f9da6', '#339af0', '#7c5cd6']

const FORMEN: { value: TitelForm; label: string }[] = [
  { value: 'm', label: 'männlich' },
  { value: 'w', label: 'weiblich' },
  { value: 'n', label: 'neutral' }
]

/** Bild einer Medaille oder eines Titels; gesperrt als graue Silhouette mit Schloss */
export function AuszBild({ id, gesperrt = false, groesse = 64, alt = '' }: { id: string; gesperrt?: boolean; groesse?: number; alt?: string }): React.JSX.Element {
  return <img src={bildAdresse(id, gesperrt)} alt={alt} width={groesse} height={Math.round(groesse * (140 / 120))} style={{ objectFit: 'contain', flex: 'none' }} loading="lazy" />
}

/** Wahl speichern (Form oder angezeigter Titel) */
export const titelWahlSenden = (wahl: { form?: TitelForm; anzeige?: TitelWahl['anzeige'] | null }): Promise<TitelKurz> => senden<TitelKurz>('/s/api/auszeichnungen/wahl', wahl)

/**
 * Kleines Fenster beim ersten Titel: Wie soll er lauten? Beispiel aus der eigenen Leiter, alle drei Formen gleichwertig.
 */
export function TitelFormDialog({
  offen,
  beispiel,
  fertig
}: {
  offen: boolean
  /** Formen des erreichten Titels */
  beispiel: { m: string; w: string; n: string } | null
  fertig: (k: TitelKurz | null) => void
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const waehle = (form: TitelForm): void => {
    setLaeuft(true)
    void titelWahlSenden({ form }).then(
      (k) => (setLaeuft(false), fertig(k)),
      () => (setLaeuft(false), fertig(null))
    )
  }
  return (
    <Modal opened={offen} onClose={() => fertig(null)} title="Dein erster Titel!" zIndex={450} centered data-titel-form-dialog>
      <Stack gap="sm">
        <Text size="sm">
          Du hast einen Titel erreicht. In welcher Form sollen deine Titel lauten? Du kannst das jederzeit ändern – unter „Achievements" oder in den Einstellungen.
        </Text>
        {FORMEN.map((f) => (
          <Button key={f.value} variant="light" size="md" loading={laeuft} onClick={() => waehle(f.value)} data-titel-form={f.value} justify="space-between" rightSection={beispiel ? beispiel[f.value] : undefined}>
            {f.label}
          </Button>
        ))}
      </Stack>
    </Modal>
  )
}

/** Form und angezeigter Titel – hier und in den Einstellungen */
export function TitelWahlFelder({ d, geaendert }: { d: Antwort; geaendert: (k: TitelKurz) => void }): React.JSX.Element {
  const erreicht = d.sprachen.flatMap((s) =>
    s.titel.leiter
      .filter((x) => x.stufe <= s.titel.stufe)
      .map((x) => ({ value: `${s.sprache}:${x.stufe}`, label: `${s.name}: ${d.wahl.form === 'm' ? x.m : d.wahl.form === 'w' ? x.w : x.n}` }))
  )
  const anzeige = d.wahl.anzeige === 'aus' ? 'aus' : d.wahl.anzeige ? `${d.wahl.anzeige.sprache}:${d.wahl.anzeige.stufe}` : 'auto'
  return (
    <Stack gap="sm" data-titel-wahl>
      <div>
        <Text size="sm" fw={600}>
          Form deines Titels
        </Text>
        <Text size="xs" c="dimmed" mb={4}>
          Du entscheidest, nicht dein Name.
        </Text>
        <SegmentedControl
          data={FORMEN}
          value={d.wahl.form ?? 'n'}
          onChange={(v) => void titelWahlSenden({ form: v as TitelForm }).then(geaendert, () => undefined)}
          data-titel-form-wahl
        />
      </div>
      <Select
        label="Neben deinem Namen zeigen"
        description="Auf deiner Startseite und beim gemeinsamen Spielen"
        data={[{ value: 'auto', label: 'Automatisch: meinen höchsten Titel' }, { value: 'aus', label: 'Keinen Titel zeigen' }, ...erreicht]}
        value={anzeige}
        allowDeselect={false}
        onChange={(v) => {
          if (!v) return
          const [sprache, stufe] = v.split(':')
          void titelWahlSenden({ anzeige: v === 'aus' ? 'aus' : v === 'auto' ? null : { sprache, stufe: Number(stufe) } }).then(geaendert, () => undefined)
        }}
        comboboxProps={{ zIndex: 500 }}
        data-titel-anzeige
      />
    </Stack>
  )
}

/** Profilbild setzen (Darstellung; der Server nimmt nur freigeschaltete) */
function useAvatar(): [string, (id: string) => void] {
  const { d, setze } = useDarstellung()
  const setzen = (id: string): void => {
    const neu = { ...d, avatar: id }
    setze(neu)
    void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  return [d.avatar ?? '', setzen]
}

function MedailleKarte({ m }: { m: MedailleSicht }): React.JSX.Element {
  const meister = m.stufe >= 6
  const anteil = m.ziel ? Math.max(0, Math.min(100, ((m.wert - m.von) / Math.max(1, m.ziel - m.von)) * 100)) : 100
  return (
    <Card withBorder radius="md" padding="sm" data-medaille={m.kategorie} data-stufe={m.stufe} style={meister ? { borderColor: STUFEN_FARBEN[6], borderWidth: 2 } : undefined}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <AuszBild id={`m-${m.kategorie}-${Math.max(1, m.stufe)}`} gesperrt={m.stufe === 0} groesse={52} alt={`${m.name}: ${stufenName(m.stufe)}`} />
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text fw={700} size="sm">
            {m.name}
          </Text>
          <Badge size="sm" variant={m.stufe ? 'filled' : 'light'} color={m.stufe ? undefined : 'gray'} style={m.stufe ? { background: STUFEN_FARBEN[m.stufe] } : undefined} tt="none">
            {m.stufe ? stufenName(m.stufe) : 'noch offen'}
          </Badge>
          {m.ziel !== null ? (
            <>
              <Progress value={anteil} size="sm" radius="xl" color={STUFEN_FARBEN[Math.min(6, m.stufe + 1)]} aria-label={`${m.wert} von ${m.ziel} bis ${stufenName(m.stufe + 1)}`} />
              <Text size="xs" c="dimmed" data-medaille-fortschritt={`${m.wert}/${m.ziel}`}>
                {m.wert} / {m.ziel} bis {stufenName(m.stufe + 1)}
              </Text>
            </>
          ) : (
            <Text size="xs" fw={700} c="grape">
              Meister – ganz oben angekommen
            </Text>
          )}
        </Stack>
      </Group>
      <Text size="xs" c="dimmed" mt={6}>
        {m.text}
      </Text>
    </Card>
  )
}

function TitelLeiter({ s, form }: { s: SprachSicht; form: TitelForm | undefined }): React.JSX.Element {
  const t = s.titel
  const naechste = t.leiter[t.stufe]
  return (
    <Card withBorder radius="md" padding="sm" data-titel-leiter={s.sprache} data-titel-stufe={t.stufe}>
      <Group justify="space-between" mb={6}>
        <Text fw={800}>Titel in {s.name}</Text>
        <Text size="xs" c="dimmed">
          {s.punkte} Medaillenpunkte
        </Text>
      </Group>
      {naechste && t.naechsteAb !== null && (
        <Stack gap={2} mb="xs">
          <Progress value={(s.punkte / t.naechsteAb) * 100} size="sm" radius="xl" aria-label={`${s.punkte} von ${t.naechsteAb} Punkten bis zum nächsten Titel`} />
          <Text size="xs" c="dimmed">
            Noch {t.naechsteAb - s.punkte} {t.naechsteAb - s.punkte === 1 ? 'Punkt' : 'Punkte'} bis „{form === 'm' ? naechste.m : form === 'w' ? naechste.w : naechste.n}" – jede neue Medaillenstufe zählt einen Punkt.
          </Text>
        </Stack>
      )}
      <Stack gap={4} component="ol" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {t.leiter.map((x) => {
          const erreicht = x.stufe <= t.stufe
          const aktuell = x.stufe === t.stufe
          const text = form === 'm' ? x.m : form === 'w' ? x.w : x.n
          return (
            <Group
              key={x.stufe}
              component="li"
              gap="sm"
              wrap="nowrap"
              aria-current={aktuell ? 'step' : undefined}
              data-titel={x.stufe}
              data-erreicht={erreicht}
              style={{
                padding: '4px 8px',
                borderRadius: 8,
                background: aktuell ? 'var(--mantine-primary-color-light)' : undefined,
                opacity: erreicht ? 1 : 0.6
              }}
            >
              <AuszBild id={`t-${leiterVon(s.sprache)}-${x.stufe}`} gesperrt={!erreicht} groesse={28} />
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={aktuell ? 800 : 600}>
                  {text}
                  {aktuell && (
                    <Badge size="xs" ml={6} tt="none">
                      dein Titel
                    </Badge>
                  )}
                </Text>
                <Text size="xs" c="dimmed">
                  ab {x.ab} {x.ab === 1 ? 'Punkt' : 'Punkten'} · {x.de}
                </Text>
              </Stack>
            </Group>
          )
        })}
      </Stack>
    </Card>
  )
}

function Sammlung({ s }: { s: SprachSicht }): React.JSX.Element {
  const [avatar, setAvatar] = useAvatar()
  const [wahl, setWahl] = useState<SprachSicht['sammlung'][number] | null>(null)
  const frei = s.sammlung.filter((b) => b.frei).length
  return (
    <Stack gap="xs" data-sammlung={s.sprache} data-sammlung-zahl={`${frei}/${s.sammlung.length}`}>
      <Group justify="space-between">
        <Text fw={800}>Sammlung</Text>
        <Text size="sm" c="dimmed">
          {frei} von {s.sammlung.length} freigeschaltet
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 4, xs: 6, sm: 8 }} spacing={6}>
        {s.sammlung.map((b) => (
          <Tooltip key={b.id} label={b.frei ? b.name : `Noch nicht freigeschaltet – ${b.wie}`} multiline w={220} events={{ hover: true, focus: true, touch: true }}>
            <UnstyledButton
              onClick={() => setWahl(b)}
              aria-label={b.frei ? b.name : `${b.name}: noch nicht freigeschaltet`}
              data-sammlung-bild={b.id}
              data-frei={b.frei}
              style={{ borderRadius: 8, padding: 2, outline: avatar === b.id ? '2px solid var(--mantine-primary-color-filled)' : undefined, textAlign: 'center' }}
            >
              <AuszBild id={b.id} gesperrt={!b.frei} groesse={44} />
            </UnstyledButton>
          </Tooltip>
        ))}
      </SimpleGrid>
      <Modal opened={Boolean(wahl)} onClose={() => setWahl(null)} title={wahl?.name ?? ''} zIndex={450} centered>
        {wahl && (
          <Stack align="center" gap="sm">
            <AuszBild id={wahl.id} gesperrt={!wahl.frei} groesse={120} alt={wahl.name} />
            {wahl.frei ? (
              <Group>
                <Button onClick={() => (setAvatar(wahl.id), setWahl(null))} disabled={avatar === wahl.id} data-avatar-setzen={wahl.id}>
                  {avatar === wahl.id ? 'Ist dein Profilbild' : 'Als Profilbild nehmen'}
                </Button>
                {avatar === wahl.id && (
                  <Button variant="default" onClick={() => (setAvatar(''), setWahl(null))}>
                    Kein Profilbild
                  </Button>
                )}
              </Group>
            ) : (
              <Group gap={6} wrap="nowrap">
                <IconLock size={16} />
                <Text size="sm">Noch nicht freigeschaltet – {wahl.wie}</Text>
              </Group>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

/** Inhalt des Reiters „Medaillen & Titel" */
export function MedaillenTitelInhalt(): React.JSX.Element {
  const [d, setD] = useState<Antwort | null | 'fehler'>(null)
  const [dialog, setDialog] = useState(false)
  const laden = useCallback(() => {
    void holen<Antwort>('/s/api/auszeichnungen').then(
      // In der Musterschüler-Vorschau nicht fragen (die Wahl würde nicht gespeichert)
      (r) => (setD(r), r.formOffen && !window.__schulappsServer?.vorschau && setDialog(true)),
      () => setD('fehler')
    )
  }, [])
  useEffect(laden, [laden])
  if (d === null) return <Loader size="sm" />
  if (d === 'fehler')
    return (
      <Text size="sm" c="dimmed">
        Die Medaillen lassen sich gerade nicht laden – bitte gleich noch einmal öffnen.
      </Text>
    )
  if (!d.sprachen.length)
    return (
      <Text size="sm" c="dimmed" data-medaillen-leer>
        Sobald du in einem Sprachkurs übst, sammelst du hier Medaillen und Titel – für jede Sprache eigene.
      </Text>
    )
  const geaendert = (k: TitelKurz): void => setD((alt) => (alt && alt !== 'fehler' ? { ...alt, ...k } : alt))
  return (
    <Stack gap="md" data-medaillen-titel>
      <TitelFormDialog offen={dialog} beispiel={d.beispiel ?? null} fertig={(k) => (setDialog(false), k && geaendert(k))} />
      {d.anzeige && (
        <Text size="sm" data-angezeigter-titel={d.anzeige.text}>
          Neben deinem Namen steht: <b>{d.anzeige.text}</b>
        </Text>
      )}
      <Tabs defaultValue={d.sprachen[0].sprache} keepMounted={false}>
        <Tabs.List mb="sm">
          {d.sprachen.map((s) => (
            <Tabs.Tab key={s.sprache} value={s.sprache} data-ausz-sprache={s.sprache}>
              {s.name}
              {s.titel.text ? ` · ${s.titel.text}` : ''}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {d.sprachen.map((s) => (
          <Tabs.Panel key={s.sprache} value={s.sprache}>
            <Stack gap="md" data-ausz-reihe={s.sprache}>
              <Text size="xs" c="dimmed">
                Wortschatz und Grammatik richten sich nach deiner Klassenstufe ({s.band}); alles andere zählt für alle gleich. Medaillen und Titel bleiben dir für immer.
              </Text>
              <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
                {s.medaillen.map((m) => (
                  <MedailleKarte key={m.kategorie} m={m} />
                ))}
              </SimpleGrid>
              <TitelLeiter s={s} form={d.wahl.form} />
              <Sammlung s={s} />
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs>
      <Card withBorder radius="md" padding="sm">
        <TitelWahlFelder d={d} geaendert={geaendert} />
      </Card>
    </Stack>
  )
}

/** Für die Einstellungen: nur Form, Anzeige und Profilbild-Hinweis */
export function TitelEinstellungen(): React.JSX.Element {
  const [d, setD] = useState<Antwort | null>(null)
  useEffect(() => {
    void holen<Antwort>('/s/api/auszeichnungen').then(setD, () => undefined)
  }, [])
  if (!d) return <Loader size="sm" />
  return (
    <Stack gap="sm" data-titel-einstellungen>
      <TitelWahlFelder d={d} geaendert={(k) => setD({ ...d, ...k })} />
      <Text size="xs" c="dimmed">
        Ein Profilbild wählst du in deiner Sammlung unter „Achievements" – dort siehst du auch, wie du weitere freischaltest.
      </Text>
    </Stack>
  )
}
