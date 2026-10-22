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
 *    gleiche Wörter einmal mit allen Fundstellen. Die Liste fließt in der Seite (nur die Seite scrollt), oben klebt die
 *    Kopfleiste, „↑ Nach oben" führt zurück; gezeichnet werden nur Blöcke in der Nähe des Bildes – auch bei Tausenden
 *    Wörtern flüssig (10.10.2026).
 */
import { anfrageSchluessel, anfrageVon, bildVon, type BildTeil } from '@shared/medienBedeutung'
import { ActionIcon, Badge, Button, Group, Loader, Modal, Portal, SegmentedControl, Stack, Text } from '@mantine/core'
import { IconArrowUp, IconPhotoOff, IconVolume } from '@tabler/icons-react'
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { abcEintraege, alphabetisch, mitKoepfen, type AbcPosten, type AbcZeile, type MeinBuch } from '@shared/meineBuecher'
import { suchform, suchindex, wortlisteFiltern, type Wortliste as Liste, type WortlisteGruppe, type WortlisteWort, type WortStatus } from '@shared/wortliste'
import { holen, senden } from '../../onlinetest/serverApi'
import { BandCover } from '../../../shared/components/BandCover'
import { kannSprechen, sprich } from '../VokabelTrainer'
import { beispielFuerLernende, medienErgaenzen, medium } from '../medienCache'
import { useBlaettern } from './blaettern'
import { schuljahrText } from '@shared/schulkalender'
import { stufeVon, type MedienSicht } from '@shared/medienbank'
import { useDarstellung } from '../../onlinetest/schuelerDarstellung'
import { zahlenAus, type StandZahlen } from '@shared/sprachstand'
import { useOffenGemerkt } from '../../../shared/sitzung'
import { BandAngebote, BandMedailleBild, SPRACH_CSS, StandKreise, useSprachstand } from './Sprachstand'
import { buecherTexte, type BuecherTexte } from './buecherTexte'
import { ruhig, sichtbarerTeil } from './ordnerAnimation'
import type { FachOrdner } from './regalDaten'
import { BildNachweis } from '../../../shared/components/BildNachweis'

const GRENZE = 300

const CSS = `
.wl-legende { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; opacity: .8; }
.wl-legende span { display: inline-flex; align-items: center; gap: 5px; }
.wl-punkt { flex: none; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--wl-f); display: inline-block; box-sizing: border-box; }
.wl-punkt[data-wort-status="neu"] { --wl-f: #868e96; background: transparent; }
.wl-punkt[data-wort-status="aufbau"] { --wl-f: #e8590c; background: linear-gradient(90deg, var(--wl-f) 50%, transparent 50%); }
.wl-punkt[data-wort-status="sicher"] { --wl-f: #2b8a3e; background: var(--wl-f); }
.wl-punkt[data-wort-status="nichtDran"] { --wl-f: #adb5bd; border-style: dashed; background: transparent; opacity: .6; }
.ab-zeile[data-abc-nicht-dran] .ab-text { opacity: .5; }
.mb-medaille { position: absolute; right: -12px; bottom: -10px; line-height: 0; }
.mb-unit-kopf, .mb-abschnitt-kopf { flex-wrap: wrap; row-gap: 2px; }
.mb-unit-kopf .sk-kreise, .mb-abschnitt-kopf .sk-kreise { font-weight: 600; font-size: .75rem; opacity: .85; }
.mb-unit { border-bottom: 1px solid var(--og-linie, rgba(0,0,0,.08)); }
.mb-unit-inhalt { padding-left: 16px; }
.mb-abschnitt-kopf { font-size: .95rem; font-weight: 700; }
.ab-umschalter { align-self: flex-start; }
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
.ab-kopfleiste { position: sticky; top: 0; z-index: 3; display: flex; flex-direction: column; gap: 2px; padding-top: 4px;
  background: var(--og-papier, var(--mantine-color-body)); border-bottom: 2px solid var(--og-akzent); }
.ab-leiste { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 0 6px; background: var(--og-papier, var(--mantine-color-body)); }
.ab-leiste button { min-width: 26px; height: 26px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit;
  font-weight: 700; font-size: .85rem; cursor: pointer; }
.ab-leiste button[aria-current="true"] { background: var(--og-akzent); color: var(--og-akzent-text, #fff); }
.ab-leiste button:focus-visible { outline: 2px solid var(--og-akzent); }
.ab-kopf { display: flex; align-items: flex-end; box-sizing: border-box; height: 40px; font-weight: 800; font-size: 1.15rem; padding: 0 4px 3px;
  border-bottom: 1px solid var(--og-akzent); }
.ab-zeile { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 28px; gap: 0 8px; align-items: center; box-sizing: border-box; min-height: 36px;
  padding: 2px 2px 2px 4px; border-bottom: 1px solid var(--og-linie, rgba(0,0,0,.08)); }
.ab-nach-oben { position: fixed; z-index: 250; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; min-height: 40px; border-radius: 999px; font: inherit; font-weight: 700;
  font-size: .9rem; cursor: pointer; color: var(--mantine-color-text); background: var(--mantine-color-body);
  border: 1px solid var(--mantine-color-default-border); box-shadow: 0 4px 14px rgba(0,0,0,.22); animation: ab-ein .18s ease-out; }
.ab-nach-oben:focus-visible { outline: 3px solid var(--mantine-primary-color-filled); outline-offset: 2px; }
body:has([data-schueler-tabs]) .ab-nach-oben { bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
html[data-touch] .ab-nach-oben { min-height: 44px; }
@keyframes ab-ein { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .ab-nach-oben { animation: none; } }
.ab-text { display: flex; gap: 10px; min-width: 0; align-items: baseline; }
/* Wort antippen (12.10.2026): kleines Fenster mit Bild, Wort, Übersetzung und Aussprache */
button.ab-text { border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 4px 2px; margin: 0; width: 100%;
  cursor: pointer; border-radius: 6px; min-height: 32px; }
@media (hover: hover) { button.ab-text:hover .wl-wort { text-decoration: underline; text-decoration-color: var(--og-akzent); text-underline-offset: 3px; } }
button.ab-text:focus-visible { outline: 2px solid var(--og-akzent); outline-offset: 1px; }
.wf-bild { display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 3; max-height: 46vh; border-radius: 12px; overflow: hidden;
  background: rgba(134,142,150,.12); }
.wf-bild img { width: 100%; height: 100%; object-fit: contain; display: block; }
.wf-ohne { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px; text-align: center; opacity: .75; }
.ab-text > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ab-text .wl-wort { flex: 0 1 auto; max-width: 55%; overflow-wrap: normal; }
.ab-text .wl-bed { flex: 1 1 0; opacity: .85; }
.ab-quellen { display: flex; gap: 3px; flex-wrap: nowrap; overflow: hidden; max-width: 150px; }
.ab-quelle { font-size: .68rem; font-weight: 700; padding: 1px 5px; border-radius: 5px; white-space: nowrap; background: color-mix(in srgb, var(--og-akzent) 18%, transparent); }
@media (max-width: 560px) {
  .wl-paar { grid-template-columns: minmax(0, 1fr); }
  .wl-bed { opacity: .85; }
  .mb-bord { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 14px 8px; padding: 10px 4px 0; }
  /* Telefon: nur die Buchstaben kleben oben (die Suche bleibt oben auf der Seite) – die Hülle gibt ihre Kinder frei */
  .ab-kopfleiste { display: contents; }
  .ab-leiste { position: sticky; top: 0; z-index: 3; border-bottom: 2px solid var(--og-akzent); }
  .ab-zeile { min-height: 52px; }
  .ab-text { flex-direction: column; gap: 0; align-items: stretch; }
  .ab-text .wl-wort { max-width: 100%; }
  .ab-text .wl-bed { flex: none; }
  .ab-quellen { flex-direction: column; align-items: flex-end; gap: 2px; max-width: 92px; }
}
@media (prefers-reduced-motion: reduce) { .mb-cover { transition: none; } }
`

