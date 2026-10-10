/**
 * Medaillen und Titel je Sprache (10.10.2026, mit der Lehrkraft abgestimmt; Konzept
 * recherche/achievements-medaillen-titel.md, Rechnung shared/auszeichnungen.ts, Bilder shared/auszeichnungenBilder.ts).
 *
 *  - Je Sprache ein Reiter: sieben Medaillen (aktuelle Stufe, Fortschritt bis zur nächsten), die Titelleiter mit dem
 *    aktuellen Titel und dem Weg zum nächsten, die Sammlung der Bilder (gesperrt/frei, x von y).
 *  - Die Form des Titels (männlich, weiblich, neutral) wählen die Lernenden selbst – beim ersten Titel fragt ein kleines
 *    Fenster, ändern lässt sie sich jederzeit hier und in den Einstellungen. Ebenso, welcher Titel neben dem Namen steht
 *    (oder keiner) und welches freigeschaltete Bild als Profilbild dient.
 *  - Keine Vergleiche mit anderen: nur der eigene Weg.
 *  - Jahresreihen (10.10.2026): Die Medaillen gelten für das laufende Schuljahr („Kl. 7 (2026/27)") mit konkreten Zahlen
 *    zur nächsten Stufe; darunter der Jahrestitel und „Frühere Jahre" mit allem, was in früheren Schuljahren erreicht
 *    wurde. Der Haupttitel wächst über alle Jahre.
 *  - Aufbau (10.10.2026, Wunsch der Lehrkraft: keine langen Listen, Telefon zuerst): je Sprache vier einklappbare
 *    Abschnitte (AuszKlapp.tsx, eingeklappt mit Zusammenfassung):
 *      · Medaillen – Schuljahr wählen (laufendes vorn, frühere daneben), „14 von 42", Raster 7 Kategorien × 6 Stufen
 *        (farbig erreicht, graue Silhouette mit Schloss offen, nächste Stufe gestrichelt mit Balken); Tipp → Blatt mit
 *        großem Bild, „erreicht am …" bzw. der Zahl zur nächsten Stufe.
 *      · Titel – Streifen der Titelleiter mit Wappen, der eigene hervorgehoben; Tipp → Form, „neben meinem Namen",
 *        Profilbild.
 *      · Jahrestitel – Streifen über alle Schuljahre.
 *      · Sammlung & Profilbild – dasselbe Raster über alle Jahre plus Titel-Wappen; „Profilbild wählen" schaltet auf
 *        Auswahl (nur Freigeschaltetes wählbar).
 *    Darunter „Dein Titel neben dem Namen" (Form, Anzeige). Blätter: Telefon von unten, sonst Fenster in der Mitte.
 */
import { Badge, Box, Button, Drawer, Group, Loader, Modal, Progress, Select, SegmentedControl, SimpleGrid, Stack, Tabs, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconBook, IconBraces, IconCheck, IconDeviceGamepad2, IconFlame, IconHeadphones, IconLock, IconRoute, IconUserCircle, IconUsersGroup } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { STUFEN_NAMEN, naechsteStufeText, stufenName, zahlText, type KategorieId, type TitelForm, type TitelWahl } from '@shared/auszeichnungen'
import { bildAdresse, leiterVon } from '@shared/auszeichnungenBilder'
import { holen, senden } from './serverApi'
import { fuerServer, useDarstellung } from './schuelerDarstellung'
import { AuszKlapp } from './AuszKlapp'

interface MedailleSicht {
  kategorie: string
  name: string
  text: string
  stufe: number
  wert: number
  ziel: number | null
  von: number
  am: number | null
  /** Schwellen aller sechs Stufen dieses Schuljahres (10.10.2026) */
  schwellen?: number[] | null
}
interface Leiterstufe {
  stufe: number
  ab: number
  m: string
  w: string
  n: string
  de: string
}
interface FruehesJahr {
  schuljahr: number
  label: string
  punkte: number
  medaillen: { kategorie: string; name: string; stufe: number; am: number }[]
  jahrestitel: string | null
  jahrestitelStufe?: number
}
interface SprachSicht {
  sprache: string
  name: string
  jahrgang: number | null
  band: string
  /** Jahresreihe (10.10.2026) */
  schuljahr?: number
  schuljahrText?: string
  jahr?: string
  grundlage?: { band: string | null; woerter: number | null; grammatik: number | null; units: number | null; schultage: number | null; typisch?: { woerter: number; grammatik: number; units: number } } | null
  punkteJahr?: number
  jahrestitel?: { stufe: number; text: string | null; naechsteAb: number | null; naechster: string | null }
  frueher?: FruehesJahr[]
  punkte: number
  medaillen: MedailleSicht[]
  titel: { stufe: number; text: string | null; am: number | null; naechsteAb: number | null; leiter: Leiterstufe[] }
  sammlung: { id: string; art: 'medaille' | 'titel'; name: string; wie: string; stufe: number; frei: boolean }[]
}
export interface TitelKurz {
  wahl: TitelWahl
  anzeige: { sprache: string; stufe: number; text: string } | null
  formOffen: boolean
  avatar?: string | null
  beispiel?: { m: string; w: string; n: string } | null
}
type Antwort = TitelKurz & { sprachen: SprachSicht[] }

/** Stufenfarben (Bronze … Meister), in Hell und Dunkel gut zu sehen */
export const STUFEN_FARBEN = ['#868e96', '#b8733a', '#8f9aa6', '#d4a017', '#4f9da6', '#339af0', '#7c5cd6']

const FORMEN: { value: TitelForm; label: string }[] = [
  { value: 'm', label: 'männlich' },
  { value: 'w', label: 'weiblich' },
  { value: 'n', label: 'neutral' }
]

/** Bild einer Medaille oder eines Titels; gesperrt als graue Silhouette mit Schloss */
export function AuszBild({ id, gesperrt = false, groesse = 64, alt = '' }: { id: string; gesperrt?: boolean; groesse?: number; alt?: string }): React.JSX.Element {
  return <img src={bildAdresse(id, gesperrt)} alt={alt} width={groesse} height={Math.round(groesse * (140 / 120))} style={{ objectFit: 'contain', flex: 'none' }} loading="lazy" />
}

