/**
 * Klassenkarte im Startbildschirm von „Meine Klassen" (03.11.2026, abgestimmt mit der Lehrkraft):
 *  - Kopf: Streifen in den Fachfarben, geteilt je Fach; Klassenzeichen, Name, Lernende, Handlungsbedarf.
 *  - Je Fach eine anklickbare Zeile (öffnet die Klasse bei diesem Fach): Vokabelbalken mit „x/y diese Woche",
 *    nächster Termin (Vokabeltest mit Abschnitten, Onlinetest, Haltepunkt), laufende Reihe mit Fortschritt und
 *    höchstens zwei offene Punkte („Zu erledigen", Vorrang wie die Startseite; Server: klassen.ts › klassenKarteFach),
 *    jeder Punkt springt an seine Stelle; darüber hinaus „+ n weitere" (Handlungsbedarf-Fenster).
 *  - Reihenfolge nach Jahrgang (wie bisher); Klassen ohne Lernende bzw. Fach stehen klein am Ende (`LeereKlassen`).
 */
import { Badge, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconCalendarEvent, IconCheck, IconChevronRight, IconRoute } from '@tabler/icons-react'
import { fachSchreibweise } from '@shared/faecher'
import { tagKurz } from '@shared/startseiteKurse'
import { FachPunkt, useFachFarbe } from '../../shared/components/FachFarbe'
import { VokabelBalken } from '../../shared/components/VokabelBalken'
import { IservAbzeichen, type IservAngabe } from './IservKurse'
import type { Bedarf } from './Handlungsbedarf'

export interface KartenTermin {
  tag: string
  art: 'test' | 'onlinetest' | 'halt'
  text: string
  ziel: string
}

export interface KarteFach {
  id: string
  fach: string
  bedarf: number
  vokabelnSicher: number | null
  vokabeln?: { sicher: number; aufbau: number; neu: number; aktiv7: number; lernende: number } | null
  testSchnitt: number | null
  reihen: number
  blaetter: number
  termin?: KartenTermin | null
  reihe?: { zid: string; titel: string; schnitt: number; weitere: number } | null
  todo?: Bedarf[]
  todoGesamt?: number
}

export interface KarteKlasse {
  schluessel: string
  name: string
  lernende: number
  bedarf: number
  faecher: KarteFach[]
  iserv?: IservAngabe | null
}

export interface KartenAktionen {
  /** Klasse öffnen – mit Fach (Lerngruppe) und Reiter */
  klasse: (k: KarteKlasse, gruppe?: string, reiter?: string) => void
  /** Offenen Punkt an seiner Stelle öffnen */
  punkt: (k: KarteKlasse, f: KarteFach, b: Bedarf) => void
  /** Termin öffnen (Vokabeltest → Kurs, Onlinetest, Haltepunkt → Reihe) */
  termin: (k: KarteKlasse, f: KarteFach, t: KartenTermin) => void
  /** Laufende Reihe öffnen */
  reihe: (zid: string) => void
  /** Alle offenen Punkte des Fachs (Handlungsbedarf-Fenster) */
  allePunkte: (k: KarteKlasse, f: KarteFach) => void
}

/** Leer = ohne Lernende oder ohne Fach – steht klein am Ende */
export const istLeereKlasse = (k: Pick<KarteKlasse, 'lernende' | 'faecher'>): boolean => k.lernende === 0 || k.faecher.length === 0

const zeichenVon = (name: string): string => name.trim().replace(/^Klasse\s+/i, '')
const klassenName = (name: string): string => (/^\d/.test(name) ? `Klasse ${name}` : name)
const prozent = (x: number): string => `${Math.round(x * 100)} %`
const note = (x: number): string => x.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Ein Abschnitt des Kopfstreifens in der Farbe seines Fachs */
function StreifenTeil({ fach }: { fach: string }): React.JSX.Element {
  const farbe = useFachFarbe(fach) ?? 'var(--mantine-color-gray-5)'
  return <div style={{ flex: 1, background: farbe }} title={fachSchreibweise(fach)} />
}

