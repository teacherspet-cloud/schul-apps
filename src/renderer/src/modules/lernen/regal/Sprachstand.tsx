/**
 * Vokabeln je Sprache (10.10.2026, Entscheidung der Lehrkraft „Option A"; Regeln shared/sprachstand.ts, Server
 * server/sprachstand.ts). Ersetzt die Seite „Mein Vokabelweg" und die Kurswahl im Register „Vocabulary":
 *
 *  - Karte AKTUELLER Band („Green Line 3 · Klasse 7"): Units als Stationen, die Abschnitte der aktuellen Unit als Punkte
 *    (Anteil sicher / im Aufbau / neu), „12 von 21 Abschnitten kennengelernt", EIN Knopf „Heute üben · N Wörter" (eine
 *    Runde über alle Kurse der Sprache). Spätere Units nur als „weitere Units folgen" – nichts Gesperrtes.
 *  - „Frühere Jahre": Cover mit „Klasse 6 · 2025/26", Medaille (Bronze/Silber/Gold) und „kennengelernt". Ein Band öffnet
 *    sich als nächste Seite im Ordner: ruhige Angebote „Wiederholen? N Wörter" und „Noch nicht gelernte Wörter lernen",
 *    darunter sein Kasten – nichts ist Pflicht, nichts rot.
 *  - Darunter der gemeinsame Kasten der Sprache (Karteikasten, Spiele) – der Trainer mit der Kennung „sp:<sprache>".
 *  - Ohne Lehrwerk mit Wörtern (eigene Listen, Platzhalter-Bände wie ¡Apúntate!): nur die Kursliste wie bisher.
 * Die Startseite zeigt je Sprache eine kleine Fassung der Karte (`StartVokabeln`).
 */
