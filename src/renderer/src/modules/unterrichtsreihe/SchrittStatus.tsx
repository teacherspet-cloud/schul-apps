/**
 * KI-Stand und Materialien an den Schritten einer Reihe (08.10.2026, Plan „Unterrichtsreihe: Übersicht, KI-Status …",
 * Abschnitte A und D). Eigenständige Bausteine – der Editor setzt sie an seine Schrittkarten und in seinen Kopf:
 *
 * - `SchrittKiStatus`: Plakette statt Drehkreis – „Wartet – Platz 2", „Entsteht: … · 1:20 · noch etwa 2 Min.",
 *   „Fertig – ansehen", „Fehler: … · Erneut versuchen", „Abgebrochen" (Befund: „Mit KI erstellen" startete scheinbar
 *   verzögert mit einem rätselhaften Kreisel – meist wartete der Auftrag nur auf einen freien KI-Platz);
 * - `KiEntwurfMarke`: dezente Marke „KI-Entwurf" mit „Geprüft";
 * - `SchrittMaterial`: Vorschaubild, „Öffnen" (Arbeitsblatt-Editor) und „Vorschau" eines verknüpften Arbeitsblatts
 *   (Befund: ein in der Reihe erstelltes Blatt war danach nirgends abrufbar);
 * - `ReiheMaterialien`: Knopf + Fenster „Materialien der Reihe (n)";
 * - `AllePlatzhalterKnopf`: „Alle Platzhalter erstellen (n)" mit Rückfrage, Zahl und geschätzter Dauer; „Alle abbrechen";
 * - `ZuweisenHinweis`: Hinweis im Zuweisen-Fenster, wenn noch KI-Entwürfe ungeprüft sind.
 */
import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Group, Image, Loader, Modal, Paper, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconEye,
  IconFiles,
  IconPlayerStop,
  IconRefresh,
  IconSparkles
} from '@tabler/icons-react'
import { entwuerfeIn, materialienDerReihe, SCHRITT_ARTEN, type Reihe, type ReiheMaterial, type Schritt } from '@shared/reihe'
import { brichAb, dauerLabel, laeuft, useSekundentakt, versucheErneut, type Auftrag } from '../../shared/auftraege'
import { dauerWorte, restAnzeige, schaetzeGesamtdauer } from '../../shared/restzeit'
import { dokumentOeffnenWennBereit, useNavigation } from '../../shared/navigation'
import { notifyError } from '../../shared/util'
import {
  auftragsArtFuer,
  brichPlatzhalterAb,
  erzeugeAllePlatzhalter,
  erzeugtGerade,
  offenePlatzhalter,
  useLaufendePlatzhalter,
  useSchrittAuftrag
} from './platzhalterAuftrag'

/** Ein Dokument aus der Reihe heraus öffnen – der Zurück-Knopf dort führt in die Reihe */
export async function oeffneAusReihe(moduleId: string, docId: string): Promise<void> {
  useNavigation.getState().setRueckweg({ fuer: moduleId, nach: 'unterrichtsreihe', name: 'Zurück zur Reihe' })
  await dokumentOeffnenWennBereit(moduleId, docId)
}

/** Text der Plakette für einen Auftrag (auch für Tests und andere Anzeigen) */
export function statusText(a: Auftrag, jetzt: number): string {
  if (a.status === 'wartend') return a.wartegrund ?? (a.platz ? `Wartet – Platz ${a.platz}` : 'Wartet auf freien Platz')
  if (a.status === 'laufend') {
    const rest = restAnzeige(a, jetzt)
    return [`Entsteht: ${a.meldung.replace(/\s*…$/, '')}`, dauerLabel(jetzt - a.start), rest].filter(Boolean).join(' · ')
  }
  if (a.status === 'fertig') return 'Fertig'
  if (a.status === 'fehler') return `Fehler: ${a.fehler ?? a.meldung}`
  return 'Abgebrochen'
}

/**
 * Plakette mit dem Stand der KI-Erstellung dieses Schritts. Zeigt nichts, solange es für den Schritt keinen Auftrag in
 * der Leiste gibt. `ansehen`: Was „Fertig – ansehen" bei Schritten ohne Arbeitsblatt öffnet (z. B. das Bearbeiten-Fenster).
 */
