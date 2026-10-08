/**
 * Regal mit Fachordnern (08.10.2026, abgestimmt mit der Lehrkraft) – ersetzt „Meine Materialien" (Gäste) und die Türen
 * des Lernraums (Konten); die bisherige Liste bleibt als Wahl in den Einstellungen („Regal | Liste").
 *  - Je Fach ein Ordner in der Fachfarbe der Lehrkraft, Name senkrecht (Fremdsprachen in der Fremdsprache), darunter die
 *    vorhandenen Register.
 *  - Reihenfolge A–Z; mit Maus ziehen bzw. am Touchscreen lange drücken und ziehen – am Konto gemerkt.
 *  - Klick: Ordner wird herausgenommen und aufgeschlagen (ordnerAnimation.ts).
 */
import { Badge, Button, Group, Loader, Stack, Text, Title, useComputedColorScheme } from '@mantine/core'
import { IconSortAscendingLetters } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fuerServer, useDarstellung } from '../../onlinetest/schuelerDarstellung'
import { senden } from '../../onlinetest/serverApi'
import { beschriftung } from './beschriftung'
import { mitOrdner, nimmZurueck } from './ordnerAnimation'
import { ordnerFarben, REGAL_DUNKEL, REGAL_HELL } from './ordnerFarben'
import { sortiert, useRegal, type FachOrdner } from './regalDaten'

const CSS = `
.rg-regal { border-radius: 14px; padding: 14px 12px 4px; background: var(--rg-holz-hinten); box-shadow: inset 0 0 0 6px var(--rg-holz), inset 0 10px 30px rgba(0,0,0,.18); }
.rg-boden { display: flex; align-items: flex-end; gap: 6px; min-height: 220px; padding: 0 10px; }
.rg-brett { height: 14px; margin: 0 -12px 14px; border-radius: 3px; background: linear-gradient(180deg, var(--rg-holz), color-mix(in srgb, var(--rg-holz) 70%, #000));
  box-shadow: 0 6px 10px rgba(0,0,0,.25); }
.rg-ordner { position: relative; width: 62px; height: 210px; border: 0; padding: 0; cursor: pointer; border-radius: 5px 5px 2px 2px; flex: none;
  background: linear-gradient(90deg, color-mix(in srgb, var(--rg-f) 78%, #000) 0, var(--rg-f) 18%, var(--rg-f) 82%, color-mix(in srgb, var(--rg-f) 70%, #000) 100%);
  color: var(--rg-t); box-shadow: 2px 0 0 rgba(0,0,0,.18), 0 4px 8px rgba(0,0,0,.2); transition: transform .18s ease, box-shadow .18s ease;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: pan-y; }
.rg-ordner:hover, .rg-ordner:focus-visible { transform: translateY(-6px); box-shadow: 2px 0 0 rgba(0,0,0,.18), 0 10px 16px rgba(0,0,0,.28); }
.rg-ordner:focus-visible { outline: 3px solid var(--mantine-color-blue-5); outline-offset: 2px; }
.rg-ordner.gezogen { transform: translateY(-14px) scale(1.06); box-shadow: 0 18px 28px rgba(0,0,0,.35); z-index: 2; cursor: grabbing; }
.rg-ordner.ziel::before { content: ''; position: absolute; left: -5px; top: 10%; bottom: 10%; width: 3px; border-radius: 2px; background: var(--mantine-color-blue-5); }
.rg-schild { position: absolute; left: 9px; right: 9px; top: 12px; bottom: 54px; border-radius: 4px; display: flex; flex-direction: row-reverse; justify-content: center; gap: 3px;
  background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); padding: 6px 0; overflow: hidden; }
.rg-senk { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 100%; }
.rg-name { font-weight: 800; font-size: 1.02rem; letter-spacing: .02em; }
.rg-reg { font-size: .62rem; font-weight: 600; opacity: .9; }
.rg-loch { position: absolute; left: 50%; bottom: 14px; width: 26px; height: 26px; margin-left: -13px; border-radius: 50%; background: rgba(0,0,0,.38);
  box-shadow: inset 0 3px 5px rgba(0,0,0,.55), 0 0 0 3px rgba(255,255,255,.18); }
.rg-zahl { position: absolute; top: -8px; right: -6px; }
.rg-ordner.zurueck { animation: rg-zurueck .45s cubic-bezier(.3,.7,.2,1); }
@keyframes rg-zurueck { from { transform: translateY(-16px) scale(1.08); box-shadow: 0 18px 28px rgba(0,0,0,.35); } to { transform: none; } }
@media (max-width: 480px) { .rg-ordner { width: 54px; height: 190px; } .rg-boden { min-height: 200px; gap: 5px; padding: 0 4px; } .rg-name { font-size: .95rem; } }
@media (prefers-reduced-motion: reduce) { .rg-ordner { transition: none; } .rg-ordner.zurueck { animation: none; } }
`

