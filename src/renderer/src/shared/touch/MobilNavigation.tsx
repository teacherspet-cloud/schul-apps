import { ActionIcon, Button, Drawer, Indicator, Stack, Text } from '@mantine/core'
import ModusSchalter from '../../shell/ModusSchalter'
import { IconApps, IconChalkboard, IconDots, IconFolders, IconHome, IconLayoutSidebarLeftExpand, IconLogout, IconPlus, IconSettings } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { MODUL_GRUPPEN, type SchulModule } from '../../modules/registry'

/**
 * Navigation mit dem Finger (30.09.2026, recherche/mobile-bedienung-2026-09-30.md).
 *
 *  - iPhone (Telefonbreite): Leiste UNTEN mit Startseite, dem offenen Programm, „Programme"
 *    und Einstellungen – im Daumenbereich, wie die Tab-Leisten von iOS. Die Seitenleiste mit
 *    zehn Symbolen nähme sonst ein Fünftel der Breite.
 *  - iPad: Die Seitenleiste bleibt; sie lässt sich ausblenden (mehr Platz für das Blatt). Dann
 *    öffnet ein runder Knopf unten links oder ein Wischen vom linken Rand die Programmliste.
 *
 * Die Programmliste ist eine Schublade mit Bild UND Namen – die Symbole allein sind nicht für
 * jedes Programm selbsterklärend (Wunsch der Lehrkraft, 25.09.2026).
 *
 * Telefon seit 07.10.2026 (Recherche: Material 3 Navigation Bar 3–5 Ziele, Apple HIG Tab Bar, NN/g zu versteckter
 * Navigation; abgestimmt mit der Lehrkraft): fünf Ziele unten – Start · Unterricht · ＋ Erstellen (mittig) ·
 * Meine Materialien · Mehr. „Unterricht" und „Erstellen" öffnen ein Blatt von unten mit den passenden Programmen
 * (Gruppen aus registry.ts), „Meine Materialien" die Übersicht aller eigenen Materialien (Themenbereiche), „Mehr"
 * alle Programme in Gruppen, dazu Standard/Experte, Einstellungen und Abmelden. Vorher fehlte das Abmelden auf dem
 * Telefon ganz, und der Tab des offenen Programms tat nichts.
 */

type Programm = Pick<SchulModule, 'id' | 'name' | 'icon' | 'leistenbild'>

export interface NavigationsDaten {
  programme: Programm[]
  active: string
  laufpunkte: Record<string, boolean | undefined>
  oeffnen: (id: string) => void
}

function Bild({ p, groesse }: { p: Programm; groesse: number }): React.JSX.Element {
  return p.leistenbild ? <img src={p.leistenbild} alt="" width={groesse} height={groesse} draggable={false} /> : <p.icon size={groesse - 6} />
}

/** Die Programmliste als Schublade (unten auf dem iPhone, links auf dem iPad) */
export function ProgrammSchublade({
  offen,
  onClose,
  position,
  daten,
  onLeisteEinblenden
}: {
  offen: boolean
  onClose: () => void
  position: 'left' | 'bottom'
  daten: NavigationsDaten
  /** Nur auf dem iPad mit ausgeblendeter Leiste */
  onLeisteEinblenden?: () => void
}): React.JSX.Element {
  const waehle = (id: string): void => {
    daten.oeffnen(id)
    onClose()
  }
  const eintrag = (id: string, name: string, symbol: React.ReactNode): React.JSX.Element => (
    <button key={id} type="button" className="mobil-programm" data-aktiv={daten.active === id} onClick={() => waehle(id)} aria-label={name}>
      <Indicator disabled={!daten.laufpunkte[id]} size={10} processing color="orange" position="top-end">
        {symbol}
      </Indicator>
      <span>{name}</span>
    </button>
  )
  return (
    <Drawer
      opened={offen}
      onClose={onClose}
      position={position}
      size={position === 'bottom' ? 'auto' : 320}
      title="Programme"
      zIndex={300}
      data-programm-schublade
      styles={position === 'bottom' ? { content: { borderRadius: '16px 16px 0 0', maxHeight: '85dvh' } } : undefined}
    >
      <Stack gap="md">
        <div className="mobil-programme">
          {eintrag('home', 'Startseite', <IconHome size={30} />)}
          {daten.programme.map((p) => eintrag(p.id, p.name, <Bild p={p} groesse={36} />))}
          {eintrag('settings', 'Einstellungen', <IconSettings size={30} />)}
        </div>
        {/* Standard-/Expertenmodus (07.10.2026) – wie links in der Leiste am PC */}
        <ModusSchalter breit />
        {onLeisteEinblenden && (
          <Button
            variant="light"
            leftSection={<IconLayoutSidebarLeftExpand size={18} />}
            onClick={() => {
              onLeisteEinblenden()
              onClose()
            }}
          >
            Seitenleiste wieder einblenden
          </Button>
        )}
        <Text size="xs" c="dimmed">
          Auch mit einem Wischen vom linken Rand erreichbar.
        </Text>
      </Stack>
    </Drawer>
  )
}

