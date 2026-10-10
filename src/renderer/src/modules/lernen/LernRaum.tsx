/**
 * Lernraum der Lernenden (03.10.2026, /s/lernen; Server: src/server/lernen.ts) – seit 08.10.2026 nur noch die
 * „Liste" (Wahl in den Einstellungen); sonst zeigt /s/lernen das Regal mit den Fachordnern (lernen/regal).
 *
 *  - Je Fach eine Karte in der Fachfarbe (die Türen mit Aufschwing-Animation sind entfallen, Befund der Lehrkraft
 *    08.10.2026: veraltet).
 *  - Im Fach: Karteikästen (Vokabeln → Trainer; Merkzettel → Karten herausnehmen und umdrehen) und Mappen je
 *    Themenbereich (umblättern: Arbeitsblätter mit Feedback, Tafelbilder, Schreibaufgaben, Tests, Lernprodukte).
 */
import { useAuffrischen } from '../../shared/auffrischen'
import { lesbarAuf } from './vtFarben'
import { ActionIcon, Alert, Badge, Button, Center, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core'
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconExternalLink } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { fachFarbe } from '../../shared/fachfarben'
import type { Uebersicht } from '@shared/vokabeltrainer'
import { holen } from '../onlinetest/serverApi'

interface Karteikasten {
  art: 'vokabeln' | 'merkzettel' | 'grammatik'
  titel: string
  id?: string
  uebersicht?: Uebersicht
  testTermin?: number | null
  karten?: { titel: string; text: string }[]
}
interface MappenSeite {
  art: 'blatt' | 'tafel' | 'schreiben' | 'test' | 'produkt'
  titel: string
  datum: number
  link?: string
  feedback?: { staerken?: string[]; schritte?: string[] }
  id?: string
  bild?: string
  text?: string
}
interface Raum {
  fach: string
  karteikaesten: Karteikasten[]
  mappen: { titel: string; seiten: MappenSeite[] }[]
}

/** Fachfarbe (Hex) wie überall in der App (Vorschlag des Fächerkatalogs) */
function farbeVon(fach: string): string {
  return (
    fachFarbe(fach) ??
    ['#4c6ef5', '#12b886', '#f76707', '#7048e8', '#e64980', '#1098ad', '#fab005'][Math.abs([...fach].reduce((a, c) => a + c.charCodeAt(0), 0)) % 7]
  )
}