/** Was heute im Ordner wartet – als kleine Zahl am Rücken */
const offenIn = (o: FachOrdner): number =>
  o.vokabeln.reduce((n, v) => n + (v.uebersicht.heuteOffen ? 1 : 0), 0) +
  o.grammatik.reduce((n, g) => n + (g.uebersicht.unbearbeitet ? 1 : 0), 0) +
  o.blaetter.filter((b) => b.offen && !b.begonnen).length +
  o.tests.filter((t) => !t.abgegeben).length +
  o.aufgaben.filter((a) => a.offen !== false && !a.fassungen.length).length

export const registerVon = (o: FachOrdner): ('vok' | 'gram' | 'mat')[] =>
  [
    o.vokabeln.length ? ('vok' as const) : null,
    o.grammatik.length ? ('gram' as const) : null,
    o.blaetter.length || o.tests.length || o.aufgaben.length || o.reihen.length || o.mappen.length || o.merk.length ? ('mat' as const) : null
  ].filter((x): x is 'vok' | 'gram' | 'mat' => Boolean(x))

export const ordnerLink = (fach: string): string => `/s/ordner/${encodeURIComponent(fach)}`

export default function Regal({ titel, unten }: { titel: string; unten?: React.ReactNode }): React.JSX.Element {
  const { ordner } = useRegal()
  const wahl = useDarstellung((s) => s.d)
  const setze = useDarstellung((s) => s.setze)
  const dunkel = useComputedColorScheme('light') === 'dark'
  const name = (f: string): string => beschriftung(f).fach
  const [eigene, setEigene] = useState<string[] | null>(null)
  // Aus dem Ordner zurück: dieser Rücken gleitet an seinen Platz
  const [zurueck] = useState(nimmZurueck)
  const reihe = useMemo(() => (ordner ? sortiert(ordner, eigene ?? wahl.regal, name) : null), [ordner, eigene, wahl.regal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Böden nach Breite: so viele Ordner nebeneinander, wie hineinpassen
  const kasten = useRef<HTMLDivElement>(null)
  const [jeBoden, setJeBoden] = useState(8)
  useEffect(() => {
    const el = kasten.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const breit = window.innerWidth <= 480 ? 59 : 68
      setJeBoden(Math.max(3, Math.floor((el.clientWidth - 28) / breit)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [reihe === null])

  const speichern = (liste: string[] | null): void => {
    const neu = { ...wahl, regal: liste ?? [] }
    setze(neu)
    if (window.__schulappsServer?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }

  // ---------------------------------------------------------------- Ziehen (Maus sofort, Touch nach langem Drücken)
  const zug = useRef<{ fach: string; x: number; y: number; aktiv: boolean; uhr?: number; id: number; touch: boolean } | null>(null)
  const [gezogen, setGezogen] = useState<string | null>(null)
  const nachZug = useRef(false)
  const verschiebe = (fach: string, x: number, y: number): void => {
    if (!reihe) return
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-regal-ordner]')
    const ziel = el?.dataset.regalOrdner
    if (!ziel || ziel === fach) return
    const liste = (eigene ?? reihe.map((o) => o.fach)).filter((f) => f !== fach)
    const r = el.getBoundingClientRect()
    const i = liste.indexOf(ziel) + (x > r.left + r.width / 2 ? 1 : 0)
    liste.splice(i, 0, fach)
    setEigene(liste)
  }
  useEffect(() => {
    // Während des Ziehens am Touchscreen nicht scrollen
    const halt = (e: TouchEvent): void => {
      if (zug.current?.aktiv) e.preventDefault()
    }
    document.addEventListener('touchmove', halt, { passive: false })
    return () => document.removeEventListener('touchmove', halt)
  }, [])
  const start = (fach: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const touch = e.pointerType !== 'mouse'
    const z = { fach, x: e.clientX, y: e.clientY, aktiv: false, id: e.pointerId, touch, uhr: undefined as number | undefined }
    zug.current = z
    if (touch)
      z.uhr = window.setTimeout(() => {
        if (zug.current !== z) return
        z.aktiv = true
        setGezogen(fach)
        setEigene(reihe?.map((o) => o.fach) ?? [])
        navigator.vibrate?.(15)
      }, 420)
  }
  const bewegen = (e: React.PointerEvent): void => {
    const z = zug.current
    if (!z || z.id !== e.pointerId) return
    const weit = Math.hypot(e.clientX - z.x, e.clientY - z.y)
    if (!z.aktiv) {
      if (z.touch) {
        // Vor dem langen Drücken bewegt: Das ist Scrollen, kein Ziehen
        if (weit > 10) {
          window.clearTimeout(z.uhr)
          zug.current = null
        }
        return
      }
      if (weit < 6) return
      z.aktiv = true
      setGezogen(z.fach)
      setEigene(reihe?.map((o) => o.fach) ?? [])
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    verschiebe(z.fach, e.clientX, e.clientY)
  }
  const ende = (e: React.PointerEvent): void => {
    const z = zug.current
    if (!z || z.id !== e.pointerId) return
    window.clearTimeout(z.uhr)
    zug.current = null
    if (z.aktiv) {
      nachZug.current = true
      setGezogen(null)
      if (eigene) speichern(eigene)
      setEigene(null)
    }
  }
  // Tastatur: Umschalt + Pfeil verschiebt den Ordner
  const tasten = (fach: string) => (e: React.KeyboardEvent): void => {
    if (!reihe || !e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const liste = reihe.map((o) => o.fach)
    const i = liste.indexOf(fach)
    const j = e.key === 'ArrowLeft' ? i - 1 : i + 1
    if (j < 0 || j >= liste.length) return
    liste.splice(i, 1)
    liste.splice(j, 0, fach)
    speichern(liste)
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-regal-ordner="${CSS_ESC(fach)}"]`)?.focus(), 0)
  }

  const boeden: FachOrdner[][] = []
  for (let i = 0; reihe && i < reihe.length; i += jeBoden) boeden.push(reihe.slice(i, i + jeBoden))
  const holz = dunkel ? '#4a3b2e' : '#b98b5b'
  return (
    <Stack data-regal>
      <style>{CSS}</style>
      <div>
        <Title order={3}>{titel}</Title>
        {window.__schulappsServer?.name && (
          <Text c="dimmed" size="sm">
            Angemeldet als {window.__schulappsServer.name}
          </Text>
        )}
      </div>
      {!reihe ? (
        <Loader />
      ) : !reihe.length ? (
        <Text c="dimmed">Hier erscheinen deine Fachordner, sobald etwas für dich freigegeben ist oder du es über einen Code öffnest.</Text>
      ) : (
        <>
          <div
            ref={kasten}
            className="rg-regal"
            style={{ ['--rg-holz' as string]: holz, ['--rg-holz-hinten' as string]: dunkel ? REGAL_DUNKEL : REGAL_HELL }}
            onPointerMove={bewegen}
            onPointerUp={ende}
            onPointerCancel={ende}
          >
            {boeden.map((b, n) => (
              <div key={n}>
                <div className="rg-boden">
                  {b.map((o) => {
                    const f = ordnerFarben(o.farbe, dunkel)
                    const s = beschriftung(o.fach)
                    const reg = registerVon(o)
                    const zahl = offenIn(o)
                    return (
                      <button
                        key={o.fach}
                        type="button"
                        className={`rg-ordner ${gezogen === o.fach ? 'gezogen' : ''} ${zurueck === o.fach ? 'zurueck' : ''}`}
                        style={{ ['--rg-f' as string]: f.ruecken.bg, ['--rg-t' as string]: f.ruecken.text }}
                        onPointerDown={start(o.fach)}
                        onContextMenu={(e) => e.preventDefault()}
                        onKeyDown={tasten(o.fach)}
                        onClick={(e) => {
                          if (nachZug.current) {
                            nachZug.current = false
                            return
                          }
                          mitOrdner(ordnerLink(o.fach), f.ruecken.bg, e.currentTarget, s.fach)
                        }}
                        aria-label={`Ordner ${s.fach}${s.fach !== o.fach ? ` (${o.fach})` : ''} öffnen${zahl ? `, ${zahl} offen` : ''}. Umschalt und Pfeiltaste verschiebt.`}
                        title={s.fach !== o.fach ? `${s.fach} · ${o.fach}` : s.fach}
                        data-regal-ordner={o.fach}
                      >
                        <span className="rg-schild">
                          <span className="rg-senk rg-name">{s.fach}</span>
                          {reg.length > 0 && <span className="rg-senk rg-reg">{reg.map((r) => s[r]).join(' · ')}</span>}
                        </span>
                        <span className="rg-loch" />
                        {zahl > 0 && (
                          <Badge className="rg-zahl" color="red" variant="filled" size="sm" circle>
                            {zahl}
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="rg-brett" />
              </div>
            ))}
          </div>
          <Group justify="space-between" gap="xs">
            <Text size="xs" c="dimmed">
              Ordner verschieben: mit der Maus ziehen, am Tablet lange drücken und ziehen.
            </Text>
            {Boolean(wahl.regal?.length) && (
              <Button size="compact-xs" variant="subtle" leftSection={<IconSortAscendingLetters size={14} />} onClick={() => speichern(null)} data-regal-az>
                A–Z wiederherstellen
              </Button>
            )}
          </Group>
        </>
      )}
      {unten}
    </Stack>
  )
}

const CSS_ESC = (s: string): string => (window.CSS?.escape ? window.CSS.escape(s) : s.replace(/"/g, '\\"'))
