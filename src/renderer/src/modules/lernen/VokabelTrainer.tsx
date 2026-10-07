/**
 * Vokabeltrainer für Lernende (03.10.2026, /s/v/<ID>; Regeln: shared/vokabeltrainer.ts, Server: src/server/vokabeln.ts).
 *
 * Kasten-Ansicht mit den Fächern (füllt sich sichtbar), „Heute fällig" und Testtermin. Eine Sitzung:
 * fällige Wörter zuerst, dann höchstens 10 neue. Erstkontakt als Lernkarte (umdrehen per Wischen,
 * Ziehen oder Tippen; Aussprache; Nachsprechen), danach immer objektiv: Auswahl, Hören, Buchstaben
 * legen, frei schreiben (mit Akzentleiste), Diktat, Lückensatz. Falsches kommt in der Sitzung wieder.
 * Ruhig motivierend: keine Streaks, keine Bestenlisten.
 */
import { aufnahmeSpielen, hatSatzAufnahme, medienLaden } from './medienCache'
import { Spielwahl } from './spiele/Spiele'
import { VokabelLeiter, type WegKurz } from './VokabelLeiter'
import { besteStimme, stimmeVorhanden } from './stimme'
import type { VerbSprache } from '@shared/verben'
import { formPasst, formSpalten, sprechtext, verbSchluesselVonWort, type VerbKarte } from '@shared/verbTraining'
import { useVerbDaten } from './verbDaten'
import { useVtFarbe, VtFarbe, vtFarben } from './vtFarben'
import { useComputedColorScheme, useMantineTheme } from '@mantine/core'
import { useDarstellung } from '../onlinetest/SchuelerEinstellungen'
import { tempoFaktor, ton } from '../onlinetest/schuelerDarstellung'
import { fachFarbeAus } from '../../shared/fachfarben'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Popover,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import {
  IconArrowLeft,
  IconArrowUp,
  IconBackspace,
  IconCalendarEvent,
  IconCheck,
  IconFlame,
  IconMicrophone,
  IconPlayerPlay,
  IconShieldCheck,
  IconStairsUp,
  IconVolume,
  IconX
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { falschschreibungen } from '@shared/vokabelFehler'
import {
  auswahlFsOptionen,
  auswahlOptionen,
  buchstaben,
  mitLeerzeichen,
  lueckenMuster,
  paarFuer,
  istSicher,
  ohneAngaben,
  STUFEN,
  satzMitLuecke,
  sitzungsWoerter,
  uebersicht,
  uebungFuer,
  varianten,
  type Uebung,
  type Urteil,
  type Vokabel,
  type WortStand
} from '@shared/vokabeltrainer'
import { holen, senden } from '../onlinetest/serverApi'

interface Liste {
  id: string
  titel: string
  sprache: string
  fach: string
  testTermin: number | null
  woerter: Vokabel[]
  staende: Record<string, WortStand>
  rekorde?: Record<string, number>
  ansehen?: string[]
  /** Fachfarbe des Kopfbands (Einstellung der Lehrkraft) */
  farbe?: string | null
  /** Klasse der Lernenden (Bildstufe der Beispielbilder, 07.10.2026) */
  klasse?: number | null
  /** Unregelmäßige Verben der Liste (07.10.2026) – Stammformen-Nachfrage und Verbspiele */
  verben?: { sprache: VerbSprache; karten: VerbKarte[] } | null
  /** Vokabelweg (03.10.2026): die Freischalt-Leiter */
  weg?: WegKurz
}

const STIMME: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  ru: 'ru-RU',
  pl: 'pl-PL',
  tr: 'tr-TR',
  zh: 'zh-CN',
  cs: 'cs-CZ'
}
const AKZENTE: Record<string, string[]> = {
  fr: ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'û', 'ù', 'î', 'ï', 'ë', 'œ'],
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
  pt: ['á', 'â', 'ã', 'à', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú'],
  la: ['ā', 'ē', 'ī', 'ō', 'ū'],
  tr: ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü']
}
/*
 * Farbschema (03.10.2026, Wunsch der Lehrkraft: ansprechender, besonders die Farben): warmes Orange
 * wie das App-Symbol als Leitfarbe, die Fächer als ruhige Folge von warm (neu, noch unsicher) nach
 * kühl (sicher) – statt Ampel-Rot und Grau.
 */
const FACH_FARBEN = ['#cbd5e1', '#fb923c', '#fbbf24', '#facc15', '#a3e635', '#34d399', '#14b8a6']

/**
 * Vorlesen: zuerst die Aufnahme aus der Medienbank (Sprach-KI, 05.10.2026, medienCache.ts), sonst mit der
 * Stimme des Geräts (kostenlos, ohne Server).
 */
/** Kann das Gerät diese Sprache vorlesen? (Hörspiele ohne Aufnahme, 07.10.2026) */
export const kannSprechen = (sprache: string): boolean => {
  try {
    return 'speechSynthesis' in window && Boolean(STIMME[sprache]) && stimmeVorhanden(STIMME[sprache])
  } catch {
    return false
  }
}

export function sprich(text: string, sprache: string): void {
  if (aufnahmeSpielen(text)) return
  try {
    if (!('speechSynthesis' in window) || !STIMME[sprache]) return
    window.speechSynthesis.cancel()
    // Ohne Angaben wie „[pl]" oder „(irr)" – die werden nicht mitgesprochen
    // Gezielt die beste Stimme der Sprache (stimme.ts) – ohne passende Stimme lieber nichts als falsch
    const stimme = besteStimme(STIMME[sprache])
    if (!stimme) return
    const u = new SpeechSynthesisUtterance(ohneAngaben(text).replace(/\([^)]*\)/g, ''))
    u.voice = stimme
    u.lang = stimme.lang
    // Sprechtempo aus den Einstellungen der Lernenden (06.10.2026)
    u.rate = 0.85 * tempoFaktor()
    window.speechSynthesis.speak(u)
  } catch {
    // ohne Sprachausgabe geht es auch
  }
}

