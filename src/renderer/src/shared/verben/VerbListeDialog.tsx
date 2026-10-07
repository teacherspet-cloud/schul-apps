/**
 * Liste unregelmäßiger Verben eines Lehrwerk-Bandes einpflegen (30.09.2026).
 *
 * Ablauf wie von der Lehrkraft gewünscht: Scan, Foto, PDF oder Word einfügen (am iPad auch Kamera
 * und Dokumentenscanner) → die KI überträgt die Tabelle zeilenweise wörtlich → Kontrolle in einer
 * bearbeitbaren Tabelle (unsichere Zellen gelb, Dubletten markiert, Zeilen hinzufügen, löschen,
 * verschieben, sortieren) → Band wählen → speichern. Gespeichert wird je Band, neben dem Lehrwerk;
 * mitgelieferte Lehrwerke bleiben unverändert.
 *
 * Erreichbar im Grammatiktest („Unregelmäßige Verben") und in den Vokabellisten beim Lehrwerk.
 */
import { ActionIcon, Alert, Badge, Button, Group, Modal, ScrollArea, Select, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconDeviceFloppy, IconPlus, IconSortAscendingLetters, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { grundformVon, listenIdAusName, SPRACH_NAMEN, VERB_SPALTEN, type VerbEintrag, type VerbListeMeta, type VerbSprache } from '@shared/verben'
import { mitReihe } from '@shared/lehrwerkReihe'
import { istAbbruch } from '@shared/abbruch'
import DropZone, { FILE_TYPES } from '../components/DropZone'
import { notifyError, notifySuccess } from '../util'
import { newId } from '../../modules/vokabeltest/model/random'
import { importiereVerbliste } from './import'
import { dubletten } from './quellen'
import { BildDialog, BildZelle, useBildKiDa, useMedienAdmin, useMedienbank, useMedienZiel } from '../medien/MedienUi'
import type { Vokabel } from '../medien/medienbank'
import { alsVokabel, FormenTonZelle, HinweisTonZelle, VerbMedienLeiste } from './VerbMedien'

const EIGENER = '__eigener__'

const leereZeile = (): VerbEintrag => ({ id: newId(), formen: {} })

export default function VerbListeDialog({
  opened,
  onClose,
  sprache,
  lehrwerkId,
  onGespeichert
}: {
  opened: boolean
  onClose: () => void
  sprache: VerbSprache
  /** Vorgewählter Band (Kennung des Lehrwerks oder einer vorhandenen Liste) */
  lehrwerkId?: string
  onGespeichert?: (listen: VerbListeMeta[], id: string) => void
}): React.JSX.Element {
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  const [listen, setListen] = useState<VerbListeMeta[]>([])
  const [wahl, setWahl] = useState<string | null>(lehrwerkId ?? null)
  const [eigenerName, setEigenerName] = useState('')
  const [zeilen, setZeilen] = useState<VerbEintrag[]>([])
  const [seite, setSeite] = useState('')
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [erkannt, setErkannt] = useState<string>('')
  const [speichert, setSpeichert] = useState(false)
  const spalten = VERB_SPALTEN[sprache]
  /*
   * Bild und Aussprache je Verb (07.10.2026): aus der Medienbank, unter der Grundform – gemeinsam für alle Bände.
   * Die Bildstufe richtet sich nach der Klasse des Bandes.
   */
  const medienAdmin = useMedienAdmin()
  const bildKi = useBildKiDa()
  const bandName = buecher.find((b) => b.id === wahl)?.name ?? listen.find((l) => l.id === wahl)?.name ?? (eigenerName.trim() || 'Verbliste')
  const medienZiel = useMedienZiel({
    docId: `verben:${wahl ?? ''}`,
    titel: `Unregelmäßige Verben – ${bandName}`,
    klasse: buecher.find((b) => b.id === wahl)?.grade
  })
  const verbVokabeln = useMemo(() => zeilen.map((z) => alsVokabel(z, sprache)), [zeilen, sprache])
  const medien = useMedienbank(
    sprache,
    verbVokabeln.map((v) => v.term),
    medienZiel.stufe
  )
  const [bildOffen, setBildOffen] = useState<Vokabel | null>(null)

  useEffect(() => {
    if (!opened) return
    Promise.all([window.api.textbooks.list(), window.api.verbLists.list()])
      .then(([b, l]) => {
        setBuecher(b.filter((x) => x.language === sprache))
        setListen(l.filter((x) => x.sprache === sprache))
      })
      .catch(notifyError)
    setWahl(lehrwerkId ?? null)
  }, [opened, sprache, lehrwerkId])

  // Band gewechselt: vorhandene Liste laden
  useEffect(() => {
    if (!opened || !wahl || wahl === EIGENER) {
      if (wahl === EIGENER) setZeilen((z) => (z.length ? z : [leereZeile()]))
      return
    }
    let aktuell = true
    window.api.verbLists
      .get(wahl)
      .then((l) => {
        if (!aktuell) return
        setZeilen(l.eintraege)
        setSeite(l.seite ?? '')
      })
      .catch(() => {
        if (aktuell) setZeilen((z) => (z.some((e) => Object.keys(e.formen).length) ? z : []))
      })
    return () => {
      aktuell = false
    }
  }, [opened, wahl])

  const bandOptionen = useMemo(() => {
    const ausBuechern = buecher.map((b) => ({ value: b.id, label: b.name }))
    const freie = listen.filter((l) => !buecher.some((b) => b.id === l.id)).map((l) => ({ value: l.id, label: `${l.name} (eigene Liste)` }))
    return [...ausBuechern, ...freie, { value: EIGENER, label: 'Anderes Lehrwerk (Name eingeben) …' }]
  }, [buecher, listen])

  const doppelt = useMemo(() => new Set(dubletten(zeilen, sprache).flat()), [zeilen, sprache])
  const unsichere = zeilen.reduce((n, z) => n + (z.unsicher?.length ?? 0), 0)

  const setzeZelle = (i: number, id: string, wert: string): void =>
    setZeilen((alt) =>
      alt.map((z, j) => {
        if (j !== i) return z
        // Wer eine Zelle bearbeitet, hat sie geprüft: die Markierung „unsicher" fällt weg
        const unsicher = (z.unsicher ?? []).filter((s) => s !== id)
        const formen = { ...z.formen, [id]: wert }
        if (!wert) delete formen[id]
        return { ...z, formen, ...(unsicher.length ? { unsicher } : { unsicher: undefined }) }
      })
    )

  const verschiebe = (i: number, richtung: -1 | 1): void =>
    setZeilen((alt) => {
      const j = i + richtung
      if (j < 0 || j >= alt.length) return alt
      const neu = [...alt]
      ;[neu[i], neu[j]] = [neu[j], neu[i]]
      return neu
    })

  const sortiere = (): void =>
    setZeilen((alt) => [...alt].sort((a, b) => grundformVon(a, sprache).localeCompare(grundformVon(b, sprache), 'de', { sensitivity: 'base' })))

  const einlesen = async (files: File[]): Promise<void> => {
    const alle: VerbEintrag[] = []
    try {
      for (const [i, f] of files.entries()) {
        setLaeuft(files.length > 1 ? `Datei ${i + 1} von ${files.length} …` : 'Datei wird gelesen …')
        const r = await importiereVerbliste(f, sprache, window.api.ai.structured, (m) => setLaeuft(m))
        alle.push(...r.eintraege)
        if (r.seite) setSeite((s) => s || r.seite)
        if (r.band) {
          setErkannt(r.band)
          // Band aus dem Scan übernehmen, wenn noch keiner gewählt ist
          const treffer = buecher.find((b) => b.name.toLowerCase() === r.band.toLowerCase())
          if (!wahl) {
            if (treffer) setWahl(treffer.id)
            else {
              setWahl(EIGENER)
              setEigenerName(r.band)
            }
          }
        }
      }
      // An die vorhandenen Zeilen anhängen – eine Liste über mehrere Seiten entsteht Seite für Seite
      setZeilen((z) => [...z.filter((e) => Object.keys(e.formen).length), ...alle])
      notifySuccess(`${alle.length} Verben übertragen. Gelb markierte Zellen bitte prüfen.`)
    } catch (e) {
      if (!istAbbruch(e)) notifyError(e, 'Die Liste konnte nicht übertragen werden')
    } finally {
      setLaeuft(null)
    }
  }

  const speichern = async (): Promise<void> => {
    const buch = buecher.find((b) => b.id === wahl)
    const name = buch?.name ?? (wahl === EIGENER ? eigenerName.trim() : listen.find((l) => l.id === wahl)?.name ?? '')
    if (!name) {
      notifyError(new Error('Zuerst den Band wählen oder einen Namen eingeben.'))
      return
    }
    const id = buch?.id ?? (wahl && wahl !== EIGENER ? wahl : listenIdAusName(name))
    const reihe = buch ? mitReihe(buch) : mitReihe({ name, reihe: undefined, band: undefined })
    setSpeichert(true)
    try {
      const neu = await window.api.verbLists.save({
        id,
        ...(buch ? { lehrwerkId: buch.id } : {}),
        name,
        ...(reihe.reihe ? { reihe: reihe.reihe } : {}),
        ...(reihe.band ? { band: reihe.band } : {}),
        sprache,
        eintraege: zeilen.filter((z) => Object.keys(z.formen).some((k) => k !== 'de')),
        ...(seite.trim() ? { seite: seite.trim() } : {}),
        aktualisiert: new Date().toISOString()
      })
      setListen(neu.filter((l) => l.sprache === sprache))
      notifySuccess(`Verbliste „${name}" gespeichert.`)
      onGespeichert?.(neu, id)
      onClose()
    } catch (e) {
      notifyError(e)
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} size="95%" title={`Unregelmäßige Verben – Liste einpflegen (${SPRACH_NAMEN[sprache]})`} data-verbliste-dialog>
      <Stack gap="sm">
        <Group grow align="end">
          <Select
            label="Lehrwerk-Band"
            description="Jeder Band hat seine eigene Liste (Green Line 2, Green Line 3 …)."
            data={bandOptionen}
            value={wahl}
            onChange={setWahl}
            searchable
            placeholder="Band wählen"
            data-verbliste-band
          />
          {wahl === EIGENER && (
            <TextInput label="Name des Bandes" placeholder="z. B. Découvertes 2" value={eigenerName} onChange={(e) => setEigenerName(e.currentTarget.value)} />
          )}
          <TextInput label="Seite im Buch (optional)" placeholder="z. B. S. 212–214" value={seite} onChange={(e) => setSeite(e.currentTarget.value)} />
        </Group>

        <DropZone
          onFiles={(f) => void einlesen(f)}
          accept={[...FILE_TYPES.image, ...FILE_TYPES.pdf, ...FILE_TYPES.docx, ...FILE_TYPES.csv]}
          title="Scan, Foto, PDF oder Word der Verbliste hier ablegen"
          hint={`Die KI überträgt die Tabelle zeilenweise wörtlich: ${spalten.map((s) => s.label).join(' | ')}. Unsichere Zellen werden markiert.`}
          loading={Boolean(laeuft)}
          minHeight={90}
        />
        {laeuft && (
          <Text size="sm" c="dimmed">
            {laeuft}
          </Text>
        )}
        {erkannt && (
          <Text size="xs" c="dimmed">
            Auf dem Scan erkannt: {erkannt}
          </Text>
        )}
        {(unsichere > 0 || doppelt.size > 0) && (
          <Alert color="yellow" p="xs">
            <Text size="sm">
              {unsichere > 0 ? `${unsichere} Zelle(n) unsicher übertragen (gelb) – bitte mit dem Buch vergleichen. ` : ''}
              {doppelt.size > 0 ? `${doppelt.size} Zeilen enthalten dasselbe Verb (rot umrandet).` : ''}
            </Text>
          </Alert>
        )}

        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {zeilen.length} Verben
          </Text>
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconSortAscendingLetters size={14} />} onClick={sortiere} disabled={zeilen.length < 2}>
              Alphabetisch sortieren
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconPlus size={14} />}
              onClick={() => setZeilen((z) => [...z, leereZeile()])}
              data-verbliste-zeile
            >
              Zeile hinzufügen
            </Button>
          </Group>
        </Group>

        {medienAdmin && verbVokabeln.some((v) => v.term) && (
          <VerbMedienLeiste sprache={sprache} vokabeln={verbVokabeln.filter((v) => v.term)} daten={medien.daten} ziel={medienZiel} bildKi={bildKi} />
        )}
        <ScrollArea.Autosize mah="50vh">
          <Table withTableBorder withColumnBorders striped={false} className="verbliste-tabelle" data-verbliste-tabelle>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>#</Table.Th>
                {spalten.map((s) => (
                  <Table.Th key={s.id}>{s.label}</Table.Th>
                ))}
                <Table.Th>Hinweis</Table.Th>
                <Table.Th w={56}>Bild</Table.Th>
                <Table.Th>Aussprache</Table.Th>
                <Table.Th>Aussprache Hinweis</Table.Th>
                <Table.Th w={100} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zeilen.map((z, i) => (
                <Table.Tr key={z.id} style={doppelt.has(i) ? { outline: '2px solid var(--mantine-color-red-5)' } : undefined} data-verbliste-reihe={i}>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {i + 1}
                    </Text>
                  </Table.Td>
                  {spalten.map((s) => {
                    const unsicher = z.unsicher?.includes(s.id)
                    return (
                      <Table.Td key={s.id} style={unsicher ? { background: 'var(--mantine-color-yellow-1)' } : undefined}>
                        <TextInput
                          size="xs"
                          variant="unstyled"
                          value={z.formen[s.id] ?? ''}
                          onChange={(e) => setzeZelle(i, s.id, e.currentTarget.value)}
                          aria-label={`${s.label}, Zeile ${i + 1}`}
                          title={unsicher ? 'Unsicher übertragen – bitte prüfen' : undefined}
                        />
                      </Table.Td>
                    )
                  })}
                  <Table.Td>
                    <TextInput
                      size="xs"
                      variant="unstyled"
                      value={z.hinweis ?? ''}
                      onChange={(e) => setZeilen((alt) => alt.map((x, j) => (j === i ? { ...x, hinweis: e.currentTarget.value || undefined } : x)))}
                      aria-label={`Hinweis, Zeile ${i + 1}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <BildZelle
                      sicht={medien.daten[verbVokabeln[i]?.term ?? '']}
                      wort={verbVokabeln[i]?.term ?? ''}
                      onOeffnen={() => verbVokabeln[i]?.term && setBildOffen(verbVokabeln[i])}
                      stufe={medienZiel.stufe}
                    />
                  </Table.Td>
                  <Table.Td>
                    <FormenTonZelle sprache={sprache} zeile={z} verbSprache={sprache} sicht={medien.daten[verbVokabeln[i]?.term ?? '']} admin={medienAdmin} />
                  </Table.Td>
                  <Table.Td>
                    <HinweisTonZelle sprache={sprache} zeile={z} verbSprache={sprache} sicht={medien.daten[verbVokabeln[i]?.term ?? '']} admin={medienAdmin} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon size="sm" variant="subtle" aria-label="Zeile nach oben" onClick={() => verschiebe(i, -1)} disabled={i === 0}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="subtle" aria-label="Zeile nach unten" onClick={() => verschiebe(i, 1)} disabled={i === zeilen.length - 1}>
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <Tooltip label="Zeile löschen">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label="Zeile löschen"
                          onClick={() => setZeilen((alt) => alt.filter((_, j) => j !== i))}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        {!zeilen.length && (
          <Text size="sm" c="dimmed">
            Noch keine Verben – Scan einfügen oder Zeilen von Hand anlegen.
          </Text>
        )}

        <Group justify="space-between">
          <Group gap={6}>
            {listen.length > 0 && (
              <Text size="xs" c="dimmed">
                Vorhandene Listen:
              </Text>
            )}
            {listen.map((l) => (
              <Badge key={l.id} variant="light" size="sm">
                {l.name} ({l.anzahl})
              </Badge>
            ))}
          </Group>
          <Group>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={() => void speichern()}
              loading={speichert}
              disabled={!wahl || !zeilen.length}
              data-verbliste-speichern
            >
              Liste speichern
            </Button>
          </Group>
        </Group>
      </Stack>
      {bildOffen && (
        <BildDialog
          sprache={sprache}
          v={bildOffen}
          sicht={medien.daten[bildOffen.term]}
          admin={medienAdmin}
          ziel={medienZiel}
          schliessen={() => setBildOffen(null)}
          geaendert={() => medien.laden()}
        />
      )}
    </Modal>
  )
}
