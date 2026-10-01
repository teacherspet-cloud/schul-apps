import { Alert, Badge, Box, Button, Center, Checkbox, Chip, Group, Loader, Modal, ScrollArea, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { alleSeiten, auswahlHinweis, leseSeitenAngabe, schnellAuswahl, seitenText } from '../export/seitenAuswahl'

/**
 * Seitenauswahl für alle Programme (01.10.2026): dieselben drei Wege in der Druckvorschau und im
 * Speichern-Dialog –
 *  - Eingabefeld wie „1-4, 6" (auch „1–4", „6-", Leerzeichen; Fehler stehen am Feld),
 *  - Seitenbilder mit Häkchen zum Antippen (Maus oder Finger),
 *  - Schnellauswahl (Alle, nur Schülerseiten, nur Lösungen, nur Material, aktuelle Seite – je
 *    nachdem, was das Dokument enthält; die Teile kommen aus den Seitenmarken, export/seitenAuswahl.ts).
 */

/** Schnellauswahl und Eingabefeld; die Seitenbilder setzt der Aufrufer (Druckvorschau: groß, Dialog: Raster) */
export function SeitenAuswahlFelder({
  teile,
  value,
  onChange,
  onGueltig,
  aktuelleSeite,
  loesungsBegriff,
  label = 'Seiten'
}: {
  /** Teil je Seite (blatt, loesung, …) – die Länge ist die Seitenzahl */
  teile: (string | undefined)[]
  value: number[]
  onChange: (seiten: number[]) => void
  /** false, solange im Feld etwas Ungültiges steht */
  onGueltig?: (gueltig: boolean) => void
  aktuelleSeite?: number
  loesungsBegriff?: string
  label?: string
}): React.JSX.Element {
  const anzahl = teile.length
  const [text, setText] = useState(() => seitenText(value))
  const [fehler, setFehler] = useState<string | null>(null)
  // Eigene Eingabe nicht überschreiben, solange sie dieselben Seiten meint (z. B. „1 - 4" statt „1-4")
  const eigen = useRef(false)
  useEffect(() => {
    if (eigen.current) {
      eigen.current = false
      return
    }
    setText(seitenText(value))
    setFehler(null)
    onGueltig?.(true)
  }, [value.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const schnell = useMemo(() => schnellAuswahl(teile, { aktuelleSeite, loesungsBegriff }), [teile.join('|'), aktuelleSeite, loesungsBegriff]) // eslint-disable-line react-hooks/exhaustive-deps
  const gleich = (a: number[], b: number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])
  const aktiv = schnell.find((s) => gleich(s.seiten, value))?.id ?? null

  return (
    <Stack gap={6} data-seitenauswahl>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {schnell.length > 1 && (
        <Group gap={6}>
          {schnell.map((s) => (
            <Chip
              key={s.id}
              size="xs"
              checked={aktiv === s.id}
              onChange={() => onChange(s.seiten)}
              data-schnellwahl={s.id}
              disabled={!s.seiten.length}
            >
              {s.label}
            </Chip>
          ))}
        </Group>
      )}
      <TextInput
        size="sm"
        aria-label="Seitenangabe"
        placeholder={anzahl > 1 ? `z. B. 1-${Math.min(4, anzahl)}${anzahl > 5 ? ', 6' : ''}` : '1'}
        value={text}
        data-seitenangabe
        onChange={(e) => {
          const neu = e.currentTarget.value
          setText(neu)
          const r = leseSeitenAngabe(neu, anzahl)
          if (r.ok) {
            setFehler(null)
            onGueltig?.(true)
            eigen.current = true
            onChange(r.seiten)
          } else {
            setFehler(r.fehler)
            onGueltig?.(false)
          }
        }}
        onBlur={() => {
          if (!fehler) setText(seitenText(value))
        }}
        error={fehler}
      />
      <Text size="xs" c="dimmed" data-auswahl-hinweis>
        {fehler ? 'Gilt erst mit einer gültigen Angabe.' : auswahlHinweis(value, anzahl)}
      </Text>
    </Stack>
  )
}

/** Häkchen über einem Seitenbild – angetippt wird die ganze Seite */
export function SeitenHaken({ an }: { an: boolean }): React.JSX.Element {
  return (
    <Box
      aria-hidden
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 30,
        height: 30,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: an ? 'var(--mantine-primary-color-filled)' : 'rgba(255,255,255,0.92)',
        border: an ? 'none' : '2px solid var(--mantine-color-gray-5)',
        color: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
      }}
    >
      {an && <IconCheck size={18} stroke={3} />}
    </Box>
  )
}

/** Seite an- oder abwählen */
export const umschalten = (seiten: number[], seite: number): number[] =>
  seiten.includes(seite) ? seiten.filter((s) => s !== seite) : [...seiten, seite].sort((a, b) => a - b)

