/**
 * Vokabeln je Sprache (10.10.2026, Entscheidung der Lehrkraft „Option A"; Regeln shared/sprachstand.ts, Server
 * server/sprachstand.ts). Ersetzt die Seite „Mein Vokabelweg" und die Kurswahl im Register „Vocabulary":
 *
 *  - Karte AKTUELLER Band („Green Line 3 · Klasse 7"): Units als Stationen, die Abschnitte der aktuellen Unit als Punkte
 *    (Anteil sicher / im Aufbau / neu), „12 von 21 Abschnitten kennengelernt", EIN Knopf „Heute üben · N Wörter" (eine
 *    Runde über alle Kurse der Sprache). Spätere Units nur als „weitere Units folgen" – nichts Gesperrtes.
 *  - Frühere Jahre (seit 12.10.2026 nur unter „Meine Bücher"): Cover mit Medaille; ein aufgeschlagener früherer Band
 *    bietet ruhig „Wiederholen? N Wörter" und „Noch nicht gelernte Wörter lernen" an (BandAngebote) – nichts ist Pflicht.
 *  - Darunter der gemeinsame Kasten der Sprache (Karteikasten, Spiele) – der Trainer mit der Kennung „sp:<sprache>".
 *  - Ohne Lehrwerk mit Wörtern (eigene Listen, Platzhalter-Bände wie ¡Apúntate!): nur die Kursliste wie bisher.
 * Die Startseite zeigt keine Sprachkarte mehr (10.10.2026) – die Runde steht dort unter „Als Nächstes“.
 */
import { Button, Group, Loader, SegmentedControl, Stack, Text } from '@mantine/core'
import { IconCheck, IconPlayerPlay } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { kursReiterNamen } from '@shared/ohneKlasse'
import { type AktuellerBand, type BandMedaille, type FruehererBand, type SprachStand, type StandZahlen } from '@shared/sprachstand'
import { holen } from '../../onlinetest/serverApi'
import { useAuffrischen } from '../../../shared/auffrischen'
import { BandCover } from '../../../shared/components/BandCover'
import VokabelTrainer from '../VokabelTrainer'
import { BUECHER_DEUTSCH, type BuecherTexte } from './buecherTexte'
import type { FachOrdner } from './regalDaten'

