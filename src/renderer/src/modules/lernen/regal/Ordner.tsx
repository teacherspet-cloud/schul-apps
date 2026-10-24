/**
 * Aufgeschlagener Fachordner (08.10.2026, abgestimmt mit der Lehrkraft): links die Ringmechanik, rechts ein Blatt,
 * am Rand die Registerlaschen in Abstufungen der Fachfarbe (mit Symbol – nicht nur Farbe).
 *  - Vokabeln / Vocabulary …: Vokabeltrainings (Konten zusätzlich die Vokabelwege des Fachs)
 *  - Grammatik / Grammar …: Grammatiktrainings
 *  - Materialien / Materials …: Arbeitsblätter, Onlinetests, Rückmeldungen (Schreibaufgaben), dazu bei Konten Mappen
 *    (Ergebnisse, Tafelbilder, Lernprodukte) und Merkzettel; Arbeitsblätter aus Unterrichtsreihen je Reihe (08.10.2026)
 * Registerwechsel blättert um – seit 12.10.2026 als kurzes Umblättern in Richtung der Lasche (blaettern.tsx umblaettern);
 * ruhige Darstellung bzw. reduzierte Bewegung: nur eine kurze Überblendung.
 *
 * Unterseiten im Ordner (09.10.2026, Wunsch der Lehrkraft, blaettern.tsx): Grammatikform → Training → Übung/Spiel,
 * Vokabelrunde und Spiele, Arbeitsblätter öffnen sich als nächste Seite IM Ordner – die Seite schlägt nach links um,
 * „Zurück" (Knopf, Browser, Wischen) blättert zurück. Die Adresse nennt die Ebene (?r=gram&g=<ID>, ?r=mat&b=<ID>).
 */
