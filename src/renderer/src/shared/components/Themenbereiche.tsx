import { setzeFachVorgabe } from '../fachVorgabe'
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconBulb,
  IconDots,
  IconFilePlus,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconFolderShare,
  IconListCheck,
  IconPencil,
  IconTrash,
  IconWand,
  IconX
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { Themenbereich } from '@shared/themen'
import { materialSchluessel } from '@shared/themen'
import { modules } from '../../modules/registry'
import { fachAnzeige, ladeMaterialien, type Material } from '../../shell/materialien'
import { artFarbe } from '../materialart'
import { neuAnlegen, openDocument, openThemen } from '../navigation'
import { imNetz } from '../netzZugang'
import {
  abgleichen,
  bereichAnlegen,
  bereichLoeschen,
  bereichUmbenennen,
  ladeThemen,
  neuImBereich,
  reihenfolgeSetzen,
  useThemen,
  verschieben,
  vorschlaegeUebernehmen
} from '../themenbereiche'
import { katalogFuer } from '../themenKatalog'
import { SORTIERUNGEN, schluesselVon, sortiere, umstellen, vorschauText, vorschlagen, type Sortierung, type Vorschlag } from '../themenVorschlag'
import { useConfirmKeys } from '../useConfirmKeys'
import { notifyError } from '../util'
import { VerschiebenKontext } from './Bibliothek'
import { FachPunkt, useFachFarbe } from './FachFarbe'

/**
 * Themenbereiche in den Bibliotheken (Paket 10b, 26.09.2026).
 *
 * Aufbau: Fach › Themenbereich (Ordner in der Fachfarbe) › Materialien. Materialien ohne
 * Bereich stehen direkt unter den Ordnern des Fachs („Ohne Themenbereich") – wie lose Dateien
 * unter den Ordnern im Explorer. So kostet die neue Ordnung keinen Klick, solange es keine
 * Bereiche gibt. Der Jahrgang ist nur noch ein Filter oben.
 *
 * Dieselbe Ansicht in allen fünf Bibliotheken und auf der übergreifenden Seite
 * „Themenbereiche" (shell/Themenuebersicht.tsx). Jede Bibliothek zeichnet ihre eigenen
 * Einträge selbst (Zeile mit Menü, beim Arbeitsblatt die Karte mit Vorschaubild); Materialien
 * der anderen Programme („alle Materialien des Bereichs") erscheinen als schlichte Karte, die
 * im richtigen Programm öffnet.
 *
 * Ordnen: Karten auf einen Ordner ziehen (auch mehrere – Strg-/Umschalt-Klick oder
 * „Auswählen"), oder „Verschieben nach …" im ⋯-Menü (Tastatur, Tablet). Jede Änderung zeigt
 * „Rückgängig".
 */

const MIME = 'application/x-schulapps-material'

// ---------- Gemerkte Wahl (je Rechner; ohne lokalen Speicher gilt sie nur für die Sitzung) ----------

function lies<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function merke(key: string, wert: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(wert))
  } catch {
    // siehe oben
  }
}
function useGemerkt<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [wert, setWert] = useState<T>(() => lies(key, fallback))
  return [
    wert,
    (v: T) => {
      setWert(v)
      merke(key, v)
    }
  ]
}

/** Jahrgangsfilter – gemeinsam für alle Bibliotheken: Wer in Klasse 7 unterwegs ist, ist es überall */
const JAHRGANG_KEY = 'schul-apps-themen-jahrgang'
const SORTIERUNG_KEY = 'schul-apps-themen-sortierung'
const UMFANG_KEY = 'schul-apps-themen-umfang'
const VORSCHLAG_AUS_KEY = 'schul-apps-themen-vorschlag-aus'

const modul = (id: string): (typeof modules)[number] | undefined => modules.find((m) => m.id === id)
/*
 * Materialarten in der Reihenfolge der Leiste – als Funktion, nicht als Konstante: registry.ts
 * lädt die Programme, deren Bibliotheken wiederum diese Datei laden. Beim Laden ist `modules`
 * deshalb noch nicht belegt.
 */
const arten = (): string[] => modules.map((m) => m.id).filter((id) => id !== 'vokabelliste')

const anzahlText = (n: number): string => (n === 1 ? '1 Material' : `${n} Materialien`)

export interface ThemenAnsichtProps {
  /** Programm der Bibliothek; null = übergreifende Seite (alle Materialarten) */
  moduleId: string | null
  /** „Arbeitsblätter" – für den Umschalter „nur Arbeitsblätter" */
  artPlural?: string
  /** Die Einträge dieses Programms (aus der Bibliothek, damit Umbenennen und Kopie sofort sichtbar sind) */
  eigene: Material[]
  /** Eigene Einträge zeichnet das Programm selbst */
  renderEigen?: (m: Material) => React.ReactNode
  darstellung?: 'zeilen' | 'karten'
  /** Neues Material dieses Programms anlegen; liefert seine Kennung („Neu in diesem Bereich") */
  onNeu?: () => Promise<string>
  /** Sprung von außen (Startseite) */
  ziel?: { fachId?: string; bereichId?: string; n: number }
}

