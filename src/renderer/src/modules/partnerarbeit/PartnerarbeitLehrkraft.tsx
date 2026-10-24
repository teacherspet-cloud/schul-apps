/**
 * Partnerarbeit Sprechen – Lehrkraft (24.10.2026, abgestimmt): oben im Reiter „Sprechen" in „Meine Klassen" und auf der
 * Kursseite. Vorbereiten (Teile, Karten bis Lehrwerk-Stand, Gruppengröße 2/3, Zuteilung per Code oder Zufall, Uhr,
 * Ende; „Jetzt aktivieren" oder „Planen …"), Warteraum mit Anwesenheit und Zuteilungsvorschlag (tauschen, neu mischen,
 * Start), Live-Ansicht der Gruppen (Symbole + Namen, Teil, Runde; Nachzügler, auflösen, zusammenlegen, beenden),
 * Zuteilungsregeln (Einstufung mit Vorschlag aus dem Lernstand, „nicht mit") – nur hier sichtbar, nie für Lernende.
 * Vorschau A|B(|C): so sehen es die Lernenden (PartnerVorschau).
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Modal,
  MultiSelect,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowsShuffle,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconPlayerPlay,
  IconPlayerStop,
  IconSparkles,
  IconUserPlus,
  IconUsers,
  IconX
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { useLiveSicht } from '../../shared/liveSicht'
import { useAuffrischen } from '../../shared/auffrischen'
import FreigabePlanen, { GeplantMarke, planGeaendert, planKoerper, planMeldung, planStart, type PlanWahl } from '../../shared/components/FreigabePlanen'
import { openDocument } from '../../shared/navigation'
import { standText, type SprechKarte, type SprechStand } from '@shared/sprechen/karten'
import { zielNiveau, type SprechSprache } from '@shared/sprechen/niveaus'
import {
  EINSTUFUNGEN,
  PA_TEIL_NAME,
  PA_TEILE,
  STRATEGIE_NAME,
  type Einstufung,
  type PaLehrkraftSicht,
  type PaRegeln,
  type PaTeil,
  type Partnerarbeit,
  type Strategie
} from '@shared/partnerarbeit/typen'
import type { Warnung } from '@shared/partnerarbeit/zuteilung'
import { nachStand } from '../sprechpruefungen/stand'
import { sprechZiel } from '../sprechpruefungen/SprechpruefungenModule'
import { SymbolBild } from './SymbolBild'
import { PartnerVorschau } from './PartnerVorschau'

interface KarteKurz {
  id: string
  art: PaTeil
  titel: string
  stand?: SprechStand
}
interface Daten {
  sprache: string
  jahrgang: number | null
  lernende: { id: string; name: string; benutzer: string; online: boolean }[]
  namen: Record<string, string>
  aktuelle: Partnerarbeit | null
  geplant: boolean
  fruehere: Partnerarbeit[]
  regeln: PaRegeln
  vorschlag: Record<string, string>
  abdeckung: Record<string, { gesamt: number; fehlt: number; ohneDritte: number; ohneBild: number }>
  karten: KarteKurz[]
}

const uhrzeit = (ms: number): string => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
const zeitFeld = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const SPRACHEN = ['en', 'fr', 'es']

/** Volle Karten des Pools für Vorschau (Lehrkraft) */
function usePoolKarten(sprache: string, jahrgang: number | null, an: boolean): SprechKarte[] {
  const [karten, setKarten] = useState<SprechKarte[]>([])
  useEffect(() => {
    if (!an || !SPRACHEN.includes(sprache)) return
    void holen<{ karten: { id: string; jahrgang: number; karte: SprechKarte }[] }>(`/server/sprech-bank?sprache=${sprache}`).then(
      (r) => setKarten(r.karten.filter((k) => !jahrgang || k.jahrgang === jahrgang).map((k) => k.karte)),
      () => setKarten([])
    )
  }, [sprache, jahrgang, an])
  return karten
}

// ---------------------------------------------------------------- Vorbereiten

