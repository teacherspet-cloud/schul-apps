/**
 * Register „Meine Bücher" und „Alphabetisch" im Fachordner (09.10.2026, Wunsch der Lehrkraft; vorher ein Register
 * „Wortliste"). Regeln: shared/meineBuecher.ts und shared/wortliste.ts, Server: server/wortliste.ts.
 *
 *  - Meine Bücher: Bücherbord mit den Covern der Bände, die du bis jetzt gehabt haben solltest – frühere Bände ganz,
 *    der aktuelle mit den freigegebenen Abschnitten; daneben „Weitere Wörter" (Listen ohne Lehrwerk). Ein Buch antippen:
 *    das Cover wächst auf die Seite und schlägt auf (wie das Umblättern im Ordner), darunter Units/Abschnitte mit den
 *    Wörtern, je Wort ein Punkt für deinen Stand und Aussprache. „Zurück" blättert zum Bord. Die Suche oben sucht in
 *    allen Büchern – sofort, in beiden Sprachen und im Beispielsatz, ohne Rücksicht auf Groß/klein und Akzente.
 *  - Alphabetisch: alle Wörter aus „Meine Bücher" nach dem Wort in der Fremdsprache (ohne „to ", Artikel, Akzente),
 *    Sprungleiste A–Z (nur Buchstaben mit Wörtern), Buchstaben-Überschriften, kurze Zeilen mit Fundstelle („GL 2 · U3"),
 *    gleiche Wörter einmal mit allen Fundstellen. Gezeichnet wird nur, was im Bild ist – auch bei Tausenden Wörtern flüssig.
 */
import { ActionIcon, Badge, Button, Loader, Stack, Text } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { abcEintraege, alphabetisch, fenster, mitKoepfen, type AbcZeile, type MeinBuch } from '@shared/meineBuecher'
import { suchform, suchindex, wortlisteFiltern, type Wortliste as Liste, type WortlisteGruppe, type WortlisteWort, type WortStatus } from '@shared/wortliste'
import { holen } from '../../onlinetest/serverApi'
import { BandCover } from '../../../shared/components/BandCover'
import { kannSprechen, sprich } from '../VokabelTrainer'
import { medienErgaenzen, medium } from '../medienCache'
import { useBlaettern } from './blaettern'
import { buecherTexte, type BuecherTexte } from './buecherTexte'
import { ruhig, sichtbarerTeil } from './ordnerAnimation'
import type { FachOrdner } from './regalDaten'

const GRENZE = 300