/** Kleiner, anklickbarer Eintrag unter einer Fachzeile (Termin, Reihe, offener Punkt) */
function Eintrag({
  symbol,
  farbe,
  text,
  onClick,
  ...rest
}: {
  symbol: React.ReactNode
  farbe?: string
  text: React.ReactNode
  onClick: () => void
} & Record<`data-${string}`, string | boolean | undefined>): React.JSX.Element {
  return (
    <UnstyledButton
      onClick={(e) => (e.stopPropagation(), onClick())}
      className="mk-karte-eintrag"
      style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%', textAlign: 'left', borderRadius: 6, padding: '2px 4px' }}
      {...rest}
    >
      <span style={{ flex: 'none', display: 'inline-flex', marginTop: 2, color: farbe ? `var(--mantine-color-${farbe}-6)` : undefined }}>{symbol}</span>
      <Text size="xs" lineClamp={2} style={{ minWidth: 0 }}>
        {text}
      </Text>
    </UnstyledButton>
  )
}

function FachZeile({ k, f, a }: { k: KarteKlasse; f: KarteFach; a: KartenAktionen }): React.JSX.Element {
  const farbe = useFachFarbe(f.fach) ?? 'var(--mantine-color-gray-5)'
  const v = f.vokabeln
  const weitere = Math.max(0, (f.todoGesamt ?? f.bedarf) - (f.todo?.length ?? 0))
  const zusatz = [f.testSchnitt !== null && `Ø ${note(f.testSchnitt)}`, !f.reihe && f.reihen > 0 && `${f.reihen} Reihe${f.reihen === 1 ? '' : 'n'}`, f.blaetter > 0 && `${f.blaetter} Bl.`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      style={{ borderLeft: `3px solid ${farbe}`, paddingLeft: 8, cursor: 'pointer' }}
      onClick={(e) => (e.stopPropagation(), a.klasse(k, f.id))}
      data-klasse-fach={f.fach}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <FachPunkt fach={f.fach} groesse={8} />
          <Text fw={700} size="sm" truncate>
            {fachSchreibweise(f.fach)}
          </Text>
          {v ? (
            <VokabelBalken a={v} breite={56} schnitt titel="Vokabeln" rechts={<></>} />
          ) : (
            f.vokabelnSicher !== null && (
              <Text size="xs" c="dimmed">
                {prozent(f.vokabelnSicher)} sicher
              </Text>
            )
          )}
          {v && v.lernende > 0 && (
            <Tooltip label="Lernende, die in den letzten 7 Tagen geübt haben">
              <Text size="xs" c={v.aktiv7 / v.lernende >= 0.5 ? 'teal' : 'orange'} style={{ whiteSpace: 'nowrap' }} data-karte-aktiv>
                {v.aktiv7}/{v.lernende} diese Woche
              </Text>
            </Tooltip>
          )}
        </Group>
        <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
          {zusatz && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {zusatz}
            </Text>
          )}
          <IconChevronRight size={14} color="var(--mantine-color-dimmed)" />
        </Group>
      </Group>
      <Stack gap={0} mt={2}>
        {f.termin && (
          <Eintrag
            symbol={<IconCalendarEvent size={13} />}
            farbe="blue"
            text={
              <>
                <b>{tagKurz(f.termin.tag)}</b> {f.termin.text}
              </>
            }
            onClick={() => a.termin(k, f, f.termin!)}
            data-karte-termin={f.termin.art}
          />
        )}
        {f.reihe && (
          <Eintrag
            symbol={<IconRoute size={13} />}
            farbe="violet"
            text={`${f.reihe.titel} · Ø ${prozent(f.reihe.schnitt)} geschafft${f.reihe.weitere ? ` · +${f.reihe.weitere} weitere Reihe${f.reihe.weitere === 1 ? '' : 'n'}` : ''}`}
            onClick={() => a.reihe(f.reihe!.zid)}
            data-karte-reihe
          />
        )}
        {(f.todo ?? []).map((b) => (
          <Eintrag key={b.schluessel} symbol={<IconAlertTriangle size={13} />} farbe="orange" text={b.text} onClick={() => a.punkt(k, f, b)} data-karte-todo={b.art} />
        ))}
        {weitere > 0 && (
          <Eintrag symbol={<span style={{ width: 13 }} />} text={<Text span size="xs" c="dimmed">+ {weitere} weitere</Text>} onClick={() => a.allePunkte(k, f)} data-karte-weitere />
        )}
      </Stack>
    </div>
  )
}