function Abdeckung({ d, vokId }: { d: Daten; vokId: string }): React.JSX.Element | null {
  void vokId
  const a = d.abdeckung
  const gesamt = Object.values(a).reduce((n, x) => n + x.gesamt, 0)
  if (!gesamt)
    return (
      <Alert color="orange" p="xs" data-pa-abdeckung="leer">
        Für Jahrgang {d.jahrgang ?? '?'} gibt es noch keine Karten. In der App „Sprechprüfungen“ erstellen.{' '}
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => void openDocument('sprechpruefungen', sprechZiel({ sprache: d.sprache, jahrgang: d.jahrgang ?? 5 }))}
          data-pa-zur-app
        >
          Öffnen
        </Button>
      </Alert>
    )
  const fehlt = Object.values(a).reduce((n, x) => n + x.fehlt, 0)
  const ohneDritte = a.dialog?.ohneDritte ?? 0
  const ohneBild = a.monolog?.ohneBild ?? 0
  const teile = PA_TEILE.map((t) => `${PA_TEIL_NAME[t]} ${a[t]?.gesamt ?? 0}`).join(' · ')
  return (
    <Text size="xs" c="dimmed" data-pa-abdeckung={fehlt || ohneDritte ? 'luecken' : 'voll'}>
      Pool Jahrgang {d.jahrgang ?? '?'}: {teile}.{' '}
      {fehlt || ohneDritte || ohneBild ? (
        <>
          {fehlt ? `${gesamt - fehlt} von ${gesamt} Karten haben Hilfen` : 'Alle Karten haben Hilfen'}
          {ohneDritte ? `, ${ohneDritte} Dialogkarten ohne dritte Rolle` : ''}
          {ohneBild ? `, ${ohneBild} Bildkarten ohne Bild` : ''} –{' '}
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconSparkles size={12} />}
            onClick={() => void openDocument('sprechpruefungen', sprechZiel({ sprache: d.sprache, jahrgang: d.jahrgang ?? 5 }))}
            data-pa-zur-app
          >
            jetzt ergänzen
          </Button>
        </>
      ) : (
        'Alle Karten vollständig.'
      )}
    </Text>
  )
}