export const SPRACH_CSS = `
.sk-kreise { display: inline-flex; flex-wrap: wrap; gap: 2px 10px; align-items: center; font-size: .8rem; }
.sk-kreise > span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.sk-punkt { flex: none; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--sk-f); display: inline-block; box-sizing: border-box; }
.sk-punkt[data-status="neu"] { --sk-f: #868e96; background: transparent; }
.sk-punkt[data-status="aufbau"] { --sk-f: #e8590c; background: linear-gradient(90deg, var(--sk-f) 50%, transparent 50%); }
.sk-punkt[data-status="sicher"] { --sk-f: #2b8a3e; background: var(--sk-f); }
.sk-balken { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: rgba(134,142,150,.25); }
.sk-balken > span { display: block; height: 100%; }
.sk-karte { min-width: 0; max-width: 100%; overflow: hidden; box-sizing: border-box; border-radius: 16px; padding: 14px 16px; background: var(--og-karte, var(--mantine-color-body)); box-shadow: 0 1px 0 rgba(0,0,0,.06), inset 4px 0 0 var(--sk-akzent, #1971c2); }
.sk-units-rahmen { position: relative; min-width: 0; max-width: 100%;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 18px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 18px), transparent 100%); }
.sk-units { display: flex; flex-wrap: nowrap; gap: 6px; align-items: center; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity;
  scrollbar-width: none; padding: 4px 14px; min-width: 0; }
.sk-units::-webkit-scrollbar { display: none; }
.sk-unit { flex: none; scroll-snap-align: center; font: inherit; font-size: .78rem; font-weight: 700; padding: 4px 11px; min-height: 32px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(134,142,150,.45); background: transparent; color: inherit; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
html[data-touch] .sk-unit { min-height: 44px; padding: 4px 14px; }
.sk-unit[data-lage="kennen"] { opacity: .8; }
/* Gewählt = gefüllt (19.10.2026, Befund der Lehrkraft: „Hello" antippen schien nichts zu tun – gefüllt blieb die aktuelle
   Unit, die Wahl zeigte nur einen dünnen Ring). Die aktuelle Unit trägt einen Punkt, solange eine andere gewählt ist. */
.sk-unit[aria-selected="true"] { background: var(--sk-akzent, #1971c2); border-color: transparent; color: #fff; opacity: 1; }
.sk-unit[data-lage="aktuell"][aria-selected="false"] { border-color: var(--sk-akzent, #1971c2); }
.sk-unit-punkt { width: 6px; height: 6px; border-radius: 50%; background: var(--sk-akzent, #1971c2); }
.sk-unit-titel { font-size: .74rem; font-weight: 700; opacity: .85; }
.sk-unit:focus-visible { outline: 3px solid var(--sk-akzent, #1971c2); outline-offset: 2px; }
.sk-weitere { flex: none; font-size: .74rem; opacity: .65; white-space: nowrap; padding-right: 4px; }
.sk-abschnitte { display: flex; flex-wrap: wrap; gap: 10px 12px; margin-top: 2px; min-width: 0; }
.sk-abschnitt-balken { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sk-abschnitt { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 64px; text-align: center; }
.sk-ring { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; }
.sk-ring > span { width: 20px; height: 20px; border-radius: 50%; background: var(--og-karte, var(--mantine-color-body)); display: grid; place-items: center; }
.sk-abschnitt-name { font-size: .66rem; line-height: 1.15; opacity: .8; overflow-wrap: anywhere; }
.sk-bord { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 14px 10px; }
.sk-buch { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer;
  text-align: center; padding: 4px 2px; border-radius: 8px; }
.sk-buch:focus-visible { outline: 3px solid var(--sk-akzent, #1971c2); outline-offset: 2px; }
.sk-cover { position: relative; line-height: 0; box-shadow: 0 5px 12px rgba(0,0,0,.22); border-radius: 4px; }
.sk-medaille { position: absolute; right: -10px; bottom: -8px; }
.sk-buch-name { font-weight: 700; font-size: .85rem; line-height: 1.2; }
.sk-buch-zeile { font-size: .74rem; opacity: .75; line-height: 1.2; }
@media (max-width: 560px) { .sk-bord { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); } .sk-abschnitt { width: 56px; } }
`

const FARBE = { sicher: '#2b8a3e', aufbau: '#e8590c', neu: 'rgba(134,142,150,.35)' }
export const MEDAILLE_FARBE: Record<BandMedaille, string> = { bronze: '#cd7f32', silber: '#a7b0ba', gold: '#e3b505' }
export const MEDAILLE_NAME: Record<BandMedaille, string> = { bronze: 'Bronze', silber: 'Silber', gold: 'Gold' }

/** Medaille eines Bandes (schlichtes SVG: Band und Scheibe in der Stufenfarbe) */
export function BandMedailleBild({ m, groesse = 30 }: { m: BandMedaille; groesse?: number }): React.JSX.Element {
  const f = MEDAILLE_FARBE[m]
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 32 32" role="img" aria-label={`Medaille ${MEDAILLE_NAME[m]}`} data-medaille={m}>
      <path d="M9 1h6l3 10h-6zM17 1h6l-3 10h-6z" fill="#3b5bdb" opacity=".85" />
      <circle cx="16" cy="20" r="10" fill={f} stroke="rgba(0,0,0,.25)" strokeWidth="1.2" />
      <circle cx="16" cy="20" r="6.5" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="1.2" />
    </svg>
  )
}

