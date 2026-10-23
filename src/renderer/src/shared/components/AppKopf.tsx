/**
 * Gemeinsamer Kopf aller Programme (Phase 6a, abgestimmt am 05.10.2026; Wunsch der Lehrkraft:
 * „intuitiv, schön aussehend und ansprechend"):
 *
 *   [Bild] Titel  ⧉            [Zusätze]  [📁 Meine …]  [＋ Neue/r/s …]   ← Hauptknopf gefüllt, in der Programmfarbe
 *          Kurzbeschreibung
 *   ─────────────────────────────────────────────────────────────────
 *   Schritte / Reiter                                Filter · Suche
 *
 * Eine Karte mit zartem Verlauf in der Programmfarbe – so erkennt man auf einen Blick, wo man ist, und
 * die Farbe stimmt mit Leiste und Startseite überein. Titel, Beschreibung, Farbe und Bild kommen aus
 * der Registry (App.tsx stellt sie je Programm bereit): eine Stelle für Leiste, Startseite und Kopf.
 * Vorher hatte jedes Programm seinen eigenen Kopf – mal mit Titel, mal nur Schritte, „Neu" mal hell,
 * mal gefüllt, „Eigenes Fenster" mal da, mal nicht.
 */
import { DokumentSuche } from './AppSuche'
import { ActionIcon, Badge, Button, Drawer, Group, Paper, Popover, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp, IconDotsVertical, IconFolder, IconInfoCircle, IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import { useTelefon, useTouch } from '../touch/touchModus'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EigenesFensterKnopf } from '../eigenesFenster'
import type { ProgrammIcon } from './ProgrammSymbol'
import { useAppSettings, useExperte } from '../settingsStore'
import { offenLesen, offenMerken } from '../sitzung'

/** Name, Beschreibung, Farbe und Bild des Programms aus der Registry (App.tsx) */
export const ProgrammInfo = createContext<{ name: string; description: string; color: string; icon?: ProgrammIcon; bild?: string } | null>(null)

export interface AppKopfKnopf {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Kennung für Tests (data-Attribut) */
  kennung?: string
}