/** Raster kleiner Seitenbilder zum Antippen (Speichern-Dialog) */
export function SeitenRaster({
  bilder,
  value,
  onChange,
  nummern
}: {
  bilder: string[]
  value: number[]
  onChange: (seiten: number[]) => void
  /** Neue Seitenzahl je gewählter Seite („wird Seite 2") – optional */
  nummern?: Map<number, number>
}): React.JSX.Element {
  return (
    <SimpleGrid cols={{ base: 2, xs: 3, sm: 4 }} spacing="sm">
      {bilder.map((src, i) => {
        const seite = i + 1
        const an = value.includes(seite)
        return (
          <UnstyledButton
            key={i}
            onClick={() => onChange(umschalten(value, seite))}
            aria-pressed={an}
            aria-label={`Seite ${seite}${an ? ', gewählt' : ''}`}
            data-seitenbild={seite}
            style={{ position: 'relative', textAlign: 'center', touchAction: 'manipulation' }}
          >
            <img
              src={src}
              alt=""
              style={{
                width: '100%',
                display: 'block',
                background: '#fff',
                boxShadow: an ? '0 0 0 3px var(--mantine-primary-color-filled)' : '0 2px 8px rgba(0,0,0,0.18)',
                opacity: an ? 1 : 0.4,
                borderRadius: 2
              }}
            />
            <SeitenHaken an={an} />
            <Text size="xs" c={an ? undefined : 'dimmed'} mt={4}>
              Seite {seite}
              {an && nummern?.get(seite) !== undefined && nummern.get(seite) !== seite ? ` → ${nummern.get(seite)}` : ''}
            </Text>
          </UnstyledButton>
        )
      })}
    </SimpleGrid>
  )
}

// ---------- Schalter im Ausgabe-Dialog und Auswahl vor dem Speichern ----------

/** Ein Dokument, dessen Seiten gewählt werden können */
export interface SeitenDokument {
  /** Dateiname – Überschrift im Dialog */
  name: string
  /** Seitenbilder (Vorschau) – oder eine Funktion, die sie erst erzeugt */
  bilder: string[] | (() => Promise<string[]>)
  /** Teil je Seite (Schnellauswahl); fehlt, gibt es nur „Alle" */
  teile?: (string | undefined)[]
  /** Hinweis unter der Überschrift, z. B. zu Word */
  hinweis?: string
  loesungsBegriff?: string
}

interface Anfrage {
  dokumente: SeitenDokument[]
  fertig: (auswahl: number[][] | null) => void
}

interface SeitenWahlState {
  /** Im Ausgabe-Dialog angekreuzt: vor dem Speichern die Seiten wählen */
  gewuenscht: boolean
  anfrage: Anfrage | null
}

export const useSeitenWahl = create<SeitenWahlState>(() => ({ gewuenscht: false, anfrage: null }))

/**
 * Wurde im Ausgabe-Dialog „Nur bestimmte Seiten" angekreuzt? Liest den Wunsch und setzt ihn
 * zurück – er gilt für genau eine Ausgabe (shared/export/ausgabe.tsx).
 */
export function nimmSeitenWunsch(): boolean {
  const an = useSeitenWahl.getState().gewuenscht
  if (an) useSeitenWahl.setState({ gewuenscht: false })
  return an
}

/** Seiten der Dokumente wählen lassen; null = abgebrochen. Ergebnis je Dokument (1-basiert). */
export function frageSeitenWahl(dokumente: SeitenDokument[]): Promise<number[][] | null> {
  return new Promise((fertig) => useSeitenWahl.setState({ anfrage: { dokumente, fertig } }))
}

/**
 * Kästchen für die Ausgabe-Dialoge (PDF, Word, PNG). Beim Öffnen des Dialogs aus – die Wahl gilt
 * nur für die nächste Ausgabe. Gedruckt wird über die Druckvorschau, dort ist die Auswahl eingebaut.
 */
export function SeitenWahlSchalter({
  beschreibung,
  kompakt = false
}: {
  beschreibung?: string
  /** Neben Knöpfen (ohne Dialog): klein, die Erklärung als Tooltip */
  kompakt?: boolean
}): React.JSX.Element {
  const an = useSeitenWahl((s) => s.gewuenscht)
  // Gilt nur, solange der Dialog offen ist – auch ein abgebrochener Dialog hinterlässt nichts
  useEffect(() => {
    useSeitenWahl.setState({ gewuenscht: false })
    return () => useSeitenWahl.setState({ gewuenscht: false })
  }, [])
  const text = beschreibung ?? 'Vor dem Speichern erscheinen die Seiten zum Auswählen. Die Seitenzahlen werden für die Auswahl neu gezählt.'
  if (kompakt)
    return (
      <Tooltip label={text} multiline w={260} withArrow>
        <Checkbox
          size="xs"
          label="Nur bestimmte Seiten"
          checked={an}
          onChange={(e) => useSeitenWahl.setState({ gewuenscht: e.currentTarget.checked })}
          data-seitenwahl-schalter
        />
      </Tooltip>
    )
  return (
    <Checkbox
      label="Nur bestimmte Seiten"
      description={text}
      checked={an}
      onChange={(e) => useSeitenWahl.setState({ gewuenscht: e.currentTarget.checked })}
      data-seitenwahl-schalter
    />
  )
}

