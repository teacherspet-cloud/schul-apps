/**
 * Aufgeschlagener Fachordner (08.10.2026, abgestimmt mit der Lehrkraft): links die Ringmechanik, rechts ein Blatt,
 * am Rand die Registerlaschen in Abstufungen der Fachfarbe (mit Symbol – nicht nur Farbe).
 *  - Vokabeln / Vocabulary …: Vokabeltrainings (Konten zusätzlich die Vokabelwege des Fachs)
 *  - Grammatik / Grammar …: Grammatiktrainings
 *  - Materialien / Materials …: Arbeitsblätter, Onlinetests, Rückmeldungen (Schreibaufgaben), dazu bei Konten Mappen
 *    (Ergebnisse, Tafelbilder, Lernprodukte) und Merkzettel
 * Registerwechsel blättert um; ruhige Darstellung ohne Bewegung.
 */
import { Badge, Button, Group, Loader, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { IconAbc, IconArrowLeft, IconBook2, IconFileText } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { GrammatikStand } from '../../onlinetest/SchuelerBereich'
import { MappeAnsicht, MerkKasten } from '../LernRaum'
import { VokabelwegKarten } from '../VokabelLeiter'
import { beschriftung, fachName, type Register } from './beschriftung'
import { deckelBereit, nimmUebergang, ordnerZu } from './ordnerAnimation'
import { ordnerFarben } from './ordnerFarben'
import { registerVon } from './Regal'
import { useRegal, type FachOrdner, type Mappe, type Merkkasten } from './regalDaten'

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
.og-karte:hover { box-shadow: 0 2px 8px rgba(0,0,0,.12), inset 4px 0 0 var(--og-akzent); }
@keyframes og-auf { from { opacity: 0; transform: perspective(1400px) rotateY(-8deg) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes og-blatt { from { opacity: 0; transform: perspective(1200px) rotateY(-14deg); } to { opacity: 1; transform: none; } }
@media (max-width: 560px) {
  .og-ordner { grid-template-columns: 22px 1fr; }
  .og-ringe { padding: 20px 0; } .og-ring { width: 22px; height: 12px; margin-right: -12px; border-width: 3px; }
  .og-papier { padding: 16px 12px 22px 22px; } .og-papier::before { left: 8px; }
  .og-ringe, .og-papier { grid-row: 2; }
  .og-laschen { grid-column: 1 / -1; grid-row: 1; flex-direction: row; padding: 0 0 0 26px; gap: 4px; }
  .og-lasche { writing-mode: horizontal-tb; border-radius: 10px 10px 0 0; padding: 7px 10px; margin: 0 0 -2px; font-size: .82rem; }
  .og-lasche[aria-selected="true"] { transform: translateY(-4px); }
  .og-lasche svg { transform: none; }
}
@media (prefers-reduced-motion: reduce) { .og-ordner, .og-seite { animation: none; } .og-lasche { transition: none; } }
html.sa-ruhig .og-ordner, html.sa-ruhig .og-seite { animation: none; }
`

const SYMBOL: Record<Register, React.ReactNode> = {
  vok: <IconAbc size={16} />,
  gram: <IconBook2 size={16} />,
  mat: <IconFileText size={16} />
}

export default function Ordner({ fach }: { fach: string }): React.JSX.Element {
  const { ordner } = useRegal()
  const dunkel = useComputedColorScheme('light') === 'dark'
  const o = ordner?.find((x) => x.fach === fachName(fach))
  const vorgabe = new URLSearchParams(window.location.search).get('r') as Register | null
  const [wahl, setWahl] = useState<Register | null>(vorgabe)
  // Aus dem Regal geöffnet: Deckel liegt schon über der Seite und klappt auf, sobald der Ordner steht (08.10.2026)
  const [uebergang] = useState(nimmUebergang)
  const aufklappen = useRef<((ziel: HTMLElement | null) => void) | null>(null)
  const ordnerEl = useRef<HTMLDivElement>(null)
  if (uebergang && !aufklappen.current) aufklappen.current = deckelBereit(uebergang)
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
      </Stack>
    )
  const f = ordnerFarben(o.farbe, dunkel)
  const register = registerVon(o)
  const aktiv: Register = wahl && register.includes(wahl) ? wahl : register[0] ?? 'mat'
  const zeigen = (r: Register): void => {
    setWahl(r)
    // Register in der Adresse merken: „Zurück" aus einem Training landet wieder hier
    window.history.replaceState(null, '', `${window.location.pathname}?r=${r}`)
  }
  const akzent = f.register[aktiv].bg
  return (
    <Stack gap="sm" data-ordner={fach}>
      <style>{CSS}</style>
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
        <div className="og-ringe" aria-hidden>
          <span className="og-ring" />
          <span className="og-ring" />
        </div>
        <div className="og-papier">
          <div key={aktiv} className="og-seite" role="tabpanel" data-ordner-register={aktiv}>
            <Text fw={800} size="lg" mb="sm" style={{ color: dunkel ? '#e9ecef' : f.register[aktiv].bg }}>
              {s[aktiv]}
            </Text>
            {aktiv === 'vok' && <Kurse o={o} grammatik={false} />}
            {aktiv === 'gram' && <Kurse o={o} grammatik />}
            {aktiv === 'mat' && <Materialien o={o} />}
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
              onClick={() => zeigen(r)}
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
      </div>
    </Stack>
  )
}

/** Was in einem Register gerade zu tun ist (Hinweis an der Lasche, 08.10.2026) */
export function zuTun(o: FachOrdner, r: Register): number {
  if (r === 'vok') return o.vokabeln.filter((v) => (v.uebersicht.heuteOffen ?? 0) > 0 || v.uebersicht.faellig > 0).length
  if (r === 'gram') return o.grammatik.filter((g) => (g.uebersicht.unbearbeitet ?? 0) > 0 || g.uebersicht.faellig > 0).length
  return (
    o.blaetter.filter((b) => b.offen && b.genutzt < b.runden && !b.begonnen).length +
    o.tests.filter((t) => !t.abgegeben).length +
    o.aufgaben.filter((a) => a.offen !== false && !a.fassungen.length).length
  )
}

/** Zurück: Gäste auf die Startseite, Konten in ihren Lernraum (dort steht das Regal) */
const zurueckZiel = (): string => (!window.__schulappsServer?.angemeldet || window.__schulappsServer.quelle === 'gast' ? '/s/' : '/s/lernen')

function Kurse({ o, grammatik }: { o: FachOrdner; grammatik: boolean }): React.JSX.Element {
  const liste = grammatik ? o.grammatik : o.vokabeln
  const konto = Boolean(window.__schulappsServer?.angemeldet && window.__schulappsServer.quelle !== 'gast')
  return (
    <Stack gap="xs">
      {!grammatik && konto && <VokabelwegKarten fach={o.fach} />}
      {liste.map((v) => (
        <a key={v.id} className="og-karte" href={`${grammatik ? '/s/g/' : '/s/v/'}${v.id}`} data-ordner-kurs={grammatik ? 'grammatik' : 'vokabeln'}>
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
      ))}
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

function Materialien({ o }: { o: FachOrdner }): React.JSX.Element {
  const [mappe, setMappe] = useState<Mappe | null>(null)
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
            <a key={b.id} className="og-karte" href={`/s/b/${b.id}`} data-ordner-blatt>
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