/** Wahl speichern (Form oder angezeigter Titel) */
export const titelWahlSenden = (wahl: { form?: TitelForm; anzeige?: TitelWahl['anzeige'] | null }): Promise<TitelKurz> => senden<TitelKurz>('/s/api/auszeichnungen/wahl', wahl)

/**
 * Kleines Fenster beim ersten Titel: Wie soll er lauten? Beispiel aus der eigenen Leiter, alle drei Formen gleichwertig.
 */
export function TitelFormDialog({
  offen,
  beispiel,
  fertig
}: {
  offen: boolean
  /** Formen des erreichten Titels */
  beispiel: { m: string; w: string; n: string } | null
  fertig: (k: TitelKurz | null) => void
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const waehle = (form: TitelForm): void => {
    setLaeuft(true)
    void titelWahlSenden({ form }).then(
      (k) => (setLaeuft(false), fertig(k)),
      () => (setLaeuft(false), fertig(null))
    )
  }
  return (
    <Modal opened={offen} onClose={() => fertig(null)} title="Dein erster Titel!" zIndex={450} centered data-titel-form-dialog>
      <Stack gap="sm">
        <Text size="sm">
          Du hast einen Titel erreicht. In welcher Form sollen deine Titel lauten? Du kannst das jederzeit ändern – unter „Achievements" oder in den Einstellungen.
        </Text>
        {FORMEN.map((f) => (
          <Button key={f.value} variant="light" size="md" loading={laeuft} onClick={() => waehle(f.value)} data-titel-form={f.value} justify="space-between" rightSection={beispiel ? beispiel[f.value] : undefined}>
            {f.label}
          </Button>
        ))}
      </Stack>
    </Modal>
  )
}

/** Form und angezeigter Titel – hier und in den Einstellungen */
export function TitelWahlFelder({ d, geaendert }: { d: Antwort; geaendert: (k: TitelKurz) => void }): React.JSX.Element {
  const erreicht = d.sprachen.flatMap((s) =>
    s.titel.leiter
      .filter((x) => x.stufe <= s.titel.stufe)
      .map((x) => ({ value: `${s.sprache}:${x.stufe}`, label: `${s.name}: ${d.wahl.form === 'm' ? x.m : d.wahl.form === 'w' ? x.w : x.n}` }))
  )
  const anzeige = d.wahl.anzeige === 'aus' ? 'aus' : d.wahl.anzeige ? `${d.wahl.anzeige.sprache}:${d.wahl.anzeige.stufe}` : 'auto'
  return (
    <Stack gap="sm" data-titel-wahl>
      <div>
        <Text size="sm" fw={600}>
          Form deines Titels
        </Text>
        <Text size="xs" c="dimmed" mb={4}>
          Du entscheidest, nicht dein Name.
        </Text>
        <SegmentedControl
          data={FORMEN}
          value={d.wahl.form ?? 'n'}
          onChange={(v) => void titelWahlSenden({ form: v as TitelForm }).then(geaendert, () => undefined)}
          data-titel-form-wahl
        />
      </div>
      <Select
        label="Neben deinem Namen zeigen"
        description="Auf deiner Startseite und beim gemeinsamen Spielen"
        data={[{ value: 'auto', label: 'Automatisch: meinen höchsten Titel' }, { value: 'aus', label: 'Keinen Titel zeigen' }, ...erreicht]}
        value={anzeige}
        allowDeselect={false}
        onChange={(v) => {
          if (!v) return
          const [sprache, stufe] = v.split(':')
          void titelWahlSenden({ anzeige: v === 'aus' ? 'aus' : v === 'auto' ? null : { sprache, stufe: Number(stufe) } }).then(geaendert, () => undefined)
        }}
        comboboxProps={{ zIndex: 500 }}
        data-titel-anzeige
      />
    </Stack>
  )
}

/** Profilbild setzen (Darstellung; der Server nimmt nur freigeschaltete) */
function useAvatar(): [string, (id: string) => void] {
  const { d, setze } = useDarstellung()
  const setzen = (id: string): void => {
    const neu = { ...d, avatar: id }
    setze(neu)
    void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  return [d.avatar ?? '', setzen]
}

// ---------------------------------------------------------------- Medaillen-Raster (10.10.2026)

/** Kurzformen der Stufen für schmale Bildschirme */
const STUFEN_KURZ = ['Bro', 'Sil', 'Gold', 'Plat', 'Dia', 'Meis']

/** Symbol je Kategorie (Zeilenkopf des Rasters) */
const KAT_SYMBOL: Record<string, typeof IconBook> = {
  wortschatz: IconBook,
  grammatik: IconBraces,
  dranbleiben: IconFlame,
  hoeren: IconHeadphones,
  lehrwerk: IconRoute,
  spiele: IconDeviceGamepad2,
  zusammen: IconUsersGroup
}
const KAT_FARBE: Record<string, string> = {
  wortschatz: 'blue',
  grammatik: 'violet',
  dranbleiben: 'orange',
  hoeren: 'teal',
  lehrwerk: 'green',
  spiele: 'pink',
  zusammen: 'yellow'
}

/** Kurze Namen für den Zeilenkopf auf dem Telefon */
const KAT_KURZ: Record<string, string> = {
  wortschatz: 'Wortschatz',
  grammatik: 'Grammatik',
  dranbleiben: 'Dranbleiben',
  hoeren: 'Hören',
  lehrwerk: 'Lehrwerk',
  spiele: 'Spiele',
  zusammen: 'Zusammen'
}

/** Eine Zeile des Rasters: Kategorie mit gehaltener Stufe (und im laufenden Jahr dem Fortschritt) */
interface RasterZeile {
  kategorie: string
  name: string
  text?: string
  stufe: number
  am?: number | null
  wert?: number
  ziel?: number | null
  von?: number
  schwellen?: number[] | null
}

const RASTER_SPALTEN = 'minmax(84px, 1.4fr) repeat(6, minmax(0, 1fr))'

/**
 * Sieben Kategorien × sechs Stufen als kompaktes Raster: farbig erreicht, graue Silhouette mit Schloss noch offen, die
 * nächste Stufe gestrichelt mit kleinem Balken. Ein Tipp öffnet die Einzelheiten (oder wählt im Profilbild-Modus).
 */
function MedaillenRaster({
  zeilen,
  zelle,
  fortschritt = false,
  avatar,
  auswahl,
  rahmen
}: {
  zeilen: RasterZeile[]
  /** Tipp auf eine Zelle */
  zelle: (z: RasterZeile, stufe: number) => void
  /** Nächste Stufe mit Balken hervorheben (laufendes Schuljahr) */
  fortschritt?: boolean
  avatar?: string
  /** Profilbild-Modus: nur freigeschaltete wählbar */
  auswahl?: boolean
  rahmen?: Record<string, string | number | boolean | undefined>
}): React.JSX.Element {
  return (
    <Stack gap={4} maw={600} data-medaillen-raster {...rahmen}>
      <div style={{ display: 'grid', gridTemplateColumns: RASTER_SPALTEN, gap: 4, alignItems: 'end' }} aria-hidden>
        <span />
        {STUFEN_NAMEN.map((n, i) => (
          <Text key={n} size="10px" fw={800} ta="center" lh={1.1} style={{ color: STUFEN_FARBEN[i + 1] }}>
            <Box component="span" visibleFrom="xs">
              {n}
            </Box>
            <Box component="span" hiddenFrom="xs">
              {STUFEN_KURZ[i]}
            </Box>
          </Text>
        ))}
      </div>
      {zeilen.map((z) => {
        const Sym = KAT_SYMBOL[z.kategorie] ?? IconBook
        return (
          <div
            key={z.kategorie}
            role="group"
            aria-label={`${z.name}: ${z.stufe ? stufenName(z.stufe) : 'noch keine Stufe'}`}
            data-medaille={z.kategorie}
            data-stufe={z.stufe}
            style={{ display: 'grid', gridTemplateColumns: RASTER_SPALTEN, gap: 4, alignItems: 'center' }}
          >
            <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
              <ThemeIcon size={18} radius="xl" variant="light" color={KAT_FARBE[z.kategorie] ?? 'gray'} style={{ flex: 'none' }}>
                <Sym size={12} />
              </ThemeIcon>
              <Text size="10.5px" fw={700} lh={1.15} style={{ minWidth: 0, hyphens: 'auto' }} lang="de">
                <Box component="span" visibleFrom="xs">
                  {z.name}
                </Box>
                <Box component="span" hiddenFrom="xs">
                  {KAT_KURZ[z.kategorie] ?? z.name}
                </Box>
              </Text>
            </Group>
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const erreicht = n <= z.stufe
              const naechste = fortschritt && n === z.stufe + 1 && z.ziel != null
              const id = `m-${z.kategorie}-${n}`
              const gewaehlt = avatar === id
              const anteil = naechste ? Math.max(4, Math.min(100, (((z.wert ?? 0) - (z.von ?? 0)) / Math.max(1, (z.ziel ?? 1) - (z.von ?? 0))) * 100)) : 0
              return (
                <UnstyledButton
                  key={n}
                  onClick={() => zelle(z, n)}
                  disabled={auswahl && !erreicht}
                  aria-label={`${z.name} ${stufenName(n)}: ${erreicht ? (auswahl ? (gewaehlt ? 'ist dein Profilbild' : 'als Profilbild wählen') : 'erreicht') : naechste ? 'als Nächstes' : 'noch nicht erreicht'}`}
                  aria-pressed={auswahl ? gewaehlt : undefined}
                  data-medaille-zelle={`${z.kategorie}-${n}`}
                  data-erreicht={erreicht}
                  data-naechste={naechste || undefined}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 2,
                    borderRadius: 8,
                    outline: gewaehlt ? '2px solid var(--mantine-primary-color-filled)' : naechste ? '2px dashed var(--mantine-primary-color-filled)' : undefined,
                    outlineOffset: -1,
                    background: gewaehlt ? 'var(--mantine-primary-color-light)' : undefined,
                    opacity: auswahl && !erreicht ? 0.45 : 1,
                    cursor: auswahl && !erreicht ? 'default' : 'pointer'
                  }}
                >
                  <img src={bildAdresse(id, !erreicht)} alt="" loading="lazy" style={{ width: '100%', maxWidth: 44, height: 'auto', aspectRatio: '120 / 140', objectFit: 'contain', display: 'block' }} />
                  {naechste && (
                    <span aria-hidden style={{ display: 'block', width: '80%', height: 3, borderRadius: 2, background: 'var(--mantine-color-default-border)', marginTop: 2, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${anteil}%`, background: 'var(--mantine-primary-color-filled)' }} />
                    </span>
                  )}
                </UnstyledButton>
              )
            })}
          </div>
        )
      })}
    </Stack>
  )
}

/** Kleines Blatt für Einzelheiten: auf dem Telefon von unten, sonst als Fenster in der Mitte */
function Blatt({ offen, schliessen, titel, children }: { offen: boolean; schliessen: () => void; titel: string; children: React.ReactNode }): React.JSX.Element {
  const telefon = useMediaQuery('(max-width: 36em)') ?? false
  return telefon ? (
    <Drawer
      opened={offen}
      onClose={schliessen}
      title={titel}
      position="bottom"
      size="auto"
      zIndex={450}
      styles={{ content: { borderTopLeftRadius: 16, borderTopRightRadius: 16, height: 'auto', maxHeight: '85dvh', flex: '0 0 auto' } }}
    >
      {children}
    </Drawer>
  ) : (
    <Modal opened={offen} onClose={schliessen} title={titel} zIndex={450} centered size="sm">
      {children}
    </Modal>
  )
}

const datum = (t: number): string => new Date(t).toLocaleDateString('de-DE')

/** Knopf „Als Profilbild verwenden" in den Blättern */
function ProfilbildKnopf({ id, frei, avatar, setAvatar, fertig }: { id: string; frei: boolean; avatar: string; setAvatar: (id: string) => void; fertig: () => void }): React.JSX.Element | null {
  if (!frei) return null
  return (
    <Group justify="center" gap="xs">
      <Button
        variant={avatar === id ? 'light' : 'filled'}
        leftSection={avatar === id ? <IconCheck size={16} /> : <IconUserCircle size={16} />}
        onClick={() => (setAvatar(id), fertig())}
        disabled={avatar === id}
        data-avatar-setzen={id}
      >
        {avatar === id ? 'Ist dein Profilbild' : 'Als Profilbild verwenden'}
      </Button>
      {avatar === id && (
        <Button variant="default" onClick={() => (setAvatar(''), fertig())}>
          Kein Profilbild
        </Button>
      )}
    </Group>
  )
}

/** Einzelheiten einer Medaillen-Stufe */
function MedailleBlatt({
  wahl,
  jahr,
  aktuell,
  frei,
  avatar,
  setAvatar,
  schliessen
}: {
  wahl: { z: RasterZeile; n: number } | null
  /** Beschriftung des Schuljahres („Kl. 7 (2026/27)"); null = Sammlung über alle Jahre */
  jahr: string | null
  aktuell: boolean
  frei: (id: string) => boolean
  avatar: string
  setAvatar: (id: string) => void
  schliessen: () => void
}): React.JSX.Element {
  const z = wahl?.z
  const n = wahl?.n ?? 1
  const erreicht = Boolean(z && n <= z.stufe)
  const id = z ? `m-${z.kategorie}-${n}` : ''
  const naechste = Boolean(z && aktuell && n === z.stufe + 1 && z.ziel != null)
  const schwelle = z?.schwellen?.[n - 1]
  return (
    <Blatt offen={Boolean(wahl)} schliessen={schliessen} titel={z ? `${z.name} · ${stufenName(n)}` : ''}>
      {z && (
        <Stack align="center" gap="sm" pb="xs" data-medaille-blatt={id}>
          <AuszBild id={id} gesperrt={!erreicht} groesse={112} alt={`${z.name} ${stufenName(n)}${erreicht ? '' : ' (noch nicht erreicht)'}`} />
          {erreicht ? (
            <Badge size="lg" tt="none" style={{ background: STUFEN_FARBEN[n] }} data-medaille-erreicht>
              {jahr === null ? 'Freigeschaltet' : `Erreicht${n === z.stufe && z.am ? ` am ${datum(z.am)}` : ''} · ${jahr}`}
            </Badge>
          ) : (
            <Group gap={6} wrap="nowrap">
              <IconLock size={16} aria-hidden />
              <Text size="sm" fw={700}>
                {jahr !== null && !aktuell ? 'In diesem Schuljahr nicht erreicht' : 'Noch nicht erreicht'}
              </Text>
            </Group>
          )}
          {naechste && z.ziel != null && (
            <Stack gap={4} w="100%">
              <Progress
                value={Math.max(0, Math.min(100, (((z.wert ?? 0) - (z.von ?? 0)) / Math.max(1, z.ziel - (z.von ?? 0))) * 100))}
                size="md"
                radius="xl"
                color={STUFEN_FARBEN[n]}
                aria-label={`${z.wert ?? 0} von ${z.ziel} bis ${stufenName(n)}`}
              />
              <Text size="sm" ta="center" data-medaille-naechste={z.ziel}>
                Nächste Stufe ({stufenName(n)}) {naechsteStufeText(z.kategorie as KategorieId, z.ziel)}
              </Text>
              <Text size="xs" c="dimmed" ta="center" data-medaille-fortschritt={`${z.wert ?? 0}/${z.ziel}`}>
                Du hast {zahlText(z.wert ?? 0)} von {zahlText(z.ziel)}.
              </Text>
            </Stack>
          )}
          {!erreicht && !naechste && aktuell && (
            <Text size="sm" ta="center">
              {schwelle ? `Erreichbar ${naechsteStufeText(z.kategorie as KategorieId, schwelle)}` : 'Kommt nach den Stufen davor'}
              {n > 1 ? ` – zuerst ${stufenName(n - 1)}.` : '.'}
            </Text>
          )}
          {jahr === null && !erreicht && (
            <Text size="sm" ta="center">
              {stufenName(n)}-Medaille „{z.name}" in einem Schuljahr erreichen.
            </Text>
          )}
          {z.text && (
            <Text size="xs" c="dimmed" ta="center">
              {z.text}
            </Text>
          )}
          <ProfilbildKnopf id={id} frei={frei(id)} avatar={avatar} setAvatar={setAvatar} fertig={schliessen} />
        </Stack>
      )}
    </Blatt>
  )
}

// ---------------------------------------------------------------- Titel-Streifen

interface StreifenEintrag {
  schluessel: string
  bild: string
  gesperrt: boolean
  text: string
  unter: string
  aktuell: boolean
  attr?: Record<string, string | number | boolean | undefined>
  tipp: () => void
}

/** Waagerechter Streifen mit Wappen; der aktuelle Titel ist hervorgehoben und wird beim Öffnen in die Mitte gerollt */
function TitelStreifen({ eintraege, rahmen, label }: { eintraege: StreifenEintrag[]; rahmen?: Record<string, string | number | boolean | undefined>; label: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = ref.current
    const el = c?.querySelector<HTMLElement>('[aria-current="step"]')
    if (c && el) c.scrollLeft = Math.max(0, el.offsetLeft - (c.clientWidth - el.clientWidth) / 2)
  }, [])
  return (
    <div
      ref={ref}
      role="list"
      aria-label={label}
      style={{ position: 'relative', display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x proximity', padding: '4px 2px 8px', WebkitOverflowScrolling: 'touch' }}
      {...rahmen}
    >
      {eintraege.map((e) => (
        <UnstyledButton
          key={e.schluessel}
          role="listitem"
          onClick={e.tipp}
          aria-current={e.aktuell ? 'step' : undefined}
          aria-label={`${e.text}${e.gesperrt ? ' (noch nicht erreicht)' : ''} – ${e.unter}`}
          {...e.attr}
          style={{
            flex: 'none',
            width: 82,
            scrollSnapAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '6px 4px',
            borderRadius: 10,
            border: e.aktuell ? '2px solid var(--mantine-primary-color-filled)' : '1px solid var(--mantine-color-default-border)',
            background: e.aktuell ? 'var(--mantine-primary-color-light)' : undefined
          }}
        >
          <img src={bildAdresse(e.bild, e.gesperrt)} alt="" loading="lazy" width={44} height={51} style={{ objectFit: 'contain', opacity: e.gesperrt ? 0.7 : 1 }} />
          <Text size="11px" fw={e.aktuell ? 800 : 600} ta="center" lh={1.15} lineClamp={2} c={e.gesperrt ? 'dimmed' : undefined}>
            {e.text}
          </Text>
          <Text size="10px" c="dimmed" ta="center" lh={1.1} lineClamp={1}>
            {e.unter}
          </Text>
        </UnstyledButton>
      ))}
    </div>
  )
}

const formText = (x: { m: string; w: string; n: string }, form: TitelForm | undefined): string => (form === 'm' ? x.m : form === 'w' ? x.w : x.n)
const punkteText = (p: number): string => `${p} ${p === 1 ? 'Punkt' : 'Punkten'}`

/** Einzelheiten eines Titels der Hauptleiter: Form, „neben meinem Namen", Profilbild */
function TitelBlatt({
  s,
  x,
  d,
  avatar,
  setAvatar,
  geaendert,
  schliessen
}: {
  s: SprachSicht
  x: Leiterstufe | null
  d: Antwort
  avatar: string
  setAvatar: (id: string) => void
  geaendert: (k: TitelKurz) => void
  schliessen: () => void
}): React.JSX.Element {
  const erreicht = Boolean(x && x.stufe <= s.titel.stufe)
  const id = x ? `t-${leiterVon(s.sprache)}-${x.stufe}` : ''
  const frei = s.sammlung.some((b) => b.id === id && b.frei)
  const formen = x && !(x.m === x.w && x.w === x.n)
  const gezeigt = d.anzeige?.sprache === s.sprache && d.anzeige.stufe === x?.stufe
  return (
    <Blatt offen={Boolean(x)} schliessen={schliessen} titel={x ? formText(x, d.wahl.form) : ''}>
      {x && (
        <Stack align="center" gap="sm" pb="xs" data-titel-blatt={x.stufe}>
          <AuszBild id={id} gesperrt={!erreicht} groesse={112} alt={`${formText(x, d.wahl.form)}${erreicht ? '' : ' (noch nicht erreicht)'}`} />
          <Text size="sm" c="dimmed" ta="center">
            „{x.de}" · ab {punkteText(x.ab)} (Medaillenpunkte aller Schuljahre)
          </Text>
          {erreicht ? (
            <>
              <Badge size="lg" tt="none" variant="light">
                {x.stufe === s.titel.stufe ? `Dein Titel${s.titel.am ? ` seit ${datum(s.titel.am)}` : ''}` : 'Erreicht'}
              </Badge>
              {formen && (
                <SegmentedControl
                  fullWidth
                  data={FORMEN.map((f) => ({ value: f.value, label: x[f.value] }))}
                  value={d.wahl.form ?? 'n'}
                  onChange={(v) => void titelWahlSenden({ form: v as TitelForm }).then(geaendert, () => undefined)}
                  aria-label="Form deines Titels"
                  data-blatt-form
                />
              )}
              <Button
                variant={gezeigt ? 'light' : 'default'}
                leftSection={gezeigt ? <IconCheck size={16} /> : undefined}
                disabled={gezeigt}
                onClick={() => void titelWahlSenden({ anzeige: { sprache: s.sprache, stufe: x.stufe } }).then(geaendert, () => undefined)}
                data-titel-zeigen={x.stufe}
              >
                {gezeigt ? 'Steht neben deinem Namen' : 'Neben meinem Namen zeigen'}
              </Button>
            </>
          ) : (
            <Group gap={6} wrap="nowrap">
              <IconLock size={16} aria-hidden />
              <Text size="sm" fw={700}>
                Noch {punkteText(Math.max(0, x.ab - s.punkte)).replace('Punkten', 'Punkte')} – du hast {s.punkte}.
              </Text>
            </Group>
          )}
          <ProfilbildKnopf id={id} frei={frei} avatar={avatar} setAvatar={setAvatar} fertig={schliessen} />
        </Stack>
      )}
    </Blatt>
  )
}

interface JahresEintrag {
  schuljahr: number
  label: string
  stufe: number
  text: string | null
  punkte: number
  aktuell: boolean
}

/** Einzelheiten eines Jahrestitels */
function JahresBlatt({ s, j, avatar, setAvatar, schliessen }: { s: SprachSicht; j: JahresEintrag | null; avatar: string; setAvatar: (id: string) => void; schliessen: () => void }): React.JSX.Element {
  const id = j && j.stufe ? `t-${leiterVon(s.sprache)}-${j.stufe}` : ''
  const jt = s.jahrestitel
  return (
    <Blatt offen={Boolean(j)} schliessen={schliessen} titel={j ? `Jahrestitel ${j.label}` : ''}>
      {j && (
        <Stack align="center" gap="sm" pb="xs" data-jahres-blatt={j.schuljahr}>
          <AuszBild id={id || `t-${leiterVon(s.sprache)}-1`} gesperrt={!j.stufe} groesse={112} alt={j.text ?? 'Noch kein Jahrestitel'} />
          <Text fw={800} ta="center">
            {j.text ?? 'Noch keiner'}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {j.punkte} {j.punkte === 1 ? 'Medaillenpunkt' : 'Medaillenpunkte'} {j.aktuell ? 'in diesem Schuljahr' : `in ${j.label}`}
          </Text>
          {j.aktuell && jt && jt.naechsteAb !== null && jt.naechster && (
            <Text size="sm" ta="center">
              Noch {Math.max(0, jt.naechsteAb - j.punkte)} {jt.naechsteAb - j.punkte === 1 ? 'Punkt' : 'Punkte'} bis „{jt.naechster}".
            </Text>
          )}
          <Text size="xs" c="dimmed" ta="center">
            Jedes Schuljahr hat seinen eigenen Jahrestitel – er bleibt dir mit dem Schuljahr in deiner Sammlung.
          </Text>
          {id && <ProfilbildKnopf id={id} frei={s.sammlung.some((b) => b.id === id && b.frei)} avatar={avatar} setAvatar={setAvatar} fertig={schliessen} />}
        </Stack>
      )}
    </Blatt>
  )
}

/** Einzelheiten eines Bildes der Sammlung (Titel-Wappen; Medaillen öffnen das Medaillen-Blatt) */
function SammlungBlatt({ b, avatar, setAvatar, schliessen }: { b: SprachSicht['sammlung'][number] | null; avatar: string; setAvatar: (id: string) => void; schliessen: () => void }): React.JSX.Element {
  return (
    <Blatt offen={Boolean(b)} schliessen={schliessen} titel={b?.name ?? ''}>
      {b && (
        <Stack align="center" gap="sm" pb="xs">
          <AuszBild id={b.id} gesperrt={!b.frei} groesse={112} alt={b.name} />
          {!b.frei && (
            <Group gap={6} wrap="nowrap">
              <IconLock size={16} aria-hidden />
              <Text size="sm">Noch nicht freigeschaltet – {b.wie}</Text>
            </Group>
          )}
          <ProfilbildKnopf id={b.id} frei={b.frei} avatar={avatar} setAvatar={setAvatar} fertig={schliessen} />
        </Stack>
      )}
    </Blatt>
  )
}

// ---------------------------------------------------------------- Abschnitte je Sprache

/** Woraus die Zahlen des Schuljahres stammen */
function grundlageText(s: SprachSicht): string {
  const g = s.grundlage
  if (!g) return ''
  const teile = [
    g.woerter ? `${zahlText(g.woerter)} Wörter` : '',
    g.units ? `${g.units} Kapitel` : '',
    g.grammatik ? `${g.grammatik} Grammatikthemen` : '',
    g.schultage ? `${g.schultage} Schultage` : ''
  ].filter(Boolean)
  const ohne = [!g.woerter && 'Wortschatz', !g.grammatik && 'Grammatik', !g.units && 'Lehrwerk-Etappen'].filter(Boolean)
  const t = g.typisch
  return `${g.band ? `Grundlage: ${g.band}` : 'Ohne Lehrwerk'} (${teile.join(', ')})${ohne.length && t ? ` – ${ohne.join(', ')} wie bei einem typischen Band (${t.woerter} Wörter, ${t.grammatik} Grammatikthemen, ${t.units} Kapitel)` : ''}.`
}

const zahlMedaillen = (zeilen: RasterZeile[]): number => zeilen.reduce((a, z) => a + Math.min(6, Math.max(0, z.stufe)), 0)

/** Medaillen des gewählten Schuljahres: Jahreswahl oben, darunter das Raster */
function MedaillenAbschnitt({ s, avatar, setAvatar }: { s: SprachSicht; avatar: string; setAvatar: (id: string) => void }): React.JSX.Element {
  const [jahrWahl, setJahrWahl] = useState('jetzt')
  const [wahl, setWahl] = useState<{ z: RasterZeile; n: number } | null>(null)
  const frueher = s.frueher ?? []
  const jetztZeilen: RasterZeile[] = s.medaillen
  const zahlJetzt = zahlMedaillen(jetztZeilen)
  const altes = frueher.find((j) => String(j.schuljahr) === jahrWahl)
  const zeilen: RasterZeile[] = altes
    ? s.medaillen.map((m) => {
        const a = altes.medaillen.find((x) => x.kategorie === m.kategorie)
        return { kategorie: m.kategorie, name: m.name, text: m.text, stufe: a?.stufe ?? 0, am: a?.am ?? null }
      })
    : jetztZeilen
  const zahl = zahlMedaillen(zeilen)
  const frei = (id: string): boolean => s.sammlung.some((b) => b.id === id && b.frei)
  const jahr = altes ? altes.label : (s.jahr ?? '')
  return (
    <AuszKlapp
      id={`medaillen-${s.sprache}`}
      titel="Medaillen"
      status={
        <span data-ausz-jahr={s.jahr ?? ''}>
          {s.jahr ? `${s.jahr} · ` : ''}
          {zahlJetzt} von 42{frueher.length ? ` · ${frueher.length} ${frueher.length === 1 ? 'früheres Jahr' : 'frühere Jahre'}` : ''}
        </span>
      }
      rahmen={{ 'data-ausz-medaillen': s.sprache }}
    >
      <Stack gap="sm">
        {frueher.length > 0 && (
          <div style={{ overflowX: 'auto' }} data-fruehere-jahre={s.sprache}>
            <SegmentedControl
              size="xs"
              value={jahrWahl}
              onChange={(v) => (setJahrWahl(v), setWahl(null))}
              data={[
                { value: 'jetzt', label: <span data-ausz-jahr-wahl="jetzt">{s.jahr ?? 'Dieses Jahr'}</span> },
                ...frueher.map((j) => ({ value: String(j.schuljahr), label: <span data-ausz-jahr-wahl={j.schuljahr}>{j.label}</span> }))
              ]}
              aria-label="Schuljahr"
            />
          </div>
        )}
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }} data-medaillen-zahl={`${zahl}/42`}>
            {zahl} von 42 Medaillen
          </Text>
          <Progress value={(zahl / 42) * 100} size="sm" radius="xl" style={{ flex: 1 }} aria-label={`${zahl} von 42 Medaillen`} />
        </Group>
        <MedaillenRaster
          zeilen={zeilen}
          fortschritt={!altes}
          zelle={(z, n) => setWahl({ z, n })}
          rahmen={altes ? { 'data-frueheres-jahr': altes.schuljahr } : { 'data-raster-jetzt': true }}
        />
        <Text size="xs" c="dimmed">
          {altes
            ? `So weit bist du in ${altes.label} gekommen – das bleibt dir für immer.`
            : `Tippe auf eine Medaille für die Einzelheiten. Jedes Schuljahr beginnt eine neue Reihe; die Zahlen richten sich nach deinem Lehrwerksband und den Schultagen. ${grundlageText(s)}`}
        </Text>
      </Stack>
      <MedailleBlatt wahl={wahl} jahr={jahr} aktuell={!altes} frei={frei} avatar={avatar} setAvatar={setAvatar} schliessen={() => setWahl(null)} />
    </AuszKlapp>
  )
}

/** Haupttitel: Streifen der Titelleiter, der aktuelle hervorgehoben */
function TitelAbschnitt({ s, d, avatar, setAvatar, geaendert }: { s: SprachSicht; d: Antwort; avatar: string; setAvatar: (id: string) => void; geaendert: (k: TitelKurz) => void }): React.JSX.Element {
  const [wahl, setWahl] = useState<Leiterstufe | null>(null)
  const t = s.titel
  const naechste = t.leiter[t.stufe]
  const form = d.wahl.form
  return (
    <AuszKlapp
      id={`titel-${s.sprache}`}
      titel={`Titel in ${s.name}`}
      status={`${t.text ?? 'Noch keiner'} · ${naechste && t.naechsteAb !== null ? `nächster bei ${punkteText(t.naechsteAb)}` : 'ganz oben angekommen'}`}
      rahmen={{ 'data-titel-leiter': s.sprache, 'data-titel-stufe': t.stufe }}
    >
      <Stack gap="xs">
        {naechste && t.naechsteAb !== null && (
          <Stack gap={2}>
            <Progress value={(s.punkte / t.naechsteAb) * 100} size="sm" radius="xl" aria-label={`${s.punkte} von ${t.naechsteAb} Punkten bis zum nächsten Titel`} />
            <Text size="xs" c="dimmed">
              Noch {t.naechsteAb - s.punkte} {t.naechsteAb - s.punkte === 1 ? 'Punkt' : 'Punkte'} bis „{formText(naechste, form)}" – jede neue Medaillenstufe zählt einen Punkt, in allen Schuljahren zusammen.
            </Text>
          </Stack>
        )}
        <TitelStreifen
          label={`Titel in ${s.name}`}
          eintraege={t.leiter.map((x) => ({
            schluessel: String(x.stufe),
            bild: `t-${leiterVon(s.sprache)}-${x.stufe}`,
            gesperrt: x.stufe > t.stufe,
            text: formText(x, form),
            unter: x.stufe === t.stufe ? 'dein Titel' : `ab ${x.ab} P.`,
            aktuell: x.stufe === t.stufe,
            attr: { 'data-titel': x.stufe, 'data-erreicht': x.stufe <= t.stufe },
            tipp: () => setWahl(x)
          }))}
        />
      </Stack>
      <TitelBlatt s={s} x={wahl} d={d} avatar={avatar} setAvatar={setAvatar} geaendert={geaendert} schliessen={() => setWahl(null)} />
    </AuszKlapp>
  )
}

/** Jahrestitel aller Schuljahre: das laufende zuerst */
function JahresTitelAbschnitt({ s, avatar, setAvatar }: { s: SprachSicht; avatar: string; setAvatar: (id: string) => void }): React.JSX.Element | null {
  const [wahl, setWahl] = useState<JahresEintrag | null>(null)
  const j = s.jahrestitel
  if (!j) return null
  const p = s.punkteJahr ?? 0
  const eintraege: JahresEintrag[] = [
    { schuljahr: s.schuljahr ?? 0, label: s.jahr ?? s.schuljahrText ?? '', stufe: j.stufe, text: j.text, punkte: p, aktuell: true },
    ...(s.frueher ?? []).map((f) => ({ schuljahr: f.schuljahr, label: f.label, stufe: f.jahrestitelStufe ?? (f.jahrestitel ? 1 : 0), text: f.jahrestitel, punkte: f.punkte, aktuell: false }))
  ]
  const leiter = leiterVon(s.sprache)
  return (
    <AuszKlapp
      id={`jahrestitel-${s.sprache}`}
      titel={`Jahrestitel ${s.schuljahrText ?? ''}`}
      status={`${j.text ?? 'Noch keiner'}${j.naechsteAb !== null ? ` · nächster bei ${punkteText(j.naechsteAb)}` : ''}`}
      rahmen={{ 'data-jahrestitel': s.sprache, 'data-jahrestitel-stufe': j.stufe }}
    >
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          {p} {p === 1 ? 'Medaillenpunkt' : 'Medaillenpunkte'} in diesem Schuljahr
          {j.naechsteAb !== null && j.naechster ? ` · noch ${j.naechsteAb - p} bis „${j.naechster}"` : ''}
        </Text>
        <TitelStreifen
          label="Jahrestitel"
          eintraege={eintraege.map((e) => ({
            schluessel: String(e.schuljahr),
            bild: `t-${leiter}-${Math.max(1, e.stufe)}`,
            gesperrt: !e.stufe,
            text: e.text ?? 'Noch keiner',
            unter: e.label,
            aktuell: e.aktuell,
            attr: e.aktuell ? { 'data-jahrestitel-text': e.text ?? '' } : { 'data-frueherer-jahrestitel': e.text ?? '', 'data-frueheres-jahrestitel-jahr': e.schuljahr },
            tipp: () => setWahl(e)
          }))}
        />
      </Stack>
      <JahresBlatt s={s} j={wahl} avatar={avatar} setAvatar={setAvatar} schliessen={() => setWahl(null)} />
    </AuszKlapp>
  )
}

/** Sammlung aller Bilder (über alle Schuljahre) – zugleich die Profilbild-Wahl */
function SammlungAbschnitt({ s, avatar, setAvatar }: { s: SprachSicht; avatar: string; setAvatar: (id: string) => void }): React.JSX.Element {
  const [waehlen, setWaehlen] = useState(false)
  const [medaille, setMedaille] = useState<{ z: RasterZeile; n: number } | null>(null)
  const [bild, setBild] = useState<SprachSicht['sammlung'][number] | null>(null)
  const frei = s.sammlung.filter((b) => b.frei).length
  const istFrei = (id: string): boolean => s.sammlung.some((b) => b.id === id && b.frei)
  // Beste freigeschaltete Stufe je Kategorie
  const zeilen: RasterZeile[] = s.medaillen.map((m) => {
    let stufe = 0
    for (let n = 1; n <= 6; n++) if (istFrei(`m-${m.kategorie}-${n}`)) stufe = n
    return { kategorie: m.kategorie, name: m.name, text: m.text, stufe }
  })
  const titel = s.sammlung.filter((b) => b.art === 'titel')
  const avatarInfo = s.sammlung.find((b) => b.id === avatar)
  return (
    <AuszKlapp id={`sammlung-${s.sprache}`} titel="Sammlung & Profilbild" status={`${frei} von ${s.sammlung.length} Bildern freigeschaltet`} rahmen={{ 'data-sammlung': s.sprache, 'data-sammlung-zahl': `${frei}/${s.sammlung.length}` }}>
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap" justify="space-between">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            {avatar ? <AuszBild id={avatar} groesse={32} alt="Dein Profilbild" /> : <IconUserCircle size={32} aria-hidden style={{ color: 'var(--mantine-color-dimmed)' }} />}
            <Text size="xs" c="dimmed" lineClamp={2}>
              {avatar ? `Profilbild: ${avatarInfo?.name ?? 'aus einer anderen Sprache'}` : 'Noch kein Profilbild'}
            </Text>
          </Group>
          <Button size="xs" variant={waehlen ? 'filled' : 'light'} onClick={() => setWaehlen((w) => !w)} data-profilbild-waehlen aria-pressed={waehlen}>
            {waehlen ? 'Fertig' : 'Profilbild wählen'}
          </Button>
        </Group>
        {waehlen && (
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Text size="xs">Tippe auf ein freigeschaltetes Bild – es steht dann neben deinem Namen.</Text>
            {avatar && (
              <Button size="compact-xs" variant="default" onClick={() => setAvatar('')}>
                Keins
              </Button>
            )}
          </Group>
        )}
        <MedaillenRaster
          zeilen={zeilen}
          avatar={avatar}
          auswahl={waehlen}
          zelle={(z, n) => (waehlen ? n <= z.stufe && setAvatar(`m-${z.kategorie}-${n}`) : setMedaille({ z, n }))}
          rahmen={{ 'data-sammlung-raster': true }}
        />
        <Text size="xs" fw={700}>
          Titel-Wappen
        </Text>
        <SimpleGrid cols={8} spacing={4}>
          {titel.map((b) => (
            <UnstyledButton
              key={b.id}
              onClick={() => (waehlen ? b.frei && setAvatar(b.id) : setBild(b))}
              disabled={waehlen && !b.frei}
              aria-label={`${b.name}: ${b.frei ? (waehlen ? 'als Profilbild wählen' : 'freigeschaltet') : 'noch nicht freigeschaltet'}`}
              aria-pressed={waehlen ? avatar === b.id : undefined}
              data-sammlung-bild={b.id}
              data-frei={b.frei}
              style={{
                borderRadius: 8,
                padding: 2,
                display: 'flex',
                justifyContent: 'center',
                outline: avatar === b.id ? '2px solid var(--mantine-primary-color-filled)' : undefined,
                outlineOffset: -1,
                opacity: waehlen && !b.frei ? 0.45 : 1
              }}
            >
              <img src={bildAdresse(b.id, !b.frei)} alt="" loading="lazy" style={{ width: '100%', maxWidth: 40, height: 'auto', aspectRatio: '120 / 140', objectFit: 'contain' }} />
            </UnstyledButton>
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Alles, was du in {s.name} je erreicht hast – in allen Schuljahren. Als Profilbild geht jedes freigeschaltete Bild.
        </Text>
      </Stack>
      <MedailleBlatt wahl={medaille} jahr={null} aktuell={false} frei={istFrei} avatar={avatar} setAvatar={setAvatar} schliessen={() => setMedaille(null)} />
      <SammlungBlatt b={bild} avatar={avatar} setAvatar={setAvatar} schliessen={() => setBild(null)} />
    </AuszKlapp>
  )
}

/** Inhalt des Reiters „Medaillen & Titel" */
export function MedaillenTitelInhalt(): React.JSX.Element {
  const [d, setD] = useState<Antwort | null | 'fehler'>(null)
  const [dialog, setDialog] = useState(false)
  const [avatar, setAvatar] = useAvatar()
  const laden = useCallback(() => {
    void holen<Antwort>('/s/api/auszeichnungen').then(
      // In der Musterschüler-Vorschau nicht fragen (die Wahl würde nicht gespeichert)
      (r) => (setD(r), r.formOffen && !window.__schulappsServer?.vorschau && setDialog(true)),
      () => setD('fehler')
    )
  }, [])
  useEffect(laden, [laden])
  if (d === null) return <Loader size="sm" />
  if (d === 'fehler')
    return (
      <Text size="sm" c="dimmed">
        Die Medaillen lassen sich gerade nicht laden – bitte gleich noch einmal öffnen.
      </Text>
    )
  if (!d.sprachen.length)
    return (
      <Text size="sm" c="dimmed" data-medaillen-leer>
        Sobald du in einem Sprachkurs übst, sammelst du hier Medaillen und Titel – für jede Sprache eigene.
      </Text>
    )
  const geaendert = (k: TitelKurz): void => setD((alt) => (alt && alt !== 'fehler' ? { ...alt, ...k } : alt))
  return (
    <Stack gap="sm" data-medaillen-titel>
      <TitelFormDialog offen={dialog} beispiel={d.beispiel ?? null} fertig={(k) => (setDialog(false), k && geaendert(k))} />
      <Tabs defaultValue={d.sprachen[0].sprache} keepMounted={false}>
        {d.sprachen.length > 1 && (
          <Tabs.List mb="sm">
            {d.sprachen.map((s) => (
              <Tabs.Tab key={s.sprache} value={s.sprache} data-ausz-sprache={s.sprache}>
                {s.name}
                {s.titel.text ? ` · ${s.titel.text}` : ''}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        )}
        {d.sprachen.map((s) => (
          <Tabs.Panel key={s.sprache} value={s.sprache}>
            <Stack gap="xs" data-ausz-reihe={s.sprache}>
              <MedaillenAbschnitt s={s} avatar={avatar} setAvatar={setAvatar} />
              <TitelAbschnitt s={s} d={d} avatar={avatar} setAvatar={setAvatar} geaendert={geaendert} />
              <JahresTitelAbschnitt s={s} avatar={avatar} setAvatar={setAvatar} />
              <SammlungAbschnitt s={s} avatar={avatar} setAvatar={setAvatar} />
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs>
      <AuszKlapp
        id="titel-wahl"
        titel="Dein Titel neben dem Namen"
        status={<span data-angezeigter-titel={d.anzeige?.text ?? ''}>{d.anzeige ? `Neben deinem Namen steht: ${d.anzeige.text}` : 'Kein Titel neben deinem Namen'}</span>}
      >
        <TitelWahlFelder d={d} geaendert={geaendert} />
      </AuszKlapp>
    </Stack>
  )
}


/** Für die Einstellungen: nur Form, Anzeige und Profilbild-Hinweis */
export function TitelEinstellungen(): React.JSX.Element {
  const [d, setD] = useState<Antwort | null>(null)
  useEffect(() => {
    void holen<Antwort>('/s/api/auszeichnungen').then(setD, () => undefined)
  }, [])
  if (!d) return <Loader size="sm" />
  return (
    <Stack gap="sm" data-titel-einstellungen>
      <TitelWahlFelder d={d} geaendert={(k) => setD({ ...d, ...k })} />
      <Text size="xs" c="dimmed">
        Ein Profilbild wählst du in deiner Sammlung unter „Achievements" – dort siehst du auch, wie du weitere freischaltest.
      </Text>
    </Stack>
  )
}