function Vorbereiten({ d, vokId, fertig }: { d: Daten; vokId: string; fertig: () => void }): React.JSX.Element {
  const [teile, setTeile] = useState<PaTeil[]>([...PA_TEILE])
  const [groesse, setGroesse] = useState<'2' | '3'>('2')
  const [modus, setModus] = useState<'zufall' | 'code'>('zufall')
  const [uhr, setUhr] = useState(false)
  const [ende, setEnde] = useState(() => zeitFeld(Date.now() + 45 * 60_000))
  const [karten, setKarten] = useState<string[]>([])
  const [bisStand, setBisStand] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanWahl>(planStart)
  const [vorschau, setVorschau] = useState(false)
  const [baende, setBaende] = useState<TextbookMeta[]>([])
  useEffect(() => {
    try {
      void window.api?.textbooks?.list().then(setBaende, () => setBaende([]))
    } catch {
      setBaende([])
    }
  }, [])
  // Stände im Pool (Band › Unit › Abschnitt), nach Buchfolge
  const staende = useMemo(() => {
    const m = new Map<string, SprechStand>()
    for (const k of d.karten) if (k.stand) m.set(standText(k.stand), k.stand)
    return [...m.values()].sort((a, b) => nachStand(a, b, baende))
  }, [d.karten, baende])
  const ziel = bisStand ? staende.find((s) => standText(s) === bisStand) : undefined
  const imStand = (k: KarteKurz): boolean => !ziel || !k.stand || nachStand(k.stand, ziel, baende) <= 0
  const erlaubte = d.karten.filter(imStand)
  const gewaehlt = karten.length ? karten.filter((id) => erlaubte.some((k) => k.id === id)) : erlaubte.map((k) => k.id)
  const endeMs = (): number => {
    const [h, m] = ende.split(':').map(Number)
    const t = new Date()
    t.setHours(h || 0, m || 0, 0, 0)
    // Vor jetzt → morgen (bzw. am geplanten Tag)
    if (plan.modus === 'planen' && plan.datum) {
      const p = new Date(`${plan.datum}T${ende || '13:00'}:00`)
      return p.getTime()
    }
    if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1)
    return t.getTime()
  }
  const poolKarten = usePoolKarten(d.sprache, d.jahrgang, vorschau)
  const anlegen = async (): Promise<void> => {
    try {
      const r = await senden<{ id: string; geplant: boolean }>('/server/partnerarbeit/anlegen', {
        kurs: vokId,
        teile,
        karten: karten.length || ziel ? gewaehlt : [],
        bisStand: ziel,
        gruppengroesse: Number(groesse),
        modus,
        uhr,
        ende: endeMs(),
        ...planKoerper(plan)
      })
      notifySuccess(
        r.geplant
          ? planMeldung(plan, 'Partnerarbeit')
          : modus === 'code'
          ? 'Die Partnerarbeit läuft – die Lernenden bilden jetzt ihre Gruppen.'
          : 'Die Partnerarbeit ist aktiv – gleich Anwesende abhaken und zuteilen.'
      )
      if (r.geplant) planGeaendert()
      fertig()
    } catch (e) {
      notifyError(e)
    }
  }
  const kartenDaten = PA_TEILE.flatMap((t) =>
    erlaubte
      .filter((k) => k.art === t)
      .map((k) => ({ value: k.id, label: `${PA_TEIL_NAME[t]}: ${k.titel}${k.stand ? ` (${standText(k.stand).replace(/^bis /, '')})` : ''}` }))
  )
  return (
    <Card withBorder radius="md" padding="md" data-pa-vorbereiten>
      <Group gap="xs" mb="xs">
        <IconUsers size={18} />
        <Text fw={700}>Partnerarbeit im Unterricht</Text>
      </Group>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Zu zweit oder zu dritt mit den Karten des Pools üben – ohne KI. Lernende sehen die Partnerarbeit nur, solange sie läuft.
        </Text>
        <Group gap="md" wrap="wrap">
          {PA_TEILE.map((t) => (
            <Checkbox
              key={t}
              label={PA_TEIL_NAME[t]}
              checked={teile.includes(t)}
              onChange={(e) => setTeile(e.currentTarget.checked ? PA_TEILE.filter((x) => x === t || teile.includes(x)) : teile.filter((x) => x !== t))}
              data-pa-teil={t}
            />
          ))}
        </Group>
        <Abdeckung d={d} vokId={vokId} />
        <Group gap="md" align="flex-end" wrap="wrap">
          {staende.length > 0 && (
            <Select
              label="Bis Lehrwerk-Stand"
              data={staende.map((s) => standText(s))}
              value={bisStand}
              onChange={setBisStand}
              clearable
              placeholder="alle Karten"
              w={260}
              data-pa-bis-stand
            />
          )}
          <MultiSelect
            label="Karten vorgeben (leer = alle passenden)"
            data={kartenDaten}
            value={karten}
            onChange={setKarten}
            searchable
            clearable
            w={360}
            data-pa-karten
          />
        </Group>
        <Group gap="lg" align="flex-end" wrap="wrap">
          <div>
            <Text size="sm" fw={500} mb={4}>
              Gruppengröße
            </Text>
            <SegmentedControl
              value={groesse}
              onChange={(v) => setGroesse(v as '2' | '3')}
              data={[
                { value: '2', label: 'Zu zweit' },
                { value: '3', label: 'Zu dritt' }
              ]}
              data-pa-groesse
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Zuteilung
            </Text>
            <SegmentedControl
              value={modus}
              onChange={(v) => setModus(v as 'zufall' | 'code')}
              data={[
                { value: 'zufall', label: 'Zufall (Symbole)' },
                { value: 'code', label: 'Lernende wählen (Code)' }
              ]}
              data-pa-modus
            />
          </div>
          <TextInput type="time" label="Ende" value={ende} onChange={(e) => setEnde(e.currentTarget.value)} w={120} data-pa-ende />
          <Switch label="Prüfungszeiten anzeigen (Uhr beim Fragenden)" checked={uhr} onChange={(e) => setUhr(e.currentTarget.checked)} data-pa-uhr-schalter />
        </Group>
        <Text size="xs" c="dimmed">
          {modus === 'zufall'
            ? 'Zufall: Nach dem Aktivieren hakst du die Anwesenden ab, siehst den Vorschlag und startest. Lernende sehen nur Bildsymbole.'
            : 'Code: Jede Person bekommt einen Code und gibt den Code des Partners ein. Wer übrig bleibt, siehst du hier und ordnest ihn zu.'}
        </Text>
        <FreigabePlanen wert={plan} aendern={setPlan} />
        <Group gap="sm">
          <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => void anlegen()} disabled={!teile.length || !gewaehlt.length} data-pa-aktivieren>
            {plan.modus === 'planen' ? 'Planen' : 'Jetzt aktivieren'}
          </Button>
          <Button variant="light" leftSection={<IconEye size={16} />} onClick={() => setVorschau(true)} disabled={!gewaehlt.length} data-pa-vorschau-knopf>
            So sehen es die Lernenden
          </Button>
        </Group>
      </Stack>
      {vorschau && (
        <Modal opened onClose={() => setVorschau(false)} title="Vorschau: Partner A | Partner B" size="100%" data-pa-vorschau-fenster>
          {!poolKarten.length ? (
            <Loader size="sm" />
          ) : (
            <PartnerVorschau
              karten={poolKarten.filter((k) => gewaehlt.includes(k.id))}
              sprache={(SPRACHEN.includes(d.sprache) ? d.sprache : 'en') as SprechSprache}
              jahrgang={d.jahrgang}
              teile={teile}
              groesse={groesse === '3' ? 3 : 2}
              uhr={uhr}
              niveau={zielNiveau((SPRACHEN.includes(d.sprache) ? d.sprache : 'en') as SprechSprache, d.jahrgang)}
            />
          )}
        </Modal>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Laufende Partnerarbeit

function Anwesenheit({ d, pa, neuLaden }: { d: Daten; pa: Partnerarbeit; neuLaden: () => void }): React.JSX.Element {
  const [anwesend, setAnwesend] = useState<string[]>(() => (pa.anwesend.length ? pa.anwesend : d.lernende.map((l) => l.id)))
  const [strategie, setStrategie] = useState<Strategie>('zufall')
  const [nichtWieZuletzt, setNichtWieZuletzt] = useState(true)
  const [vorschlag, setVorschlag] = useState<{ gruppen: string[][]; warnungen: Warnung[]; saat: number } | null>(null)
  const [markiert, setMarkiert] = useState<string | null>(null)
  const online = new Set(d.lernende.filter((l) => l.online).map((l) => l.id))
  const name = (id: string): string => d.namen[id] ?? d.lernende.find((l) => l.id === id)?.name ?? '?'
  const holeVorschlag = async (saat?: number): Promise<void> => {
    try {
      await senden(`/server/partnerarbeit/${pa.id}/anwesend`, { ids: anwesend })
      const r = await senden<{ gruppen: string[][]; warnungen: Warnung[]; saat: number }>(`/server/partnerarbeit/${pa.id}/vorschlag`, {
        anwesend,
        strategie,
        nichtWieZuletzt,
        ...(saat ? { saat } : {})
      })
      setVorschlag(r)
      setMarkiert(null)
    } catch (e) {
      notifyError(e)
    }
  }
  const tausch = (id: string): void => {
    if (!vorschlag) return
    if (!markiert) return setMarkiert(id)
    if (markiert === id) return setMarkiert(null)
    const gruppen = vorschlag.gruppen.map((g) => g.map((x) => (x === id ? markiert : x === markiert ? id : x)))
    setVorschlag({ ...vorschlag, gruppen, warnungen: [] })
    setMarkiert(null)
  }
  const starten = (): void => {
    if (!vorschlag) return
    void senden(`/server/partnerarbeit/${pa.id}/zuteilen`, { gruppen: vorschlag.gruppen }).then(
      () => (notifySuccess('Gruppen stehen – die Lernenden sehen jetzt ihre Symbole.'), neuLaden()),
      (e: unknown) => notifyError(e)
    )
  }
  const WARNUNG: Record<Warnung['art'], string> = {
    nichtMit: 'sollen nicht zusammen',
    zuletzt: 'waren zuletzt zusammen',
    allein: 'ist allein – Nachzügler zuordnen'
  }
  return (
    <Stack gap="sm" data-pa-anwesenheit>
      <Text fw={700}>Wer ist da?</Text>
      <Text size="xs" c="dimmed">
        Grüner Punkt: hat die Partnerarbeit auf dem Gerät geöffnet. Fehlende abwählen, dann „Zuteilen“.
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing={6}>
        {d.lernende.map((l) => (
          <Checkbox
            key={l.id}
            checked={anwesend.includes(l.id)}
            onChange={(e) => setAnwesend(e.currentTarget.checked ? [...anwesend, l.id] : anwesend.filter((x) => x !== l.id))}
            label={
              <Group gap={6} wrap="nowrap">
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: online.has(l.id) ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-4)',
                    display: 'inline-block'
                  }}
                />
                <span>{l.name}</span>
              </Group>
            }
            data-pa-anwesend={l.benutzer}
            data-pa-online={online.has(l.id) ? '1' : '0'}
          />
        ))}
      </SimpleGrid>
      <Group gap="md" align="flex-end" wrap="wrap">
        <Select
          label="Zuteilung"
          data={(Object.keys(STRATEGIE_NAME) as Strategie[]).map((s) => ({ value: s, label: STRATEGIE_NAME[s] }))}
          value={strategie}
          onChange={(v) => v && setStrategie(v as Strategie)}
          w={240}
          data-pa-strategie
        />
        <Switch label="Nicht wie zuletzt" checked={nichtWieZuletzt} onChange={(e) => setNichtWieZuletzt(e.currentTarget.checked)} />
        <Button leftSection={<IconArrowsShuffle size={16} />} onClick={() => void holeVorschlag()} disabled={anwesend.length < 2} data-pa-zuteilen>
          Zuteilen
        </Button>
      </Group>
      {vorschlag && (
        <Card withBorder radius="md" padding="sm" data-pa-vorschlag>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Vorschlag – zum Tauschen zwei Namen antippen</Text>
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<IconArrowsShuffle size={14} />}
              onClick={() => void holeVorschlag(vorschlag.saat + 1)}
              data-pa-neu-mischen
            >
              Neu mischen
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="xs">
            {vorschlag.gruppen.map((g, i) => (
              <Card key={i} withBorder radius="sm" padding="xs" data-pa-vorschlag-gruppe={i + 1}>
                <Text size="xs" c="dimmed">
                  Gruppe {i + 1}
                </Text>
                {g.map((id) => (
                  <UnstyledButton
                    key={id}
                    onClick={() => tausch(id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: markiert === id ? 'var(--mantine-color-violet-1)' : undefined
                    }}
                    data-pa-mitglied={name(id)}
                  >
                    <Text size="sm">{name(id)}</Text>
                  </UnstyledButton>
                ))}
              </Card>
            ))}
          </SimpleGrid>
          {vorschlag.warnungen.length > 0 && (
            <Stack gap={2} mt="xs">
              {vorschlag.warnungen.map((w, i) => (
                <Text key={i} size="xs" c="orange" data-pa-warnung={w.art}>
                  Gruppe {w.gruppe + 1}: {w.ids.map(name).join(' und ')} {WARNUNG[w.art]}
                </Text>
              ))}
            </Stack>
          )}
          <Button mt="sm" leftSection={<IconPlayerPlay size={16} />} onClick={starten} data-pa-start>
            Start – Symbole zeigen
          </Button>
        </Card>
      )}
    </Stack>
  )
}

