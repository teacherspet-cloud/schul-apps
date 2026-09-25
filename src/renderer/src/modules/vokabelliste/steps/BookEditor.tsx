import { Alert, Badge, Button, Card, Chip, Group, Stack, Text, Title } from '@mantine/core'
import { IconCheck, IconDeviceFloppy } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { Textbook, TextbookEntry } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { useVerzoegertesSichern } from '../../../shared/useAutosave'
import { newId } from '../../vokabeltest/model/random'
import VocabRows, { emptyRow } from './VocabRows'
import type { VocabRow } from './VocabRows'

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
export default function BookEditor({ bookId, onBack }: { bookId: string; onBack: () => void }): React.JSX.Element {
  const [book, setBook] = useState<Textbook | null>(null)
  const [unit, setUnit] = useState('')
  const [section, setSection] = useState('')
  const [rows, setRows] = useState<VocabRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
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
        setUnit(b.units[0]?.name ?? '')
        setSection(b.units[0]?.sections[0]?.name ?? '')
        setGeladen((n) => n + 1)
      })
      .catch(notifyError)
  }, [bookId])

  // Abschnitt wechseln: Zeilen aus dem Buch holen
  useEffect(() => {
    if (!book) return
    const entries = book.units.find((u) => u.name === unit)?.sections.find((s) => s.name === section)?.entries ?? []
    setRows([...entries.map((e) => ({ ...e, id: newId() })), emptyRow()])
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geladen, unit, section])

  const save = async (vonHand = false): Promise<void> => {
    if (!book) return
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
      notifySuccess('Die eigenen Änderungen wurden verworfen.')
    } catch (e) {
      notifyError(e)
    }
  }

  if (!book) return <Text c="dimmed">Lade …</Text>

  const unitMeta = book.units.find((u) => u.name === unit)

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Title order={3}>{book.name}</Title>
            {book.builtIn ? (
              <Badge variant="light">mitgeliefert</Badge>
            ) : (
              <Badge variant="light" color="teal">
                eigene Fassung
              </Badge>
            )}
          </Group>
          <Text c="dimmed" size="sm">
            Unit und Abschnitt wählen, dann die Vokabeln ändern oder ergänzen.
          </Text>
        </div>
        <Group wrap="nowrap">
          <Button variant="default" onClick={() => void wechsle(onBack)}>
            Zurück zur Übersicht
          </Button>
          {!book.builtIn && (
            <Button variant="subtle" color="red" onClick={() => setConfirmReset(true)}>
              Änderungen verwerfen
            </Button>
          )}
          {/* Zeigt den Stand; ein Klick sichert sofort, statt die kurze Wartezeit abzuwarten */}
          <Button
            variant={dirty ? 'filled' : 'light'}
            leftSection={dirty ? <IconDeviceFloppy size={16} /> : <IconCheck size={16} />}
            disabled={!dirty}
            loading={saving}
            onClick={() => void sicherung.sofort().then(() => save(true))}
          >
            {dirty ? 'Speichern' : 'Gesichert'}
          </Button>
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
            <Text size="sm">Alle eigenen Änderungen an diesem Lehrwerk verwerfen? Danach gilt wieder die mitgelieferte Fassung.</Text>
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

      {book.builtIn && (
        <Alert color="gray" p="xs">
          <Text size="xs">
            Das mitgelieferte Lehrwerk bleibt erhalten: Beim Speichern legt die App eine eigene Fassung an, die du jederzeit wieder verwerfen kannst.
          </Text>
        </Alert>
      )}

      <Card withBorder>
        <VocabRows
          title={`${unit} · ${section}`}
          // Schulbücher führen den Beispielsatz in einem eigenen Feld, nicht im Hinweis
          withExample
          rows={rows}
          onChange={(r) => {
            setRows(r)
            stand.current++
            setDirty(true)
            sicherung.plane(1200)
          }}
        />
      </Card>
    </Stack>
  )
}
