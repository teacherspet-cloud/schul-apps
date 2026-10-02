import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Stack, Text, TextInput, Title } from '@mantine/core'
import { nurPcNetz } from '../plattform'
import { TeilenMenuePunkt } from './Fachordner'
import { IconArrowLeft, IconCopy, IconDots, IconFolderShare, IconPencil, IconSearch, IconTrash } from '@tabler/icons-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { sichereAlles } from '../autosave'
import { kopieName, loescheDokument, passtZurSuche } from '../bibliothek'
import { useMenueFokus } from '../menueFokus'
import { useConfirmKeys } from '../useConfirmKeys'
import { notifyError, notifySuccess, uid } from '../util'
import WischZeile from '../touch/WischZeile'
import { FachPunkt } from './FachFarbe'
import { zuordnungKopieren, zuordnungVergessen } from '../themenbereiche'

/**
 * „Verschieben nach …" im ⋯-Menü jedes Eintrags (Paket 10b). Die Themenansicht
 * (Themenbereiche.tsx) stellt die Aktion bereit; außerhalb davon (Suchtreffer) fehlt der Punkt.
 */
export const VerschiebenKontext = createContext<((eintragId: string) => void) | null>(null)

/**
 * Gemeinsame Teile der fünf Bibliotheken (Vokabeltest, Arbeitsblatt, Lernzielkontrolle,
 * Grammatiktest, Klassenarbeit).
 *
 * Anlass (25.09.2026): Die fünf waren getrennt gewachsen und verhielten sich verschieden –
 * Suche nur in zweien, Umbenennen mal mit Enter, mal nur per Knopf, Löschen mal als
 * Fenster, mal als Zeile, mal als Rückfrage des Browsers; Öffnen teils nur per Doppelklick;
 * Duplizieren nirgends. Hier steht das Verhalten jetzt EINMAL. Das Aussehen der Einträge
 * (Ordner und Vorschaubilder beim Arbeitsblatt, Zeilen sonst) bleibt Sache der Programme.
 */

export interface BibliotheksEintrag {
  id: string
  name: string
  updatedAt: string
}

/** Die Bibliotheksaufrufe eines Programms (window.api.sheets, .tests, .exams …) */
export interface BibliotheksApi<M extends BibliotheksEintrag> {
  list(): Promise<M[]>
  get(id: string): Promise<M & { payload: unknown; createdAt: string; thumb?: string }>
  save(input: { id: string; name: string; stats: object; payload: unknown; thumb?: string }): Promise<M>
  delete(id: string): Promise<M[]>
}

export interface Bibliothek<M extends BibliotheksEintrag> {
  /** null, solange die Liste lädt */
  eintraege: M[] | null
  suche: string
  setSuche: (s: string) => void
  /** Einträge, die zur Suche passen (alle, wenn nichts eingegeben ist) */
  treffer: (felder: (e: M) => (string | number | null | undefined)[]) => M[]
  umbenennen: { id: string; name: string } | null
  setUmbenennen: (u: { id: string; name: string } | null) => void
  umbenennenSpeichern: () => Promise<void>
  loeschen: M | null
  setLoeschen: (e: M | null) => void
  loeschenBestaetigen: () => Promise<void>
  kopieren: (id: string) => Promise<M | null>
  /** Die zuletzt angelegte Kopie – wird hervorgehoben, damit man sie gleich findet */
  neuId: string | null
  /** Programm (modules/registry.ts) – für „Mit der Fachschaft teilen" (Server) */
  moduleId?: string
}

/**
 * Zustand und Aktionen einer Bibliothek.
 *
 * `offeneId` nennt das gerade im Programm offene Dokument: Wird es umbenannt, übernimmt der
 * Editor den Namen (sonst schriebe die nächste Sicherung den alten zurück); wird es
 * gelöscht, schließt das Programm es (`geloescht`) – sonst legte die nächste Sicherung den
 * Eintrag stillschweigend wieder an (siehe `loescheDokument` in shared/bibliothek.ts).
 */
