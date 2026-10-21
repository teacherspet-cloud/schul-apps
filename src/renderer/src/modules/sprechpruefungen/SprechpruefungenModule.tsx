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
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Collapse,
  Container,
  Group,
  Image,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconMicrophone,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconUsers
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Textbook, TextbookMeta } from '@shared/types'
import { standText, type BildKarte, type DialogKarte, type InterviewKarte, type SprechKarte, type SprechStand } from '@shared/sprechen/karten'
import { kartenAnfrage, type Grundlage, type KartenTeil } from '@shared/sprechen/erstellen'
import { zielNiveau, type SprechSprache } from '@shared/sprechen/niveaus'
import { pruefAnfrage, pruefBerichtText, pruefErgebnisAnwenden } from '@shared/sprechen/pruefen'
import { AbbruchFehler } from '@shared/abbruch'
import { bildVersionen, versionenZusammenfuehren, versionHinzu, versionLoeschen, versionWaehlen } from '@shared/sprechen/bildVersionen'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { useAppSettings } from '../../shared/settingsStore'
import { BandCover } from '../../shared/components/BandCover'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { FachPunkt } from '../../shared/components/FachFarbe'
import { starteAuftrag, type AuftragsKontext } from '../../shared/auftraege'
import { useDokumentOeffner } from '../../shared/navigation'
import { collectKnownVocab, grammatikStand } from '../../shared/knownVocab'
import { useLehrplanVorschlaege } from '../../shared/lehrplanVorschlaege'
import { drucken, pruefungsSetHtml } from './pruefungsset'
import { abschnittGruppen, blaettern, fuellPlan, gruppiere, nachStand, nurImBereich, OHNE_STAND, spaetesteBis, standBis, wischRichtung, zufallsSet, type FuellSchritt, type StandGruppe } from './stand'

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

/**
 * Ziel für „Öffnen" in der Auftragsleiste (21.10.2026, Befund der Lehrkraft: „Öffnen" bei einem Sprechkarten-Bild öffnete
 * weder das Bild noch die Karte): Sprache und Jahrgang, bei Bildern dazu die Karte – sie öffnet sich dann im Fenster.
 */
interface SprechZiel {
  sprache: string
  jahrgang: number
  karteId?: string
}
export const sprechZiel = (z: SprechZiel): string => `sp:${encodeURIComponent(JSON.stringify(z))}`
export function sprechZielAus(docId: string): SprechZiel | null {
  if (!docId?.startsWith('sp:')) return null
  try {
    const z = JSON.parse(decodeURIComponent(docId.slice(3))) as Partial<SprechZiel>
    return typeof z.sprache === 'string' && typeof z.jahrgang === 'number'
      ? { sprache: z.sprache, jahrgang: z.jahrgang, ...(typeof z.karteId === 'string' && z.karteId ? { karteId: z.karteId } : {}) }
      : null
  } catch {
    return null
  }
}
const titelVon = (k: SprechKarte): string => (k.art === 'interview' ? k.thema : k.titel)

/** Bild zur Karte erzeugen und am Server ablegen (im Hintergrund) */
function bildErzeugen(p: PoolKarte, prompt: string, fertig: () => void): void {
  void starteAuftrag({
    moduleId: 'sprechpruefungen',
    docId: sprechZiel({ sprache: p.sprache, jahrgang: p.jahrgang, karteId: p.id }),
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
      // Als neue Fassung zur Karte, wie sie JETZT am Server steht (21.10.2026) – ältere Fassungen bleiben erhalten
      const stand = await holen<{ karten: PoolKarte[] }>(`/server/sprech-bank?sprache=${e.p.sprache}`).then(
        (r) => r.karten.find((x) => x.id === e.p.id)?.karte,
        () => undefined
      )
      const karte = (stand?.art === 'monolog' ? stand : e.p.karte) as BildKarte
      await senden('/server/sprech-bank/speichern', { id: e.p.id, sprache: e.p.sprache, jahrgang: e.p.jahrgang, teil: e.p.teil, karte: versionHinzu(karte, datei) })
      return datei
    },
    ablegen: async () => fertig(),
    abschluss: () => 'Bild gespeichert'
  })
}

/** Blättern im Kartenfenster (21.10.2026): Pfeile, „3 von 12", Tasten ←/→ und Wischen */
interface Blaettern {
  nr: number
  von: number
  zurueck?: () => void
  weiter?: () => void
}

/** Tasten ←/→ (nicht beim Schreiben in Feldern) und Wischen auf Tablet/Handy – liefert die Touch-Handler fürs Fenster */
function useBlaettern(b: Blaettern | undefined): { onTouchStart: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void } {
  useEffect(() => {
    if (!b) return
    const taste = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return
      const ziel = e.target as HTMLElement | null
      if (ziel?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      const f = e.key === 'ArrowLeft' ? b.zurueck : e.key === 'ArrowRight' ? b.weiter : undefined
      if (!f) return
      e.preventDefault()
      f()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [b])
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e) => setStart(e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null),
    onTouchEnd: (e) => {
      const t = e.changedTouches[0]
      if (!b || !start || !t) return
      const r = wischRichtung(t.clientX - start.x, t.clientY - start.y)
      setStart(null)
      if (r === 'weiter') b.weiter?.()
      else if (r === 'zurueck') b.zurueck?.()
    }
  }
}

function BlaetterLeiste({ b }: { b?: Blaettern }): React.JSX.Element | null {
  if (!b || b.von < 2) return null
  return (
    <Group gap="xs" justify="center" data-sprech-blaettern>
      <ActionIcon variant="light" onClick={b.zurueck} disabled={!b.zurueck} aria-label="Vorherige Karte" data-sprech-zurueck>
        <IconChevronLeft size={16} />
      </ActionIcon>
      <Text size="sm" c="dimmed" data-sprech-position>
        {b.nr} von {b.von}
      </Text>
      <ActionIcon variant="light" onClick={b.weiter} disabled={!b.weiter} aria-label="Nächste Karte" data-sprech-weiter>
        <IconChevronRight size={16} />
      </ActionIcon>
    </Group>
  )
}

/** Lehrwerk-Stand einer Karte (21.10.2026) – ältere Karten ohne Angabe */
function StandZeile({ stand }: { stand?: SprechStand }): React.JSX.Element {
  return (
    <Text size="xs" c="dimmed" data-sprechkarte-stand>
      {stand ? standText(stand) : 'Lehrwerk-Stand nicht angegeben'}
    </Text>
  )
}