export function KlassenKarte({ k, a }: { k: KarteKlasse; a: KartenAktionen }): React.JSX.Element {
  const zeichen = zeichenVon(k.name)
  return (
    <div
      className="vorlage-karte mk-karte"
      role="button"
      tabIndex={0}
      onClick={() => a.klasse(k)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), a.klasse(k))}
      style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
      data-klassen-karte={k.name}
    >
      {/* Kopfstreifen in den Fachfarben, geteilt je Fach */}
      <div style={{ display: 'flex', height: 6 }} aria-hidden data-karte-streifen>
        {k.faecher.length ? k.faecher.map((f) => <StreifenTeil key={f.id} fach={f.fach} />) : <div style={{ flex: 1, background: 'var(--mantine-color-gray-5)' }} />}
      </div>
      <Stack gap="xs" p={12}>
        {/* data-klasse am Kopf: ein Klick dort öffnet die Klasse (die Fachzeilen darunter führen ins Fach bzw. an die Stelle) */}
        <Group justify="space-between" wrap="nowrap" gap="xs" data-klasse={k.name}>
          <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
            <span className="home-mk-zeichen" data-lang={zeichen.length > 3 || undefined} aria-hidden>
              {zeichen}
            </span>
            <div style={{ minWidth: 0 }}>
              <Text fw={800} size="lg" lh={1.15} truncate>
                {klassenName(k.name)}
              </Text>
              <Text size="xs" c="dimmed">
                {k.lernende} Lernende · {k.faecher.length} {k.faecher.length === 1 ? 'Fach' : 'Fächer'}
              </Text>
            </div>
          </Group>
          <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
            {k.iserv && <IservAbzeichen a={k.iserv} />}
            {k.bedarf > 0 ? (
              <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={12} />} data-karte-bedarf={k.bedarf}>
                {k.bedarf}
              </Badge>
            ) : (
              <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
                alles ruhig
              </Badge>
            )}
          </Group>
        </Group>
        <Stack gap={8}>
          {k.faecher.map((f) => (
            <FachZeile key={f.id} k={k} f={f} a={a} />
          ))}
        </Stack>
      </Stack>
    </div>
  )
}

/** Klassen ohne Lernende bzw. ohne Fach: eine schmale Zeile am Ende („Noch einzurichten") */
export function LeereKlassen({ klassen, a }: { klassen: KarteKlasse[]; a: KartenAktionen }): React.JSX.Element | null {
  if (!klassen.length) return null
  return (
    <Group gap="xs" mt="md" data-leere-klassen>
      <Text size="sm" c="dimmed">
        Noch einzurichten:
      </Text>
      {klassen.map((k) => (
        <Tooltip key={k.schluessel} label={k.faecher.length ? 'Noch keine Lernenden – in der Klasse eintragen bzw. aus IServ übernehmen' : 'Noch kein Fach – in der Klasse „+ Fach hinzufügen"'}>
          <UnstyledButton onClick={() => a.klasse(k)} className="mk-leer" data-klasse={k.name}>
            <Badge variant="default" size="lg" style={{ cursor: 'pointer', textTransform: 'none' }}>
              {klassenName(k.name)} · {k.faecher.length ? `${k.lernende} Lernende` : 'kein Fach'}
            </Badge>
          </UnstyledButton>
        </Tooltip>
      ))}
    </Group>
  )
}