export function SchrittKiStatus({
  reihe,
  s,
  ansehen,
  setze
}: {
  reihe: Pick<Reihe, 'id'>
  s: Schritt
  ansehen?: (s: Schritt) => void
  /** Zum Löschen der Marke „KI-Entwurf" beim Ansehen */
  setze?: (patch: Partial<Schritt>) => void
}): React.JSX.Element | null {
  const a = useSchrittAuftrag(reihe.id || undefined, s.id)
  const jetzt = useSekundentakt(Boolean(a && laeuft(a)))
  if (!a) return null
  const text = statusText(a, jetzt)
  const stopp = (e: React.MouseEvent): void => e.stopPropagation()
  if (laeuft(a))
    return (
      <Group gap={4} wrap="nowrap" onClick={stopp} data-ki-status={a.status} data-ki-platz={a.platz ?? ''}>
        <Badge
          size="sm"
          variant="light"
          color={a.status === 'wartend' ? 'gray' : 'grape'}
          leftSection={a.status === 'wartend' ? <IconClock size={12} /> : <Loader size={10} color="grape" />}
          style={{ textTransform: 'none', maxWidth: 420 }}
          title={text}
        >
          {text}
        </Badge>
        <Tooltip label="Abbrechen">
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label="KI-Erstellung abbrechen" onClick={() => brichAb(a.id)} data-ki-abbrechen>
            <IconPlayerStop size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>
    )
  if (a.status === 'fertig')
    return (
      <Badge
        size="sm"
        variant="light"
        color="teal"
        component="button"
        leftSection={<IconCheck size={12} />}
        style={{ textTransform: 'none', cursor: 'pointer', border: 0 }}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          setze?.({ kiEntwurf: undefined })
          if (a.ziel) void oeffneAusReihe(a.ziel.moduleId, a.ziel.docId).catch((x) => notifyError(x))
          else ansehen?.(s)
        }}
        data-ki-status="fertig"
      >
        Fertig – ansehen
      </Badge>
    )
  if (a.status === 'fehler')
    return (
      <Group gap={4} wrap="nowrap" onClick={stopp} data-ki-status="fehler">
        <Tooltip label={text} multiline w={320}>
          <Badge size="sm" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />} style={{ textTransform: 'none', maxWidth: 260 }}>
            {text}
          </Badge>
        </Tooltip>
        {a.kannErneut && (
          <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconRefresh size={12} />} onClick={() => versucheErneut(a.id)} data-ki-erneut>
            Erneut versuchen
          </Button>
        )}
      </Group>
    )
  return (
    <Badge size="sm" variant="light" color="gray" style={{ textTransform: 'none' }} data-ki-status="abgebrochen">
      Abgebrochen
    </Badge>
  )
}

/** Dezente Marke „KI-Entwurf" mit „Geprüft" (bis die Lehrkraft den Schritt öffnet oder bestätigt) */
export function KiEntwurfMarke({ s, setze }: { s: Schritt; setze: (patch: Partial<Schritt>) => void }): React.JSX.Element | null {
  if (!s.kiEntwurf || s.platzhalter) return null
  return (
    <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()} data-ki-entwurf>
      <Tooltip label="Von der KI erstellt und noch nicht geprüft – Öffnen oder „Geprüft“ entfernt die Marke" multiline w={260}>
        <Badge size="xs" variant="outline" color="grape" leftSection={<IconSparkles size={10} />} style={{ textTransform: 'none' }}>
          KI-Entwurf
        </Badge>
      </Tooltip>
      <Tooltip label="Als geprüft markieren">
        <ActionIcon size="xs" variant="subtle" color="teal" aria-label="Als geprüft markieren" onClick={() => setze({ kiEntwurf: undefined })} data-ki-geprueft>
          <IconCheck size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

/*
 * Vorschaubilder der Arbeitsblätter: die Liste der Bibliothek einmal holen und kurz merken – nicht je Schrittkarte neu.
 */
let bilderListe: { zeit: number; liste: Promise<Map<string, string | undefined>> } | null = null
function vorschaubilder(): Promise<Map<string, string | undefined>> {
  if (!bilderListe || Date.now() - bilderListe.zeit > 30_000)
    bilderListe = {
      zeit: Date.now(),
      liste: window.api.sheets
        .list()
        .then((l) => new Map(l.map((m) => [m.id, m.thumb])))
        .catch(() => new Map())
    }
  return bilderListe.liste
}

/** Vorschaubild eines Arbeitsblatts der Bibliothek: undefined = lädt, null = nicht (mehr) in der Bibliothek, '' = ohne Bild */
function useVorschaubild(id: string): string | null | undefined {
  const [bild, setBild] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let aktiv = true
    void vorschaubilder().then((m) => {
      if (aktiv) setBild(m.has(id) ? (m.get(id) ?? '') : null)
    })
    return () => {
      aktiv = false
    }
  }, [id])
  return bild
}

