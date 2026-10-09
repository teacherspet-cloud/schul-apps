/**
 * „Lernstand als Verlauf" (09.10.2026, Wunsch der Lehrkraft: schöner darstellen). Die sieben Stufen des Karteikastens
 * (shared/vokabeltrainer.ts STUFEN, von Neu bis Langzeitgedächtnis) sind GEORDNET – deshalb eine Farbe in Stufen
 * (Türkis der App, hell → kräftig) statt eines Regenbogens; „Neu" neutral grau. Im dunklen Design eigene Stufen
 * (dunkel → hell), damit „weiter" immer „auffälliger" heißt.
 *
 *  - `LernstandSymbol`: Ring in der Kursliste (Anteil je Stufe als Bogen, in der Mitte „x %" geübt); Rechtsklick
 *    schaltet wie bisher auf die feste Fachfarbe um.
 *  - `Faecherbalken`: gestapelter Balken je Person (Tabelle der Lernenden).
 *  - `StufenDiagramm`: Säulen je Stufe mit Achse (Anteil der Wörter), Beschriftung, Tooltip und Textfassung für
 *    Screenreader – auf der Kursseite im Überblick.
 */
import { Group, Progress, Text, Tooltip, useComputedColorScheme } from '@mantine/core'
import { IconCards } from '@tabler/icons-react'
import { STUFEN, type Uebersicht } from '@shared/vokabeltrainer'
import { useAppSettings } from '../../../shared/settingsStore'
import { fachFarbe } from '../../../shared/fachfarben'

export const FACH_NAMEN = STUFEN.map((x) => x.name)
/** Mantine-Farbnamen der Stufen (Rückfall für Stellen, die Namen brauchen) */
export const FACH_FARBEN = ['gray', 'teal', 'teal', 'teal', 'teal', 'teal', 'teal']

const HELL = ['var(--mantine-color-gray-4)', 'var(--mantine-color-teal-1)', 'var(--mantine-color-teal-3)', 'var(--mantine-color-teal-4)', 'var(--mantine-color-teal-6)', 'var(--mantine-color-teal-7)', 'var(--mantine-color-teal-9)']
const DUNKEL = ['var(--mantine-color-dark-3)', 'var(--mantine-color-teal-9)', 'var(--mantine-color-teal-8)', 'var(--mantine-color-teal-7)', 'var(--mantine-color-teal-5)', 'var(--mantine-color-teal-3)', 'var(--mantine-color-teal-1)']

/** Farben der sieben Stufen für das aktuelle Design */
export function useStufenFarben(): string[] {
  const dunkel = useComputedColorScheme('light') === 'dark'
  return dunkel ? DUNKEL : HELL
}

const prozent = (x: number): string => `${Math.round(x * 100)} %`

/**
 * Symbol links in der Kursliste (08.10.2026, Wunsch der Lehrkraft; 09.10.2026 als Ring): Verteilung der Wörter aller
 * Lernenden auf die Stufen – oder per Rechtsklick eine feste Farbe (Fachfarbe).
 */
export function LernstandSymbol({
  faecher,
  art,
  fach,
  umschalten,
  groesse = 52
}: {
  faecher: number[]
  art: 'verlauf' | 'farbe'
  fach: string
  umschalten?: () => void
  groesse?: number
}): React.JSX.Element {
  useAppSettings((s) => s.settings.fachfarben)
  const farben = useStufenFarben()
  const summe = faecher.reduce((a, b) => a + b, 0)
  const geuebt = summe ? Math.round(((summe - (faecher[0] ?? 0)) / summe) * 100) : 0
  const r = 20
  const umfang = 2 * Math.PI * r
  // Bögen mit 2px Lücke (in Einheiten der 48er-Fläche), nur Stufen mit Wörtern
  const belegt = faecher.map((n, i) => ({ n, i })).filter((x) => x.n > 0)
  const luecke = belegt.length > 1 ? 1.6 : 0
  let start = 0
  const boegen = belegt.map(({ n, i }) => {
    const laenge = (n / summe) * umfang
    const b = { i, n, von: start, laenge: Math.max(0.5, laenge - luecke) }
    start += laenge
    return b
  })
  const label =
    art === 'farbe'
      ? 'Rechtsklick: Lernstand als Verlauf zeigen'
      : summe
        ? `Lernstand aller: ${geuebt} % geübt – ${belegt.map(({ n, i }) => `${FACH_NAMEN[i]} ${Math.round((n / summe) * 100)} %`).join(', ')}. Rechtsklick: feste Farbe`
        : 'Noch nichts geübt – Rechtsklick: feste Farbe'
  return (
    <Tooltip position="right" multiline maw={280} label={label}>
      <div
        onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), umschalten?.())}
        data-lernstand-symbol={art}
        role="img"
        aria-label={label}
        style={{
          width: groesse,
          height: groesse,
          flexShrink: 0,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          background: art === 'farbe' ? fachFarbe(fach) ?? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-default-hover)',
          color: art === 'farbe' ? '#fff' : 'var(--mantine-color-text)'
        }}
      >
        {art === 'farbe' ? (
          <IconCards size={groesse * 0.46} />
        ) : (
          <svg width={groesse} height={groesse} viewBox="0 0 48 48" aria-hidden>
            <circle cx="24" cy="24" r={r} fill="none" stroke="var(--mantine-color-default-border)" strokeWidth="5" />
            {boegen.map((b) => (
              <circle
                key={b.i}
                cx="24"
                cy="24"
                r={r}
                fill="none"
                stroke={farben[b.i]}
                strokeWidth="5"
                strokeDasharray={`${b.laenge} ${umfang - b.laenge}`}
                strokeDashoffset={-b.von}
                transform="rotate(-90 24 24)"
              />
            ))}
            <text x="24" y="27.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
              {geuebt}%
            </text>
          </svg>
        )}
      </div>
    </Tooltip>
  )
}

