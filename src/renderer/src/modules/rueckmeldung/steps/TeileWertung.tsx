import { Card, Group, Stack, Text, Tooltip } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { gesamtEinstufen, vorschlag, type SkalenKontext } from '../art'
import { teilTabelle } from '../blattLayout'
import type { Bogen, EinstufungsArt, Rueckmeldung } from '../model/types'
import { gesamtAusTeilen, getrennt, teilAnteil, teilZeile, type TeilWertung } from '../teilbewertung'

/**
 * Wertung je Teil im Bogen (29.09.2026): Schreiben/Sprachmittlung mit Inhalt und Sprache,
 * andere Teile mit ihrem Erfüllungsgrad. Ändert die Lehrkraft einen Wert, folgt die
 * Gesamteinstufung als neuer Vorschlag (wieder zu bestätigen).
 *
 * `variante="blatt"`: als Abschnitt im Kasten des A4-Blatts – dieselbe kleine Tabelle wie im
 * Ausdruck (29.09.2026 nachts, Bericht der Lehrkraft: „Inhalt 40 % · Sprache 60 % = 52 %" las sich
 * wie die Gewichtung 40 : 60). Jetzt: Teil | zählt | Inhalt erreicht (Gewicht 40 %) | Sprache
 * erreicht (Gewicht 60 %) | Ergebnis, darunter die Gesamtleistung. Die Rechnung steht nur in der
 * Ansicht als Erläuterung am Ergebnis („Inhalt 40 % × 0,4 + Sprache 60 % × 0,6 = 52 %").
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
    const tt = teilTabelle(r, bogen)
    if (!tt) return null
    const zahl = (label: string, wert: number | undefined, onChange: (n: number) => void): React.JSX.Element => (
      <span className="rm-teil-zahl">
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
      </span>
    )
    const gewicht = (g: number | null | undefined): React.ReactNode => (g != null ? <small>Gewicht {g} %</small> : null)
    return (
      <div data-rm-teile>
        <table className="bl-teiltab">
          <thead>
            {tt.getrennt ? (
              <tr>
                <th>Teil</th>
                <th className="z">zählt</th>
                <th className="z">
                  Inhalt erreicht
                  {gewicht(tt.gewichtEinheitlich)}
                </th>
                <th className="z">
                  Sprache erreicht
                  {gewicht(tt.gewichtEinheitlich != null ? 100 - tt.gewichtEinheitlich : null)}
                </th>
                <th className="z">Ergebnis</th>
              </tr>
            ) : (
              <tr>
                <th>Teil</th>
                <th className="z">zählt</th>
                <th className="z">Ergebnis</th>
              </tr>
            )}
          </thead>
          <tbody>
            {tt.zeilen.map((z) => {
              const einzeln = tt.gewichtEinheitlich == null && z.getrennt
              return (
                <tr key={z.id} title={z.begruendung}>
                  <td>{z.titel}</td>
                  <td className="z">{z.zaehlt}</td>
                  {tt.getrennt &&
                    (z.getrennt ? (
                      <>
                        <td className="z">
                          {zahl(`Inhalt erreicht ${z.titel}`, z.inhalt, (n) => setze(z.id, { inhalt: n }))}
                          {einzeln && gewicht(z.gewichtInhalt)}
                        </td>
                        <td className="z">
                          {zahl(`Sprache erreicht ${z.titel}`, z.sprache, (n) => setze(z.id, { sprache: n }))}
                          {einzeln && gewicht(100 - (z.gewichtInhalt ?? 0))}
                        </td>
                      </>
                    ) : (
                      <td className="z" colSpan={2}>
                        erfüllt {zahl(`Erfüllt ${z.titel}`, z.anteil, (n) => setze(z.id, { anteil: n }))}
                      </td>
                    ))}
                  {!tt.getrennt ? (
                    <td className="z erg">{zahl(`Erfüllt ${z.titel}`, z.anteil, (n) => setze(z.id, { anteil: n }))}</td>
                  ) : (
                    <td className="z erg">
                      <Tooltip label={z.rechnung || 'Noch ohne Wertung'} multiline w={300} withinPortal>
                        <span className="rm-rechnung" data-rm-teil-ergebnis>
                          {z.ergebnis != null ? `${z.ergebnis} %` : '–'}
                          {z.gedeckelt ? '*' : ''}
                        </span>
                      </Tooltip>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {tt.gesamtText && (
          <p className="bl-teil-gesamt">
            <Tooltip label={tt.gesamtRechnung} multiline w={320} withinPortal disabled={!tt.gesamtRechnung}>
              <span className="rm-rechnung" data-rm-teil-gesamt>
                {tt.gesamtText}
              </span>
            </Tooltip>
          </p>
        )}
        {tt.zeilen.some((z) => z.gedeckelt) && <p className="bl-teil-hinweis">* höchstens 20 %, weil Inhalt oder Sprache ungenügend ist</p>}
      </div>
    )
  }

  const zahl = (label: string, wert: number | undefined, onChange: (n: number) => void): React.JSX.Element => (
    <ZahlFeld size="xs" label={label} min={0} max={100} suffix=" %" value={wert ?? 0} onChange={(x) => onChange(Math.max(0, Math.min(100, Number(x) || 0)))} w={100} />
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
                  {zahl('Inhalt erreicht', w?.inhalt, (n) => setze(t.id, { inhalt: n }))}
                  {zahl('Sprache erreicht', w?.sprache, (n) => setze(t.id, { sprache: n }))}
                </>
              ) : (
                zahl('Erfüllt', w?.anteil, (n) => setze(t.id, { anteil: n }))
              )}
              <Text size="xs" c="dimmed" w={90}>
                {a === null ? '–' : `Ergebnis ${a} %`}
              </Text>
            </Group>
          )
        })}
        {gesamt && (
          <Text size="xs" c="dimmed">
            Gesamt: {gesamt.anteil} %{gesamt.moeglich ? ` · ${gesamt.erreicht} von ${gesamt.moeglich} Punkten` : ''} (
            {v === 'punkte' ? 'Teile nach Punkten verrechnet' : 'Teile nach Gewichtung verrechnet'})
          </Text>
        )}
      </Stack>
    </Card>
  )
}