const CSS = `
.wl-legende { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; opacity: .8; }
.wl-legende span { display: inline-flex; align-items: center; gap: 5px; }
.wl-punkt { flex: none; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--wl-f); display: inline-block; box-sizing: border-box; }
.wl-punkt[data-wort-status="neu"] { --wl-f: #868e96; background: transparent; }
.wl-punkt[data-wort-status="aufbau"] { --wl-f: #e8590c; background: linear-gradient(90deg, var(--wl-f) 50%, transparent 50%); }
.wl-punkt[data-wort-status="sicher"] { --wl-f: #2b8a3e; background: var(--wl-f); }
.wl-zeile { display: grid; grid-template-columns: 14px minmax(0, 1fr) 30px; align-items: center; gap: 2px 10px;
  padding: 5px 4px; border-bottom: 1px solid var(--og-linie, rgba(0,0,0,.08)); }
.wl-paar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 10px; align-items: baseline; min-width: 0;
  border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 0; }
button.wl-paar { cursor: pointer; border-radius: 6px; }
button.wl-paar:focus-visible { outline: 2px solid var(--og-akzent); outline-offset: 2px; }
.wl-wort { font-weight: 700; overflow-wrap: anywhere; }
.wl-bed { overflow-wrap: anywhere; }
.wl-beispiel { grid-column: 2 / -1; font-size: .9rem; padding: 2px 0 4px; display: flex; gap: 6px; align-items: flex-start; }
.wl-pos { font-weight: 400; opacity: .6; font-size: .85em; margin-left: 4px; }
.mb-bord { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 18px 14px; padding: 12px 10px 0;
  border-radius: 10px; background: linear-gradient(180deg, transparent calc(100% - 12px), color-mix(in srgb, var(--og-akzent) 55%, #6b4f33) calc(100% - 12px)); }
.mb-buch { display: flex; flex-direction: column; align-items: center; gap: 6px; border: 0; background: transparent; color: inherit; font: inherit;
  cursor: pointer; padding: 0 0 18px; text-align: center; border-radius: 8px; }
.mb-buch:focus-visible { outline: 3px solid var(--og-akzent); outline-offset: 3px; }
.mb-cover { position: relative; transition: transform .18s ease; box-shadow: 0 6px 14px rgba(0,0,0,.25); border-radius: 4px; line-height: 0; }
@media (hover: hover) { .mb-buch:hover .mb-cover { transform: translateY(-5px) rotate(-1.5deg); } }
.mb-buch-name { font-weight: 700; font-size: .9rem; line-height: 1.2; }
.mb-buch-zahl { font-size: .78rem; opacity: .7; line-height: 1.2; }
.mb-ersatz { width: 84px; height: 112px; border-radius: 4px; display: grid; place-items: center; font-weight: 800; font-size: 1.6rem; color: #fff;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--og-akzent) 85%, #000) 0 10px, var(--og-akzent) 10px 20px); }
.mb-kopf { display: flex; gap: 14px; align-items: center; margin-bottom: 8px; }
.mb-umschlag { position: absolute; pointer-events: none; transform-style: preserve-3d; transform-origin: 0 50%; z-index: 6; }
.mb-umschlag > * { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 0 6px 6px 0; overflow: hidden; }
.mb-umschlag > .mb-vorn img, .mb-umschlag > .mb-vorn > div { width: 100% !important; height: 100% !important; object-fit: cover; border-radius: 0 !important; }
.ab-leiste { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; gap: 2px; padding: 6px 0; background: var(--og-papier, var(--mantine-color-body));
  border-bottom: 2px solid var(--og-akzent); }
.ab-leiste button { min-width: 26px; height: 26px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit;
  font-weight: 700; font-size: .85rem; cursor: pointer; }
.ab-leiste button[aria-current="true"] { background: var(--og-akzent); color: var(--og-akzent-text, #fff); }
.ab-leiste button:focus-visible { outline: 2px solid var(--og-akzent); }
.ab-liste { position: relative; }
.ab-kopf { position: absolute; left: 0; right: 0; display: flex; align-items: flex-end; font-weight: 800; font-size: 1.15rem; padding: 0 4px 3px;
  border-bottom: 1px solid var(--og-akzent); }
.ab-zeile { position: absolute; left: 0; right: 0; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 28px; gap: 0 8px; align-items: center;
  padding: 0 2px 0 4px; border-bottom: 1px solid var(--og-linie, rgba(0,0,0,.08)); }
.ab-text { display: flex; gap: 10px; min-width: 0; align-items: baseline; }
.ab-text > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ab-text .wl-wort { flex: 0 1 auto; max-width: 55%; overflow-wrap: normal; }
.ab-text .wl-bed { flex: 1 1 0; opacity: .85; }
.ab-quellen { display: flex; gap: 3px; flex-wrap: nowrap; overflow: hidden; max-width: 150px; }
.ab-quelle { font-size: .68rem; font-weight: 700; padding: 1px 5px; border-radius: 5px; white-space: nowrap; background: color-mix(in srgb, var(--og-akzent) 18%, transparent); }
@media (max-width: 560px) {
  .wl-paar { grid-template-columns: minmax(0, 1fr); }
  .wl-bed { opacity: .85; }
  .mb-bord { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 14px 8px; padding: 10px 4px 0; }
  .ab-text { flex-direction: column; gap: 0; align-items: stretch; }
  .ab-text .wl-wort { max-width: 100%; }
  .ab-text .wl-bed { flex: none; }
  .ab-quellen { flex-direction: column; align-items: flex-end; gap: 2px; max-width: 92px; }
}
@media (prefers-reduced-motion: reduce) { .mb-cover { transition: none; } }
`

// ------------------------------------------------------------------ Daten (einmal je Ordner, beide Register teilen sie)

const zwischen = new Map<string, { zeit: number; laden: Promise<Liste>; fertig?: Liste }>()