const CSS = `
.lr-faecher { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.lr-fach { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 16px; text-decoration: none; min-height: 96px;
  box-shadow: 0 6px 14px rgba(0,0,0,0.15); transition: transform .18s ease; }
.lr-fach:hover, .lr-fach:focus-visible { transform: translateY(-3px); }
.lr-fach-name { font-weight: 800; font-size: 1.05rem; }
.lr-fach-zahl { font-size: .8rem; opacity: .9; }
.lr-regal { position: relative; padding: 18px 18px 0; border-radius: 18px; background: linear-gradient(180deg, #fbf6ee, #f3e7d3); }
.lr-brett { height: 14px; margin: 0 -18px 22px; background: linear-gradient(180deg, #c8a77a, #a7845a); box-shadow: 0 6px 10px rgba(0,0,0,0.18); border-radius: 3px; }
.lr-reihe { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; min-height: 120px; }
.lr-kasten { position: relative; width: 150px; height: 104px; border: none; padding: 0; cursor: pointer; background: transparent; transition: transform .2s; }
.lr-kasten:hover { transform: translateY(-4px); }
.lr-kasten .koerper { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; border-radius: 6px 6px 10px 10px;
  box-shadow: inset 0 -8px 0 rgba(0,0,0,0.12), 0 8px 14px rgba(0,0,0,0.18); }
.lr-kasten .karte { position: absolute; bottom: 40px; width: 40%; height: 54px; border-radius: 4px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform .25s; }
.lr-kasten:hover .karte:nth-child(2) { transform: translateY(-8px) rotate(-6deg); }
.lr-kasten:hover .karte:nth-child(3) { transform: translateY(-12px) rotate(4deg); }
.lr-kasten .etikett { position: absolute; left: 10px; right: 10px; bottom: 10px; background: #fff; border-radius: 4px; font-size: .72rem; font-weight: 700; padding: 3px 5px;
  text-align: left; color: #343a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lr-mappe { position: relative; width: 124px; height: 150px; border: none; padding: 0; cursor: pointer; background: transparent; transition: transform .2s; }
.lr-mappe:hover { transform: translateY(-4px) rotate(-1deg); }
.lr-mappe .ruecken { position: absolute; inset: 14px 0 0 0; border-radius: 4px 10px 10px 4px; box-shadow: 0 8px 14px rgba(0,0,0,0.2), inset 6px 0 0 rgba(0,0,0,0.12); }
.lr-mappe .reiter { position: absolute; left: 12px; top: 2px; width: 46px; height: 18px; border-radius: 6px 6px 0 0; }
.lr-mappe .etikett { position: absolute; left: 14px; right: 10px; top: 40px; background: #fff; border-radius: 4px; padding: 6px; font-size: .75rem; font-weight: 700;
  color: #343a40; text-align: left; line-height: 1.2; max-height: 62px; overflow: hidden; }
.lr-mappe .gummi { position: absolute; right: 18px; top: 14px; bottom: 0; width: 4px; background: rgba(0,0,0,0.35); }
.lr-buch { perspective: 1800px; }
.lr-seite { background: #fffdf8; border-radius: 6px 14px 14px 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.18), inset 10px 0 18px -12px rgba(0,0,0,0.35);
  padding: 22px; min-height: 420px; transform-origin: left center; }
@keyframes lr-blaettern-vor { from { transform: rotateY(-90deg); opacity: .4 } to { transform: rotateY(0); opacity: 1 } }
@keyframes lr-blaettern-zurueck { from { transform: rotateY(90deg); opacity: .4 } to { transform: rotateY(0); opacity: 1 } }
.lr-vor { animation: lr-blaettern-vor .55s cubic-bezier(.3,.7,.2,1); }
.lr-zurueck { animation: lr-blaettern-zurueck .55s cubic-bezier(.3,.7,.2,1); transform-origin: right center; }
.lr-merk-buehne { perspective: 1000px; }
.lr-merk { position: relative; height: 220px; transition: transform .6s; transform-style: preserve-3d; cursor: pointer; }
.lr-merk.um { transform: rotateY(180deg); }
.lr-merk > div { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 14px; padding: 18px;
  background: #fff; border: 1px solid #dee2e6; box-shadow: 0 10px 22px rgba(0,0,0,0.12); overflow: auto; }
.lr-merk > div.hinten { transform: rotateY(180deg); background: linear-gradient(160deg, #fff9db, #fff3bf); white-space: pre-wrap; }
@keyframes lr-ziehen { from { transform: translateY(40px) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
.lr-gezogen { animation: lr-ziehen .45s cubic-bezier(.3,.7,.2,1); }
@media (prefers-reduced-motion: reduce) { .lr-fach, .lr-merk { transition: none } .lr-vor, .lr-zurueck, .lr-gezogen { animation: none } }
`

