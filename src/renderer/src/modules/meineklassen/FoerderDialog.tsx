/**
 * „Förder- und Fordermaterial erstellen" (12.10.2026, Entscheidungen der Lehrkraft) – der Dialog in „Meine Klassen",
 * Reiter „Unterrichtsreihen & Blätter", rechts neben „Arbeitsblatt erstellen".
 *
 *  1. Für wen: ganze Lerngruppe, einzelne Lernende oder „nach Bedarf gruppieren". Bedarf von Hand je Kind (Auswahl aus
 *     den Förderbedarfen des Fachs + Freitext, „Fordern") – Pflicht, wo die App keine Lerndaten hat (Kunst, Musik, Sport …).
 *  2. Gruppen: Die App SCHLÄGT 2–4 Gruppen vor (shared/foerderGruppen.ts) mit Begründung und Daten je Kind; Kinder lassen
 *     sich per Ziehen oder Tippen verschieben; JEDE Gruppe muss einzeln bestätigt werden (kein „alle übernehmen" – Art. 22
 *     DSGVO, Profiling nur als Vorschlag). Je Gruppe: Förder- oder Forderblatt, Thema, „Dein Ziel", Bedarf, Niveau.
 *  3. Erstellen: Gruppen befristet auf dem Server (foerdern.ts), je Gruppe ein Blatt über die bestehende Erzeugung
 *     (klassenMaterial.ts, Hintergrundauftrag), auf Wunsch je Kind ein Bündel „Für dich" als Vorschlag; danach die
 *     Förderplan-Bausteine je Kind zum Kopieren bzw. als Word-Abschnitt.
 * Nachteilsausgleich (Gedächtnis der Rückmeldung, je Name auf diesem Gerät): Darstellung anpassen, Rechtschreibung kein
 * Förderziel – das Niveau bleibt. An die KI gehen nie Namen.
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  UnstyledButton
} from '@mantine/core'
import { IconArrowsMove, IconCopy, IconDownload, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { fachAusName } from '@shared/faecher'
import {
  alleBestaetigt,
  befundVon,
  gruppenVorschlagen,
  istForder,
  kindVerschieben,
  zielSatz,
  type GruppenVorschlag,
  type KindDaten
} from '@shared/foerderGruppen'
import { buendelAus, buendelHatInhalt, foerderplanHtml, foerderplanText } from '@shared/fuerDich'
import { useAppSettings } from '../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import {
  bedarfName,
  foerderbedarfeFuer,
  istRechtschreibBedarf,
  neutralerTitel,
  niveausFuer,
  niveauVorwahl,
  OHNE_LERNDATEN
} from '../arbeitsblatt/didactics/foerdernFordern'
import { ladeGedaechtnis } from '../rueckmeldung/ablagen'
import { gemerkterAusgleich } from '../rueckmeldung/nachteilsausgleich'
import { foerderBlattFuerKlasse } from './klassenMaterial'
import { ladeVorwissen } from '../../shared/lerngruppeVorwissen'
import { vorwissenFuerGruppe } from '@shared/vorwissenLerngruppe'

/** Maßnahmen, bei denen Rechtschreibung kein Förderziel ist (rueckmeldung/nachteilsausgleich.ts) */
const RS_MASSNAHMEN = ['ns-rechtschreibung', 'ns-rs-kennzeichnen', 'ns-sprachrichtigkeit', 'computer', 'diktiert', 'richtiges']
const FORDERN = 'Fordern (Vertiefung)'

type Modus = 'alle' | 'einzelne' | 'bedarf'
interface Gruppe extends GruppenVorschlag {
  thema: string
  niveau: string | null
  bestaetigt: boolean
}

/** Namen aus Texten entfernen, bevor etwas in die Erzeugung geht (Sicherheitsnetz zum Namensschutz des Servers) */
export function ohneNamen(text: string, namen: string[]): string {
  let t = text
  for (const n of namen.flatMap((x) => x.split(/\s+/)).filter((x) => x.length >= 3))
    t = t.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '…')
  return t
}

