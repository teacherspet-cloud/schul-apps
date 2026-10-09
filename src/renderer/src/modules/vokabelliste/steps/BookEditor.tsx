import { Alert, Badge, Box, Button, Card, Chip, Collapse, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconCheck, IconChevronRight, IconDeviceFloppy, IconListDetails, IconStack2 } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { useUndoKeys } from '../../../shared/useUndoKeys'
import { useVerlauf } from '../../../shared/useVerlauf'
import type { Textbook, TextbookEntry, TextbookMeta } from '@shared/types'
import { reiheTitel } from '@shared/lehrwerkReihe'
import LehrwerkAngaben, { type LehrwerkAngabenWerte } from '../../../shared/components/LehrwerkAngaben'
import { notifyError, notifySuccess } from '../../../shared/util'
import { useVerzoegertesSichern } from '../../../shared/useAutosave'
import { newId } from '../../vokabeltest/model/random'
import VokabelTabelle, { leereZeile, ZUSATZ } from '../../vokabeltest/steps/VokabelTabelle'
import type { VocabRow } from './VocabRow'
import { istVerbSprache } from '@shared/verben'
import VerbListeDialog from '../../../shared/verben/VerbListeDialog'
import { aufServer } from '../../../shared/plattform'
import { AbschnitteDialog, MedienLeiste, useMedienAdmin, useMedienbank, useMedienZiel } from '../../../shared/medien/MedienUi'
import { setzeVokabelAnsicht, zielBuch } from '../../../shared/medien/medienAuftrag'

/** Zeile in einen Lehrwerks-Eintrag überführen: getrimmt und ohne leere Felder. */
function clean(row: Omit<VocabRow, 'id'>): TextbookEntry {
  const entry: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const v = typeof value === 'string' ? value.trim() : value
    if (v !== '' && v !== undefined && v !== false) entry[key] = v
  }
  return entry as unknown as TextbookEntry
}

/**
 * Einen Abschnitt eines Schulbuchs bearbeiten.
 *
 * Mitgelieferte Lehrwerke bleiben unangetastet: Beim Speichern legt die App eine eigene
 * Fassung unter `%APPDATA%/schul-apps/lehrwerke` an, die das mitgelieferte Buch ersetzt.
 * „Änderungen verwerfen" stellt das Original wieder her.
 *
 * Gespeichert wird von selbst, kurz nach jeder Änderung. Vorher verwarf schon der Wechsel
 * der Unit alles Getippte – ohne Hinweis.
 */