export function useBibliothek<M extends BibliotheksEintrag>(
  api: BibliotheksApi<M>,
  opts: {
    offeneId: () => string | null
    umbenannt?: (meta: M) => void
    geloescht?: () => void
    /** Programm (modules/registry.ts) – damit Kopie und Löschen die Zuordnung zum Themenbereich mitnehmen */
    moduleId?: string
  }
): Bibliothek<M> {
  const [eintraege, setEintraege] = useState<M[] | null>(null)
  const [suche, setSuche] = useState('')
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string } | null>(null)
  const [loeschen, setLoeschen] = useState<M | null>(null)
  const [neuId, setNeuId] = useState<string | null>(null)
  const aktuell = useRef(opts)
  aktuell.current = opts

  useEffect(() => {
    api.list().then(setEintraege).catch(notifyError)
  }, [api])

  /** Gespeicherten Stand holen – vorher das offene Dokument sichern, damit nichts Älteres kopiert wird */
  const holen = async (id: string): Promise<{ name: string; stats: object; payload: unknown; thumb?: string }> => {
    await sichereAlles()
    const { id: _id, name, createdAt: _c, updatedAt: _u, payload, thumb, ...stats } = await api.get(id)
    return { name, stats, payload, thumb }
  }

  const umbenennenSpeichern = async (): Promise<void> => {
    if (!umbenennen) return
    const name = umbenennen.name.trim()
    if (!name) return
    try {
      const alt = await holen(umbenennen.id)
      const meta = await api.save({ ...alt, id: umbenennen.id, name })
      if (aktuell.current.offeneId() === meta.id) aktuell.current.umbenannt?.(meta)
      setEintraege(await api.list())
      setUmbenennen(null)
    } catch (e) {
      notifyError(e)
    }
  }

  const loeschenBestaetigen = useCallback(async (): Promise<void> => {
    if (!loeschen) return
    try {
      // Anstehendes vorher sichern, offenes Dokument schließen, Kennung als gelöscht merken (shared/bibliothek.ts)
      setEintraege(await loescheDokument((id) => api.delete(id), loeschen.id, aktuell.current))
      if (aktuell.current.moduleId) void zuordnungVergessen(aktuell.current.moduleId, loeschen.id)
      setLoeschen(null)
    } catch (e) {
      notifyError(e, 'Das Löschen hat nicht geklappt')
    }
  }, [api, loeschen])
  // Enter bestätigt die Löschen-Rückfrage, Esc bricht ab
  useConfirmKeys(
    loeschen !== null,
    () => void loeschenBestaetigen(),
    () => setLoeschen(null)
  )

  /**
   * „Kopie anlegen": neue Kennung, Name „… (Kopie)". Die Kopie wird NICHT geöffnet – sie
   * erscheint oben in der Liste und ist hervorgehoben. So bleibt das Original offen, und wer
   * die Kopie bearbeiten will, öffnet sie mit einem Klick.
   */
  const kopieren = async (id: string): Promise<M | null> => {
    try {
      const alt = await holen(id)
      const meta = await api.save({ ...alt, id: uid(), name: kopieName(alt.name) })
      // Die Kopie gehört in denselben Themenbereich wie das Original
      if (aktuell.current.moduleId) await zuordnungKopieren(aktuell.current.moduleId, id, meta.id)
      setEintraege(await api.list())
      setNeuId(meta.id)
      notifySuccess(`„${meta.name}“ angelegt.`)
      return meta
    } catch (e) {
      notifyError(e, 'Die Kopie ließ sich nicht anlegen')
      return null
    }
  }

  const treffer = (felder: (e: M) => (string | number | null | undefined)[]): M[] =>
    (eintraege ?? []).filter((e) => passtZurSuche([e.name, ...felder(e)], suche))

  return { eintraege, suche, setSuche, treffer, umbenennen, setUmbenennen, umbenennenSpeichern, loeschen, setLoeschen, loeschenBestaetigen, kopieren, neuId, moduleId: opts.moduleId }
}

/**
 * Kopf jeder Bibliothek: „Zurück zu ‚<Name>'" (solange ein Dokument offen ist), Titel,
 * Knöpfe des Programms und die Suche.
 */