function LiveGruppen({ d, sicht, pa }: { d: Daten; sicht: PaLehrkraftSicht; pa: Partnerarbeit }): React.JSX.Element {
  const name = (id: string): string => sicht.namen[id] ?? d.namen[id] ?? '?'
  const online = new Set(sicht.online)
  const gruppe = (aktion: string, k: Record<string, unknown>): void =>
    void senden(`/server/partnerarbeit/${pa.id}/gruppe`, { aktion, ...k }).catch((e: unknown) => notifyError(e))
  const [zusammen, setZusammen] = useState<string | null>(null)
  const seit = (ms: number): string => {
    const min = Math.max(0, Math.round((sicht.jetzt - ms) / 60_000))
    return min < 1 ? 'gerade' : `seit ${min} Min.`
  }
  return (
    <Stack gap="sm" data-pa-live>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        {pa.gruppen.map((g, i) => (
          <Card key={g.id} withBorder radius="md" padding="sm" data-pa-gruppe-karte={i + 1}>
            <Group justify="space-between" wrap="nowrap" mb={4}>
              <Text size="xs" c="dimmed">
                Gruppe {i + 1} · {g.schritt ? `${PA_TEIL_NAME[g.schritt.teil]} · Runde ${g.runde}` : 'keine Karten'} · {seit(g.schritt?.seit ?? g.seit)}
              </Text>
              <Group gap={2}>
                <Tooltip label="Zusammenlegen mit …">
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setZusammen(zusammen === g.id ? null : g.id)}
                    disabled={g.mitglieder.length >= 3}
                    data-pa-zusammen={i + 1}
                  >
                    +
                  </Button>
                </Tooltip>
                <Tooltip label="Gruppe auflösen (Mitglieder werden Nachzügler)">
                  <Button size="compact-xs" variant="subtle" color="red" onClick={() => gruppe('aufloesen', { gruppe: g.id })} data-pa-aufloesen={i + 1}>
                    <IconX size={12} />
                  </Button>
                </Tooltip>
              </Group>
            </Group>
            <Stack gap={4}>
              {g.mitglieder.map((id) => (
                <Group key={id} gap={6} wrap="nowrap" style={{ opacity: online.has(id) ? 1 : 0.5 }} data-pa-live-mitglied={name(id)}>
                  <SymbolBild symbol={pa.symbole[id] ?? ''} groesse={24} lehrkraft />
                  <Text size="sm">{name(id)}</Text>
                  {g.schritt?.rollen[id] && (
                    <Badge size="xs" variant="light" tt="none">
                      {g.schritt.rollen[id] === 'helfer' ? 'Helfer' : g.schritt.rollen[id]}
                    </Badge>
                  )}
                  {!online.has(id) && (
                    <Text size="xs" c="dimmed">
                      offline
                    </Text>
                  )}
                </Group>
              ))}
            </Stack>
            {zusammen === g.id && (
              <Select
                mt="xs"
                size="xs"
                placeholder="mit Gruppe …"
                data={pa.gruppen
                  .filter((x) => x.id !== g.id && x.mitglieder.length + g.mitglieder.length <= 3)
                  .map((x, j) => ({ value: x.id, label: `Gruppe ${pa.gruppen.indexOf(x) + 1} (${x.mitglieder.map(name).join(', ')})` + (j < 0 ? '' : '') }))}
                onChange={(v) => v && (gruppe('zusammenlegen', { gruppe: g.id, gruppe2: v }), setZusammen(null))}
              />
            )}
          </Card>
        ))}
      </SimpleGrid>
      {sicht.unzugeteilt.length > 0 && (
        <Card withBorder radius="md" padding="sm" data-pa-unzugeteilt>
          <Text size="sm" fw={700} mb={4}>
            Ohne Gruppe (online)
          </Text>
          <Group gap="xs">
            {sicht.unzugeteilt.map((id) => (
              <Button
                key={id}
                size="compact-sm"
                variant="light"
                leftSection={<IconUserPlus size={14} />}
                onClick={() => gruppe('hinzufuegen', { schueler: id })}
                data-pa-hinzufuegen={name(id)}
              >
                {name(id)} zuordnen
              </Button>
            ))}
          </Group>
        </Card>
      )}
    </Stack>
  )
}