/** Drei kleine Kreise mit Zahlen: ○ neu ◐ im Aufbau ● sicher – dazu wahlweise ein dreifarbiger Balken */
export function StandKreise({ z, t, balken = false }: { z: StandZahlen; t: BuecherTexte; balken?: boolean }): React.JSX.Element {
  const b = Math.max(1, z.gesamt)
  return (
    <Stack gap={4} data-stand-kreise={`${z.neu}/${z.aufbau}/${z.sicher}`}>
      {balken && (
        <div className="sk-balken" aria-hidden>
          <span style={{ width: `${(z.sicher / b) * 100}%`, background: FARBE.sicher }} />
          <span style={{ width: `${(z.aufbau / b) * 100}%`, background: FARBE.aufbau }} />
        </div>
      )}
      <span className="sk-kreise">
        {(['neu', 'aufbau', 'sicher'] as const).map((s) => (
          <span key={s} title={t.status[s]} aria-label={`${t.status[s]}: ${z[s]}`}>
            <span className="sk-punkt" data-status={s} aria-hidden />
            {z[s]}
          </span>
        ))}
      </span>
    </Stack>
  )
}

/** Ring eines Abschnitts: Anteil sicher (grün), im Aufbau (orange), neu (grau) */
function AbschnittRing({ z }: { z: StandZahlen }): React.JSX.Element {
  const b = Math.max(1, z.gesamt)
  const s = (z.sicher / b) * 360
  const a = s + (z.aufbau / b) * 360
  const fertig = z.gesamt > 0 && z.kennengelernt >= z.gesamt
  return (
    <span className="sk-ring" style={{ background: `conic-gradient(${FARBE.sicher} 0 ${s}deg, ${FARBE.aufbau} ${s}deg ${a}deg, ${FARBE.neu} ${a}deg 360deg)` }}>
      <span>{fertig ? <IconCheck size={12} /> : null}</span>
    </span>
  )
}

/** Abschnitts-Kurzname für die Punkte („Station 1" → „St. 1") */
const kurz = (s: string): string => s.replace(/^Station\s*/i, 'St. ').replace(/^Unit\s*/i, 'U ')

/** Höchstens so viele Abschnitte als Punkte – darüber ein kompakter Balken „5 von 12" (10.10.2026) */
const MAX_PUNKTE = 8

type UnitStandT = AktuellerBand['units'][number]
const abschnittFertig = (x: UnitStandT['abschnitte'][number]): boolean => x.zahlen.gesamt > 0 && x.zahlen.kennengelernt >= x.zahlen.gesamt
const unitFertig = (u: UnitStandT): boolean => u.abschnitte.length > 0 && u.abschnitte.every(abschnittFertig)

/**
 * Units als Stationen und die Abschnitte EINER Unit (10.10.2026, Befund am Telefon: die Reihe wurde breiter als der
 * Bildschirm). Die Units stehen in einem waagerecht rollbaren Streifen (Einrasten, weiche Ränder, die aktuelle Unit
 * ist sichtbar); Antippen zeigt die Abschnitte dieser Unit. Bis 8 Abschnitte als Ringe, mehr als Balken „5 von 12".
 */