function useWortDaten(o: FachOrdner): { d: Liste | null; fehler: string } {
  const ids = o.vokabeln.map((v) => v.id)
  const schluessel = `${o.fach}|${ids.join(',')}`
  const [d, setD] = useState<Liste | null>(() => zwischen.get(schluessel)?.fertig ?? null)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    let aktiv = true
    let c = zwischen.get(schluessel)
    // Kurz gemerkt (Registerwechsel), danach frisch – der Stand ändert sich beim Üben
    if (!c || Date.now() - c.zeit > 60_000) {
      const q = new URLSearchParams({ fach: o.fach })
      for (const id of ids) q.append('id', id)
      const neu: { zeit: number; laden: Promise<Liste>; fertig?: Liste } = { zeit: Date.now(), laden: holen<Liste>(`/s/api/wortliste?${q.toString()}`) }
      neu.laden.then(
        (x) => (neu.fertig = x),
        () => zwischen.delete(schluessel)
      )
      zwischen.set(schluessel, neu)
      c = neu
    }
    void c.laden.then(
      (x) => aktiv && setD(x),
      (e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e))
    )
    return () => {
      aktiv = false
    }
  }, [schluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  return { d, fehler }
}

/** Aussprache: Aufnahmen der Medienbank dazuladen; Stimmen kommen u. U. später – dann neu zeichnen */
function useAussprache(sprache: string, terme: string[]): void {
  const [, setNeu] = useState(0)
  const schluessel = terme.slice(0, 600).join('\u0001')
  useEffect(() => {
    if (!sprache || !terme.length) return
    let aktiv = true
    void medienErgaenzen(sprache, terme.slice(0, 600)).then(() => aktiv && setNeu((n) => n + 1))
    return () => {
      aktiv = false
    }
  }, [sprache, schluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = (): void => setNeu((n) => n + 1)
    window.speechSynthesis?.addEventListener?.('voiceschanged', s)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', s)
  }, [])
}

const tonDa = (sprache: string, term: string): boolean => (Boolean(sprache) && kannSprechen(sprache)) || Boolean(medium(term.trim())?.ton?.url)

// ------------------------------------------------------------------ Bausteine

/** Punkt für den eigenen Stand – Form und Farbe (leer, halb, voll), dazu der Name für Vorlesehilfen */
function Punkt({ s, t }: { s: WortStatus; t: BuecherTexte }): React.JSX.Element {
  return <span className="wl-punkt" data-wort-status={s} role="img" aria-label={t.status[s]} title={t.status[s]} />
}

function Legende({ t }: { t: BuecherTexte }): React.JSX.Element {
  return (
    <div className="wl-legende" aria-hidden>
      {(['neu', 'aufbau', 'sicher'] as const).map((x) => (
        <span key={x}>
          <span className="wl-punkt" data-wort-status={x} />
          {t.status[x]}
        </span>
      ))}
    </div>
  )
}

/** Wort (mit Wortart) und Bedeutung */
const paar = (w: Pick<WortlisteWort, 'term' | 'translation' | 'pos'>): React.JSX.Element => (
  <>
    <span className="wl-wort">
      {w.term}
      {w.pos && <span className="wl-pos">{w.pos}</span>}
    </span>
    <span className="wl-bed">{w.translation}</span>
  </>
)

function Suche({ wert, setWert, t }: { wert: string; setWert: (s: string) => void; t: BuecherTexte }): React.JSX.Element {
  return (
    <input
      type="search"
      className="og-suche"
      value={wert}
      onChange={(e) => setWert(e.currentTarget.value)}
      placeholder={t.suche}
      aria-label={t.suche}
      data-wortliste-suche
    />
  )
}

/**
 * Gruppen (Abschnitte) zum Auf- und Zuklappen, je Zeile Wort, Bedeutung, Stand, Aussprache; der Beispielsatz klappt beim
 * Antippen auf. `offen`: welche Gruppe ohne Suche offen ist. Höchstens GRENZE Zeilen auf einmal.
 */
