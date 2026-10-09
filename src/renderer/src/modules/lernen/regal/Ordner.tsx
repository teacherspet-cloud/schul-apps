/**
 * Aufgeschlagener Fachordner (08.10.2026, abgestimmt mit der Lehrkraft): links die Ringmechanik, rechts ein Blatt,
 * am Rand die Registerlaschen in Abstufungen der Fachfarbe (mit Symbol – nicht nur Farbe).
 *  - Vokabeln / Vocabulary …: Vokabeltrainings (Konten zusätzlich die Vokabelwege des Fachs)
 *  - Grammatik / Grammar …: Grammatiktrainings
 *  - Materialien / Materials …: Arbeitsblätter, Onlinetests, Rückmeldungen (Schreibaufgaben), dazu bei Konten Mappen
 *    (Ergebnisse, Tafelbilder, Lernprodukte) und Merkzettel; Arbeitsblätter aus Unterrichtsreihen je Reihe (08.10.2026)
 * Registerwechsel blättert um; ruhige Darstellung ohne Bewegung.
 *
 * Unterseiten im Ordner (09.10.2026, Wunsch der Lehrkraft, blaettern.tsx): Grammatikform → Training → Übung/Spiel,
 * Vokabelrunde und Spiele, Arbeitsblätter öffnen sich als nächste Seite IM Ordner – die Seite schlägt nach links um,
 * „Zurück" (Knopf, Browser, Wischen) blättert zurück. Die Adresse nennt die Ebene (?r=gram&g=<ID>, ?r=mat&b=<ID>).
 */