export const CSS = `
.vt-kopf { position: relative; overflow: hidden; border-radius: 22px; padding: 22px 22px 20px; color: var(--vt-auf-a);
  background: radial-gradient(120% 140% at 100% 0%, var(--vt-a-zart) 0%, var(--vt-a-mittel) 38%, var(--vt-a-tief) 100%); box-shadow: 0 14px 30px var(--vt-schatten); }
.vt-kopf::after { content: ''; position: absolute; right: -40px; bottom: -60px; width: 200px; height: 200px; border-radius: 50%; background: rgba(255,255,255,0.12); }
.vt-kopf-zeile { display: flex; align-items: center; justify-content: space-between; gap: 16px; position: relative; z-index: 1; }
.vt-ring { flex: none; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; }
.vt-ring-innen { width: 70px; height: 70px; border-radius: 50%; background: var(--vt-flaeche); color: var(--vt-a-dunkel); display: grid; place-items: center; text-align: center; line-height: 1.05; }
.vt-kasten { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; align-items: end; padding: 14px 14px 18px; border-radius: 20px; background: var(--vt-a-hell);
  border: 1px solid var(--vt-a-rand); box-shadow: inset 0 -5px 0 var(--vt-a-rand2); }
.vt-fach { border: 0; padding: 0; font: inherit; cursor: pointer; border-radius: 12px 12px 8px 8px; background: var(--vt-flaeche); position: relative; overflow: hidden; min-height: 104px;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 6px; border: 1px solid var(--vt-a-rand2); }
.vt-fach-fuellung { position: absolute; left: 0; right: 0; bottom: 0; transition: height .6s cubic-bezier(.2,.8,.2,1); opacity: .9;
  background-image: repeating-linear-gradient(180deg, rgba(255,255,255,0) 0 6px, rgba(255,255,255,0.45) 6px 7px); }
.vt-fach-zahl { position: relative; font-weight: 800; font-size: 1.2rem; color: var(--vt-tinte); background: var(--vt-flaeche); border-radius: 8px; padding: 0 7px; line-height: 1.5; box-shadow: 0 1px 2px rgba(0,0,0,0.12); }
.vt-fach-name { position: relative; font-size: .68rem; font-weight: 700; color: var(--vt-tinte); background: var(--vt-flaeche); border-radius: 6px; padding: 1px 5px; margin-top: 3px;
  max-width: calc(100% - 6px); text-align: center; line-height: 1.15; hyphens: manual; overflow-wrap: anywhere; }
.vt-fach-wieder { position: relative; font-size: .6rem; color: var(--vt-leise); background: var(--vt-flaeche); border-radius: 6px; padding: 0 4px; margin-top: 2px; white-space: nowrap; }
.vt-fach-plus { position: absolute; top: 6px; right: 6px; z-index: 2; font-size: .7rem; font-weight: 800; border-radius: 999px; padding: 1px 6px;
  background: var(--vt-gut-bg); color: var(--vt-gut-text); border: 1px solid var(--vt-gut-rand); animation: vt-plus 1.2s ease-out; }
.vt-fach.zuwachs { animation: vt-zuwachs 1.4s ease-out 2; }
@keyframes vt-plus { 0% { transform: translateY(14px) scale(.6); opacity: 0 } 40% { transform: translateY(-4px) scale(1.1); opacity: 1 } 100% { transform: none } }
@keyframes vt-zuwachs { 0%, 100% { box-shadow: 0 0 0 0 transparent } 40% { box-shadow: 0 0 0 4px var(--vt-gut-rand) } }
.vt-aufstieg { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 10px; background: var(--vt-gut-bg); color: var(--vt-gut-text);
  border: 1px solid var(--vt-gut-rand); font-weight: 600; font-size: .85rem; animation: vt-steigen .7s cubic-bezier(.2,.8,.2,1) both; }
@keyframes vt-steigen { from { transform: translateY(18px); opacity: 0 } to { transform: none; opacity: 1 } }
@media (max-width: 560px) { .vt-kasten { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.vt-werte { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.vt-wert { border-radius: 16px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; background: var(--vt-flaeche); border: 1px solid var(--vt-linie); box-shadow: 0 2px 10px rgba(15,23,42,0.05); }
.vt-wert-symbol { flex: none; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; }
.vt-los { background: linear-gradient(90deg, var(--vt-a-mittel), var(--vt-a-tief)) !important; color: var(--vt-auf-a) !important; box-shadow: 0 10px 22px var(--vt-schatten); border: 0 !important; }
.vt-los:hover { filter: brightness(1.05); }
.vt-buehne { background: var(--vt-flaeche); border-radius: 22px; padding: 22px 16px; border: 1px solid var(--vt-linie); box-shadow: 0 6px 24px rgba(15,23,42,0.06); }
.vt-frage { font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; color: var(--vt-a-dunkel); font-weight: 700; }
.vt-option { border: 2px solid var(--vt-a-rand2) !important; background: var(--vt-flaeche) !important; color: var(--vt-tinte) !important; transition: transform .12s, border-color .12s; }
.vt-option:hover { border-color: var(--vt-a) !important; transform: translateY(-1px); }
.vt-option[data-zustand="richtig"] { background: var(--vt-gut-bg) !important; border-color: var(--vt-gut-rand) !important; color: var(--vt-gut-text) !important; }
.vt-option[data-zustand="falsch"] { background: var(--vt-schlecht-bg) !important; border-color: var(--vt-schlecht-rand) !important; color: var(--vt-schlecht-text) !important; }
.vt-karte-buehne { perspective: 1200px; width: 100%; max-width: 440px; height: 260px; margin: 0 auto; touch-action: pan-y; }
.vt-karte { position: relative; width: 100%; height: 100%; transition: transform .55s cubic-bezier(.2,.8,.2,1); transform-style: preserve-3d; cursor: grab; }
.vt-karte.umgedreht { transform: rotateY(180deg); }
.vt-seite { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 20px; padding: 20px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--vt-tinte);
  background: linear-gradient(160deg, var(--vt-flaeche), var(--vt-a-hell)); border: 1px solid var(--vt-a-rand); box-shadow: 0 14px 30px var(--vt-schatten); }
.vt-seite.hinten { transform: rotateY(180deg); background: linear-gradient(160deg, var(--vt-flaeche), var(--vt-gut-bg)); border-color: var(--vt-gut-rand); }
.vt-seite::before { content: ''; position: absolute; left: 0; right: 0; top: 46px; border-top: 2px solid var(--vt-a-rand); }
.vt-kachel { min-width: 42px; height: 46px; font-size: 1.2rem; font-weight: 700; border-radius: 12px !important; background: var(--vt-a-hell) !important; color: var(--vt-a-dunkel) !important;
  border: 2px solid var(--vt-a-rand) !important; box-shadow: 0 3px 0 var(--vt-a-zart); }
.vt-kachel:disabled { opacity: .35; box-shadow: none; }
.vt-gelegt { border: 2px dashed var(--vt-a-zart); border-radius: 16px; background: var(--vt-a-hell); min-width: 240px; min-height: 60px; display: grid; place-items: center; padding: 6px 14px; }
@keyframes vt-rein { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: none } }
.vt-rein { animation: vt-rein .35s ease-out; }
@media (prefers-reduced-motion: reduce) { .vt-karte, .vt-fach-fuellung { transition: none } .vt-rein, .vt-fach.zuwachs, .vt-fach-plus, .vt-aufstieg { animation: none } }
`

