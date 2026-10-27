/**
 * Schulbücher eines Fachs (27.10.2026, abgestimmt mit der Lehrkraft; Regeln in shared/schulbuecher.ts, Speicher in
 * server/schulbuecher.ts): Liste mit Cover, Bearbeiten im Fenster, „Aus Lehrwerk übernehmen“ für Vokabel-Lehrwerke ohne
 * Katalogeintrag. Gemeinsam genutzt von Schule & Daten › Fächer (alle Fächer, Admin) und „Mein Fach“ (Fachobleute).
 * Bilder kommen direkt vom Verlag (ISBN-Automatik oder eingetragene Adresse eines Verlags-Hosts) – nichts wird gespeichert.
 */
import { ActionIcon, Badge, Button, Card, Group, Loader, Modal, MultiSelect, Select, Stack, TagsInput, Text, TextInput, Tooltip } from '@mantine/core'
import { IconBook2, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FAECHER, fachVon } from '@shared/faecher'
import {
  BILD_HOSTS,
  bildUrlErlaubt,
  buchAusLehrwerk,
  buchBild,
  buchName,
  buecherDesFachs,
  fachDerLehrwerkSprache,
  isbnGueltig,
  type LehrwerkKurz,
  type Schulbuch
} from '@shared/schulbuecher'
import { schulformenDes } from '@shared/schulformen'
import { holen, senden } from '../../modules/onlinetest/serverApi'
import { useAppSettings } from '../settingsStore'
import { notifyError, notifySuccess } from '../util'
import { BandCover } from './BandCover'

export interface Katalog {
  faecher: { liste: string[]; gespeichert: boolean; abgeleitet: string[]; stand?: string }
  buecher: Schulbuch[]
  lehrwerke: LehrwerkKurz[]
  /** 'alle' (Admin) oder die Fächer, deren Bücher die Person pflegen darf */
  darf: 'alle' | string[]
}

export const darfFach = (k: Pick<Katalog, 'darf'> | null, fach: string): boolean => Boolean(k && (k.darf === 'alle' || k.darf.includes(fach)))

/** Katalog laden – ein Aufruf je Seite; `neu` lädt nach dem Speichern frisch */
export function useSchulbuchKatalog(): { katalog: Katalog | null; setKatalog: (k: Katalog) => void; neu: () => Promise<void> } {
  const [katalog, setKatalog] = useState<Katalog | null>(null)
  const neu = useCallback(async () => {
    try {
      setKatalog(await holen<Katalog>('/server/schulbuecher'))
    } catch (e) {
      notifyError(e, 'Die Schulbücher konnten nicht geladen werden')
    }
  }, [])
  useEffect(() => void neu(), [neu])
  return { katalog, setKatalog, neu }
}

const JAHRGAENGE = Array.from({ length: 13 }, (_, i) => ({ value: String(i + 1), label: `Klasse ${i + 1}` }))