function Laufend({ d, pa, neuLaden }: { d: Daten; pa: Partnerarbeit; neuLaden: () => void }): React.JSX.Element {
  const { sicht } = useLiveSicht<PaLehrkraftSicht>({
    strom: `/server/partnerarbeit/${pa.id}/strom`,
    zustand: `/server/partnerarbeit/${pa.id}/zustand`,
    kanal: 'partner:lehrkraft'
  })
  const live = sicht?.pa ?? pa
  const dLive: Daten = sicht ? { ...d, lernende: d.lernende.map((l) => ({ ...l, online: sicht.online.includes(l.id) })) } : d
  const aktion = (pfad: string, k: Record<string, unknown> = {}): void =>
    void senden(`/server/partnerarbeit/${pa.id}/${pfad}`, k).then(neuLaden, (e: unknown) => notifyError(e))
  const geplantAb = d.geplant ? Number((pa as unknown as { geplantAb?: number }).geplantAb ?? 0) : 0
  const e = live.einstellungen
  const status = live.status
  return (
    <Card withBorder radius="md" padding="md" data-pa-laufend data-pa-status={status}>
      <Group justify="space-between" wrap="wrap" gap="xs" mb="xs">
        <Group gap="xs">
          <IconUsers size={18} />
          <Text fw={700}>Partnerarbeit</Text>
          <Badge variant="light" color={status === 'laeuft' ? 'green' : status === 'aktiv' ? 'blue' : 'gray'} tt="none" data-pa-status-marke>
            {status === 'vorbereitet' ? 'geplant' : status === 'aktiv' ? 'Warteraum' : status === 'laeuft' ? 'läuft' : 'beendet'}
          </Badge>
          {d.geplant && <GeplantMarke ab={geplantAb || null} />}
          <Text size="xs" c="dimmed">
            {e.teile.map((t) => PA_TEIL_NAME[t]).join(' → ')} · zu {e.gruppengroesse} · {e.modus === 'code' ? 'per Code' : 'Zufall'} · bis {uhrzeit(e.ende)} Uhr
          </Text>
        </Group>
        <Group gap="xs">
          {status === 'vorbereitet' && (
            <Button size="compact-sm" leftSection={<IconPlayerPlay size={14} />} onClick={() => aktion('aktivieren')} data-pa-jetzt-aktivieren>
              Jetzt aktivieren
            </Button>
          )}
          {status === 'vorbereitet' ? (
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              onClick={() =>
                void senden('/server/planen/absagen', { typ: 'partner', id: pa.id }).then(
                  () => (planGeaendert(), neuLaden()),
                  (e2: unknown) => notifyError(e2)
                )
              }
              data-pa-absagen
            >
              Absagen
            </Button>
          ) : (
            <Button size="compact-sm" variant="light" color="red" leftSection={<IconPlayerStop size={14} />} onClick={() => aktion('beenden')} data-pa-beenden>
              Beenden
            </Button>
          )}
        </Group>
      </Group>
      {status === 'vorbereitet' && (
        <Text size="sm" c="dimmed">
          Die Lernenden sehen bis zum geplanten Beginn nur „Demnächst“ im Fachordner.
        </Text>
      )}
      {status === 'aktiv' && <Anwesenheit d={dLive} pa={live} neuLaden={neuLaden} />}
      {status === 'laeuft' && sicht && <LiveGruppen d={dLive} sicht={sicht} pa={live} />}
      {status === 'laeuft' && !sicht && <Loader size="sm" />}
    </Card>
  )
}