export function AppKopf({
  titel,
  beschreibung,
  meine,
  neu,
  zusaetze,
  hauptknopf,
  links,
  rechts,
  ohneBeschreibung,
  kompakt,
  suche
}: {
  /** Ohne Angabe: Name aus der Registry */
  titel?: string
  /** Ohne Angabe: Beschreibung aus der Registry */
  beschreibung?: React.ReactNode
  /** „Meine …" – die gespeicherten Dokumente */
  meine?: AppKopfKnopf
  /** „Neue/r/s …" – gefüllter Hauptknopf mit Plus */
  neu?: AppKopfKnopf & { icon?: React.ReactNode }
  /** Weitere Knöpfe rechts vor „Meine …" (z. B. Rückgängig, Aktualisieren) */
  zusaetze?: React.ReactNode
  /** Eigener Hauptknopf ganz rechts (statt `neu`), wenn er eigene Logik mitbringt – z. B. „Blatt freigeben" */
  hauptknopf?: React.ReactNode
  /** Zweite Zeile links: Schritte oder Reiter */
  links?: React.ReactNode
  /** Zweite Zeile rechts: Filter und Suche */
  rechts?: React.ReactNode
  /** Im Arbeitsablauf (Schritte offen) die Beschreibung weglassen – man kennt sie dann, Platz für das Blatt */
  ohneBeschreibung?: boolean
  /** Über einem Editor: knapp (kleines Bild, ohne Beschreibung, wenig Abstand) – das Blatt braucht die Höhe */
  kompakt?: boolean
  /**
   * Suchfeld (06.10.2026: in JEDER App): ohne Angabe die Suche in den gespeicherten Dokumenten dieser App; eine eigene
   * (`ListenSuche`) filtert die angezeigte Liste; `false`, wenn die App schon an anderer Stelle sucht.
   */
  suche?: React.ReactNode | false
}): React.JSX.Element {
  const info = useContext(ProgrammInfo)
  const telefon = useTelefon()
  const eng = useKopfEng()
  const [blatt, setBlatt] = useState(false)
  const name = titel ?? info?.name ?? ''
  const text = beschreibung ?? info?.description ?? ''
  const farbe = info?.color ?? 'blue'
  const Symbol = info?.icon
  /*
   * Ein- und ausblendbar (06.10.2026, Wunsch der Lehrkraft): eingeklappt bleibt nur eine schmale Leiste mit Name und
   * Pfeil – mehr Platz für Blatt und Editor. Gemerkt je Programm für die Sitzung (shared/sitzung.ts, 09.10.2026).
   */
  const merkName = `schulapps-kopf-zu:${name}`
  const [zu, setZu] = useState(() => offenLesen<boolean>(merkName) === true)
  const umschalten = (): void => {
    setZu(!zu)
    offenMerken(merkName, !zu)
  }
  /*
   * Telefon (07.10.2026, Recherche Material 3 / Apple HIG): EINE Zeile – Bild, Titel, ⋮. Suche, Zusätze, „Meine …" und
   * der eigene Hauptknopf liegen im Blatt hinter ⋮ (im Daumenbereich); „Neu …" wird zum runden Knopf unten rechts über
   * der Tab-Leiste. Vorher brachen bis zu vier Zeilen Knöpfe über dem Inhalt um.
   */
  if (telefon) {
    const hatBlatt = suche !== false || Boolean(zusaetze) || Boolean(meine)
    return (
      <Paper
        radius="md"
        p={6}
        mb={kompakt ? 0 : 'xs'}
        withBorder
        className="app-kopf app-kopf-telefon"
        data-app-kopf
        data-app-kopf-telefon
        style={{
          background: `linear-gradient(135deg, var(--mantine-color-${farbe}-light) 0%, transparent 70%)`,
          borderColor: 'var(--mantine-color-default-border)'
        }}
      >
        <Group gap={8} wrap="nowrap">
          {info?.bild ? (
            <img src={info.bild} alt="" aria-hidden="true" width={28} height={28} style={{ borderRadius: 7, flex: '0 0 auto' }} />
          ) : Symbol ? (
            <Symbol size={26} />
          ) : null}
          <Text fw={700} size="md" truncate style={{ flex: 1, minWidth: 0 }} className="app-kopf-titel">
            {name}
          </Text>
          <ModusAbzeichen />
          {hatBlatt && (
            <ActionIcon variant="subtle" color="gray" size="lg" radius="md" onClick={() => setBlatt(true)} aria-label="Weitere Aktionen" data-app-kopf-mehr>
              <IconDotsVertical size={20} />
            </ActionIcon>
          )}
        </Group>
        {/* Hauptaktion des Programms sichtbar unter dem Titel (07.10.2026: hinter ⋮ fand sie niemand, z. B. „Grammatik freigeben") */}
        {hauptknopf && (
          <Group mt={6} gap="xs" className="app-kopf-hauptknopf-telefon" data-app-kopf-hauptknopf>
            {hauptknopf}
          </Group>
        )}
        {(links || rechts) && (
          <div className="app-kopf-zeile app-kopf-zeile-telefon">
            {links && <div style={{ minWidth: 0, overflowX: 'auto' }}>{links}</div>}
            {rechts && (
              <Group gap="xs" wrap="wrap" mt={4}>
                {rechts}
              </Group>
            )}
          </div>
        )}
        {neu && (
          <ActionIcon
            className="app-kopf-fab"
            color={farbe}
            variant="filled"
            size={56}
            radius="xl"
            onClick={neu.onClick}
            disabled={neu.disabled}
            aria-label={neu.label}
            title={neu.label}
            data-app-neu={neu.kennung ?? ''}
          >
            {neu.icon ?? <IconPlus size={26} />}
          </ActionIcon>
        )}
        <Drawer
          opened={blatt}
          onClose={() => setBlatt(false)}
          position="bottom"
          size="auto"
          title={name}
          zIndex={300}
          styles={{ content: { borderRadius: '16px 16px 0 0', maxHeight: '85dvh' } }}
          data-app-kopf-blatt
        >
          <Stack gap="sm" onClick={(e) => (e.target as HTMLElement).closest('button:not([aria-haspopup])') && setBlatt(false)}>
            {suche === false ? null : suche ?? <DokumentSuche />}
            {meine && (
              <Button
                variant="default"
                leftSection={<IconFolder size={16} />}
                onClick={meine.onClick}
                disabled={meine.disabled}
                data-app-meine={meine.kennung ?? ''}
              >
                {meine.label}
              </Button>
            )}
            {zusaetze && (
              <Group gap="xs" wrap="wrap">
                {zusaetze}
              </Group>
            )}
          </Stack>
        </Drawer>
      </Paper>
    )
  }
  if (eng)
    return <EngerKopf {...{ name, text, farbe, Symbol, bild: info?.bild, meine, neu, zusaetze, hauptknopf, links, rechts, suche }} />
  if (zu)
    return (
      <UnstyledButton
        onClick={umschalten}
        className="app-kopf app-kopf-zu"
        aria-expanded={false}
        aria-label="Kopfbereich einblenden"
        title="Kopfbereich einblenden"
        data-app-kopf
        data-app-kopf-zu
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '4px 12px',
          marginBottom: 8,
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
          background: `linear-gradient(90deg, var(--mantine-color-${farbe}-light) 0%, transparent 60%)`
        }}
      >
        {Symbol ? <Symbol size={20} /> : info?.bild ? <img src={info.bild} alt="" aria-hidden="true" width={20} height={20} /> : null}
        <Text fw={600} size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
          {name}
        </Text>
        <Text size="xs" c="dimmed">
          Kopfbereich einblenden
        </Text>
        <IconChevronDown size={16} />
      </UnstyledButton>
    )
  return (
    <Paper
      radius="lg"
      p={kompakt ? 'xs' : 'md'}
      mb={kompakt ? 0 : 'md'}
      withBorder
      className={`app-kopf${kompakt ? ' app-kopf-kompakt' : ''}`}
      data-app-kopf
      style={{
        background: `linear-gradient(135deg, var(--mantine-color-${farbe}-light) 0%, transparent 70%)`,
        borderColor: 'var(--mantine-color-default-border)',
        // Alles in der Hauptfarbe (Knöpfe, Schritte, Reiter) im Kopf in der Programmfarbe
        ...({
          '--mantine-primary-color-filled': `var(--mantine-color-${farbe}-filled)`,
          '--mantine-primary-color-filled-hover': `var(--mantine-color-${farbe}-filled-hover)`,
          '--mantine-primary-color-light': `var(--mantine-color-${farbe}-light)`,
          '--mantine-primary-color-light-hover': `var(--mantine-color-${farbe}-light-hover)`,
          '--mantine-primary-color-light-color': `var(--mantine-color-${farbe}-light-color)`
        } as React.CSSProperties)
      }}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0, flex: '1 1 300px' }}>
          {(info?.bild || Symbol) && (
            <div className="app-kopf-bild" aria-hidden>
              {info?.bild ? <img src={info.bild} alt="" aria-hidden="true" width={48} height={48} /> : Symbol ? <Symbol size={kompakt ? 32 : 44} /> : null}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <Group gap={2} wrap="nowrap">
              <Title order={2} className="app-kopf-titel">
                {name}
              </Title>
              <EigenesFensterKnopf name={name} />
              <ModusAbzeichen />
            </Group>
            {text && !ohneBeschreibung && !kompakt && (
              <Text c="dimmed" size="sm" className="app-kopf-beschreibung" lineClamp={2}>
                {text}
              </Text>
            )}
          </div>
        </Group>
        <Group gap="xs" wrap="wrap" justify="flex-end">
          {suche === false ? null : suche ?? <DokumentSuche />}
          {zusaetze}
          {meine && (
            <Button
              variant="default"
              radius="md"
              leftSection={<IconFolder size={16} />}
              onClick={meine.onClick}
              disabled={meine.disabled}
              data-app-meine={meine.kennung ?? ''}
            >
              {meine.label}
            </Button>
          )}
          {neu && (
            <Button
              color={farbe}
              radius="md"
              leftSection={neu.icon ?? <IconPlus size={16} />}
              onClick={neu.onClick}
              disabled={neu.disabled}
              data-app-neu={neu.kennung ?? ''}
            >
              {neu.label}
            </Button>
          )}
          {hauptknopf}
          <Tooltip label="Kopfbereich ausblenden (mehr Platz)">
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="md"
              size="lg"
              onClick={umschalten}
              aria-label="Kopfbereich ausblenden"
              aria-expanded
              data-app-kopf-umschalten
            >
              <IconChevronUp size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {(links || rechts) && (
        <Group justify="space-between" align="center" wrap="wrap" gap="sm" mt={kompakt ? 'xs' : 'md'} pt={kompakt ? 6 : 'sm'} className="app-kopf-zeile">
          <div style={{ minWidth: 0, flex: '1 1 auto', overflowX: 'auto' }}>{links}</div>
          {rechts && (
            <Group gap="xs" wrap="wrap" justify="flex-end">
              {rechts}
            </Group>
          )}
        </Group>
      )}
    </Paper>
  )
}