import { Badge, Button, Group, Loader, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { IconAbc, IconArrowLeft, IconBook2, IconBooks, IconChevronDown, IconChevronRight, IconFileText, IconHistory, IconMicrophone, IconSortAscendingLetters } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import GrammatikTrainer from '../GrammatikTrainer'
import BlattAusfuellen from '../../onlinetest/BlattAusfuellen'
import { Alphabetisch, MeineBuecher } from './Wortliste'
import { BlaetternRahmen, useOrdnerBlaettern } from './blaettern'
import { GrammatikStand } from '../../onlinetest/SchuelerBereich'
import { testStatusText } from '@shared/onlinetestTermin'
import { MappeAnsicht, MerkKasten } from '../LernRaum'
import { KursRegister, SprachRegister } from './Sprachstand'
import { beschriftung, fachName, jahrgangName, type Register } from './beschriftung'
import { istOffen, ladeOffen, nachJahrgaengen, nachUnits, speichereOffen, teilOffen } from './grammatikJahrgaenge'
import { bandGleich } from '../kurs/kursAnsicht'
import { LEHRWERK_GRAMMATIK } from '../../../shared/lehrwerkGrammatik'
import { herkunft, ordnerUebergangLaeuft, ordnerZu } from './ordnerAnimation'
import { ordnerFarben } from './ordnerFarben'
import { registerVon } from './Regal'
import { useRegal, type FachOrdner, type KursKurz, type Mappe, type Merkkasten } from './regalDaten'
import { Demnaechst, NeuFreigeschaltet } from './planHinweise'
import { SprechOrdner } from '../../sprechen/SprechOrdner'
import { fuerDichAufteilen } from '@shared/fuerDich'
import { schuljahrText } from '@shared/schulkalender'
import { holen } from '../../onlinetest/serverApi'
import { themenGruppieren, type ThemenStand } from './materialThemen'

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
.og-seite { transform-origin: left center; }
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
.og-unit { padding-left: 10px; }
.og-unit-kopf { font-size: .98rem; }
.og-station { padding-left: 12px; }
.og-station-kopf { font-size: .9rem; font-weight: 700; }
.og-karte:hover { box-shadow: 0 2px 8px rgba(0,0,0,.12), inset 4px 0 0 var(--og-akzent); }
@keyframes og-auf { from { opacity: 0; transform: perspective(1400px) rotateY(-8deg) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes og-blatt { from { opacity: 0; transform: perspective(1200px) rotateY(-14deg); } to { opacity: 1; transform: none; } }
@keyframes og-ueberblenden { from { opacity: 0; } to { opacity: 1; } }
/* Mit dem Finger (09.10.2026): Laschen mindestens 44 Punkte */
html[data-touch] .og-lasche { min-width: 44px; min-height: 44px; }
.og-kurz { display: none; }
/*
 * Telefon (10.10.2026, Befund: die Laschen passten nicht in die Breite): oben eine Symbolleiste – je Register Symbol und
 * kleine Beschriftung (höchstens zwei Zeilen), alle gleich breit, ohne Rollen; bis 5 Register passen in 360 px.
 */
@media (max-width: 700px) {
  /* 12.10.2026 (Befund am Telefon: beim Registerwechsel wurde die Reiterleiste mal sehr hoch): Bei kurzem Inhalt teilten
     sich die zwei automatischen Zeilen die Resthöhe der Mindesthöhe – jetzt bekommt nur das Blatt den Rest */
  .og-ordner { grid-template-columns: 22px 1fr; grid-template-rows: auto 1fr; align-content: start; }
  .og-ringe { padding: 20px 0; } .og-ring { width: 22px; height: 12px; margin-right: -12px; border-width: 3px; }
  .og-papier { padding: 16px 12px 22px 22px; } .og-papier::before { left: 8px; }
  .og-ringe, .og-papier { grid-row: 2; }
  .og-laschen { grid-column: 1 / -1; grid-row: 1; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 3px; padding: 4px 0 0 0; }
  .og-lasche { writing-mode: horizontal-tb; position: relative; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; min-height: 52px;
    padding: 6px 2px 5px; margin: 0 0 -2px; border-radius: 10px 10px 0 0; font-size: 10.5px; line-height: 1.15; text-align: center; white-space: normal; }
  .og-lasche[aria-selected="true"] { transform: translateY(-3px); }
  .og-lasche svg { transform: none; flex: none; width: 18px; height: 18px; }
  .og-lang { display: none; }
  .og-kurz { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; hyphens: auto; max-width: 100%; }
  .og-lasche .og-zahl { position: absolute; top: 2px; right: 2px; min-width: 15px; height: 15px; font-size: .6rem; padding: 0 3px; }
  html[data-touch] .og-lasche { min-width: 0; min-height: 52px; }
}
.og-zurueck-leiste { margin: -6px 0 10px -6px; }
/* Registerwechsel (12.10.2026): umgeblättert wird in blaettern.tsx – bei reduzierter Bewegung bzw. ruhiger Darstellung
   statt dessen nur eine kurze Überblendung des neuen Registers */
@media (prefers-reduced-motion: reduce) { .og-ordner { animation: none; } .og-seite { animation: og-ueberblenden .18s ease-out; } .og-lasche { transition: none; } }
html.sa-ruhig .og-ordner { animation: none; }
html.sa-ruhig .og-seite { animation: og-ueberblenden .18s ease-out; }
`

const SYMBOL: Record<Register, React.ReactNode> = {
  vok: <IconAbc size={16} />,
  wort: <IconBooks size={16} />,
  abc: <IconSortAscendingLetters size={16} />,
  gram: <IconBook2 size={16} />,
  mat: <IconFileText size={16} />,
  jahre: <IconHistory size={16} />,
  sprech: <IconMicrophone size={16} />
}

export default function Ordner({ fach }: { fach: string }): React.JSX.Element {
  const { ordner, neuLaden } = useRegal()
  const dunkel = useComputedColorScheme('light') === 'dark'
  const o = ordner?.find((x) => x.fach === fachName(fach))
  const vorgabe = new URLSearchParams(window.location.search).get('r') as Register | null
  const [wahl, setWahl] = useState<Register | null>(vorgabe)
  // „Heute üben" von der Startseite bzw. aus einem Tipp (?r=vok&uebung=runde, 10.10.2026): einmal beim Öffnen gelesen
  const [startUebung] = useState(() => new URLSearchParams(window.location.search).get('uebung'))
  // Geöffnete Unterseite des Ordners selbst (Grammatiktraining, Arbeitsblatt); tiefere Ebenen gehören den Bausteinen
  const [seite, setSeite] = useState<Seite | null>(null)
  const papierEl = useRef<HTMLDivElement>(null)
  // Aus dem Regal geöffnet (09.10.2026, ohne Neuladen): Der Deckel liegt schon über der Seite, misst den gezeichneten
  // Ordner und klappt auf (ordnerAnimation.ts) – der Ordner selbst blendet sich dann nicht noch einmal ein
  const [uebergang] = useState(ordnerUebergangLaeuft)
  const ordnerEl = useRef<HTMLDivElement>(null)
  // Überthemen der Materialien (19.10.2026, Server ueberthemen.ts) – auch für „Alle Jahrgänge"
  const themen = useThemen(fach)
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
  // Meine Bücher und Alphabetisch (09.10.2026): eigene Register hinter Vokabeln und Grammatik (10.10.2026) – nur im Ordner, der Rücken im Regal bleibt
  // „Alle Jahrgänge" (19.10.2026): nur, wenn es Material aus früheren Schuljahren gibt
  const fruehere = Boolean(themen && Object.values(themen.eintraege).some((x) => x.schuljahr < themen.schuljahr))
  const register: Register[] = [...mitSprechen(mitWortliste(registerVon(o).filter((r) => r !== 'sprech')), registerVon(o).includes('sprech')), ...(fruehere ? (['jahre'] as Register[]) : [])]
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
          {({ tiefe, zurueck, alleZu, umblaettern, wischen }) => (
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
                  {aktiv === 'vok' && <VokabelRegister o={o} oben={tiefe === 0} startUebung={startUebung} />}
                  {aktiv === 'wort' && <MeineBuecher o={o} />}
                  {aktiv === 'abc' && <Alphabetisch o={o} />}
                  {aktiv === 'gram' &&
                    (seite?.art === 'gram' ? (
                      <div data-ordner-unterseite="grammatik">
                        <GrammatikTrainer key={seite.id} id={seite.id} />
                      </div>
                    ) : (
                      <Kurse o={o} grammatik setSeite={setSeite} />
                    ))}
                  {aktiv === 'sprech' && <SprechOrdner freigaben={o.sprechen ?? []} partnerarbeiten={o.partnerarbeit ?? []} neuLaden={neuLaden} />}
                  {(aktiv === 'mat' || aktiv === 'jahre') &&
                    (seite?.art === 'blatt' ? (
                      <div data-ordner-unterseite="blatt">
                        <BlattAusfuellen key={seite.id} id={seite.id} />
                      </div>
                    ) : (
                      <Materialien o={o} setSeite={setSeite} themen={themen} alle={aktiv === 'jahre'} />
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
                    // Offene Unterseiten zuklappen (Verlauf zurück), dann das Register zeigen – umgeblättert in Richtung der
                    // Lasche (12.10.2026): ein späteres Register vorwärts, ein früheres (oder zurück zur Registerseite) rückwärts
                    onClick={() => {
                      if (r === aktiv && tiefe === 0) return
                      const richtung = register.indexOf(r) > register.indexOf(aktiv) ? 'vor' : 'zurueck'
                      alleZu(() => umblaettern(richtung, () => zeigen(r)))
                    }}
                    data-lasche={r}
                    aria-label={zuTun(o, r) > 0 ? `${s[r]}, ${zuTun(o, r)} offen` : s[r]}
                  >
                    {SYMBOL[r]}
                    <span className="og-lang">{s[r]}</span>
                    {/* Telefon: kurze Beschriftung (höchstens zwei Zeilen) – „Alphabetisch" als „A–Z" */}
                    <span className="og-kurz" aria-hidden>
                      {r === 'abc' ? 'A–Z' : s[r]}
                    </span>
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

/**
 * Register „Meine Bücher" und „Alphabetisch" (es gibt sie, sobald es Vokabeln gibt). Seit 10.10.2026 steht Grammatik
 * direkt hinter „Vokabeln" – die beiden Wortlisten folgen danach (ohne Grammatik gleich hinter „Vokabeln").
 */
export const mitWortliste = (r: Register[]): Register[] => {
  if (!r.includes('vok')) return r
  const nach: Register = r.includes('gram') ? 'gram' : 'vok'
  return r.flatMap((x) => (x === nach ? ([x, 'wort', 'abc'] as Register[]) : [x]))
}

/** Sprechtraining (19.10.2026): direkt hinter Grammatik (ohne Grammatik hinter Vokabeln, sonst ans Ende) */
export const mitSprechen = (r: Register[], da: boolean): Register[] => {
  if (!da) return r
  const nach = r.includes('gram') ? 'gram' : r.includes('vok') ? 'vok' : null
  return nach ? r.flatMap((x) => (x === nach ? ([x, 'sprech'] as Register[]) : [x])) : [...r, 'sprech']
}

/** Was in einem Register gerade zu tun ist (Hinweis an der Lasche, 08.10.2026) */
export function zuTun(o: FachOrdner, r: Register): number {
  if (r === 'wort' || r === 'abc' || r === 'jahre' || r === 'sprech') return 0
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
    if (x && ((x.art === 'gram' && register === 'gram') || (x.art === 'blatt' && (register === 'mat' || register === 'jahre'))))
      b.oeffne(
        x.art,
        () => setSeite(x),
        () => setSeite(null),
        seitenAdresse(register, x),
        true
      )
  }, [b, register, setSeite])
  return null
}

/** Zurück: Gäste auf die Startseite, Konten in ihren Lernraum (dort steht das Regal) */
/** Units eines Bandes in Buchreihenfolge (Grammatik-Katalog) – für Units ohne Nummer im Namen */
const unitFolge = (buch: string): string[] =>
  Object.keys(LEHRWERK_GRAMMATIK[Object.keys(LEHRWERK_GRAMMATIK).find((k) => bandGleich(k, buch)) ?? ''] ?? {})

const zurueckZiel = (): string => herkunft(!window.__schulappsServer?.angemeldet || window.__schulappsServer.quelle === 'gast' ? '/s/' : '/s/lernen')

/**
 * Register Vocabulary (08.10.2026, Wunsch der Lehrkraft): der Kurs gleich hier – Karteikasten, Tagesrunde, Spiele.
 * Seit 10.10.2026 (Option A, Sprachstand.tsx) für Konten je Sprache: aktueller Band, frühere Jahre, EINE Runde über alle
 * Kurse; Gäste und Fächer ohne Lehrwerk mit Wörtern behalten die Kurswahl.
 */
function VokabelRegister({ o, oben, startUebung }: { o: FachOrdner; oben: boolean; startUebung: string | null }): React.JSX.Element {
  const konto = Boolean(window.__schulappsServer?.angemeldet && window.__schulappsServer.quelle !== 'gast')
  return konto ? <SprachRegister o={o} oben={oben} startUebung={startUebung} /> : <KursRegister o={o} oben={oben} startUebung={startUebung} />
}

function Kurse({ o, grammatik, setSeite }: { o: FachOrdner; grammatik: boolean; setSeite: (s: Seite | null) => void }): React.JSX.Element {
  const [suche, setSuche] = useState('')
  const oeffnen = useSeiteOeffnen(setSeite)
  const alle = grammatik ? o.grammatik : o.vokabeln
  // Suche im Grammatikhefter (08.10.2026, Wunsch der Lehrkraft): filtert die Einträge nach dem Titel
  const s = suche.trim().toLocaleLowerCase('de')
  const liste = s ? alle.filter((v) => v.titel.toLocaleLowerCase('de').includes(s)) : alle
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
  const klappen = (schluessel: string, offen: boolean): void => {
    const neu = { ...gemerkt, [schluessel]: !offen }
    setGemerkt(neu)
    speichereOffen(o.fach, neu)
  }
  // Im Jahr nach Unit › Station (17.10.2026, abgestimmt): Späteres oben, oberste Unit und darin oberste Station offen
  const inhalt = (eintraege: KursKurz[], jahr: string): React.ReactNode => {
    const { extras, units, weitere } = nachUnits(eintraege, unitFolge)
    if (!units.length) return eintraege.map(karte)
    return (
      <>
        {extras.map(karte)}
        {units.map((u, ui) => {
          const uk = `${jahr}|${u.schluessel}`
          const uOffen = teilOffen(uk, ui, gemerkt, Boolean(s))
          const nurUnit = u.stationen.length === 1 && !u.stationen[0].station
          return (
            <div key={uk} className="og-unit" data-ordner-unit={u.name} data-offen={uOffen}>
              <button type="button" className="og-jahr og-unit-kopf" aria-expanded={uOffen} onClick={() => klappen(uk, uOffen)} disabled={Boolean(s)}>
                <span aria-hidden>{uOffen ? '▾' : '▸'}</span>
                {u.name}
                <span className="og-jahr-zahl">{u.anzahl}</span>
              </button>
              {uOffen && (
                <Stack gap="xs" mt={4}>
                  {nurUnit
                    ? u.stationen[0].eintraege.map(karte)
                    : u.stationen.map((st, si) => {
                        const sk = `${uk}|${st.station}`
                        const sOffen = teilOffen(sk, si, gemerkt, Boolean(s))
                        return (
                          <div key={sk} className="og-station" data-ordner-station={st.station || 'Unit'} data-offen={sOffen}>
                            <button
                              type="button"
                              className="og-jahr og-station-kopf"
                              aria-expanded={sOffen}
                              onClick={() => klappen(sk, sOffen)}
                              disabled={Boolean(s)}
                            >
                              <span aria-hidden>{sOffen ? '▾' : '▸'}</span>
                              {st.station || 'Weitere in dieser Unit'}
                              <span className="og-jahr-zahl">{st.eintraege.length}</span>
                            </button>
                            {sOffen && (
                              <Stack gap="xs" mt={4}>
                                {st.eintraege.map(karte)}
                              </Stack>
                            )}
                          </div>
                        )
                      })}
                </Stack>
              )}
            </div>
          )
        })}
        {weitere.length > 0 && (
          <div className="og-unit" data-ordner-unit="weitere">
            <Text size="sm" fw={700} c="dimmed" mt={4}>
              Weitere
            </Text>
            <Stack gap="xs" mt={4}>
              {weitere.map(karte)}
            </Stack>
          </div>
        )}
      </>
    )
  }
  return (
    <Stack gap="xs">
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
      {grammatik && !mitJahren
        ? inhalt(liste, 'ohne')
        : !mitJahren
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
                    {inhalt(g.eintraege, k)}
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

/** Überthemen der Materialien eines Fachs (19.10.2026): Zuordnung je Material, ohne Titel (Server ueberthemen.ts) */
function useThemen(fach: string): ThemenStand | null {
  const [d, setD] = useState<ThemenStand | null>(null)
  useEffect(() => {
    let aus = false
    void holen<ThemenStand>(`/s/api/themen?fach=${encodeURIComponent(fachName(fach))}`).then(
      (r) => !aus && setD(r),
      () => !aus && setD({ eintraege: {}, schuljahr: 0 })
    )
    return () => {
      aus = true
    }
  }, [fach])
  return d
}

/**
 * Register „Materialien" (seit 19.10.2026 nach Überthemen, abgestimmt mit der Lehrkraft): oben „Für dich" und offene
 * Onlinetests, dann je Überthema des laufenden Schuljahres Blätter, Reihen, Rückmeldungen und abgegebene Tests, zuletzt
 * Mappen und Merkzettel. `alle` = Register „Alle Jahrgänge": alles aus allen Schuljahren des Kurses, Jahrgänge
 * absteigend (aufklappbar, der neueste offen), mit Suche.
 */
function Materialien({
  o,
  setSeite,
  themen,
  alle = false
}: {
  o: FachOrdner
  setSeite: (s: Seite | null) => void
  themen: ThemenStand | null
  alle?: boolean
}): React.JSX.Element {
  const [mappe, setMappe] = useState<Mappe | null>(null)
  const oeffnen = useSeiteOeffnen(setSeite)
  const [merk, setMerk] = useState<Merkkasten | null>(null)
  const [suche, setSuche] = useState('')
  const [jahrAuf, setJahrAuf] = useState<Record<number, boolean>>({})
  const offeneTests = o.tests.filter((t) => !t.abgegeben)
  const fertigeTests = o.tests.filter((t) => t.abgegeben)
  // „Für dich" (12.10.2026): eigene Förder-/Forderblätter (Einzel-Freigabe) und freigegebene Übungsbündel
  const { fuerDich, andere } = fuerDichAufteilen(o.blaetter)
  const buendel = o.fuerDich ?? []
  const register: Register = alle ? 'jahre' : 'mat'
  const modulVon = (key: string): string | undefined => themen?.eintraege[key]?.modul
  const blattKarte = (b: (typeof o.blaetter)[number]): React.JSX.Element => (
    <a key={b.id} className="og-karte" href={`/s/b/${b.id}`} onClick={oeffnen(register, { art: 'blatt', id: b.id })} data-ordner-blatt>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fw={700}>{b.titel}</Text>
          {(b.thema || modulVon(`blatt:${b.id}`)) && (
            <Text size="sm" c="dimmed">
              {[modulVon(`blatt:${b.id}`), b.thema].filter(Boolean).join(' · ')}
            </Text>
          )}
        </div>
        <Badge variant="light" style={{ flex: 'none' }}>
          {!b.offen || b.genutzt >= b.runden ? 'Ansehen' : b.begonnen ? 'Weiter' : 'Öffnen'}
        </Badge>
      </Group>
    </a>
  )
  const testKarte = (t: (typeof o.tests)[number]): React.JSX.Element => (
    <a key={t.code} className="og-karte" href={`/s/t/${t.code}`} data-ordner-test>
      <Text fw={700}>{t.titel}</Text>
      <Text size="sm" c="dimmed">
        {t.abgegeben ? 'abgegeben' : (testStatusText(t) ?? `${t.zeitMin} Minuten${t.wartend ? ' · startet gleich' : ''}`)}
      </Text>
    </a>
  )
  // Unterrichtsreihen (08.10.2026, Plan G.3): ihre Arbeitsblätter – mit Weg zu „Meine Abgaben"
  const reiheBlock = (r: (typeof o.reihen)[number]): React.JSX.Element => (
    <div key={r.zid} className="og-karte" data-ordner-reihe={r.titel}>
      <Text fw={700} mb={4}>
        Reihe: {r.titel}
      </Text>
      <Stack gap={4}>
        {r.materialien.map((m) => {
          const href = m.link ? `${m.link}${m.link.includes('?') ? '&' : '?'}reihe=${r.zid}` : m.stufeWaehlen ? `/s/r/${r.zid}/${m.schritt}` : undefined
          return (
            <a
              key={m.schritt}
              {...(href ? { href } : {})}
              style={{ opacity: m.gesperrt ? 0.6 : 1, cursor: href ? undefined : 'default', color: 'inherit', textDecoration: 'none' }}
              data-ordner-reihe-blatt
            >
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    {m.titel}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {m.gesperrt ? 'noch gesperrt' : m.eingereicht ? `eingereicht${m.loesung ? ' · Lösung im Blatt' : ''}` : 'noch offen'}
                  </Text>
                </div>
                {href && (
                  <Badge variant="light" size="sm" style={{ flex: 'none' }}>
                    {m.eingereicht ? 'Ansehen' : 'Öffnen'}
                  </Badge>
                )}
              </Group>
            </a>
          )
        })}
      </Stack>
      <Group gap="xs" mt={4}>
        <Button component="a" href={`/s/r/${r.zid}`} size="xs" variant="subtle">
          Zur Reihe
        </Button>
        <Button component="a" href={`/s/r/${r.zid}/materialien?reiter=abgaben`} size="xs" variant="subtle" data-ordner-reihe-abgaben>
          Meine Abgaben
        </Button>
      </Group>
    </div>
  )
  const aufgabeKarte = (a: (typeof o.aufgaben)[number]): React.JSX.Element => (
    <a key={a.id} className="og-karte" href={`/s/a/${a.id}`} data-ordner-aufgabe>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fw={700}>{a.titel}</Text>
          <Text size="sm" c="dimmed">
            Rückmeldung · {a.fassungen.some((x) => x.bogen) ? 'Rückmeldung da' : a.fassungen.length ? 'abgegeben' : 'noch nicht abgegeben'}
            {a.offen === false ? ' · abgeschlossen' : a.bis ? ` · bis ${new Date(a.bis).toLocaleDateString('de-DE')}` : ''}
          </Text>
        </div>
        <Badge variant="light" style={{ flex: 'none' }}>
          {a.offen === false ? 'Ansehen' : 'Öffnen'}
        </Badge>
      </Group>
    </a>
  )
  // Alles, was einem Überthema zugeordnet wird (in „Alle Jahrgänge" auch „Für dich" und offene Tests)
  const eintraege = [
    ...(alle ? [...fuerDich, ...andere] : andere).map((b) => ({ key: `blatt:${b.id}`, titel: b.titel, knoten: blattKarte(b) })),
    ...o.reihen.map((r) => ({ key: `reihe:${r.zid}`, titel: `${r.titel} ${r.materialien.map((m) => m.titel).join(' ')}`, knoten: reiheBlock(r) })),
    ...o.aufgaben.map((a) => ({ key: `rueckmeldung:${a.id}`, titel: a.titel, knoten: aufgabeKarte(a) })),
    ...(alle ? o.tests : fertigeTests).map((t) => ({ key: `test:${t.code}`, titel: t.titel, knoten: testKarte(t) }))
  ]
  const q = suche.trim().toLowerCase()
  const gefiltert = alle && q ? eintraege.filter((e) => e.titel.toLowerCase().includes(q) || (themen?.eintraege[e.key]?.thema ?? '').toLowerCase().includes(q)) : eintraege
  const jahre = themenGruppieren(gefiltert, themen, alle ? undefined : themen?.schuljahr)
  const themaTitel = (t: { name: string; semester?: string }): string => (t.semester ? `${t.semester} · ${t.name}` : t.name)
  const themenListe = (js: (typeof jahre)[number]): React.JSX.Element[] =>
    js.themen.map((t) => (
      <div key={t.schluessel} data-ordner-ueberthema={t.name}>
        <Abschnitt titel={themaTitel(t)}>{t.items.map((x) => x.knoten)}</Abschnitt>
      </div>
    ))

  if (alle)
    return (
      <div data-ordner-alle-jahrgaenge>
        <input
          type="search"
          className="og-suche"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          placeholder="Materialien durchsuchen …"
          aria-label="Materialien aller Jahrgänge durchsuchen"
          data-ordner-suche
          style={{ marginBottom: 12 }}
        />
        {!jahre.length && (
          <Text c="dimmed" size="sm">
            {q ? 'Nichts gefunden.' : 'Noch keine Materialien.'}
          </Text>
        )}
        {jahre.map((j, i) => {
          const offen = q ? true : (jahrAuf[j.schuljahr] ?? i === 0)
          return (
            <div key={j.schuljahr} data-ordner-jahrgang={j.jahrgang ?? ''} data-schuljahr={j.schuljahr} style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="og-jahr"
                disabled={Boolean(q)}
                onClick={() => setJahrAuf((a) => ({ ...a, [j.schuljahr]: !offen }))}
                aria-expanded={offen}
              >
                {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                {j.jahrgang ? jahrgangName(o.fach, j.jahrgang) : 'Schuljahr'}
                <span className="og-jahr-zahl">{schuljahrText(j.schuljahr)}</span>
              </button>
              {offen && <div style={{ paddingLeft: 10, marginTop: 6 }}>{themenListe(j)}</div>}
            </div>
          )
        })}
      </div>
    )

  return (
    <div>
      {(fuerDich.length > 0 || buendel.length > 0) && (
        <div data-ordner-fuer-dich>
          <Abschnitt titel="Für dich">
            {fuerDich.map(blattKarte)}
            {buendel.map((b) => (
              <div key={b.id} className="og-karte" data-ordner-buendel>
                <Text fw={700}>Dein Ziel</Text>
                <Text size="sm" mb={4}>
                  {b.ziel}
                </Text>
                {b.woerter.length > 0 && (
                  <Text size="sm">
                    <b>Wörter zum Üben:</b> {b.woerter.map((w) => `${w.term} – ${w.translation}`).join(' · ')}
                  </Text>
                )}
                {b.grammatik.map((g) => (
                  <div key={g.titel}>
                    <Text size="sm" fw={600} mt={4}>
                      {g.titel}
                    </Text>
                    {g.erklaerung && (
                      <Text size="sm" c="dimmed">
                        {g.erklaerung}
                      </Text>
                    )}
                    {(g.beispiele ?? []).map((x) => (
                      <Text key={x} size="sm" fs="italic">
                        {x}
                      </Text>
                    ))}
                  </div>
                ))}
                {b.hinweise.length > 0 && (
                  <Text size="sm" mt={4}>
                    <b>Tipps:</b> {b.hinweise.join(' · ')}
                  </Text>
                )}
              </div>
            ))}
          </Abschnitt>
        </div>
      )}
      {offeneTests.length > 0 && <Abschnitt titel="Onlinetests">{offeneTests.map(testKarte)}</Abschnitt>}
      {/* Nach Überthemen (19.10.2026): nur das laufende Schuljahr – Früheres unter „Alle Jahrgänge" */}
      {jahre.map((j) => (
        <div key={j.schuljahr} data-ordner-themen>
          {themenListe(j)}
        </div>
      ))}
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
