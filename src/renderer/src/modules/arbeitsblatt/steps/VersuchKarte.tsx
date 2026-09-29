import { Alert, Anchor, Badge, Button, Card, Checkbox, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, Title } from '@mantine/core'
import { IconAlertTriangle, IconFlask, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import DropZone from '../../../shared/components/DropZone'
import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { notifyError } from '../../../shared/util'
import { useAppSettings } from '../../../shared/settingsStore'
import {
  abschnittTitel,
  abschnittVorschlag,
  ALLE_ABSCHNITTE,
  ARTEN,
  artenFuer,
  artInfo,
  GESTIS_URL,
  GHS,
  SCHUTZMASSNAHMEN,
  SICHERHEIT_HINWEIS,
  STILE,
  STUFEN,
  versuchVorgabe,
  type VersuchLerngruppe
} from '../didactics/protokoll'
import type { AbschnittId, ProtokollArt, ProtokollStil, ProtokollStufe, VersuchDaten, VersuchSetup } from '../model/protokoll'

const liste = (xs: string[]): string => xs.join('\n')
const zeilen = (s: string): string[] =>
  s
    .split('\n')
    .map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean)

/**
 * Karte „Versuch" im ersten Schritt (29.09.2026, Wunsch der Lehrkraft) – für Fächer mit
 * Versuchen, Messungen und Beobachtungen. Der Versuch kommt von der KI, aus einer Beschreibung
 * oder aus einer hineingezogenen Versuchsanleitung; er wird vor dem Planen ausgearbeitet (auf
 * Wunsch schon hier, zum Prüfen) und als Protokoll in das Blatt gesetzt.
 *
 * Gemeinsam für Arbeitsblatt, Lernzielkontrolle und Klassenarbeit: Die Programme geben die
 * Lerngruppe, die Einstellung und den Weg zum Ausarbeiten (Hintergrund-Auftrag) hinein.
 */
