/**
 * Freischalt-Leiste des Vokabelwegs (03.10.2026, Wunsch der Lehrkraft: „eine Progressionsbar, die dies
 * spielerisch als Freischalten anzeigt"). Ein Pfad durch die Abschnitte des Bandes: gelernt (Haken),
 * aktuell (Ring mit Fortschritt zur 80-%-Schwelle), frei, gesperrt (Schloss). Darüber, wie viele Wörter
 * bis zum nächsten Abschnitt fehlen; ein neu freigeschalteter Abschnitt wird gefeiert.
 *
 * 08.10.2026 (abgestimmt): zuklappbar, zugeklappt als Vorgabe, der letzte Zustand am Konto gemerkt
 * (Darstellung.vokabelwegOffen). Ein freier Abschnitt lässt sich antippen – der Trainer öffnet dann ein Fenster
 * mit genau dessen Wörtern (`oeffne`); gesperrte bleiben ohne Klick, ein Hinweis sagt warum.
 */
import { Collapse, Group, Progress, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { senden } from '../onlinetest/serverApi'
import { fuerServer, useDarstellung } from '../onlinetest/schuelerDarstellung'
import { IconCheck, IconChevronDown, IconConfetti, IconLock, IconMapPin } from '@tabler/icons-react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { fehlenBis, type Stufe } from '@shared/vokabelLaufbahn'

export interface WegKurz {
  key: string
  name: string
  band: string
  fach: string
  sprache: string
  farbe: string | null
  schwelle: number
  stufen: Stufe[]
}

export const LEITER_CSS = `
.vw { border-radius: 20px; padding: 16px; background: var(--vt-flaeche); border: 1px solid var(--vt-a-rand); box-shadow: 0 6px 22px var(--vt-schatten); }
.vw-pfad { display: flex; align-items: flex-start; gap: 0; overflow-x: auto; padding: 8px 4px 4px; scroll-snap-type: x proximity; }
.vw-unit { display: flex; flex-direction: column; align-items: flex-start; flex: none; scroll-snap-align: start; }
.vw-unit-name { font-size: .72rem; font-weight: 700; color: var(--vt-a-dunkel); margin: 0 0 6px 6px; white-space: nowrap; }
.vw-reihe { display: flex; align-items: center; }
.vw-linie { width: 22px; height: 4px; border-radius: 2px; background: var(--vt-linie); flex: none; }
.vw-linie.an { background: var(--vt-a); }
.vw-knoten { position: relative; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; flex: none; font-weight: 800; font-size: .8rem;
  border: 3px solid var(--vt-linie); background: var(--vt-flaeche); color: var(--vt-leise); transition: transform .2s; }
.vw-knoten.frei { border-color: var(--vt-a-zart); color: var(--vt-a-dunkel); }
.vw-knoten.gelernt { border-color: var(--vt-a); background: var(--vt-a); color: var(--vt-auf-akzent); }
.vw-knoten.aktuell { border-color: transparent; color: var(--vt-a-dunkel); box-shadow: 0 0 0 4px var(--vt-a-rand); animation: vw-puls 2.2s ease-in-out infinite; }
.vw-knoten.zu { background: var(--vt-a-hell); opacity: .75; }
button.vw-knoten { cursor: pointer; font-family: inherit; padding: 0; }
button.vw-knoten:hover, button.vw-knoten:focus-visible { transform: scale(1.08); outline: none; box-shadow: 0 0 0 4px var(--vt-a-rand); }
.vw-pfeil { transition: transform .2s; color: var(--vt-a-dunkel); flex: none; }
.vw-pfeil.offen { transform: rotate(180deg); }
.vw-name { font-size: .66rem; color: var(--vt-leise); text-align: center; margin-top: 4px; width: 68px; margin-left: -11px; line-height: 1.15; }
@keyframes vw-puls { 0%, 100% { box-shadow: 0 0 0 4px var(--vt-a-rand) } 50% { box-shadow: 0 0 0 8px var(--vt-a-hell2) } }
.vw-fest { display: flex; gap: 10px; align-items: center; border-radius: 14px; padding: 10px 12px; background: var(--vt-gut-bg); color: var(--vt-gut-text); font-weight: 700; animation: vt-rein .5s ease-out; }
@media (prefers-reduced-motion: reduce) { .vw-knoten.aktuell { animation: none } }
`

const kurz = (s: string): string => s.replace(/^Station\s*/i, 'St. ').replace(/^Unit\s*/i, 'U ')

export function VokabelLeiter({ weg, oeffne }: { weg: WegKurz; oeffne?: (s: Stufe) => void }): React.JSX.Element {
  const stufen = weg.stufen
  // Auf- und zuklappen (08.10.2026): am Konto gemerkt, folgt auf jedes Gerät; Gäste merken es nur auf dem Gerät
  const { d: wahl, setze: setzeWahl } = useDarstellung()
  const offen = wahl.vokabelwegOffen === true
  const klappen = (): void => {
    const neu = { ...wahl, vokabelwegOffen: !offen }
    setzeWahl(neu)
    if (window.__schulappsServer?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  const gelernt = stufen.filter((s) => s.gelernt).length
  const aktuellIndex = stufen.findIndex((s) => s.aktuell)
  const aktuell = aktuellIndex >= 0 ? stufen[aktuellIndex] : null
  const naechste = aktuellIndex >= 0 ? stufen[aktuellIndex + 1] : null
  // Neu freigeschaltet seit dem letzten Besuch? (je Gerät gemerkt)
  const speicher = `vokabelweg-frei-${weg.key}`
  const freiJetzt = useMemo(() => stufen.filter((s) => s.frei).map((s) => s.key), [stufen])
  const [neu, setNeu] = useState<Stufe[]>([])
  useEffect(() => {
    try {
      const vorher = JSON.parse(localStorage.getItem(speicher) ?? 'null') as string[] | null
      if (vorher) setNeu(stufen.filter((s) => s.frei && s.grund === 'gelernt' && !vorher.includes(s.key)))
      localStorage.setItem(speicher, JSON.stringify(freiJetzt))
    } catch {
      /* ohne Speicher keine Feier */
    }
  }, [speicher, freiJetzt, stufen])
  const units = useMemo(() => {
    const m: { unit: string; stufen: { s: Stufe; i: number }[] }[] = []
    stufen.forEach((s, i) => {
      const letzte = m[m.length - 1]
      if (letzte && letzte.unit === s.unit) letzte.stufen.push({ s, i })
      else m.push({ unit: s.unit, stufen: [{ s, i }] })
    })
    return m
  }, [stufen])
  // Den aktuellen Abschnitt ins Bild rollen (nur im Pfad, nicht die ganze Seite – erst wenn aufgeklappt)
  useEffect(() => {
    if (!offen) return
    const t = setTimeout(() => {
      const k = document.querySelector<HTMLElement>('[data-vw-aktuell]')
      const pfad = k?.closest<HTMLElement>('.vw-pfad')
      if (k && pfad) pfad.scrollLeft = Math.max(0, k.getBoundingClientRect().left - pfad.getBoundingClientRect().left + pfad.scrollLeft - pfad.clientWidth / 2)
    }, 220)
    return () => clearTimeout(t)
  }, [aktuellIndex, offen])
  // Warum ein Abschnitt gesperrt ist: der davor muss erst zu 80 % eingeübt sein
  const gesperrtWeil = (i: number): string => {
    const davor = stufen[i - 1]
    return davor
      ? `Noch gesperrt – frei wird es, wenn ${davor.unit} · ${davor.section} zu ${Math.round(weg.schwelle * 100)} % eingeübt ist (Fach 2).`
      : 'Noch gesperrt.'
  }
  return (
    <div className="vw" data-vokabelweg={weg.key} data-vw-offen={offen || undefined}>
      <style>{LEITER_CSS}</style>
      <UnstyledButton onClick={klappen} aria-expanded={offen} w="100%" data-vw-klappen>
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fw={800} c="var(--vt-a-dunkel)">
              Dein Vokabelweg · {weg.band}
            </Text>
            <Text size="xs" c="dimmed">
              {gelernt} von {stufen.length} Abschnitten gelernt
              {aktuell && !offen ? ` · gerade dran: ${aktuell.unit} · ${aktuell.section} (${Math.round(aktuell.anteil * 100)} %)` : ''}
              {offen ? ` · freigeschaltet wird ab ${Math.round(weg.schwelle * 100)} % der Wörter in Fach 2` : ''}
            </Text>
          </div>
          <IconChevronDown size={20} className={`vw-pfeil ${offen ? 'offen' : ''}`} aria-hidden />
        </Group>
      </UnstyledButton>
      {neu.length > 0 && (
        <div className="vw-fest" data-vw-neu>
          <IconConfetti size={22} />
          <span>Freigeschaltet: {neu.map((s) => `${s.unit} · ${s.section}`).join(', ')}!</span>
        </div>
      )}
      <Collapse expanded={offen}>
      {oeffne && (
        <Text size="xs" c="dimmed" mt={8}>
          Tippe einen freien Abschnitt an, um genau seine Wörter zu lernen.
        </Text>
      )}
      {aktuell && (
        <div style={{ margin: '10px 0 4px' }} data-vw-fortschritt>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={700}>
              <IconMapPin size={14} style={{ verticalAlign: -2 }} /> {aktuell.unit} · {aktuell.section}
            </Text>
            <Text size="sm" c="dimmed">
              {Math.round(aktuell.anteil * 100)} % eingeübt
            </Text>
          </Group>
          <Progress.Root size={14} radius="xl">
            <Progress.Section value={Math.min(100, (aktuell.anteil / weg.schwelle) * 100)} color={weg.farbe ?? 'orange'} striped animated />
          </Progress.Root>
          <Text size="xs" c="dimmed" mt={4}>
            {naechste
              ? naechste.frei
                ? `${naechste.unit} · ${naechste.section} ist schon frei.`
                : `Noch ${fehlenBis(aktuell)} ${fehlenBis(aktuell) === 1 ? 'Wort' : 'Wörter'} bis ${naechste.unit} · ${naechste.section} frei wird.`
              : 'Der letzte Abschnitt dieses Bandes – der nächste Band kommt mit deiner Klasse.'}
          </Text>
        </div>
      )}
      <div className="vw-pfad">
        {units.map((u, ui) => (
          <div key={`${u.unit}-${ui}`} className="vw-unit">
            <div className="vw-unit-name">{u.unit}</div>
            <div className="vw-reihe">
              {u.stufen.map(({ s, i }) => {
                const klasse = s.gelernt ? 'gelernt' : s.aktuell ? 'aktuell' : s.frei ? 'frei' : 'zu'
                const ring = s.aktuell
                  ? { background: `conic-gradient(var(--vt-a) ${Math.min(1, s.anteil / weg.schwelle) * 360}deg, var(--vt-a-rand) 0deg)` }
                  : undefined
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    {i > 0 && <div className={`vw-linie ${s.frei ? 'an' : ''}`} style={{ marginTop: 21 }} />}
                    <div>
                      <Tooltip
                        label={
                          s.frei
                            ? `${s.unit} · ${s.section}: ${Math.round(s.anteil * 100)} % eingeübt${oeffne ? ' – antippen zum Lernen' : ''}`
                            : gesperrtWeil(i)
                        }
                        multiline
                        w={240}
                        withArrow
                        events={{ hover: true, focus: true, touch: true }}
                      >
                      <Knoten
                        klickbar={Boolean(oeffne && s.frei)}
                        onClick={() => oeffne?.(s)}
                        className={`vw-knoten ${klasse}`}
                        style={ring}
                        aria-label={`${s.unit} · ${s.section}${s.frei ? '' : ' (gesperrt)'}`}
                        data-vw-stufe={klasse}
                        data-vw-key={s.key}
                        {...(s.aktuell ? { 'data-vw-aktuell': '' } : {})}
                      >
                        {s.aktuell ? (
                          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--vt-flaeche)', display: 'grid', placeItems: 'center' }}>
                            {Math.round(s.anteil * 100)}%
                          </span>
                        ) : s.gelernt ? (
                          <IconCheck size={20} />
                        ) : s.frei ? (
                          kurz(s.section).slice(0, 5)
                        ) : (
                          <IconLock size={16} />
                        )}
                      </Knoten>
                      </Tooltip>
                      <div className="vw-name">{s.section}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      </Collapse>
    </div>
  )
}

/** Ein Punkt des Pfads: frei und mit Fenster ein Knopf, sonst nur ein Kreis (gesperrt: kein Klick, nur der Hinweis) */
const Knoten = forwardRef<HTMLElement, { klickbar: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>>(
  function Knoten({ klickbar, children, onClick, ...rest }, ref) {
    if (klickbar)
      return (
        <button type="button" ref={ref as React.Ref<HTMLButtonElement>} onClick={onClick} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
          {children}
        </button>
      )
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} tabIndex={0} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    )
  }
)