/** Vorschau der Schülerfassung, wie sie im Schritt gespeichert ist */
function BlattVorschau({ titel, html, onClose }: { titel: string; html: string; onClose: () => void }): React.JSX.Element {
  return (
    <Modal opened onClose={onClose} title={titel || 'Arbeitsblatt'} size="auto" centered>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(860px, 90vw)' }}>
        <iframe title={titel || 'Arbeitsblatt'} srcDoc={html} sandbox="allow-same-origin" style={{ width: '100%', height: '75vh', border: 0, background: '#fff' }} data-blatt-vorschau />
      </div>
    </Modal>
  )
}

/**
 * Verknüpftes Arbeitsblatt eines Schritts: Vorschaubild, „Öffnen" (Arbeitsblatt-Editor) und „Vorschau" (Schülerfassung).
 * `kompakt`: nur zwei Symbolknöpfe (für die Knopfleiste der Schrittkarte). Öffnen entfernt die Marke „KI-Entwurf".
 */
export function SchrittMaterial({
  s,
  setze,
  kompakt
}: {
  s: Schritt
  setze?: (patch: Partial<Schritt>) => void
  kompakt?: boolean
}): React.JSX.Element | null {
  const [vorschau, setVorschau] = useState(false)
  const quelle = s.inhalt.art === 'arbeitsblatt' ? s.inhalt.quelle : ''
  if (s.inhalt.art !== 'arbeitsblatt' || !quelle) return null
  const inhalt = s.inhalt
  const oeffnen = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (s.kiEntwurf) setze?.({ kiEntwurf: undefined })
    void oeffneAusReihe('arbeitsblatt', quelle).catch((x) => notifyError(x, 'Arbeitsblatt nicht geöffnet'))
  }
  const fenster = vorschau && inhalt.html ? <BlattVorschau titel={inhalt.titel || s.titel} html={inhalt.html} onClose={() => setVorschau(false)} /> : null
  if (kompakt)
    return (
      <>
        <Tooltip label="Arbeitsblatt öffnen (Editor)">
          <ActionIcon variant="subtle" aria-label="Arbeitsblatt öffnen" onClick={oeffnen} data-blatt-oeffnen={quelle}>
            <IconExternalLink size={16} />
          </ActionIcon>
        </Tooltip>
        {inhalt.html && (
          <Tooltip label="Vorschau der Schülerfassung">
            <ActionIcon
              variant="subtle"
              aria-label="Vorschau des Arbeitsblatts"
              onClick={(e) => {
                e.stopPropagation()
                setVorschau(true)
              }}
              data-blatt-vorschau-knopf
            >
              <IconEye size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        {fenster}
      </>
    )
  return <SchrittMaterialKarte s={s} quelle={quelle} oeffnen={oeffnen} vorschau={() => setVorschau(true)} fenster={fenster} />
}

function SchrittMaterialKarte({
  s,
  quelle,
  oeffnen,
  vorschau,
  fenster
}: {
  s: Schritt
  quelle: string
  oeffnen: (e: React.MouseEvent) => void
  vorschau: () => void
  fenster: React.ReactNode
}): React.JSX.Element {
  const bild = useVorschaubild(quelle)
  const inhalt = s.inhalt as Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>
  return (
    <Paper withBorder radius="sm" p={6} onClick={(e) => e.stopPropagation()} data-schritt-material={quelle}>
      <Group gap="sm" wrap="nowrap" align="center">
        <UnstyledButton onClick={oeffnen} aria-label="Arbeitsblatt öffnen" style={{ flexShrink: 0 }}>
          {bild ? (
            <Image src={bild} w={56} h={78} fit="cover" radius="xs" alt="" style={{ border: '1px solid var(--mantine-color-default-border)' }} />
          ) : (
            <Paper w={56} h={78} withBorder radius="xs" style={{ display: 'grid', placeItems: 'center' }}>
              {bild === undefined ? <Loader size="xs" /> : <IconFiles size={20} color="var(--mantine-color-dimmed)" />}
            </Paper>
          )}
        </UnstyledButton>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {inhalt.titel || s.titel || 'Arbeitsblatt'}
          </Text>
          {bild === null && (
            <Text size="xs" c="orange">
              Nicht mehr in „Meine Arbeitsblätter“ – die Fassung im Schritt bleibt nutzbar.
            </Text>
          )}
          <Group gap={6}>
            {bild !== null && (
              <Button size="compact-xs" variant="light" leftSection={<IconExternalLink size={12} />} onClick={oeffnen} data-blatt-oeffnen={quelle}>
                Öffnen
              </Button>
            )}
            {inhalt.html && (
              <Button
                size="compact-xs"
                variant="default"
                leftSection={<IconEye size={12} />}
                onClick={(e) => {
                  e.stopPropagation()
                  vorschau()
                }}
                data-blatt-vorschau-knopf
              >
                Vorschau
              </Button>
            )}
          </Group>
        </Stack>
      </Group>
      {fenster}
    </Paper>
  )
}

const MATERIAL_ART: Record<string, string> = {
  arbeitsblatt: 'Arbeitsblatt',
  klassenarbeit: 'Klassenarbeit',
  lernzielkontrolle: 'Lernzielkontrolle',
  vokabeltest: 'Vokabeltest'
}

/** Knopf „Materialien der Reihe (n)" mit Fenster: alle verknüpften Arbeitsblätter und Tests zum Öffnen */
export function ReiheMaterialien({ reihe }: { reihe: Pick<Reihe, 'schritte'> }): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const liste = materialienDerReihe(reihe)
  if (!liste.length) return null
  const oeffnen = (m: ReiheMaterial): void => {
    setOffen(false)
    void oeffneAusReihe(m.moduleId, m.docId).catch((x) => notifyError(x, 'Nicht geöffnet'))
  }
  return (
    <>
      <Button variant="default" leftSection={<IconFiles size={16} />} onClick={() => setOffen(true)} data-reihe-materialien>
        Materialien der Reihe ({liste.length})
      </Button>
      <Modal opened={offen} onClose={() => setOffen(false)} title={`Materialien der Reihe (${liste.length})`} size="lg">
        <Stack gap="xs" data-reihe-materialien-liste>
          {liste.map((m) => (
            <Paper key={`${m.schrittId}-${m.docId}`} withBorder p="xs" radius="sm">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant="light" color={m.art === 'test' ? 'grape' : 'blue'}>
                      {MATERIAL_ART[m.moduleId] ?? 'Material'}
                    </Badge>
                    <Text size="sm" fw={500} truncate>
                      {m.titel}
                    </Text>
                  </Group>
                  {m.titel !== m.schrittTitel && (
                    <Text size="xs" c="dimmed" truncate>
                      Schritt: {m.schrittTitel}
                    </Text>
                  )}
                </div>
                <Button size="compact-sm" variant="light" leftSection={<IconExternalLink size={14} />} onClick={() => oeffnen(m)} data-material-oeffnen={m.docId}>
                  Öffnen
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Modal>
    </>
  )
}

/**
 * „Alle Platzhalter erstellen (n)": vorher Rückfrage mit Zahl und geschätzter Dauer; alle Aufträge laufen im
 * Hintergrund und teilen sich die KI-Plätze. Solange welche laufen, erscheint „Alle abbrechen".
 */
export function AllePlatzhalterKnopf({
  reihe,
  speichernVorher
}: {
  reihe: Reihe
  /** Die Reihe muss gespeichert sein (Kennung) – liefert den gespeicherten Stand oder null */
  speichernVorher: () => Promise<Reihe | null>
}): React.JSX.Element | null {
  const [frage, setFrage] = useState(false)
  const laufend = useLaufendePlatzhalter(reihe.id || undefined)
  const offen = offenePlatzhalter(reihe, (id) => Boolean(reihe.id) && erzeugtGerade(reihe.id, id))
  if (!offen.length && !laufend) return null
  const arten = offen.map((s) => auftragsArtFuer(s, reihe))
  const { ms, unbekannt } = schaetzeGesamtdauer(arten)
  const zaehlung = Object.entries(
    offen.reduce<Record<string, number>>((acc, s) => {
      const label = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label ?? s.inhalt.art
      acc[label] = (acc[label] ?? 0) + 1
      return acc
    }, {})
  )
    .map(([label, n]) => `${n} × ${label}`)
    .join(', ')
  return (
    <>
      <Group gap={6} wrap="nowrap">
        {offen.length > 0 && (
          <Button variant="light" color="grape" leftSection={<IconSparkles size={16} />} onClick={() => setFrage(true)} data-alle-platzhalter={offen.length}>
            Alle Platzhalter erstellen ({offen.length})
          </Button>
        )}
        {laufend > 0 && (
          <Button variant="subtle" color="gray" leftSection={<IconPlayerStop size={14} />} onClick={() => brichPlatzhalterAb(reihe.id)} data-alle-abbrechen={laufend}>
            Alle abbrechen ({laufend})
          </Button>
        )}
      </Group>
      <Modal opened={frage} onClose={() => setFrage(false)} title="Alle Platzhalter mit KI erstellen" size="md">
        <Stack gap="sm">
          <Text size="sm" data-alle-schaetzung>
            {offen.length === 1 ? '1 Auftrag' : `${offen.length} Aufträge`}
            {ms !== null ? ` · ${dauerWorte(ms)} (geschätzt aus bisherigen Laufzeiten)` : ' · Dauer noch unbekannt (noch keine Laufzeiten gemerkt)'}
            {' · laufen im Hintergrund nacheinander bzw. höchstens drei zugleich'}
          </Text>
          {zaehlung && (
            <Text size="xs" c="dimmed">
              {zaehlung}
              {ms !== null && unbekannt > 0 ? ` – für ${unbekannt} davon gibt es noch keine Erfahrungswerte` : ''}
            </Text>
          )}
          <Alert variant="light" color="gray" p="xs">
            <Text size="xs">
              Jeder Auftrag verbraucht KI-Kontingent. Den Stand zeigt jeder Schritt selbst; abbrechen geht einzeln an der Schrittkarte oder mit „Alle
              abbrechen“. Fertige Inhalte tragen die Marke „KI-Entwurf“, bis sie geprüft sind.
            </Text>
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFrage(false)}>
              Abbrechen
            </Button>
            <Button
              color="grape"
              leftSection={<IconSparkles size={16} />}
              onClick={async () => {
                setFrage(false)
                const r = await speichernVorher()
                if (!r) return
                try {
                  erzeugeAllePlatzhalter(r)
                } catch (x) {
                  notifyError(x)
                }
              }}
              data-alle-starten
            >
              Erstellen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

/** Hinweis im Zuweisen-Fenster: Die Reihe enthält noch ungeprüfte KI-Entwürfe (zuweisen bleibt möglich) */
export function ZuweisenHinweis({ reihe }: { reihe: Pick<Reihe, 'schritte'> }): React.JSX.Element | null {
  const n = entwuerfeIn(reihe)
  if (!n) return null
  return (
    <Alert variant="light" color="grape" icon={<IconSparkles size={16} />} data-zuweisen-entwuerfe={n}>
      {n === 1 ? 'Ein Schritt ist noch ein ungeprüfter KI-Entwurf.' : `${n} Schritte sind noch ungeprüfte KI-Entwürfe.`} Bitte vor dem Zuweisen ansehen – oder
      an der Schrittkarte als „Geprüft“ markieren.
    </Alert>
  )
}