function UnitLeiste({ b, aktuell }: { b: AktuellerBand; aktuell: string }): React.JSX.Element {
  const [wahl, setWahl] = useState(aktuell)
  const streifen = useRef<HTMLDivElement>(null)
  const u = b.units.find((x) => x.unit === wahl) ?? b.units.find((x) => x.unit === aktuell) ?? b.units[b.units.length - 1]
  // Die aktuelle Unit in den sichtbaren Bereich rollen – nur den Streifen, nie die Seite
  useEffect(() => {
    const el = streifen.current
    const knopf = el?.querySelector<HTMLElement>('[data-lage="aktuell"]')
    if (el && knopf) el.scrollLeft = Math.max(0, knopf.offsetLeft - el.clientWidth / 2 + knopf.offsetWidth / 2)
  }, [aktuell])
  const fertig = u ? u.abschnitte.filter(abschnittFertig).length : 0
  return (
    <Stack gap={6} mt="sm" style={{ minWidth: 0 }}>
      <div className="sk-units-rahmen">
        <div className="sk-units" ref={streifen} data-units role="tablist" aria-label="Units">
          {b.units.map((x) => {
            const kennen = unitFertig(x)
            const lage = x.unit === aktuell ? 'aktuell' : kennen ? 'kennen' : 'offen'
            return (
              <button
                key={x.unit}
                type="button"
                role="tab"
                aria-selected={x.unit === u?.unit}
                className="sk-unit"
                data-lage={lage}
                data-unit={x.unit}
                onClick={() => setWahl(x.unit)}
              >
                {kennen && <IconCheck size={12} />}
                {lage === 'aktuell' && x.unit !== u?.unit && <span className="sk-unit-punkt" title="aktuelle Unit" />}
                {x.unit}
              </button>
            )
          })}
          {b.weitereUnits > 0 && (
            <span className="sk-weitere" data-weitere-units={b.weitereUnits}>
              · weitere Units folgen
            </span>
          )}
        </div>
      </div>
      {u && u.abschnitte.length <= MAX_PUNKTE && (
        <Text className="sk-unit-titel" data-unit-titel={u.unit}>
          {u.unit}: {fertig} von {u.abschnitte.length} {u.abschnitte.length === 1 ? 'Abschnitt' : 'Abschnitten'} kennengelernt
          {u.unit === aktuell ? ' · aktuelle Unit' : ''}
        </Text>
      )}
      {u && u.abschnitte.length <= MAX_PUNKTE && (
        <div className="sk-abschnitte" data-abschnitt-punkte={u.abschnitte.length} data-abschnitte-unit={u.unit}>
          {u.abschnitte.map((x) => (
            <div
              key={x.key}
              className="sk-abschnitt"
              title={`${x.name}: ${x.zahlen.kennengelernt} von ${x.zahlen.gesamt} kennengelernt, ${x.zahlen.sicher} sicher`}
            >
              <AbschnittRing z={x.zahlen} />
              <span className="sk-abschnitt-name">{kurz(x.name)}</span>
            </div>
          ))}
        </div>
      )}
      {u && u.abschnitte.length > MAX_PUNKTE && (
        <div className="sk-abschnitt-balken" data-abschnitt-balken={`${fertig}/${u.abschnitte.length}`} data-abschnitte-unit={u.unit}>
          <Text size="xs" fw={700}>
            {u.unit}: {fertig} von {u.abschnitte.length} Abschnitten kennengelernt
          </Text>
          <div className="sk-balken" aria-hidden>
            <span style={{ width: `${(fertig / u.abschnitte.length) * 100}%`, background: FARBE.sicher }} />
          </div>
        </div>
      )}
    </Stack>
  )
}

/** Stand der Sprachen laden (alle oder nur ein Fach); frisch beim Zurückkehren */
export function useSprachstand(fach?: string, aktiv = true): { sprachen: SprachStand[] | null; laden: () => void } {
  const [sprachen, setSprachen] = useState<SprachStand[] | null>(null)
  const laden = useCallback(() => {
    if (!aktiv) return
    void holen<{ sprachen: SprachStand[] }>(`/s/api/sprachstand${fach ? `?fach=${encodeURIComponent(fach)}` : ''}`).then(
      (d) => setSprachen(d.sprachen ?? []),
      () => setSprachen((s) => s ?? [])
    )
  }, [fach, aktiv])
  useEffect(laden, [laden])
  useAuffrischen(() => !document.querySelector('[data-sitzung], [data-spiel], [data-verbspiel]') && laden())
  return { sprachen, laden }
}

/**
 * Karte des aktuellen Bandes. `start`: Knopf startet die Runde hier (Ordner); `href`: Knopf führt dorthin (Startseite).
 * `kompakt`: nur Kopf, Zahl und Knopf (Startseite).
 */
