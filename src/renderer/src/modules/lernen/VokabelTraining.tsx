/**
 * Vokabeltraining für Lehrkräfte (03.10.2026; Server: src/server/vokabeln.ts). Seit dem Wunsch der
 * Lehrkraft („Mach hieraus eine eigenständige App, in der man über einen längeren Zeitraum für eine
 * Lerngruppe/einzelne Lerner oder Personen mit QR Code / Code Zugriff auf das Lernen hat") eine
 * eigene App statt eines Reiters im Onlinetest: Lernzeitraum, Zugang per QR-Code für Gäste
 * (mit persönlichem Wiedereinstiegs-Code), beenden, wieder öffnen, löschen.
 *
 * Vokabeln (Lehrwerk-Abschnitt oder eigene Liste) einer Lerngruppe oder Einzelnen zum Lernen
 * freigeben, optional mit Testtermin. Lernstand je Lerngruppe und Kind – abgestimmt OHNE Ranglisten:
 * Verteilung auf die Fächer des Karteikastens, Erkennen vs. selbst schreiben, Aktivität der letzten
 * 7 Tage, Problemwörter mit typischen Falschantworten, Prognose zum Testtermin.
 */
import { useDokumentOeffner, useUebersichtZeiger } from '../../shared/navigation'
import { ListenSuche } from '../../shared/components/AppSuche'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { useAlleLernenden } from './LernendeWahl'
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
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
  Tooltip
} from '@mantine/core'
import { IconPencil, IconPlus, IconQrcode } from '@tabler/icons-react'
import { sprachenlernenZiel } from './kurs/auftragsZiel'
import { Freigeben as GrammatikFreigeben, type GrammatikVorgabe } from './GrammatikTraining'
import { useCallback, useEffect, useState } from 'react'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { mitBildern, VokabelQuelle, type VokabelAuswahl } from './VokabelQuelle'
import FreigabePlanen, { planGeaendert, planKnopf, planKoerper, planMeldung, planStart, type PlanWahl } from '../../shared/components/FreigabePlanen'
import { KursSeite } from './kurs/KursSeite'
import { ausFeld } from './kurs/kursDaten'
import KalenderHinweis from '../../shared/components/KalenderHinweis'
import type { KursReiter } from './kurs/kursDaten'
import { grammatikVorgabe, verbenDerListe } from './kurs/KursHinzufuegen'
import { LernstandSymbol } from './kurs/LernstandVerlauf'

/*
 * Die Kursseite steht seit 09.10.2026 in kurs/KursSeite.tsx („Kopf + Reiter", auch eingebettet in „Meine Klassen");
 * die bisherigen Ausfuhren bleiben hier erreichbar.
 */
export { ausFeld } from './kurs/kursDaten'
export { grammatikVorgabe, Hinzufuegen, verbenDerListe } from './kurs/KursHinzufuegen'
export { FACH_FARBEN, FACH_NAMEN, Faecherbalken, LernstandSymbol } from './kurs/LernstandVerlauf'

interface ZuweisungKurz {
  id: string
  titel: string
  /** Überschrift der Lehrkraft bzw. Standard „2026 - 5b - Englisch" (08.10.2026) */
  ueberschrift?: string
  eigeneUeberschrift?: boolean
  /** Bände des Kurses (09.10.2026), z. B. „Green Line 1–2" – leer ohne Lehrwerk */
  baende?: string
  symbol?: 'verlauf' | 'farbe'
  faecher?: number[]
  fach: string
  lerngruppe: string
  woerter: number
  lernende: number
  sicherSchnitt: number
  testTermin: number | null
  status: string
  bis: number | null
  gaeste: number
  code?: string
  link?: string
}

const tag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE')

/** Nach dem Öffnen eines Kurses die Grammatik ins Bild holen – den Entwurf, sonst den Kasten (wartet kurz aufs Laden) */
function zeigeKursGrammatik(): void {
  const bis = Date.now() + 5000
  const versuch = (): void => {
    const el = document.querySelector<HTMLElement>('[data-grammatik-entwurf]') ?? document.querySelector<HTMLElement>('[data-kurs-grammatik]')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else if (Date.now() < bis) window.setTimeout(versuch, 100)
  }
  window.setTimeout(versuch, 50)
}