export function ThemenAnsicht({ moduleId, artPlural, eigene, renderEigen, darstellung = 'zeilen', onNeu, ziel }: ThemenAnsichtProps): React.JSX.Element {
  const daten = useThemen((s) => s.daten)
  const [geladen, setGeladen] = useState<Material[] | null>(null)
  const [ort, setOrt] = useState<{ fachId: string | null; bereichId: string | null }>({ fachId: ziel?.fachId ?? null, bereichId: ziel?.bereichId ?? null })
  const [jahrgang, setJahrgang] = useGemerkt<number | null>(JAHRGANG_KEY, null)
  const [sortierung, setSortierung] = useGemerkt<Sortierung>(SORTIERUNG_KEY, 'neu')
  const [umfangGemerkt, setUmfang] = useGemerkt<'nur' | 'alle'>(`${UMFANG_KEY}-${moduleId ?? 'alle'}`, 'nur')
  const umfang = moduleId ? umfangGemerkt : 'alle'
  const [auswahl, setAuswahl] = useState<string[]>([])
  const [letzte, setLetzte] = useState<string | null>(null)
  const [auswahlModus, setAuswahlModus] = useState(false)
  const [verschiebenFuer, setVerschiebenFuer] = useState<string[] | null>(null)
  const [ueber, setUeber] = useState<string | null>(null)
  const [neuerBereich, setNeuerBereich] = useState<{ fachId: string; name: string } | null>(null)

  useEffect(() => {
    if (ziel) setOrt({ fachId: ziel.fachId ?? null, bereichId: ziel.bereichId ?? null })
  }, [ziel?.n])

  // Alle Materialien holen (für „alle Materialien", die Vorschläge und das Einsortieren) – neu, sobald sich die eigene Liste ändert
  useEffect(() => {
    let weg = false
    void ladeThemen().catch(notifyError)
    void ladeMaterialien().then((liste) => {
      if (weg) return
      const ohneListen = liste.filter((m) => m.moduleId !== 'vokabelliste')
      setGeladen(ohneListen)
      void abgleichen(ohneListen)
    })
    return () => {
      weg = true
    }
  }, [eigene])

  // Eigene Einträge aus der Bibliothek (aktuell), die übrigen aus der geladenen Gesamtliste
  const alle = useMemo(() => [...eigene, ...(geladen ?? []).filter((m) => m.moduleId !== moduleId)], [eigene, geladen, moduleId])
  const zuordnung = (m: Material): string | null => daten.zuordnungen[schluesselVon(m)]?.bereichId ?? null
  const bereichVon = (m: Material): Themenbereich | null => {
    const id = zuordnung(m)
    return id ? (daten.bereiche.find((b) => b.id === id) ?? null) : null
  }
  // Ein Material steht unter dem Fach seines Bereichs – auch wenn es „Neu in diesem Bereich" noch ohne Fach angelegt wurde
  const fachVon = (m: Material): string => bereichVon(m)?.fachId ?? m.fachId

  const jahrgaenge = useMemo(() => [...new Set(alle.map((m) => m.grade).filter((g): g is number => !!g))].sort((a, b) => a - b), [alle])
  const imUmfang = umfang === 'nur' && moduleId ? alle.filter((m) => m.moduleId === moduleId) : alle
  const sichtbar = imUmfang.filter((m) => !jahrgang || m.grade === jahrgang)

  const faecher = useMemo(() => {
    const set = new Set(sichtbar.map(fachVon))
    // Ohne Einschränkung auf eine Art zeigen auch leere Bereiche ihr Fach – ein eben angelegter Bereich soll nicht verschwinden
    if (umfang === 'alle' && !jahrgang) for (const b of daten.bereiche) set.add(b.fachId)
    if (ort.fachId) set.add(ort.fachId)
    return [...set].sort((a, b) => fachAnzeige(a).localeCompare(fachAnzeige(b), 'de'))
  }, [sichtbar, daten, umfang, ort.fachId, jahrgang])

  const offenerBereich = ort.bereichId ? (daten.bereiche.find((b) => b.id === ort.bereichId) ?? null) : null
  // Gelöschter oder unbekannter Bereich: zurück zur Übersicht
  useEffect(() => {
    if (ort.bereichId && useThemen.getState().geladen && !offenerBereich) setOrt((o) => ({ ...o, bereichId: null }))
  }, [ort.bereichId, offenerBereich])

  const bereicheIn = (fachId: string): Themenbereich[] =>
    daten.bereiche.filter((b) => b.fachId === fachId).sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'))
  const inBereich = (id: string | null, fachId: string): Material[] =>
    sichtbar.filter((m) => (id ? zuordnung(m) === id : !bereichVon(m) && fachVon(m) === fachId))
  const reihenKey = (id: string | null, fachId: string): string => id ?? `ohne:${fachId}`
  const sortiert = (liste: Material[], key: string): Material[] => sortiere(liste, sortierung, daten.reihenfolge[key], arten())

  // ---------- Auswahl ----------

  const auswaehlen = (k: string, bereich: boolean, liste: string[]): void => {
    if (bereich && letzte && liste.includes(letzte)) {
      const [a, b] = [liste.indexOf(letzte), liste.indexOf(k)].sort((x, y) => x - y)
      setAuswahl([...new Set([...auswahl, ...liste.slice(a, b + 1)])])
    } else setAuswahl(auswahl.includes(k) ? auswahl.filter((x) => x !== k) : [...auswahl, k])
    setLetzte(k)
  }
  const auswahlEnde = (): void => {
    setAuswahl([])
    setAuswahlModus(false)
  }
  useEffect(() => {
    if (!auswahl.length) return
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') auswahlEnde()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [auswahl.length])

  // ---------- Ziehen und Ablegen ----------

  const ablegen = (e: React.DragEvent, ziel: Themenbereich | null): void => {
    e.preventDefault()
    setUeber(null)
    let keys: string[] = []
    try {
      keys = JSON.parse(e.dataTransfer.getData(MIME)) as string[]
    } catch {
      return
    }
    // Was schon von Hand dort liegt, muss nicht noch einmal „verschoben" werden
    const noetig = keys.filter((k) => {
      const z = daten.zuordnungen[k]
      return !(z?.von === 'hand' && z.bereichId === (ziel?.id ?? null))
    })
    if (noetig.length) void verschieben(noetig, ziel)
    setAuswahl([])
  }
  const ablageZiel = (id: string, ziel: Themenbereich | null): React.HTMLAttributes<HTMLElement> & { 'data-ablage': string; 'data-ueber': boolean } => ({
    'data-ablage': id,
    'data-ueber': ueber === id,
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (ueber !== id) setUeber(id)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUeber((u) => (u === id ? null : u))
    },
    onDrop: (e) => ablegen(e, ziel)
  })

  // ---------- Eine Karte ----------

  const karte = (m: Material, liste: string[], reihe: { key: string; bereich: Themenbereich | null } | null): React.JSX.Element => {
    const k = schluesselVon(m)
    const gewaehlt = auswahl.includes(k)
    const z = daten.zuordnungen[k]
    const eigen = m.moduleId === moduleId && renderEigen
    const umsortierbar = reihe && sortierung === 'eigen'
    return (
      <Box
        key={k}
        className="material-huelle"
        data-art={m.moduleId}
        data-material={m.name}
        data-ausgewaehlt={gewaehlt}
        style={{ '--art': artFarbe(m.moduleId) } as React.CSSProperties}
        draggable
        onDragStart={(e) => {
          const keys = gewaehlt ? auswahl : [k]
          e.dataTransfer.setData(MIME, JSON.stringify(keys))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClickCapture={(e) => {
          if (!(auswahlModus || e.ctrlKey || e.metaKey || e.shiftKey)) return
          e.preventDefault()
          e.stopPropagation()
          auswaehlen(k, e.shiftKey, liste)
        }}
        {...(umsortierbar
          ? {
              onDragOver: (e: React.DragEvent) => {
                if (!e.dataTransfer.types.includes(MIME)) return
                e.preventDefault()
                e.stopPropagation()
                if (ueber !== `vor:${k}`) setUeber(`vor:${k}`)
              },
              onDrop: (e: React.DragEvent) => {
                e.preventDefault()
                e.stopPropagation()
                setUeber(null)
                let keys: string[] = []
                try {
                  keys = JSON.parse(e.dataTransfer.getData(MIME)) as string[]
                } catch {
                  return
                }
                if (keys.includes(k)) return
                const fremd = keys.filter((x) => !liste.includes(x))
                // Aus einem anderen Bereich hereingezogen: erst verschieben, dann einreihen
                if (fremd.length) void verschieben(fremd, reihe.bereich)
                void reihenfolgeSetzen(reihe.key, umstellen(liste, keys, k))
                setAuswahl([])
              },
              'data-einfuegen': ueber === `vor:${k}`
            }
          : {})}
      >
        {auswahlModus && <Checkbox className="material-haken" checked={gewaehlt} readOnly aria-label={`„${m.name}“ auswählen`} tabIndex={-1} />}
        {z?.von === 'auto' && z.bereichId && (
          <Tooltip label="Automatisch einsortiert – durch Verschieben von Hand festlegen" withinPortal>
            <span className="material-auto" aria-label="automatisch einsortiert">
              <IconWand size={12} />
            </span>
          </Tooltip>
        )}
        {eigen ? renderEigen(m) : <FremdKarte material={m} onVerschieben={() => setVerschiebenFuer([k])} />}
      </Box>
    )
  }

  const liste = (materialien: Material[], reihe: { key: string; bereich: Themenbereich | null } | null): React.JSX.Element => {
    const keys = materialien.map(schluesselVon)
    const inhalt = materialien.map((m) => karte(m, keys, reihe))
    return darstellung === 'karten' && moduleId ? (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {inhalt}
      </SimpleGrid>
    ) : (
      <Stack gap="xs">{inhalt}</Stack>
    )
  }

  const neuHier = async (b: Themenbereich, modulId?: string): Promise<void> => {
    try {
      // Das neue Material beginnt im Fach des Bereichs (Rest aus Paket 10b)
      setzeFachVorgabe(modulId ?? moduleId ?? '', b.fachId)
      const id = modulId && modulId !== moduleId ? await neuAnlegen(modulId) : onNeu ? await onNeu() : null
      if (id) await neuImBereich(modulId ?? moduleId ?? '', id, b)
    } catch (e) {
      notifyError(e)
    }
  }

  const verschiebenAus = (eintragId: string): void => {
    if (moduleId) setVerschiebenFuer(auswahl.includes(materialSchluessel(moduleId, eintragId)) ? auswahl : [materialSchluessel(moduleId, eintragId)])
  }

  // ---------- Kopfleiste: Jahrgang, Umfang, Auswahl ----------

  const kopf = (
    <Group justify="space-between" gap="sm" mb="sm" wrap="wrap" className="themen-kopf">
      <Group gap={6} wrap="wrap">
        {jahrgaenge.length > 1 || jahrgang ? (
          <Chip.Group multiple={false} value={jahrgang ? String(jahrgang) : 'alle'} onChange={(v) => setJahrgang(v === 'alle' ? null : Number(v))}>
            <Group gap={6} wrap="wrap" aria-label="Jahrgang">
              <Chip value="alle" size="xs" variant="outline">
                Alle Jahrgänge
              </Chip>
              {[...new Set([...jahrgaenge, ...(jahrgang ? [jahrgang] : [])])]
                .sort((a, b) => a - b)
                .map((g) => (
                  <Chip key={g} value={String(g)} size="xs" variant="outline" data-jahrgang={g}>
                    Klasse {g}
                  </Chip>
                ))}
            </Group>
          </Chip.Group>
        ) : null}
      </Group>
      <Group gap="xs" wrap="wrap">
        {moduleId && artPlural && (
          <SegmentedControl
            size="xs"
            value={umfang}
            onChange={(v) => setUmfang(v as 'nur' | 'alle')}
            aria-label="Welche Materialien"
            data={[
              { value: 'nur', label: `nur ${artPlural}` },
              { value: 'alle', label: 'alle Materialien' }
            ]}
          />
        )}
        <Tooltip label="Mehrere Materialien auswählen (auch mit Strg- oder Umschalt-Klick)">
          <Button
            size="compact-sm"
            variant={auswahlModus ? 'filled' : 'default'}
            leftSection={<IconListCheck size={14} />}
            onClick={() => (auswahlModus ? auswahlEnde() : setAuswahlModus(true))}
          >
            Auswählen
          </Button>
        </Tooltip>
      </Group>
    </Group>
  )

  const auswahlLeiste = auswahl.length > 0 && (
    <Card withBorder padding="xs" mb="sm" className="themen-auswahl">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text size="sm" fw={600}>
          {auswahl.length === 1 ? '1 Material ausgewählt' : `${auswahl.length} Materialien ausgewählt`} – auf einen Ordner ziehen oder:
        </Text>
        <Group gap="xs">
          <Button size="compact-sm" leftSection={<IconFolderShare size={14} />} onClick={() => setVerschiebenFuer(auswahl)}>
            Verschieben nach …
          </Button>
          <Button size="compact-sm" variant="default" leftSection={<IconX size={14} />} onClick={auswahlEnde}>
            Auswahl aufheben
          </Button>
        </Group>
      </Group>
    </Card>
  )

  // Leere Bibliothek eines Programms: Den Hinweis dazu gibt die Bibliothek selbst
  const leer = geladen !== null && sichtbar.length === 0 && !(moduleId && umfang === 'nur' && eigene.length === 0 && !jahrgang)

  // ---------- Geöffneter Bereich ----------

  if (offenerBereich) {
    const b = offenerBereich
    const inhalt = sortiert(inBereich(b.id, b.fachId), b.id)
    const andere = bereicheIn(b.fachId).filter((x) => x.id !== b.id)
    return (
      <VerschiebenKontext.Provider value={verschiebenAus}>
        {kopf}
        <BereichKopf
          bereich={b}
          anzahl={inhalt.length}
          onZurueck={(fach) => setOrt({ fachId: fach ? b.fachId : null, bereichId: null })}
          sortierung={sortierung}
          onSortierung={setSortierung}
          neu={
            moduleId && onNeu ? (
              <Button size="compact-sm" leftSection={<IconFilePlus size={14} />} onClick={() => void neuHier(b)}>
                Neu in diesem Bereich
              </Button>
            ) : (
              <Menu withinPortal position="bottom-end">
                <Menu.Target>
                  <Button size="compact-sm" leftSection={<IconFilePlus size={14} />}>
                    Neu in diesem Bereich …
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {modules
                    .filter((m) => arten().includes(m.id))
                    .map((m) => (
                      <Menu.Item key={m.id} onClick={() => void neuHier(b, m.id)}>
                        {m.name}
                      </Menu.Item>
                    ))}
                </Menu.Dropdown>
              </Menu>
            )
          }
        />
        {auswahlLeiste}
        {/* Ablageziele: die übrigen Bereiche des Fachs und „Ohne Themenbereich" */}
        <Group gap={6} mb="md" wrap="wrap" className="themen-ziele">
          <Text size="xs" c="dimmed">
            Ablegen in:
          </Text>
          {andere.map((x) => (
            <UnstyledButton key={x.id} className="themen-ziel" onClick={() => setOrt({ fachId: x.fachId, bereichId: x.id })} {...ablageZiel(x.id, x)}>
              <OrdnerSymbol fach={x.fachId} groesse={14} /> {x.name}
            </UnstyledButton>
          ))}
          <UnstyledButton className="themen-ziel" onClick={() => setOrt({ fachId: b.fachId, bereichId: null })} {...ablageZiel(`ohne:${b.fachId}`, null)}>
            Ohne Themenbereich
          </UnstyledButton>
        </Group>
        {inhalt.length ? (
          liste(inhalt, { key: b.id, bereich: b })
        ) : (
          <Text c="dimmed" size="sm" ta="center" py="xl" data-bereich-leer>
            {jahrgang ? `In Klasse ${jahrgang} liegt hier noch nichts.` : 'Noch leer. Materialien hierher ziehen oder „Verschieben nach …" im ⋯-Menü wählen.'}
          </Text>
        )}
        {sortierung === 'eigen' && inhalt.length > 1 && (
          <Text size="xs" c="dimmed" mt="xs">
            Eigene Reihenfolge: Karten auf eine andere Karte ziehen, um sie davor einzureihen.
          </Text>
        )}
        <VerschiebenDialog
          schluessel={verschiebenFuer}
          materialien={alle}
          fachVon={fachVon}
          onClose={() => setVerschiebenFuer(null)}
          onFertig={() => setAuswahl([])}
        />
      </VerschiebenKontext.Provider>
    )
  }

  // ---------- Übersicht: Fächer mit ihren Ordnern ----------

  const gezeigteFaecher = ort.fachId ? faecher.filter((f) => f === ort.fachId) : faecher
  return (
    <VerschiebenKontext.Provider value={verschiebenAus}>
      {kopf}
      {auswahlLeiste}
      {ort.fachId && (
        <Breadcrumbs separator="›" mb="sm">
          <Anchor component="button" size="sm" onClick={() => setOrt({ fachId: null, bereichId: null })}>
            Alle Fächer
          </Anchor>
          <Text size="sm" fw={600}>
            {fachAnzeige(ort.fachId)}
          </Text>
        </Breadcrumbs>
      )}
      {leer && gezeigteFaecher.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="xl" data-themen-leer>
          {jahrgang ? `Für Klasse ${jahrgang} gibt es hier noch nichts.` : 'Noch keine Materialien.'}
        </Text>
      )}
      {gezeigteFaecher.map((fachId) => {
        // Mit Jahrgangsfilter nur Bereiche, in denen für diesen Jahrgang etwas liegt
        const bereiche = bereicheIn(fachId).filter((b) => !jahrgang || inBereich(b.id, fachId).length > 0)
        const ohne = sortiert(inBereich(null, fachId), reihenKey(null, fachId))
        return (
          <Box key={fachId} mb="lg" data-fach-abschnitt={fachId}>
            <Group justify="space-between" gap="xs" mt="md" mb="xs" wrap="nowrap">
              <UnstyledButton onClick={() => setOrt({ fachId, bereichId: null })} aria-label={`Nur ${fachAnzeige(fachId)} zeigen`}>
                <Group gap="xs" wrap="nowrap" className="fach-ueberschrift">
                  <FachPunkt fach={fachId} groesse={12} />
                  <Title order={4}>{fachAnzeige(fachId)}</Title>
                </Group>
              </UnstyledButton>
              <FachMenue fachId={fachId} onNeu={() => setNeuerBereich({ fachId, name: '' })} />
            </Group>

            <VorschlagHinweis fachId={fachId} alle={alle} jahrgang={jahrgang} />

            {(bereiche.length > 0 || neuerBereich?.fachId === fachId) && (
              <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm" mb="sm">
                {bereiche.map((b) => (
                  <OrdnerKachel
                    key={b.id}
                    bereich={b}
                    anzahl={inBereich(b.id, fachId).length}
                    onOeffnen={() => setOrt({ fachId, bereichId: b.id })}
                    ablage={ablageZiel(b.id, b)}
                  />
                ))}
                {neuerBereich?.fachId === fachId && (
                  <NeuerBereichKachel
                    wert={neuerBereich.name}
                    onChange={(name) => setNeuerBereich({ fachId, name })}
                    onAbbrechen={() => setNeuerBereich(null)}
                    onAnlegen={async () => {
                      if (await bereichAnlegen(fachId, neuerBereich.name)) setNeuerBereich(null)
                    }}
                  />
                )}
              </SimpleGrid>
            )}

            {ohne.length > 0 && (
              <Box className="themen-ohne" {...(bereiche.length ? ablageZiel(`ohne:${fachId}`, null) : {})}>
                {bereiche.length > 0 && (
                  <Text size="sm" fw={600} c="dimmed" mb={6}>
                    Ohne Themenbereich ({ohne.length})
                  </Text>
                )}
                {liste(ohne, { key: reihenKey(null, fachId), bereich: null })}
              </Box>
            )}
          </Box>
        )
      })}
      <VerschiebenDialog
        schluessel={verschiebenFuer}
        materialien={alle}
        fachVon={fachVon}
        onClose={() => setVerschiebenFuer(null)}
        onFertig={() => setAuswahl([])}
      />
    </VerschiebenKontext.Provider>
  )
}

// ---------- Bausteine ----------

/** Ordnersymbol in der Fachfarbe */
function OrdnerSymbol({ fach, groesse = 28, offen }: { fach: string; groesse?: number; offen?: boolean }): React.JSX.Element {
  const farbe = useFachFarbe(fach) ?? undefined
  const Symbol = offen ? IconFolderOpen : IconFolder
  return <Symbol size={groesse} color={farbe} style={{ flexShrink: 0, verticalAlign: 'middle' }} />
}

/** Ein Themenbereich als Ordner – Klick öffnet, Karten lassen sich darauf ablegen */
function OrdnerKachel({
  bereich: b,
  anzahl,
  onOeffnen,
  ablage
}: {
  bereich: Themenbereich
  anzahl: number
  onOeffnen: () => void
  ablage: React.HTMLAttributes<HTMLElement>
}): React.JSX.Element {
  const [umbenennen, setUmbenennen] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  if (umbenennen !== null)
    return (
      <Card withBorder padding="sm">
        <TextInput
          size="xs"
          aria-label="Neuer Name des Themenbereichs"
          value={umbenennen}
          autoFocus
          onChange={(e) => setUmbenennen(e.currentTarget.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Escape') setUmbenennen(null)
            if (e.key === 'Enter' && umbenennen.trim() && (await bereichUmbenennen(b, umbenennen))) setUmbenennen(null)
          }}
          onBlur={() => setUmbenennen(null)}
        />
      </Card>
    )
  return (
    <Card withBorder padding="sm" className="themen-ordner" data-bereich={b.name} {...ablage}>
      <Group gap="sm" wrap="nowrap" justify="space-between">
        <UnstyledButton onClick={onOeffnen} style={{ minWidth: 0, flex: 1 }} aria-label={`Themenbereich „${b.name}“ öffnen`}>
          <Group gap="sm" wrap="nowrap">
            <OrdnerSymbol fach={b.fachId} />
            <div style={{ minWidth: 0 }}>
              <Text fw={600} lineClamp={2}>
                {b.name}
              </Text>
              <Text size="xs" c="dimmed">
                {anzahl ? anzahlText(anzahl) : 'leer'}
              </Text>
            </div>
          </Group>
        </UnstyledButton>
        <BereichMenue bereich={b} onUmbenennen={() => setUmbenennen(b.name)} onLoeschen={() => setLoeschen(true)} />
      </Group>
      {loeschen && <LoeschenRueckfrage bereich={b} onAbbrechen={() => setLoeschen(false)} />}
    </Card>
  )
}

function NeuerBereichKachel({
  wert,
  onChange,
  onAbbrechen,
  onAnlegen
}: {
  wert: string
  onChange: (s: string) => void
  onAbbrechen: () => void
  onAnlegen: () => void
}): React.JSX.Element {
  return (
    <Card withBorder padding="sm" className="themen-ordner-neu">
      <Stack gap={6}>
        <TextInput
          size="xs"
          placeholder="Name, z. B. Ökologie"
          aria-label="Name des neuen Themenbereichs"
          value={wert}
          autoFocus
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && wert.trim()) onAnlegen()
            if (e.key === 'Escape') onAbbrechen()
          }}
        />
        <Group gap={6}>
          <Button size="compact-xs" disabled={!wert.trim()} onClick={onAnlegen}>
            Anlegen
          </Button>
          <Button size="compact-xs" variant="default" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

/** ⋯ am Bereich: Umbenennen, Löschen (am Rechner) */
function BereichMenue({ bereich, onUmbenennen, onLoeschen }: { bereich: Themenbereich; onUmbenennen: () => void; onLoeschen: () => void }): React.JSX.Element {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" aria-label={`Weitere Aktionen für den Themenbereich „${bereich.name}“`}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={14} />} onClick={onUmbenennen}>
          Umbenennen
        </Menu.Item>
        {/* Löschen gibt es wie bei den Materialien nur am Rechner */}
        {!imNetz() && (
          <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={onLoeschen}>
            Löschen
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Rückfrage direkt am Bereich wie in der Bibliothek (Enter bestätigt, Esc bricht ab); die Materialien bleiben erhalten */
function LoeschenRueckfrage({ bereich, onAbbrechen }: { bereich: Themenbereich; onAbbrechen: () => void }): React.JSX.Element {
  const los = (): void => {
    onAbbrechen()
    void bereichLoeschen(bereich)
  }
  useConfirmKeys(true, los, onAbbrechen)
  return (
    <Alert color="red" mt="xs" p="xs" data-bereich-loeschen>
      <Stack gap={6}>
        <Text size="sm">„{bereich.name}“ löschen? Die Materialien bleiben erhalten und stehen danach unter „Ohne Themenbereich“.</Text>
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="default" onClick={onAbbrechen}>
            Abbrechen
          </Button>
          <Button size="xs" color="red" autoFocus onClick={los}>
            Löschen
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}

/** Kopf eines geöffneten Bereichs: Pfad, Sortierung, „Neu in diesem Bereich", ⋯ */
function BereichKopf({
  bereich: b,
  anzahl,
  onZurueck,
  sortierung,
  onSortierung,
  neu
}: {
  bereich: Themenbereich
  anzahl: number
  onZurueck: (fach: boolean) => void
  sortierung: Sortierung
  onSortierung: (s: Sortierung) => void
  neu: React.ReactNode
}): React.JSX.Element {
  const [umbenennen, setUmbenennen] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  return (
    <Stack gap="xs" mb="sm">
      <Breadcrumbs separator="›">
        <Anchor component="button" size="sm" onClick={() => onZurueck(false)}>
          Alle Fächer
        </Anchor>
        <Anchor component="button" size="sm" onClick={() => onZurueck(true)}>
          <Group gap={6} wrap="nowrap">
            <FachPunkt fach={b.fachId} />
            {fachAnzeige(b.fachId)}
          </Group>
        </Anchor>
        <Text size="sm" fw={600}>
          {b.name}
        </Text>
      </Breadcrumbs>
      <Group justify="space-between" wrap="wrap" gap="sm">
        {umbenennen !== null ? (
          <TextInput
            aria-label="Neuer Name des Themenbereichs"
            value={umbenennen}
            autoFocus
            onChange={(e) => setUmbenennen(e.currentTarget.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') setUmbenennen(null)
              if (e.key === 'Enter' && umbenennen.trim() && (await bereichUmbenennen(b, umbenennen))) setUmbenennen(null)
            }}
            onBlur={() => setUmbenennen(null)}
          />
        ) : (
          <Group gap="sm" wrap="nowrap" data-offener-bereich={b.name}>
            <OrdnerSymbol fach={b.fachId} offen />
            <Title order={3}>{b.name}</Title>
            <Text c="dimmed" size="sm">
              {anzahlText(anzahl)}
            </Text>
            <BereichMenue bereich={b} onUmbenennen={() => setUmbenennen(b.name)} onLoeschen={() => setLoeschen(true)} />
          </Group>
        )}
        <Group gap="xs" wrap="wrap">
          <Select
            size="xs"
            w={190}
            aria-label="Reihenfolge im Bereich"
            data={SORTIERUNGEN}
            value={sortierung}
            allowDeselect={false}
            onChange={(v) => v && onSortierung(v as Sortierung)}
          />
          {neu}
        </Group>
      </Group>
      {loeschen && <LoeschenRueckfrage bereich={b} onAbbrechen={() => setLoeschen(false)} />}
    </Stack>
  )
}

/** ⋯ am Fach: neuer Bereich, Automatik ein/aus */
function FachMenue({ fachId, onNeu }: { fachId: string; onNeu: () => void }): React.JSX.Element {
  const automatik = useThemen((s) => Boolean(s.daten.automatik[fachId]))
  return (
    <Group gap={4} wrap="nowrap">
      <Button size="compact-sm" variant="subtle" leftSection={<IconFolderPlus size={14} />} onClick={onNeu}>
        Themenbereich
      </Button>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label={`Einstellungen der Themenbereiche in ${fachAnzeige(fachId)}`}>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconWand size={14} />}
            rightSection={automatik ? '✓' : undefined}
            onClick={() =>
              window.api.themen
                .automatik(fachId, !automatik)
                .then((d) => useThemen.setState({ daten: d }))
                .catch(notifyError)
            }
          >
            Neue Materialien automatisch einsortieren
          </Menu.Item>
          <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={() => openThemen(fachId)}>
            Alle Materialarten dieses Fachs zeigen
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}

/** Material eines anderen Programms: Programmbild (Name als Tooltip), Titel, Kurzinfo; öffnet im richtigen Programm */
export function FremdKarte({ material: m, onVerschieben }: { material: Material; onVerschieben?: () => void }): React.JSX.Element {
  const p = modul(m.moduleId)
  const oeffnen = (): void => void openDocument(m.moduleId, m.id)
  return (
    <Card withBorder padding="sm" data-bibliothek-eintrag={m.name}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        {p?.leistenbild ? (
          <img src={p.leistenbild} width={30} height={30} alt={p.name} title={p.name} draggable={false} style={{ borderRadius: 7, flexShrink: 0 }} />
        ) : (
          p && (
            <Tooltip label={p.name}>
              <span>
                <p.icon size={22} />
              </span>
            </Tooltip>
          )
        )}
        <div
          role="button"
          tabIndex={0}
          title={p?.name}
          aria-label={`„${m.name}“ öffnen (${p?.name ?? ''})`}
          style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
          onClick={oeffnen}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              oeffnen()
            }
          }}
        >
          <Group gap={6} wrap="nowrap">
            <Text fw={600} size="sm" truncate>
              {m.name}
            </Text>
            {m.entwurf && (
              <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                Entwurf
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {m.detail}
          </Text>
        </div>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={`Weitere Aktionen für „${m.name}“`}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={oeffnen}>
              Öffnen in „{p?.name}“
            </Menu.Item>
            {onVerschieben && (
              <Menu.Item leftSection={<IconFolderShare size={14} />} onClick={onVerschieben}>
                Verschieben nach …
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Card>
  )
}

/** „Verschieben nach …" – für Tastatur und Tablet, wo Ziehen mühsam ist */
function VerschiebenDialog({
  schluessel,
  materialien,
  fachVon,
  onClose,
  onFertig
}: {
  schluessel: string[] | null
  materialien: Material[]
  fachVon: (m: Material) => string
  onClose: () => void
  onFertig: () => void
}): React.JSX.Element {
  const daten = useThemen((s) => s.daten)
  const [neu, setNeu] = useState('')
  const gewaehlt = materialien.filter((m) => schluessel?.includes(schluesselVon(m)))
  const faecher = [...new Set(gewaehlt.map(fachVon))]
  const hier = new Set(gewaehlt.map((m) => daten.zuordnungen[schluesselVon(m)]?.bereichId ?? null))
  const nach = async (ziel: Themenbereich | null): Promise<void> => {
    if (schluessel) await verschieben(schluessel, ziel)
    setNeu('')
    onFertig()
    onClose()
  }
  const titel = gewaehlt.length === 1 ? `„${gewaehlt[0].name}“ verschieben nach …` : `${gewaehlt.length} Materialien verschieben nach …`
  return (
    <Modal opened={schluessel !== null} onClose={onClose} title={titel} size="md">
      <Stack gap="xs" data-verschieben-dialog>
        {faecher.map((fachId) => (
          <Stack key={fachId} gap={4}>
            {faecher.length > 1 && (
              <Text size="xs" fw={600} c="dimmed">
                {fachAnzeige(fachId)}
              </Text>
            )}
            {daten.bereiche
              .filter((b) => b.fachId === fachId)
              .sort((a, b) => a.reihenfolge - b.reihenfolge)
              .map((b, i) => (
                <Button
                  key={b.id}
                  variant={hier.has(b.id) && hier.size === 1 ? 'light' : 'default'}
                  justify="flex-start"
                  leftSection={<OrdnerSymbol fach={b.fachId} groesse={18} />}
                  onClick={() => void nach(b)}
                  data-autofocus={i === 0 ? true : undefined}
                >
                  {b.name}
                  {hier.has(b.id) && hier.size === 1 ? ' (hier)' : ''}
                </Button>
              ))}
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="Neuer Themenbereich …"
                aria-label={`Neuer Themenbereich in ${fachAnzeige(fachId)}`}
                value={neu}
                onChange={(e) => setNeu(e.currentTarget.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !neu.trim()) return
                  const b = await bereichAnlegen(fachId, neu)
                  if (b) await nach(b)
                }}
              />
              <Button
                size="xs"
                variant="default"
                disabled={!neu.trim()}
                onClick={async () => {
                  const b = await bereichAnlegen(fachId, neu)
                  if (b) await nach(b)
                }}
              >
                Anlegen und verschieben
              </Button>
            </Group>
          </Stack>
        ))}
        <Button variant="subtle" color="gray" justify="flex-start" onClick={() => void nach(null)}>
          Ohne Themenbereich
        </Button>
      </Stack>
    </Modal>
  )
}

/**
 * Hinweis mit Vorschlägen: ab 8 Materialien im Fach (bzw. im gefilterten Jahrgang), sofern
 * etwas vorzuschlagen ist. Unaufdringlich: eine Zeile, erst „Ansehen" zeigt die Auswahl. „Nicht
 * jetzt" merkt sich genau diesen Vorschlag; kommen neue Gruppen dazu, erscheint er wieder.
 */
function VorschlagHinweis({ fachId, alle, jahrgang }: { fachId: string; alle: Material[]; jahrgang: number | null }): React.JSX.Element | null {
  const daten = useThemen((s) => s.daten)
  const geladen = useThemen((s) => s.geladen)
  const [offen, setOffen] = useState(false)
  const [abgewaehlt, setAbgewaehlt] = useState<string[]>([])
  const [aus, setAus] = useState<Record<string, string>>(() => lies(VORSCHLAG_AUS_KEY, {}))
  const vorschlaege = useMemo(
    () => (geladen ? vorschlagen(alle, daten, fachId, { jahrgang, katalog: katalogFuer(fachId) }) : []),
    [alle, daten, fachId, jahrgang, geladen]
  )
  const merkmal = vorschlaege.map((v) => `${v.name}:${v.schluessel.length}`).join('|')
  const auswahlKey = `${fachId}|${jahrgang ?? ''}`
  if (!vorschlaege.length || aus[auswahlKey] === merkmal) return null

  const gewaehlt = vorschlaege.filter((v) => !abgewaehlt.includes(v.name))
  const uebernehmen = (liste: Vorschlag[]): void => {
    setOffen(false)
    void vorschlaegeUebernehmen(
      liste.map((v) => ({ fachId: v.fachId, name: v.name, bereichId: v.bereichId, schluessel: v.schluessel })),
      fachId
    )
  }
  const titel = (v: Vorschlag): string =>
    alle
      .filter((m) => v.schluessel.includes(schluesselVon(m)))
      .map((m) => m.name)
      .join(', ')
  const herkunft = (v: Vorschlag): string =>
    v.herkunft === 'bereich'
      ? 'passt zu einem vorhandenen Bereich'
      : v.herkunft === 'lehrplan'
        ? 'Thema aus dem Lehrplan'
        : v.herkunft === 'lehrwerk'
          ? 'Kapitel des Lehrwerks'
          : v.herkunft === 'grammatik'
            ? 'Grammatikthema'
            : 'gemeinsames Stichwort'

  return (
    <Alert variant="light" color="blue" icon={<IconBulb size={18} />} mb="sm" p="xs" className="themen-vorschlag" data-vorschlag={fachId}>
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Text size="sm">
          <b>Vorgeschlagen:</b> {vorschauText(vorschlaege)}
        </Text>
        <Group gap={6}>
          {!offen && (
            <>
              <Button size="compact-xs" onClick={() => uebernehmen(vorschlaege)}>
                Übernehmen
              </Button>
              <Button size="compact-xs" variant="light" onClick={() => setOffen(true)}>
                Ansehen und auswählen
              </Button>
            </>
          )}
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              const neu = { ...aus, [auswahlKey]: merkmal }
              setAus(neu)
              merke(VORSCHLAG_AUS_KEY, neu)
            }}
          >
            Nicht jetzt
          </Button>
        </Group>
      </Group>
      {offen && (
        <Stack gap={6} mt="xs">
          <Text size="xs" c="dimmed">
            Lokal ermittelt, ohne KI – aus Lehrplan- und Lehrwerksthemen und ähnlichen Titeln. Danach werden neue Materialien dieses Fachs automatisch
            einsortiert; von Hand Verschobenes bleibt, wo es ist.
          </Text>
          {vorschlaege.map((v) => (
            <Tooltip key={v.name} label={titel(v)} multiline w={380} withinPortal openDelay={300}>
              <Checkbox
                size="xs"
                checked={!abgewaehlt.includes(v.name)}
                onChange={(e) => setAbgewaehlt(e.currentTarget.checked ? abgewaehlt.filter((x) => x !== v.name) : [...abgewaehlt, v.name])}
                label={`${v.name} (${v.schluessel.length}) – ${herkunft(v)}`}
              />
            </Tooltip>
          ))}
          <Group gap="xs" mt={4}>
            <Button size="xs" disabled={!gewaehlt.length} onClick={() => uebernehmen(gewaehlt)}>
              {gewaehlt.length === 1 ? '1 Bereich übernehmen' : `${gewaehlt.length} Bereiche übernehmen`}
            </Button>
            <Button size="xs" variant="default" onClick={() => setOffen(false)}>
              Schließen
            </Button>
          </Group>
        </Stack>
      )}
    </Alert>
  )
}
