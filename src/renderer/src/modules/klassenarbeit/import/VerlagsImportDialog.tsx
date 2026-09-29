import { Alert, Badge, Button, Card, Checkbox, Group, Modal, ScrollArea, Select, Stack, Text } from '@mantine/core'
import { IconFileImport, IconInfoCircle } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import DropZone from '../../../shared/components/DropZone'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import { starteAuftrag } from '../../../shared/auftraege'
import { notifyError, notifySuccess } from '../../../shared/util'
import { plainText } from '../../../shared/richtext/parse'
import { stufenLabel } from '../../../shared/verstehen/stufen'
import { arbeitOffen, defaultExamName, legeArbeitAb } from '../library'
import type { Exam } from '../model/types'
import Rechtshinweis from './Rechtshinweis'
import { VERSTEHEN, type UebernahmeOptionen } from './bausteine'
import { fassungBAnfrage, fassungBAus, uebernehme, zielTeil, type Auswahl } from './uebernahme'
import { itemZahl, KOMPETENZ_NAMEN, zerlegenAnfrage, zerlegungAus, type GeleseneDatei, type ImportAufgabe, type Zerlegung } from './zerlegen'

/*
 * Das Ergebnis der Zerlegung je Arbeit – außerhalb des Dialogs gemerkt: Die Analyse läuft als
 * Hintergrund-Auftrag; wer den Dialog solange schließt, findet die Aufgabenliste beim nächsten
 * Öffnen wieder, statt das Material noch einmal schicken zu müssen.
 */
const useZerlegungen = create<{ je: Record<string, Zerlegung>; setze: (docId: string, z: Zerlegung | null) => void }>((set) => ({
  je: {},
  setze: (docId, z) =>
    set((s) => {
      const je = { ...s.je }
      if (z) je[docId] = z
      else delete je[docId]
      return { je }
    })
}))

interface Wahl {
  an: boolean
  teilId: string
}

/** Dateien lesen – Scans bleiben Bilder (die KI liest sie), Text wird Text. */
async function lies(files: File[], melde: (m: string | null) => void): Promise<GeleseneDatei[]> {
  const out: GeleseneDatei[] = []
  for (const f of files) {
    melde(`${f.name} wird gelesen …`)
    const c = await extractContent(f, (m) => melde(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 8 })
    out.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, pageImages: c.pageImages })
  }
  melde(null)
  return out
}

/**
 * „Aufgaben aus Material übernehmen" (29.09.2026): Verlagsmaterial hineinziehen, Rechtshinweis
 * bestätigen, von der KI zerlegen lassen, Aufgaben auswählen und übernehmen.
 */