/** Die App „Vokabeltraining" (Gruppe Unterricht) */
/** Sprachenlernen (08.10.2026): Vokabel- und Grammatik-App in einem – je Gruppe ein Kurs */
export function SprachenlernenModule({ active }: { active: boolean }): React.JSX.Element | null {
  if (!active) return null
  return (
    <Container size="xl" py="md">
      <VokabelTraining />
    </Container>
  )
}

export default function VokabelTraining(): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [liste, setListe] = useState<ZuweisungKurz[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  const [filter, setFilter] = useState<'offen' | 'beendet'>('offen')
  const [grammatikOffen, setGrammatikOffen] = useState<string | null>(null)
  // Neu öffnen erzwingen (gleicher Kurs, aber z. B. jetzt mit aufgeklappter Grammatik)
  const [oeffnung, setOeffnung] = useState(0)
  // Reiter der Kursseite beim Öffnen (09.10.2026: „Kopf + Reiter") – „g:<id>" und Grammatik-Aufträge öffnen „Grammatik"
  const [startReiter, setStartReiter] = useState<KursReiter | undefined>(undefined)
  /*
   * openDocument('sprachenlernen', id) – Kurs; „g:<id>" = Grammatik (öffnet den Kurs und darin das Grammatik-Fenster);
   * Kennungen der Hintergrund-Aufträge siehe kurs/auftragsZiel.ts (09.10.2026). Unbekanntes oder nicht Ladbares führt
   * still zur Übersicht – nie eine Fehlermeldung.
   */
  // Erstes Öffnen in der Sitzung über die Leiste (09.10.2026, shared/sitzung.ts): die Kursübersicht
  useUebersichtZeiger('sprachenlernen', () => {
    setGewaehlt(null)
    setGrammatikOffen(null)
    setNeu(false)
  })
  useDokumentOeffner('sprachenlernen', async (docId) => {
    const ziel = sprachenlernenZiel(docId)
    const zurUebersicht = (): void => (setGewaehlt(null), setGrammatikOffen(null))
    try {
      if (ziel.art === 'uebersicht') return zurUebersicht()
      if (ziel.art === 'kurs' || ziel.art === 'kursGrammatik') {
        const id = ziel.art === 'kurs' ? ziel.id : ziel.vokId
        const kurse = (await holen<{ zuweisungen: { id: string }[] }>('/server/vokabeln')).zuweisungen
        if (!kurse.some((k) => k.id === id)) return zurUebersicht()
        setStartReiter(ziel.art === 'kursGrammatik' ? 'grammatik' : undefined)
        if (ziel.art === 'kursGrammatik') {
          // Die Grammatik des Kurses zeigen – dort steht der Entwurf
          setOeffnung((n) => n + 1)
          zeigeKursGrammatik()
        }
        setGrammatikOffen(null)
        return setGewaehlt(id)
      }
      const gid = ziel.gid
      const finde = async (): Promise<string | undefined> =>
        (await holen<{ zuweisungen: { id: string; vokId?: string }[] }>('/server/grammatik')).zuweisungen.find((x) => x.id === gid)?.vokId
      let vokId = await finde()
      if (!vokId) {
        // Noch ohne Kurs: die Liste legt ihn an (Überführung) – dann erneut nachsehen
        await holen('/server/vokabeln')
        vokId = await finde()
      }
      if (!vokId) return zurUebersicht()
      setGrammatikOffen(gid)
      setStartReiter('grammatik')
      setOeffnung((n) => n + 1)
      setGewaehlt(vokId)
    } catch {
      zurUebersicht()
    }
  })
  const [suche, setSuche] = useState('')
  const [umbenennen, setUmbenennen] = useState<{ id: string; text: string; standard: string } | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: ZuweisungKurz[] }>('/server/vokabeln').then(
        (d) => setListe(d.zuweisungen),
        (e: unknown) => notifyError(e)
      ),
    []
  )
  useEffect(laden, [laden])
  if (gewaehlt)
    return (
      <KursSeite
        key={`${gewaehlt}-${oeffnung}`}
        kursId={gewaehlt}
        onZurueck={() => (setGewaehlt(null), setGrammatikOffen(null), setStartReiter(undefined), laden())}
        startReiter={startReiter}
        grammatikOffen={grammatikOffen}
        setGrammatikOffen={setGrammatikOffen}
      />
    )
  const q = suche.trim().toLowerCase()
  const sichtbar = (liste ?? []).filter(
    (z) => z.status === filter && (!q || `${z.ueberschrift ?? ''} ${z.titel} ${z.fach} ${z.lerngruppe}`.toLowerCase().includes(q))
  )
  return (
    <Stack data-vokabeltraining>
      {/* Gemeinsamer Kopf (Phase 6a): Filter in der zweiten Zeile */}
      <AppKopf
        beschreibung="Vokabeln und Grammatik je Gruppe als Kurs – für eine Lerngruppe, einzelne Lernende oder per Code. Geübt wird in der Lern-App; hier stehen Lernstand, Stärken und Schwächen."
        suche={<ListenSuche wert={suche} setzen={setSuche} platzhalter="Titel, Fach, Lerngruppe …" />}
        hauptknopf={
          <Button leftSection={<IconPlus size={16} />} radius="md" color={farbe} onClick={() => setNeu(true)} data-vokabeln-freigeben>
            Neuer Kurs
          </Button>
        }
        links={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            data={[
              { value: 'offen', label: `Laufend${liste ? ` (${liste.filter((z) => z.status === 'offen').length})` : ''}` },
              { value: 'beendet', label: `Abgeschlossen${liste ? ` (${liste.filter((z) => z.status !== 'offen').length})` : ''}` }
            ]}
          />
        }
      />
      {!liste && <Loader size="sm" />}
      {liste && sichtbar.length === 0 && <Text c="dimmed">{filter === 'offen' ? 'Gerade läuft kein Vokabeltraining.' : 'Nichts abgeschlossen.'}</Text>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {sichtbar.map((z) => (
          <Card key={z.id} withBorder style={{ cursor: 'pointer' }} onClick={() => (setStartReiter(undefined), setGewaehlt(z.id))} data-vokabel-zuweisung={z.id}>
            <Group justify="space-between" wrap="nowrap">
              <LernstandSymbol
                faecher={z.faecher ?? []}
                art={z.symbol ?? 'verlauf'}
                fach={z.fach}
                umschalten={() =>
                  void senden(`/server/vokabeln/${z.id}/symbol`, { art: z.symbol === 'farbe' ? 'verlauf' : 'farbe' }).then(laden, (e: unknown) =>
                    notifyError(e)
                  )
                }
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap={4} wrap="nowrap">
                  <Text fw={700} truncate data-vokabel-ueberschrift>
                    {z.ueberschrift || (z.baende ? `Vokabeln · ${z.baende}` : z.titel)}
                  </Text>
                  <Tooltip label="Überschrift ändern">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="gray"
                      aria-label="Überschrift ändern"
                      onClick={(e) => (
                        e.stopPropagation(),
                        setUmbenennen({
                          id: z.id,
                          text: z.eigeneUeberschrift ? z.ueberschrift ?? '' : '',
                          standard: z.eigeneUeberschrift ? '' : z.ueberschrift ?? ''
                        })
                      )}
                      data-vokabel-umbenennen
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Text size="sm" c="dimmed">
                  {z.lerngruppe}
                  {z.baende ? ` · ${z.baende}` : ''} · {z.woerter} Wörter · {z.lernende} Lernende{z.gaeste ? ` (davon ${z.gaeste} per QR-Code)` : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  {[z.bis ? `Lernzeitraum bis ${tag(z.bis)}` : 'ohne Enddatum', z.testTermin ? `Test am ${tag(z.testTermin)}` : ''].filter(Boolean).join(' · ')}
                </Text>
              </div>
              <Stack gap={4} align="flex-end">
                <Badge variant="light" color="green">
                  {Math.round(z.sicherSchnitt * 100)} % sicher
                </Badge>
                {z.code && (
                  <Badge variant="light" color="blue" leftSection={<IconQrcode size={10} />}>
                    {z.code}
                  </Badge>
                )}
              </Stack>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      {neu && <Freigeben schliessen={() => (setNeu(false), laden())} />}
      <Modal opened={Boolean(umbenennen)} onClose={() => setUmbenennen(null)} title="Überschrift ändern">
        {umbenennen && (
          <Stack>
            <TextInput
              label="Überschrift"
              description={
                umbenennen.standard ? `Leer lassen für den Standard „${umbenennen.standard}“` : 'Leer lassen für den Standard „Jahr - Lerngruppe - Fach“'
              }
              value={umbenennen.text}
              onChange={(e) => setUmbenennen({ ...umbenennen, text: e.currentTarget.value })}
              data-autofocus
              data-umbenennen-eingabe
            />
            <Group justify="flex-end">
              <Button
                onClick={() =>
                  void senden(`/server/vokabeln/${umbenennen.id}/ueberschrift`, { text: umbenennen.text }).then(
                    () => (setUmbenennen(null), laden()),
                    (e: unknown) => notifyError(e)
                  )
                }
                data-umbenennen-speichern
              >
                Speichern
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

/** Gruppen + Mitglieder aller eigenen Lerngruppen (wie beim Zuweisen der Reihen) */
export function useLerngruppen(): { gruppen: { id: string; name: string }[]; alle: { gruppeId: string; gruppe: string; benutzer: string; name: string }[] } {
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [alle, setAlle] = useState<{ gruppeId: string; gruppe: string; benutzer: string; name: string }[]>([])
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(async (d) => {
      setGruppen(d.gruppen)
      const l = await Promise.all(
        d.gruppen.map((g) =>
          holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(g.id)}`).then(
            (m) => m.mitglieder.map((x) => ({ ...x, gruppeId: g.id, gruppe: g.name })),
            () => []
          )
        )
      )
      setAlle(l.flat())
    })
  }, [])
  return { gruppen, alle }
}

/** Sprachen eines Kurses nur mit Grammatik */
const KURS_SPRACHEN = [
  { value: 'en', label: 'Englisch' },
  { value: 'fr', label: 'Französisch' },
  { value: 'es', label: 'Spanisch' },
  { value: 'la', label: 'Latein' },
  { value: 'de', label: 'Deutsch' }
]

function Freigeben({ schliessen }: { schliessen: () => void }): React.JSX.Element {
  const [auswahl, setAuswahl] = useState<VokabelAuswahl | null>(null)
  const [titel, setTitel] = useState('')
  const [art, setArt] = useState<'gruppe' | 'einzeln' | 'code'>('gruppe')
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [termin, setTermin] = useState('')
  const [bis, setBis] = useState('')
  const [qr, setQr] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  // Passende Grammatik gleich mit freigeben (08.10.2026): nach den Vokabeln öffnet der Grammatik-Dialog, vorbelegt
  const [mitGrammatik, setMitGrammatik] = useState(false)
  const [grammatikDanach, setGrammatikDanach] = useState<GrammatikVorgabe | null>(null)
  // Kurs nur mit Grammatik (Sprachenlernen, 08.10.2026): Sprache wählen, Vokabeln später
  const [nurGrammatik, setNurGrammatik] = useState(false)
  const [sprache, setSprache] = useState<string | null>('en')
  // „Planen …" (09.10.2026): Abschnitte zu einem Zeitpunkt oder nacheinander freischalten
  const [plan, setPlan] = useState<PlanWahl>(planStart)
  const { gruppen } = useLerngruppen()
  useEffect(() => {
    if (auswahl) setTitel(auswahl.titel)
  }, [auswahl])
  const alleLernenden = useAlleLernenden()
  const los = async (): Promise<void> => {
    if (nurGrammatik) {
      if (!sprache) return
      setLaeuft(true)
      try {
        const name = KURS_SPRACHEN.find((s) => s.value === sprache)!.label
        const { id: neueId } = await senden<{ id: string }>('/server/vokabeln/freigeben', {
          titel: titel || name,
          sprache,
          fach: name,
          woerter: [],
          nurGrammatik: true,
          lerngruppeId: art === 'gruppe' ? gruppe : '',
          schueler: art === 'einzeln' ? einzelne : [],
          bis: art === 'gruppe' ? null : ausFeld(bis, '23:59:00'),
          gaeste: art === 'code' || qr
        })
        notifySuccess('Kurs angelegt – jetzt die Grammatik wählen.')
        return setGrammatikDanach({ vokId: neueId, titel: titel || name, sprache, klassenKurs: art === 'gruppe' })
      } catch (e) {
        notifyError(e, 'Kurs nicht angelegt')
      } finally {
        setLaeuft(false)
      }
      return
    }
    if (!auswahl) return
    setLaeuft(true)
    try {
      const mit = await mitBildern(auswahl)
      const verben = await verbenDerListe(mit)
      const { id: neueId } = await senden<{ id: string }>('/server/vokabeln/freigeben', {
        titel: titel || auswahl.titel,
        sprache: mit.sprache,
        fach: mit.fach,
        woerter: mit.woerter,
        lerngruppeId: art === 'gruppe' ? gruppe : '',
        schueler: art === 'einzeln' ? einzelne : [],
        testTermin: ausFeld(termin, '08:00:00'),
        bis: art === 'gruppe' ? null : ausFeld(bis, '23:59:00'),
        gaeste: art === 'code' || qr,
        ...(auswahl.quelle ? { quelle: auswahl.quelle } : {}),
        // Mehrere Abschnitte/Units (08.10.2026): je Abschnitt ein Teil im Kasten „Freigegebene Abschnitte"
        ...(auswahl.teile ? { teile: auswahl.teile } : {}),
        ...(verben ? { verben } : {}),
        ...planKoerper(plan, { abschnitte: auswahl.teile?.length ?? 1 })
      })
      planGeaendert()
      notifySuccess(
        planMeldung(plan, 'Vokabeln') ||
          (art === 'code' || qr
            ? 'Freigegeben – QR-Code und Code stehen beim Training (Knopf „QR-Code").'
            : 'Freigegeben – die Lernenden finden die Vokabeln in ihrer Lern-App.')
      )
      if (mitGrammatik && neueId) return setGrammatikDanach(grammatikVorgabe(neueId, titel || auswahl.titel, mit.sprache, auswahl.quelle, art === 'gruppe'))
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht freigegeben')
    } finally {
      setLaeuft(false)
    }
  }
  if (grammatikDanach) return <GrammatikFreigeben vorgabe={grammatikDanach} schliessen={schliessen} />
  return (
    <Modal opened onClose={schliessen} title="Neuer Kurs" size="lg">
      <Stack>
        <Switch
          label="Nur Grammatik (Vokabeln lassen sich später hinzufügen)"
          checked={nurGrammatik}
          onChange={(e) => setNurGrammatik(e.currentTarget.checked)}
          data-nur-grammatik
        />
        {nurGrammatik ? (
          <Select label="Sprache" data={KURS_SPRACHEN} value={sprache} onChange={setSprache} allowDeselect={false} data-kurs-sprache />
        ) : (
          <VokabelQuelle wahl={setAuswahl} />
        )}
        {auswahl && (
          <Text size="sm" c="dimmed">
            {auswahl.woerter.length} Wörter, davon {auswahl.woerter.filter((w) => w.example).length} mit Beispielsatz.
          </Text>
        )}
        <TextInput label="Titel (sehen die Lernenden)" value={titel} onChange={(e) => setTitel(e.currentTarget.value)} />
        <SegmentedControl
          value={art}
          onChange={(v) => (setArt(v as typeof art), setEinzelne([]))}
          data={[
            { value: 'gruppe', label: 'Lerngruppe' },
            { value: 'einzeln', label: 'Einzelne Lernende' },
            { value: 'code', label: 'Nur per QR-Code' }
          ]}
          data-vokabel-art
        />
        {art === 'code' ? (
          <Text size="sm" c="dimmed">
            Wer den QR-Code scannt oder den Code eingibt, lernt mit – Lernende mit Konto direkt, alle anderen mit Vorname und Anfangsbuchstabe. Gäste bekommen
            einen persönlichen Code, mit dem sie an anderen Tagen und Geräten weiterlernen.
          </Text>
        ) : art === 'gruppe' ? (
          <Select
            label="Lerngruppe"
            data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
            value={gruppe}
            onChange={setGruppe}
            placeholder="wählen …"
            data-vokabel-gruppe
          />
        ) : (
          <MultiSelect
            label="Lernende"
            data={alleLernenden.daten}
            value={einzelne}
            onChange={setEinzelne}
            searchable
            clearable
            nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
            placeholder="Namen suchen …"
          />
        )}
        {art !== 'code' && (
          <Switch
            label="Zusätzlich per QR-Code / Code zugänglich"
            description="Etwa für Lernende ohne Konto oder aus anderen Gruppen."
            checked={qr}
            onChange={(e) => setQr(e.currentTarget.checked)}
            data-vokabel-qr
          />
        )}
        <Group align="flex-start" grow>
          {/* Feste Klasse (09.10.2026, abgestimmt): der Kurs läuft mit der Klasse weiter – kein Enddatum */}
          {art !== 'gruppe' && (
            <div>
              <TextInput
                type="date"
                label="Lernzeitraum bis (optional)"
                description="Danach ist das Training abgeschlossen; ohne Datum läuft es, bis es beendet wird."
                value={bis}
                onChange={(e) => setBis(e.currentTarget.value)}
                data-vokabel-bis
              />
              <KalenderHinweis wert={bis} richtung="vor" verschieben={setBis} />
            </div>
          )}
          <div>
            <TextInput
              type="date"
              label="Testtermin (optional)"
              description="Bis dahin plant der Karteikasten so, dass jedes Wort vorher mehrmals verteilt geübt ist."
              value={termin}
              onChange={(e) => setTermin(e.currentTarget.value)}
              disabled={plan.modus === 'planen' && plan.testKoppeln}
            />
            {!(plan.modus === 'planen' && plan.testKoppeln) && <KalenderHinweis wert={termin} verschieben={setTermin} />}
          </div>
        </Group>
        {!nurGrammatik && (
          <FreigabePlanen wert={plan} aendern={setPlan} abschnitte={auswahl?.teile?.map((t) => t.titel) ?? (auswahl ? [auswahl.titel] : undefined)} mitTest />
        )}
        {!nurGrammatik && (auswahl?.sprache === 'en' || auswahl?.sprache === 'la' || auswahl?.sprache === 'fr' || auswahl?.sprache === 'es') && (
          <Switch
            label="Passende Grammatik gleich mit freigeben"
            description="Danach öffnet sich die Grammatikauswahl – mit Band und Unit vorbelegt, für dieselben Lernenden."
            checked={mitGrammatik}
            onChange={(e) => setMitGrammatik(e.currentTarget.checked)}
            data-vokabel-mit-grammatik
          />
        )}
        <Group justify="flex-end" className="dialog-fuss">
          <Button
            loading={laeuft}
            disabled={(nurGrammatik ? !sprache : !auswahl?.woerter.length) || (art === 'gruppe' ? !gruppe : art === 'einzeln' ? !einzelne.length : false)}
            onClick={() => void los()}
            data-vokabeln-los
          >
            {nurGrammatik ? 'Kurs anlegen und Grammatik wählen' : planKnopf(plan, 'Freigeben')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