function Gruppen({
  gruppen,
  sprache,
  sucht,
  offen: start,
  t
}: {
  gruppen: WortlisteGruppe[]
  sprache: string
  sucht: boolean
  offen: 'erste' | 'letzte'
  t: BuecherTexte
}): React.JSX.Element {
  const [offen, setOffen] = useState<Record<string, boolean>>({})
  const [beispiel, setBeispiel] = useState<string | null>(null)
  const [grenze, setGrenze] = useState(GRENZE)
  const anzahl = gruppen.reduce((n, g) => n + g.woerter.length, 0)
  useEffect(() => setGrenze(GRENZE), [gruppen])
  const sprechen = Boolean(sprache) && kannSprechen(sprache)
  let gezeigt = 0
  return (
    <>
      {gruppen.map((g, i) => {
        const auf = sucht || (offen[g.key] ?? (start === 'erste' ? i === 0 : i === gruppen.length - 1))
        const zeilen = auf ? g.woerter.slice(0, Math.max(0, grenze - gezeigt)) : []
        gezeigt += zeilen.length
        return (
          <div key={g.key} data-wortliste-gruppe={g.titel} data-offen={auf}>
            <button type="button" className="og-jahr" aria-expanded={auf} disabled={sucht} onClick={() => setOffen({ ...offen, [g.key]: !auf })}>
              <span aria-hidden>{auf ? '▾' : '▸'}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{g.titel}</span>
              <span className="og-jahr-zahl">{g.woerter.length}</span>
            </button>
            {zeilen.map((w) => {
              const k = `${g.key}|${w.id}`
              const zu = beispiel !== k
              return (
                <div key={w.id} className="wl-zeile" data-wortliste-wort={w.term}>
                  <Punkt s={w.status} t={t} />
                  {w.example ? (
                    <button type="button" className="wl-paar" aria-expanded={!zu} onClick={() => setBeispiel(zu ? k : null)} data-wortliste-aufklappen>
                      {paar(w)}
                    </button>
                  ) : (
                    <div className="wl-paar">{paar(w)}</div>
                  )}
                  <span className="wl-ton">
                    {tonDa(sprache, w.term) && (
                      <ActionIcon variant="subtle" size="md" onClick={() => sprich(w.term, sprache)} aria-label={t.anhoeren(w.term)} data-wortliste-anhoeren>
                        <IconVolume size={16} />
                      </ActionIcon>
                    )}
                  </span>
                  {!zu && w.example && (
                    <div className="wl-beispiel" data-wortliste-beispiel>
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fs="italic">
                          {w.example}
                        </Text>
                        {w.exampleTranslation && (
                          <Text size="sm" c="dimmed">
                            {w.exampleTranslation}
                          </Text>
                        )}
                      </div>
                      {sprechen && (
                        <ActionIcon variant="subtle" size="sm" onClick={() => sprich(w.example!, sprache)} aria-label={t.beispiel}>
                          <IconVolume size={14} />
                        </ActionIcon>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {anzahl > grenze && gezeigt >= grenze && (
        <Button variant="subtle" size="xs" w="fit-content" onClick={() => setGrenze((x) => x + GRENZE)} data-wortliste-mehr>
          {t.mehr}
        </Button>
      )}
    </>
  )
}

const WEITERE = '__weitere'
const woerterIn = (g: WortlisteGruppe[]): number => g.reduce((n, x) => n + x.woerter.length, 0)

// ------------------------------------------------------------------ Meine Bücher

/**
 * Cover aufschlagen (09.10.2026): Das Cover wächst vom Bord auf die Seite und schlägt nach links auf – wie das
 * Umblättern im Ordner (blaettern.tsx: Rückseite als Papier, Seiten in WebKit ausdrücklich getauscht). Darunter steht
 * schon das Buch.
 */
function coverAufschlagen(knopf: HTMLElement): void {
  if (ruhig()) return
  const cover = knopf.querySelector<HTMLElement>('[data-buch-cover]')
  const papier = knopf.closest<HTMLElement>('.og-papier')
  const ordner = papier?.parentElement
  if (!cover || !papier || !ordner) return
  const o = ordner.getBoundingClientRect()
  const c = cover.getBoundingClientRect()
  const p = sichtbarerTeil(papier.getBoundingClientRect(), window.innerHeight)
  const rel = (x: number, y: number, b: number, h: number): Keyframe => ({ left: `${x - o.left}px`, top: `${y - o.top}px`, width: `${b}px`, height: `${h}px` })
  const blatt = document.createElement('div')
  blatt.className = 'mb-umschlag'
  blatt.setAttribute('data-buch-aufschlagen', '')
  const vorn = document.createElement('div')
  vorn.className = 'mb-vorn'
  vorn.appendChild(cover.cloneNode(true))
  vorn.style.boxShadow = '0 10px 30px rgba(0,0,0,.35)'
  const rueck = document.createElement('div')
  rueck.className = 'og-rueckseite'
  blatt.append(vorn, rueck)
  Object.assign(blatt.style, rel(c.left, c.top, c.width, c.height))
  ordner.appendChild(blatt)
  const DAUER = 950
  const a = blatt.animate(
    [
      { ...rel(c.left, c.top, c.width, c.height), transform: 'perspective(1800px) rotateY(0deg)' },
      { ...rel(p.x, p.y, p.b, p.h), transform: 'perspective(1800px) rotateY(0deg)', offset: 0.38 },
      { ...rel(p.x, p.y, p.b, p.h), transform: 'perspective(1800px) rotateY(-90deg)', offset: 0.7 },
      { ...rel(p.x, p.y, p.b, p.h), transform: 'perspective(1800px) rotateY(-180deg)', opacity: 0 }
    ],
    { duration: DAUER, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' }
  )
  const wechsel = (sichtbarVorn: boolean): Keyframe[] => [
    { opacity: sichtbarVorn ? 1 : 0 },
    { opacity: sichtbarVorn ? 1 : 0, offset: 0.69 },
    { opacity: sichtbarVorn ? 0 : 1, offset: 0.7 },
    { opacity: sichtbarVorn ? 0 : 1 }
  ]
  vorn.animate(wechsel(true), { duration: DAUER, fill: 'forwards' })
  rueck.animate(wechsel(false), { duration: DAUER, fill: 'forwards' })
  const weg = (): void => blatt.remove()
  a.onfinish = weg
  a.oncancel = weg
}

function Bord({ buecher, weitere, t, oeffnen }: { buecher: MeinBuch[]; weitere: WortlisteGruppe[]; t: BuecherTexte; oeffnen: (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => void }): React.JSX.Element {
  return (
    <div className="mb-bord" aria-label={t.bord} data-buecherbord>
      {buecher.map((b) => {
        const n = woerterIn(b.gruppen)
        const sicher = b.gruppen.reduce((x, g) => x + g.woerter.filter((w) => w.status === 'sicher').length, 0)
        return (
          <button
            key={b.id}
            type="button"
            className="mb-buch"
            onClick={oeffnen(b.id)}
            aria-label={`${t.oeffnen(b.name)}: ${t.woerter(n)}${b.aktuell ? `, ${t.freigegeben}` : ''}`}
            data-buch={b.id}
            data-buch-aktuell={b.aktuell || undefined}
          >
            <span className="mb-cover" data-buch-cover>
              <BandCover band={b} land={b.stateId ?? ''} breite={84} />
            </span>
            <span className="mb-buch-name">{b.name}</span>
            <span className="mb-buch-zahl">
              {t.woerter(n)}
              {sicher > 0 ? ` · ${t.sicher(sicher)}` : ''}
            </span>
            {b.aktuell && (
              <Badge size="xs" variant="light" style={{ marginTop: -2 }}>
                {t.bisJetzt}
              </Badge>
            )}
          </button>
        )
      })}
      {weitere.length > 0 && (
        <button
          type="button"
          className="mb-buch"
          onClick={oeffnen(WEITERE)}
          aria-label={`${t.oeffnen(t.weitere)}: ${t.woerter(woerterIn(weitere))}`}
          data-buch={WEITERE}
        >
          <span className="mb-cover" data-buch-cover>
            <span className="mb-ersatz" aria-hidden>
              +
            </span>
          </span>
          <span className="mb-buch-name">{t.weitere}</span>
          <span className="mb-buch-zahl">{t.woerter(woerterIn(weitere))}</span>
        </button>
      )}
    </div>
  )
}

export function MeineBuecher({ o }: { o: FachOrdner }): React.JSX.Element {
  const { d, fehler } = useWortDaten(o)
  const t = useMemo(() => buecherTexte(o.fach), [o.fach])
  const blaettern = useBlaettern()
  const [offen, setOffen] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const verzoegert = useDeferredValue(suche)
  const buecher = d?.buecher ?? []
  const weitere = d?.gruppen ?? []
  // Für die Suche: alle Abschnitte aller Bücher (mit Buch im Titel) und die weiteren Wörter
  const alle = useMemo(
    () => [
      ...buecher.flatMap((b) => b.gruppen.map((g) => ({ ...g, key: `${b.id}|${g.key}`, titel: `${b.name} · ${g.titel}` }))),
      ...weitere.map((g) => ({ ...g, titel: buecher.length ? `${t.weitere} · ${g.titel}` : g.titel }))
    ],
    [d] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const index = useMemo(() => suchindex(alle), [alle])
  const treffer = useMemo(() => wortlisteFiltern(alle, verzoegert, index), [alle, index, verzoegert])
  const buch = buecher.find((b) => b.id === offen) ?? null
  const sucht = Boolean(verzoegert.trim())
  const sichtbar = sucht ? treffer.gruppen : buch ? buch.gruppen : offen === WEITERE || !buecher.length ? weitere : []
  useAussprache(d?.sprache ?? '', useMemo(() => sichtbar.flatMap((g) => g.woerter.map((w) => w.term)), [sichtbar]))

  if (fehler) return <Text c="dimmed">{fehler}</Text>
  if (!d) return <Loader size="sm" />
  const gesamt = woerterIn(alle)
  if (!gesamt)
    return (
      <Text c="dimmed" data-wortliste-leer>
        {t.leer}
      </Text>
    )
  const oeffnen =
    (id: string) =>
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const knopf = e.currentTarget
      if (!blaettern) return setOffen(id)
      blaettern.oeffne('buch', () => setOffen(id), () => setOffen(null), `${window.location.pathname}?r=wort&buch=${encodeURIComponent(id)}`, true)
      coverAufschlagen(knopf)
    }
  return (
    <Stack gap="xs" data-wortliste data-meine-buecher>
      <style>{CSS}</style>
      <Suche wert={suche} setWert={setSuche} t={t} />
      <Text size="sm" c="dimmed" aria-live="polite" data-wortliste-anzahl={sucht ? treffer.anzahl : gesamt}>
        {sucht ? (treffer.anzahl ? t.trefferAlle(treffer.anzahl) : t.nichts(verzoegert.trim())) : buch ? '' : t.woerter(gesamt)}
      </Text>
      {!sucht && buecher.length > 0 && !offen && <Bord buecher={buecher} weitere={weitere} t={t} oeffnen={oeffnen} />}
      {!sucht && (buch || offen === WEITERE) && (
        <div className="mb-kopf" data-buch-offen={offen}>
          {buch ? (
            <BandCover band={buch} land={buch.stateId ?? ''} breite={44} />
          ) : (
            <span className="mb-ersatz" style={{ width: 44, height: 58, fontSize: '1rem' }} aria-hidden>
              +
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <Text fw={800}>{buch ? buch.name : t.weitere}</Text>
            <Text size="sm" c="dimmed">
              {t.woerter(woerterIn(buch ? buch.gruppen : weitere))}
              {` · ${buch ? (buch.aktuell ? t.freigegeben : t.ganzerBand) : t.ohneBuch}`}
            </Text>
          </div>
        </div>
      )}
      {(sucht || buch || offen === WEITERE || !buecher.length) && (
        <>
          <Legende t={t} />
          <Gruppen key={sucht ? 'suche' : offen ?? 'alle'} gruppen={sichtbar} sprache={d.sprache} sucht={sucht} offen={buch?.aktuell ? 'letzte' : 'erste'} t={t} />
        </>
      )}
    </Stack>
  )
}

// ------------------------------------------------------------------ Alphabetisch

/** Höhen der Posten (fest – nur so lässt sich ohne Messen jedes Eintrags im Fenster zeichnen) */
const HOEHE = { kopf: 40, zeile: 36, zeileSchmal: 52 }

function useSchmal(): boolean {
  const abfrage = '(max-width: 560px)'
  const [schmal, setSchmal] = useState(() => window.matchMedia?.(abfrage).matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.(abfrage)
    if (!m) return
    const f = (): void => setSchmal(m.matches)
    m.addEventListener?.('change', f)
    return () => m.removeEventListener?.('change', f)
  }, [])
  return schmal
}

function AbcZeileAnsicht({
  z,
  sprache,
  oben,
  hoehe,
  schmal,
  t
}: {
  z: AbcZeile
  sprache: string
  oben: number
  hoehe: number
  schmal: boolean
  t: BuecherTexte
}): React.JSX.Element {
  // Telefon: Fundstellen untereinander rechts – höchstens zwei Plaketten (die zweite ggf. „+n")
  const zeigen = z.quellen.slice(0, schmal && z.quellen.length > 2 ? 1 : 2)
  return (
    <div
      className="ab-zeile"
      style={{ top: oben, height: hoehe }}
      data-abc-wort={z.term}
      data-abc-quellen={z.quellen.length}
      title={z.example ? `${z.example}${z.exampleTranslation ? ` – ${z.exampleTranslation}` : ''}` : undefined}
    >
      <Punkt s={z.status} t={t} />
      <span className="ab-text">{paar(z)}</span>
      <span className="ab-quellen" title={z.quellen.join(', ')}>
        {zeigen.map((q) => (
          <span key={q} className="ab-quelle" data-abc-quelle={q}>
            {q}
          </span>
        ))}
        {z.quellen.length > zeigen.length && <span className="ab-quelle">+{z.quellen.length - zeigen.length}</span>}
      </span>
      <span className="ab-ton">
        {tonDa(sprache, z.term) && (
          <ActionIcon variant="subtle" size="sm" onClick={() => sprich(z.term, sprache)} aria-label={t.anhoeren(z.term)}>
            <IconVolume size={15} />
          </ActionIcon>
        )}
      </span>
    </div>
  )
}

export function Alphabetisch({ o }: { o: FachOrdner }): React.JSX.Element {
  const { d, fehler } = useWortDaten(o)
  const t = useMemo(() => buecherTexte(o.fach), [o.fach])
  const [suche, setSuche] = useState('')
  const verzoegert = useDeferredValue(suche)
  const zeilen = useMemo(() => (d ? alphabetisch(abcEintraege(d.buecher ?? [], d.gruppen, t.weitere), d.sprache) : []), [d, t])
  const suchtexte = useMemo(() => zeilen.map((z) => suchform(`${z.term} \u0001 ${z.translation} \u0001 ${z.example ?? ''} \u0001 ${z.quellen.join(' ')}`)), [zeilen])
  const gefiltert = useMemo(() => {
    const teile = suchform(verzoegert).split(' ').filter(Boolean)
    return teile.length ? zeilen.filter((_, i) => teile.every((t) => suchtexte[i].includes(t))) : zeilen
  }, [zeilen, suchtexte, verzoegert])
  const posten = useMemo(() => mitKoepfen(gefiltert), [gefiltert])
  const schmal = useSchmal()
  const zh = schmal ? HOEHE.zeileSchmal : HOEHE.zeile
  const oben = useMemo(() => {
    const o2 = new Array<number>(posten.length + 1)
    let y = 0
    posten.forEach((p, i) => {
      o2[i] = y
      y += p.art === 'kopf' ? HOEHE.kopf : zh
    })
    o2[posten.length] = y
    return o2
  }, [posten, zh])

  // Fenster: nur zeichnen, was (mit Vorrat) im Bild ist; die Seite scrollt als Ganzes
  const liste = useRef<HTMLDivElement>(null)
  const leiste = useRef<HTMLDivElement>(null)
  const [sicht, setSicht] = useState({ von: 0, bis: 1200 })
  useLayoutEffect(() => {
    let uhr = 0
    const messen = (): void => {
      uhr = 0
      const el = liste.current
      if (!el) return
      const t = el.getBoundingClientRect().top
      setSicht((s) => {
        const von = Math.round(-t)
        const bis = Math.round(-t + window.innerHeight)
        return Math.abs(s.von - von) < 40 && Math.abs(s.bis - bis) < 40 ? s : { von, bis }
      })
    }
    const anstossen = (): void => {
      if (!uhr) uhr = requestAnimationFrame(messen)
    }
    messen()
    window.addEventListener('scroll', anstossen, { passive: true })
    window.addEventListener('resize', anstossen)
    // Das Blatt kommt mit einer kleinen Drehung herein (og-blatt) – danach stimmt die Lage erst
    document.addEventListener('animationend', anstossen, true)
    const spaeter = window.setTimeout(anstossen, 500)
    return () => {
      window.removeEventListener('scroll', anstossen)
      window.removeEventListener('resize', anstossen)
      document.removeEventListener('animationend', anstossen, true)
      window.clearTimeout(spaeter)
      if (uhr) cancelAnimationFrame(uhr)
    }
  }, [d])
  const { von, bis } = fenster(oben, sicht.von, sicht.bis, 600)
  const sichtbar = posten.slice(von, bis)
  // Aussprache für das, was gerade zu sehen ist (verzögert, damit Scrollen keine Anfragen auslöst)
  const [ton, setTon] = useState<string[]>([])
  const tonSchluessel = sichtbar.map((p) => (p.art === 'zeile' ? p.z.term : '')).join('\u0001')
  useEffect(() => {
    const uhr = window.setTimeout(() => setTon(sichtbar.flatMap((p) => (p.art === 'zeile' ? [p.z.term] : []))), 400)
    return () => window.clearTimeout(uhr)
  }, [tonSchluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  useAussprache(d?.sprache ?? '', ton)

  if (fehler) return <Text c="dimmed">{fehler}</Text>
  if (!d) return <Loader size="sm" />
  if (!zeilen.length)
    return (
      <Text c="dimmed" data-wortliste-leer>
        {t.leer}
      </Text>
    )
  const koepfe = posten.flatMap((p, i) => (p.art === 'kopf' ? [{ b: p.buchstabe, i }] : []))
  // Aktueller Buchstabe: der letzte Kopf oberhalb der Mitte der Leiste
  const leisteH = leiste.current?.offsetHeight ?? 40
  const jetzt = [...koepfe].reverse().find((k) => oben[k.i] <= sicht.von + leisteH + 4)?.b ?? koepfe[0]?.b
  const springe = (i: number): void => {
    const el = liste.current
    if (!el) return
    const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY + oben[i] - (leiste.current?.offsetHeight ?? 40) - 2)
    // Weite Sprünge sofort (sanftes Scrollen über Tausende Zeilen dauert Sekunden), kurze sanft
    const weit = Math.abs(y - window.scrollY) > window.innerHeight * 2
    window.scrollTo({ top: y, behavior: ruhig() || weit ? 'auto' : 'smooth' })
  }
  const sucht = Boolean(verzoegert.trim())
  return (
    <Stack gap="xs" data-wortliste data-alphabetisch>
      <style>{CSS}</style>
      <Suche wert={suche} setWert={setSuche} t={t} />
      <Text size="sm" c="dimmed" aria-live="polite" data-wortliste-anzahl={gefiltert.length}>
        {sucht ? (gefiltert.length ? t.treffer(gefiltert.length) : t.nichts(verzoegert.trim())) : t.woerter(zeilen.length)}
      </Text>
      {koepfe.length > 0 && (
        <nav className="ab-leiste" ref={leiste} aria-label={t.springen} data-abc-leiste>
          {koepfe.map((k) => (
            <button key={k.b} type="button" aria-current={k.b === jetzt} onClick={() => springe(k.i)} data-abc-sprung={k.b}>
              {k.b}
            </button>
          ))}
        </nav>
      )}
      <div ref={liste} className="ab-liste" style={{ height: oben[posten.length] }} data-abc-liste={posten.length} data-abc-gezeichnet={sichtbar.length}>
        {sichtbar.map((p, k) => {
          const i = von + k
          return p.art === 'kopf' ? (
            <div key={`k-${p.buchstabe}`} className="ab-kopf" style={{ top: oben[i], height: HOEHE.kopf }} data-abc-kopf={p.buchstabe} role="heading" aria-level={3}>
              {p.buchstabe}
            </div>
          ) : (
            <AbcZeileAnsicht key={p.z.key} z={p.z} sprache={d.sprache} oben={oben[i]} hoehe={zh} schmal={schmal} t={t} />
          )
        })}
      </div>
    </Stack>
  )
}