export default function VokabelTrainer({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<Liste | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  const [sitzung, setSitzung] = useState<Vokabel[] | null>(null)
  const [vorher, setVorher] = useState<Record<string, WortStand> | null>(null)
  const laden = useCallback(() => {
    void holen<Liste>(`/s/api/vokabeln/liste?id=${encodeURIComponent(id)}`).then(
      async (liste) => {
        // Medienbank: Aussprache und Beispielbilder (05.10.2026) – ein fehlendes Bild kommt aus der Medienbank
        const m = await medienLaden(
          liste.sprache,
          liste.woerter.map((w) => w.term),
          liste.klasse
        )
        setD({ ...liste, woerter: liste.woerter.map((w) => (w.bild || !m[w.term]?.bild?.url ? w : { ...w, bild: m[w.term]!.bild!.url })) })
      },
      (e: unknown) => {
        setFehler(e instanceof Error ? e.message : String(e))
        setD(null)
      }
    )
  }, [id])
  useEffect(laden, [laden])
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Diese Vokabeln gibt es nicht.'}</Alert>
  return (
    <TrainerFarben fach={d.fach} fachFarbe={d.farbe}>
      {sitzung ? (
        <Sitzung d={d} woerter={sitzung} fertig={(st) => (setVorher(d.staende), setD({ ...d, staende: st }), setSitzung(null))} />
      ) : (
        <Kasten d={d} starten={(w) => (setVorher(null), setSitzung(w))} aktualisieren={(r) => setD({ ...d, ...r })} vorher={vorher} />
      )}
    </TrainerFarben>
  )
}

/**
 * Farbhülle (03.10.2026): Fachfarbe des Kopfbands (vom Server: Einstellung der Lehrkraft) oder die eigene
 * Farbe der Lernenden (Einstellungen › Farben im Vokabeltraining), hell oder dunkel wie eingestellt.
 */
export function TrainerFarben({ fach, fachFarbe, children }: { fach: string; fachFarbe?: string | null; children: React.ReactNode }): React.JSX.Element {
  const { d } = useDarstellung()
  const theme = useMantineTheme()
  const dunkel = useComputedColorScheme('light') === 'dark'
  const akzent = d.design === 'eigen' ? (theme.colors[d.farbe]?.[7] ?? '#1971c2') : fachFarbe || fachFarbeAus(fach, undefined) || '#ea580c'
  const farben = useMemo(() => vtFarben(akzent, dunkel), [akzent, dunkel])
  return (
    <VtFarbe.Provider value={farben}>
      <div className="vt-farben" style={farben.variablen as React.CSSProperties} data-vt-akzent={farben.a} data-vt-dunkel={dunkel ? '' : undefined}>
        {children}
      </div>
    </VtFarbe.Provider>
  )
}

function Kasten({
  d,
  starten,
  aktualisieren,
  vorher
}: {
  d: Liste
  starten: (w: Vokabel[]) => void
  aktualisieren: (r: { rekorde: Record<string, number>; ansehen: string[] }) => void
  /** Stand vor der letzten Runde (für den Aufstieg) */
  vorher?: Record<string, WortStand> | null
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const u = uebersicht(d.woerter, d.staende)
  const heute = sitzungsWoerter(d.woerter, d.staende)
  const max = Math.max(1, ...u.faecher)
  const tage = d.testTermin ? Math.ceil((d.testTermin - Date.now()) / 86_400_000) : null
  const anteil = Math.round((u.sicher / Math.max(1, u.gesamt)) * 100)
  // Während eines Spiels nur das Spiel zeigen
  const [spielt, setSpielt] = useState(false)
  // Nach einer Runde: wie viele Wörter sind in jedes Fach dazugekommen? (Aufstieg sichtbar machen)
  const zuwachs = useMemo(() => {
    if (!vorher) return [0, 0, 0, 0, 0, 0, 0]
    const alt = uebersicht(d.woerter, vorher).faecher
    return u.faecher.map((n, i) => (i > 0 ? Math.max(0, n - alt[i]) : 0))
  }, [vorher, d.woerter, u.faecher])
  /*
   * Verbspiele (07.10.2026): nur Verben, deren Vokabel schon im Kasten eingeführt ist; geschrieben statt gewählt ab
   * Fach 3 der Vokabel (abgestimmt).
   */
  const fachDesVerbs = (k: VerbKarte): number => {
    const w = d.woerter.find((x) => verbSchluesselVonWort(x.term) === k.schluessel.toLowerCase())
    return w ? (d.staende[w.id]?.fach ?? 0) : 0
  }
  const bekannteVerben = useMemo(() => (d.verben?.karten ?? []).filter((k) => fachDesVerbs(k) >= 1), [d.verben, d.staende]) // eslint-disable-line react-hooks/exhaustive-deps
  const verbDaten = useVerbDaten(bekannteVerben, d.verben?.sprache, d.klasse, (k) => fachDesVerbs(k) >= 3)
  const ich = window.__schulappsServer
  // Gäste (per QR-Code) haben keinen Lernraum – zurück zu ihrer Übersicht
  const gast = !ich?.angemeldet || ich.quelle === 'gast'
  // Keine Stimme der Sprache auf dem Gerät: Hinweis statt stiller oder falscher Aussprache (Stimmen laden nachträglich)
  const [ohneStimme, setOhneStimme] = useState(false)
  useEffect(() => {
    if (!STIMME[d.sprache] || !('speechSynthesis' in window)) return
    const t = setTimeout(() => setOhneStimme(!besteStimme(STIMME[d.sprache])), 1500)
    return () => clearTimeout(t)
  }, [d.sprache])
  const werte: { name: string; wert: string; farbe: string; symbol: React.ReactNode }[] = [
    { name: 'sicher', wert: `${u.sicher} / ${u.gesamt}`, farbe: '#14b8a6', symbol: <IconShieldCheck size={20} /> },
    { name: 'heute fällig', wert: String(heute.length), farbe: farbe.a, symbol: <IconFlame size={20} /> },
    { name: 'im Aufbau', wert: String(u.imAufbau), farbe: '#f59e0b', symbol: <IconStairsUp size={20} /> },
    {
      name: 'Test',
      wert: tage !== null && tage >= 0 ? (tage === 0 ? 'heute' : `in ${tage} T.`) : '–',
      farbe: '#8b5cf6',
      symbol: <IconCalendarEvent size={20} />
    }
  ]
  return (
    <Stack className="vt" data-vokabel-kasten gap="lg">
      <style>{CSS}</style>
      <Button variant="subtle" color={farbe.a} component="a" href={gast ? '/s/' : '/s/lernen'} w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        {gast ? 'Meine Materialien' : 'Lernraum'}
      </Button>
      {!spielt && (
        <>
          <div className="vt-kopf">
            <div className="vt-kopf-zeile">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} style={{ opacity: 0.9 }}>
                  {d.fach} · {d.woerter.length} Vokabeln
                </Text>
                <Title order={2} style={{ color: 'var(--vt-auf-a)', lineHeight: 1.15 }}>
                  {d.titel}
                </Title>
                <Text size="sm" mt={6} style={{ opacity: 0.92 }}>
                  {heute.length ? `${heute.length} ${heute.length === 1 ? 'Wort wartet' : 'Wörter warten'} heute auf dich.` : 'Für heute ist alles geübt.'}
                </Text>
              </div>
              <div
                className="vt-ring"
                style={{ background: `conic-gradient(#fff ${anteil * 3.6}deg, rgba(255,255,255,0.28) 0deg)` }}
                aria-label={`${anteil} Prozent sicher`}
              >
                <div className="vt-ring-innen">
                  <div>
                    <Text fw={800} size="lg" lh={1}>
                      {anteil}%
                    </Text>
                    <Text size="10px" fw={600}>
                      sicher
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {d.weg && <VokabelLeiter weg={d.weg} />}
          <div>
            <Text size="sm" fw={700} mb={6} c="var(--vt-a-dunkel)">
              Dein Karteikasten
            </Text>
            <div className="vt-kasten" aria-label="Dein Karteikasten">
              {u.faecher.map((n, i) => (
                <Popover key={i} width={250} position="bottom" withArrow shadow="md">
                  <Popover.Target>
                    <button
                      type="button"
                      className={`vt-fach ${zuwachs[i] > 0 ? 'zuwachs' : ''}`}
                      data-fach={i}
                      aria-label={`${STUFEN[i].name}: ${n} ${n === 1 ? 'Wort' : 'Wörter'}`}
                    >
                      <div
                        className="vt-fach-fuellung"
                        style={{ height: `${n ? 18 + (n / max) * 62 : 0}%`, backgroundColor: i === 0 && farbe.dunkel ? '#4b5563' : FACH_FARBEN[i] }}
                      />
                      {zuwachs[i] > 0 && (
                        <span className="vt-fach-plus" data-fach-zuwachs={i}>
                          +{zuwachs[i]}
                        </span>
                      )}
                      <span className="vt-fach-zahl">{n}</span>
                      <span className="vt-fach-name">{STUFEN[i].kurz}</span>
                      {i > 0 && <span className="vt-fach-wieder">↻ {STUFEN[i].wieder.replace(/^in /, '')}</span>}
                    </button>
                  </Popover.Target>
                  <Popover.Dropdown data-fach-erklaerung={i}>
                    <Text fw={800} c={FACH_FARBEN[i] === '#cbd5e1' ? undefined : FACH_FARBEN[i]}>
                      {STUFEN[i].name}
                    </Text>
                    <Text size="sm" mt={4}>
                      {STUFEN[i].hinein}
                    </Text>
                    <Text size="sm" c="dimmed" mt={6}>
                      {n} {n === 1 ? 'Wort' : 'Wörter'} · {i === 0 ? 'werden nach und nach eingeführt' : `kommen ${STUFEN[i].wieder} wieder`}
                    </Text>
                    {i > 0 && i < 6 && (
                      <Text size="xs" c="dimmed" mt={6}>
                        Richtig → „{STUFEN[i + 1].name}“. Falsch → zwei Stufen zurück{i > 2 ? ` („${STUFEN[Math.max(1, i - 2)].name}“)` : ''}.
                      </Text>
                    )}
                  </Popover.Dropdown>
                </Popover>
              ))}
            </div>
          </div>
          <div className="vt-werte">
            {werte.map((w) => (
              <div key={w.name} className="vt-wert">
                <div className="vt-wert-symbol" style={{ background: `${w.farbe}1f`, color: w.farbe }}>
                  {w.symbol}
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    {w.name}
                  </Text>
                  <Text fw={800} size="lg" lh={1.2} c="var(--vt-tinte)">
                    {w.wert}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {heute.length ? (
        <Button size="xl" radius="xl" className="vt-los" leftSection={<IconPlayerPlay size={22} />} onClick={() => starten(heute)} data-vokabel-start>
          Jetzt üben · {heute.length} {heute.length === 1 ? 'Wort' : 'Wörter'}
        </Button>
      ) : (
        <>
          {!spielt && (
            <Alert color="teal" radius="lg" icon={<IconCheck />}>
              Für heute ist alles erledigt. Der Kasten meldet sich, wenn die nächsten Wörter fällig sind.
            </Alert>
          )}
          {/* Spiele mit den gelernten Wörtern (03.10.2026, abgestimmt) */}
          <Spielwahl
            woerter={d.woerter}
            staende={d.staende}
            sprache={d.sprache}
            rekorde={d.rekorde ?? {}}
            ansehen={d.ansehen ?? []}
            listeId={d.id}
            aktualisieren={aktualisieren}
            spielt={setSpielt}
            verben={verbDaten}
          />
        </>
      )}
      {ohneStimme && (
        <Alert color="yellow" radius="lg" data-ohne-stimme>
          Auf diesem Gerät ist keine Stimme für diese Sprache installiert – deshalb wird nichts vorgelesen. Am Computer: Einstellungen › Zeit und Sprache ›
          Sprache › Sprache hinzufügen (mit Sprachausgabe). Am iPad: Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen.
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        So funktioniert der Kasten: Richtig gewusst steigt ein Wort eine Stufe auf (Neu → Angefangen → Wiedererkannt → Geübt → Gefestigt → Gekonnt → Im
        Langzeitgedächtnis) und kommt später wieder; falsch geht es zwei Stufen zurück. Tippe ein Fach an, um zu sehen, wie ein Wort hineinkommt. „Sicher“ ist
        ein Wort, wenn du es zweimal im Abstand von einer Woche richtig geschrieben hast.
      </Text>
    </Stack>
  )
}

interface Ergebnis {
  urteil: Urteil
  hinweis?: string
  richtig: string
  stand: WortStand
  sicher: boolean
}

function Sitzung({ d, woerter, fertig }: { d: Liste; woerter: Vokabel[]; fertig: (st: Record<string, WortStand>) => void }): React.JSX.Element {
  const farbe = useVtFarbe()
  const [warteschlange, setWarteschlange] = useState<Vokabel[]>(woerter)
  const [staende, setStaende] = useState<Record<string, WortStand>>(d.staende)
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [zaehler, setZaehler] = useState({ richtig: 0, gesamt: 0, wiederholt: new Map<string, number>() })
  const [laeuft, setLaeuft] = useState(false)
  // Zählt die gestellten Fragen: Die Übungsart gilt für eine Frage und wechselt erst mit „Weiter"
  const [frage, setFrage] = useState(0)
  const v = warteschlange[0]
  const st = v
    ? (staende[v.id] ?? ({ fach: 0, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 0, falsch: 0, fehlerTexte: [], zuletzt: 0 } as WortStand))
    : null
  /*
   * Befund 03.10.2026: Nach einer Antwort änderte sich der Lernstand – und damit sofort die Übungsart
   * desselben Worts (z. B. Lernkarte → Buchstaben legen). Die neue Übung stand schon gesperrt da, darunter
   * „Richtig". Deshalb wird die Übung nur beim Wechsel der Frage bestimmt.
   */
  const uebung = useMemo<Uebung>(() => (v && st ? uebungFuer(st, v) : 'karte'), [v?.id, frage]) // eslint-disable-line react-hooks/exhaustive-deps
  const verbKarte = v ? d.verben?.karten.find((k) => k.schluessel.toLowerCase() === verbSchluesselVonWort(v.term)) : undefined

  const antworten = async (wert: { antwort?: string; gewusst?: boolean; gezeigt?: string }): Promise<void> => {
    if (!v || laeuft) return
    setLaeuft(true)
    try {
      const e = await senden<Ergebnis>('/s/api/vokabeln/antwort', { id: d.id, wortId: v.id, uebung, ...wert })
      setStaende((s) => ({ ...s, [v.id]: e.stand }))
      setErgebnis(e)
      setZaehler((z) => ({ ...z, richtig: z.richtig + (e.urteil === 'richtig' ? 1 : 0), gesamt: z.gesamt + 1 }))
      // Töne (Einstellungen › Lernen, 06.10.2026): nur bei „richtig“ – Fehler bleiben still
      if (e.urteil === 'richtig') ton('richtig')
    } finally {
      setLaeuft(false)
    }
  }
  const weiter = (): void => {
    if (!v || !ergebnis) return
    const n = zaehler.wiederholt.get(v.id) ?? 0
    // Falsch/fast: in dieser Sitzung noch einmal (höchstens zweimal), nach ein paar anderen Wörtern
    const nochmal = ergebnis.urteil !== 'richtig' && n < 2
    const rest = warteschlange.slice(1)
    if (nochmal) {
      zaehler.wiederholt.set(v.id, n + 1)
      rest.splice(Math.min(3, rest.length), 0, v)
    }
    setWarteschlange(rest)
    setErgebnis(null)
    setFrage((f) => f + 1)
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && ergebnis) {
        e.preventDefault()
        weiter()
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })

  // Wörter, die in dieser Runde mindestens eine Stufe aufgestiegen sind
  const aufgestiegen = woerter
    .filter((w, k, l) => l.findIndex((x) => x.id === w.id) === k)
    .map((w) => ({ v: w, vor: d.staende[w.id]?.fach ?? 0, nach: Math.min(6, staende[w.id]?.fach ?? 0) }))
    .filter((x) => x.nach > x.vor)
  if (!v)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-sitzung-fertig>
        <style>{CSS}</style>
        <div
          className="vt-ring"
          style={{ background: `conic-gradient(var(--vt-a) ${(zaehler.richtig / Math.max(1, zaehler.gesamt)) * 360}deg, var(--vt-a-rand) 0deg)` }}
        >
          <div className="vt-ring-innen">
            <IconCheck size={30} />
          </div>
        </div>
        <Title order={2}>Geschafft!</Title>
        <Text c="dimmed">
          {zaehler.richtig} von {zaehler.gesamt} Abfragen auf Anhieb richtig.
        </Text>
        {aufgestiegen.length > 0 && (
          <Stack gap={6} align="center" data-aufstieg>
            <Text fw={700}>
              {aufgestiegen.length} {aufgestiegen.length === 1 ? 'Wort ist' : 'Wörter sind'} aufgestiegen
            </Text>
            <Group gap={6} justify="center" maw={520}>
              {aufgestiegen.slice(0, 12).map((x, k) => (
                <span key={x.v.id} className="vt-aufstieg" style={{ animationDelay: `${k * 70}ms` }}>
                  {ohneAngaben(x.v.term)} <IconArrowUp size={12} /> {STUFEN[x.nach].name}
                </span>
              ))}
            </Group>
          </Stack>
        )}
        <Button size="lg" radius="xl" className="vt-los" onClick={() => fertig(staende)}>
          Zurück zum Kasten
        </Button>
      </Stack>
    )
  const fortschritt = (zaehler.gesamt / Math.max(1, zaehler.gesamt + warteschlange.length)) * 100
  return (
    <Stack className="vt" data-sitzung>
      <style>{CSS}</style>
      <Group justify="space-between">
        <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} onClick={() => fertig(staende)} px={4}>
          Beenden
        </Button>
        <Badge variant="light" color={farbe.a} size="lg" radius="sm" tt="none">
          {STUFEN[Math.min(6, st!.fach)].name}
        </Badge>
      </Group>
      <Progress value={fortschritt} radius="xl" size="lg" color={farbe.a} />
      <div key={`${v.id}-${frage}`} className="vt-rein vt-buehne">
        {uebung === 'karte' ? (
          <Karte v={v} sprache={d.sprache} gewusst={(g) => void antworten({ gewusst: g })} gesperrt={Boolean(ergebnis) || laeuft} />
        ) : uebung === 'auswahl' || uebung === 'hoeren' ? (
          <Auswahl
            v={v}
            liste={d.woerter}
            sprache={d.sprache}
            hoeren={uebung === 'hoeren'}
            waehle={(a) => void antworten({ antwort: a })}
            ergebnis={ergebnis}
          />
        ) : uebung === 'auswahlFs' ? (
          <AuswahlFs v={v} liste={d.woerter} sprache={d.sprache} waehle={(a) => void antworten({ antwort: a })} ergebnis={ergebnis} />
        ) : uebung === 'paar' ? (
          <Paar v={v} liste={d.woerter} sprache={d.sprache} urteil={(a, gezeigt) => void antworten({ antwort: a, gezeigt })} ergebnis={ergebnis} />
        ) : uebung === 'buchstaben' ? (
          <Buchstaben v={v} pruefen={(a) => void antworten({ antwort: a })} gesperrt={Boolean(ergebnis)} />
        ) : (
          <Schreiben v={v} uebung={uebung} sprache={d.sprache} pruefen={(a) => void antworten({ antwort: a })} gesperrt={Boolean(ergebnis)} />
        )}
      </div>
      {ergebnis && uebung !== 'karte' && <Rueckmeldung e={ergebnis} v={v} sprache={d.sprache} />}
      {/* Unregelmäßige Verben (07.10.2026): ab Fach 2 nach der Antwort noch die Formen */}
      {ergebnis && verbKarte && (st?.fach ?? 0) >= 2 && d.verben && (
        <StammformenNachfrage key={v.id} karte={verbKarte} sprache={d.verben.sprache} tonSprache={d.sprache} />
      )}
      {ergebnis && (
        <Button size="lg" radius="xl" className="vt-los" onClick={weiter} data-weiter autoFocus>
          Weiter
        </Button>
      )}
    </Stack>
  )
}

/** Stammformen nach der Antwort (07.10.2026): Formen eintragen, sofort prüfen, alle hören – zählt nicht im Kasten */
function StammformenNachfrage({ karte, sprache, tonSprache }: { karte: VerbKarte; sprache: VerbSprache; tonSprache: string }): React.JSX.Element {
  const spalten = formSpalten(sprache).filter((s) => karte.formen[s.id])
  const grund = spalten[0]?.id
  const [eingaben, setEingaben] = useState<Record<string, string>>({})
  const [geprueft, setGeprueft] = useState(false)
  const offen = spalten.filter((s) => s.id !== grund)
  return (
    <Card withBorder radius="lg" padding="sm" data-stammformen>
      <Text fw={700} size="sm" mb={6}>
        Und die Formen? (unregelmäßiges Verb)
      </Text>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setGeprueft(true)
          sprich(sprechtext(spalten.map((s) => karte.formen[s.id]).join(', ')), tonSprache)
        }}
      >
        <Group gap="xs" align="flex-end" wrap="wrap">
          <TextInput label={spalten[0]?.label} value={karte.formen[grund ?? ''] ?? ''} readOnly w={140} />
          {offen.map((s) => {
            const ok = geprueft ? formPasst(eingaben[s.id] ?? '', karte.formen[s.id]) : undefined
            return (
              <TextInput
                key={s.id}
                label={s.label}
                w={140}
                value={eingaben[s.id] ?? ''}
                onChange={(e) => setEingaben({ ...eingaben, [s.id]: e.currentTarget.value })}
                disabled={geprueft}
                error={ok === false ? karte.formen[s.id] : undefined}
                styles={ok ? { input: { borderColor: 'var(--vt-gut-rand)' } } : undefined}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-stammform={s.id}
              />
            )
          })}
          {!geprueft && (
            <Button type="submit" variant="light" data-stammformen-pruefen>
              Prüfen
            </Button>
          )}
        </Group>
      </form>
    </Card>
  )
}

function Rueckmeldung({ e, v, sprache }: { e: Ergebnis; v: Vokabel; sprache: string }): React.JSX.Element {
  const farbe = e.urteil === 'richtig' ? 'green' : e.urteil === 'fast' ? 'yellow' : 'red'
  useEffect(() => sprich(v.term, sprache), [v.term, sprache])
  return (
    <Alert color={farbe} variant="light" icon={e.urteil === 'falsch' ? <IconX /> : <IconCheck />} data-urteil={e.urteil} className="vt-rein">
      <Text fw={700}>
        {e.urteil === 'richtig' ? (e.sicher ? 'Richtig – jetzt sitzt das Wort sicher!' : 'Richtig!') : e.urteil === 'fast' ? 'Fast!' : 'Noch nicht.'}
      </Text>
      {e.hinweis && <Text size="sm">{e.hinweis}</Text>}
      {e.urteil !== 'richtig' && (
        <Text size="sm">
          Richtig ist: <b>{e.richtig}</b>
        </Text>
      )}
      <Text size="sm" c="dimmed">
        {v.term} – {v.translation}
      </Text>
    </Alert>
  )
}

/** Lernkarte: umdrehen per Tippen, Wischen oder Ziehen; Aussprache; Nachsprechen */
function Karte({ v, sprache, gewusst, gesperrt }: { v: Vokabel; sprache: string; gewusst: (g: boolean) => void; gesperrt: boolean }): React.JSX.Element {
  const farbe = useVtFarbe()
  const [um, setUm] = useState(false)
  const [zug, setZug] = useState(0)
  const start = useRef<number | null>(null)
  const [nachsprechen, setNachsprechen] = useState<string | null>(null)
  useEffect(() => sprich(v.term, sprache), [v.term, sprache])
  const erkennung =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
  const sprechen = (): void => {
    if (!erkennung) return
    const r = new erkennung()
    r.lang = STIME_SICHER(sprache)
    r.interimResults = false
    r.onresult = (e) => {
      const gehoert = e.results?.[0]?.[0]?.transcript ?? ''
      const ziel = v.term
        .replace(/\([^)]*\)/g, '')
        .trim()
        .toLowerCase()
      setNachsprechen(
        gehoert.toLowerCase().includes(ziel.replace(/^to\s+/, ''))
          ? `Gut ausgesprochen: „${gehoert}“`
          : `Gehört: „${gehoert}“ – hör noch einmal hin und versuch es erneut.`
      )
    }
    r.onerror = () => setNachsprechen('Das Mikrofon ist nicht verfügbar.')
    r.start()
    setNachsprechen('Ich höre zu …')
  }
  return (
    <Stack align="center" gap="md">
      <Text className="vt-frage">Neue Karte – tippe oder wische zum Umdrehen</Text>
      <div
        className="vt-karte-buehne"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerMove={(e) => start.current !== null && setZug(Math.max(-60, Math.min(60, e.clientX - start.current)))}
        onPointerUp={(e) => {
          const dx = start.current === null ? 0 : e.clientX - start.current
          start.current = null
          setZug(0)
          if (Math.abs(dx) > 40 || Math.abs(dx) < 6) setUm((x) => !x)
        }}
        data-lernkarte
      >
        <div className={`vt-karte ${um ? 'umgedreht' : ''}`} style={zug ? { transform: `rotateY(${(um ? 180 : 0) + zug}deg)` } : undefined}>
          <div className="vt-seite">
            {v.bild && <img src={v.bild} alt="" style={{ width: 72, height: 72, marginBottom: 8 }} />}
            <Text fw={800} size="1.8rem">
              {v.term}
            </Text>
            {v.pos && (
              <Text size="sm" c="dimmed">
                {v.pos}
              </Text>
            )}
          </div>
          <div className="vt-seite hinten">
            <Text fw={800} size="1.5rem">
              {v.translation}
            </Text>
            {v.example && (
              <Text size="sm" mt="sm" fs="italic">
                {v.example}
                {hatSatzAufnahme(v.example) && (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    ml={4}
                    aria-label="Beispielsatz anhören"
                    data-satz-anhoeren
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => (e.stopPropagation(), aufnahmeSpielen(v.example!))}
                  >
                    <IconVolume size={14} />
                  </ActionIcon>
                )}
              </Text>
            )}
            {v.exampleTranslation && (
              <Text size="xs" c="dimmed">
                {v.exampleTranslation}
              </Text>
            )}
          </div>
        </div>
      </div>
      <Group gap="xs">
        <Tooltip label="Anhören">
          <ActionIcon size="lg" variant="light" onClick={() => sprich(v.term, sprache)} aria-label="Anhören">
            <IconVolume size={18} />
          </ActionIcon>
        </Tooltip>
        {erkennung && STIMME[sprache] && (
          <Tooltip label="Nachsprechen (die Aufnahme wird nicht gespeichert)">
            <ActionIcon size="lg" variant="light" onClick={sprechen} aria-label="Nachsprechen">
              <IconMicrophone size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {nachsprechen && (
        <Text size="sm" c="dimmed">
          {nachsprechen}
        </Text>
      )}
      {um && (
        <Group className="vt-rein">
          <Button color={farbe.a} variant="light" size="md" radius="xl" disabled={gesperrt} onClick={() => gewusst(false)} data-karte-nicht>
            Noch nicht gewusst
          </Button>
          <Button color="green" size="md" radius="xl" disabled={gesperrt} onClick={() => gewusst(true)} data-karte-gewusst>
            Wusste ich
          </Button>
        </Group>
      )}
    </Stack>
  )
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  onresult: (e: { results?: { [i: number]: { [j: number]: { transcript: string } } } }) => void
  onerror: () => void
  start: () => void
}
const STIME_SICHER = (s: string): string => STIMME[s] ?? 'en-GB'

function Auswahl({
  v,
  liste,
  sprache,
  hoeren,
  waehle,
  ergebnis
}: {
  v: Vokabel
  liste: Vokabel[]
  sprache: string
  hoeren: boolean
  waehle: (a: string) => void
  ergebnis: Ergebnis | null
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const optionen = useMemo(() => auswahlOptionen(v, liste, 'de'), [v.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  useEffect(() => {
    if (hoeren) sprich(v.term, sprache)
  }, [v.term, sprache, hoeren])
  return (
    <Stack align="center">
      <Text className="vt-frage">{hoeren ? 'Hör zu: Was bedeutet das Wort?' : 'Was bedeutet das Wort?'}</Text>
      {hoeren ? (
        <ActionIcon size={72} radius="xl" variant="light" color={farbe.a} onClick={() => sprich(v.term, sprache)} aria-label="Noch einmal anhören">
          <IconVolume size={36} />
        </ActionIcon>
      ) : (
        <Text fw={800} size="2rem" ta="center" c="var(--vt-tinte)">
          {v.term}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, xs: 2 }} w="100%" maw={560}>
        {optionen.map((o) => {
          const richtig = ergebnis && o === v.translation
          const falsch = ergebnis && o === gewaehlt && o !== v.translation
          return (
            <Button
              key={o}
              size="lg"
              radius="lg"
              className="vt-option"
              data-zustand={richtig ? 'richtig' : falsch ? 'falsch' : undefined}
              onClick={() => {
                if (ergebnis) return
                setGewaehlt(o)
                waehle(o)
              }}
              styles={{ label: { whiteSpace: 'normal' } }}
              h="auto"
              py="sm"
              data-option
            >
              {o}
            </Button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

/** Richtige Schreibweise in der Fremdsprache wählen – gelegentlich zwischen typischen Falschschreibungen */
function AuswahlFs({
  v,
  liste,
  sprache,
  waehle,
  ergebnis
}: {
  v: Vokabel
  liste: Vokabel[]
  sprache: string
  waehle: (a: string) => void
  ergebnis: Ergebnis | null
}): React.JSX.Element {
  const optionen = useMemo(
    () => auswahlFsOptionen(v, liste, sprache, (w, n, verboten) => falschschreibungen(w, sprache, n, Math.random, verboten)),
    [v.id] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  // Stehen Falschschreibungen dabei (Wörter, die es in der Liste nicht gibt)? Dann geht es um die Schreibweise
  const mitFehlern = useMemo(() => {
    const bekannt = new Set(liste.flatMap((x) => [ohneAngaben(x.term), ohneAngaben(varianten(x.term)[0] ?? x.term)].map((t) => t.toLowerCase())))
    return optionen.filter((o) => !bekannt.has(o.toLowerCase())).length > 0
  }, [optionen, liste])
  return (
    <Stack align="center">
      <Text className="vt-frage">{mitFehlern ? 'Welche Schreibweise ist richtig?' : 'Welches Wort ist gemeint?'}</Text>
      <Group gap="xs">
        {v.bild && <img src={v.bild} alt="" style={{ width: 44, height: 44 }} />}
        <Text fw={800} size="1.8rem" c="var(--vt-tinte)">
          {v.translation}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2 }} w="100%" maw={560}>
        {optionen.map((o) => {
          const istRichtig = ergebnis && (o === ergebnis.richtig || (ergebnis.urteil === 'richtig' && o === gewaehlt))
          const falsch = ergebnis && o === gewaehlt && ergebnis.urteil !== 'richtig'
          return (
            <Button
              key={o}
              size="lg"
              radius="lg"
              className="vt-option"
              data-zustand={istRichtig ? 'richtig' : falsch ? 'falsch' : undefined}
              onClick={() => {
                if (ergebnis) return
                setGewaehlt(o)
                waehle(o)
              }}
              styles={{ label: { whiteSpace: 'normal', fontWeight: 700, letterSpacing: 0.3 } }}
              h="auto"
              py="sm"
              data-option-fs
            >
              {o}
            </Button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

/** Stimmt das Paar? – schnelles Erkennen */
function Paar({
  v,
  liste,
  sprache,
  urteil,
  ergebnis
}: {
  v: Vokabel
  liste: Vokabel[]
  sprache: string
  urteil: (a: 'stimmt' | 'stimmt nicht', gezeigt: string) => void
  ergebnis: Ergebnis | null
}): React.JSX.Element {
  const gezeigt = useMemo(() => paarFuer(v, liste), [v.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => sprich(v.term, sprache), [v.term, sprache])
  return (
    <Stack align="center">
      <Text className="vt-frage">Stimmt das?</Text>
      <Card
        radius="xl"
        padding="lg"
        withBorder
        style={{ borderColor: 'var(--vt-a-rand)', background: 'linear-gradient(160deg, var(--vt-flaeche), var(--vt-a-hell))', minWidth: 280 }}
      >
        <Stack gap={4} align="center">
          <Text fw={800} size="1.7rem" c="var(--vt-tinte)">
            {v.term}
          </Text>
          <Text size="sm" c="dimmed">
            bedeutet
          </Text>
          <Text fw={700} size="1.4rem" c="var(--vt-a-dunkel)">
            {gezeigt}
          </Text>
        </Stack>
      </Card>
      <Group>
        <Button
          size="lg"
          radius="xl"
          color="red"
          variant="light"
          disabled={Boolean(ergebnis)}
          onClick={() => urteil('stimmt nicht', gezeigt)}
          leftSection={<IconX size={18} />}
          data-paar="nein"
        >
          Stimmt nicht
        </Button>
        <Button
          size="lg"
          radius="xl"
          color="teal"
          disabled={Boolean(ergebnis)}
          onClick={() => urteil('stimmt', gezeigt)}
          leftSection={<IconCheck size={18} />}
          data-paar="ja"
        >
          Stimmt
        </Button>
      </Group>
    </Stack>
  )
}

function Buchstaben({ v, pruefen, gesperrt }: { v: Vokabel; pruefen: (a: string) => void; gesperrt: boolean }): React.JSX.Element {
  const kacheln = useMemo(() => buchstaben(v.term).map((b, i) => ({ b, i })), [v.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [gelegt, setGelegt] = useState<number[]>([])
  // Leerzeichen stehen von selbst an ihrer Stelle („bring about", 06.10.2026)
  const wort = mitLeerzeichen(v.term, gelegt.map((i) => kacheln.find((k) => k.i === i)!.b).join(''))
  return (
    <Stack align="center">
      <Text className="vt-frage">Lege das Wort aus den Buchstaben</Text>
      <Text fw={800} size="1.6rem" c="var(--vt-tinte)">
        {v.translation}
      </Text>
      <div className="vt-gelegt" data-gelegt>
        <Text size="1.6rem" fw={700} style={{ letterSpacing: 3 }} c="var(--vt-a-dunkel)">
          {wort || ' '}
        </Text>
      </div>
      <Group gap={6} justify="center">
        {kacheln.map((k) => (
          <Button
            key={k.i}
            className="vt-kachel"
            variant="light"
            disabled={gelegt.includes(k.i) || gesperrt}
            onClick={() => setGelegt([...gelegt, k.i])}
            px="xs"
            data-buchstabe
          >
            {k.b}
          </Button>
        ))}
      </Group>
      <Group>
        <Button variant="subtle" leftSection={<IconBackspace size={16} />} disabled={!gelegt.length || gesperrt} onClick={() => setGelegt(gelegt.slice(0, -1))}>
          Zurück
        </Button>
        <Button className="vt-los" radius="xl" disabled={gelegt.length !== kacheln.length || gesperrt} onClick={() => pruefen(wort)} data-pruefen>
          Prüfen
        </Button>
      </Group>
    </Stack>
  )
}

function Schreiben({
  v,
  uebung,
  sprache,
  pruefen,
  gesperrt
}: {
  v: Vokabel
  uebung: Uebung
  sprache: string
  pruefen: (a: string) => void
  gesperrt: boolean
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const [text, setText] = useState('')
  const feld = useRef<HTMLInputElement>(null)
  const luecke = uebung === 'luecke' && v.example ? satzMitLuecke(v.example, v.term) : null
  const muster = useMemo(() => (uebung === 'luecken' ? lueckenMuster(v.term) : ''), [v.id, uebung]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (uebung === 'diktat') sprich(v.term, sprache)
    feld.current?.focus()
  }, [v.id, uebung, sprache]) // eslint-disable-line react-hooks/exhaustive-deps
  const zeichen = (z: string): void => {
    const el = feld.current
    const pos = el?.selectionStart ?? text.length
    setText(text.slice(0, pos) + z + text.slice(pos))
    requestAnimationFrame(() => el?.setSelectionRange(pos + z.length, pos + z.length))
    el?.focus()
  }
  return (
    <Stack align="center">
      <Text className="vt-frage">
        {uebung === 'diktat'
          ? 'Hör zu und schreib das Wort'
          : luecke
            ? 'Ergänze den Satz'
            : muster
              ? 'Ergänze die fehlenden Buchstaben'
              : 'Schreib das Wort in der Fremdsprache'}
      </Text>
      {uebung === 'diktat' ? (
        <ActionIcon size={72} radius="xl" variant="light" color={farbe.a} onClick={() => sprich(v.term, sprache)} aria-label="Noch einmal anhören">
          <IconVolume size={36} />
        </ActionIcon>
      ) : muster ? (
        <Stack gap={4} align="center">
          <Text fw={800} size="2rem" c="var(--vt-a-dunkel)" style={{ letterSpacing: 6, fontFamily: 'ui-monospace, monospace' }} data-luecken-muster>
            {muster}
          </Text>
          <Text size="md" c="dimmed">
            {v.translation}
          </Text>
        </Stack>
      ) : luecke ? (
        <Card withBorder radius="md" maw={560}>
          <Text size="lg" ta="center">
            {luecke.vor}
            <b>_____</b>
            {luecke.nach}
          </Text>
          <Text size="sm" c="dimmed" ta="center" mt={4}>
            ({v.translation})
          </Text>
        </Card>
      ) : (
        <Group gap="xs">
          {v.bild && <img src={v.bild} alt="" style={{ width: 48, height: 48 }} />}
          <Text fw={800} size="1.8rem">
            {v.translation}
          </Text>
        </Group>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!gesperrt && text.trim()) pruefen(text)
        }}
        style={{ width: '100%', maxWidth: 420 }}
      >
        <TextInput
          ref={feld}
          size="lg"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          disabled={gesperrt}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={muster ? 'ganzes Wort' : '…'}
          data-eingabe
        />
        {AKZENTE[sprache] && (
          <Group gap={4} mt={6} justify="center">
            {AKZENTE[sprache].map((z) => (
              <Button key={z} size="compact-sm" variant="default" onClick={() => zeichen(z)} disabled={gesperrt}>
                {z}
              </Button>
            ))}
          </Group>
        )}
        <Button type="submit" fullWidth mt="sm" size="md" radius="xl" className="vt-los" disabled={gesperrt || !text.trim()} data-pruefen>
          Prüfen
        </Button>
      </form>
    </Stack>
  )
}

export { istSicher }
