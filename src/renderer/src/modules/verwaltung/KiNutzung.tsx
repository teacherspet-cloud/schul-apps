/**
 * KI-Nutzung der Lehrkräfte im Reiter „KI-Zugänge" (09.10.2026; seit 10.10.2026 oben im Reiter und grafisch).
 *
 * NUR Nutzung über die Schlüssel der Schule – private Zugänge (eigenes Abo, eigener Schlüssel) erfasst der Server gar
 * nicht (server/kiNutzung.ts). Keine Daten von Lernenden.
 *
 * Aufbau (Entscheidung der Lehrkraft, 10.10.2026): Zeitraum Woche/Monat/Schuljahr, Kennzahlen (Anfragen, Token,
 * geschätzte Kosten, aktive Lehrkräfte), Budget-Ring (ab 80 % orange, ab 100 % rot), Ring je Programm, gestapelte
 * Säulen der letzten 30 Tage (nach Anbieter oder Programm), Verteilung je Lehrkraft ANONYM („Lehrkraft A, B …" –
 * der Server schickt weder Namen noch Kennungen), Monate, Preise für die Kosten-Schätzung.
 * Diagramme aus shared/components/diagramme (feste, geprüfte Farbreihenfolge; Grau nur für „Andere").
 */
import { Alert, Button, Card, Group, NumberInput, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconCoin, IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { budgetStand, type KiBudget, type KiPreise } from '@shared/kiKosten'
import { FortschrittsRing, GestapelteSaeulen, Kennzahl, RingDiagramm, useFarbenMitAndere, useReihenFarben } from '../../shared/components/diagramme'
import { KlappKarte } from '../../shared/components/KlappKarte'

export type KiZeitraum = 'woche' | 'monat' | 'schuljahr'
export type KiMass = 'anfragen' | 'token' | 'kosten'

export interface KiWerte {
  a: number
  t: number
  k: number
}

export interface KiNutzungDaten {
  zeitraum: KiZeitraum
  von: string
  bis: string
  summe: {
    anfragen: number
    auftraege: number
    eingabe: number
    ausgabe: number
    tokens: number
    ohneToken: number
    euro: number | null
    euroUnvollstaendig: boolean
    nurGesamtpreis: boolean
    fehler: number
    limits: number
    aktiveLehrkraefte: number
  }
  tage: string[]
  jeTagAnbieter: Record<string, KiWerte>[]
  jeTagArt: Record<string, KiWerte>[]
  jeArt: Record<string, KiWerte>
  jeAnbieterZeitraum: Record<string, KiWerte>
  lehrkraefte: { bezeichnung: string; anfragen: number; tokens: number; euro: number; anteil: number }[]
  monate: { monat: string; werte: KiWerte }[]
  jeAnbieter: Record<string, { lehrkraefte: number; anfragen: number }>
  modelle: string[]
  preise: KiPreise
  hatPreise: boolean
  budget: KiBudget | null
  budgetMonat: { monat: string; verbraucht: number; anteil: number; stufe: 'ok' | 'warnung' | 'ueber'; ohnePreise: boolean } | null
  arten: Record<string, string>
  haltenTage: number
}

const ANDERE = '__andere'
const ZEITRAUM_TEXT: Record<KiZeitraum, string> = { woche: 'letzte 7 Tage', monat: 'letzte 30 Tage', schuljahr: 'dieses Schuljahr' }
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export const zahl = (n: number): string => Math.round(n).toLocaleString('de-DE')
/** 1.234 / 12.345 / 1,2 Mio. */
export const tokenText = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.` : zahl(n))
export const euroText = (n: number): string => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monatText = (m: string): string => `${MONATE[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(0, 4)}`
const datum = (iso: string): string => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}`

export const wertNach = (w: KiWerte | undefined, mass: KiMass): number => (!w ? 0 : mass === 'anfragen' ? w.a : mass === 'token' ? w.t : w.k)
const massText = (v: number, mass: KiMass): string => (mass === 'kosten' ? euroText(v) : mass === 'token' ? `${tokenText(v)} Token` : `${zahl(v)} Anfragen`)

/** Die `max` größten Schlüssel nach Maß (über alle Tage bzw. den Zeitraum), der Rest wird „Andere" */
export function hauptSchluessel(maps: Record<string, KiWerte>[], mass: KiMass, max = 4): string[] {
  const summe = new Map<string, number>()
  for (const m of maps) for (const [k, w] of Object.entries(m)) summe.set(k, (summe.get(k) ?? 0) + wertNach(w, mass))
  return [...summe.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k)
}

function Zeitraumwahl({ wert, setzen }: { wert: KiZeitraum; setzen: (z: KiZeitraum) => void }): React.JSX.Element {
  return (
    <SegmentedControl
      size="xs"
      value={wert}
      onChange={(v) => setzen(v as KiZeitraum)}
      data={[
        { value: 'woche', label: 'Woche' },
        { value: 'monat', label: 'Monat' },
        { value: 'schuljahr', label: 'Schuljahr' }
      ]}
      aria-label="Zeitraum"
      data-ki-zeitraum={wert}
    />
  )
}

/** Säulen der letzten 30 Tage, gestapelt nach Anbieter oder Programm */
function SaeulenJeTag({ daten, mass, nach, anbieterName }: { daten: KiNutzungDaten; mass: KiMass; nach: 'anbieter' | 'art'; anbieterName: (id: string) => string }): React.JSX.Element {
  const { farben, andere } = useFarbenMitAndere()
  const maps = nach === 'anbieter' ? daten.jeTagAnbieter : daten.jeTagArt
  const haupt = hauptSchluessel(maps, mass)
  const rest = (m: Record<string, KiWerte>): number => Object.entries(m).reduce((s, [k, w]) => s + (haupt.includes(k) ? 0 : wertNach(w, mass)), 0)
  const mitAndere = maps.some((m) => rest(m) > 0)
  const name = (k: string): string => (k === ANDERE ? 'Andere' : nach === 'anbieter' ? anbieterName(k) : (daten.arten[k] ?? k))
  const reihen = [...haupt, ...(mitAndere ? [ANDERE] : [])].map((k, r) => ({
    name: name(k),
    farbe: k === ANDERE ? andere : farben[r],
    werte: maps.map((m) => (k === ANDERE ? rest(m) : wertNach(m[k], mass)))
  }))
  const gesamt = reihen.reduce((s, r) => s + r.werte.reduce((x, v) => x + v, 0), 0)
  const einheit = mass === 'kosten' ? '€' : mass === 'token' ? 'Token' : 'Anfragen'
  const aria = `Gestapelte Säulen: KI-Nutzung je Tag über die Schlüssel der Schule, ${maps.length} Tage, insgesamt ${massText(gesamt, mass)}. ${reihen
    .map((r) => `${r.name}: ${massText(r.werte.reduce((s, v) => s + v, 0), mass)}`)
    .join(', ')}.`
  if (!gesamt)
    return (
      <Text size="sm" c="dimmed">
        In den letzten 30 Tagen keine Nutzung über die Schlüssel der Schule{mass !== 'anfragen' ? ' mit diesem Maß' : ''}.
      </Text>
    )
  return <GestapelteSaeulen tage={daten.tage} reihen={reihen} beschreibung={aria} einheit={einheit} />
}

/** Ring je Programm im Zeitraum */
function RingJeArt({ daten, mass }: { daten: KiNutzungDaten; mass: KiMass }): React.JSX.Element {
  const { farben, andere } = useFarbenMitAndere()
  const haupt = hauptSchluessel([daten.jeArt], mass)
  const rest = Object.entries(daten.jeArt).reduce((s, [k, w]) => s + (haupt.includes(k) ? 0 : wertNach(w, mass)), 0)
  const teile = [
    ...haupt.map((k, i) => ({ name: daten.arten[k] ?? k, wert: wertNach(daten.jeArt[k], mass), farbe: farben[i] })),
    ...(rest > 0 ? [{ name: 'Andere', wert: rest, farbe: andere }] : [])
  ]
  const gesamt = teile.reduce((s, t) => s + t.wert, 0)
  if (!gesamt)
    return (
      <Text size="sm" c="dimmed">
        Keine Nutzung im Zeitraum.
      </Text>
    )
  return (
    <RingDiagramm
      teile={teile}
      mitte={mass === 'kosten' ? euroText(gesamt) : mass === 'token' ? tokenText(gesamt) : zahl(gesamt)}
      unten={mass === 'kosten' ? 'geschätzt' : mass === 'token' ? 'Token' : 'Anfragen'}
      wertText={(v) => `${mass === 'kosten' ? euroText(v) : mass === 'token' ? tokenText(v) : zahl(v)} (${Math.round((v / gesamt) * 100)} %)`}
      titel="Anteil je Programm"
      groesse={140}
    />
  )
}

/** Verteilung je Lehrkraft – anonym, nach Nutzung sortiert */
function JeLehrkraft({ daten, mass }: { daten: KiNutzungDaten; mass: KiMass }): React.JSX.Element {
  const farbe = useReihenFarben()[0]
  const [alle, setAlle] = useState(false)
  const wert = (z: KiNutzungDaten['lehrkraefte'][number]): number => (mass === 'anfragen' ? z.anfragen : mass === 'token' ? z.tokens : z.euro)
  const zeilen = [...daten.lehrkraefte].sort((a, b) => wert(b) - wert(a))
  const gesamt = Math.max(1e-9, zeilen.reduce((s, z) => s + wert(z), 0))
  const max = Math.max(1e-9, ...zeilen.map(wert))
  const sichtbar = alle ? zeilen : zeilen.slice(0, 12)
  if (!zeilen.length)
    return (
      <Text size="sm" c="dimmed">
        Keine Nutzung im Zeitraum.
      </Text>
    )
  return (
    <Stack gap={6} data-ki-lehrkraefte>
      {sichtbar.map((z) => {
        const v = wert(z)
        const anteil = Math.round((v / gesamt) * 100)
        return (
          <div key={z.bezeichnung} data-ki-lehrkraft={z.bezeichnung} role="img" aria-label={`${z.bezeichnung}: ${massText(v, mass)}, ${anteil} %`}>
            <Group justify="space-between" gap="xs" wrap="nowrap" aria-hidden>
              <Text size="sm">{z.bezeichnung}</Text>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {massText(v, mass)} · {anteil} %
              </Text>
            </Group>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--mantine-color-default-border)', overflow: 'hidden' }} aria-hidden>
              <div style={{ width: `${(v / max) * 100}%`, minWidth: v > 0 ? 3 : 0, height: '100%', background: farbe, borderRadius: 4 }} />
            </div>
          </div>
        )
      })}
      {zeilen.length > 12 && (
        <Button variant="subtle" size="xs" onClick={() => setAlle((a) => !a)} style={{ alignSelf: 'flex-start' }}>
          {alle ? 'Weniger zeigen' : `Alle ${zeilen.length} zeigen`}
        </Button>
      )}
    </Stack>
  )
}

/** Monatsbudget: Ring und Einstellung */
function BudgetKarte({ daten, speichern }: { daten: KiNutzungDaten; speichern: (b: KiBudget | null) => void }): React.JSX.Element {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [art, setArt] = useState<'token' | 'euro'>(daten.budget?.art ?? 'token')
  const [wert, setWert] = useState<string | number>(daten.budget?.wert ?? '')
  useEffect(() => {
    setArt(daten.budget?.art ?? 'token')
    setWert(daten.budget?.wert ?? '')
  }, [daten.budget])
  const b = daten.budget
  const m = daten.budgetMonat
  const stand = b && m && !m.ohnePreise ? budgetStand(m.verbraucht, b.wert) : null
  const text = (v: number): string => (b?.art === 'euro' ? euroText(v) : `${tokenText(v)} Token`)
  return (
    <Card withBorder padding="sm" data-ki-budget={stand?.stufe ?? 'keins'}>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600} size="sm">
          Monatsbudget{m ? ` (${monatText(m.monat)})` : ''}
        </Text>
        {!bearbeiten && (
          <Button size="compact-xs" variant="subtle" onClick={() => setBearbeiten(true)}>
            {b ? 'Ändern' : 'Festlegen'}
          </Button>
        )}
      </Group>
      {bearbeiten ? (
        <Stack gap="xs">
          <SegmentedControl
            size="xs"
            value={art}
            onChange={(v) => setArt(v as 'token' | 'euro')}
            data={[
              { value: 'token', label: 'Token' },
              { value: 'euro', label: 'Euro', disabled: !daten.hatPreise }
            ]}
            aria-label="Budget in"
          />
          {!daten.hatPreise && (
            <Text size="xs" c="dimmed">
              Euro erst nach Eintragen der Preise (unten).
            </Text>
          )}
          <NumberInput
            label={art === 'euro' ? 'Euro je Monat' : 'Token je Monat'}
            value={wert}
            onChange={setWert}
            min={0}
            decimalSeparator=","
            thousandSeparator="."
            allowNegative={false}
            decimalScale={art === 'euro' ? 2 : 0}
            data-ki-budget-wert
          />
          <Group gap="xs" justify="flex-end">
            {b && (
              <Button size="xs" variant="subtle" color="red" onClick={() => (speichern(null), setBearbeiten(false))}>
                Entfernen
              </Button>
            )}
            <Button size="xs" variant="default" onClick={() => setBearbeiten(false)}>
              Abbrechen
            </Button>
            <Button size="xs" disabled={!(Number(wert) > 0)} onClick={() => (speichern({ art, wert: Number(wert) }), setBearbeiten(false))}>
              Speichern
            </Button>
          </Group>
        </Stack>
      ) : b && m ? (
        m.ohnePreise ? (
          <Text size="sm" c="dimmed">
            Budget in Euro festgelegt ({euroText(b.wert)}), aber noch keine Preise eingetragen – der Verbrauch lässt sich nicht schätzen.
          </Text>
        ) : (
          <Group gap="md" wrap="nowrap">
            <FortschrittsRing anteil={stand?.anteil ?? 0} titel="Monatsbudget" unten={`${text(m.verbraucht)} von ${text(b.wert)}`} />
            <div>
              <Text size="sm">
                {text(m.verbraucht)} von {text(b.wert)}
              </Text>
              {stand && stand.stufe !== 'ok' ? (
                <Group gap={4} wrap="nowrap">
                  <IconAlertTriangle size={14} color={stand.stufe === 'ueber' ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-orange-6)'} aria-hidden />
                  <Text size="xs" c={stand.stufe === 'ueber' ? 'red.7' : 'orange.7'} fw={600}>
                    {stand.stufe === 'ueber' ? 'Budget überschritten' : 'Über 80 % des Budgets'}
                  </Text>
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  Warnung ab 80 %
                </Text>
              )}
              {b.art === 'euro' && (
                <Text size="xs" c="dimmed">
                  Schätzung
                </Text>
              )}
            </div>
          </Group>
        )
      ) : (
        <Text size="sm" c="dimmed">
          Kein Monatsbudget festgelegt.
        </Text>
      )}
    </Card>
  )
}