import { kursReiterNamen } from '@shared/ohneKlasse'
import { Badge, Button, Group, Loader, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { IconAbc, IconArrowLeft, IconBook2, IconFileText, IconListSearch } from '@tabler/icons-react'
import { SegmentedControl } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import VokabelTrainer from '../VokabelTrainer'
import GrammatikTrainer from '../GrammatikTrainer'
import BlattAusfuellen from '../../onlinetest/BlattAusfuellen'
import Wortliste from './Wortliste'
import { BlaetternRahmen, useOrdnerBlaettern } from './blaettern'
import { GrammatikStand } from '../../onlinetest/SchuelerBereich'
import { MappeAnsicht, MerkKasten } from '../LernRaum'
import { VokabelwegKarten } from '../VokabelLeiter'
import { beschriftung, fachName, jahrgangName, type Register } from './beschriftung'
import { istOffen, ladeOffen, nachJahrgaengen, speichereOffen } from './grammatikJahrgaenge'
import { deckelBereit, herkunft, nimmUebergang, ordnerZu } from './ordnerAnimation'
import { ordnerFarben } from './ordnerFarben'
import { registerVon } from './Regal'
import { useRegal, type FachOrdner, type KursKurz, type Mappe, type Merkkasten } from './regalDaten'
import { Demnaechst, NeuFreigeschaltet } from './planHinweise'

const CSS = `
.og-ordner { display: grid; grid-template-columns: 46px 1fr auto; min-height: 70vh; border-radius: 10px; overflow: visible; position: relative;
  box-shadow: 0 14px 40px rgba(0,0,0,.25); animation: og-auf .45s cubic-bezier(.3,.7,.2,1); }
.og-ringe { border-radius: 10px 0 0 10px; background: linear-gradient(90deg, color-mix(in srgb, var(--og-f) 70%, #000), var(--og-f));
  display: flex; flex-direction: column; justify-content: space-evenly; align-items: flex-end; padding: 30px 0; }
.og-ring { width: 34px; height: 16px; margin-right: -18px; border-radius: 10px; border: 4px solid #c9cdd3; border-left-color: #8e949c; background: transparent; z-index: 2;
  box-shadow: 0 2px 3px rgba(0,0,0,.3); }
.og-papier { background: var(--og-papier); color: var(--og-tinte); padding: 22px 22px 28px 30px; border-radius: 0 6px 6px 0; min-width: 0;
  background-image: repeating-linear-gradient(180deg, transparent 0 31px, var(--og-linie) 31px 32px); position: relative; }
.og-papier::before { content: ''; position: absolute; left: 14px; top: 0; bottom: 0; width: 2px; background: rgba(220, 80, 80, .35); }
.og-seite { animation: og-blatt .35s ease-out; transform-origin: left center; }
.og-ordner.mit-deckel { animation: none; }
.og-zahl { writing-mode: horizontal-tb; min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px; font-size: .7rem; font-weight: 800;
  background: #e03131; color: #fff; display: inline-grid; place-items: center; }
.og-laschen { display: flex; flex-direction: column; gap: 6px; padding-top: 26px; }
.og-lasche { writing-mode: vertical-rl; border: 0; cursor: pointer; padding: 14px 7px; border-radius: 0 10px 10px 0; font-weight: 700; font-size: .9rem;
  display: flex; align-items: center; gap: 6px; box-shadow: 2px 2px 4px rgba(0,0,0,.18); transition: transform .15s ease; margin-left: -4px; }
.og-lasche[aria-selected="true"] { transform: translateX(6px); box-shadow: 3px 3px 8px rgba(0,0,0,.28); }
.og-lasche svg { transform: rotate(90deg); }
.og-karte { display: block; text-decoration: none; color: inherit; border-radius: 10px; padding: 10px 12px; background: var(--og-karte);
  box-shadow: 0 1px 0 rgba(0,0,0,.06), inset 4px 0 0 var(--og-akzent); }
.og-suche { width: 100%; font: inherit; color: inherit; background: transparent; border: 0; border-bottom: 2px solid var(--og-akzent);
  padding: 6px 4px 6px 28px; outline: none; border-radius: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: 4px center; }
.og-suche:focus-visible { border-bottom-width: 3px; }
.og-suche::placeholder { color: inherit; opacity: .55; }
.og-jahr { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; color: inherit; font: inherit;
  font-weight: 800; font-size: 1.05rem; padding: 4px 2px; cursor: pointer; text-align: left; }
.og-jahr:disabled { cursor: default; }
.og-jahr:focus-visible { outline: 2px solid var(--og-akzent); outline-offset: 2px; border-radius: 6px; }
.og-jahr-zahl { font-size: .75rem; font-weight: 700; opacity: .6; }
.og-karte:hover { box-shadow: 0 2px 8px rgba(0,0,0,.12), inset 4px 0 0 var(--og-akzent); }
@keyframes og-auf { from { opacity: 0; transform: perspective(1400px) rotateY(-8deg) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes og-blatt { from { opacity: 0; transform: perspective(1200px) rotateY(-14deg); } to { opacity: 1; transform: none; } }
@media (max-width: 560px) {
  .og-ordner { grid-template-columns: 22px 1fr; }
  .og-ringe { padding: 20px 0; } .og-ring { width: 22px; height: 12px; margin-right: -12px; border-width: 3px; }
  .og-papier { padding: 16px 12px 22px 22px; } .og-papier::before { left: 8px; }
  .og-ringe, .og-papier { grid-row: 2; }
  .og-laschen { grid-column: 1 / -1; grid-row: 1; flex-direction: row; padding: 4px 0 0 26px; gap: 4px; overflow-x: auto; scrollbar-width: none; }
  .og-lasche { writing-mode: horizontal-tb; border-radius: 10px 10px 0 0; padding: 7px 10px; margin: 0 0 -2px; font-size: .82rem; white-space: nowrap; flex: none; }
  .og-lasche[aria-selected="true"] { transform: translateY(-4px); }
  .og-lasche svg { transform: none; }
}
.og-zurueck-leiste { margin: -6px 0 10px -6px; }
@media (prefers-reduced-motion: reduce) { .og-ordner, .og-seite { animation: none; } .og-lasche { transition: none; } }
html.sa-ruhig .og-ordner, html.sa-ruhig .og-seite { animation: none; }
`

const SYMBOL: Record<Register, React.ReactNode> = {
  vok: <IconAbc size={16} />,
  wort: <IconListSearch size={16} />,
  gram: <IconBook2 size={16} />,
  mat: <IconFileText size={16} />
}

export default function Ordner({ fach }: { fach: string }): React.JSX.Element {
  const { ordner } = useRegal()
  const dunkel = useComputedColorScheme('light') === 'dark'
  const o = ordner?.find((x) => x.fach === fachName(fach))
  const vorgabe = new URLSearchParams(window.location.search).get('r') as Register | null
  const [wahl, setWahl] = useState<Register | null>(vorgabe)
  // Geöffnete Unterseite des Ordners selbst (Grammatiktraining, Arbeitsblatt); tiefere Ebenen gehören den Bausteinen
  const [seite, setSeite] = useState<Seite | null>(null)
  const papierEl = useRef<HTMLDivElement>(null)
  // Aus dem Regal geöffnet: Deckel liegt schon über der Seite und klappt auf, sobald der Ordner steht (08.10.2026)
  const [uebergang] = useState(nimmUebergang)
  const aufklappen = useRef<((ziel: HTMLElement | null) => void) | null>(null)
  const ordnerEl = useRef<HTMLDivElement>(null)
  // Nur EINMAL einen Deckel auflegen (08.10.2026, Befund am Tablet): Nach dem Aufklappen ist `aufklappen` wieder leer –
  // ohne eigene Marke legte das nächste Zeichnen einen zweiten, geschlossenen Deckel auf, der bis zu 6 s liegen blieb
  const aufgelegt = useRef(false)
  if (uebergang && !aufgelegt.current) {
    aufgelegt.current = true
    aufklappen.current = deckelBereit(uebergang)
  }
  useEffect(() => {
    if (!ordner || !aufklappen.current) return
    const los = aufklappen.current
    aufklappen.current = null
    // Ein Bild warten, damit der Ordner gezeichnet ist
    requestAnimationFrame(() => los(ordnerEl.current))
  }, [ordner])
  if (!ordner) return <Loader />
  const s = beschriftung(fach)
  if (!o)
    return (
      <Stack>
        <Button variant="subtle" component="a" href="/s/" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
          Ins Regal
        </Button>
        <Text c="dimmed">In diesem Ordner liegt (noch) nichts.</Text>
        <Demnaechst fach={fachName(fach)} />
      </Stack>
    )
  const f = ordnerFarben(o.farbe, dunkel)
  // Wortliste (09.10.2026): eigenes Register gleich nach den Vokabeln – nur im Ordner, der Rücken im Regal bleibt
  const register = mitWortliste(registerVon(o))
  const aktiv: Register = wahl && register.includes(wahl) ? wahl : register[0] ?? 'mat'
  const zeigen = (r: Register): void => {
    setWahl(r)
    // Register in der Adresse merken: „Zurück" aus einem Training landet wieder hier
    window.history.replaceState({ ...(window.history.state ?? {}), ordnerTiefe: 0 }, '', `${window.location.pathname}?r=${r}`)
  }
  const akzent = f.register[aktiv].bg
  return (
    <Stack gap="sm" data-ordner={fach}>
      <style>{CSS}</style>
      <NeuFreigeschaltet />
      <Group justify="space-between" wrap="nowrap">
        <Button
          variant="subtle"
          component="a"
          href="/s/"
          onClick={(e: React.MouseEvent) => {
            if (e.ctrlKey || e.metaKey || e.button !== 0) return
            e.preventDefault()
            ordnerZu(zurueckZiel(), f.ruecken.bg, ordnerEl.current, s.fach, o.fach)
          }}
          leftSection={<IconArrowLeft size={16} />}
          px={4}
          data-ins-regal
        >
          Ins Regal
        </Button>
        <Text fw={800} size="xl" style={{ color: dunkel ? f.register.gram.bg : f.ruecken.bg }} ta="right" lineClamp={1}>
          {s.fach}
        </Text>
      </Group>
      <div
        ref={ordnerEl}
        className={`og-ordner ${uebergang ? 'mit-deckel' : ''}`}
        style={{
          ['--og-f' as string]: f.ruecken.bg,
          ['--og-papier' as string]: dunkel ? '#26282c' : '#fdfcf7',
          ['--og-tinte' as string]: dunkel ? '#e9ecef' : '#1f2328',
          ['--og-linie' as string]: dunkel ? 'rgba(140,170,230,.10)' : 'rgba(70,110,200,.13)',
          ['--og-karte' as string]: dunkel ? '#303338' : '#ffffff',
          ['--og-akzent' as string]: akzent
        }}
      >
        <BlaetternRahmen papier={papierEl} buehne={ordnerEl}>
          {({ tiefe, zurueck, alleZu, wischen }) => (
            <>
              <div className="og-ringe" aria-hidden>
                <span className="og-ring" />
                <span className="og-ring" />
              </div>
              <div className="og-papier" ref={papierEl} data-ordner-tiefe={tiefe} {...wischen}>
                <Wiederherstellen setSeite={setSeite} register={aktiv} />
                {tiefe > 0 && (
                  <Group className="og-zurueck-leiste">
                    <Button variant="subtle" size="compact-md" leftSection={<IconArrowLeft size={16} />} onClick={zurueck} data-ordner-zurueck>
                      Zurück
                    </Button>
                  </Group>
                )}
                <div key={aktiv} className="og-seite" role="tabpanel" data-ordner-register={aktiv}>
                  {tiefe === 0 && (
                    <Text fw={800} size="lg" mb="sm" style={{ color: dunkel ? '#e9ecef' : f.register[aktiv].bg }}>
                      {s[aktiv]}
                    </Text>
                  )}
                  {/* Geplante Freischaltungen (09.10.2026): nur Titel und Datum */}
                  {tiefe === 0 && <Demnaechst fach={o.fach} register={aktiv} vorhanden={register} />}
                  {aktiv === 'vok' && <VokabelRegister o={o} oben={tiefe === 0} />}
                  {aktiv === 'wort' && <Wortliste o={o} />}
                  {aktiv === 'gram' &&
                    (seite?.art === 'gram' ? (
                      <div data-ordner-unterseite="grammatik">
                        <GrammatikTrainer key={seite.id} id={seite.id} />
                      </div>
                    ) : (
                      <Kurse o={o} grammatik setSeite={setSeite} />
                    ))}
                  {aktiv === 'mat' &&
                    (seite?.art === 'blatt' ? (
                      <div data-ordner-unterseite="blatt">
                        <BlattAusfuellen key={seite.id} id={seite.id} />
                      </div>
                    ) : (
                      <Materialien o={o} setSeite={setSeite} />
                    ))}
                </div>
              </div>
              <div className="og-laschen" role="tablist" aria-label="Register">
                {register.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={r === aktiv}
                    className="og-lasche"
                    style={{ background: f.register[r].bg, color: f.register[r].text }}
                    // Offene Unterseiten zuklappen (Verlauf zurück), dann das Register zeigen
                    onClick={() => alleZu(() => zeigen(r))}
                    data-lasche={r}
                  >
                    {SYMBOL[r]}
                    {s[r]}
                    {zuTun(o, r) > 0 && (
                      <span className="og-zahl" title="Hier ist etwas zu tun" data-lasche-offen={zuTun(o, r)}>
                        {zuTun(o, r)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </BlaetternRahmen>
      </div>
    </Stack>
  )
}

/** Register mit Wortliste: gleich hinter „Vokabeln" (die Wortliste gibt es, sobald es Vokabeln gibt) */
export const mitWortliste = (r: Register[]): Register[] => r.flatMap((x) => (x === 'vok' ? (['vok', 'wort'] as Register[]) : [x]))

/** Was in einem Register gerade zu tun ist (Hinweis an der Lasche, 08.10.2026) */
export function zuTun(o: FachOrdner, r: Register): number {
  if (r === 'wort') return 0
  if (r === 'vok') return o.vokabeln.filter((v) => (v.uebersicht.heuteOffen ?? 0) > 0 || v.uebersicht.faellig > 0).length
  if (r === 'gram') return o.grammatik.filter((g) => (g.uebersicht.unbearbeitet ?? 0) > 0 || g.uebersicht.faellig > 0).length
  return (
    o.blaetter.filter((b) => b.offen && b.genutzt < b.runden && !b.begonnen).length +
    o.reihen.reduce((n, r) => n + (r.offen ? r.materialien.filter((m) => !m.gesperrt && !m.eingereicht).length : 0), 0) +
    o.tests.filter((t) => !t.abgegeben).length +
    o.aufgaben.filter((a) => a.offen !== false && !a.fassungen.length).length
  )
}

/** Unterseite, die der Ordner selbst öffnet */
type Seite = { art: 'gram' | 'blatt'; id: string }

/** Adresse einer Unterseite: Register und Kennung („?r=gram&g=…") – so führen Neuladen und Verlauf dorthin */
const seitenAdresse = (r: Register, x: Seite): string => `${window.location.pathname}?r=${r}&${x.art === 'gram' ? 'g' : 'b'}=${encodeURIComponent(x.id)}`

/** Eine Unterseite öffnen (mit Umblättern) – außerhalb des Ordners bzw. mit Strg/Mittelklick wie ein Link */
function useSeiteOeffnen(setSeite: (s: Seite | null) => void): (r: Register, x: Seite) => (e: React.MouseEvent) => void {
  const b = useOrdnerBlaettern()
  return (r, x) => (e) => {
    if (!b || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    b.oeffne(
      x.art,
      () => setSeite(x),
      () => setSeite(null),
      seitenAdresse(r, x)
    )
  }
}

/**
 * Beim Laden: Steht eine Unterseite in der Adresse (Neuladen, Lesezeichen), liegt darunter wieder die Registerseite –
 * so führt „Zurück" zuerst dorthin. Ein Verlaufseintrag aus einer früheren Sitzung wird zur Registerseite.
 */
function Wiederherstellen({ setSeite, register }: { setSeite: (s: Seite | null) => void; register: Register }): null {
  const b = useOrdnerBlaettern()
  const erledigt = useRef(false)
  useEffect(() => {
    if (erledigt.current || !b) return
    erledigt.current = true
    const q = new URLSearchParams(window.location.search)
    const g = q.get('g')
    const bl = q.get('b')
    const x: Seite | null = g && /^[a-f0-9]{8,32}$/.test(g) ? { art: 'gram', id: g } : bl && /^[a-f0-9]{8,32}$/.test(bl) ? { art: 'blatt', id: bl } : null
    window.history.replaceState({ ...(window.history.state ?? {}), ordnerTiefe: 0 }, '', `${window.location.pathname}?r=${register}`)
    if (x && ((x.art === 'gram' && register === 'gram') || (x.art === 'blatt' && register === 'mat')))
      b.oeffne(x.art, () => setSeite(x), () => setSeite(null), seitenAdresse(register, x), true)
  }, [b, register, setSeite])
  return null
}

/** Zurück: Gäste auf die Startseite, Konten in ihren Lernraum (dort steht das Regal) */
const zurueckZiel = (): string => herkunft(!window.__schulappsServer?.angemeldet || window.__schulappsServer.quelle === 'gast' ? '/s/' : '/s/lernen')

/**
 * Register Vocabulary (08.10.2026, Wunsch der Lehrkraft): der Kurs gleich hier – Karteikasten, Tagesrunde, Spiele –
 * statt einer Karte, die erst eine eigene Seite öffnet. Mehrere Kurse im Fach: Umschalter oben (gemerkt je Fach).
 */
function VokabelRegister({ o, oben }: { o: FachOrdner; oben: boolean }): React.JSX.Element {
  const konto = Boolean(window.__schulappsServer?.angemeldet && window.__schulappsServer.quelle !== 'gast')
  const schluessel = `sa-ordner-kurs-${o.fach}`
  const [wahl, setWahl] = useState<string>(() => {
    try {
      return sessionStorage.getItem(schluessel) ?? ''
    } catch {
      return ''
    }
  })
  const kurs = o.vokabeln.find((v) => v.id === wahl) ?? o.vokabeln[0]
  const waehle = (id: string): void => {
    setWahl(id)
    try {
      sessionStorage.setItem(schluessel, id)
    } catch {
      /* egal */
    }
  }
  return (
    <Stack gap="sm">
      {/* Auf Unterseiten (Runde, Spiel) nur der Kurs – er bleibt dabei bestehen, damit nichts verloren geht */}
      {konto && oben && <VokabelwegKarten fach={o.fach} />}
      {o.vokabeln.length > 1 && oben && (
        <SegmentedControl
          value={kurs?.id ?? ''}
          onChange={waehle}
          data={kursReiterNamen(o.vokabeln).map((label, i) => ({ value: o.vokabeln[i].id, label }))}
          fullWidth
          data-ordner-kurswahl
        />
      )}
      {kurs && (
        <div data-ordner-kurs-inhalt={kurs.id}>
          <VokabelTrainer key={kurs.id} id={kurs.id} eingebettet />
        </div>
      )}
    </Stack>
  )
}

function Kurse({ o, grammatik, setSeite }: { o: FachOrdner; grammatik: boolean; setSeite: (s: Seite | null) => void }): React.JSX.Element {
  const [suche, setSuche] = useState('')
  const oeffnen = useSeiteOeffnen(setSeite)
  const alle = grammatik ? o.grammatik : o.vokabeln
  // Suche im Grammatikhefter (08.10.2026, Wunsch der Lehrkraft): filtert die Einträge nach dem Titel
  const s = suche.trim().toLocaleLowerCase('de')
  const liste = s ? alle.filter((v) => v.titel.toLocaleLowerCase('de').includes(s)) : alle
  const konto = Boolean(window.__schulappsServer?.angemeldet && window.__schulappsServer.quelle !== 'gast')
  // Grammatik nach Schuljahren (08.10.2026, abgestimmt): neuestes Jahr oben und offen, Auf/Zu je Gerät gemerkt
  const [gemerkt, setGemerkt] = useState<Record<string, boolean>>(() => ladeOffen(o.fach))
  const gruppen = grammatik ? nachJahrgaengen(liste) : []
  const mitJahren = gruppen.some((g) => g.jahrgang !== null)
  const karte = (v: KursKurz): React.JSX.Element => (
    <a
      key={v.id}
      className="og-karte"
      href={`${grammatik ? '/s/g/' : '/s/v/'}${v.id}`}
      onClick={grammatik ? oeffnen('gram', { art: 'gram', id: v.id }) : undefined}
      data-ordner-kurs={grammatik ? 'grammatik' : 'vokabeln'}
    >
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fw={700}>{v.titel}</Text>
          {grammatik && v.uebersicht.unbearbeitet !== undefined && <GrammatikStand u={v.uebersicht} />}
          {!grammatik && v.uebersicht.heuteOffen !== undefined && (
            <Text size="sm" fw={600} c={v.uebersicht.heuteOffen ? 'orange' : 'teal'} data-heute-offen={v.uebersicht.heuteOffen}>
              {v.uebersicht.heuteOffen
                ? `Heute noch ${v.uebersicht.heuteOffen} ${v.uebersicht.heuteOffen === 1 ? 'Wort' : 'Wörter'} üben – dann sind die Spiele frei`
                : '✓ Für heute geschafft'}
            </Text>
          )}
          {!grammatik && (
            <Text size="sm" c="dimmed">
              {`${v.uebersicht.gesamt - v.uebersicht.neu} von ${v.uebersicht.gesamt} kennengelernt · ${v.uebersicht.sicher} sicher`}
            </Text>
          )}
        </div>
        <Badge variant="filled" radius="xl" style={{ flex: 'none', background: 'var(--og-akzent)' }} autoContrast>
          Üben
        </Badge>
      </Group>
    </a>
  )
  return (
    <Stack gap="xs">
      {!grammatik && konto && <VokabelwegKarten fach={o.fach} />}
      {grammatik && alle.length > 1 && (
        <input
          type="search"
          className="og-suche"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          placeholder="Im Ordner suchen …"
          aria-label="Grammatik im Ordner durchsuchen"
          data-ordner-suche
        />
      )}
      {grammatik && s && liste.length === 0 && (
        <Text size="sm" c="dimmed">
          Nichts gefunden zu „{suche.trim()}“.
        </Text>
      )}
      {!mitJahren
        ? liste.map(karte)
        : gruppen.map((g, i) => {
            const k = String(g.jahrgang ?? 'ohne')
            const offen = istOffen(gruppen, i, gemerkt, Boolean(s))
            const umschalten = (): void => {
              const neu = { ...gemerkt, [k]: !offen }
              setGemerkt(neu)
              speichereOffen(o.fach, neu)
            }
            return (
              <div key={k} data-ordner-jahrgang={k} data-offen={offen}>
                <button type="button" className="og-jahr" aria-expanded={offen} onClick={umschalten} disabled={Boolean(s)}>
                  <span aria-hidden>{offen ? '▾' : '▸'}</span>
                  {g.jahrgang === null ? 'Weitere' : jahrgangName(o.fach, g.jahrgang)}
                  <span className="og-jahr-zahl">{g.eintraege.length}</span>
                </button>
                {offen && (
                  <Stack gap="xs" mt={6}>
                    {g.eintraege.map(karte)}
                  </Stack>
                )}
              </div>
            )
          })}
    </Stack>
  )
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Stack gap={6} mb="md">
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '.06em' }}>
        {titel}
      </Text>
      {children}
    </Stack>
  )
}

function Materialien({ o, setSeite }: { o: FachOrdner; setSeite: (s: Seite | null) => void }): React.JSX.Element {
  const [mappe, setMappe] = useState<Mappe | null>(null)
  const oeffnen = useSeiteOeffnen(setSeite)
  const [merk, setMerk] = useState<Merkkasten | null>(null)
  const offeneTests = o.tests.filter((t) => !t.abgegeben)
  const fertigeTests = o.tests.filter((t) => t.abgegeben)
  return (
    <div>
      {offeneTests.length > 0 && (
        <Abschnitt titel="Onlinetests">
          {offeneTests.map((t) => (
            <a key={t.code} className="og-karte" href={`/s/t/${t.code}`} data-ordner-test>
              <Text fw={700}>{t.titel}</Text>
              <Text size="sm" c="dimmed">
                {t.zeitMin} Minuten{t.wartend ? ' · startet gleich' : ''}
              </Text>
            </a>
          ))}
        </Abschnitt>
      )}
      {o.blaetter.length > 0 && (
        <Abschnitt titel="Arbeitsblätter">
          {o.blaetter.map((b) => (
            <a key={b.id} className="og-karte" href={`/s/b/${b.id}`} onClick={oeffnen('mat', { art: 'blatt', id: b.id })} data-ordner-blatt>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={700}>{b.titel}</Text>
                  {b.thema && (
                    <Text size="sm" c="dimmed">
                      {b.thema}
                    </Text>
                  )}
                </div>
                <Badge variant="light" style={{ flex: 'none' }}>
                  {!b.offen || b.genutzt >= b.runden ? 'Ansehen' : b.begonnen ? 'Weiter' : 'Öffnen'}
                </Badge>
              </Group>
            </a>
          ))}
        </Abschnitt>
      )}
      {/* Unterrichtsreihen (08.10.2026, Plan G.3): ihre Arbeitsblätter, je Reihe – mit Weg zu „Meine Abgaben" */}
      {o.reihen.map((r) => (
        <Abschnitt key={r.zid} titel={`Reihe: ${r.titel}`}>
          {r.materialien.map((m) => {
            const href = m.link ? `${m.link}${m.link.includes('?') ? '&' : '?'}reihe=${r.zid}` : m.stufeWaehlen ? `/s/r/${r.zid}/${m.schritt}` : undefined
            return (
              <a
                key={m.schritt}
                className="og-karte"
                {...(href ? { href } : {})}
                style={{ opacity: m.gesperrt ? 0.6 : 1, cursor: href ? undefined : 'default' }}
                data-ordner-reihe-blatt
              >
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700}>{m.titel}</Text>
                    <Text size="sm" c="dimmed">
                      {m.gesperrt ? 'noch gesperrt' : m.eingereicht ? `eingereicht${m.loesung ? ' · Lösung im Blatt' : ''}` : 'noch offen'}
                    </Text>
                  </div>
                  {href && (
                    <Badge variant="light" style={{ flex: 'none' }}>
                      {m.eingereicht ? 'Ansehen' : 'Öffnen'}
                    </Badge>
                  )}
                </Group>
              </a>
            )
          })}
          <Group gap="xs">
            <Button component="a" href={`/s/r/${r.zid}`} size="xs" variant="subtle">
              Zur Reihe
            </Button>
            <Button component="a" href={`/s/r/${r.zid}/materialien?reiter=abgaben`} size="xs" variant="subtle" data-ordner-reihe-abgaben>
              Meine Abgaben
            </Button>
          </Group>
        </Abschnitt>
      ))}
      {o.aufgaben.length > 0 && (
        <Abschnitt titel="Rückmeldungen">
          {o.aufgaben.map((a) => (
            <a key={a.id} className="og-karte" href={`/s/a/${a.id}`} data-ordner-aufgabe>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={700}>{a.titel}</Text>
                  <Text size="sm" c="dimmed">
                    {a.fassungen.some((x) => x.bogen) ? 'Rückmeldung da' : a.fassungen.length ? 'abgegeben' : 'noch nicht abgegeben'}
                    {a.offen === false ? ' · abgeschlossen' : a.bis ? ` · bis ${new Date(a.bis).toLocaleDateString('de-DE')}` : ''}
                  </Text>
                </div>
                <Badge variant="light" style={{ flex: 'none' }}>
                  {a.offen === false ? 'Ansehen' : 'Öffnen'}
                </Badge>
              </Group>
            </a>
          ))}
        </Abschnitt>
      )}
      {fertigeTests.length > 0 && (
        <Abschnitt titel="Abgegebene Tests">
          {fertigeTests.map((t) => (
            <a key={t.code} className="og-karte" href={`/s/t/${t.code}`}>
              <Text fw={700}>{t.titel}</Text>
            </a>
          ))}
        </Abschnitt>
      )}
      {(o.mappen.length > 0 || o.merk.length > 0) && (
        <Abschnitt titel="Mappen und Merkzettel">
          <Group gap="xs">
            {o.mappen.map((m) => (
              <Button key={m.titel} variant="default" onClick={() => setMappe(m)} data-ordner-mappe={m.titel}>
                {m.titel} ({m.seiten.length})
              </Button>
            ))}
            {o.merk.map((k) => (
              <Button key={k.titel} variant="default" onClick={() => setMerk(k)} data-ordner-merk>
                {k.titel}
              </Button>
            ))}
          </Group>
        </Abschnitt>
      )}
      {mappe && <MappeAnsicht m={mappe} schliessen={() => setMappe(null)} />}
      {merk && <MerkKasten k={merk} schliessen={() => setMerk(null)} />}
    </div>
  )
}