import { Button, Group, Loader, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconCheck, IconChevronRight, IconPlayerPlay } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { kursReiterNamen } from '@shared/ohneKlasse'
import { schuljahrText } from '@shared/schulkalender'
import { prozent, type AktuellerBand, type BandMedaille, type FruehererBand, type SprachStand, type StandZahlen } from '@shared/sprachstand'
import { holen } from '../../onlinetest/serverApi'
import { useAuffrischen } from '../../../shared/auffrischen'
import { BandCover } from '../../../shared/components/BandCover'
import VokabelTrainer from '../VokabelTrainer'
import { useBlaettern } from './blaettern'
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
.sk-karte { border-radius: 16px; padding: 14px 16px; background: var(--og-karte, var(--mantine-color-body)); box-shadow: 0 1px 0 rgba(0,0,0,.06), inset 4px 0 0 var(--sk-akzent, #1971c2); }
.sk-units { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sk-unit { font-size: .78rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid rgba(134,142,150,.45); display: inline-flex; align-items: center; gap: 4px; }
.sk-unit[data-lage="aktuell"] { background: var(--sk-akzent, #1971c2); border-color: transparent; color: #fff; }
.sk-unit[data-lage="kennen"] { opacity: .8; }
.sk-abschnitte { display: flex; flex-wrap: wrap; gap: 10px 12px; margin-top: 8px; }
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

/** „Klasse 7 · 2026/27" */
const jahrText = (t: BuecherTexte, klasse: number | null, schuljahr: number | null): string => t.jahrgang(klasse, schuljahr ? schuljahrText(schuljahr) : null)

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
      {b && !kompakt && (
        <Stack gap={8} mt="sm">
          {/* Units als Stationen – nur Freigegebenes; spätere als „weitere Units folgen" */}
          <div className="sk-units" data-units>
            {b.units.map((u) => {
              const kennen = u.abschnitte.every((x) => x.zahlen.gesamt > 0 && x.zahlen.kennengelernt >= x.zahlen.gesamt)
              const lage = u.unit === aktUnit?.unit ? 'aktuell' : kennen ? 'kennen' : 'offen'
              return (
                <span key={u.unit} className="sk-unit" data-lage={lage} data-unit={u.unit}>
                  {kennen && <IconCheck size={12} />}
                  {u.unit}
                </span>
              )
            })}
            {b.weitereUnits > 0 && (
              <Text size="xs" c="dimmed" data-weitere-units={b.weitereUnits}>
                · weitere Units folgen
              </Text>
            )}
          </div>
          {aktUnit && (
            <div className="sk-abschnitte" data-abschnitt-punkte={aktUnit.abschnitte.length}>
              {aktUnit.abschnitte.map((x) => (
                <div key={x.key} className="sk-abschnitt" title={`${x.name}: ${x.zahlen.kennengelernt} von ${x.zahlen.gesamt} kennengelernt, ${x.zahlen.sicher} sicher`}>
                  <AbschnittRing z={x.zahlen} />
                  <span className="sk-abschnitt-name">{kurz(x.name)}</span>
                </div>
              ))}
            </div>
          )}
          <StandKreise z={b.zahlen} t={t} balken />
        </Stack>
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

/** Regal „Frühere Jahre": Cover mit Klasse und Schuljahr, Medaille, sicher und kennengelernt */
export function FruehereJahre({ s, oeffnen }: { s: SprachStand; oeffnen: (b: FruehererBand) => void }): React.JSX.Element | null {
  const t = BUECHER_DEUTSCH
  if (!s.frueher.length) return null
  return (
    <Stack gap={6} data-fruehere-jahre={s.frueher.length}>
      <style>{SPRACH_CSS}</style>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '.06em' }}>
        {t.fruehereJahre}
      </Text>
      <div className="sk-bord">
        {s.frueher.map((b) => (
          <button key={b.id} type="button" className="sk-buch" onClick={() => oeffnen(b)} data-frueherer-band={b.id} data-medaille-stufe={b.medaille ?? ''}>
            <span className="sk-cover">
              <BandCover band={b} land={b.stateId ?? ''} breite={60} />
              {b.medaille && (
                <span className="sk-medaille">
                  <BandMedailleBild m={b.medaille} />
                </span>
              )}
            </span>
            <span className="sk-buch-name">{b.name}</span>
            <span className="sk-buch-zeile">{jahrText(t, b.klasse, b.schuljahr)}</span>
            {b.zahlen.kennengelernt > 0 ? (
              <span className="sk-buch-zeile" data-band-prozent={`${prozent(b.zahlen.sicher, b.zahlen.gesamt)}/${prozent(b.zahlen.kennengelernt, b.zahlen.gesamt)}`}>
                {t.sicherP(prozent(b.zahlen.sicher, b.zahlen.gesamt))} · {t.kennenP(prozent(b.zahlen.kennengelernt, b.zahlen.gesamt))}
              </span>
            ) : (
              <span className="sk-buch-zeile">{t.woerter(b.zahlen.gesamt)}</span>
            )}
          </button>
        ))}
      </div>
    </Stack>
  )
}

/** Ein früherer Band als Seite im Ordner: ruhige Angebote und sein Kasten */
function FruehererBandSeite({ b }: { b: FruehererBand }): React.JSX.Element {
  const t = BUECHER_DEUTSCH
  const [lauf, setLauf] = useState<{ n: number; uebung: string | null }>({ n: 0, uebung: null })
  const p = prozent(b.zahlen.sicher, b.zahlen.gesamt)
  return (
    <Stack gap="sm" data-band-seite={b.id}>
      <style>{SPRACH_CSS}</style>
      <Group gap="md" wrap="nowrap" align="flex-start">
        <span className="sk-cover">
          <BandCover band={b} land={b.stateId ?? ''} breite={56} />
          {b.medaille && (
            <span className="sk-medaille">
              <BandMedailleBild m={b.medaille} groesse={26} />
            </span>
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <Text fw={800} size="lg" lh={1.2}>
            {b.name}
          </Text>
          <Text size="sm" c="dimmed">
            {jahrText(t, b.klasse, b.schuljahr)}
          </Text>
          <Text size="sm" mt={4}>
            {b.medaille ? `${MEDAILLE_NAME[b.medaille]} · ` : ''}
            {t.sicherP(p)} · {t.kennenP(prozent(b.zahlen.kennengelernt, b.zahlen.gesamt))}
          </Text>
          {b.naechste && (
            <Text size="xs" c="dimmed" data-naechste-medaille={b.naechste.medaille}>
              Noch {b.naechste.fehlen} sichere {b.naechste.fehlen === 1 ? 'Wort' : 'Wörter'} bis {MEDAILLE_NAME[b.naechste.medaille]}.
            </Text>
          )}
        </div>
      </Group>
      <StandKreise z={b.zahlen} t={t} balken />
      <Group gap="xs">
        {b.wiederholen > 0 && (
          <Button variant="light" radius="xl" size="sm" onClick={() => setLauf((l) => ({ n: l.n + 1, uebung: 'wackelig' }))} data-band-wiederholen={b.wiederholen}>
            Wiederholen? {b.wiederholen} {b.wiederholen === 1 ? 'Wort' : 'Wörter'}
          </Button>
        )}
        {b.neu > 0 && (
          <Button variant="subtle" radius="xl" size="sm" onClick={() => setLauf((l) => ({ n: l.n + 1, uebung: 'neu' }))} data-band-neu={b.neu}>
            Noch nicht gelernte Wörter lernen
          </Button>
        )}
      </Group>
      <VokabelTrainer key={`bd:${b.id}:${lauf.n}`} id={`bd:${b.id}`} eingebettet uebung={lauf.uebung} />
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
 * Register „Vocabulary" für Konten: je Sprache des Fachs die Karte des aktuellen Bandes, „Frühere Jahre" und der
 * gemeinsame Kasten. `startUebung` (aus der Adresse, z. B. vom Tipp der Startseite): die Runde startet gleich.
 */
export function SprachRegister({ o, oben, startUebung }: { o: FachOrdner; oben: boolean; startUebung: string | null }): React.JSX.Element {
  const { sprachen, laden } = useSprachstand(o.fach)
  const blaettern = useBlaettern()
  const [band, setBand] = useState<FruehererBand | null>(null)
  const [lauf, setLauf] = useState<{ n: number; uebung: string | null }>({ n: 0, uebung: startUebung })
  const [kurseOffen, setKurseOffen] = useState(false)
  if (!sprachen) return <Loader size="sm" />
  const s = sprachen[0]
  // Ohne Lehrwerk mit Wörtern: wie bisher die Kurse (kein Weg, kein „Alles gelernt 0/0")
  if (!s || s.nurKurse) return <KursRegister o={o} oben={oben} startUebung={startUebung} />
  if (band) return <FruehererBandSeite b={band} />
  const oeffnen = (b: FruehererBand): void => {
    if (!blaettern) return setBand(b)
    blaettern.oeffne('band', () => setBand(b), () => (setBand(null), laden()), `${window.location.pathname}?r=vok&band=${encodeURIComponent(b.id)}`)
  }
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
      {oben && <FruehereJahre s={s} oeffnen={oeffnen} />}
      <div data-sprach-kasten={s.sprache}>
        <VokabelTrainer key={`sp:${s.sprache}:${lauf.n}`} id={`sp:${s.sprache}`} eingebettet uebung={lauf.uebung} ohneKopf nachRunde={laden} />
      </div>
      {oben && s.kurse.length > 0 && (
        <Stack gap={4}>
          <UnstyledButton onClick={() => setKurseOffen((x) => !x)} aria-expanded={kurseOffen} data-einzelne-kurse>
            <Text size="sm" c="dimmed" fw={600}>
              {kurseOffen ? '▾' : '▸'} Einzelne Kurse ({s.kurse.length})
            </Text>
          </UnstyledButton>
          {kurseOffen &&
            o.vokabeln
              .filter((v) => s.kurse.some((k) => k.id === v.id))
              .map((v) => (
                <a key={v.id} className="og-karte" href={`/s/v/${v.id}`} data-ordner-kurs="vokabeln">
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600} size="sm">
                      {v.titel}
                    </Text>
                    <IconChevronRight size={16} />
                  </Group>
                </a>
              ))}
        </Stack>
      )}
    </Stack>
  )
}

/** Startseite: je Sprache die kleine Karte mit „Heute üben" (führt in den Fachordner und startet die Runde) */
export function StartVokabeln({ sprachen, ohneKnopf = false }: { sprachen: SprachStand[] | null; ohneKnopf?: boolean }): React.JSX.Element | null {
  const liste = (sprachen ?? []).filter((s) => !s.nurKurse && s.aktuell)
  if (!liste.length) return null
  return (
    <Stack gap="sm" data-start-vokabeln={liste.length}>
      {liste.map((s) => (
        <AktuellerBandKarte key={s.sprache} s={s} kompakt ohneKnopf={ohneKnopf} href={`/s/ordner/${encodeURIComponent(s.fach)}?r=vok&uebung=runde`} />
      ))}
    </Stack>
  )
}