/** Preise je 1 Mio. Token (Schätzung) */
function Preise({ daten, anbieter, anbieterName, speichern }: { daten: KiNutzungDaten; anbieter: string[]; anbieterName: (id: string) => string; speichern: (p: KiPreise) => void }): React.JSX.Element {
  const [preise, setPreise] = useState<Record<string, { ein: string; aus: string }>>({})
  const [neuesModell, setNeuesModell] = useState('')
  const zuText = (p: KiPreise): Record<string, { ein: string; aus: string }> =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ein: v.ein !== undefined ? String(v.ein).replace('.', ',') : '', aus: v.aus !== undefined ? String(v.aus).replace('.', ',') : '' }]))
  useEffect(() => setPreise(zuText(daten.preise)), [daten.preise])
  const zeilen = useMemo(() => [...new Set([...anbieter, ...daten.modelle, ...Object.keys(daten.preise), ...Object.keys(preise)])].sort(), [anbieter, daten.modelle, daten.preise, preise])
  const setze = (k: string, feld: 'ein' | 'aus', v: string): void => setPreise((p) => ({ ...p, [k]: { ein: p[k]?.ein ?? '', aus: p[k]?.aus ?? '', [feld]: v } }))
  const ergebnis = (): KiPreise => {
    const aus: KiPreise = {}
    for (const [k, v] of Object.entries(preise)) {
      const ein = v.ein.trim() ? Number(v.ein.replace(',', '.')) : undefined
      const ausP = v.aus.trim() ? Number(v.aus.replace(',', '.')) : undefined
      if ((ein !== undefined && Number.isFinite(ein)) || (ausP !== undefined && Number.isFinite(ausP)))
        aus[k] = { ...(ein !== undefined && Number.isFinite(ein) ? { ein } : {}), ...(ausP !== undefined && Number.isFinite(ausP) ? { aus: ausP } : {}) }
    }
    return aus
  }
  const name = (k: string): string => {
    const [a, ...m] = k.split('|')
    return m.length ? `${anbieterName(a)} · ${m.join('|')}` : `${anbieterName(a)} (alle Modelle)`
  }
  return (
    <KlappKarte id="verwaltung-ki-preise" titel="Preise für die Schätzung" status={daten.hatPreise ? `${Object.keys(daten.preise).length} eingetragen` : 'keine Preise'}>
      <Stack gap="sm" data-ki-preise>
        <Text size="sm" c="dimmed">
          Euro je 1 Million Token laut Vertrag oder Preisliste des Anbieters. Ein Preis für ein Modell geht dem Preis „alle Modelle" vor. Die Kosten sind nur eine Schätzung aus den
          gezählten Token – maßgeblich ist die Rechnung des Anbieters.
        </Text>
        <Table.ScrollContainer minWidth={420}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Anbieter / Modell</Table.Th>
                <Table.Th>Eingabe €/1 Mio.</Table.Th>
                <Table.Th>Ausgabe €/1 Mio.</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zeilen.map((k) => (
                <Table.Tr key={k} data-ki-preis={k}>
                  <Table.Td>
                    <Text size="sm">{name(k)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" w={100} inputMode="decimal" value={preise[k]?.ein ?? ''} onChange={(e) => setze(k, 'ein', e.currentTarget.value)} aria-label={`${name(k)}: Eingabe`} />
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" w={100} inputMode="decimal" value={preise[k]?.aus ?? ''} onChange={(e) => setze(k, 'aus', e.currentTarget.value)} aria-label={`${name(k)}: Ausgabe`} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Group gap="xs" align="end">
          <TextInput
            size="xs"
            label="Weiteres Modell"
            placeholder="z. B. mistral|mistral-large-latest"
            value={neuesModell}
            onChange={(e) => setNeuesModell(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={14} />}
            disabled={!/^[a-z0-9_-]+(\|.+)?$/i.test(neuesModell.trim())}
            onClick={() => (setze(neuesModell.trim(), 'ein', preise[neuesModell.trim()]?.ein ?? ''), setNeuesModell(''))}
          >
            Hinzufügen
          </Button>
        </Group>
        <Group justify="flex-end" gap="xs">
          {daten.hatPreise && (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => window.confirm('Alle Preise entfernen?') && speichern({})}>
              Alle entfernen
            </Button>
          )}
          <Button size="xs" leftSection={<IconCoin size={14} />} onClick={() => speichern(ergebnis())} data-ki-preise-speichern>
            Preise speichern
          </Button>
        </Group>
      </Stack>
    </KlappKarte>
  )
}

export default function KiNutzung({
  daten,
  zeitraum,
  setZeitraum,
  anbieterName,
  anbieter,
  budgetSpeichern,
  preiseSpeichern
}: {
  daten: KiNutzungDaten
  zeitraum: KiZeitraum
  setZeitraum: (z: KiZeitraum) => void
  anbieterName: (id: string) => string
  /** KI-Anbieter mit Schlüssel der Schule (für die Preiseingabe) */
  anbieter: string[]
  budgetSpeichern: (b: KiBudget | null) => void
  preiseSpeichern: (p: KiPreise) => void
}): React.JSX.Element {
  const [massWahl, setMass] = useState<KiMass>('anfragen')
  const [nach, setNach] = useState<'anbieter' | 'art'>('anbieter')
  const mass: KiMass = massWahl === 'kosten' && !daten.hatPreise ? 'anfragen' : massWahl
  const s = daten.summe
  return (
    <Stack gap="md" data-testid="ki-nutzung">
      <Group justify="space-between" gap="xs">
        <Title order={4}>KI-Nutzung der Lehrkräfte</Title>
        <Zeitraumwahl wert={zeitraum} setzen={setZeitraum} />
      </Group>
      <Text size="sm" c="dimmed">
        {ZEITRAUM_TEXT[daten.zeitraum]} ({datum(daten.von)} – {datum(daten.bis)}). Nur Anfragen über die Schlüssel der Schule; private Zugänge der Lehrkräfte und Daten von
        Lernenden werden nicht erfasst. Je Lehrkraft nur anonym. Gespeichert sind je Tag nur Zahlen, nach {zahl(daten.haltenTage)} Tagen gelöscht.
      </Text>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" data-ki-kennzahlen>
        <Kennzahl titel="Anfragen" wert={zahl(s.anfragen)} hinweis={`${zahl(s.auftraege)} Aufträge${s.fehler ? ` · ${zahl(s.fehler)} Fehler` : ''}`} warnung={s.limits > 0} />
        <Kennzahl titel="Token" wert={tokenText(s.tokens)} hinweis={s.tokens ? `${tokenText(s.eingabe)} ein · ${tokenText(s.ausgabe)} aus` : 'noch keine Token gemeldet'} />
        <Kennzahl
          titel="Kosten (Schätzung)"
          wert={s.euro === null ? '–' : euroText(s.euro)}
          hinweis={s.euro === null ? 'Preise unten eintragen' : s.euroUnvollstaendig ? 'unvollständig, siehe Hinweis' : 'aus Token und Preisen'}
        />
        <Kennzahl titel="Aktive Lehrkräfte" wert={zahl(s.aktiveLehrkraefte)} hinweis="anonym gezählt" />
      </SimpleGrid>
      {(s.ohneToken > 0 || s.nurGesamtpreis || (s.euro !== null && s.euroUnvollstaendig)) && (
        <Alert variant="light" color="gray" p="xs">
          <Text size="xs">
            {s.ohneToken > 0 && `${zahl(s.ohneToken)} Anfragen ohne Token-Angabe des Anbieters (z. B. Bilder oder ältere Einträge) – sie fehlen in Token und Kosten. `}
            {s.euro !== null && s.euroUnvollstaendig && 'Für einen Teil der Nutzung ist kein Preis eingetragen. '}
            {s.nurGesamtpreis && 'Bei Anbietern mit nur einem Preis gilt er für alle Token (Eingabe und Ausgabe zusammen).'}
          </Text>
        </Alert>
      )}
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>
          Darstellung
        </Text>
        <SegmentedControl
          size="xs"
          value={mass}
          onChange={(v) => setMass(v as KiMass)}
          data={[
            { value: 'anfragen', label: 'Anfragen' },
            { value: 'token', label: 'Token' },
            { value: 'kosten', label: 'Kosten', disabled: !daten.hatPreise }
          ]}
          aria-label="Maß der Diagramme"
          data-ki-mass={mass}
        />
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <BudgetKarte daten={daten} speichern={budgetSpeichern} />
        <Card withBorder padding="sm" data-ki-ring>
          <Text fw={600} size="sm" mb="xs">
            Anteil je Programm
          </Text>
          <RingJeArt daten={daten} mass={mass} />
        </Card>
      </SimpleGrid>
      <Card withBorder padding="sm" data-ki-saeulen>
        <Group justify="space-between" gap="xs" mb="xs">
          <Text fw={600} size="sm">
            Je Tag, letzte 30 Tage
          </Text>
          <SegmentedControl
            size="xs"
            value={nach}
            onChange={(v) => setNach(v as 'anbieter' | 'art')}
            data={[
              { value: 'anbieter', label: 'nach Anbieter' },
              { value: 'art', label: 'nach Programm' }
            ]}
            aria-label="Säulen gestapelt"
          />
        </Group>
        <SaeulenJeTag daten={daten} mass={mass} nach={nach} anbieterName={anbieterName} />
      </Card>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Card withBorder padding="sm">
          <Text fw={600} size="sm">
            Je Lehrkraft (anonym)
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            Nach Nutzung im Zeitraum geordnet; die Buchstaben gelten nur für diesen Zeitraum.
          </Text>
          <JeLehrkraft daten={daten} mass={mass} />
        </Card>
        <Card withBorder padding="sm" data-ki-monate>
          <Text fw={600} size="sm" mb="xs">
            Je Monat
          </Text>
          {daten.monate.length ? (
            <Table.ScrollContainer minWidth={300}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Monat</Table.Th>
                    <Table.Th ta="right">Anfragen</Table.Th>
                    <Table.Th ta="right">Token</Table.Th>
                    <Table.Th ta="right">Kosten*</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...daten.monate].reverse().map((m) => (
                    <Table.Tr key={m.monat}>
                      <Table.Td>{monatText(m.monat)}</Table.Td>
                      <Table.Td ta="right">{zahl(m.werte.a)}</Table.Td>
                      <Table.Td ta="right">{tokenText(m.werte.t)}</Table.Td>
                      <Table.Td ta="right">{daten.hatPreise ? euroText(m.werte.k) : '–'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>
                * Schätzung aus Token und eingetragenen Preisen; Monate nur, soweit sie im Zeitraum liegen.
              </Text>
            </Table.ScrollContainer>
          ) : (
            <Text size="sm" c="dimmed">
              Keine Nutzung im Zeitraum.
            </Text>
          )}
        </Card>
      </SimpleGrid>
      <Preise daten={daten} anbieter={anbieter} anbieterName={anbieterName} speichern={preiseSpeichern} />
    </Stack>
  )
}