/** Programme der Ziele „Unterricht" und „Erstellen" (in dieser Reihenfolge, nur sichtbare) */
export const UNTERRICHT_APPS = ['meineklassen', ...(MODUL_GRUPPEN.find((g) => g.id === 'unterricht')?.apps ?? [])]
export const ERSTELLEN_GRUPPEN = [
  ...MODUL_GRUPPEN.filter((g) => g.id === 'planung' || g.id === 'pruefung'),
  { id: 'briefe', name: 'Briefe', apps: ['elternbrief'] }
]
const ERSTELLEN_APPS = ERSTELLEN_GRUPPEN.flatMap((g) => g.apps)

type Blatt = 'unterricht' | 'erstellen' | 'mehr' | null

/** Blatt von unten mit Programmen in Gruppen */
function ProgrammBlatt({
  titel,
  offen,
  onClose,
  gruppen,
  daten,
  fuss,
  kennung
}: {
  titel: string
  offen: boolean
  onClose: () => void
  gruppen: { id: string; name: string; programme: Programm[] }[]
  daten: NavigationsDaten
  fuss?: React.ReactNode
  kennung: string
}): React.JSX.Element {
  const waehle = (id: string): void => {
    daten.oeffnen(id)
    onClose()
  }
  return (
    <Drawer
      opened={offen}
      onClose={onClose}
      position="bottom"
      size="auto"
      title={titel}
      zIndex={300}
      styles={{ content: { borderRadius: '16px 16px 0 0', maxHeight: '85dvh' } }}
      {...{ [kennung]: true }}
    >
      <Stack gap="md">
        {gruppen
          .filter((g) => g.programme.length)
          .map((g) => (
            <div key={g.id} data-blatt-gruppe={g.id}>
              {gruppen.length > 1 && (
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
                  {g.name}
                </Text>
              )}
              <div className="mobil-programme">
                {g.programme.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="mobil-programm"
                    data-aktiv={daten.active === p.id}
                    onClick={() => waehle(p.id)}
                    aria-label={p.name}
                  >
                    <Indicator disabled={!daten.laufpunkte[p.id]} size={10} processing color="orange" position="top-end">
                      <Bild p={p} groesse={36} />
                    </Indicator>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        {fuss}
      </Stack>
    </Drawer>
  )
}

/**
 * Tab-Leiste unten (Telefon, 07.10.2026): Start · Unterricht · ＋ Erstellen · Meine Materialien · Mehr.
 * `mehrOffen`/`setMehrOffen`: „Mehr" öffnet auch das Wischen vom linken Rand (App.tsx).
 */
export function MobilTabs({
  daten,
  mehrOffen,
  setMehrOffen,
  abmelden,
  benutzer
}: {
  daten: NavigationsDaten
  mehrOffen: boolean
  setMehrOffen: (offen: boolean) => void
  /** Nur am Server */
  abmelden?: () => void
  benutzer?: string
}): React.JSX.Element {
  const [blatt, setBlatt] = useState<Blatt>(null)
  const offenesBlatt: Blatt = mehrOffen ? 'mehr' : blatt
  const schliessen = (): void => {
    setBlatt(null)
    setMehrOffen(false)
  }
  const nach = (ids: string[]): Programm[] => ids.flatMap((id) => daten.programme.filter((p) => p.id === id))
  const unterricht = nach(UNTERRICHT_APPS)
  const erstellen = ERSTELLEN_GRUPPEN.map((g) => ({ id: g.id, name: g.name, programme: nach(g.apps) }))
  const gruppiert = MODUL_GRUPPEN.map((g) => ({ id: g.id, name: g.name, programme: nach(g.apps) }))
  const uebrige = daten.programme.filter((p) => !MODUL_GRUPPEN.some((g) => g.apps.includes(p.id)))
  const alle = uebrige.length ? [...gruppiert, { id: 'weitere', name: 'Weitere', programme: uebrige }] : gruppiert
  const laeuft = (liste: Programm[]): boolean => liste.some((p) => daten.laufpunkte[p.id])
  const inUnterricht = unterricht.some((p) => p.id === daten.active)
  const inErstellen = ERSTELLEN_APPS.includes(daten.active)
  const tab = (
    name: string,
    symbol: React.ReactNode,
    aktiv: boolean,
    onClick: () => void,
    extra: Record<string, unknown> = {},
    punkt = false,
    klasse = 'mobil-tab'
  ): React.JSX.Element => (
    <button type="button" className={klasse} data-aktiv={aktiv} onClick={onClick} aria-label={name} {...extra}>
      <Indicator disabled={!punkt} size={9} processing color="orange" position="top-end">
        {symbol}
      </Indicator>
      <span className="mobil-tab-name">{name}</span>
    </button>
  )
  return (
    <>
      <nav className="mobil-tabs" aria-label="Navigation" data-mobil-tabs>
        {tab('Start', <IconHome size={24} />, daten.active === 'home', () => daten.oeffnen('home'), { 'data-tab': 'start', 'aria-label': 'Startseite' })}
        {unterricht.length > 0 &&
          tab('Unterricht', <IconChalkboard size={24} />, inUnterricht, () => setBlatt('unterricht'), { 'data-tab': 'unterricht' }, laeuft(unterricht))}
        {tab(
          'Erstellen',
          <span className="mobil-tab-plus">
            <IconPlus size={24} />
          </span>,
          inErstellen,
          () => setBlatt('erstellen'),
          { 'data-tab': 'erstellen' },
          laeuft(erstellen.flatMap((g) => g.programme)),
          'mobil-tab mobil-tab-erstellen'
        )}
        {tab('Materialien', <IconFolders size={24} />, daten.active === 'themen', () => daten.oeffnen('themen'), { 'data-tab': 'materialien' })}
        {tab(
          'Mehr',
          <IconDots size={24} />,
          daten.active === 'settings' || (!inUnterricht && !inErstellen && !['home', 'themen'].includes(daten.active)),
          () => setMehrOffen(true),
          { 'data-tab': 'mehr', 'data-programme-knopf': true },
          laeuft(uebrige) || laeuft(gruppiert.flatMap((g) => g.programme))
        )}
      </nav>
      <ProgrammBlatt
        titel="Unterricht"
        kennung="data-blatt-unterricht"
        offen={offenesBlatt === 'unterricht'}
        onClose={schliessen}
        gruppen={[{ id: 'unterricht', name: 'Unterricht', programme: unterricht }]}
        daten={daten}
      />
      <ProgrammBlatt
        titel="Neu erstellen"
        kennung="data-blatt-erstellen"
        offen={offenesBlatt === 'erstellen'}
        onClose={schliessen}
        gruppen={erstellen}
        daten={daten}
      />
      <ProgrammBlatt
        titel="Alle Programme"
        kennung="data-programm-schublade"
        offen={offenesBlatt === 'mehr'}
        onClose={schliessen}
        gruppen={alle}
        daten={daten}
        fuss={
          <Stack gap="xs" data-mehr-fuss>
            {/* Standard-/Expertenmodus (07.10.2026) – wie links in der Leiste am PC */}
            <ModusSchalter breit />
            <Button
              variant="default"
              leftSection={<IconSettings size={18} />}
              onClick={() => {
                daten.oeffnen('settings')
                schliessen()
              }}
              data-mehr-einstellungen
            >
              Einstellungen
            </Button>
            {abmelden && (
              <Button variant="default" color="red" leftSection={<IconLogout size={18} />} onClick={abmelden} data-mehr-abmelden>
                Abmelden{benutzer ? ` (${benutzer})` : ''}
              </Button>
            )}
          </Stack>
        }
      />
    </>
  )
}

/** Runder Knopf unten links, solange die Seitenleiste auf dem iPad ausgeblendet ist */
export function LeistenGriff({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <ActionIcon className="leiste-griff" size={52} radius="xl" variant="filled" aria-label="Programme" onClick={onClick} data-leiste-griff>
      <IconApps size={24} />
    </ActionIcon>
  )
}

/** Wischen vom linken Rand (gesten.ts) öffnet die Schublade */
export function useRandWischen(aktiv: boolean, oeffnen: () => void): void {
  useEffect(() => {
    if (!aktiv) return
    window.addEventListener('schulapps:randwischen', oeffnen)
    return () => window.removeEventListener('schulapps:randwischen', oeffnen)
  }, [aktiv, oeffnen])
}