export function FoerderDialog({
  klasse,
  schliessen
}: {
  klasse: { id: string; name: string; fach: string; titel: string }
  schliessen: () => void
}): React.JSX.Element {
  const { settings } = useAppSettings()
  const land = settings.defaults?.stateId ?? 'NI'
  const schulform = settings.defaults?.schoolTypeId ?? 'gymnasium'
  const fachId = fachAusName(klasse.fach)?.id ?? 'anderes'
  const fachLabel = fachAusName(klasse.fach)?.label ?? klasse.fach
  const ohneDaten = OHNE_LERNDATEN.includes(fachId)
  const bedarfe = useMemo(() => foerderbedarfeFuer(fachId), [fachId])
  const niveaus = niveausFuer(land, schulform)
  const [schritt, setSchritt] = useState<'wer' | 'gruppen' | 'fertig'>('wer')
  const [modus, setModus] = useState<Modus>('bedarf')
  const [kinder, setKinder] = useState<KindDaten[] | null>(null)
  const [auswahl, setAuswahl] = useState<string[]>([])
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [mitBuendel, setMitBuendel] = useState(true)
  const [laeuft, setLaeuft] = useState(false)
  const [bausteine, setBausteine] = useState<{ name: string; text: string }[]>([])
  // Vorwissen der Lerngruppe (13.10.2026): vorausgefüllt, änderbar, geht gefiltert in jedes Blatt
  const [vorwissen, setVorwissen] = useState('')
  useEffect(() => {
    let aktiv = true
    ladeVorwissen(klasse.id).then(
      (a) => aktiv && setVorwissen(a.text),
      () => undefined
    )
    return () => {
      aktiv = false
    }
  }, [klasse.id])

  useEffect(() => {
    let aktiv = true
    void Promise.all([holen<{ kinder: KindDaten[] }>(`/server/foerdern/daten?gruppe=${encodeURIComponent(klasse.id)}`), ladeGedaechtnis()]).then(
      ([d, g]) => {
        if (!aktiv) return
        setKinder(
          d.kinder.map((k) => {
            const a = gemerkterAusgleich(g, k.name)
            return { ...k, vonHand: [], nachteilsausgleich: Boolean(a), ohneRechtschreibung: Boolean(a?.massnahmen.some((m) => RS_MASSNAHMEN.includes(m))) }
          })
        )
      },
      (e: unknown) => (notifyError(e), aktiv && setKinder([]))
    )
    return () => {
      aktiv = false
    }
  }, [klasse.id])

  const nachId = new Map((kinder ?? []).map((k) => [k.id, k]))
  const name = (id: string): string => nachId.get(id)?.name ?? ''
  const label = (id: string): string => bedarfName(fachId, id)
  const setzeKind = (id: string, p: Partial<KindDaten>): void => setKinder((l) => (l ?? []).map((k) => (k.id === id ? { ...k, ...p } : k)))
  // Bedarf von Hand: Auswahl als Anzeigename; „Fordern" als eigener Eintrag
  const handWerte = (k: KindDaten): string[] => (k.vonHand ?? []).map((h) => (h.startsWith('forder:') ? FORDERN : label(h)))
  const handSetzen = (k: KindDaten, werte: string[]): void =>
    setzeKind(k.id, {
      vonHand: werte.map((w) => (w === FORDERN ? 'forder:' : bedarfe.find((b) => b.label === w)?.value ?? w.trim().slice(0, 120))).filter(Boolean)
    })
  const ohneHandBedarf = ohneDaten && (kinder ?? []).some((k) => !(k.vonHand ?? []).length) && modus !== 'alle'

  const gruppeAus = (g: GruppenVorschlag): Gruppe => ({
    ...g,
    thema: g.art === 'forder' ? `Vertiefung: ${klasse.titel.split(' – ').pop() ?? fachLabel}` : g.schwerpunkt,
    niveau: niveauVorwahl(land, schulform, klasse.name, g.art),
    bestaetigt: false
  })

  const vorschlagen = (): void => {
    const alle = kinder ?? []
    let liste: GruppenVorschlag[]
    if (modus === 'bedarf') liste = gruppenVorschlagen(alle, { bedarfName: label })
    else {
      const wer = modus === 'alle' ? alle : alle.filter((k) => auswahl.includes(k.id))
      const einzeln = modus === 'einzelne'
      liste = (einzeln ? wer.map((k) => [k]) : [wer]).map((ks, i) => {
        const befunde = ks.map((k) => befundVon(k, label))
        const art = befunde.filter(istForder).length > ks.length / 2 ? 'forder' : 'foerder'
        // Häufigster Schwerpunkt der Gruppe
        const zaehl = new Map<string, { s: (typeof befunde)[number]['schwerpunkte'][number]; n: number }>()
        for (const b of befunde) for (const s of b.schwerpunkte.slice(0, 1)) zaehl.set(s.schluessel, { s, n: (zaehl.get(s.schluessel)?.n ?? 0) + 1 })
        const top = [...zaehl.values()].sort((a, b) => b.n - a.n)[0]?.s ?? null
        return {
          schluessel: einzeln ? `kind:${i}` : 'alle',
          art,
          // Kein Name im Titel – er landet als Kennzeichen am fertigen Blatt (Gerätespeicher)
          titel: einzeln ? `Einzeln ${i + 1}` : 'Ganze Lerngruppe',
          schwerpunkt: art === 'forder' ? 'Vertiefung und Transfer' : top?.text ?? 'Grundlagen sichern',
          begruendung: einzeln ? befunde[0]?.zeilen.join(' · ') ?? '' : `${ks.length} Kinder der Lerngruppe – ein gemeinsames Blatt.`,
          ziel: zielSatz(art, top),
          bedarfe: [...new Set(ks.flatMap((k) => (k.vonHand ?? []).filter((h) => !h.startsWith('forder:'))))],
          kinder: ks.map((k) => k.id)
        }
      })
    }
    setGruppen(liste.map(gruppeAus))
    setGewaehlt(null)
    setSchritt('gruppen')
  }

  // Jede Änderung an einer Gruppe hebt ihre Bestätigung auf – bestätigt wird der Stand, der erzeugt wird
  const aendern = (schluessel: string, p: Partial<Gruppe>): void =>
    setGruppen((l) => l.map((g) => (g.schluessel === schluessel ? { ...g, ...p, bestaetigt: p.bestaetigt ?? false } : g)))
  const verschieben = (kindId: string, nach: string): void => {
    const von = gruppen.find((g) => g.kinder.includes(kindId))?.schluessel
    if (!von || von === nach) return
    setGruppen((l) => kindVerschieben(l, kindId, nach).map((g) => (g.schluessel === von || g.schluessel === nach ? { ...g, bestaetigt: false } : g)))
    setGewaehlt(null)
  }
  const neueGruppe = (): void =>
    setGruppen((l) => [
      ...l,
      {
        schluessel: `neu:${Date.now()}`,
        art: 'foerder',
        titel: `Gruppe ${String.fromCharCode(65 + l.length)}`,
        schwerpunkt: 'Grundlagen sichern',
        begruendung: 'Von der Lehrkraft angelegt.',
        ziel: zielSatz('foerder', null),
        bedarfe: [],
        kinder: [],
        thema: 'Grundlagen sichern',
        niveau: niveauVorwahl(land, schulform, klasse.name, 'foerder'),
        bestaetigt: false
      }
    ])

  const erstellen = async (): Promise<void> => {
    const echte = gruppen.filter((g) => g.kinder.length)
    if (!alleBestaetigt(echte)) return
    setLaeuft(true)
    try {
      const { id: auftrag } = await senden<{ id: string }>('/server/foerdern/auftrag', {
        gruppe: klasse.id,
        gruppen: echte.map((g) => ({ schluessel: g.schluessel, titel: g.titel, art: g.art, kinder: g.kinder }))
      })
      const alleNamen = (kinder ?? []).map((k) => k.name)
      for (const g of echte) {
        const ks = g.kinder.map((id) => nachId.get(id)).filter((k): k is KindDaten => Boolean(k))
        const befunde = ks.map((k) => befundVon(k, label))
        // Befund der Gruppe ohne Namen: Schwerpunkte, wackelige Wörter, rote Grammatik, schwierige Aufgaben, nächste Schritte
        const zaehle = (xs: string[]): string[] => [...new Set(xs)].slice(0, 8)
        const befundZeilen = [
          `${ks.length} ${ks.length === 1 ? 'Kind' : 'Kinder'}`,
          zaehle(befunde.flatMap((b) => b.schwerpunkte.map((s) => s.text))).join(', '),
          zaehle(ks.flatMap((k) => (k.wackelig ?? []).map((w) => `${w.term} – ${w.translation}`))).length
            ? `wackelige Wörter: ${zaehle(ks.flatMap((k) => (k.wackelig ?? []).map((w) => `${w.term} – ${w.translation}`))).join('; ')}`
            : '',
          zaehle(ks.flatMap((k) => (k.grammatik ?? []).filter((x) => x.ampel === 'schwaeche').map((x) => x.titel))).length
            ? `Grammatik unsicher: ${zaehle(ks.flatMap((k) => (k.grammatik ?? []).filter((x) => x.ampel === 'schwaeche').map((x) => x.titel))).join(', ')}`
            : '',
          zaehle(ks.flatMap((k) => k.blaetter?.schwierig ?? [])).length
            ? `schwierige Aufgaben: ${zaehle(ks.flatMap((k) => k.blaetter?.schwierig ?? [])).join(' | ')}`
            : '',
          zaehle(ks.flatMap((k) => k.blaetter?.schritte ?? [])).length
            ? `Hinweise aus dem Feedback: ${zaehle(ks.flatMap((k) => k.blaetter?.schritte ?? [])).join(' | ')}`
            : ''
        ]
          .filter(Boolean)
          .map((z) => ohneNamen(z, alleNamen))
        foerderBlattFuerKlasse(klasse, {
          vorwissen: ohneNamen(vorwissenFuerGruppe(vorwissen, g.art), alleNamen),
          auftrag,
          schluessel: g.schluessel,
          gruppenTitel: g.titel,
          art: g.art,
          thema: ohneNamen(g.thema, alleNamen),
          ziel: ohneNamen(g.ziel, alleNamen),
          bedarfe: g.bedarfe.map((b) => ohneNamen(b, alleNamen)),
          befunde: befundZeilen,
          niveau: g.niveau,
          nachteilsausgleich: ks.some((k) => k.nachteilsausgleich),
          ohneRechtschreibung: ks.some((k) => k.ohneRechtschreibung)
        })
      }
      if (mitBuendel) {
        const buendel = echte.flatMap((g) =>
          g.kinder
            .map((id) => nachId.get(id))
            .filter((k): k is KindDaten => Boolean(k))
            .map((k) => ({ schueler: k.id, inhalt: buendelAus(k, g.ziel, fachLabel) }))
            .filter((b) => buendelHatInhalt(b.inhalt))
        )
        if (buendel.length) {
          await senden('/server/foerdern/buendel', { gruppe: klasse.id, buendel })
          // Liste „Bündel Für dich" in der Klasse neu laden (FoerderBuendel.tsx)
          window.dispatchEvent(new Event('foerder-buendel'))
        }
      }
      const heute = new Date()
      setBausteine(
        echte.flatMap((g) =>
          g.kinder
            .map((id) => nachId.get(id))
            .filter((k): k is KindDaten => Boolean(k))
            .map((k) => ({
              name: k.name,
              text: foerderplanText({
                name: k.name,
                klasse: klasse.name,
                fach: fachLabel,
                datum: heute,
                kind: k,
                art: g.art,
                ziel: g.ziel,
                massnahmen: [`Arbeitsblatt „${neutralerTitel(g.art, g.thema)}"`, ...(mitBuendel ? ['Übungsbündel „Für dich" (nach Freigabe)'] : [])],
                bedarfName: label
              })
            }))
        )
      )
      notifySuccess(
        `${echte.length} ${
          echte.length === 1 ? 'Blatt entsteht' : 'Blätter entstehen'
        } im Hintergrund – fertig stehen sie hier unter „Passendes Material" zum Freischalten.`
      )
      setSchritt('fertig')
    } catch (e) {
      notifyError(e, 'Nicht erstellt')
    } finally {
      setLaeuft(false)
    }
  }

  const alsWord = (): void => {
    const blob = new Blob([foerderplanHtml(bausteine.map((b) => b.text))], { type: 'application/msword' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Förderplan-Bausteine ${klasse.titel}.doc`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  const kopieren = (t: string): void =>
    void navigator.clipboard?.writeText(t).then(
      () => notifySuccess('Kopiert.'),
      (e: unknown) => notifyError(e)
    )

  return (
    <Modal opened onClose={schliessen} title={`Förder- und Fordermaterial – ${klasse.titel}`} size="90rem" data-foerder-dialog={schritt}>
      {!kinder ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : schritt === 'wer' ? (
        <Stack>
          <Text size="sm" c="dimmed">
            Vorschlag aus den Lerndaten dieser Lerngruppe – die Entscheidung liegt bei der Lehrkraft. Gruppen gelten nur für dieses Material (6 Wochen) und sind
            für Lernende unsichtbar. An die KI gehen nur Fach, Jahrgang, Ziel und Bedarf, nie Namen.
          </Text>
          <SegmentedControl
            value={modus}
            onChange={(v) => setModus(v as Modus)}
            data={[
              { value: 'alle', label: 'Ganze Lerngruppe' },
              { value: 'einzelne', label: 'Einzelne Lernende' },
              { value: 'bedarf', label: 'Nach Bedarf gruppieren' }
            ]}
            data-foerder-modus
          />
          {ohneDaten && (
            <Alert color="orange" data-foerder-ohne-daten>
              Für {fachLabel} hat die App keine Lerndaten – bitte den Bedarf je Kind von Hand eintragen (Auswahl oder eigener Text).
            </Alert>
          )}
          <Table striped highlightOnHover data-foerder-kinder>
            <Table.Thead>
              <Table.Tr>
                {modus === 'einzelne' && <Table.Th />}
                <Table.Th>Name</Table.Th>
                <Table.Th>Daten</Table.Th>
                <Table.Th miw={260}>Bedarf von Hand</Table.Th>
                <Table.Th>Nachteilsausgleich</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {kinder.map((k) => (
                <Table.Tr key={k.id} data-foerder-kind={k.id}>
                  {modus === 'einzelne' && (
                    <Table.Td>
                      <Checkbox
                        aria-label={`${k.name} wählen`}
                        checked={auswahl.includes(k.id)}
                        onChange={(e) => setAuswahl((a) => (e.currentTarget.checked ? [...a, k.id] : a.filter((x) => x !== k.id)))}
                        data-foerder-auswahl
                      />
                    </Table.Td>
                  )}
                  <Table.Td fw={600}>{k.name}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {befundVon(k, label).zeilen.join(' · ')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <TagsInput
                      size="xs"
                      data={[...bedarfe.map((b) => b.label), FORDERN]}
                      value={handWerte(k)}
                      onChange={(w) => handSetzen(k, w)}
                      placeholder="wählen oder eintippen"
                      clearable
                      data-foerder-bedarf
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Checkbox
                        size="xs"
                        label="Darstellung anpassen"
                        checked={Boolean(k.nachteilsausgleich)}
                        onChange={(e) => setzeKind(k.id, { nachteilsausgleich: e.currentTarget.checked })}
                        data-foerder-ausgleich
                      />
                      <Checkbox
                        size="xs"
                        label="Rechtschreibung kein Ziel"
                        checked={Boolean(k.ohneRechtschreibung)}
                        onChange={(e) => setzeKind(k.id, { ohneRechtschreibung: e.currentTarget.checked })}
                        data-foerder-ohne-rs
                      />
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {!kinder.length && <Alert color="gray">In dieser Lerngruppe sind noch keine Lernenden.</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button
              leftSection={<IconSparkles size={14} />}
              disabled={!kinder.length || (modus === 'einzelne' && !auswahl.length) || ohneHandBedarf}
              onClick={vorschlagen}
              data-foerder-weiter
            >
              {modus === 'bedarf' ? 'Gruppen vorschlagen' : 'Weiter'}
            </Button>
          </Group>
          {ohneHandBedarf && (
            <Text size="xs" c="orange" ta="right">
              Bitte für jedes Kind einen Bedarf eintragen.
            </Text>
          )}
        </Stack>
      ) : schritt === 'gruppen' ? (
        <Stack>
          <Text size="sm" c="dimmed">
            {modus === 'bedarf'
              ? 'Vorschlag der App nach ähnlichem Bedarf. Kinder per Ziehen verschieben – oder antippen und bei der Zielgruppe „Hierher" tippen. Jede Gruppe einzeln prüfen und bestätigen.'
              : 'Bitte prüfen und bestätigen.'}
          </Text>
          <Textarea
            size="xs"
            label="Vorwissen der Lerngruppe (gilt für alle Blätter)"
            description="Aus diesem und anderen Kursen dieser Lernenden – änderbar. Förderblätter setzen „Sicher: …“ nicht voraus, Forderblätter üben „Unsicher: …“ nicht."
            autosize
            minRows={1}
            maxRows={10}
            value={vorwissen}
            onChange={(e) => setVorwissen(e.currentTarget.value)}
            data-foerder-vorwissen
          />
          <SimpleGrid cols={{ base: 1, md: 2, xl: Math.min(4, Math.max(2, gruppen.length)) }}>
            {gruppen.map((g) => {
              const ks = g.kinder.map((id) => nachId.get(id)).filter((k): k is KindDaten => Boolean(k))
              const rsKonflikt = ks.some((k) => k.ohneRechtschreibung) && g.bedarfe.some(istRechtschreibBedarf)
              return (
                <Card
                  key={g.schluessel}
                  withBorder
                  radius="md"
                  padding="sm"
                  style={{ borderColor: g.bestaetigt ? 'var(--mantine-color-teal-6)' : undefined }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    verschieben(e.dataTransfer.getData('text/plain'), g.schluessel)
                  }}
                  data-foerder-gruppe={g.schluessel}
                  data-bestaetigt={g.bestaetigt ? '' : undefined}
                >
                  <Group justify="space-between" mb={4} wrap="nowrap">
                    <Text fw={700}>{g.titel}</Text>
                    <Badge color={g.art === 'forder' ? 'grape' : 'blue'} variant="light">
                      {g.art === 'forder' ? 'Forderblatt' : 'Förderblatt'}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" mb="xs" data-foerder-begruendung>
                    {g.begruendung}
                  </Text>
                  <Stack gap={6}>
                    <SegmentedControl
                      size="xs"
                      value={g.art}
                      onChange={(v) => {
                        const art = v as 'foerder' | 'forder'
                        // Ziel nur ersetzen, wenn es noch der Standardsatz der Forder-Gruppe ist bzw. zur Forder-Gruppe wird
                        const ziel = art === 'forder' ? zielSatz('forder', null) : g.ziel === zielSatz('forder', null) ? zielSatz('foerder', null) : g.ziel
                        aendern(g.schluessel, { art, ziel, niveau: niveauVorwahl(land, schulform, klasse.name, art) })
                      }}
                      data={[
                        { value: 'foerder', label: 'Förderblatt' },
                        { value: 'forder', label: 'Forderblatt' }
                      ]}
                      data-foerder-art
                    />
                    <TextInput
                      size="xs"
                      label="Thema"
                      value={g.thema}
                      onChange={(e) => aendern(g.schluessel, { thema: e.currentTarget.value })}
                      data-foerder-thema
                    />
                    <Textarea
                      size="xs"
                      label={'„Dein Ziel“ (ein Satz)'}
                      autosize
                      minRows={1}
                      value={g.ziel}
                      onChange={(e) => aendern(g.schluessel, { ziel: e.currentTarget.value })}
                      data-foerder-ziel
                    />
                    <TagsInput
                      size="xs"
                      label="Bedarf"
                      data={bedarfe.map((b) => b.label)}
                      value={g.bedarfe.map(label)}
                      onChange={(w) =>
                        aendern(g.schluessel, { bedarfe: w.map((x) => bedarfe.find((b) => b.label === x)?.value ?? x.trim().slice(0, 120)).filter(Boolean) })
                      }
                      placeholder="wählen oder eintippen"
                      data-foerder-gruppen-bedarf
                    />
                    {niveaus.length > 0 && (
                      <Select
                        size="xs"
                        label="Niveau (dezent auf dem Blatt)"
                        data={niveaus}
                        value={g.niveau}
                        onChange={(v) => aendern(g.schluessel, { niveau: v })}
                        clearable
                        placeholder="ohne"
                        comboboxProps={{ withinPortal: true }}
                        data-foerder-niveau
                      />
                    )}
                    {rsKonflikt && (
                      <Alert color="orange" p={6}>
                        <Text size="xs">
                          Für mindestens ein Kind ist Rechtschreibung kein Förderziel (Nachteilsausgleich) – ggf. in eine andere Gruppe verschieben.
                        </Text>
                      </Alert>
                    )}
                    <Text size="xs" fw={600} mt={4}>
                      {ks.length} {ks.length === 1 ? 'Kind' : 'Kinder'}
                    </Text>
                    {ks.map((k) => (
                      <Paper
                        key={k.id}
                        withBorder
                        p={6}
                        radius="sm"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', k.id)}
                        onClick={() => setGewaehlt((x) => (x === k.id ? null : k.id))}
                        style={{ cursor: 'grab', outline: gewaehlt === k.id ? '2px solid var(--mantine-color-blue-5)' : undefined }}
                        data-foerder-kind-karte={k.id}
                      >
                        <Group gap={6} wrap="nowrap">
                          <IconArrowsMove size={14} style={{ flex: 'none', opacity: 0.5 }} />
                          <Text size="sm" fw={600} style={{ flex: 1 }}>
                            {k.name}
                          </Text>
                          {k.nachteilsausgleich && (
                            <Badge size="xs" variant="light" color="gray">
                              Darstellung
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {befundVon(k, label).zeilen.join(' · ')}
                        </Text>
                      </Paper>
                    ))}
                    {gewaehlt && !g.kinder.includes(gewaehlt) && (
                      <Button size="xs" variant="light" onClick={() => verschieben(gewaehlt, g.schluessel)} data-foerder-hierher>
                        „{name(gewaehlt)}" hierher
                      </Button>
                    )}
                    <Group justify="space-between" mt={4}>
                      <Checkbox
                        label="Gruppe geprüft und bestätigt"
                        checked={g.bestaetigt}
                        disabled={!g.kinder.length || !g.ziel.trim() || !g.thema.trim()}
                        onChange={(e) => aendern(g.schluessel, { bestaetigt: e.currentTarget.checked })}
                        data-foerder-bestaetigen
                      />
                      {!g.kinder.length && (
                        <UnstyledButton
                          aria-label="Leere Gruppe entfernen"
                          onClick={() => setGruppen((l) => l.filter((x) => x.schluessel !== g.schluessel))}
                          data-foerder-gruppe-entfernen
                        >
                          <IconTrash size={16} />
                        </UnstyledButton>
                      )}
                    </Group>
                  </Stack>
                </Card>
              )
            })}
          </SimpleGrid>
          <Group justify="space-between">
            <Group gap="xs">
              <Button variant="subtle" size="xs" onClick={() => setSchritt('wer')}>
                Zurück
              </Button>
              {modus === 'bedarf' && (
                <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={neueGruppe} data-foerder-neue-gruppe>
                  Leere Gruppe
                </Button>
              )}
            </Group>
            <Group gap="sm">
              <Checkbox
                label={'Je Kind ein Übungsbündel „Für dich“ vorbereiten (Vorschlag – Lernende sehen es erst nach Freigabe)'}
                checked={mitBuendel}
                onChange={(e) => setMitBuendel(e.currentTarget.checked)}
                data-foerder-buendel
              />
              <Button
                leftSection={<IconSparkles size={14} />}
                loading={laeuft}
                disabled={!alleBestaetigt(gruppen)}
                onClick={() => void erstellen()}
                data-foerder-erstellen
              >
                {gruppen.filter((g) => g.kinder.length).length} {gruppen.filter((g) => g.kinder.length).length === 1 ? 'Blatt' : 'Blätter'} erstellen
              </Button>
            </Group>
          </Group>
          {!alleBestaetigt(gruppen) && (
            <Text size="xs" c="dimmed" ta="right" data-foerder-noch-offen>
              Noch nicht alle Gruppen bestätigt ({gruppen.filter((g) => g.kinder.length && g.bestaetigt).length} von{' '}
              {gruppen.filter((g) => g.kinder.length).length}).
            </Text>
          )}
        </Stack>
      ) : (
        <Stack data-foerder-fertig>
          <Alert color="teal">
            Die Blätter entstehen im Hintergrund und stehen fertig unter „Passendes Material" zum Ansehen und Freischalten – beim Freischalten sind die Kinder
            der Gruppe vorgewählt.{' '}
            {mitBuendel ? 'Die Bündel „Für dich" liegen als Vorschlag in der Liste darunter und gehen erst nach Freigabe an die Lernenden.' : ''}
          </Alert>
          <Group justify="space-between">
            <Text fw={700}>Förderplan-Bausteine</Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconCopy size={14} />}
                onClick={() => kopieren(bausteine.map((b) => b.text).join('\n\n'))}
                data-foerderplan-alle
              >
                Alle kopieren
              </Button>
              <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={alsWord} data-foerderplan-word>
                Als Word-Datei
              </Button>
            </Group>
          </Group>
          <Text size="xs" c="dimmed">
            Material ist eine Maßnahme, kein Förderplan – über den Förderplan entscheidet die Schule. Ergebnis später im Text ergänzen.
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {bausteine.map((b) => (
              <Card key={b.name} withBorder padding="sm" radius="md" data-foerderplan={b.name}>
                <Group justify="space-between" mb={4}>
                  <Text fw={600} size="sm">
                    {b.name}
                  </Text>
                  <Button size="compact-xs" variant="subtle" leftSection={<IconCopy size={12} />} onClick={() => kopieren(b.text)}>
                    Kopieren
                  </Button>
                </Group>
                <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                  {b.text}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
          <Group justify="flex-end">
            <Button onClick={schliessen} data-foerder-schliessen>
              Schließen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