/** Balken der Stufenverteilung (je Person) */
export function Faecherbalken({ u, hoehe = 10 }: { u: Uebersicht; hoehe?: number }): React.JSX.Element {
  const farben = useStufenFarben()
  return (
    <Progress.Root size={hoehe} radius="xl" style={{ gap: 2 }}>
      {u.faecher.map((n, i) =>
        n ? (
          <Tooltip key={i} label={`${FACH_NAMEN[i]}: ${n}`}>
            <Progress.Section value={(n / Math.max(1, u.gesamt)) * 100} color={farben[i]} />
          </Tooltip>
        ) : null
      )}
    </Progress.Root>
  )
}

/** Obergrenze der Achse: 25, 50, 75 oder 100 % */
export const achsenMax = (anteil: number): number => Math.min(1, Math.max(0.25, Math.ceil(anteil * 4 - 1e-9) / 4))

/**
 * Säulendiagramm der Stufen (Lernstand des Kurses). Eine Reihe – deshalb keine Legende; die Stufen stehen an der
 * x-Achse, der Anteil der Wörter an der y-Achse. Werte über den Säulen, Tooltip mit Zahl der Wörter.
 */
export function StufenDiagramm({ u, hoehe = 140 }: { u: Uebersicht; hoehe?: number }): React.JSX.Element {
  const farben = useStufenFarben()
  const gesamt = Math.max(1, u.faecher.reduce((a, b) => a + b, 0))
  const anteile = u.faecher.map((n) => n / gesamt)
  const max = achsenMax(Math.max(...anteile, 0))
  const striche = [0, max / 2, max]
  const beschreibung = `Verteilung der Wörter auf die Stufen: ${u.faecher.map((n, i) => `${FACH_NAMEN[i]} ${prozent(n / gesamt)}`).join(', ')}`
  return (
    <figure style={{ margin: 0 }} data-stufen-diagramm aria-label={beschreibung}>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* y-Achse */}
        <div style={{ position: 'relative', width: 34, height: hoehe, flexShrink: 0 }} aria-hidden>
          {striche.map((s) => (
            <Text key={s} size="10px" c="dimmed" style={{ position: 'absolute', right: 2, bottom: (s / max) * hoehe - 6, lineHeight: '12px' }}>
              {Math.round(s * 100)} %
            </Text>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {/* Gitterlinien, zurückhaltend */}
          {striche.map((s) => (
            <div
              key={s}
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: (s / max) * hoehe,
                borderTop: `1px ${s === 0 ? 'solid' : 'dashed'} var(--mantine-color-default-border)`
              }}
            />
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${u.faecher.length}, 1fr)`, gap: 6, height: hoehe, alignItems: 'end', position: 'relative' }}>
            {u.faecher.map((n, i) => {
              const h = (anteile[i] / max) * hoehe
              return (
                <Tooltip key={i} label={`${FACH_NAMEN[i]}: ${n} ${n === 1 ? 'Wort' : 'Wörter'} (${prozent(anteile[i])})`}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} data-stufe-saeule={i}>
                    {n > 0 && (
                      <Text size="10px" fw={600} mb={2} style={{ lineHeight: '12px' }}>
                        {prozent(anteile[i])}
                      </Text>
                    )}
                    <div style={{ width: '100%', maxWidth: 34, height: Math.max(n ? 3 : 0, h), background: farben[i], borderRadius: '4px 4px 0 0' }} />
                  </div>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
      {/* x-Achse */}
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${u.faecher.length}, 1fr)`, columnGap: 6, marginTop: 4 }} aria-hidden>
        <span />
        {STUFEN.map((s) => (
          <Text key={s.name} size="10px" c="dimmed" ta="center" style={{ lineHeight: '12px', hyphens: 'manual', overflowWrap: 'anywhere' }}>
            {s.kurz}
          </Text>
        ))}
      </div>
      <Group gap={6} mt={6} justify="center" aria-hidden>
        <Text size="xs" c="dimmed">
          Neu
        </Text>
        <div style={{ display: 'flex', gap: 2 }}>
          {farben.map((f, i) => (
            <div key={i} style={{ width: 14, height: 8, borderRadius: 2, background: f }} />
          ))}
        </div>
        <Text size="xs" c="dimmed">
          Langzeitgedächtnis
        </Text>
      </Group>
    </figure>
  )
}