function KartenEditor({
  k,
  aktuell,
  amServer,
  neuesBild,
  blaettern: b,
  zwischenspeichern,
  schliessen,
  speichern
}: {
  k: SprechKarte
  /** Gewählte Stelle im Lehrwerk – für Karten ohne bzw. mit anderem Stand übernehmbar (21.10.2026) */
  aktuell?: SprechStand
  /** Die Karte, wie sie gerade am Server steht – neue Bildfassungen aus dem Hintergrund erscheinen so gleich */
  amServer?: SprechKarte
  /** Bild neu erzeugen (nur gespeicherte Bildkarten), mit optionalem Zusatzwunsch */
  neuesBild?: (wunsch: string) => void
  /** Nachbarkarten der Spalte (21.10.2026) */
  blaettern?: Blaettern
  /** Beim Blättern mit Änderungen: automatisch speichern (wie beim Wechsel der Reihe), ohne das Fenster zu schließen */
  zwischenspeichern?: (k: SprechKarte) => void
  schliessen: () => void
  speichern: (k: SprechKarte) => void
}): React.JSX.Element {
  const [x0, setX] = useState<SprechKarte>(k)
  // Bildfassungen (21.10.2026): im Fenster gelöschte merken, damit eine im Hintergrund neue nicht verloren geht
  const [geloescht, setGeloescht] = useState<string[]>([])
  const [wunsch, setWunsch] = useState('')
  const [zeichnet, setZeichnet] = useState(false)
  const x: SprechKarte = x0.art === 'monolog' ? versionenZusammenfuehren(x0, amServer?.art === 'monolog' ? amServer : undefined, geloescht) : x0
  const geaendert = JSON.stringify(x0) !== JSON.stringify(k) || geloescht.length > 0
  const mitSpeichern = (f?: () => void): (() => void) | undefined =>
    f &&
    (() => {
      if (geaendert) zwischenspeichern?.(x)
      f()
    })
  const nav: Blaettern | undefined = b && { ...b, zurueck: mitSpeichern(b.zurueck), weiter: mitSpeichern(b.weiter) }
  const wisch = useBlaettern(nav)
  const zeilen = (l: string[]): string => l.join('\n')
  const aus = (s: string): string[] => s.split('\n').map((z) => z.trim()).filter(Boolean)
  return (
    <Modal opened onClose={schliessen} title="Karte bearbeiten" size="lg">
      <Stack gap="sm" {...wisch}>
        <BlaetterLeiste b={nav} />
        <Group gap="xs">
          <StandZeile stand={x.stand} />
          {aktuell && standText(aktuell) !== standText(x.stand) && (
            <Button size="compact-xs" variant="subtle" onClick={() => setX({ ...x, stand: aktuell })} data-sprechkarte-stand-setzen>
              {x.stand ? 'Ändern auf' : 'Setzen:'} {standText(aktuell)}
            </Button>
          )}
        </Group>
        {x.art === 'interview' && (
          <>
            <TextInput label="Thema" value={x.thema} onChange={(e) => setX({ ...x, thema: e.currentTarget.value })} />
            <Textarea label="Fragen (eine je Zeile, offene zuerst)" autosize minRows={5} value={zeilen(x.fragen)} onChange={(e) => setX({ ...x, fragen: aus(e.currentTarget.value) })} />
          </>
        )}
        {x.art === 'monolog' && (
          <>
            {/* Das erstellte Bild auch im Fenster (21.10.2026, Wunsch der Lehrkraft) – neben Fragen und Beschreibung */}
            {x.bilder[0] && <Image src={bildUrl(x.bilder[0])} mah={320} radius="sm" fit="contain" alt="" data-sprechkarte-bild />}
            {/* Fassungen (21.10.2026): antippen = wird die aktuelle; veraltete löschen */}
            {bildVersionen(x).length > 1 && (
              <Group gap="xs" data-sprechkarte-versionen>
                {bildVersionen(x).map((d, n) => {
                  const ist = x.bilder.includes(d)
                  return (
                    <Stack key={d} gap={2} align="center">
                      <UnstyledButton
                        onClick={() => setX(versionWaehlen(x, d))}
                        title={ist ? 'Aktuelle Fassung' : 'Diese Fassung verwenden'}
                        style={{ borderRadius: 6, outline: ist ? '2px solid var(--mantine-color-violet-6)' : undefined }}
                        data-sprechkarte-version={n + 1}
                      >
                        <Image src={bildUrl(d)} w={72} h={54} radius="sm" fit="cover" alt="" />
                      </UnstyledButton>
                      {ist ? (
                        <Text size="xs" c="dimmed">
                          aktuell
                        </Text>
                      ) : (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          onClick={() => (setGeloescht([...geloescht, d]), setX(versionLoeschen(x, d)))}
                          data-sprechkarte-version-loeschen
                        >
                          Version löschen
                        </Button>
                      )}
                    </Stack>
                  )
                })}
              </Group>
            )}
            {neuesBild ? (
              <Group gap="xs" align="flex-end">
                <TextInput
                  label="Zusatzwunsch für ein neues Bild (optional)"
                  placeholder="z. B. mehr Personen, draußen, Winter"
                  value={wunsch}
                  onChange={(e) => setWunsch(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  variant="light"
                  color="violet"
                  leftSection={<IconPhoto size={14} />}
                  onClick={() => (neuesBild(wunsch.trim()), setZeichnet(true), setWunsch(''))}
                  data-sprechkarte-bild-neu
                >
                  Bild neu erzeugen
                </Button>
              </Group>
            ) : (
              <Text size="xs" c="dimmed">
                Ein neues Bild lässt sich nach dem Speichern der Karte erzeugen.
              </Text>
            )}
            {zeichnet && (
              <Text size="xs" c="dimmed">
                Das neue Bild wird im Hintergrund gezeichnet und erscheint hier als weitere Fassung; die bisherigen bleiben erhalten.
              </Text>
            )}
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

/**
 * Ansehen ohne Bearbeiten (21.10.2026, Wunsch der Lehrkraft): Karten ohne Bearbeitungsrecht öffnen sich mit Bild,
 * Titel, Beschreibung und Fragen – wie das Bearbeiten-Fenster, nur ohne Eingabefelder
 */
function KartenAnsicht({ k, blaettern: b, schliessen }: { k: SprechKarte; blaettern?: Blaettern; schliessen: () => void }): React.JSX.Element {
  const wisch = useBlaettern(b)
  const feld = (titel: string, inhalt: React.ReactNode): React.JSX.Element => (
    <div>
      <Text size="sm" fw={600}>
        {titel}
      </Text>
      {inhalt}
    </div>
  )
  const absatz = (t: string): React.JSX.Element => <Text size="sm">{t}</Text>
  const punkte = (l: string[]): React.JSX.Element => (
    <Stack gap={2}>
      {l.map((z, i) => (
        <Text key={i} size="sm">
          • {z}
        </Text>
      ))}
    </Stack>
  )
  return (
    <Modal opened onClose={schliessen} title={titelVon(k)} size="lg" data-sprechkarte-ansicht>
      <Stack gap="sm" {...wisch}>
        <BlaetterLeiste b={b} />
        <StandZeile stand={k.stand} />
        {k.art === 'interview' && feld('Fragen', punkte(k.fragen))}
        {k.art === 'monolog' && (
          <>
            {k.bilder[0] && <Image src={bildUrl(k.bilder[0])} mah={320} radius="sm" fit="contain" alt="" data-sprechkarte-bild />}
            {feld('Was auf dem Bild zu sehen ist', absatz(k.bildBeschreibung))}
            {feld('Leitfragen', punkte(k.leitfragen))}
          </>
        )}
        {k.art === 'dialog' && (
          <>
            {feld('Form', absatz(k.form === 'infogap' ? 'Info-Gap (Info- und Fragekarte)' : k.form === 'diskussion' ? 'Diskussion mit Einigung' : 'Rollenspiel'))}
            {feld('Situation', absatz(k.situation))}
            {k.rolleSchueler && feld('Rolle Schüler/in', absatz(k.rolleSchueler))}
            {k.rolleKi && feld('Rolle der Partnerin', absatz(k.rolleKi))}
            {feld('Punkte / Optionen', punkte(k.punkte))}
            {k.ziel && feld('Ziel', absatz(k.ziel))}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Schließen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Vorschau einer Karte (Kachel) */
function KartenKachel({
  k,
  onClick,
  aktionen,
  entwurf,
  nurAbschnitt
}: {
  k: SprechKarte
  onClick?: () => void
  aktionen?: React.ReactNode
  entwurf?: boolean
  /** In der Untergruppe Band › Unit › Abschnitt: ohne Stand-Zeile (21.10.2026) */
  nurAbschnitt?: boolean
}): React.JSX.Element {
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
        {/* In der Untergruppe je Abschnitt steht der Stand schon im Kopf (21.10.2026) */}
        {!nurAbschnitt && <StandZeile stand={k.stand} />}
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

/** Offene Gruppen (21.10.2026) – nur für die Sitzung gemerkt; anfangs ist alles zugeklappt (Wunsch der Lehrkraft, 21.10.2026) */
const OFFEN_SCHLUESSEL = 'sa-sprech-gruppen-offen'
function useOffen(): [Record<string, boolean>, (k: string, v: boolean) => void] {
  const [o, setO] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(OFFEN_SCHLUESSEL) ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const setze = (k: string, v: boolean): void =>
    setO((alt) => {
      const neu = { ...alt, [k]: v }
      try {
        sessionStorage.setItem(OFFEN_SCHLUESSEL, JSON.stringify(neu))
      } catch {
        /* ohne Speicher nur bis zum Neuladen */
      }
      return neu
    })
  return [o, setze]
}

/** Auf- und zuklappbare Gruppe Band › Unit mit Anzahl (21.10.2026); `klein` = Untergruppe je Abschnitt, eingerückt */
function Gruppe({
  titel,
  anzahl,
  offen,
  umschalten,
  klein,
  children
}: {
  titel: string
  anzahl: number
  offen: boolean
  umschalten: () => void
  klein?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div {...(klein ? { 'data-sprech-abschnittgruppe': titel, style: { paddingLeft: 12 } } : { 'data-sprech-gruppe': titel })}>
      <UnstyledButton onClick={umschalten} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }} aria-expanded={offen}>
        {offen ? <IconChevronDown size={klein ? 12 : 14} /> : <IconChevronRight size={klein ? 12 : 14} />}
        <Text size={klein ? 'xs' : 'sm'} fw={klein ? 600 : 700}>
          {titel}{' '}
          <Text span c="dimmed" size={klein ? 'xs' : 'sm'}>
            ({anzahl})
          </Text>
        </Text>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <Stack gap="xs" mt={6}>
          {children}
        </Stack>
      </Collapse>
    </div>
  )
}

/** Eintrag einer Spalte: Entwurf der KI oder Karte im Pool */
type SpaltenEintrag = { e: Entwurf; p?: undefined } | { p: PoolKarte; e?: undefined }
const karteVon = (x: SpaltenEintrag): SprechKarte => (x.e ? x.e.karte : x.p.karte)

/** Was eine Karten-Anfrage braucht: Teil, Anzahl und die Stelle im Lehrwerk */
interface KartenEingabe {
  teil: KartenTeil
  anzahl: number
  bandId: string | null
  unitName: string | null
  abschnitt: string | null
  stand?: SprechStand
  vorhanden: string[]
}
/** Rahmen des Jahrgangs für die Anfrage */
interface KartenRahmen {
  sprache: SprechSprache
  jahrgang: number
  niveau: ReturnType<typeof zielNiveau>
  themen: string[]
  buecher: TextbookMeta[]
}

/** Was die Prüfung der Karten ergab (21.10.2026) */
interface PruefBericht {
  geprueft: number
  bestanden: number
  gruende: string[]
}

/**
 * Karten für eine Stelle im Lehrwerk erzeugen (21.10.2026 aus „erstellen" herausgelöst, auch für „Ganzes Lehrwerk
 * füllen"): Wortschatz und Grammatik bis zum Abschnitt, dazu die Lehrplan-Themen. Danach prüft eine zweite Anfrage jede
 * Karte gegen dieselben Vorgaben (pruefen.ts); fällt etwas durch, legt die KI einmal nach (höchstens zwei Runden).
 */
async function kartenErzeugen(
  e: KartenEingabe,
  r: KartenRahmen,
  ai: AuftragsKontext['ai'],
  melde: (t: string) => void
): Promise<{ karten: Record<string, unknown>[]; bericht: PruefBericht }> {
  melde('Grundlage wird zusammengestellt …')
  let woerter: string[] = []
  let bekannt: string[] = []
  let neu: string[] = []
  let quelle = ''
  if (e.bandId && e.unitName) {
    const voll: Textbook = await window.api.textbooks.get(e.bandId)
    // Bis zum Abschnitt: sein Wortschatz zählt mit, seine Grammatik gilt als gerade gelernt (21.10.2026)
    const kv = await collectKnownVocab(voll, e.unitName, e.abschnitt ? [e.abschnitt] : [], r.jahrgang, r.buecher, (id) => window.api.textbooks.get(id))
    const dazu = e.abschnitt ? (voll.units.find((u) => u.name === e.unitName)?.sections.find((s) => s.name === e.abschnitt)?.entries.map((x) => x.term) ?? []) : []
    woerter = [...new Set([...(kv?.words ?? []), ...dazu])]
    quelle = kv?.source ?? ''
    const gs = grammatikStand(kv)
    bekannt = gs?.bekannt ?? []
    neu = gs?.neu ?? []
  }
  const g: Grundlage = { sprache: r.sprache, jahrgang: r.jahrgang, niveau: r.niveau, quelle, woerter, grammatikBekannt: bekannt, grammatikNeu: neu, themen: r.themen }
  const bericht: PruefBericht = { geprueft: 0, bestanden: 0, gruende: [] }
  const karten: Record<string, unknown>[] = []
  for (let runde = 0; runde < 2 && karten.length < e.anzahl; runde++) {
    const fehlt = e.anzahl - karten.length
    const schon = [...e.vorhanden, ...karten.map((x) => String(x.titel ?? x.thema ?? ''))]
    melde(runde ? `Die KI legt ${fehlt} Karten nach …` : 'Die KI schreibt die Karten …')
    const antwort = await ai<{ karten: Record<string, unknown>[] }>(kartenAnfrage(e.teil, fehlt, g, schon))
    const roh = (antwort.karten ?? []).slice(0, fehlt)
    if (!roh.length) continue
    melde(`Die KI prüft ${roh.length} Karten …`)
    let urteil: Parameters<typeof pruefErgebnisAnwenden>[2] = null
    try {
      urteil = await ai<NonNullable<typeof urteil>>(pruefAnfrage(e.teil, roh, g, schon))
    } catch (f) {
      // Wie bei der Grammatik: scheitert die Prüfung, bleiben die Karten – die Lehrkraft sieht es im Bericht
      if (f instanceof AbbruchFehler) throw f
      bericht.gruende.push('Prüfung nicht möglich – Karten ungeprüft übernommen')
    }
    const erg = pruefErgebnisAnwenden(e.teil, roh, urteil, schon)
    bericht.geprueft += roh.length
    bericht.bestanden += erg.bestanden.length
    bericht.gruende.push(...erg.gestrichen.map((x) => (x.titel ? `„${x.titel}“: ${x.grund}` : x.grund)))
    karten.push(...erg.bestanden)
  }
  return {
    karten: karten.map((x, i) => ({ ...x, art: e.teil, id: `e${Date.now().toString(36)}${i}`, bilder: [], ...(e.stand ? { stand: e.stand } : {}) })),
    bericht
  }
}

/** Namen der Teile in der Fortschrittsmeldung */
const TEIL_MEHRZAHL: Record<KartenTeil, string> = { interview: 'Interview-Sets', monolog: 'Bildkarten', dialog: 'Dialogkarten' }

function Jahrgang({
  fach,
  jahrgang,
  pool,
  darfAlle,
  zurueck,
  laden,
  zielKarte,
  zielErledigt
}: {
  fach: (typeof FAECHER)[number]
  jahrgang: number
  pool: PoolKarte[]
  darfAlle: boolean
  zurueck: () => void
  laden: () => void
  /** Karte, die „Öffnen" in der Auftragsleiste zeigen soll (21.10.2026) */
  zielKarte?: string | null
  zielErledigt?: () => void
}): React.JSX.Element {
  const settings = useAppSettings((s) => s.settings)
  const niveau = zielNiveau(fach.sprache, jahrgang)
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  useEffect(() => void window.api.textbooks.list().then(setBuecher, () => setBuecher([])), [])
  const baende = buecher.filter((b) => b.language === fach.sprache && !b.platzhalter)
  const [modus, setModus] = useState<'lehrwerk' | 'klasse'>('lehrwerk')
  const vorschlag = baende.find((b) => b.grade === jahrgang && b.stateId === settings.defaults.stateId) ?? baende.find((b) => b.grade === jahrgang)
  // undefined = Vorschlag des Jahrgangs, null = leer gemacht: alle Karten, neue ohne Lehrwerk-Stand (21.10.2026)
  const [bandId, setBandId] = useState<string | null | undefined>(undefined)
  const band = bandId === null ? undefined : baende.find((b) => b.id === (bandId ?? vorschlag?.id))
  const [unit, setUnit] = useState<string | null>(null)
  const unitName = unit ?? band?.units[band.units.length - 1]?.name ?? null
  // Abschnitt der Unit (21.10.2026): leer = die ganze Unit
  const [abschnitt, setAbschnitt] = useState<string | null>(null)
  const abschnitte = band?.units.find((u) => u.name === unitName)?.sections.map((s) => s.name) ?? []
  const abschnittName = abschnitt && abschnitte.includes(abschnitt) ? abschnitt : null
  // Stand, der an neuen Karten gespeichert wird – sichtbar an jeder Karte und Grundlage der Sortierung
  const stand: SprechStand | undefined = band && unitName ? { band: band.name, unit: unitName, ...(abschnittName ? { abschnitt: abschnittName } : {}) } : undefined
  const [ansehen, setAnsehen] = useState<PoolKarte | null>(null)
  // Weitere Filter (21.10.2026): Suche über alle Spalten, eigene Karten, Bildkarten ohne Bild, Entwürfe
  const [suche, setSuche] = useState('')
  const [nurEigene, setNurEigene] = useState(false)
  const [ohneBild, setOhneBild] = useState(false)
  const [nurEntwuerfe, setNurEntwuerfe] = useState(false)
  const zusatzAktiv = Boolean(suche.trim()) || nurEigene || ohneBild || nurEntwuerfe
  const zuruecksetzen = (): void => (setSuche(''), setNurEigene(false), setOhneBild(false), setNurEntwuerfe(false))
  const [offen, setOffen] = useOffen()
  const passt = (x: SpaltenEintrag): boolean => {
    const k = karteVon(x)
    const s = suche.trim().toLowerCase()
    return (
      standBis(k.stand, stand, baende) &&
      (!s || [titelVon(k), k.art === 'dialog' ? k.situation : ''].join(' ').toLowerCase().includes(s)) &&
      (!nurEigene || Boolean(x.e || x.p?.eigene)) &&
      (!ohneBild || (k.art === 'monolog' && !k.bilder.length)) &&
      (!nurEntwuerfe || Boolean(x.e))
    )
  }
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
          setAbschnitt(null)
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
  // „Öffnen" aus der Auftragsleiste: die Karte (mit ihrem Bild) öffnen, sobald sie geladen ist
  useEffect(() => {
    const p = zielKarte ? pool.find((x) => x.id === zielKarte) : undefined
    if (!p) return
    if (p.eigene || darfAlle) setBearbeiten({ p })
    else setAnsehen(p)
    zielErledigt?.()
  }, [zielKarte, pool, darfAlle]) // eslint-disable-line react-hooks/exhaustive-deps

  const rahmen: KartenRahmen = { sprache: fach.sprache, jahrgang, niveau, themen, buecher }
  const erstellen = (teil: (typeof TEILE)[number]): void => {
    const vorhanden = pool.filter((p) => p.teil === teil.id).map((p) => titelVon(p.karte))
    void starteAuftrag({
      moduleId: 'sprechpruefungen',
      docId: sprechZiel({ sprache: fach.sprache, jahrgang }),
      titel: `${teil.knopf.replace('+ ', '')} · ${fach.name} Jg ${jahrgang}`,
      art: 'Sprechkarten',
      eingabe: { teil: teil.id, anzahl: teil.anzahl, bandId: band?.id ?? null, unitName, abschnitt: abschnittName, stand, vorhanden },
      sperrt: false,
      fehlerTitel: 'Karten konnten nicht erstellt werden',
      arbeit: async (e, k) => {
        const r = await kartenErzeugen(e, rahmen, k.ai, (t) => k.melde(t))
        // Keine stille 0 (21.10.2026): ohne bestandene Karte endet der Auftrag mit dem Grund
        if (!r.karten.length) throw new Error(r.bericht.geprueft ? pruefBerichtText(r.bericht) : 'Die KI lieferte keine Karten.')
        return r
      },
      ablegen: async ({ karten }) => {
        speichereEntwuerfe([
          ...ladeEntwuerfe(),
          ...karten.map((karte) => ({ schluessel: String(karte.id), sprache: fach.sprache, jahrgang, teil: teil.id, karte: karte as unknown as Entwurf['karte'] }))
        ])
      },
      abschluss: ({ karten, bericht }) => `${karten.length} Karten zum Durchsehen in „Sprechprüfungen" · ${pruefBerichtText(bericht)}`
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
  /*
   * „Ganzes Lehrwerk füllen" (21.10.2026, abgestimmt): je Buchabschnitt des Bands 3 Interview-Sets, 4 Bildkarten und
   * 4 Dialogkarten mit genau diesem Stand – nur was fehlt, gleich gespeichert (ohne Entwurf), Bilder danach im
   * Hintergrund. Ein Auftrag, Abschnitte nacheinander; ein Fehler in einem Schritt hält die übrigen nicht auf.
   */
  const [fuellenFrage, setFuellenFrage] = useState(false)
  const plan: FuellSchritt[] = band ? fuellPlan(band, pool.map((p) => ({ teil: p.teil, stand: p.karte.stand }))) : []
  const fuellZahlen = {
    abschnitte: new Set(plan.map((x) => `${x.unit}|${x.abschnitt}`)).size,
    anfragen: plan.length,
    karten: plan.reduce((n, x) => n + x.anzahl, 0),
    bilder: plan.filter((x) => x.teil === 'monolog').reduce((n, x) => n + x.anzahl, 0)
  }
  const lehrwerkFuellen = (): void => {
    if (!band) return
    const titelJeTeil: Record<KartenTeil, string[]> = { interview: [], monolog: [], dialog: [] }
    for (const p of pool) titelJeTeil[p.teil]?.push(titelVon(p.karte))
    void starteAuftrag({
      moduleId: 'sprechpruefungen',
      docId: sprechZiel({ sprache: fach.sprache, jahrgang }),
      titel: `Ganzes Lehrwerk: ${band.name} · ${fach.name} Jg ${jahrgang}`,
      art: 'Sprechkarten',
      eingabe: { plan, bandId: band.id, bandName: band.name, titelJeTeil },
      sperrt: false,
      fehlerTitel: 'Lehrwerk konnte nicht gefüllt werden',
      arbeit: async (e, k) => {
        let gespeichert = 0
        let fehlerZahl = 0
        let fehler: unknown = null
        const summe: PruefBericht = { geprueft: 0, bestanden: 0, gruende: [] }
        for (const [i, x] of e.plan.entries()) {
          const vor = `${x.unit} › ${x.abschnitt} – ${TEIL_MEHRZAHL[x.teil]} (${i + 1} von ${e.plan.length})`
          k.melde(vor, i, e.plan.length)
          const stand: SprechStand = { band: e.bandName, unit: x.unit, abschnitt: x.abschnitt }
          try {
            const { karten, bericht } = await kartenErzeugen(
              { teil: x.teil, anzahl: x.anzahl, bandId: e.bandId, unitName: x.unit, abschnitt: x.abschnitt, stand, vorhanden: e.titelJeTeil[x.teil] },
              rahmen,
              k.ai,
              (t) => k.melde(`${vor}: ${t}`, i, e.plan.length)
            )
            summe.geprueft += bericht.geprueft
            summe.bestanden += bericht.bestanden
            summe.gruende.push(...bericht.gruende)
            for (const roh of karten.slice(0, x.anzahl)) {
              const { bildPrompt, ...karte } = roh as Record<string, unknown> & { bildPrompt?: string }
              const r = await senden<{ id: string }>('/server/sprech-bank/speichern', { sprache: fach.sprache, jahrgang, teil: x.teil, karte })
              gespeichert++
              e.titelJeTeil[x.teil].push(titelVon(karte as unknown as SprechKarte))
              const prompt = bildPrompt || (x.teil === 'monolog' ? String(karte.bildBeschreibung ?? '') : '')
              if (x.teil === 'monolog' && prompt)
                bildErzeugen({ id: r.id, sprache: fach.sprache, jahrgang, teil: x.teil, karte: karte as unknown as SprechKarte, eigene: true }, prompt, laden)
            }
          } catch (f) {
            // Abbruch durch die Lehrkraft beendet alles; sonst weiter mit dem nächsten Schritt
            if (k.signal.aborted) throw f
            fehler = f
            fehlerZahl++
          }
        }
        if (fehler && !gespeichert) throw fehler
        // Keine stille 0: hat nichts die Prüfung bestanden, steht der Grund in der Meldung
        if (!gespeichert && summe.geprueft) throw new Error(pruefBerichtText(summe))
        if (fehler)
          notifyError(
            `Bei ${fehlerZahl} ${fehlerZahl === 1 ? 'Schritt' : 'Schritten'} brach die KI ab – das Übrige ist gespeichert. „Ganzes Lehrwerk füllen" noch einmal drücken füllt nur die Lücken.`
          )
        return { gespeichert, summe }
      },
      ablegen: async () => laden(),
      abschluss: ({ gespeichert, summe }) => `${gespeichert} Karten gespeichert (${band.name}) · ${pruefBerichtText(summe)}`
    })
    notifySuccess('Das Lehrwerk wird im Hintergrund gefüllt – die Karten erscheinen nach und nach.')
  }

  const entwurfWeg = (s: string): void => speichereEntwuerfe(ladeEntwuerfe().filter((x) => x.schluessel !== s))
  const loeschen = (p: PoolKarte): void => void senden('/server/sprech-bank/loeschen', { id: p.id }).then(laden, (e: unknown) => notifyError(e))

  /** Kachel eines Eintrags – Entwurf mit Speichern/Verwerfen, Karte mit Bearbeiten oder Ansehen */
  const kachel = (x: SpaltenEintrag): React.JSX.Element => {
    if (x.e) {
      const e = x.e
      return (
        <KartenKachel
          nurAbschnitt
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
      )
    }
    const p = x.p
    return (
      <KartenKachel
        nurAbschnitt
        key={p.id}
        k={p.karte}
        onClick={() => (p.eigene || darfAlle ? setBearbeiten({ p }) : setAnsehen(p))}
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
    )
  }
  const alle: SpaltenEintrag[] = [...entwuerfe.map((e) => ({ e })), ...pool.map((p) => ({ p }))]
  /*
   * Blättern (21.10.2026): Reihenfolge wie in der Spalte sichtbar – gefiltert, Band › Unit › Abschnitt, auch Karten in
   * zugeklappten Gruppen; Entwürfe blättern unter Entwürfen, Karten unter Karten
   */
  const schluesselVon = (x: SpaltenEintrag): string => (x.e ? `e:${x.e.schluessel}` : `p:${x.p.id}`)
  const reihenfolge = (teil: KartenTeil): SpaltenEintrag[] =>
    gruppiere(
      alle.filter((x) => (x.e ? x.e.teil : x.p.teil) === teil && passt(x)),
      (x) => karteVon(x).stand,
      baende
    ).flatMap((g) => (g.schluessel === OHNE_STAND ? g.eintraege : abschnittGruppen(g.eintraege, (x) => karteVon(x).stand, baende).flatMap((u) => u.eintraege)))
  const oeffne = (x: SpaltenEintrag): void => {
    if (x.e) return (setAnsehen(null), setBearbeiten({ e: x.e }))
    if (x.p.eigene || darfAlle) return (setAnsehen(null), setBearbeiten({ p: x.p }))
    setBearbeiten(null)
    setAnsehen(x.p)
  }
  const blaetternFuer = (x: SpaltenEintrag | undefined): Blaettern | undefined => {
    if (!x) return undefined
    const l = reihenfolge(x.e ? x.e.teil : x.p.teil).filter((y) => Boolean(y.e) === Boolean(x.e))
    const b = blaettern(l.map(schluesselVon), schluesselVon(x))
    const ziel = (s: string | null): (() => void) | undefined => {
      const y = s ? l.find((z) => schluesselVon(z) === s) : undefined
      return y && (() => oeffne(y))
    }
    return b.nr ? { nr: b.nr, von: b.von, zurueck: ziel(b.zurueck), weiter: ziel(b.weiter) } : undefined
  }
  // Entwurf beim Blättern nur hier ändern – er bleibt Entwurf, gespeichert wird weiter erst nach Durchsicht
  const entwurfAendern = (schluessel: string, karte: SprechKarte): void =>
    speichereEntwuerfe(ladeEntwuerfe().map((x) => (x.schluessel === schluessel ? { ...x, karte: { ...x.karte, ...karte } } : x)))
  const gesamt = alle.length
  const gezeigt = alle.filter(passt).length
  const fuerStand = standText(stand) ? `Neue Karten: ${standText(stand)}` : 'Neue Karten ohne Lehrwerk-Stand'

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
      {/* Filter getrennt vom Erstellen (21.10.2026): der Stand filtert die Karten und gilt für neue Karten und das Prüfungsset */}
      <Card withBorder radius="md" padding="sm" data-sprech-filter>
        <Group gap={6} mb={6}>
          <IconFilter size={16} />
          <Text fw={700} size="sm">
            Bis Lehrwerk-Stand
          </Text>
        </Group>
        <Group gap="md" align="flex-end" wrap="wrap">
          <SegmentedControl
            value={modus}
            onChange={(v) => setModus(v as 'lehrwerk' | 'klasse')}
            data={[
              { value: 'lehrwerk', label: 'Lehrwerk bis …' },
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
            onChange={(v) => (setBandId(v), setUnit(null), setAbschnitt(null))}
            w={200}
            clearable
            placeholder={baende.length ? 'alle Karten' : 'kein Lehrwerk'}
          />
          <Select
            label="bis"
            data={(band?.units ?? []).map((u) => u.name)}
            value={band ? unitName : null}
            onChange={(v) => (setUnit(v), setAbschnitt(null))}
            w={140}
            disabled={!band}
          />
          <Select
            label="Abschnitt"
            data={abschnitte}
            value={abschnittName}
            onChange={setAbschnitt}
            placeholder="ganze Unit"
            clearable
            w={170}
            disabled={!abschnitte.length}
            data-sprech-abschnitt
          />
          <Tooltip label={band ? `Je Abschnitt von ${band.name} fehlende Karten ergänzen` : 'Erst einen Band wählen'}>
            <Button
              variant="light"
              color="violet"
              leftSection={<IconSparkles size={16} />}
              disabled={!band}
              onClick={() => (plan.length ? setFuellenFrage(true) : notifySuccess('Alle Abschnitte des Bands haben schon genug Karten.'))}
              data-sprech-fuellen
            >
              Ganzes Lehrwerk füllen
            </Button>
          </Tooltip>
        </Group>
        <Group gap="md" align="center" wrap="wrap" mt="sm">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder="Suche (Titel, Thema, Situation)"
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
            w={260}
            data-sprech-suche
          />
          <Checkbox label="Nur eigene Karten" checked={nurEigene} onChange={(e) => setNurEigene(e.currentTarget.checked)} data-sprech-nur-eigene />
          <Checkbox label="Bildkarten ohne Bild" checked={ohneBild} onChange={(e) => setOhneBild(e.currentTarget.checked)} data-sprech-ohne-bild />
          <Checkbox label="Nur Entwürfe" checked={nurEntwuerfe} onChange={(e) => setNurEntwuerfe(e.currentTarget.checked)} data-sprech-nur-entwuerfe />
          {gezeigt < gesamt && (
            <Text size="sm" c="dimmed" data-sprech-anzahl>
              {gezeigt} von {gesamt} Karten
            </Text>
          )}
          {zusatzAktiv && (
            <Anchor component="button" size="sm" onClick={zuruecksetzen} data-sprech-filter-zuruecksetzen>
              Filter zurücksetzen
            </Anchor>
          )}
        </Group>
      </Card>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {TEILE.map((t) => {
          // Gruppen Band › Unit in Buchfolge, innen nach Abschnitt (21.10.2026)
          const eintraege = alle.filter((x) => (x.e ? x.e.teil : x.p.teil) === t.id)
          const sichtbar = eintraege.filter(passt)
          const gruppen: StandGruppe<SpaltenEintrag>[] = gruppiere(sichtbar, (x) => karteVon(x).stand, baende)
          const offenSchluessel = (g: string): string => `${fach.sprache}|${jahrgang}|${t.id}|${g}`
          return (
            <Stack key={t.id} gap="xs" data-sprech-spalte={t.id}>
              <Group justify="space-between" gap="xs">
                <Text fw={800}>
                  {t.name}{' '}
                  <Text span c="dimmed" size="sm">
                    ({sichtbar.length === eintraege.length ? eintraege.length : `${sichtbar.length} von ${eintraege.length}`})
                  </Text>
                </Text>
              </Group>
              <Group gap={4}>
                <Tooltip label={fuerStand}>
                  <Button size="xs" variant="light" color="violet" leftSection={<IconSparkles size={14} />} onClick={() => erstellen(t)} data-sprech-erstellen={t.id}>
                    {t.knopf}
                  </Button>
                </Tooltip>
                <Tooltip label={fuerStand}>
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
                            ? ({ art: 'interview', id: '', thema: '', fragen: [], stand } as InterviewKarte)
                            : t.id === 'monolog'
                              ? ({ art: 'monolog', id: '', titel: '', bilder: [], bildBeschreibung: '', leitfragen: [], stand } as BildKarte)
                              : ({ art: 'dialog', id: '', form: 'rollenspiel', titel: '', situation: '', rolleSchueler: '', rolleKi: '', punkte: [], ziel: '', stand } as DialogKarte)
                      }
                    })
                  }
                  >
                    Von Hand
                  </Button>
                </Tooltip>
              </Group>
              {gruppen.map((g) => {
                const o = offen[offenSchluessel(g.schluessel)] ?? false
                return (
                  <Gruppe key={g.schluessel} titel={g.titel} anzahl={g.eintraege.length} offen={o} umschalten={() => setOffen(offenSchluessel(g.schluessel), !o)}>
                    {g.schluessel === OHNE_STAND
                      ? g.eintraege.map(kachel)
                      : (() => {
                          // Untergruppen je Abschnitt (21.10.2026), anfangs zugeklappt wie die Gruppen
                          const unter = abschnittGruppen(g.eintraege, (x) => karteVon(x).stand, baende)
                          return unter.map((u) => {
                            const k = offenSchluessel(`${g.schluessel}|${u.schluessel}`)
                            const uo = offen[k] ?? false
                            return (
                              <Gruppe key={u.schluessel} klein titel={u.titel} anzahl={u.eintraege.length} offen={uo} umschalten={() => setOffen(k, !uo)}>
                                {u.eintraege.map(kachel)}
                              </Gruppe>
                            )
                          })
                        })()}
                  </Gruppe>
                )
              })}
              {!sichtbar.length && (
                <Text size="sm" c="dimmed">
                  {eintraege.length ? 'Keine Karte passt zum Filter.' : 'Noch keine Karten.'}
                </Text>
              )}
            </Stack>
          )
        })}
      </SimpleGrid>
      {bearbeiten && (
        <KartenEditor
          key={bearbeiten.e ? `e:${bearbeiten.e.schluessel}` : `p:${bearbeiten.p?.id ?? 'neu'}`}
          k={(bearbeiten.p?.karte ?? bearbeiten.e!.karte) as SprechKarte}
          blaettern={blaetternFuer(bearbeiten.e ? { e: bearbeiten.e } : bearbeiten.p?.id ? { p: bearbeiten.p } : undefined)}
          zwischenspeichern={(k) => {
            if (bearbeiten.e) entwurfAendern(bearbeiten.e.schluessel, k)
            else if (bearbeiten.p?.id) void speichern(bearbeiten.p.teil, k, bearbeiten.p.id)
          }}
          aktuell={stand}
          amServer={pool.find((p) => p.id === bearbeiten.p?.id)?.karte}
          neuesBild={
            bearbeiten.p?.id && bearbeiten.p.teil === 'monolog'
              ? (wunsch) => {
                  const p = pool.find((q) => q.id === bearbeiten.p?.id) ?? bearbeiten.p!
                  const b = p.karte as BildKarte
                  bildErzeugen(p, [b.bildBeschreibung, wunsch && `Additional wish: ${wunsch}`].filter(Boolean).join(' '), laden)
                }
              : undefined
          }
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
      {ansehen && <KartenAnsicht key={ansehen.id} k={ansehen.karte} blaettern={blaetternFuer({ p: ansehen })} schliessen={() => setAnsehen(null)} />}
      {fuellenFrage && band && (
        <Modal opened onClose={() => setFuellenFrage(false)} title={`Ganzes Lehrwerk füllen – ${band.name}`} data-sprech-fuellen-frage>
          <Stack gap="sm">
            <Text size="sm">
              Je Abschnitt des Bands 3 Interview-Sets, 4 Bildkarten und 4 Dialogkarten – vorhandene Karten zählen mit, ergänzt wird nur, was fehlt. Die
              Karten werden ohne Durchsicht gespeichert.
            </Text>
            <Text size="sm" data-sprech-fuellen-zahlen>
              {fuellZahlen.abschnitte} Abschnitte · {fuellZahlen.anfragen} KI-Anfragen · {fuellZahlen.karten} Karten · {fuellZahlen.bilder} Bilder
            </Text>
            <Text size="sm" c="dimmed">
              Läuft im Hintergrund und kann lange dauern; Abbrechen ist in der Auftragsleiste möglich. Bereits Gespeichertes bleibt.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setFuellenFrage(false)}>
                Abbrechen
              </Button>
              <Button color="violet" onClick={() => (setFuellenFrage(false), lehrwerkFuellen())} data-sprech-fuellen-start>
                Füllen starten
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {druck && <DruckDialog fach={fach} jahrgang={jahrgang} pool={pool} stand={stand} baende={baende} schliessen={() => setDruck(false)} />}
    </Stack>
  )
}

function DruckDialog({
  fach,
  jahrgang,
  pool,
  stand,
  baende,
  schliessen
}: {
  fach: (typeof FAECHER)[number]
  jahrgang: number
  /** Alle Karten des Jahrgangs – zur Auswahl stehen die bis zum Stand */
  pool: PoolKarte[]
  stand?: SprechStand
  baende: TextbookMeta[]
  schliessen: () => void
}): React.JSX.Element {
  // Zufällige Kombination (21.10.2026) mit eigenem „bis"-Stand – vorbelegt mit dem Filter
  const [zufall, setZufall] = useState(false)
  const [zBandId, setZBandId] = useState<string | null>(baende.find((x) => x.name === stand?.band)?.id ?? null)
  const zBand = baende.find((x) => x.id === zBandId)
  const [zUnit, setZUnit] = useState<string | null>(stand?.unit ?? null)
  const zUnitName = zBand && zUnit && zBand.units.some((u) => u.name === zUnit) ? zUnit : (zBand?.units[zBand.units.length - 1]?.name ?? null)
  const [zAbschnitt, setZAbschnitt] = useState<string | null>(stand?.abschnitt ?? null)
  const zAbschnitte = zBand?.units.find((u) => u.name === zUnitName)?.sections.map((x) => x.name) ?? []
  const zStand: SprechStand | undefined =
    zBand && zUnitName ? { band: zBand.name, unit: zUnitName, ...(zAbschnitt && zAbschnitte.includes(zAbschnitt) ? { abschnitt: zAbschnitt } : {}) } : undefined
  const bis = zufall ? zStand : stand
  const auswahl = pool.filter((p) => standBis(p.karte.stand, bis, baende))
  // Gruppiert nach Band › Unit, in Buchfolge; mit Abschnitt im Namen (21.10.2026)
  const von = (teil: KartenTeil): { group: string; items: { value: string; label: string }[] }[] =>
    gruppiere(
      auswahl.filter((p) => p.teil === teil),
      (p) => p.karte.stand,
      baende
    ).map((g) => ({
      group: g.titel,
      items: g.eintraege.map((p) => ({ value: p.id, label: [titelVon(p.karte), p.karte.stand?.abschnitt].filter(Boolean).join(' · ') }))
    }))
  // Vorauswahl: die Karten mit dem spätesten Stand bis zum gewählten
  const erste = (teil: KartenTeil, n = 0): string | null =>
    spaetesteBis(
      pool.filter((p) => p.teil === teil),
      (p) => p.karte.stand,
      stand,
      baende
    )[n]?.id ?? null
  const [i, setI] = useState(erste('interview'))
  const [a, setA] = useState(erste('monolog'))
  const [b, setB] = useState(erste('monolog', 1) ?? erste('monolog'))
  const [d, setD] = useState(erste('dialog'))
  const wuerfeln = (): void => {
    const z = zufallsSet(
      pool.map((p) => ({ id: p.id, teil: p.teil, stand: p.karte.stand })),
      zStand,
      baende
    )
    setI(z.interview)
    setA(z.monologA)
    setB(z.monologB)
    setD(z.dialog)
  }
  const [gewuerfelt, setGewuerfelt] = useState(false)
  // Wird der Bereich nach dem Würfeln enger, fallen Karten außerhalb weg – gedruckt wird nur Sichtbares (21.10.2026)
  const w = nurImBereich({ i, a, b, d }, (id) => auswahl.some((p) => p.id === id))
  const karte = <T,>(id: string | null): T | undefined => pool.find((p) => p.id === id)?.karte as T | undefined
  return (
    <Modal opened onClose={schliessen} title={`Prüfungsset drucken – ${fach.name} Jg ${jahrgang}`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Für ein Prüflingspaar: Prüferblatt, Kandidatenkarten A und B und zwei Bewertungsbögen (30 Punkte).{' '}
          {bis ? `Zur Auswahl stehen die Karten ${standText(bis)}.` : 'Zur Auswahl stehen alle Karten.'}
        </Text>
        <Checkbox label="Zufällige Kombination" checked={zufall} onChange={(e) => setZufall(e.currentTarget.checked)} data-pruefungsset-zufall />
        {zufall && (
          <Card withBorder radius="md" padding="sm">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                label="Band"
                data={baende.map((x) => ({ value: x.id, label: x.name }))}
                value={zBandId}
                onChange={(v) => (setZBandId(v), setZUnit(null), setZAbschnitt(null))}
                clearable
                placeholder="alle Karten"
                w={180}
              />
              <Select label="bis" data={(zBand?.units ?? []).map((u) => u.name)} value={zUnitName} onChange={(v) => (setZUnit(v), setZAbschnitt(null))} w={120} disabled={!zBand} />
              <Select label="Abschnitt" data={zAbschnitte} value={zStand?.abschnitt ?? null} onChange={setZAbschnitt} placeholder="ganze Unit" clearable w={150} disabled={!zAbschnitte.length} />
              <Button variant="light" onClick={() => (wuerfeln(), setGewuerfelt(true))} data-pruefungsset-wuerfeln>
                {gewuerfelt ? 'Neu würfeln' : 'Zufällig wählen'}
              </Button>
            </Group>
          </Card>
        )}
        <Select label="Interview-Set" data={von('interview')} value={w.i} onChange={setI} clearable />
        <Select label="Bildkarte Kandidat/in A" data={von('monolog')} value={w.a} onChange={setA} clearable />
        <Select label="Bildkarte Kandidat/in B" data={von('monolog')} value={w.b} onChange={setB} clearable />
        <Select label="Dialogkarte" data={von('dialog')} value={w.d} onChange={setD} clearable />
        <Button
          leftSection={<IconPrinter size={16} />}
          onClick={() =>
            drucken(
              pruefungsSetHtml({
                fach: fach.name,
                jahrgang,
                niveau: zielNiveau(fach.sprache, jahrgang),
                interview: karte<InterviewKarte>(w.i),
                monologA: karte<BildKarte>(w.a),
                monologB: karte<BildKarte>(w.b),
                dialog: karte<DialogKarte>(w.d),
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
  const programmFarbe = useProgrammFarbe()
  const [daten, setDaten] = useState<{ karten: PoolKarte[]; darfAlle: boolean } | null>(null)
  const [jahrgang, setJahrgang] = useState<number | null>(null)
  const [zielKarte, setZielKarte] = useState<string | null>(null)
  useDokumentOeffner('sprechpruefungen', async (docId) => {
    const z = sprechZielAus(docId)
    if (!z) return
    const f = FAECHER.find((x) => x.sprache === z.sprache)
    if (f) setFachId(f.id)
    setJahrgang(z.jahrgang)
    setZielKarte(z.karteId ?? null)
  })
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
  const weitester = (l: PoolKarte[]): SprechStand | undefined =>
    l
      .map((x) => x.karte.stand)
      .filter((x): x is SprechStand => Boolean(x))
      .sort((x, y) => nachStand(x, y, buecher))
      .pop()
  return (
    <Container size="xl" py="lg" data-sprechpruefungen>
      {/* Gemeinsamer Kopf wie in den anderen Programmen (21.10.2026, Befund der Lehrkraft); Fächer als Chips wie in „Grammatikformen" */}
      <AppKopf suche={false} beschreibung="Material je Jahrgang für die Sprechprüfung und das Sprechtraining der Lernenden – für die ganze Fachschaft." />
      {faecher.length > 1 && (
        <Chip.Group value={fachId} onChange={(v) => typeof v === 'string' && (setFachId(v), setJahrgang(null))}>
          <Group gap={6} mb="lg">
            {faecher.map((f) => (
              <Chip key={f.id} value={f.id} color={programmFarbe} variant="light" data-sprech-fach={f.id}>
                <Group gap={6} wrap="nowrap" component="span">
                  <FachPunkt fach={f.id} />
                  {f.name}
                </Group>
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      )}
      {!daten ? (
        <Loader />
      ) : jahrgang ? (
        <Jahrgang
          fach={fach}
          jahrgang={jahrgang}
          pool={daten.karten.filter((k) => k.jahrgang === jahrgang)}
          darfAlle={daten.darfAlle}
          zurueck={() => setJahrgang(null)}
          laden={laden}
          zielKarte={zielKarte}
          zielErledigt={() => setZielKarte(null)}
        />
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
                      {/* Wie weit der Pool reicht (21.10.2026): der späteste Lehrwerk-Stand seiner Karten */}
                      {weitester(k) && (
                        <Text size="xs" c="dimmed" ta="center" data-sprech-pool-stand>
                          {standText(weitester(k))}
                        </Text>
                      )}
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