// ---------------------------------------------------------------- Regeln

function Regeln({ d, vokId, neuLaden }: { d: Daten; vokId: string; neuLaden: () => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [a, setA] = useState<string | null>(null)
  const [b, setB] = useState<string | null>(null)
  const r = d.regeln
  const name = (id: string): string => d.lernende.find((l) => l.id === id)?.name ?? '?'
  const speichern = (teil: Partial<PaRegeln>): void =>
    void senden('/server/partnerarbeit/regeln', { kurs: vokId, ...teil }).then(neuLaden, (e: unknown) => notifyError(e))
  const stufe = (id: string): Einstufung => r.einstufung[id] ?? (d.vorschlag[id] as Einstufung | undefined) ?? 'mittel'
  return (
    <Card withBorder radius="md" padding="sm" data-pa-regeln>
      <UnstyledButton onClick={() => setOffen(!offen)} style={{ width: '100%' }} data-pa-regeln-auf>
        <Group gap="xs">
          {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <Text fw={700}>Zuteilungsregeln</Text>
          <Text size="xs" c="dimmed">
            nur für dich sichtbar · {Object.keys(r.einstufung).length} eingestuft · {r.nichtMit.length} „nicht mit“
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <Stack gap="sm" mt="sm">
          <Text size="xs" c="dimmed">
            Die Einstufung ist mit dem Lernstand vorbelegt (Vokabeln, Grammatik) – du entscheidest. Lernende sehen davon nichts.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
            {d.lernende.map((l) => (
              <Group key={l.id} justify="space-between" wrap="nowrap" data-pa-einstufung={l.benutzer}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm">{l.name}</Text>
                  {!r.einstufung[l.id] && d.vorschlag[l.id] && (
                    <Badge size="xs" variant="light" color="gray" tt="none">
                      Vorschlag
                    </Badge>
                  )}
                </Group>
                <SegmentedControl
                  size="xs"
                  value={stufe(l.id)}
                  onChange={(v) => speichern({ einstufung: { ...r.einstufung, [l.id]: v as Einstufung } })}
                  data={EINSTUFUNGEN.map((s) => ({ value: s, label: s }))}
                />
              </Group>
            ))}
          </SimpleGrid>
          <Text size="sm" fw={600}>
            Nicht zusammen
          </Text>
          <Group gap="xs" align="flex-end" wrap="wrap">
            <Select
              data={d.lernende.map((l) => ({ value: l.id, label: l.name }))}
              value={a}
              onChange={setA}
              placeholder="Person"
              searchable
              w={200}
              data-pa-nichtmit-a
            />
            <Select
              data={d.lernende.filter((l) => l.id !== a).map((l) => ({ value: l.id, label: l.name }))}
              value={b}
              onChange={setB}
              placeholder="nicht mit"
              searchable
              w={200}
              data-pa-nichtmit-b
            />
            <Button
              size="compact-sm"
              variant="light"
              disabled={!a || !b}
              onClick={() => a && b && (speichern({ nichtMit: [...r.nichtMit, [a, b]] }), setA(null), setB(null))}
              data-pa-nichtmit-hinzu
            >
              Hinzufügen
            </Button>
          </Group>
          <Group gap={6}>
            {r.nichtMit.map(([x, y], i) => (
              <Badge
                key={i}
                variant="light"
                color="orange"
                tt="none"
                rightSection={<IconX size={10} style={{ cursor: 'pointer' }} onClick={() => speichern({ nichtMit: r.nichtMit.filter((_, j) => j !== i) })} />}
                data-pa-nichtmit-paar
              >
                {name(x)} · {name(y)}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Collapse>
    </Card>
  )
}

// ---------------------------------------------------------------- Zusammen

export function PartnerarbeitLehrkraft({ vokId }: { vokId: string }): React.JSX.Element {
  const [d, setD] = useState<Daten | null>(null)
  const [fehler, setFehler] = useState('')
  const laden = useCallback(() => {
    void holen<Daten>(`/server/partnerarbeit?kurs=${encodeURIComponent(vokId)}`).then(setD, (e: unknown) =>
      setFehler(e instanceof Error ? e.message : String(e))
    )
  }, [vokId])
  useEffect(laden, [laden])
  // Neue Partnerarbeit von anderswo (zweites Gerät, geplanter Beginn): beim Zurückkehren und jede Minute frisch
  useAuffrischen(laden)
  if (fehler) return <Text c="dimmed">{fehler}</Text>
  if (!d) return <Loader size="sm" />
  return (
    <Stack gap="md" data-pa-lehrkraft>
      {d.aktuelle ? <Laufend key={d.aktuelle.id} d={d} pa={d.aktuelle} neuLaden={laden} /> : <Vorbereiten d={d} vokId={vokId} fertig={laden} />}
      {d.lernende.length > 0 && <Regeln d={d} vokId={vokId} neuLaden={laden} />}
      {d.fruehere.length > 0 && (
        <Text size="xs" c="dimmed" data-pa-fruehere>
          Frühere Partnerarbeiten: {d.fruehere.length} (zuletzt{' '}
          {new Date(d.fruehere[0].erstellt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}). Sie werden 90 Tage nach dem Ende gelöscht.
        </Text>
      )}
    </Stack>
  )
}