export default function VerlagsImportDialog({ opened, onClose, exam, docId }: { opened: boolean; onClose: () => void; exam: Exam; docId: string }): React.JSX.Element {
  const zerlegung = useZerlegungen((s) => s.je[docId]) ?? null
  const setze = useZerlegungen((s) => s.setze)
  const [material, setMaterial] = useState<GeleseneDatei[]>([])
  const [loesung, setLoesung] = useState<GeleseneDatei[]>([])
  const [bestaetigt, setBestaetigt] = useState(false)
  const [lese, setLese] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [wahl, setWahl] = useState<Wahl[]>([])
  const [optionen, setOptionen] = useState<UebernahmeOptionen & { fassungB: boolean }>({ entwuerfe: true, stufen: true, fassungB: false })

  // Bestätigung gilt je Import: beim Öffnen immer wieder leer (Entscheidung der Lehrkraft)
  useEffect(() => {
    if (opened) setBestaetigt(false)
  }, [opened])

  // Neue Zerlegung: alles vorausgewählt, Teil nach Kompetenz vorgeschlagen
  useEffect(() => {
    if (!zerlegung) return
    setWahl(zerlegung.aufgaben.map((a) => ({ an: true, teilId: zielTeil(exam, a.kompetenz)?.id ?? '' })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zerlegung])

  const teile = exam.parts.map((p, i) => ({ value: p.id, label: `Teil ${i + 1}: ${p.label}` }))
  const titel = defaultExamName(exam)

  const dateienLesen = async (files: File[], ziel: 'material' | 'loesung'): Promise<void> => {
    try {
      const gelesen = await lies(files, setLese)
      if (ziel === 'material') setMaterial((m) => [...m, ...gelesen])
      else setLoesung((l) => [...l, ...gelesen])
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  const analysieren = async (): Promise<void> => {
    if (!material.length || !bestaetigt) return
    // Datenschutz (Namen ersetzen) wie bei jedem Hochladen – danach erst die KI
    const alle: (HochladeInhalt & { ziel: 'material' | 'loesung' })[] = [
      ...material.map((d) => ({ fileName: d.fileName, text: d.text, kind: d.text ? 'pdf' : 'image', pageImages: d.pageImages, ziel: 'material' as const })),
      ...loesung.map((d) => ({ fileName: d.fileName, text: d.text, kind: d.text ? 'pdf' : 'image', pageImages: d.pageImages, ziel: 'loesung' as const }))
    ]
    const geprueft = await pruefeHochladen(alle)
    if (!geprueft) return
    const eingabe = {
      meta: exam.meta,
      material: geprueft.filter((g) => g.ziel === 'material').map((g) => ({ fileName: g.fileName, text: g.text, pageImages: g.pageImages })),
      loesung: geprueft.filter((g) => g.ziel === 'loesung').map((g) => ({ fileName: g.fileName, text: g.text, pageImages: g.pageImages }))
    }
    setLaeuft(true)
    try {
      await starteAuftrag({
        moduleId: 'klassenarbeit',
        docId,
        titel,
        art: 'Material zerlegen',
        eingabe,
        istOffen: () => arbeitOffen(docId),
        sperrt: false,
        schluessel: 'verlagsimport',
        fehlerTitel: 'Das Material konnte nicht zerlegt werden',
        arbeit: async (e, k) => {
          k.melde('Die KI analysiert das Material und zerlegt es in Aufgaben …')
          const antwort = await k.ai<unknown>(zerlegenAnfrage({ meta: e.meta }, e.material, e.loesung))
          return zerlegungAus(
            antwort,
            e.material.map((d) => d.fileName)
          )
        },
        abschluss: (z) => `${z.aufgaben.length} Aufgaben erkannt – Auswahl unter „Aufgaben aus Material".`,
        ablegen: async (z) => setze(docId, z)
      })
    } finally {
      setLaeuft(false)
    }
  }

  const gewaehlt = (): Auswahl[] =>
    (zerlegung?.aufgaben ?? []).flatMap((aufgabe, i) => (wahl[i]?.an ? [{ aufgabe, teilId: wahl[i].teilId || exam.parts[0]?.id || '' }] : []))

  const uebernehmen = async (): Promise<void> => {
    const auswahl = gewaehlt()
    if (!auswahl.length) return
    const opt: UebernahmeOptionen = { entwuerfe: optionen.entwuerfe, stufen: optionen.stufen }
    if (!optionen.fassungB) {
      let hinweise: string[] = []
      // Auf den aktuellen Stand anwenden – ein Schritt für Strg+Z
      await legeArbeitAb(docId, exam, (aktuell) => {
        const r = uebernehme(aktuell, auswahl, opt)
        hinweise = r.hinweise
        return r.exam
      })
      notifySuccess([`${auswahl.length} Aufgaben übernommen.`, ...hinweise].join(' '))
      setze(docId, null)
      onClose()
      return
    }
    // B-Fassung: eine eigene Anfrage (neue Items zum selben Material)
    onClose()
    await starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: 'Aufgaben übernehmen (mit B-Fassung)',
      eingabe: { exam, auswahl },
      istOffen: () => arbeitOffen(docId),
      sperrt: false,
      schluessel: 'verlagsimport-b',
      fehlerTitel: 'Die B-Fassung konnte nicht erstellt werden',
      arbeit: async (e, k) => {
        k.melde('Die KI leitet eine gleichwertige B-Fassung ab …')
        const antwort = await k.ai<unknown>(
          fassungBAnfrage(
            e.exam,
            e.auswahl.map((a) => a.aufgabe),
            opt
          )
        )
        return fassungBAus(antwort, e.auswahl.length)
      },
      abschluss: () => `${auswahl.length} Aufgaben mit B-Fassung übernommen.`,
      ablegen: (b, e) =>
        legeArbeitAb(docId, e.exam, (aktuell) => {
          const { exam: next } = uebernehme(aktuell, e.auswahl, opt, b)
          return next
        })
    }).then((b) => b && setze(docId, null))
  }

  const zeile = (a: ImportAufgabe, i: number): React.JSX.Element => {
    const w = wahl[i] ?? { an: false, teilId: '' }
    const stufen = [a.stufe, ...a.teile.map((t) => t.stufe), ...a.antwort.statements.map((s) => s.stufe)].filter((s): s is 1 | 2 | 3 | 4 | 5 => Boolean(s))
    return (
      <Card key={i} withBorder padding="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Checkbox
            checked={w.an}
            onChange={(e) => {
              const an = e.currentTarget.checked
              setWahl((l) => l.map((x, k) => (k === i ? { ...x, an } : x)))
            }}
            label={
              <Group gap={6}>
                <Text fw={600} size="sm">
                  {[a.nummer, a.titel].filter(Boolean).join(' – ') || `Aufgabe ${i + 1}`}
                </Text>
                <Badge size="xs" variant="light">
                  {KOMPETENZ_NAMEN[a.kompetenz]}
                </Badge>
                <Badge size="xs" variant="outline" color="gray">
                  {itemZahl(a)} {itemZahl(a) === 1 ? 'Item' : 'Items'}
                </Badge>
                {a.punkte > 0 && (
                  <Badge size="xs" variant="outline" color={a.punkteQuelle === 'entwurf' ? 'orange' : 'gray'}>
                    {a.punkte} P.{a.punkteQuelle === 'entwurf' ? ' (Vorschlag)' : ''}
                  </Badge>
                )}
                {a.loesungQuelle === 'loesungsblatt' && (
                  <Badge size="xs" variant="light" color="teal">
                    Lösung aus Lösungsblatt
                  </Badge>
                )}
                {a.loesungQuelle === 'entwurf' && (
                  <Badge size="xs" variant="light" color="orange">
                    Erwartungshorizont: Entwurf
                  </Badge>
                )}
                {VERSTEHEN.includes(a.kompetenz) && stufen.length > 0 && (
                  <Badge size="xs" variant="light" color="grape">
                    {stufen.length === 1 ? stufenLabel(stufen[0]) : `Stufen ${Math.min(...stufen)}–${Math.max(...stufen)}`}
                  </Badge>
                )}
              </Group>
            }
          />
          <Select size="xs" w={220} data={teile} value={w.teilId || null} onChange={(v) => v && setWahl((l) => l.map((x, k) => (k === i ? { ...x, teilId: v } : x)))} aria-label="Teil der Arbeit" />
        </Group>
        <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
          {plainText(a.anweisung)}
          {a.material.length ? ` · Material: ${a.material.map((m) => m.titel || m.art).join(', ')}` : ''}
        </Text>
        {a.hinweis && (
          <Text size="xs" c="orange" mt={2}>
            {a.hinweis}
          </Text>
        )}
      </Card>
    )
  }

  const anzahlGewaehlt = wahl.filter((w) => w.an).length

  return (
    <Modal opened={opened} onClose={onClose} size="xl" title="Aufgaben aus Material übernehmen">
      <Stack gap="sm">
        {!zerlegung && (
          <>
            <Text size="sm" c="dimmed">
              Klassenarbeitsvorschläge, Testhefte oder Lehrerbände (PDF, Scan, Word) werden von der KI analysiert, sauber formatiert und in einzelne Aufgaben
              zerlegt. Danach werden die Aufgaben für die Arbeit ausgewählt.
            </Text>
            <DropZone onFiles={(f) => void dateienLesen(f, 'material')} accept={MATERIAL_ACCEPT} title="Material hierher ziehen" hint="PDF, Scan, Foto oder Word" loading={Boolean(lese)} minHeight={90} />
            {material.length > 0 && (
              <Group gap={6}>
                {material.map((d, i) => (
                  <Badge key={`${d.fileName}-${i}`} variant="light" rightSection={d.text ? '' : 'Scan'}>
                    {d.fileName}
                  </Badge>
                ))}
                <Button size="compact-xs" variant="subtle" onClick={() => setMaterial([])}>
                  leeren
                </Button>
              </Group>
            )}
            <DropZone
              onFiles={(f) => void dateienLesen(f, 'loesung')}
              accept={MATERIAL_ACCEPT}
              title="Lösungsblatt (optional)"
              hint="Die Lösungen werden den Aufgaben zugeordnet"
              loading={Boolean(lese)}
              minHeight={70}
            />
            {loesung.length > 0 && (
              <Group gap={6}>
                {loesung.map((d, i) => (
                  <Badge key={`${d.fileName}-${i}`} variant="light" color="teal">
                    {d.fileName}
                  </Badge>
                ))}
                <Button size="compact-xs" variant="subtle" onClick={() => setLoesung([])}>
                  leeren
                </Button>
              </Group>
            )}
            {lese && (
              <Text size="xs" c="dimmed">
                {lese}
              </Text>
            )}
            <Rechtshinweis bestaetigt={bestaetigt} onChange={setBestaetigt} />
            <Group justify="flex-end">
              <Button leftSection={<IconFileImport size={16} />} disabled={!material.length || !bestaetigt || laeuft} loading={laeuft} onClick={() => void analysieren()}>
                Material analysieren
              </Button>
            </Group>
            {laeuft && (
              <Text size="xs" c="dimmed">
                Die Analyse läuft im Hintergrund; das Fenster darf geschlossen werden – die Aufgabenliste steht beim nächsten Öffnen bereit.
              </Text>
            )}
          </>
        )}

        {zerlegung && (
          <>
            <Group justify="space-between">
              <Text size="sm">
                <b>{zerlegung.titel || zerlegung.dateien.join(', ')}</b> – {zerlegung.aufgaben.length} Aufgaben erkannt, {anzahlGewaehlt} ausgewählt.
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setze(docId, null)}>
                Anderes Material
              </Button>
            </Group>
            {zerlegung.unklar.length > 0 && (
              <Alert color="orange" variant="light" p="xs" icon={<IconInfoCircle size={16} />}>
                <Text size="xs">Nicht sicher übertragen: {zerlegung.unklar.join(' · ')}</Text>
              </Alert>
            )}
            <ScrollArea.Autosize mah={380}>
              <Stack gap={6}>{zerlegung.aufgaben.map(zeile)}</Stack>
            </ScrollArea.Autosize>
            <Card withBorder padding="xs">
              <Stack gap={6}>
                <Text size="xs" c="dimmed">
                  Inhalte werden wörtlich übernommen; nur das Layout folgt der App.
                </Text>
                <Checkbox
                  size="xs"
                  checked={optionen.entwuerfe}
                  onChange={(e) => {
                    const an = e.currentTarget.checked
                    setOptionen((o) => ({ ...o, entwuerfe: an }))
                  }}
                  label="Punkte und Erwartungshorizont ergänzen, wo das Material keine hat (als Entwurf markiert)"
                />
                <Checkbox
                  size="xs"
                  checked={optionen.stufen}
                  onChange={(e) => {
                    const an = e.currentTarget.checked
                    setOptionen((o) => ({ ...o, stufen: an }))
                  }}
                  label="Schwierigkeit einstufen (Stufe 1–5, nur im Erwartungshorizont sichtbar)"
                />
                <Checkbox
                  size="xs"
                  checked={optionen.fassungB}
                  onChange={(e) => {
                    const an = e.currentTarget.checked
                    setOptionen((o) => ({ ...o, fassungB: an }))
                  }}
                  label="Gleichwertige B-Fassung ableiten (eigene KI-Anfrage)"
                />
              </Stack>
            </Card>
            {!exam.parts.length && (
              <Alert color="red" variant="light" p="xs">
                <Text size="xs">Die Arbeit hat noch keine Teile – zuerst im Rahmen den Aufbau festlegen.</Text>
              </Alert>
            )}
            <Group justify="flex-end">
              <Button disabled={!anzahlGewaehlt || !exam.parts.length} onClick={() => void uebernehmen()}>
                {anzahlGewaehlt === 1 ? 'Aufgabe übernehmen' : `${anzahlGewaehlt} Aufgaben übernehmen`}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