/** Bild eines Buchs: Adresse aus ISBN bzw. Eintrag, sonst die Kachel der Lehrwerks-Cover (Reihe/Band) */
export function SchulbuchBild({ buch, breite = 36 }: { buch: Schulbuch; breite?: number }): React.JSX.Element {
  const url = buchBild(buch)
  const [fehler, setFehler] = useState<string | null>(null)
  if (url && fehler !== url)
    return (
      <img
        src={url}
        alt={`Cover ${buchName(buch)}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFehler(url)}
        data-buch-bild
        style={{
          width: breite,
          height: Math.round((breite * 4) / 3),
          objectFit: 'cover',
          borderRadius: 3,
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
    )
  return <BandCover band={{ name: buchName(buch), reihe: buch.reihe, band: buch.band, ausgabe: buch.ausgabe }} breite={breite} />
}

const jahrgangsText = (j: number[]): string => {
  if (!j.length) return ''
  const s = [...j].sort((a, b) => a - b)
  const folge = s.every((x, i) => i === 0 || x === s[i - 1] + 1)
  return folge && s.length > 1 ? `Kl. ${s[0]}–${s[s.length - 1]}` : `Kl. ${s.join(', ')}`
}

/** Leeres Buch für ein Fach */
const neuesBuch = (fach: string): Schulbuch => ({
  id: '',
  faecher: [fach],
  reihe: '',
  band: '',
  titel: '',
  verlag: '',
  ausgabe: '',
  edition: '',
  jahrgaenge: [],
  schulformen: [],
  isbn: '',
  bild: '',
  kapitel: []
})

/** Fenster zum Anlegen oder Bearbeiten eines Buchs */
export function SchulbuchFormular({
  buch,
  lehrwerke,
  onClose,
  onGespeichert
}: {
  buch: Schulbuch
  lehrwerke: LehrwerkKurz[]
  onClose: () => void
  onGespeichert: (buecher: Schulbuch[]) => void
}): React.JSX.Element {
  const [b, setB] = useState<Schulbuch>(buch)
  const [laeuft, setLaeuft] = useState(false)
  const land = useAppSettings((s) => s.settings.defaults?.stateId ?? 'NI')
  const schulformen = useMemo(() => schulformenDes(land).map((s) => ({ value: s.id, label: s.name })), [land])
  const setze = (p: Partial<Schulbuch>): void => setB((x) => ({ ...x, ...p }))
  const isbnFehler = b.isbn.trim() && !isbnGueltig(b.isbn) ? 'Keine gültige ISBN (Prüfziffer)' : undefined
  const bildFehler = b.bild.trim() && !bildUrlErlaubt(b.bild) ? `Nur Bild-Adressen (https) dieser Verlage: ${BILD_HOSTS.join(', ')}` : undefined
  const name = buchName(b)
  const vorschau = buchBild(b)
  // Lehrwerksdateien passend zu einem der Fächer des Buchs
  const lehrwerkWahl = lehrwerke
    .filter((l) => b.faecher.some((f) => fachDerLehrwerkSprache(l.language) === f))
    .map((l) => ({ value: l.id, label: `${l.name}${l.platzhalter ? ' (ohne Wortschatz)' : ''}` }))
  const speichern = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const d = await senden<{ buch: Schulbuch; buecher: Schulbuch[] }>('/server/schulbuecher/buch', { buch: b })
      onGespeichert(d.buecher)
      notifySuccess(`„${buchName(d.buch)}“ gespeichert.`)
      onClose()
    } catch (e) {
      notifyError(e, 'Das Buch ließ sich nicht speichern')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={onClose} title={buch.id ? `${buchName(buch)} bearbeiten` : 'Schulbuch hinzufügen'} size="lg" data-buch-fenster>
      <Stack gap="sm">
        <Group align="start" wrap="nowrap">
          <Stack gap="sm" style={{ flex: 1 }}>
            <Group grow>
              <TextInput label="Reihe" placeholder="Green Line" value={b.reihe} onChange={(e) => setze({ reihe: e.currentTarget.value })} data-buch-reihe />
              <TextInput label="Band" placeholder="1, Transition …" value={b.band} onChange={(e) => setze({ band: e.currentTarget.value })} data-buch-band />
            </Group>
            <TextInput
              label="Titel (wenn abweichend)"
              placeholder="Geschichte und Geschehen 2"
              value={b.titel}
              onChange={(e) => setze({ titel: e.currentTarget.value })}
              data-buch-titel
            />
            <Group grow>
              <TextInput label="Verlag" placeholder="Klett" value={b.verlag} onChange={(e) => setze({ verlag: e.currentTarget.value })} data-buch-verlag />
              <TextInput
                label="Ausgabe"
                placeholder="ab 2021"
                value={b.ausgabe}
                onChange={(e) => setze({ ausgabe: e.currentTarget.value })}
                data-buch-ausgabe
              />
              <TextInput label="Landesausgabe" placeholder="Niedersachsen" value={b.edition} onChange={(e) => setze({ edition: e.currentTarget.value })} />
            </Group>
          </Stack>
          <Stack gap={4} align="center" style={{ flexShrink: 0 }}>
            <SchulbuchBild buch={b} breite={72} />
            <Text size="xs" c="dimmed">
              {vorschau ? 'Bild vom Verlag' : 'Kein Bild'}
            </Text>
          </Stack>
        </Group>
        <Group grow align="start">
          <MultiSelect
            label="Fächer"
            data={FAECHER.map((f) => ({ value: f.id, label: f.label }))}
            value={b.faecher}
            onChange={(v) => setze({ faecher: v })}
            searchable
            error={!b.faecher.length ? 'Mindestens ein Fach' : undefined}
            data-buch-faecher
          />
          <MultiSelect
            label="Jahrgänge"
            data={JAHRGAENGE}
            value={b.jahrgaenge.map(String)}
            onChange={(v) => setze({ jahrgaenge: v.map(Number).sort((x, y) => x - y) })}
            data-buch-jahrgaenge
          />
        </Group>
        <MultiSelect
          label="Schulformen (leer = alle)"
          data={schulformen}
          value={b.schulformen.filter((s) => schulformen.some((x) => x.value === s))}
          onChange={(v) => setze({ schulformen: v })}
        />
        <Group grow align="start">
          <TextInput
            label="ISBN"
            placeholder="978-3-12-864010-5"
            value={b.isbn}
            onChange={(e) => setze({ isbn: e.currentTarget.value })}
            error={isbnFehler}
            description="Bei Klett (bekannte Ausgaben) und Cornelsen erscheint das Cover automatisch"
            data-buch-isbn
          />
          <TextInput
            label="Bild-Adresse (optional)"
            placeholder="https://assets.klett.de/…"
            value={b.bild}
            onChange={(e) => setze({ bild: e.currentTarget.value })}
            error={bildFehler}
            data-buch-bild-url
          />
        </Group>
        <TagsInput
          label="Kapitel / Units (optional, Enter nach jedem)"
          value={b.kapitel}
          onChange={(v) => setze({ kapitel: v })}
          placeholder="Unit 1: A new school"
        />
        {lehrwerkWahl.length > 0 && (
          <Select
            label="Vokabel-Lehrwerk (App „Vokabellisten“)"
            description="Verknüpft das Buch mit der Lehrwerksdatei – Vokabeln und Units bleiben dort"
            data={lehrwerkWahl}
            value={b.lehrwerkId ?? null}
            onChange={(v) => setze(v ? { lehrwerkId: v } : { lehrwerkId: undefined })}
            clearable
            searchable
            data-buch-lehrwerk
          />
        )}
        <Group justify="space-between" mt="xs">
          <Text size="xs" c="dimmed">
            {b.geaendert ? `Zuletzt geändert von ${b.geaendert.von} am ${new Date(b.geaendert.am).toLocaleDateString('de-DE')}` : ''}
          </Text>
          <Group>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              onClick={() => void speichern()}
              loading={laeuft}
              disabled={!b.faecher.length || name === 'Schulbuch' || Boolean(bildFehler)}
              data-buch-speichern
            >
              Speichern
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Die Bücher eines Fachs mit Bearbeiten, Löschen, Hinzufügen und „Aus Lehrwerk übernehmen“ */
export function SchulbuchListe({ fach, katalog, aendern }: { fach: string; katalog: Katalog; aendern: (buecher: Schulbuch[]) => void }): React.JSX.Element {
  const [offen, setOffen] = useState<Schulbuch | null>(null)
  const darf = darfFach(katalog, fach)
  const buecher = useMemo(() => buecherDesFachs(katalog.buecher, fach), [katalog.buecher, fach])
  // Lehrwerksdateien dieses Fachs, die noch kein Buch des Katalogs kennt
  const ohneBuch = useMemo(
    () => katalog.lehrwerke.filter((l) => fachDerLehrwerkSprache(l.language) === fach && !katalog.buecher.some((b) => b.lehrwerkId === l.id)),
    [katalog, fach]
  )
  const loeschen = async (b: Schulbuch): Promise<void> => {
    if (!window.confirm(`„${buchName(b)}“ aus dem Katalog entfernen? Vokabellisten und Materialien bleiben erhalten.`)) return
    try {
      aendern((await senden<{ buecher: Schulbuch[] }>('/server/schulbuecher/loeschen', { id: b.id })).buecher)
    } catch (e) {
      notifyError(e, 'Das Buch ließ sich nicht entfernen')
    }
  }
  const uebernehmen = async (l: LehrwerkKurz): Promise<void> => {
    const b = buchAusLehrwerk(l)
    if (!b) return
    try {
      aendern((await senden<{ buecher: Schulbuch[] }>('/server/schulbuecher/buch', { buch: { ...b, faecher: [...new Set([fach, ...b.faecher])] } })).buecher)
    } catch (e) {
      notifyError(e, 'Das Lehrwerk ließ sich nicht übernehmen')
    }
  }
  return (
    <Stack gap="xs" data-fach-buecher={fach}>
      {buecher.length === 0 && (
        <Text size="sm" c="dimmed">
          Noch kein Schulbuch eingetragen.
        </Text>
      )}
      {buecher.map((b) => (
        <Group key={b.id} wrap="nowrap" align="center" gap="sm" data-buch={b.id}>
          <SchulbuchBild buch={b} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Text fw={600} size="sm">
                {buchName(b)}
              </Text>
              {b.titel && b.reihe ? (
                <Text size="sm" c="dimmed">
                  {b.titel}
                </Text>
              ) : null}
              {b.lehrwerkId && (
                <Tooltip label="Mit Lehrwerksdatei verknüpft – Vokabeln in der App „Vokabellisten“">
                  <Badge size="xs" variant="light" color="teal" leftSection={<IconBook2 size={10} />}>
                    Vokabeln
                  </Badge>
                </Tooltip>
              )}
              {b.faecher.length > 1 && (
                <Badge size="xs" variant="outline" color="gray">
                  {b.faecher.map((f) => fachVon(f)?.label ?? f).join(' · ')}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {[
                jahrgangsText(b.jahrgaenge),
                b.verlag,
                b.ausgabe ? `Ausgabe ${b.ausgabe}` : '',
                b.edition,
                b.isbn ? `ISBN ${b.isbn}` : '',
                b.kapitel.length ? `${b.kapitel.length} Kapitel` : ''
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </div>
          {darf && (
            <Group gap={4} wrap="nowrap">
              <ActionIcon variant="subtle" aria-label={`${buchName(b)} bearbeiten`} onClick={() => setOffen(b)} data-buch-bearbeiten>
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" aria-label={`${buchName(b)} entfernen`} onClick={() => void loeschen(b)} data-buch-loeschen>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          )}
        </Group>
      ))}
      {darf && (
        <Group gap="xs" mt={4}>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setOffen(neuesBuch(fach))} data-buch-neu>
            Schulbuch hinzufügen
          </Button>
          {ohneBuch.map((l) => (
            <Button
              key={l.id}
              size="xs"
              variant="subtle"
              leftSection={<IconBook2 size={14} />}
              onClick={() => void uebernehmen(l)}
              data-buch-aus-lehrwerk={l.id}
            >
              „{l.name}“ aus Lehrwerk übernehmen
            </Button>
          ))}
        </Group>
      )}
      {offen && <SchulbuchFormular buch={offen} lehrwerke={katalog.lehrwerke} onClose={() => setOffen(null)} onGespeichert={aendern} />}
    </Stack>
  )
}

/** Für „Mein Fach“: lädt den Katalog selbst und zeigt die Bücher eines Fachs */
export function FachSchulbuecher({ fach }: { fach: string }): React.JSX.Element {
  const { katalog, setKatalog } = useSchulbuchKatalog()
  if (!katalog) return <Loader size="sm" />
  return (
    <Card withBorder data-mein-fach-buecher>
      <Text fw={600} mb={4}>
        Schulbücher
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Die Bücher des Fachs an der Schule – mit Jahrgängen, ISBN und Bild. Sie erscheinen als Vorschläge in den Auswahlen der Apps.
      </Text>
      <SchulbuchListe fach={fach} katalog={katalog} aendern={(buecher) => setKatalog({ ...katalog, buecher })} />
    </Card>
  )
}