export default function BookEditor({
  bookId,
  onBack,
  aktiv = true,
  start
}: {
  bookId: string
  onBack: () => void
  aktiv?: boolean
  /** Gleich diesen Abschnitt zeigen („Öffnen" eines Medienauftrags, 06.10.2026); `n` zählt hoch, damit auch derselbe Sprung wirkt */
  start?: { unit: string; abschnitt: string; n: number }
}): React.JSX.Element {
  const [book, setBook] = useState<Textbook | null>(null)
  const [unit, setUnit] = useState('')
  const [section, setSection] = useState('')
  // Zeilen mit Verlauf: „Zeile löschen" fragt nicht nach, Strg+Z holt sie zurück (Paket 7)
  const verlauf = useVerlauf<VocabRow[]>(() => [])
  const rows = verlauf.stand
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [angabenOffen, setAngabenOffen] = useState(false)
  // Liste unregelmäßiger Verben dieses Bandes (30.09.2026) – eigene Ablage neben dem Buch
  const [verbenOffen, setVerbenOffen] = useState(false)
  // Medienaufträge für mehrere Abschnitte auf einmal (06.10.2026)
  const [abschnitteOffen, setAbschnitteOffen] = useState(false)
  // Alle Lehrwerke – Vorschlagslisten für Reihe, Verlag, Landesausgabe, Ausgabe
  const [alle, setAlle] = useState<TextbookMeta[]>([])
  /*
   * Gemeinsame Datenbank (05.10.2026, main/services/storage/textbooks.ts): Am Server sind die mitgelieferten
   * Lehrwerke gemeinsam – Admins bearbeiten sie für alle, Lehrkräfte sehen sie nur an.
   */
  const admin = useMedienAdmin()
  const gemeinsam = aufServer() && Boolean(book?.builtIn)
  const gesperrt = gemeinsam && !admin
  useEffect(() => {
    window.api.textbooks
      .list()
      .then(setAlle)
      .catch(() => setAlle([]))
  }, [])
  /*
   * Zählt, wie oft das Buch NEU geladen wurde (Öffnen, Verwerfen). Nur dann werden die Zeilen
   * aus dem Buch geholt – nicht nach jedem Speichern. Sonst entstünden die Zeilen nach jeder
   * automatischen Sicherung neu, mitten im Tippen.
   */
  const [geladen, setGeladen] = useState(0)
  // Zählt Änderungen – so bleibt eine Eingabe WÄHREND des Speicherns als ungesichert markiert
  const stand = useRef(0)

  useEffect(() => {
    window.api.textbooks
      .get(bookId)
      .then((b) => {
        setBook(b)
        // „Öffnen" eines Medienauftrags: gleich der Abschnitt, an dem er gearbeitet hat
        const u = (start && b.units.find((x) => x.name === start.unit)) || b.units[0]
        const s = (start && u?.sections.find((x) => x.name === start.abschnitt)) || u?.sections[0]
        setUnit(u?.name ?? '')
        setSection(s?.name ?? '')
        setGeladen((n) => n + 1)
      })
      .catch(notifyError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  // Sprung zu einem Abschnitt, während das Buch schon offen ist (erst das Getippte sichern)
  useEffect(() => {
    if (!start || !book) return
    const u = book.units.find((x) => x.name === start.unit)
    if (!u || !u.sections.some((x) => x.name === start.abschnitt)) return
    if (u.name === unit && start.abschnitt === section) return
    void wechsle(() => {
      setUnit(u.name)
      setSection(start.abschnitt)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.n])

  // Diese Stelle ist gerade zu sehen – „Öffnen" in der Auftragsleiste wechselt dann nur ins Programm
  // Bildstufe (07.10.2026): aus der Klasse des Bandes, in der Medienleiste umstellbar
  const zielMitStufe = useMedienZiel(zielBuch(book?.id ?? '', book?.name ?? '', unit, section, book?.grade))
  const medienZiel = book ? zielMitStufe : null
  const medien = useMedienbank(
    book?.language,
    rows.map((r) => r.term),
    zielMitStufe.stufe
  )
  const ansicht = medienZiel?.docId ?? null
  useEffect(() => {
    if (!aktiv || !ansicht) return
    setzeVokabelAnsicht(ansicht)
    return () => setzeVokabelAnsicht(null)
  }, [ansicht, aktiv])

  // Abschnitt wechseln: Zeilen aus dem Buch holen
  useEffect(() => {
    if (!book) return
    const entries = book.units.find((u) => u.name === unit)?.sections.find((s) => s.name === section)?.entries ?? []
    const neu = entries.map((e) => ({ ...e, id: newId() }))
    verlauf.lade(neu.length ? neu : [leereZeile<VocabRow>()])
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geladen, unit, section])

  const save = async (vonHand = false): Promise<void> => {
    if (!book || gesperrt) return
    const gesichert = stand.current
    setSaving(true)
    try {
      // Nur den bearbeiteten Abschnitt ersetzen, alles andere bleibt wie es ist
      const next: Textbook = {
        ...book,
        units: book.units.map((u) =>
          u.name !== unit
            ? u
            : {
                ...u,
                sections: u.sections.map((s) =>
                  s.name !== section
                    ? s
                    : {
                        ...s,
                        // Leer gelassene Felder nicht als leere Zeichenkette speichern
                        entries: rows.filter((r) => r.term.trim()).map(({ id: _id, ...e }) => clean(e))
                      }
                )
              }
        )
      }
      await window.api.textbooks.save([next])
      setBook(next)
      if (stand.current === gesichert) setDirty(false)
      if (vonHand) notifySuccess(`„${book.name} – ${unit}, ${section}" gespeichert.`)
    } catch (e) {
      // Beim automatischen Sichern meldet der gemeinsame Mechanismus den Fehler
      if (!vonHand) throw e
      notifyError(e)
    } finally {
      setSaving(false)
    }
  }
  const sicherung = useVerzoegertesSichern(() => save())
  const geaendert = (): void => {
    if (gesperrt) return
    stand.current++
    setDirty(true)
    sicherung.plane(1200)
  }
  useUndoKeys(
    aktiv,
    () => verlauf.undo() && geaendert(),
    () => verlauf.redo() && geaendert()
  )

  /** Vor einem Wechsel (Unit, Abschnitt, zurück) erst das Getippte sichern. */
  const wechsle = async (fn: () => void): Promise<void> => {
    await sicherung.sofort()
    fn()
  }

  const reset = async (): Promise<void> => {
    if (!book) return
    try {
      // Eigene Fassung entfernen – danach gilt wieder das mitgelieferte Lehrwerk
      await window.api.textbooks.delete(book.id)
      const fresh = await window.api.textbooks.get(book.id)
      setBook(fresh)
      setGeladen((n) => n + 1)
      notifySuccess(gemeinsam ? 'Die Änderungen am gemeinsamen Lehrwerk wurden verworfen.' : 'Die eigenen Änderungen wurden verworfen.')
    } catch (e) {
      notifyError(e)
    }
  }

  if (!book) return <Text c="dimmed">Wird geladen …</Text>

  const unitMeta = book.units.find((u) => u.name === unit)

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Title order={3}>{book.name}</Title>
            {gemeinsam ? (
              <Badge variant="light" color="violet" data-gemeinsam>
                gemeinsam
              </Badge>
            ) : book.builtIn ? (
              <Badge variant="light">mitgeliefert</Badge>
            ) : (
              <Badge variant="light" color="teal">
                eigene Fassung
              </Badge>
            )}
          </Group>
          <Text c="dimmed" size="sm">
            {gesperrt ? 'Unit und Abschnitt wählen, um die Vokabeln anzusehen.' : 'Unit und Abschnitt wählen, dann die Vokabeln ändern oder ergänzen.'}
          </Text>
        </div>
        <Group wrap="nowrap">
          <Button variant="default" onClick={() => void wechsle(onBack)}>
            Zurück zur Übersicht
          </Button>
          {istVerbSprache(book.language) && (
            <Button variant="light" leftSection={<IconListDetails size={16} />} onClick={() => setVerbenOffen(true)} data-buch-verben>
              Unregelmäßige Verben
            </Button>
          )}
          {(!book.builtIn || (gemeinsam && admin)) && (
            <Button variant="subtle" color="red" onClick={() => setConfirmReset(true)}>
              Änderungen verwerfen
            </Button>
          )}
          {/* Zeigt den Stand; ein Klick sichert sofort, statt die kurze Wartezeit abzuwarten */}
          {!gesperrt && (
            <Button
              variant={dirty ? 'filled' : 'light'}
              leftSection={dirty ? <IconDeviceFloppy size={16} /> : <IconCheck size={16} />}
              disabled={!dirty}
              loading={saving}
              onClick={() => void sicherung.sofort().then(() => save(true))}
            >
              {dirty ? 'Speichern' : 'Gesichert'}
            </Button>
          )}
        </Group>
      </Group>

      {/*
       * Rückfrage vor dem Verwerfen. Der Knopf setzt das Lehrwerk auf die mitgelieferte
       * Fassung zurück – alle eigenen Vokabeln und Änderungen sind danach weg. Vorher
       * geschah das mit einem einzigen Klick.
       */}
      {confirmReset && (
        <Alert color="red" p="xs">
          <Group justify="space-between">
            <Text size="sm">
              {gemeinsam
                ? 'Alle Änderungen am gemeinsamen Lehrwerk verwerfen – für alle Lehrkräfte? Danach gilt wieder die mitgelieferte Fassung.'
                : 'Alle eigenen Änderungen an diesem Lehrwerk verwerfen? Danach gilt wieder die mitgelieferte Fassung.'}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" variant="default" onClick={() => setConfirmReset(false)}>
                Abbrechen
              </Button>
              <Button
                size="xs"
                color="red"
                autoFocus
                onClick={() => {
                  setConfirmReset(false)
                  // Anstehendes nicht erst NACH dem Verwerfen schreiben lassen
                  void wechsle(() => void reset())
                }}
              >
                Verwerfen
              </Button>
            </Group>
          </Group>
        </Alert>
      )}

      {istVerbSprache(book.language) && (
        <VerbListeDialog opened={verbenOffen} onClose={() => setVerbenOffen(false)} sprache={book.language} lehrwerkId={book.id} />
      )}

      <Card withBorder>
        <Text size="sm" fw={500} mb={4}>
          Unit
        </Text>
        <Chip.Group value={unit} onChange={(v) => typeof v === 'string' && void wechsle(() => setUnit(v))}>
          <Group gap={6}>
            {book.units.map((u) => (
              <Chip key={u.name} value={u.name} size="xs">
                {u.name}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        {unitMeta && (
          <>
            <Text size="sm" fw={500} mt="sm" mb={4}>
              Abschnitt
            </Text>
            <Chip.Group value={section} onChange={(v) => typeof v === 'string' && void wechsle(() => setSection(v))}>
              <Group gap={6}>
                {unitMeta.sections.map((s) => (
                  <Chip key={s.name} value={s.name} size="xs">
                    {s.name} ({s.entries.length})
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </>
        )}
      </Card>

      {/* Reihe, Band, Verlag, Landesausgabe, Ausgabe (Paket 15) – gespeichert wie jede Änderung, von selbst */}
      <Card withBorder>
        <UnstyledButton onClick={() => setAngabenOffen((o) => !o)} aria-expanded={angabenOffen} style={{ width: '100%' }}>
          <Group gap="xs" wrap="nowrap">
            <IconChevronRight size={14} style={{ transform: angabenOffen ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
            <Text size="sm" fw={500}>
              Reihe und Ausgabe
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {[reiheTitel(book), book.band ? `Band ${book.band}` : ''].filter(Boolean).join(' · ')}
            </Text>
          </Group>
        </UnstyledButton>
        <Collapse expanded={angabenOffen}>
          <Box mt="xs">
            <LehrwerkAngaben
              werte={book}
              vorhandene={alle}
              onChange={(patch) => {
                // Geleerte Felder entfallen ganz (Reihe und Band leitet die App dann wieder aus dem Namen ab)
                const neu: Textbook = { ...book }
                for (const [k, v] of Object.entries(patch) as [keyof LehrwerkAngabenWerte, string][]) neu[k] = v.trim() ? v : undefined
                setBook(neu)
                geaendert()
              }}
            />
          </Box>
        </Collapse>
      </Card>

      {book.builtIn && (
        <Alert color={gemeinsam ? 'violet' : 'gray'} p="xs" data-lehrwerk-hinweis>
          <Text size="xs">
            {gesperrt
              ? 'Gemeinsames Lehrwerk der Schule – nur Admins können es bearbeiten. Für eigene Änderungen eine eigene Vokabelliste anlegen.'
              : gemeinsam
              ? 'Gemeinsames Lehrwerk der Schule: Änderungen gelten sofort für alle Lehrkräfte und Lernenden. „Änderungen verwerfen" stellt die mitgelieferte Fassung wieder her.'
              : 'Das mitgelieferte Lehrwerk bleibt erhalten: Beim Speichern legt die App eine eigene Fassung an, die sich jederzeit wieder verwerfen lässt.'}
          </Text>
        </Alert>
      )}

      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <Text fw={600}>
              {unit} · {section}: {rows.filter((r) => r.term.trim()).length} Vokabeln
            </Text>
            {rows.some((r) => r.grey && r.term.trim()) && (
              <Badge variant="light" color="gray" tt="none">
                {rows.filter((r) => r.grey && r.term.trim()).length} {ZUSATZ}
              </Badge>
            )}
          </Group>
          {!gesperrt && (
            <UndoRedoButtons
              size="sm"
              canUndo={verlauf.kannUndo}
              canRedo={verlauf.kannRedo}
              onUndo={() => verlauf.undo() && geaendert()}
              onRedo={() => verlauf.redo() && geaendert()}
            />
          )}
        </Group>
        {admin && medienZiel && (
          <MedienLeiste
            sprache={book.language}
            vokabeln={rows.map((r) => ({ term: r.term, translation: r.translation, example: r.example, aussprache: r.aussprache }))}
            daten={medien.daten} bereit={medien.bereit}
            ziel={medienZiel}
            mehr={
              <Button size="xs" variant="light" leftSection={<IconStack2 size={14} />} onClick={() => setAbschnitteOffen(true)} data-medien-mehrere>
                Mehrere Abschnitte …
              </Button>
            }
          />
        )}
        {admin && (
          <AbschnitteDialog
            opened={abschnitteOffen}
            onClose={() => setAbschnitteOffen(false)}
            sprache={book.language}
            abschnitte={book.units.flatMap((u) =>
              u.sections.map((s) => ({
                unit: u.name,
                abschnitt: s.name,
                // Der offene Abschnitt mit dem Getippten, die übrigen aus dem Buch
                vokabeln: (u.name === unit && s.name === section ? rows : s.entries).map((e) => ({
                  term: e.term,
                  translation: e.translation,
                  example: e.example,
                  aussprache: e.aussprache
                })),
                ziel: { ...zielBuch(book.id, book.name, u.name, s.name, book.grade), stufe: zielMitStufe.stufe }
              }))
            )}
          />
        )}
        {/* Schulbücher führen den Beispielsatz in einem eigenen Feld, nicht im Hinweis */}
        <VokabelTabelle
          zeilen={rows}
          mitBeispiel
          mitVerlauf
          sprache={book.language}
          nurLesen={gesperrt}
          medien={{ sprache: book.language, daten: medien.daten, admin, neuLaden: medien.laden, ...(medienZiel ? { ziel: medienZiel } : {}) }}
          onChange={(r, gruppe) => {
            verlauf.setze(r, gruppe)
            geaendert()
          }}
        />
      </Card>
    </Stack>
  )
}