export default function LernRaum({ fach }: { fach?: string }): React.JSX.Element {
  const [raeume, setRaeume] = useState<Raum[] | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ raeume: Raum[] }>('/s/api/lernen').then(
        (d) => setRaeume(d.raeume),
        () => setRaeume((r) => r ?? [])
      ),
    []
  )
  useEffect(laden, [laden])
  // Neue Freigaben ohne Neuladen (08.10.2026)
  useAuffrischen(laden)
  if (!raeume)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  const raum = fach ? raeume.find((r) => r.fach === fach) : undefined
  if (fach) return raum ? <Zimmer raum={raum} /> : <Alert color="orange">In diesem Fach ist noch nichts für dich da.</Alert>
  return (
    <Stack data-lernraum>
      <style>{CSS}</style>
      <Button variant="subtle" component="a" href="/s/" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Startseite
      </Button>
      <div>
        <Title order={3}>Dein Lernraum</Title>
        <Text c="dimmed" size="sm">
          Deine Karteikästen und Mappen – nach Fach geordnet.
        </Text>
      </div>
      {raeume.length === 0 ? (
        <Alert>
          Noch ist nichts da. Sobald deine Lehrkraft Vokabeln, Arbeitsblätter oder Tafelbilder freigibt oder du etwas bearbeitest, füllt sich der Lernraum.
        </Alert>
      ) : (
        <div className="lr-faecher">
          {raeume.map((r) => {
            const farbe = farbeVon(r.fach)
            const faellig = r.karteikaesten.reduce((n, k) => n + (k.uebersicht?.faellig ?? 0), 0)
            return (
              <a
                key={r.fach}
                href={`/s/lernen/${encodeURIComponent(r.fach)}`}
                className="lr-fach"
                style={{ background: `linear-gradient(150deg, ${farbe}, ${farbe}cc)`, color: lesbarAuf(farbe) }}
                data-fach-karte={r.fach}
              >
                <span className="lr-fach-name">{r.fach}</span>
                <span className="lr-fach-zahl">
                  {r.karteikaesten.length} {r.karteikaesten.length === 1 ? 'Kasten' : 'Kästen'} · {r.mappen.length}{' '}
                  {r.mappen.length === 1 ? 'Mappe' : 'Mappen'}
                </span>
                {faellig > 0 && (
                  <Badge color="red" variant="filled" w="fit-content">
                    {faellig} fällig
                  </Badge>
                )}
              </a>
            )
          })}
        </div>
      )}
    </Stack>
  )
}

function Zimmer({ raum }: { raum: Raum }): React.JSX.Element {
  const farbe = farbeVon(raum.fach)
  const [kasten, setKasten] = useState<Karteikasten | null>(null)
  const [mappe, setMappe] = useState<{ titel: string; seiten: MappenSeite[] } | null>(null)
  return (
    <Stack data-zimmer={raum.fach}>
      <style>{CSS}</style>
      <Button variant="subtle" component="a" href="/s/lernen" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Alle Fächer
      </Button>
      <Title order={3}>{raum.fach}</Title>
      <div className="lr-regal">
        <Text fw={700} size="sm" mb="xs">
          Karteikästen
        </Text>
        <div className="lr-reihe">
          {raum.karteikaesten.length === 0 && (
            <Text size="sm" c="dimmed" pb="md">
              Noch keine Karteikästen.
            </Text>
          )}
          {raum.karteikaesten.map((k, i) => (
            <button
              key={i}
              type="button"
              className="lr-kasten"
              onClick={() =>
                k.art === 'vokabeln' && k.id
                  ? window.location.assign(`/s/v/${k.id}`)
                  : k.art === 'grammatik' && k.id
                    ? window.location.assign(`/s/g/${k.id}`)
                    : setKasten(k)
              }
              aria-label={`Karteikasten: ${k.titel}`}
              data-karteikasten={k.art}
            >
              <span className="karte" style={{ left: '14%' }} />
              <span className="karte" style={{ left: '34%' }} />
              <span className="karte" style={{ left: '52%' }} />
              <span
                className="koerper"
                style={{
                  background:
                    k.art === 'vokabeln'
                      ? `linear-gradient(180deg, ${farbe}, ${farbe}bb)`
                      : k.art === 'grammatik'
                        ? 'linear-gradient(180deg, #be4bdb, #9c36b5)'
                        : 'linear-gradient(180deg, #ffd43b, #fab005)'
                }}
              />
              <span className="etikett">{k.titel}</span>
              {k.uebersicht && k.uebersicht.faellig > 0 && (
                <Badge color="red" variant="filled" size="sm" style={{ position: 'absolute', right: 4, top: 30 }}>
                  {k.uebersicht.faellig}
                </Badge>
              )}
            </button>
          ))}
        </div>
        <div className="lr-brett" />
        <Text fw={700} size="sm" mb="xs">
          Mappen
        </Text>
        <div className="lr-reihe">
          {raum.mappen.length === 0 && (
            <Text size="sm" c="dimmed" pb="md">
              Noch keine Mappen.
            </Text>
          )}
          {raum.mappen.map((m, i) => (
            <button key={i} type="button" className="lr-mappe" onClick={() => setMappe(m)} aria-label={`Mappe: ${m.titel}`} data-mappe={m.titel}>
              <span className="reiter" style={{ background: `${farbe}aa` }} />
              <span className="ruecken" style={{ background: `linear-gradient(150deg, ${farbe}, ${farbe}cc)` }} />
              <span className="gummi" />
              <span className="etikett">
                {m.titel}
                <br />
                <span style={{ fontWeight: 400, color: '#868e96' }}>{m.seiten.length} Seiten</span>
              </span>
            </button>
          ))}
        </div>
        <div className="lr-brett" />
      </div>
      {kasten && <MerkKasten k={kasten} schliessen={() => setKasten(null)} />}
      {mappe && <MappeAnsicht m={mappe} schliessen={() => setMappe(null)} />}
    </Stack>
  )
}

