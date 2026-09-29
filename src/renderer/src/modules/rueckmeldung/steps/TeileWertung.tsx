import { Card, Group, NumberInput, Stack, Text } from '@mantine/core'
import { gesamtEinstufen, vorschlag, type SkalenKontext } from '../art'
import type { Bogen, EinstufungsArt, Rueckmeldung } from '../model/types'
import { gesamtAusTeilen, getrennt, teilAnteil, teilZeile, type TeilWertung } from '../teilbewertung'

/**
 * Wertung je Teil im Bogen (29.09.2026): Schreiben/Sprachmittlung mit Inhalt und Sprache,
 * andere Teile mit ihrem Erfüllungsgrad. Ändert die Lehrkraft einen Wert, folgt die
 * Gesamteinstufung als neuer Vorschlag (wieder zu bestätigen).
 *
 * `variante="blatt"`: als Abschnitt im Kasten des A4-Blatts – dieselben Zeilen wie im Ausdruck,
 * die Prozentwerte direkt auf dem Blatt änderbar.
 */
export default function TeileWertung({
  r,
  bogen,
  art,
  skala,
  setzeBogen,
  variante = 'karte'
}: {
  r: Rueckmeldung
  bogen: Bogen
  art: EinstufungsArt
  skala: SkalenKontext
  setzeBogen: (fn: (b: Bogen) => void, gruppe?: string) => void
  variante?: 'karte' | 'blatt'
}): React.JSX.Element | null {
  const teile = r.grundlage.teile ?? []
  if (!teile.length || art === 'keine') return null
  const v = r.grundlage.verrechnung ?? 'prozent'
  // Oberstufe: Inhalt oder Sprache unter 20 % deckelt den Teil (teilbewertung.ts)
  const oberstufe = r.meta.grade >= 11
  const gesamt = gesamtAusTeilen(teile, bogen.teile ?? [], v, oberstufe)

  const setze = (teilId: string, p: Partial<TeilWertung>): void =>
    setzeBogen((b) => {
      if (!b.teile) b.teile = []
      let w = b.teile.find((x) => x.teilId === teilId)
      if (!w) {
        w = { teilId }
        b.teile.push(w)
      }
      Object.assign(w, p)
      const g = gesamtAusTeilen(teile, b.teile, v, oberstufe)
      if (g && gesamtEinstufen(r.meta)) b.gesamt = vorschlag(art, g.anteil, skala, b.gesamt?.begruendung)
    }, `rm-teil-${teilId}`)

  if (variante === 'blatt') {
    const zahl = (label: string, wert: number | undefined, onChange: (n: number) => void): React.JSX.Element => (
      <label className="rm-teil-zahl">
        {label}{' '}
        <input
          type="number"
          min={0}
          max={100}
          value={wert ?? ''}
          placeholder="–"
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0)))}
          aria-label={label}
        />{' '}
        %
      </label>
    )
    return (
      <div className="bl-teile" data-rm-teile>
        {teile.map((t) => {
          const w = bogen.teile?.find((x) => x.teilId === t.id)
          const a = teilAnteil(t, w, oberstufe)
          return (
            <div key={t.id} className="rm-teil-zeile" title={w?.begruendung}>
              <span>{teilZeile({ ...t, ...(getrennt(t) ? { art: 'sonstig' as const } : {}) }, v)}:</span>{' '}
              {getrennt(t) ? (
                <>
                  {zahl('Inhalt', w?.inhalt, (n) => setze(t.id, { inhalt: n }))} · {zahl('Sprache', w?.sprache, (n) => setze(t.id, { sprache: n }))}
                </>
              ) : (
                zahl('Erfüllt', w?.anteil, (n) => setze(t.id, { anteil: n }))
              )}
              {getrennt(t) && a !== null && <span className="rm-nur-ansicht rm-teil-summe"> = {a} %</span>}
            </div>
          )
        })}
        {gesamt && (
          <div className="rm-nur-ansicht rm-teil-summe">
            Gesamt: {gesamt.anteil} %{gesamt.moeglich ? ` · ${gesamt.erreicht} von ${gesamt.moeglich} Punkten` : ''} ({v === 'punkte' ? 'nach Punkten' : 'nach Gewichtung'})
          </div>
        )}
      </div>
    )
  }

  const zahl = (label: string, wert: number | undefined, onChange: (n: number) => void): React.JSX.Element => (
    <NumberInput size="xs" label={label} min={0} max={100} suffix=" %" value={wert ?? 0} onChange={(x) => onChange(Math.max(0, Math.min(100, Number(x) || 0)))} w={100} />
  )

  return (
    <Card withBorder padding="sm" data-rm-teile>
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Bewertung nach Teilen
        </Text>
        {teile.map((t) => {
          const w = bogen.teile?.find((x) => x.teilId === t.id)
          const a = teilAnteil(t, w, oberstufe)
          return (
            <Group key={t.id} gap="sm" align="flex-end" wrap="wrap">
              <Stack gap={0} style={{ flex: '1 1 180px' }}>
                <Text size="sm">{teilZeile(t, v)}</Text>
                {w?.begruendung && (
                  <Text size="xs" c="dimmed">
                    {w.begruendung}
                  </Text>
                )}
              </Stack>
              {getrennt(t) ? (
                <>
                  {zahl('Inhalt', w?.inhalt, (n) => setze(t.id, { inhalt: n }))}
                  {zahl('Sprache', w?.sprache, (n) => setze(t.id, { sprache: n }))}
                </>
              ) : (
                zahl('Erfüllt', w?.anteil, (n) => setze(t.id, { anteil: n }))
              )}
              <Text size="xs" c="dimmed" w={70}>
                {a === null ? '–' : `= ${a} %`}
              </Text>
            </Group>
          )
        })}
        {gesamt && (
          <Text size="xs" c="dimmed">
            Gesamt: {gesamt.anteil} %{gesamt.moeglich ? ` · ${gesamt.erreicht} von ${gesamt.moeglich} Punkten` : ''} (
            {v === 'punkte' ? 'nach Punkten' : 'nach Gewichtung'})
          </Text>
        )}
      </Stack>
    </Card>
  )
}