/*
 * Kompakter Kopf (23.10.2026, Entscheidung der Lehrkraft): Auf dem iPad mini begann der Inhalt erst bei 42–48 % der
 * Höhe (Arbeitsblatt, Vokabeltest) – man musste den Kopf jedes Mal einklappen. Auf Touch-Geräten und in kleinen Fenstern
 * (bis 1180 px breit oder 800 px hoch, also auch Notebooks mit 1366 × 768) steht deshalb alles in EINER Zeile:
 *
 *   [▣] Titel ⓘ   ① Schritt ─ ② Schritt            🔍 📁 [＋ Neu]
 *
 * Beschreibung, Modus („Standard") und „Eigenes Fenster" liegen hinter ⓘ, Suche und „Meine …" sind Symbole. Passen die
 * Schritte nicht daneben (iPad hochkant), stehen sie in einer zweiten, schmalen Zeile. Beim Scrollen nach unten schrumpft
 * der Kopf auf Titel, Schritte und Hauptknopf; beim Hochwischen kommt er zurück. Der große PC-Bildschirm bleibt wie bisher.
 */
const ENG = '(max-width: 1180px), (max-height: 800px)'

function useKopfEng(): boolean {
  const touch = useTouch()
  const klein = useMediaQuery(ENG) ?? false
  return touch || klein
}