export default function VersuchKarte({
  lerngruppe: meta,
  versuch: v,
  patchVersuch,
  ausarbeiten,
  pruefung = false
}: {
  lerngruppe: VersuchLerngruppe
  versuch: VersuchSetup | undefined
  patchVersuch: (v: VersuchSetup | undefined) => void
  /** „Versuch jetzt ausarbeiten" – fehlt es, entsteht der Versuch erst beim Erstellen */
  ausarbeiten?: () => void
  /** Lernzielkontrolle/Klassenarbeit: Hinweis auf die Aufgabe „protokollieren" und fehlende Lernhilfen */
  pruefung?: boolean
}): React.JSX.Element {
  const fachschaft = useAppSettings((s) => s.settings.protokollStil)
  const [lese, setLese] = useState<string | null>(null)
  const set = (p: Partial<VersuchSetup>): void => patchVersuch({ ...(v ?? versuchVorgabe(meta, fachschaft)), ...p })
  const setDaten = (p: Partial<VersuchDaten>): void => v?.daten && set({ daten: { ...v.daten, ...p } })
  const arten = artenFuer(meta.subjectId, meta.grade)
  const abschnitte = v?.abschnitte ?? (v ? abschnittVorschlag(v.art, meta.subjectId, meta.grade) : [])

  const dateienLesen = async (files: File[]): Promise<void> => {
    try {
      const gelesen: HochladeInhalt[] = []
      for (const f of files) {
        setLese(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (m) => setLese(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 4 })
        gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, kind: c.kind, pageImages: c.pageImages })
      }
      setLese(null)
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      set({ quelle: 'datei', anleitung: geprueft.map((g) => ({ fileName: g.fileName, text: g.text, ...(g.pageImages?.length ? { pageImages: g.pageImages } : {}) })), daten: undefined })
    } catch (e) {
      notifyError(e, 'Die Anleitung konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  return (
    <Card withBorder data-versuch-karte>
      <Checkbox
        label={
          <Group gap={6}>
            <IconFlask size={16} />
            <span>Versuch mit Protokoll</span>
          </Group>
        }
        description={
          pruefung
            ? 'Eine Aufgabe „Protokolliere …" mit Punkten, dahinter die Protokollvorlage als Antwortfläche – ohne Leitfragen und Satzanfänge (außer mit Nachteilsausgleich).'
            : 'Das Blatt entsteht rund um einen Versuch, eine Messung oder Beobachtung – mit Protokollvorlage, Checkliste und Musterprotokoll.'
        }
        checked={Boolean(v?.aktiv)}
        onChange={(e) => patchVersuch(e.currentTarget.checked ? { ...(v ?? versuchVorgabe(meta, fachschaft)), aktiv: true } : v ? { ...v, aktiv: false } : undefined)}
        data-versuch-an
      />
      {v?.aktiv && (
        <Stack gap="sm" mt="sm">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
            <Select
              size="xs"
              label="Art"
              data={[...arten, ...ARTEN.map((a) => a.id).filter((a) => !arten.includes(a))].map((a) => ({ value: a, label: artInfo(a).label }))}
              value={v.art}
              onChange={(x) => x && set({ art: x as ProtokollArt, abschnitte: undefined })}
              allowDeselect={false}
            />
            <Select
              size="xs"
              label="Struktur"
              data={STUFEN.map((s) => ({ value: s.id, label: s.label }))}
              value={v.stufe}
              onChange={(x) => x && set({ stufe: x as ProtokollStufe })}
              allowDeselect={false}
            />
            <Select
              size="xs"
              label="Zeitform"
              data={STILE.map((s) => ({ value: s.id, label: s.label }))}
              value={v.stil}
              onChange={(x) => x && set({ stil: x as ProtokollStil })}
              allowDeselect={false}
            />
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            {artInfo(v.art).beschreibung}. {STUFEN.find((s) => s.id === v.stufe)?.beschreibung}. {STILE.find((s) => s.id === v.stil)?.beispiel}
            {artInfo(v.art).abgeleitet ? ' – Für diese Art gibt es keine eigene Norm; die Gliederung ist aus dem Versuchsprotokoll abgeleitet.' : ''}
          </Text>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Woher kommt der Versuch?
            </Text>
            <SegmentedControl
              size="xs"
              value={v.quelle}
              onChange={(x) => set({ quelle: x as VersuchSetup['quelle'], daten: undefined })}
              data={[
                { value: 'ki', label: 'Vorschlag der KI' },
                { value: 'beschreibung', label: 'Eigene Beschreibung' },
                { value: 'datei', label: 'Anleitung hineinziehen' }
              ]}
            />
          </div>
          {v.quelle === 'datei' ? (
            <>
              <DropZone
                onFiles={(f) => void dateienLesen(f)}
                accept={MATERIAL_ACCEPT}
                title={lese ?? 'Versuchsanleitung hierher ziehen'}
                hint="Foto, Scan, PDF oder Word aus Schulbuch oder Sammlung – die KI übernimmt Material und Durchführung wörtlich."
                loading={Boolean(lese)}
                minHeight={60}
              />
              {v.anleitung?.length ? (
                <Text size="xs" c="dimmed">
                  Gelesen: {v.anleitung.map((a) => a.fileName).join(', ')}
                </Text>
              ) : null}
            </>
          ) : (
            <Textarea
              size="xs"
              label={v.quelle === 'ki' ? 'Wunsch zum Versuch (optional)' : 'Beschreibung des Versuchs'}
              placeholder={v.quelle === 'ki' ? 'z. B. Schülerversuch, ohne Gasbrenner' : 'Titel, Material, Durchführung in Stichpunkten'}
              autosize
              minRows={2}
              value={v.beschreibung}
              onChange={(e) => set({ beschreibung: e.currentTarget.value })}
            />
          )}
          <Select
            size="xs"
            label="Abschnitte des Protokolls"
            description={`Vorschlag für ${meta.subjectLabel}, Klasse ${meta.grade}: ${abschnitte.map((id) => abschnittTitel(id, v.art)).join(', ')}`}
            data={[{ value: 'vorschlag', label: 'Vorschlag übernehmen' }, ...ALLE_ABSCHNITTE.filter((id) => !abschnitte.includes(id)).map((id) => ({ value: id, label: `+ ${abschnittTitel(id, v.art)}` })), ...abschnitte.map((id) => ({ value: `-${id}`, label: `− ${abschnittTitel(id, v.art)}` }))]}
            value={null}
            placeholder="Abschnitt hinzufügen oder entfernen …"
            onChange={(x) => {
              if (!x) return
              if (x === 'vorschlag') return set({ abschnitte: undefined })
              const neu = x.startsWith('-') ? abschnitte.filter((id) => id !== x.slice(1)) : [...abschnitte, x as AbschnittId]
              set({ abschnitte: ALLE_ABSCHNITTE.filter((id) => neu.includes(id)) })
            }}
          />
          <Group gap="md">
            <Checkbox size="xs" label="Checkliste für die Lernenden" checked={v.checkliste} onChange={(e) => set({ checkliste: e.currentTarget.checked })} />
            <Checkbox size="xs" label="Bewertungsraster und Musterprotokoll im Lösungsteil" checked={v.raster} onChange={(e) => set({ raster: e.currentTarget.checked })} />
          </Group>
          {!v.daten ? (
            ausarbeiten ? (
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconSparkles size={14} />}
                  disabled={!meta.topic.trim() && v.quelle === 'ki'}
                  onClick={ausarbeiten}
                  data-versuch-ausarbeiten
                >
                  Versuch jetzt ausarbeiten
                </Button>
                <Text size="xs" c="dimmed">
                  {pruefung ? 'Sonst geschieht das beim Erstellen.' : 'Sonst geschieht das beim Planen der Gliederung.'}
                </Text>
              </Group>
            ) : null
          ) : (
            <VersuchVorschau daten={v.daten} setDaten={setDaten} verwerfen={() => set({ daten: undefined })} />
          )}
        </Stack>
      )}
    </Card>
  )
}