export function AktuellerBandKarte({
  s,
  start,
  href,
  kompakt = false,
  ohneKnopf = false
}: {
  s: SprachStand
  start?: () => void
  href?: string
  kompakt?: boolean
  /** Startseite (10.10.2026): steht dieselbe Runde schon unter „Als Nächstes", nur die Zahl zeigen – EIN Knopf */
  ohneKnopf?: boolean
}): React.JSX.Element {
  const t = BUECHER_DEUTSCH
  const b: AktuellerBand | null = s.aktuell
  const aktUnit = b?.units.find((u) => u.unit === b.aktuelleUnit) ?? b?.units[b.units.length - 1]
  const n = s.heute.anzahl
  const knopf =
    n > 0 && ohneKnopf ? (
      <Text size="sm" fw={600} data-heute-ueben={n} data-heute-ohne-knopf>
        Heute dran: {n} {n === 1 ? 'Wort' : 'Wörter'}
      </Text>
    ) : n > 0 ? (
      <Button
        radius="xl"
        size={kompakt ? 'sm' : 'md'}
        leftSection={<IconPlayerPlay size={16} />}
        {...(href ? { component: 'a' as const, href } : { onClick: start })}
        style={{ background: 'var(--sk-akzent, #1971c2)' }}
        data-heute-ueben={n}
      >
        Heute üben · {n} {n === 1 ? 'Wort' : 'Wörter'}
      </Button>
    ) : (
      <Text size="sm" fw={700} c="teal" data-heute-ueben={0}>
        ✓ Für heute geschafft
      </Text>
    )
  return (
    <div className="sk-karte" style={{ ['--sk-akzent' as string]: s.farbe ?? '#1971c2' }} data-aktueller-band={b?.id ?? ''} data-sprache={s.sprache}>
      <style>{SPRACH_CSS}</style>
      <Group gap="md" wrap="nowrap" align="flex-start">
        {b && <BandCover band={b} land={b.stateId ?? ''} breite={kompakt ? 40 : 52} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '.05em' }}>
            {kompakt ? s.fach : t.diesesJahr}
          </Text>
          <Text fw={800} size="lg" lh={1.2} data-band-titel>
            {b ? [b.name, b.klasse ? `Klasse ${b.klasse}` : ''].filter(Boolean).join(' · ') : s.fach}
          </Text>
          {b && (
            <Text size="sm" c="dimmed" data-abschnitte-kennen={`${b.abschnitteKennen}/${b.abschnitte}`}>
              {aktUnit ? `${aktUnit.unit} · ` : ''}
              {b.abschnitteKennen} von {b.abschnitte} {b.abschnitte === 1 ? 'Abschnitt' : 'Abschnitten'} kennengelernt
            </Text>
          )}
        </div>
      </Group>
      {b && !kompakt && aktUnit && <UnitLeiste b={b} aktuell={aktUnit.unit} />}
      {b && !kompakt && (
        <div style={{ marginTop: 8 }}>
          <StandKreise z={b.zahlen} t={t} balken />
        </div>
      )}
      <Stack gap={4} mt="sm" align="flex-start">
        {knopf}
        {s.heute.pause && (
          <Text size="xs" c="dimmed" data-test-pause>
            Bald ist ein Vokabeltest – heute nur der Teststoff.
          </Text>
        )}
        {!kompakt && s.heute.extra > 0 && (
          <Text size="xs" c="dimmed">
            Danach freiwillig: {s.heute.extra} weitere fällige {s.heute.extra === 1 ? 'Wiederholung' : 'Wiederholungen'}.
          </Text>
        )}
      </Stack>
    </div>
  )
}

/*
 * „Frühere Jahre" unter „Heute üben" entfernt (12.10.2026, Wunsch der Lehrkraft): Die früheren Bände stehen unter
 * „Meine Bücher" auf dem Bord (Cover, Medaille, Anteile). Ihre ruhigen Angebote („Wiederholen?", „Noch nicht gelernte
 * Wörter lernen") stehen jetzt dort, wenn ein früherer Band aufgeschlagen ist (BandAngebote, Wortliste.tsx).
 */