/**
 * Schrumpfen beim Scrollen: horcht auf jedes Scrollen auf der Seite (Programme scrollen in eigenen Bereichen) und zählt
 * die Richtung. Kleine Bereiche (Auswahllisten) und Dialoge zählen nicht; nach dem Umschalten kurz Ruhe, weil die
 * geänderte Kopfhöhe selbst die Scrollposition verschiebt.
 */
function useSchrumpfen(kopf: React.RefObject<HTMLElement | null>): [boolean, (g: boolean) => void] {
  const [geschrumpft, setGeschrumpft] = useState(false)
  const setzenRef = useRef<(g: boolean) => void>(setGeschrumpft)
  useEffect(() => {
    const stand = new WeakMap<EventTarget, number>()
    let summe = 0
    let ruheBis = 0
    let jetzt = false
    const setzen = (g: boolean): void => {
      if (g === jetzt) return
      jetzt = g
      summe = 0
      ruheBis = Date.now() + 350
      setGeschrumpft(g)
    }
    setzenRef.current = setzen
    const beiScroll = (e: Event): void => {
      const k = kopf.current
      if (!k || !k.offsetParent) return
      const ziel = e.target === document ? document.scrollingElement : e.target
      if (!(ziel instanceof HTMLElement) || k.contains(ziel) || ziel.closest('[role="dialog"]')) return
      if (ziel.clientHeight < window.innerHeight * 0.4) return
      const y = ziel.scrollTop
      const d = y - (stand.get(ziel) ?? y)
      stand.set(ziel, y)
      if (y < 8) return setzen(false)
      if (Date.now() < ruheBis) return
      summe = d > 0 ? Math.max(0, summe) + d : Math.min(0, summe) + d
      if (summe > 24 && y > 60) setzen(true)
      else if (summe < -48) setzen(false)
    }
    document.addEventListener('scroll', beiScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', beiScroll, { capture: true })
  }, [kopf])
  return [geschrumpft, (g) => setzenRef.current(g)]
}

function EngerKopf({
  name,
  text,
  farbe,
  Symbol,
  bild,
  meine,
  neu,
  zusaetze,
  hauptknopf,
  links,
  rechts,
  suche
}: {
  name: string
  text: React.ReactNode
  farbe: string
  Symbol?: ProgrammIcon
  bild?: string
  meine?: AppKopfKnopf
  neu?: AppKopfKnopf & { icon?: React.ReactNode }
  zusaetze?: React.ReactNode
  hauptknopf?: React.ReactNode
  links?: React.ReactNode
  rechts?: React.ReactNode
  suche?: React.ReactNode | false
}): React.JSX.Element {
  const kopf = useRef<HTMLDivElement>(null)
  const [geschrumpft, setGeschrumpft] = useSchrumpfen(kopf)
  const [sucheOffen, setSucheOffen] = useState(false)
  const sucheZeile = useRef<HTMLDivElement>(null)
  // Die aufgeklappte Suche gleich zum Tippen bereit
  useEffect(() => {
    if (sucheOffen) sucheZeile.current?.querySelector('input')?.focus()
  }, [sucheOffen])
  const schritte = Boolean(links || rechts)
  /*
   * Zweizeilig nur, wenn die Schritte wirklich nicht neben Titel und Knöpfe passen – gemessen an ihrer natürlichen
   * Breite (CSS: max-content), damit das Umschalten die Messung nicht selbst verändert.
   */
  const raster = useRef<HTMLDivElement>(null)
  const [zweizeilig, setZweizeilig] = useState(false)
  useLayoutEffect(() => {
    const r = raster.current
    // Geschrumpft steht ohnehin alles in einer Zeile – die Messung von vorher gilt weiter
    if (!r || !schritte || geschrumpft) return
    const pruefe = (): void => {
      const teil = (k: string): number => (r.querySelector<HTMLElement>(k)?.offsetWidth ?? 0)
      const schrittInhalt = [...(r.querySelector('.app-kopf-eng-schritte')?.children ?? [])].reduce(
        (summe, k) => summe + ((k.classList.contains('app-kopf-eng-links') ? (k.firstElementChild as HTMLElement | null) : (k as HTMLElement))?.offsetWidth ?? 0) + 10,
        0
      )
      setZweizeilig(teil('.app-kopf-eng-titel') + schrittInhalt + teil('.app-kopf-eng-aktionen') + 28 > r.clientWidth)
    }
    pruefe()
    const beob = new ResizeObserver(pruefe)
    beob.observe(r)
    return () => beob.disconnect()
  }, [schritte, geschrumpft])
  return (
    <Paper
      ref={kopf}
      radius="md"
      withBorder
      className="app-kopf app-kopf-eng"
      data-app-kopf
      data-app-kopf-eng
      data-geschrumpft={geschrumpft || undefined}
      style={{
        background: `linear-gradient(135deg, var(--mantine-color-${farbe}-light) 0%, transparent 70%)`,
        borderColor: 'var(--mantine-color-default-border)',
        ...({
          '--mantine-primary-color-filled': `var(--mantine-color-${farbe}-filled)`,
          '--mantine-primary-color-filled-hover': `var(--mantine-color-${farbe}-filled-hover)`,
          '--mantine-primary-color-light': `var(--mantine-color-${farbe}-light)`,
          '--mantine-primary-color-light-hover': `var(--mantine-color-${farbe}-light-hover)`,
          '--mantine-primary-color-light-color': `var(--mantine-color-${farbe}-light-color)`
        } as React.CSSProperties)
      }}
    >
      <div ref={raster} className={`app-kopf-eng-raster${schritte ? '' : ' app-kopf-eng-ohne-schritte'}`} data-zweizeilig={zweizeilig || undefined}>
        <div className="app-kopf-eng-titel">
          {(bild || Symbol) && (
            <span className="app-kopf-eng-bild" aria-hidden>
              {bild ? <img src={bild} alt="" aria-hidden="true" width={28} height={28} /> : Symbol ? <Symbol size={24} /> : null}
            </span>
          )}
          {/* Geschrumpft: ein Tipp auf den Titel holt den ganzen Kopf zurück */}
          {geschrumpft ? (
            <UnstyledButton className="app-kopf-eng-name" onClick={() => setGeschrumpft(false)} aria-label={`${name} – Kopfbereich ganz zeigen`}>
              <Text component="h2" fw={700} truncate className="app-kopf-titel">
                {name}
              </Text>
            </UnstyledButton>
          ) : (
            <Text component="h2" fw={700} truncate className="app-kopf-titel app-kopf-eng-name">
              {name}
            </Text>
          )}
          <KopfInfo name={name} text={text} />
        </div>
        {schritte && (
          <div className="app-kopf-eng-schritte">
            {links && <div className="app-kopf-eng-links">{links}</div>}
            {rechts && (
              <Group gap="xs" wrap="nowrap">
                {rechts}
              </Group>
            )}
          </div>
        )}
        <Group gap={6} wrap="nowrap" className="app-kopf-eng-aktionen">
          <Group gap={6} wrap="nowrap" className="app-kopf-eng-neben">
            {suche !== false && (
              <Tooltip label={sucheOffen ? 'Suche schließen' : 'Suchen'}>
                <ActionIcon
                  variant={sucheOffen ? 'light' : 'default'}
                  size="lg"
                  radius="md"
                  onClick={() => setSucheOffen((o) => !o)}
                  aria-label={sucheOffen ? 'Suche schließen' : 'Suchen'}
                  aria-expanded={sucheOffen}
                  data-app-kopf-suche
                >
                  {sucheOffen ? <IconX size={18} /> : <IconSearch size={18} />}
                </ActionIcon>
              </Tooltip>
            )}
            {zusaetze}
            {meine && (
              <Tooltip label={meine.label}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  radius="md"
                  onClick={meine.onClick}
                  disabled={meine.disabled}
                  aria-label={meine.label}
                  data-app-meine={meine.kennung ?? ''}
                >
                  <IconFolder size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          {neu && (
            <Button
              color={farbe}
              radius="md"
              leftSection={neu.icon ?? <IconPlus size={16} />}
              onClick={neu.onClick}
              disabled={neu.disabled}
              aria-label={neu.label}
              title={neu.label}
              data-app-neu={neu.kennung ?? ''}
            >
              Neu
            </Button>
          )}
          {hauptknopf}
        </Group>
      </div>
      {sucheOffen && !geschrumpft && (
        <div className="app-kopf-eng-suche" ref={sucheZeile}>
          {suche ?? <DokumentSuche />}
        </div>
      )}
    </Paper>
  )
}

/** ⓘ im kompakten Kopf: Beschreibung des Programms, Modus und „Eigenes Fenster" */
function KopfInfo({ name, text }: { name: string; text: React.ReactNode }): React.JSX.Element {
  const experte = useExperte()
  const update = useAppSettings((s) => s.update)
  return (
    <Popover position="bottom-start" shadow="md" withArrow width={320}>
      <Popover.Target>
        <ActionIcon variant="subtle" color="gray" size="lg" radius="md" aria-label={`Über „${name}"`} data-app-kopf-info>
          <IconInfoCircle size={18} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          {text && (
            <Text size="sm" className="app-kopf-beschreibung">
              {text}
            </Text>
          )}
          <Group gap="xs" justify="space-between" wrap="nowrap">
            {experte ? (
              <Text size="xs" c="dimmed">
                Expertenmodus: alle Optionen sichtbar
              </Text>
            ) : (
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Standardmodus: nur das Wichtigste
                </Text>
                <Button size="xs" variant="light" color="gray" onClick={() => void update({ oberflaeche: 'experte' })} data-modus-abzeichen>
                  Alle Optionen zeigen
                </Button>
              </Stack>
            )}
            <EigenesFensterKnopf name={name} />
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Farbe des Programms (Registry) – für eigene Hauptknöpfe im Kopf */
export const useProgrammFarbe = (): string => useContext(ProgrammInfo)?.color ?? 'blue'

/**
 * Sichtbarer Modus (07.10.2026): Im Standardmodus steht „Standard" neben dem Titel – ein Modus soll nie ein
 * unsichtbarer Zustand sein. Ein Klick schaltet in den Expertenmodus.
 */
function ModusAbzeichen(): React.JSX.Element | null {
  const experte = useExperte()
  const update = useAppSettings((s) => s.update)
  if (experte) return null
  return (
    <Tooltip label="Standardmodus: nur das Wichtigste. Klick zeigt alle Optionen (Expertenmodus)." withArrow>
      <Badge
        component="button"
        variant="light"
        color="gray"
        size="sm"
        ml={6}
        style={{ cursor: 'pointer', flexShrink: 0 }}
        onClick={() => void update({ oberflaeche: 'experte' })}
        data-modus-abzeichen
      >
        Standard
      </Badge>
    </Tooltip>
  )
}