/** Der ausgearbeitete Versuch zum Prüfen und Bearbeiten */
function VersuchVorschau({
  daten: d,
  setDaten,
  verwerfen
}: {
  daten: VersuchDaten
  setDaten: (p: Partial<VersuchDaten>) => void
  verwerfen: () => void
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  return (
    <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)" data-versuch-vorschau>
      <Group justify="space-between" mb={4}>
        <Title order={5}>{d.titel}</Title>
        <Group gap={4}>
          <Button size="compact-xs" variant="subtle" onClick={() => setOffen((x) => !x)}>
            {offen ? 'Zuklappen' : 'Bearbeiten'}
          </Button>
          <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={verwerfen}>
            Neu ausarbeiten
          </Button>
        </Group>
      </Group>
      <Text size="xs">
        <b>Frage:</b> {d.frage}
      </Text>
      {d.chemikalien.length > 0 && (
        <Group gap={4} mt={4}>
          {d.chemikalien.map((c, i) => (
            <Badge key={i} size="xs" variant="light" color="orange">
              {c.name}
              {c.ghs.length ? ` · ${c.ghs.map((g) => GHS.find((x) => x.id === g)?.bedeutung ?? g).join(', ')}` : ''}
            </Badge>
          ))}
        </Group>
      )}
      {d.sicherheitZuPruefen && (d.chemikalien.length > 0 || d.schutz.length > 0) && (
        <Alert color="orange" variant="light" p={6} mt={6} icon={<IconAlertTriangle size={14} />}>
          <Text size="xs">
            {SICHERHEIT_HINWEIS}{' '}
            <Anchor size="xs" href={GESTIS_URL} target="_blank">
              GESTIS-Stoffdatenbank
            </Anchor>
          </Text>
          <Button size="compact-xs" variant="light" color="teal" mt={4} onClick={() => setDaten({ sicherheitZuPruefen: false })}>
            Sicherheitsangaben geprüft
          </Button>
        </Alert>
      )}
      {d.lehrkraft && (
        <Text size="xs" c="dimmed" mt={4}>
          Für die Lehrkraft: {d.lehrkraft}
        </Text>
      )}
      {offen && (
        <Stack gap={4} mt="xs">
          <Textarea size="xs" label="Fragestellung" autosize value={d.frage} onChange={(e) => setDaten({ frage: e.currentTarget.value })} />
          <Textarea size="xs" label="Material und Geräte (eine Zeile je Eintrag)" autosize value={liste(d.geraete)} onChange={(e) => setDaten({ geraete: zeilen(e.currentTarget.value) })} />
          <Textarea size="xs" label="Durchführung (ein Schritt je Zeile)" autosize value={liste(d.durchfuehrung)} onChange={(e) => setDaten({ durchfuehrung: zeilen(e.currentTarget.value) })} />
          <Select
            size="xs"
            label="Schutzmaßnahmen"
            data={SCHUTZMASSNAHMEN.map((s) => ({ value: s.id, label: `${d.schutz.includes(s.id) ? '✓ ' : ''}${s.label}` }))}
            value={null}
            placeholder="Anklicken zum An- und Abwählen"
            onChange={(x) => x && setDaten({ schutz: d.schutz.includes(x) ? d.schutz.filter((s) => s !== x) : [...d.schutz, x] })}
          />
          <Textarea size="xs" label="Erwartete Beobachtung" autosize value={d.beobachtung} onChange={(e) => setDaten({ beobachtung: e.currentTarget.value })} />
          <Textarea size="xs" label="Deutung" autosize value={d.deutung} onChange={(e) => setDaten({ deutung: e.currentTarget.value })} />
          <Textarea size="xs" label="Gleichung / Formel" autosize value={d.gleichung ?? ''} onChange={(e) => setDaten({ gleichung: e.currentTarget.value })} />
          <Textarea size="xs" label="Ergebnis" autosize value={d.ergebnis} onChange={(e) => setDaten({ ergebnis: e.currentTarget.value })} />
          <Textarea size="xs" label="Entsorgung" autosize value={d.entsorgung ?? ''} onChange={(e) => setDaten({ entsorgung: e.currentTarget.value })} />
        </Stack>
      )}
    </Card>
  )
}