/** Ein Dokument im Auswahl-Dialog */
function DokumentWahl({
  dok,
  value,
  onChange,
  onBilder,
  onGueltig
}: {
  dok: SeitenDokument
  value: number[] | null
  onChange: (s: number[]) => void
  onBilder: (anzahl: number) => void
  onGueltig: (g: boolean) => void
}): React.JSX.Element {
  const [bilder, setBilder] = useState<string[] | null>(Array.isArray(dok.bilder) ? dok.bilder : null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    if (Array.isArray(dok.bilder)) {
      onBilder(dok.bilder.length)
      return
    }
    let weg = false
    dok
      .bilder()
      .then((b) => {
        if (weg) return
        setBilder(b)
        onBilder(b.length)
      })
      .catch((e: unknown) => !weg && setFehler(e instanceof Error ? e.message : String(e)))
    return () => {
      weg = true
    }
  }, [dok]) // eslint-disable-line react-hooks/exhaustive-deps
  const teile = bilder ? (dok.teile && dok.teile.length === bilder.length ? dok.teile : bilder.map(() => undefined)) : []
  return (
    <Stack gap="xs" data-seitenwahl-dokument={dok.name}>
      <Group gap="xs">
        <Text fw={600} size="sm">
          {dok.name}
        </Text>
        {bilder && (
          <Badge variant="light" size="sm">
            {bilder.length} {bilder.length === 1 ? 'Seite' : 'Seiten'}
          </Badge>
        )}
      </Group>
      {dok.hinweis && (
        <Text size="xs" c="dimmed">
          {dok.hinweis}
        </Text>
      )}
      {fehler ? (
        <Alert color="red">Die Seiten ließen sich nicht anzeigen: {fehler}</Alert>
      ) : !bilder || !value ? (
        <Center py="lg">
          <Loader size="sm" />
        </Center>
      ) : (
        <>
          <SeitenAuswahlFelder teile={teile} value={value} onChange={onChange} onGueltig={onGueltig} loesungsBegriff={dok.loesungsBegriff} />
          <SeitenRaster bilder={bilder} value={value} onChange={onChange} />
        </>
      )}
    </Stack>
  )
}

/** Der Auswahl-Dialog vor dem Speichern – einmal in der Oberfläche eingehängt (main.tsx) */
export function SeitenWahlHost(): React.JSX.Element | null {
  const anfrage = useSeitenWahl((s) => s.anfrage)
  const [auswahl, setAuswahl] = useState<(number[] | null)[]>([])
  const [ungueltig, setUngueltig] = useState<Set<number>>(new Set())
  useEffect(() => {
    setAuswahl(anfrage ? anfrage.dokumente.map(() => null) : [])
    setUngueltig(new Set())
  }, [anfrage])
  if (!anfrage) return null
  const schliessen = (ergebnis: number[][] | null): void => {
    useSeitenWahl.setState({ anfrage: null })
    anfrage.fertig(ergebnis)
  }
  const bereit = auswahl.length === anfrage.dokumente.length && auswahl.every((a) => a !== null)
  const gesamt = auswahl.reduce((n, a) => n + (a?.length ?? 0), 0)
  return (
    <Modal opened onClose={() => schliessen(null)} title="Seiten auswählen" size="min(900px, 96vw)" zIndex={400} data-seitenwahl-dialog>
      <Stack gap="md">
        <ScrollArea.Autosize mah="68vh" type="auto" offsetScrollbars>
          <Stack gap="xl">
            {anfrage.dokumente.map((dok, i) => (
              <DokumentWahl
                key={i}
                dok={dok}
                value={auswahl[i] ?? null}
                onBilder={(n) => setAuswahl((a) => a.map((x, j) => (j === i ? (x ?? alleSeiten(n)) : x)))}
                onChange={(s) => setAuswahl((a) => a.map((x, j) => (j === i ? s : x)))}
                onGueltig={(g) =>
                  setUngueltig((u) => {
                    const neu = new Set(u)
                    if (g) neu.delete(i)
                    else neu.add(i)
                    return neu
                  })
                }
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        {anfrage.dokumente.length > 1 && (
          <Text size="xs" c="dimmed">
            Ein Dokument ganz ohne Seiten wird nicht gespeichert.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => schliessen(null)}>
            Abbrechen
          </Button>
          <Button disabled={!bereit || gesamt === 0 || ungueltig.size > 0} onClick={() => schliessen(auswahl.map((a) => a ?? []))} data-seitenwahl-ok>
            Speichern
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