/** Merkzettel: aus dem Kasten ziehen und umdrehen */
export function MerkKasten({ k, schliessen }: { k: Karteikasten; schliessen: () => void }): React.JSX.Element {
  const karten = k.karten ?? []
  const [i, setI] = useState<number | null>(null)
  const [um, setUm] = useState(false)
  return (
    <Modal opened onClose={schliessen} title={k.titel} size="lg">
      {i === null ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Nimm eine Karte heraus:
          </Text>
          {karten.map((c, n) => (
            <Button key={n} variant="default" justify="flex-start" onClick={() => (setI(n), setUm(false))} data-merkkarte>
              {c.titel}
            </Button>
          ))}
        </Stack>
      ) : (
        <Stack className="lr-gezogen lr-merk-buehne">
          <div className={`lr-merk ${um ? 'um' : ''}`} onClick={() => setUm(!um)} data-merkkarte-offen>
            <div>
              <Center h="100%">
                <Stack align="center" gap={4}>
                  <Title order={3} ta="center">
                    {karten[i].titel}
                  </Title>
                  <Text size="sm" c="dimmed">
                    Antippen zum Umdrehen
                  </Text>
                </Stack>
              </Center>
            </div>
            <div className="hinten">{karten[i].text}</div>
          </div>
          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setI(null)}>
              Zurücklegen
            </Button>
            <Group gap="xs">
              <ActionIcon variant="light" disabled={i === 0} onClick={() => (setI(i - 1), setUm(false))} aria-label="vorherige Karte">
                <IconChevronLeft size={18} />
              </ActionIcon>
              <ActionIcon variant="light" disabled={i === karten.length - 1} onClick={() => (setI(i + 1), setUm(false))} aria-label="nächste Karte">
                <IconChevronRight size={18} />
              </ActionIcon>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

const ART: Record<MappenSeite['art'], string> = { blatt: 'Arbeitsblatt', tafel: 'Tafelbild', schreiben: 'Schreibaufgabe', test: 'Test', produkt: 'Lernprodukt' }

/** Mappe: Seite für Seite umblättern (Wischen oder Pfeile) */
export function MappeAnsicht({ m, schliessen }: { m: { titel: string; seiten: MappenSeite[] }; schliessen: () => void }): React.JSX.Element {
  const [n, setN] = useState(0)
  const [richtung, setRichtung] = useState<'vor' | 'zurueck'>('vor')
  const [startX, setStartX] = useState<number | null>(null)
  const geh = (d: number): void => {
    const z = n + d
    if (z < 0 || z >= m.seiten.length) return
    setRichtung(d > 0 ? 'vor' : 'zurueck')
    setN(z)
  }
  const s = m.seiten[n]
  return (
    <Modal opened onClose={schliessen} title={m.titel} size="xl">
      <div
        className="lr-buch"
        onPointerDown={(e) => setStartX(e.clientX)}
        onPointerUp={(e) => (startX !== null && Math.abs(e.clientX - startX) > 50 ? geh(e.clientX < startX ? 1 : -1) : null, setStartX(null))}
      >
        <div key={n} className={`lr-seite ${richtung === 'vor' ? 'lr-vor' : 'lr-zurueck'}`} data-mappenseite={s.art}>
          <Group justify="space-between" mb="sm">
            <Badge variant="light">{ART[s.art]}</Badge>
            <Text size="xs" c="dimmed">
              {s.datum ? new Date(s.datum).toLocaleDateString('de-DE') : ''}
            </Text>
          </Group>
          <Title order={4} mb="sm">
            {s.titel}
          </Title>
          <SeitenInhalt s={s} />
        </div>
      </div>
      <Group justify="space-between" mt="md">
        <ActionIcon size="lg" variant="light" disabled={n === 0} onClick={() => geh(-1)} aria-label="zurückblättern">
          <IconChevronLeft />
        </ActionIcon>
        <Text size="sm" c="dimmed">
          Seite {n + 1} von {m.seiten.length}
        </Text>
        <ActionIcon size="lg" variant="light" disabled={n === m.seiten.length - 1} onClick={() => geh(1)} aria-label="weiterblättern" data-weiterblaettern>
          <IconChevronRight />
        </ActionIcon>
      </Group>
    </Modal>
  )
}

function SeitenInhalt({ s }: { s: MappenSeite }): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [tafel, setTafel] = useState<string[] | null>(null)
  useEffect(() => {
    if (s.art === 'blatt' && s.id)
      void holen<{ html: string }>(`/s/api/blatt?id=${encodeURIComponent(s.id)}`).then(
        (d) => setHtml(d.html),
        () => setHtml('')
      )
    if (s.art === 'tafel' && s.id)
      void holen<{ bilder: string[] }>(`/s/api/tafel?id=${encodeURIComponent(s.id)}`).then(
        (d) => setTafel(d.bilder),
        () => setTafel([])
      )
  }, [s.art, s.id])
  return (
    <Stack gap="sm">
      {s.art === 'blatt' &&
        (html === null ? (
          <Loader size="sm" />
        ) : html ? (
          <div style={{ height: 300, overflow: 'hidden', borderRadius: 8, border: '1px solid #e9ecef', background: '#fff' }}>
            <iframe
              title={s.titel}
              srcDoc={html}
              sandbox=""
              style={{ width: 794, height: 1123, border: 0, transform: 'scale(0.42)', transformOrigin: 'top left', pointerEvents: 'none' }}
            />
          </div>
        ) : null)}
      {s.art === 'tafel' &&
        (tafel === null ? (
          <Loader size="sm" />
        ) : (
          tafel.map((svg, i) => (
            <img
              key={i}
              alt={s.titel}
              src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`}
              style={{ width: '100%', borderRadius: 8 }}
            />
          ))
        ))}
      {s.art === 'produkt' && s.bild && <img alt={s.titel} src={s.bild} style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 8 }} />}
      {s.text && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} lineClamp={10}>
          {s.text}
        </Text>
      )}
      {s.feedback && (
        <Stack gap={4}>
          {Boolean(s.feedback.staerken?.length) && (
            <Text size="sm">
              <b style={{ color: 'var(--mantine-color-green-7)' }}>Das gelingt dir:</b> {s.feedback.staerken!.join(' ')}
            </Text>
          )}
          {Boolean(s.feedback.schritte?.length) && (
            <Text size="sm">
              <b style={{ color: 'var(--mantine-color-blue-7)' }}>Nächste Schritte:</b> {s.feedback.schritte!.join(' ')}
            </Text>
          )}
        </Stack>
      )}
      {s.link && (
        <Button component="a" href={s.link} variant="light" rightSection={<IconExternalLink size={14} />} w="fit-content">
          Ganz ansehen
        </Button>
      )}
    </Stack>
  )
}