// ------------------------------------------------------------------ Daten (einmal je Ordner, beide Register teilen sie)

const zwischen = new Map<string, { zeit: number; laden: Promise<Liste & { nichtDran?: MeinBuch[] }>; fertig?: Liste & { nichtDran?: MeinBuch[] } }>()

type ListeMitAllen = Liste & { nichtDran?: MeinBuch[] }

/** Wörter des Fachs; `alle` (10.10.2026): dazu alle übrigen Wörter der Bände der Reihe – erst auf Anforderung geladen */
function useWortDaten(o: FachOrdner, alle: boolean): { d: ListeMitAllen | null; fehler: string } {
  const ids = o.vokabeln.map((v) => v.id)
  const schluessel = `${o.fach}|${ids.join(',')}|${alle ? 'alle' : 'meine'}`
  const [d, setD] = useState<ListeMitAllen | null>(() => zwischen.get(schluessel)?.fertig ?? null)
  useEffect(() => setD(zwischen.get(schluessel)?.fertig ?? null), [schluessel])
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    let aktiv = true
    let c = zwischen.get(schluessel)
    // Kurz gemerkt (Registerwechsel), danach frisch – der Stand ändert sich beim Üben
    if (!c || Date.now() - c.zeit > 60_000) {
      const q = new URLSearchParams({ fach: o.fach })
      for (const id of ids) q.append('id', id)
      if (alle) q.set('alle', '1')
      const neu: { zeit: number; laden: Promise<ListeMitAllen>; fertig?: ListeMitAllen } = {
        zeit: Date.now(),
        laden: holen<ListeMitAllen>(`/s/api/wortliste?${q.toString()}`)
      }
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
function useAussprache(sprache: string, terme: string[]): number {
  const [stand, setNeu] = useState(0)
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
  // Zähler: Teile, die sich nicht von selbst neu zeichnen (Blöcke der alphabetischen Liste), erfahren so von neuen Aufnahmen
  return stand
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

/** Eine Wortzeile: Punkt, Wort und Bedeutung, Aussprache; der Beispielsatz klappt beim Antippen auf */
function WortZeile({ w, sprache, t }: { w: WortlisteWort; sprache: string; t: BuecherTexte }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const sprechen = Boolean(sprache) && kannSprechen(sprache)
  return (
    <div className="wl-zeile" data-wortliste-wort={w.term}>
      <Punkt s={w.status} t={t} />
      {w.example ? (
        <button type="button" className="wl-paar" aria-expanded={offen} onClick={() => setOffen(!offen)} data-wortliste-aufklappen>
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
      {offen && w.example && (
        <div className="wl-beispiel" data-wortliste-beispiel>
          <div style={{ minWidth: 0 }}>
            {/* Geschlechtsbezogener Satz (12.10.2026): die Fassung der gehörten Stimme */}
            <Text size="sm" fs="italic">
              {beispielFuerLernende(w).example}
            </Text>
            {beispielFuerLernende(w).exampleTranslation && (
              <Text size="sm" c="dimmed">
                {beispielFuerLernende(w).exampleTranslation}
              </Text>
            )}
          </div>
          {sprechen && (
            <ActionIcon variant="subtle" size="sm" onClick={() => sprich(beispielFuerLernende(w).example!, sprache)} aria-label={t.beispiel}>
              <IconVolume size={14} />
            </ActionIcon>
          )}
        </div>
      )}
    </div>
  )
}

const zahlenVon = (woerter: WortlisteWort[]): StandZahlen => zahlenAus(woerter.map((w) => w.status))

/**
 * Suchtreffer: Gruppen offen untereinander (die Suche zeigt alles Gefundene). Höchstens GRENZE Zeilen auf einmal.
 */
function Gruppen({ gruppen, sprache, t }: { gruppen: WortlisteGruppe[]; sprache: string; t: BuecherTexte }): React.JSX.Element {
  const [grenze, setGrenze] = useState(GRENZE)
  const anzahl = gruppen.reduce((n, g) => n + g.woerter.length, 0)
  useEffect(() => setGrenze(GRENZE), [gruppen])
  let gezeigt = 0
  return (
    <>
      {gruppen.map((g) => {
        const zeilen = g.woerter.slice(0, Math.max(0, grenze - gezeigt))
        gezeigt += zeilen.length
        return (
          <div key={g.key} data-wortliste-gruppe={g.titel} data-offen>
            <div className="og-jahr">
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{g.titel}</span>
              <span className="og-jahr-zahl">{g.woerter.length}</span>
            </div>
            {zeilen.map((w) => (
              <WortZeile key={w.id} w={w} sprache={sprache} t={t} />
            ))}
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

/**
 * Ein Buch (10.10.2026, Wunsch der Lehrkraft): Units zugeklappt, darin die Abschnitte – ebenfalls zugeklappt; je Unit und
 * Abschnitt die drei Kreise mit Zahlen (neu / im Aufbau / sicher). Auf/Zu gilt für die Sitzung (shared/sitzung.ts).
 * Abschnitte stehen aufsteigend wie im Buch.
 */
function BuchInhalt({ buchId, gruppen, sprache, t }: { buchId: string; gruppen: WortlisteGruppe[]; sprache: string; t: BuecherTexte }): React.JSX.Element {
  const units: { unit: string; gruppen: WortlisteGruppe[] }[] = []
  for (const g of gruppen) {
    const unit = g.unit ?? (g.titel.includes(' · ') ? g.titel.split(' · ')[0] : '')
    const letzte = units[units.length - 1]
    if (unit && letzte && letzte.unit === unit) letzte.gruppen.push(g)
    else units.push({ unit, gruppen: [g] })
  }
  return (
    <div data-buch-inhalt={buchId}>
      {units.map((u, i) =>
        u.unit ? (
          <UnitZeile key={`${u.unit}-${i}`} buchId={buchId} unit={u.unit} gruppen={u.gruppen} sprache={sprache} t={t} />
        ) : (
          u.gruppen.map((g) => <AbschnittZeile key={g.key} buchId={buchId} g={g} titel={g.titel} sprache={sprache} t={t} />)
        )
      )}
    </div>
  )
}

function UnitZeile({
  buchId,
  unit,
  gruppen,
  sprache,
  t
}: {
  buchId: string
  unit: string
  gruppen: WortlisteGruppe[]
  sprache: string
  t: BuecherTexte
}): React.JSX.Element {
  const [offen, setOffen] = useOffenGemerkt(`sa-buch-${buchId}-u-${unit}`, false)
  const z = useMemo(() => zahlenVon(gruppen.flatMap((g) => g.woerter)), [gruppen])
  // Eine Unit ohne eigene Abschnitte (nur „Wortschatz" o. Ä. mit gleichem Namen): die Wörter direkt
  const einzeln = gruppen.length === 1 && (gruppen[0].abschnitt ?? '') === unit
  return (
    <div className="mb-unit" data-buch-unit={unit} data-offen={offen}>
      <button type="button" className="og-jahr mb-unit-kopf" aria-expanded={offen} onClick={() => setOffen(!offen)}>
        <span aria-hidden>{offen ? '▾' : '▸'}</span>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: 1 }}>{unit}</span>
        <StandKreise z={z} t={t} />
      </button>
      {offen && (
        <div className="mb-unit-inhalt">
          {einzeln
            ? gruppen[0].woerter.map((w) => <WortZeile key={w.id} w={w} sprache={sprache} t={t} />)
            : gruppen.map((g) => <AbschnittZeile key={g.key} buchId={buchId} g={g} titel={g.abschnitt || g.titel} sprache={sprache} t={t} />)}
        </div>
      )}
    </div>
  )
}

function AbschnittZeile({
  buchId,
  g,
  titel,
  sprache,
  t
}: {
  buchId: string
  g: WortlisteGruppe
  titel: string
  sprache: string
  t: BuecherTexte
}): React.JSX.Element {
  const [offen, setOffen] = useOffenGemerkt(`sa-buch-${buchId}-a-${g.key}`, false)
  const z = useMemo(() => zahlenVon(g.woerter), [g])
  useAussprache(
    offen ? sprache : '',
    useMemo(() => (offen ? g.woerter.map((w) => w.term) : []), [offen, g])
  )
  return (
    <div className="mb-abschnitt" data-wortliste-gruppe={g.titel} data-offen={offen}>
      <button type="button" className="og-jahr mb-abschnitt-kopf" aria-expanded={offen} onClick={() => setOffen(!offen)}>
        <span aria-hidden>{offen ? '▾' : '▸'}</span>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: 1 }}>{titel}</span>
        <StandKreise z={z} t={t} />
      </button>
      {offen && g.woerter.map((w) => <WortZeile key={w.id} w={w} sprache={sprache} t={t} />)}
    </div>
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

/** Ein Cover auf dem Bord: Name, Klasse und Schuljahr, bei früheren Jahren Medaille und Anteile */
function BuchKnopf({
  b,
  t,
  oeffnen
}: {
  b: MeinBuch
  t: BuecherTexte
  oeffnen: (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const n = woerterIn(b.gruppen)
  const jahr = t.jahrgang(b.klasse ?? null, b.schuljahr ? schuljahrText(b.schuljahr) : null)
  return (
    <button
      type="button"
      className="mb-buch"
      onClick={oeffnen(b.id)}
      aria-label={`${t.oeffnen(b.name)}: ${t.woerter(n)}${b.aktuell ? `, ${t.freigegeben}` : ''}`}
      data-buch={b.id}
      data-buch-aktuell={b.aktuell || undefined}
      data-medaille-stufe={b.medaille ?? undefined}
    >
      <span className="mb-cover" data-buch-cover>
        <BandCover band={b} land={b.stateId ?? ''} breite={84} />
        {b.medaille && (
          <span className="mb-medaille">
            <BandMedailleBild m={b.medaille} groesse={32} />
          </span>
        )}
      </span>
      <span className="mb-buch-name">{b.name}</span>
      {jahr && <span className="mb-buch-zahl">{jahr}</span>}
      <span className="mb-buch-zahl">{t.woerter(n)}</span>
      {!b.aktuell && typeof b.sicherProzent === 'number' && (b.kennenProzent ?? 0) > 0 && (
        <span className="mb-buch-zahl" data-buch-prozent={`${b.sicherProzent}/${b.kennenProzent ?? 0}`}>
          {t.sicherP(b.sicherProzent)} · {t.kennenP(b.kennenProzent ?? 0)}
        </span>
      )}
      {b.aktuell && (
        <Badge size="xs" variant="light" style={{ marginTop: -2 }}>
          {t.bisJetzt}
        </Badge>
      )}
    </button>
  )
}

/** Bücherbord nach Schuljahren (10.10.2026): „Dieses Jahr" (aktueller Band, weitere Wörter) und „Frühere Jahre" */
function Bord({
  buecher,
  weitere,
  t,
  oeffnen
}: {
  buecher: MeinBuch[]
  weitere: WortlisteGruppe[]
  t: BuecherTexte
  oeffnen: (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const jetzt = buecher.filter((b) => b.aktuell)
  const frueher = buecher.filter((b) => !b.aktuell)
  return (
    <Stack gap="sm" aria-label={t.bord} data-buecherbord>
      {(jetzt.length > 0 || weitere.length > 0) && (
        <div data-bord-jahr="jetzt">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6} style={{ letterSpacing: '.06em' }}>
            {t.diesesJahr}
          </Text>
          <div className="mb-bord">
            {jetzt.map((b) => (
              <BuchKnopf key={b.id} b={b} t={t} oeffnen={oeffnen} />
            ))}
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
        </div>
      )}
      {frueher.length > 0 && (
        <div data-bord-jahr="frueher">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6} style={{ letterSpacing: '.06em' }}>
            {t.fruehereJahre}
          </Text>
          <div className="mb-bord">
            {frueher.map((b) => (
              <BuchKnopf key={b.id} b={b} t={t} oeffnen={oeffnen} />
            ))}
          </div>
        </div>
      )}
    </Stack>
  )
}

export function MeineBuecher({ o }: { o: FachOrdner }): React.JSX.Element {
  const { d, fehler } = useWortDaten(o, false)
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
  useAussprache(
    d?.sprache ?? '',
    useMemo(() => (sucht ? treffer.gruppen.flatMap((g) => g.woerter.map((w) => w.term)) : []), [sucht, treffer])
  )
  // Früherer Band aufgeschlagen (12.10.2026, vorher „Frühere Jahre" unter „Heute üben"): seine ruhigen Angebote – nur Konten
  const konto = Boolean(window.__schulappsServer?.angemeldet && window.__schulappsServer.quelle !== 'gast')
  const { sprachen, laden: standLaden } = useSprachstand(o.fach, konto && Boolean(buch && !buch.aktuell))
  const frueherBand = buch && !buch.aktuell ? (sprachen ?? []).flatMap((x) => x.frueher).find((x) => x.id === buch.id) : undefined
  // Läuft eine dieser Runden, steht nur sie auf der Seite (12.10.2026: keine Suche, kein Buchkopf, keine Wörter darüber)
  const [uebt, setUebt] = useState(false)

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
      blaettern.oeffne(
        'buch',
        () => setOffen(id),
        () => setOffen(null),
        `${window.location.pathname}?r=wort&buch=${encodeURIComponent(id)}`,
        true
      )
      coverAufschlagen(knopf)
    }
  const inhalt = buch ? buch.gruppen : offen === WEITERE || !buecher.length ? weitere : null
  return (
    <Stack gap="xs" data-wortliste data-meine-buecher>
      <style>{CSS}</style>
      <style>{SPRACH_CSS}</style>
      {!uebt && <Suche wert={suche} setWert={setSuche} t={t} />}
      {!uebt && (
        <Text size="sm" c="dimmed" aria-live="polite" data-wortliste-anzahl={sucht ? treffer.anzahl : gesamt}>
          {sucht ? (treffer.anzahl ? t.trefferAlle(treffer.anzahl) : t.nichts(verzoegert.trim())) : buch ? '' : t.woerter(gesamt)}
        </Text>
      )}
      {!sucht && buecher.length > 0 && !offen && <Bord buecher={buecher} weitere={weitere} t={t} oeffnen={oeffnen} />}
      {!uebt && !sucht && (buch || offen === WEITERE) && (
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
              {buch
                ? [t.jahrgang(buch.klasse ?? null, buch.schuljahr ? schuljahrText(buch.schuljahr) : null), t.woerter(woerterIn(buch.gruppen))]
                    .filter(Boolean)
                    .join(' · ')
                : t.woerter(woerterIn(weitere))}
              {` · ${buch ? (buch.aktuell ? t.freigegeben : t.ganzerBand) : t.ohneBuch}`}
            </Text>
            {buch && <StandKreise z={zahlenVon(buch.gruppen.flatMap((g) => g.woerter))} t={t} balken />}
          </div>
        </div>
      )}
      {!sucht && frueherBand && <BandAngebote key={frueherBand.id} b={frueherBand} nachRunde={standLaden} beimUeben={setUebt} />}
      {sucht && (
        <>
          <Legende t={t} />
          <Gruppen key="suche" gruppen={treffer.gruppen} sprache={d.sprache} t={t} />
        </>
      )}
      {!uebt && !sucht && inhalt && (
        <>
          <Legende t={t} />
          <BuchInhalt key={offen ?? 'alle'} buchId={buch?.id ?? WEITERE} gruppen={inhalt} sprache={d.sprache} t={t} />
        </>
      )}
    </Stack>
  )
}

// ------------------------------------------------------------------ Alphabetisch

/*
 * Alphabetische Liste ohne eigenes Fenster (10.10.2026, Befund der Lehrkraft): Vorher standen die Zeilen einzeln absolut in
 * einem Kasten fester Höhe, gezeichnet wurde nur der Ausschnitt im Bild. Beim Hochscrollen wirkte das wie eine Liste in der
 * Liste („erst ganz nach oben, dann erst die Seite"), beim Sprung nach „Z" blieb unten leeres Papier. Jetzt fließt die Liste
 * in der Seite (nur die Seite scrollt – Mausrad, Finger und Tastatur wie überall). Oben klebt die Kopfleiste (Suche und A–Z,
 * am Telefon nur A–Z), unten erscheint nach dem Hinunterscrollen „↑ Nach oben". Damit auch Tausende Wörter („Alle Wörter")
 * flüssig bleiben, ist die Liste in Blöcke geteilt (je Buchstabe, höchstens BLOCK Zeilen); gezeichnet wird ein Block erst,
 * wenn er in die Nähe des Bildes kommt, sonst steht ein Platzhalter seiner (gemessenen bzw. geschätzten) Höhe da.
 */

/** Zeilen je Block */
const BLOCK = 60
/** Schätzhöhen, bis der erste Block gemessen ist */
const HOEHE = { kopf: 40, zeile: 36, zeileSchmal: 52 }
const SCHMAL = '(max-width: 560px)'

function useSchmal(): boolean {
  const [schmal, setSchmal] = useState(() => window.matchMedia?.(SCHMAL).matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.(SCHMAL)
    if (!m) return
    const f = (): void => setSchmal(m.matches)
    m.addEventListener?.('change', f)
    return () => m.removeEventListener?.('change', f)
  }, [])
  return schmal
}

const ALLE_SCHLUESSEL = 'sa-abc-alle'
/** Ansichtswunsch „Alle Wörter" – dauerhaft je Gerät (kein Auf/Zu, shared/sitzung.ts) */
const alleGemerkt = (): boolean => {
  try {
    return localStorage.getItem(ALLE_SCHLUESSEL) === '1'
  } catch {
    return false
  }
}

function AbcZeileAnsicht({
  z,
  sprache,
  schmal,
  t,
  oeffnen
}: {
  z: AbcZeile
  sprache: string
  schmal: boolean
  t: BuecherTexte
  oeffnen: (z: AbcZeile) => void
}): React.JSX.Element {
  // Telefon: Fundstellen untereinander rechts – höchstens zwei Plaketten (die zweite ggf. „+n")
  const zeigen = z.quellen.slice(0, schmal && z.quellen.length > 2 ? 1 : 2)
  return (
    <div
      className="ab-zeile"
      data-abc-wort={z.term}
      data-abc-nicht-dran={z.nichtDran || undefined}
      data-abc-quellen={z.quellen.length}
      title={z.example ? `${z.example}${z.exampleTranslation ? ` – ${z.exampleTranslation}` : ''}` : undefined}
    >
      {z.nichtDran ? (
        <span className="wl-punkt" data-wort-status="nichtDran" role="img" aria-label={t.nichtDran} title={t.nichtDran} />
      ) : (
        <Punkt s={z.status} t={t} />
      )}
      <button type="button" className="ab-text" onClick={() => oeffnen(z)} aria-haspopup="dialog" data-abc-oeffnen>
        {paar(z)}
      </button>
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

/** Ein Block der Liste: Buchstabenkopf (beim ersten Block eines Buchstabens) und bis zu BLOCK Zeilen */
interface AbcBlockDaten {
  nr: number
  buchstabe: string
  /** Beginnt hier ein Buchstabe (mit Kopf)? */
  anfang: boolean
  posten: AbcPosten[]
  zeilen: number
}

function bloecke(posten: AbcPosten[]): AbcBlockDaten[] {
  const aus: AbcBlockDaten[] = []
  let b: AbcBlockDaten | undefined
  for (const p of posten) {
    if (p.art === 'kopf' || !b || b.zeilen >= BLOCK) {
      const buchstabe: string = p.art === 'kopf' ? p.buchstabe : aus[aus.length - 1]?.buchstabe ?? ''
      b = { nr: aus.length, buchstabe, anfang: p.art === 'kopf', posten: [], zeilen: 0 }
      aus.push(b)
    }
    b.posten.push(p)
    if (p.art === 'zeile') b.zeilen++
  }
  return aus
}

type Beobachten = (el: Element, f: (nah: boolean, hoehe: number) => void) => () => void

/** Gemeinsamer Beobachter aller Blöcke: je ein Bild Vorrat über und unter dem sichtbaren Teil */
function useBeobachter(): Beobachten {
  const io = useRef<IntersectionObserver | null>(null)
  const ziele = useRef(new Map<Element, (nah: boolean, hoehe: number) => void>())
  useEffect(
    () => () => {
      io.current?.disconnect()
      io.current = null
    },
    []
  )
  return useCallback<Beobachten>((el, f) => {
    if (typeof IntersectionObserver === 'undefined') {
      f(true, 0)
      return () => undefined
    }
    io.current ??= new IntersectionObserver(
      (eintraege) => {
        // offsetHeight statt boundingClientRect: Das Blatt kommt mit einer Drehung herein (og-blatt), gedreht wären die Maße verzerrt
        for (const e of eintraege) ziele.current.get(e.target)?.(e.isIntersecting, (e.target as HTMLElement).offsetHeight)
      },
      { rootMargin: '100% 0px 100% 0px' }
    )
    ziele.current.set(el, f)
    io.current.observe(el)
    return () => {
      ziele.current.delete(el)
      io.current?.unobserve(el)
    }
  }, [])
}

const AbcBlock = memo(function AbcBlock({
  b,
  schaetzung,
  anfangs,
  sprache,
  schmal,
  t,
  beobachten,
  melden,
  oeffnen
}: {
  b: AbcBlockDaten
  schaetzung: number
  anfangs: boolean
  sprache: string
  schmal: boolean
  t: BuecherTexte
  /** Nur damit sich der Block neu zeichnet, wenn Aufnahmen dazukommen */
  tonStand: number
  beobachten: Beobachten
  melden: (nr: number, an: boolean, el: HTMLElement | null) => void
  oeffnen: (z: AbcZeile) => void
}): React.JSX.Element {
  const [an, setAn] = useState(anfangs)
  const el = useRef<HTMLDivElement>(null)
  // Zuletzt gemessene Höhe – der Platzhalter ist danach genau so hoch wie der gezeichnete Block (nichts springt)
  const hoehe = useRef<number | null>(null)
  useEffect(() => {
    const knoten = el.current
    if (!knoten) return
    return beobachten(knoten, (nah, h) => {
      if (!nah && h > 0) hoehe.current = h
      setAn(nah)
    })
  }, [beobachten])
  useLayoutEffect(() => {
    if (an && el.current) hoehe.current = el.current.offsetHeight
    melden(b.nr, an, an ? el.current : null)
  }, [an, b.nr, melden])
  useEffect(() => () => melden(b.nr, false, null), [b.nr, melden])
  return (
    <div
      ref={el}
      className="ab-block"
      data-abc-block={b.buchstabe}
      data-abc-block-start={b.anfang ? b.buchstabe : undefined}
      style={an ? undefined : { height: hoehe.current ?? schaetzung }}
    >
      {an &&
        b.posten.map((p) =>
          p.art === 'kopf' ? (
            <div key={`k-${p.buchstabe}`} className="ab-kopf" data-abc-kopf={p.buchstabe} role="heading" aria-level={3}>
              {p.buchstabe}
            </div>
          ) : (
            <AbcZeileAnsicht key={p.z.key} z={p.z} sprache={sprache} schmal={schmal} t={t} oeffnen={oeffnen} />
          )
        )}
    </div>
  )
})

/** Klasse für die Bildstufe: die des aktuellen Bandes, sonst die höchste der Bände (ohne Angabe: Stufe 5–6) */
const aktuelleKlasse = (buecher: MeinBuch[] | undefined): number | null => {
  const b = buecher ?? []
  const akt = b.find((x) => x.aktuell && x.klasse)?.klasse
  if (akt) return akt
  const alle = b.map((x) => x.klasse ?? 0).filter((k) => k > 0)
  return alle.length ? Math.max(...alle) : null
}

/** Bilder je Sprache, Stufe, Wort und Bedeutung – einmal geladen (auch „kein Bild") */
const bildZwischen = new Map<string, Promise<BildTeil | null>>()

function bildLaden(sprache: string, z: Pick<AbcZeile, 'term' | 'translation' | 'pos'>, klasse: number | null): Promise<BildTeil | null> {
  const stufe = stufeVon(klasse)
  // Das Bild der Bedeutung (21.10.2026, shared/medienBedeutung.ts): Übersetzung und Wortart gehören zur Anfrage
  const a = anfrageVon(z)
  const k = `${sprache}|${stufe}|${anfrageSchluessel(a, sprache)}`
  let p = bildZwischen.get(k)
  if (!p) {
    // Wie im Vokabeltraining (medienCache.ts): der Server liefert das Bild der Stufe, sonst das der nächstliegenden
    p = senden<{ medien: Record<string, MedienSicht> }>('/s/api/medien', {
      sprache,
      lage: useDarstellung.getState().d.aussprache === 'm' ? 'm' : 'w',
      stufe,
      woerter: [a]
    }).then(
      (d) => bildVon(d.medien?.[z.term], z, sprache) ?? null,
      () => {
        bildZwischen.delete(k)
        return null
      }
    )
    bildZwischen.set(k, p)
  }
  return p
}

/**
 * Wort aus der alphabetischen Liste (12.10.2026, Wunsch der Lehrkraft): kleines Fenster auf der Seite mit dem Bild aus
 * der Medienbank (Bildstufe nach Klasse, Rückfall am Server), Wort, Übersetzung und Aussprache; ohne Bild ein
 * freundlicher Platzhalter. Schließen mit ×, Tippen daneben oder Esc (Mantine-Fenster); am Telefon fast bildschirmbreit.
 */
function WortFenster({
  z,
  sprache,
  klasse,
  t,
  schliessen
}: {
  z: AbcZeile | null
  sprache: string
  klasse: number | null
  t: BuecherTexte
  schliessen: () => void
}): React.JSX.Element {
  // Zuletzt gezeigtes Wort: bleibt beim Ausblenden stehen (sonst wird das Fenster beim Schließen leer)
  const [zuletzt, setZuletzt] = useState<AbcZeile | null>(z)
  useEffect(() => {
    if (z) setZuletzt(z)
  }, [z])
  const w = z ?? zuletzt
  const [bild, setBild] = useState<{ term: string; m: BildTeil | null } | null>(null)
  useEffect(() => {
    if (!z || !sprache) return
    let aktiv = true
    void bildLaden(sprache, z, klasse).then((m) => aktiv && setBild({ term: z.term, m }))
    return () => {
      aktiv = false
    }
  }, [z, sprache, klasse])
  const geladen = Boolean(bild && w && bild.term === w.term)
  const quelle = geladen ? bild?.m?.bild?.url ?? bild?.m?.bild?.dataUrl : undefined
  return (
    <Modal
      opened={Boolean(z)}
      onClose={schliessen}
      centered
      radius="lg"
      size="sm"
      withCloseButton
      closeButtonProps={{ 'aria-label': 'Schließen', size: 'lg' }}
      styles={{ header: { minHeight: 0, paddingBottom: 0 }, body: { paddingTop: 4 } }}
      data-abc-fenster={w?.term ?? ''}
    >
      {w && (
        <Stack gap="sm" data-abc-fenster-wort={w.term}>
          <div className="wf-bild" data-abc-fenster-bild={quelle ? 'da' : geladen ? 'ohne' : 'laedt'}>
            {quelle ? (
              <img src={quelle} alt={w.term} decoding="async" />
            ) : geladen ? (
              <div className="wf-ohne">
                <IconPhotoOff size={34} stroke={1.5} aria-hidden />
                <Text size="sm">Zu diesem Wort gibt es noch kein Bild.</Text>
              </div>
            ) : (
              <Loader size="sm" />
            )}
          </div>
          {/* Bildnachweis für Lernende (22.10.2026, Prüfung des Schulträgers) */}
          {quelle && <BildNachweis bild={bild?.m?.bild} mt={-8} />}
          <Group gap="xs" wrap="nowrap" align="center" justify="space-between">
            <div style={{ minWidth: 0 }}>
              <Text fw={800} size="xl" lh={1.2} style={{ overflowWrap: 'anywhere' }}>
                {w.term}
                {w.pos && <span className="wl-pos">{w.pos}</span>}
              </Text>
              <Text size="md" style={{ overflowWrap: 'anywhere' }}>
                {w.translation}
              </Text>
            </div>
            {tonDa(sprache, w.term) && (
              <ActionIcon
                variant="light"
                size="xl"
                radius="xl"
                onClick={() => sprich(w.term, sprache)}
                aria-label={t.anhoeren(w.term)}
                data-abc-fenster-anhoeren
              >
                <IconVolume size={22} />
              </ActionIcon>
            )}
          </Group>
          {w.example && (
            <div>
              <Text size="sm" fs="italic">
                {w.example}
              </Text>
              {w.exampleTranslation && (
                <Text size="sm" c="dimmed">
                  {w.exampleTranslation}
                </Text>
              )}
            </div>
          )}
          {quelle && bild?.m?.bild?.nachweis && (
            <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {bild.m.bild.nachweis}
            </Text>
          )}
        </Stack>
      )}
    </Modal>
  )
}

export function Alphabetisch({ o }: { o: FachOrdner }): React.JSX.Element {
  // „Meine Wörter | Alle Wörter" (10.10.2026, Wunsch der Lehrkraft): links nur Freigegebenes, rechts alle Wörter der Bände
  const [alle, setAlle] = useState(alleGemerkt)
  const umschalten = (v: string): void => {
    setAlle(v === 'alle')
    try {
      localStorage.setItem(ALLE_SCHLUESSEL, v === 'alle' ? '1' : '0')
    } catch {
      /* ohne Speicher gilt die Wahl nur jetzt */
    }
  }
  const { d, fehler } = useWortDaten(o, alle)
  const t = useMemo(() => buecherTexte(o.fach), [o.fach])
  const [suche, setSuche] = useState('')
  const verzoegert = useDeferredValue(suche)
  const zeilen = useMemo(
    () => (d ? alphabetisch(abcEintraege(d.buecher ?? [], d.gruppen, t.weitere, alle ? d.nichtDran ?? [] : []), d.sprache) : []),
    [d, t, alle]
  )
  const suchtexte = useMemo(
    () => zeilen.map((z) => suchform(`${z.term} \u0001 ${z.translation} \u0001 ${z.example ?? ''} \u0001 ${z.quellen.join(' ')}`)),
    [zeilen]
  )
  const gefiltert = useMemo(() => {
    const teile = suchform(verzoegert).split(' ').filter(Boolean)
    return teile.length ? zeilen.filter((_, i) => teile.every((t) => suchtexte[i].includes(t))) : zeilen
  }, [zeilen, suchtexte, verzoegert])
  const posten = useMemo(() => mitKoepfen(gefiltert), [gefiltert])
  const teile = useMemo(() => bloecke(posten), [posten])
  const schmal = useSchmal()
  // Angetipptes Wort (12.10.2026): kleines Fenster auf der Seite, kein Seitenwechsel
  const [wahl, setWahl] = useState<AbcZeile | null>(null)
  const oeffnen = useCallback((z: AbcZeile) => setWahl(z), [])

  // Höhen: geschätzt, bis der erste gezeichnete Block gemessen ist (dann stimmen auch die Platzhalter darunter)
  const [mass, setMass] = useState<{ kopf: number; zeile: number; schmal: boolean } | null>(null)
  const kopfH = mass?.schmal === schmal ? mass.kopf : HOEHE.kopf
  const zh = mass?.schmal === schmal ? mass.zeile : schmal ? HOEHE.zeileSchmal : HOEHE.zeile
  const schaetzungen = useMemo(() => teile.map((b) => (b.anfang ? kopfH : 0) + b.zeilen * zh), [teile, kopfH, zh])
  // Zu Beginn gezeichnet: was ungefähr in die ersten zwei Bildschirmhöhen passt (danach entscheidet der Beobachter)
  const anfangs = useMemo(() => {
    const grenze = window.innerHeight * 2
    let y = 0
    return schaetzungen.map((h) => {
      const ja = y < grenze
      y += h
      return ja
    })
  }, [schaetzungen])

  // Gezeichnete Blöcke (für Aussprache und Zähler)
  const [gezeichnet, setGezeichnet] = useState<ReadonlySet<number>>(() => new Set())
  const melden = useCallback((nr: number, an: boolean, el: HTMLElement | null) => {
    setGezeichnet((s) => {
      if (s.has(nr) === an) return s
      const n = new Set(s)
      if (an) n.add(nr)
      else n.delete(nr)
      return n
    })
    // Gezeichneter Block mit genug Zeilen: Kopf- und Zeilenhöhe messen (je Breite einmal)
    if (!an || !el) return
    const z = el.querySelectorAll<HTMLElement>('.ab-zeile')
    if (z.length < 5) return
    const k = el.querySelector<HTMLElement>('.ab-kopf')
    const kopf = k?.offsetHeight ?? 0
    const zeile = (el.offsetHeight - kopf) / z.length
    const schmalJetzt = window.matchMedia?.(SCHMAL).matches ?? false
    setMass((m) =>
      m && m.schmal === schmalJetzt && (k ? Math.abs(m.kopf - kopf) < 0.5 : true) && Math.abs(m.zeile - zeile) < 0.5
        ? m
        : { kopf: k ? kopf : m?.kopf ?? HOEHE.kopf, zeile, schmal: schmalJetzt }
    )
  }, [])
  const beobachten = useBeobachter()

  // Aussprache für das, was gerade gezeichnet ist (verzögert, damit Scrollen keine Anfragen auslöst)
  const [ton, setTon] = useState<string[]>([])
  const tonTerme = useMemo(
    () => teile.filter((b) => gezeichnet.has(b.nr)).flatMap((b) => b.posten.flatMap((p) => (p.art === 'zeile' ? [p.z.term] : []))),
    [teile, gezeichnet]
  )
  const tonSchluessel = tonTerme.join('\u0001')
  useEffect(() => {
    const uhr = window.setTimeout(() => setTon(tonTerme), 400)
    return () => window.clearTimeout(uhr)
  }, [tonSchluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  const tonStand = useAussprache(d?.sprache ?? '', ton)

  // Kopfleiste, aktueller Buchstabe, „Nach oben"
  const liste = useRef<HTMLDivElement>(null)
  const kopfleiste = useRef<HTMLDivElement>(null)
  const leiste = useRef<HTMLElement>(null)
  const suchfeld = useRef<HTMLDivElement>(null)
  /** Höhe dessen, was oben klebt (am Telefon nur die Buchstaben – die Hülle ist dort `display: contents`) */
  const klebt = (): number => Math.max(kopfleiste.current?.offsetHeight ?? 0, leiste.current?.offsetHeight ?? 0)
  const [jetzt, setJetzt] = useState('')
  const [weitUnten, setWeitUnten] = useState(false)
  // Angetippter Buchstabe: gilt, bis selbst gescrollt wird – auch wenn er am Ende der Liste nicht bis nach oben reicht
  const ziel = useRef<string | null>(null)
  useEffect(() => {
    let uhr = 0
    const messen = (): void => {
      uhr = 0
      const l = liste.current
      if (!l) return
      const kante = klebt() + 8
      let b = ''
      for (const k of l.querySelectorAll<HTMLElement>('.ab-block[data-abc-block-start]')) {
        if (k.getBoundingClientRect().top > kante) break
        b = k.dataset.abcBlockStart ?? b
      }
      const amEnde = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      if (ziel.current && amEnde) b = ziel.current
      setJetzt(b)
      setWeitUnten(l.getBoundingClientRect().top < -window.innerHeight)
    }
    const anstossen = (): void => {
      if (!uhr) uhr = requestAnimationFrame(messen)
    }
    const selbst = (): void => {
      ziel.current = null
    }
    const arten = ['wheel', 'touchstart', 'keydown'] as const
    messen()
    window.addEventListener('scroll', anstossen, { passive: true })
    window.addEventListener('resize', anstossen)
    for (const e of arten) window.addEventListener(e, selbst, { passive: true })
    return () => {
      window.removeEventListener('scroll', anstossen)
      window.removeEventListener('resize', anstossen)
      for (const e of arten) window.removeEventListener(e, selbst)
      if (uhr) cancelAnimationFrame(uhr)
    }
  }, [d, teile])

  const springe = (b: string): void => {
    const el = [...(liste.current?.querySelectorAll<HTMLElement>('.ab-block[data-abc-block-start]') ?? [])].find((x) => x.dataset.abcBlockStart === b)
    if (!el) return
    const zielY = (): number => Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - klebt()))
    const y = zielY()
    // Weite Sprünge sofort (sanftes Scrollen über Tausende Zeilen dauert Sekunden), kurze sanft. Reicht das Ende der
    // Liste nicht bis nach oben (etwa „Z"), scrollt die Seite nur so weit sie kann – kein künstlicher Leerraum darunter.
    const sofort = ruhig() || Math.abs(y - window.scrollY) > window.innerHeight * 2
    window.scrollTo({ top: y, behavior: sofort ? 'auto' : 'smooth' })
    ziel.current = b
    setJetzt(b)
    // Blöcke um das Ziel werden erst beim Ankommen gezeichnet; weicht ihre Höhe von der Schätzung ab, nachziehen
    if (sofort)
      for (const ms of [60, 250])
        window.setTimeout(() => {
          const max = document.documentElement.scrollHeight - window.innerHeight
          const y2 = Math.min(zielY(), max)
          if (ziel.current === b && Math.abs(y2 - window.scrollY) > 2) window.scrollTo({ top: y2, behavior: 'auto' })
        }, ms)
  }
  const nachOben = (e: React.MouseEvent): void => {
    ziel.current = null
    window.scrollTo({ top: 0, behavior: ruhig() || window.scrollY > window.innerHeight * 3 ? 'auto' : 'smooth' })
    // Mit der Tastatur ausgelöst: weiter im Suchfeld (mit Finger/Maus nicht – sonst springt am Tablet die Tastatur auf)
    if (e.detail === 0) suchfeld.current?.querySelector('input')?.focus({ preventScroll: true })
  }

  const umschalter = (
    <SegmentedControl
      className="ab-umschalter"
      size="xs"
      radius="xl"
      value={alle ? 'alle' : 'meine'}
      onChange={umschalten}
      data={[
        { value: 'meine', label: t.meineWoerter },
        { value: 'alle', label: t.alleWoerter }
      ]}
      data-abc-umschalter={alle ? 'alle' : 'meine'}
    />
  )
  if (fehler) return <Text c="dimmed">{fehler}</Text>
  if (!d)
    return (
      <Stack gap="xs">
        {umschalter}
        <Loader size="sm" />
      </Stack>
    )
  if (!zeilen.length)
    return (
      <Text c="dimmed" data-wortliste-leer>
        {t.leer}
      </Text>
    )
  const koepfe = teile.filter((b) => b.anfang).map((b) => b.buchstabe)
  const aktuell = koepfe.includes(jetzt) ? jetzt : koepfe[0]
  const gezeichneteZeilen = teile.reduce((n, b) => n + (gezeichnet.has(b.nr) ? b.zeilen : 0), 0)
  const sucht = Boolean(verzoegert.trim())
  // Neue Auswahl (Suche, Umschalter, Telefon/breit): Blöcke frisch – gemessene Höhen gelten nur für ihren Inhalt
  const lauf = `${alle ? 'a' : 'm'}|${schmal ? 's' : 'b'}|${verzoegert}`
  return (
    <Stack gap="xs" data-wortliste data-alphabetisch>
      <style>{CSS}</style>
      {umschalter}
      <Text size="sm" c="dimmed" aria-live="polite" data-wortliste-anzahl={gefiltert.length}>
        {sucht ? (gefiltert.length ? t.treffer(gefiltert.length) : t.nichts(verzoegert.trim())) : t.woerter(zeilen.length)}
      </Text>
      <div className="ab-kopfleiste" ref={kopfleiste} data-abc-kopfleiste>
        <div ref={suchfeld}>
          <Suche wert={suche} setWert={setSuche} t={t} />
        </div>
        {koepfe.length > 0 && (
          <nav className="ab-leiste" ref={leiste} aria-label={t.springen} data-abc-leiste>
            {koepfe.map((b) => (
              <button key={b} type="button" aria-current={b === aktuell} onClick={() => springe(b)} data-abc-sprung={b}>
                {b}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div ref={liste} className="ab-liste" data-abc-liste={posten.length} data-abc-gezeichnet={gezeichneteZeilen}>
        {teile.map((b, i) => (
          <AbcBlock
            key={`${lauf}|${b.nr}`}
            b={b}
            schaetzung={schaetzungen[i]}
            anfangs={anfangs[i]}
            sprache={d.sprache}
            schmal={schmal}
            t={t}
            tonStand={tonStand}
            beobachten={beobachten}
            melden={melden}
            oeffnen={oeffnen}
          />
        ))}
      </div>
      <WortFenster z={wahl} sprache={d.sprache} klasse={aktuelleKlasse(d.buecher)} t={t} schliessen={() => setWahl(null)} />
      {weitUnten && (
        <Portal>
          <button type="button" className="ab-nach-oben" onClick={nachOben} data-abc-nach-oben>
            <IconArrowUp size={16} aria-hidden />
            {t.nachOben}
          </button>
        </Portal>
      )}
    </Stack>
  )
}