/** Ruhige Angebote eines früheren Bandes (in „Meine Bücher"): Medaillen-Hinweis und zwei freiwillige Runden */
export function BandAngebote({
  b,
  nachRunde,
  beimUeben
}: {
  b: FruehererBand
  nachRunde?: () => void
  /** Runde läuft: „Meine Bücher" zeigt dann nur noch sie (12.10.2026) */
  beimUeben?: (an: boolean) => void
}): React.JSX.Element | null {
  const [lauf, setLauf] = useState<{ n: number; uebung: string | null }>({ n: 0, uebung: null })
  const [uebt, setUebt] = useState(false)
  const melden = useCallback(
    (an: boolean) => {
      setUebt(an)
      beimUeben?.(an)
    },
    [beimUeben]
  )
  if (!b.naechste && b.wiederholen <= 0 && b.neu <= 0) return null
  return (
    <Stack gap={6} data-band-seite={b.id}>
      {!uebt && b.naechste && (
        <Text size="xs" c="dimmed" data-naechste-medaille={b.naechste.medaille}>
          Noch {b.naechste.fehlen} sichere {b.naechste.fehlen === 1 ? 'Wort' : 'Wörter'} bis {MEDAILLE_NAME[b.naechste.medaille]}.
        </Text>
      )}
      <Group gap="xs" style={uebt ? { display: 'none' } : undefined}>
        {b.wiederholen > 0 && (
          <Button
            variant="light"
            radius="xl"
            size="sm"
            onClick={() => setLauf((l) => ({ n: l.n + 1, uebung: 'wackelig' }))}
            data-band-wiederholen={b.wiederholen}
          >
            Wiederholen? {b.wiederholen} {b.wiederholen === 1 ? 'Wort' : 'Wörter'}
          </Button>
        )}
        {b.neu > 0 && (
          <Button variant="subtle" radius="xl" size="sm" onClick={() => setLauf((l) => ({ n: l.n + 1, uebung: 'neu' }))} data-band-neu={b.neu}>
            Noch nicht gelernte Wörter lernen
          </Button>
        )}
      </Group>
      {/* Nur die Runde (als nächste Seite im Ordner) – kein zweiter Kasten unter dem Buch */}
      {lauf.uebung && (
        <VokabelTrainer key={`bd:${b.id}:${lauf.n}`} id={`bd:${b.id}`} eingebettet uebung={lauf.uebung} nurRunde nachRunde={nachRunde} beimUeben={melden} />
      )}
    </Stack>
  )
}

/** Kursliste wie bisher (ohne Lehrwerk mit Wörtern bzw. für Gäste): Umschalter und Trainer des gewählten Kurses */
export function KursRegister({ o, oben, startUebung = null }: { o: FachOrdner; oben: boolean; startUebung?: string | null }): React.JSX.Element {
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
          <VokabelTrainer key={kurs.id} id={kurs.id} eingebettet uebung={startUebung} />
        </div>
      )}
    </Stack>
  )
}

/**
 * Register „Vocabulary" für Konten: je Sprache des Fachs die Karte des aktuellen Bandes und der gemeinsame Kasten
 * (frühere Bände seit 12.10.2026 nur unter „Meine Bücher"). `startUebung` (aus der Adresse, z. B. vom Tipp der
 * Startseite): die Runde startet gleich – als nächste Seite im Ordner (VokabelTrainer, 12.10.2026).
 */
export function SprachRegister({ o, oben, startUebung }: { o: FachOrdner; oben: boolean; startUebung: string | null }): React.JSX.Element {
  const { sprachen, laden } = useSprachstand(o.fach)
  const [lauf, setLauf] = useState<{ n: number; uebung: string | null }>({ n: 0, uebung: startUebung })
  if (!sprachen) return <Loader size="sm" />
  const s = sprachen[0]
  // Ohne Lehrwerk mit Wörtern: wie bisher die Kurse (kein Weg, kein „Alles gelernt 0/0")
  if (!s || s.nurKurse) return <KursRegister o={o} oben={oben} startUebung={startUebung} />
  const starten = (): void => {
    window.scrollTo({ top: 0 })
    setLauf((l) => ({ n: l.n + 1, uebung: 'runde' }))
  }
  return (
    <Stack gap="md" data-sprach-register={s.sprache}>
      {oben && s.aktuell && <AktuellerBandKarte s={s} start={starten} />}
      {oben && !s.aktuell && (
        <Text size="sm" c="dimmed" data-kein-aktueller-band>
          In diesem Schuljahr ist noch nichts aus dem Buch freigegeben.
        </Text>
      )}
      <div data-sprach-kasten={s.sprache}>
        <VokabelTrainer key={`sp:${s.sprache}:${lauf.n}`} id={`sp:${s.sprache}`} eingebettet uebung={lauf.uebung} ohneKopf nachRunde={laden} />
      </div>
    </Stack>
  )
}