export function BibliothekKopf({
  titel,
  untertitel,
  zurueck,
  onZurueck,
  suche,
  onSuche,
  suchHinweis,
  children
}: {
  titel: string
  untertitel?: string
  /** Name des offenen Dokuments; null = keins offen, dann kein Zurück-Knopf */
  zurueck: string | null
  onZurueck: () => void
  suche: string
  onSuche: (s: string) => void
  /** Wonach sich suchen lässt, z. B. „Name, Thema, Fach, Klasse" */
  suchHinweis: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <Stack gap="sm" mb="md">
      {zurueck !== null && (
        <div>
          <Button variant="subtle" size="compact-sm" leftSection={<IconArrowLeft size={14} />} onClick={onZurueck} data-bibliothek-zurueck>
            Zurück zu „{zurueck}“
          </Button>
        </div>
      )}
      <Group justify="space-between" wrap="nowrap" align="flex-start" className="bibliothek-kopf">
        <div style={{ minWidth: 0 }}>
          <Title order={2}>{titel}</Title>
          {untertitel && (
            <Text c="dimmed" size="sm">
              {untertitel}
            </Text>
          )}
        </div>
        <Group gap="xs" wrap="nowrap">
          {children}
        </Group>
      </Group>
      <TextInput
        leftSection={<IconSearch size={16} />}
        placeholder={`Suchen (${suchHinweis})`}
        aria-label={`${titel} durchsuchen`}
        value={suche}
        onChange={(e) => onSuche(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Escape' && onSuche('')}
        maw={480}
      />
    </Stack>
  )
}

/** Hinweis bei leerer Bibliothek bzw. ohne Treffer */
export function BibliothekLeer({ leer, text }: { leer: boolean; text: string }): React.JSX.Element {
  return (
    <Text c="dimmed" size="sm" ta="center" py="xl" data-bibliothek-leer>
      {leer ? text : 'Nichts gefunden. Anderen Suchbegriff versuchen.'}
    </Text>
  )
}

/** Das ⋯-Menü eines Eintrags: Umbenennen, Kopie anlegen, Löschen (am Rechner) */
export function EintragMenue<M extends BibliotheksEintrag>({
  bib,
  eintrag,
  vorne,
  offen,
  onOffen
}: {
  bib: Bibliothek<M>
  eintrag: M
  /** Zusätzliche Punkte des Programms vor den gemeinsamen */
  vorne?: React.ReactNode
  /** Von außen geöffnet (langer Druck auf den Eintrag, shared/touch/WischZeile.tsx) */
  offen?: boolean
  onOffen?: (offen: boolean) => void
}): React.JSX.Element {
  const verschieben = useContext(VerschiebenKontext)
  // Umbenennen und Löschen öffnen ein Feld bzw. eine Rückfrage mit Fokus – das Menü darf ihn nicht zurückholen
  const { menue, weiter } = useMenueFokus()
  const gesteuert = offen !== undefined && onOffen ? { opened: offen, onChange: onOffen } : {}
  return (
    <Menu position="bottom-end" withinPortal {...menue} {...gesteuert}>
      <Menu.Target>
        <ActionIcon variant="subtle" aria-label={`Weitere Aktionen für „${eintrag.name}“`}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {vorne}
        <Menu.Item leftSection={<IconPencil size={14} />} onClick={weiter(() => bib.setUmbenennen({ id: eintrag.id, name: eintrag.name }))}>
          Umbenennen
        </Menu.Item>
        <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => void bib.kopieren(eintrag.id)}>
          Kopie anlegen
        </Menu.Item>
        {verschieben && (
          <Menu.Item leftSection={<IconFolderShare size={14} />} onClick={weiter(() => verschieben(eintrag.id))}>
            Verschieben nach …
          </Menu.Item>
        )}
        {/* Server (02.10.2026): eine Kopie in den gemeinsamen Fachordner */}
        <TeilenMenuePunkt moduleId={bib.moduleId} id={eintrag.id} name={eintrag.name} />
        {/* Löschen gibt es nur am Rechner – über das Netz ist es gesperrt */}
        {!nurPcNetz() && (
          <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={weiter(() => bib.setLoeschen(eintrag))}>
            Löschen
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Umbenennen-Feld und Löschen-Rückfrage direkt am Eintrag (nur, wenn gerade aktiv) */
export function EintragRueckfragen<M extends BibliotheksEintrag>({ bib, eintrag }: { bib: Bibliothek<M>; eintrag: M }): React.JSX.Element {
  return (
    <>
      {bib.umbenennen?.id === eintrag.id && (
        <Group mt="xs" gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            aria-label="Neuer Name"
            value={bib.umbenennen.name}
            autoFocus
            onChange={(ev) => bib.setUmbenennen({ id: eintrag.id, name: ev.currentTarget.value })}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') void bib.umbenennenSpeichern()
              if (ev.key === 'Escape') bib.setUmbenennen(null)
            }}
          />
          <Button size="xs" disabled={!bib.umbenennen.name.trim()} onClick={() => void bib.umbenennenSpeichern()}>
            Speichern
          </Button>
          <Button size="xs" variant="default" onClick={() => bib.setUmbenennen(null)}>
            Abbrechen
          </Button>
        </Group>
      )}
      {bib.loeschen?.id === eintrag.id && (
        <Alert color="red" mt="xs" p="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">„{eintrag.name}“ endgültig löschen? Exportierte Dateien bleiben erhalten.</Text>
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" variant="default" onClick={() => bib.setLoeschen(null)}>
                Abbrechen
              </Button>
              <Button size="xs" color="red" autoFocus onClick={() => void bib.loeschenBestaetigen()}>
                Löschen
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
    </>
  )
}

/**
 * Bereich, der per Einfachklick und per Enter/Leertaste öffnet. Vorher ging das teils nur
 * per Doppelklick oder gar nicht mit der Tastatur.
 */
export function Oeffnen({
  name,
  onOeffnen,
  children,
  style
}: {
  name: string
  onOeffnen: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`„${name}“ öffnen`}
      style={{ minWidth: 0, flex: 1, cursor: 'pointer', ...style }}
      onClick={onOeffnen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOeffnen()
        }
      }}
    >
      {children}
    </div>
  )
}

/** Ein Eintrag als Zeile: Name mit Kennzeichen, Kurzinfo, „Öffnen" und ⋯-Menü */
export function EintragZeile<M extends BibliotheksEintrag>({
  bib,
  eintrag,
  offen,
  kennzeichen,
  info,
  onOeffnen,
  fach
}: {
  bib: Bibliothek<M>
  eintrag: M
  /** Ist dieser Eintrag gerade im Programm offen? */
  offen: boolean
  kennzeichen?: React.ReactNode
  info: React.ReactNode
  onOeffnen: () => void
  /** Fach für den Farbpunkt vor dem Namen (Paket 10a) – dort, wo keine Fach-Überschrift darüber steht */
  fach?: string
}): React.JSX.Element {
  const neu = bib.neuId === eintrag.id
  const [menueOffen, setMenueOffen] = useState(false)
  /*
   * Mit dem Finger (30.09.2026): nach links wischen = „Kopie" und „Löschen", langer Druck =
   * das ⋯-Menü. Beides steht auch im ⋯-Menü; am PC gibt WischZeile nur die Karte aus.
   */
  const aktionen = [
    { label: 'Kopie', icon: <IconCopy size={18} />, farbe: 'var(--mantine-color-blue-6)', onClick: () => void bib.kopieren(eintrag.id) },
    ...(nurPcNetz() ? [] : [{ label: 'Löschen', icon: <IconTrash size={18} />, farbe: 'var(--mantine-color-red-6)', onClick: () => bib.setLoeschen(eintrag) }])
  ]
  return (
    <WischZeile aktionen={aktionen} onLangerDruck={() => setMenueOffen(true)}>
      <Card withBorder padding="sm" data-bibliothek-eintrag={eintrag.name} style={neu ? { borderColor: 'var(--mantine-color-teal-5)' } : undefined}>
        <Group justify="space-between" wrap="nowrap">
          <Oeffnen name={eintrag.name} onOeffnen={onOeffnen}>
            <Group gap="xs">
              {fach && <FachPunkt fach={fach} />}
              <Text fw={600} truncate>
                {eintrag.name}
              </Text>
              {offen && (
                <Badge size="sm" variant="filled" color="gray">
                  geöffnet
                </Badge>
              )}
              {neu && (
                <Badge size="sm" variant="light" color="teal">
                  neu
                </Badge>
              )}
              {kennzeichen}
            </Group>
            <Text size="xs" c="dimmed">
              {info}
            </Text>
          </Oeffnen>
          <Group gap={4} wrap="nowrap">
            <Button size="xs" onClick={onOeffnen}>
              Öffnen
            </Button>
            <EintragMenue bib={bib} eintrag={eintrag} offen={menueOffen} onOffen={setMenueOffen} />
          </Group>
        </Group>
        <EintragRueckfragen bib={bib} eintrag={eintrag} />
      </Card>
    </WischZeile>
  )
}

/** Überschrift einer Fachgruppe mit dem Farbpunkt des Fachs (Paket 10a) */
export function FachUeberschrift({ fach }: { fach: string }): React.JSX.Element {
  return (
    <Group gap="xs" mt="md" mb="xs" wrap="nowrap" className="fach-ueberschrift">
      <FachPunkt fach={fach} groesse={12} />
      <Title order={4}>{fach}</Title>
    </Group>
  )
}

/** Einträge nach einem Merkmal gruppieren (Fach) – ohne Suche; mit Suche eine flache Trefferliste */
export function gruppiere<M>(liste: M[], nach: (e: M) => string): [string, M[]][] {
  const map = new Map<string, M[]>()
  for (const e of liste) map.set(nach(e), [...(map.get(nach(e)) ?? []), e])
  return [...map.entries()]
}
