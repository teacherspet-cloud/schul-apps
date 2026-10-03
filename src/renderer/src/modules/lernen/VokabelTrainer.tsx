/**
 * Vokabeltrainer für Lernende (03.10.2026, /s/v/<ID>; Regeln: shared/vokabeltrainer.ts, Server: src/server/vokabeln.ts).
 *
 * Kasten-Ansicht mit den Fächern (füllt sich sichtbar), „Heute fällig" und Testtermin. Eine Sitzung:
 * fällige Wörter zuerst, dann höchstens 10 neue. Erstkontakt als Lernkarte (umdrehen per Wischen,
 * Ziehen oder Tippen; Aussprache; Nachsprechen), danach immer objektiv: Auswahl, Hören, Buchstaben
 * legen, frei schreiben (mit Akzentleiste), Diktat, Lückensatz. Falsches kommt in der Sitzung wieder.
 * Ruhig motivierend: keine Streaks, keine Bestenlisten.
 */
import { besteStimme } from './stimme'
import { ActionIcon, Alert, Badge, Button, Card, Center, Group, Loader, Progress, SimpleGrid, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core'
import {
  IconArrowLeft,
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
  lueckenMuster,
  paarFuer,
  istSicher,
  ohneAngaben,
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
const FACH_NAMEN = ['neu', '1', '2', '3', '4', '5', '∞']

/** Vorlesen mit der Stimme des Geräts (kostenlos, ohne Server) */
export function sprich(text: string, sprache: string): void {
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
    u.rate = 0.85
    window.speechSynthesis.speak(u)
  } catch {
    // ohne Sprachausgabe geht es auch
  }
}

const CSS = `
.vt { --vt-orange: #f97316; --vt-orange-dunkel: #c2410c; --vt-creme: #fff7ed; --vt-tinte: #1f2937; --vt-leise: #6b7280; --vt-rand: #fed7aa; }
.vt-kopf { position: relative; overflow: hidden; border-radius: 22px; padding: 22px 22px 20px; color: #fff;
  background: radial-gradient(120% 140% at 100% 0%, #fdba74 0%, #fb923c 38%, #ea580c 100%); box-shadow: 0 14px 30px rgba(234,88,12,0.28); }
.vt-kopf::after { content: ''; position: absolute; right: -40px; bottom: -60px; width: 200px; height: 200px; border-radius: 50%; background: rgba(255,255,255,0.12); }
.vt-kopf-zeile { display: flex; align-items: center; justify-content: space-between; gap: 16px; position: relative; z-index: 1; }
.vt-ring { flex: none; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; }
.vt-ring-innen { width: 70px; height: 70px; border-radius: 50%; background: rgba(255,255,255,0.95); color: var(--vt-orange-dunkel); display: grid; place-items: center; text-align: center; line-height: 1.05; }
.vt-kasten { display: flex; gap: 8px; align-items: flex-end; padding: 14px 14px 18px; border-radius: 20px; background: var(--vt-creme);
  border: 1px solid var(--vt-rand); box-shadow: inset 0 -5px 0 #fde2c4; }
.vt-fach { flex: 1; border-radius: 12px 12px 8px 8px; background: #fff; position: relative; overflow: hidden; min-height: 104px;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 6px; border: 1px solid #fde7d0; }
.vt-fach-fuellung { position: absolute; left: 0; right: 0; bottom: 0; transition: height .6s cubic-bezier(.2,.8,.2,1); opacity: .9;
  background-image: repeating-linear-gradient(180deg, rgba(255,255,255,0) 0 6px, rgba(255,255,255,0.45) 6px 7px); }
.vt-fach-zahl { position: relative; font-weight: 800; font-size: 1.2rem; color: var(--vt-tinte); }
.vt-fach-name { position: relative; font-size: .72rem; color: var(--vt-leise); }
.vt-werte { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.vt-wert { border-radius: 16px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #f1f5f9; box-shadow: 0 2px 10px rgba(15,23,42,0.05); }
.vt-wert-symbol { flex: none; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; }
.vt-los { background: linear-gradient(90deg, #fb923c, #ea580c) !important; box-shadow: 0 10px 22px rgba(234,88,12,0.3); border: 0 !important; }
.vt-los:hover { filter: brightness(1.05); }
.vt-buehne { background: #fff; border-radius: 22px; padding: 22px 16px; border: 1px solid #f1f5f9; box-shadow: 0 6px 24px rgba(15,23,42,0.06); }
.vt-frage { font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; color: var(--vt-orange-dunkel); font-weight: 700; }
.vt-option { border: 2px solid #fde7d0 !important; background: #fff !important; color: var(--vt-tinte) !important; transition: transform .12s, border-color .12s; }
.vt-option:hover { border-color: var(--vt-orange) !important; transform: translateY(-1px); }
.vt-option[data-zustand="richtig"] { background: #d1fae5 !important; border-color: #10b981 !important; color: #065f46 !important; }
.vt-option[data-zustand="falsch"] { background: #ffe4e6 !important; border-color: #f43f5e !important; color: #9f1239 !important; }
.vt-karte-buehne { perspective: 1200px; width: 100%; max-width: 440px; height: 260px; margin: 0 auto; touch-action: pan-y; }
.vt-karte { position: relative; width: 100%; height: 100%; transition: transform .55s cubic-bezier(.2,.8,.2,1); transform-style: preserve-3d; cursor: grab; }
.vt-karte.umgedreht { transform: rotateY(180deg); }
.vt-seite { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 20px; padding: 20px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--vt-tinte);
  background: linear-gradient(160deg, #ffffff, #fff7ed); border: 1px solid #fed7aa; box-shadow: 0 14px 30px rgba(234,88,12,0.14); }
.vt-seite.hinten { transform: rotateY(180deg); background: linear-gradient(160deg, #ecfdf5, #d1fae5); border-color: #a7f3d0; box-shadow: 0 14px 30px rgba(16,185,129,0.14); }
.vt-seite::before { content: ''; position: absolute; left: 0; right: 0; top: 46px; border-top: 2px solid rgba(249,115,22,0.25); }
.vt-kachel { min-width: 42px; height: 46px; font-size: 1.2rem; font-weight: 700; border-radius: 12px !important; background: #fff7ed !important; color: var(--vt-orange-dunkel) !important;
  border: 2px solid #fed7aa !important; box-shadow: 0 3px 0 #fdba74; }
.vt-kachel:disabled { opacity: .35; box-shadow: none; }
.vt-gelegt { border: 2px dashed #fdba74; border-radius: 16px; background: #fffbf5; min-width: 240px; min-height: 60px; display: grid; place-items: center; padding: 6px 14px; }
@keyframes vt-rein { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: none } }
.vt-rein { animation: vt-rein .35s ease-out; }
@media (prefers-reduced-motion: reduce) { .vt-karte, .vt-fach-fuellung { transition: none } .vt-rein { animation: none } }
`

export default function VokabelTrainer({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<Liste | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  const [sitzung, setSitzung] = useState<Vokabel[] | null>(null)
  const laden = useCallback(() => {
    void holen<Liste>(`/s/api/vokabeln/liste?id=${encodeURIComponent(id)}`).then(setD, (e: unknown) => {
      setFehler(e instanceof Error ? e.message : String(e))
      setD(null)
    })
  }, [id])
  useEffect(laden, [laden])
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Diese Vokabeln gibt es nicht.'}</Alert>
  if (sitzung) return <Sitzung d={d} woerter={sitzung} fertig={(st) => (setD({ ...d, staende: st }), setSitzung(null))} />
  return <Kasten d={d} starten={(w) => setSitzung(w)} />
}

function Kasten({ d, starten }: { d: Liste; starten: (w: Vokabel[]) => void }): React.JSX.Element {
  const u = uebersicht(d.woerter, d.staende)
  const heute = sitzungsWoerter(d.woerter, d.staende)
  const max = Math.max(1, ...u.faecher)
  const tage = d.testTermin ? Math.ceil((d.testTermin - Date.now()) / 86_400_000) : null
  const anteil = Math.round((u.sicher / Math.max(1, u.gesamt)) * 100)
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
    { name: 'heute fällig', wert: String(heute.length), farbe: '#f97316', symbol: <IconFlame size={20} /> },
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
      <Button variant="subtle" color="orange" component="a" href={gast ? '/s/' : '/s/lernen'} w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        {gast ? 'Meine Materialien' : 'Lernraum'}
      </Button>
      <div className="vt-kopf">
        <div className="vt-kopf-zeile">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} style={{ opacity: 0.9 }}>
              {d.fach} · {d.woerter.length} Vokabeln
            </Text>
            <Title order={2} style={{ color: '#fff', lineHeight: 1.15 }}>
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
      <div>
        <Text size="sm" fw={700} mb={6} c="#9a3412">
          Dein Karteikasten
        </Text>
        <div className="vt-kasten" aria-label="Dein Karteikasten">
          {u.faecher.map((n, i) => (
            <Tooltip key={i} label={i === 0 ? `${n} noch nicht gelernt` : i === 6 ? `${n} im Langzeitfach` : `${n} in Fach ${i}`}>
              <div className="vt-fach" data-fach={i}>
                <div className="vt-fach-fuellung" style={{ height: `${n ? 18 + (n / max) * 62 : 0}%`, backgroundColor: FACH_FARBEN[i] }} />
                <span className="vt-fach-zahl">{n}</span>
                <span className="vt-fach-name">{i === 0 ? 'neu' : i === 6 ? '∞' : `Fach ${FACH_NAMEN[i]}`}</span>
              </div>
            </Tooltip>
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
              <Text fw={800} size="lg" lh={1.2} c="#1f2937">
                {w.wert}
              </Text>
            </div>
          </div>
        ))}
      </div>
      {heute.length ? (
        <Button size="xl" radius="xl" className="vt-los" leftSection={<IconPlayerPlay size={22} />} onClick={() => starten(heute)} data-vokabel-start>
          Jetzt üben · {heute.length} {heute.length === 1 ? 'Wort' : 'Wörter'}
        </Button>
      ) : (
        <Alert color="teal" radius="lg" icon={<IconCheck />}>
          Für heute ist alles erledigt. Der Kasten meldet sich, wenn die nächsten Wörter fällig sind.
        </Alert>
      )}
      {ohneStimme && (
        <Alert color="yellow" radius="lg" data-ohne-stimme>
          Auf diesem Gerät ist keine Stimme für diese Sprache installiert – deshalb wird nichts vorgelesen. Am Computer: Einstellungen › Zeit und Sprache ›
          Sprache › Sprache hinzufügen (mit Sprachausgabe). Am iPad: Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen.
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        So funktioniert der Kasten: Richtig gewusst wandert ein Wort ein Fach weiter und kommt später wieder (1, 3, 7, 16, 35 Tage). Falsch geht es zwei Fächer
        zurück. „Sicher“ ist ein Wort, wenn du es zweimal im Abstand von einer Woche richtig geschrieben hast.
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

  const antworten = async (wert: { antwort?: string; gewusst?: boolean; gezeigt?: string }): Promise<void> => {
    if (!v || laeuft) return
    setLaeuft(true)
    try {
      const e = await senden<Ergebnis>('/s/api/vokabeln/antwort', { id: d.id, wortId: v.id, uebung, ...wert })
      setStaende((s) => ({ ...s, [v.id]: e.stand }))
      setErgebnis(e)
      setZaehler((z) => ({ ...z, richtig: z.richtig + (e.urteil === 'richtig' ? 1 : 0), gesamt: z.gesamt + 1 }))
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

  if (!v)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-sitzung-fertig>
        <style>{CSS}</style>
        <div className="vt-ring" style={{ background: `conic-gradient(#f97316 ${(zaehler.richtig / Math.max(1, zaehler.gesamt)) * 360}deg, #fed7aa 0deg)` }}>
          <div className="vt-ring-innen">
            <IconCheck size={30} />
          </div>
        </div>
        <Title order={2}>Geschafft!</Title>
        <Text c="dimmed">
          {zaehler.richtig} von {zaehler.gesamt} Abfragen auf Anhieb richtig.
        </Text>
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
        <Button variant="subtle" color="orange" leftSection={<IconX size={16} />} onClick={() => fertig(staende)} px={4}>
          Beenden
        </Button>
        <Badge variant="light" color="orange" size="lg" radius="sm">
          {st!.fach === 0 ? 'neues Wort' : st!.fach >= 6 ? 'Langzeitfach' : `Fach ${FACH_NAMEN[st!.fach]}`}
        </Badge>
      </Group>
      <Progress value={fortschritt} radius="xl" size="lg" color="orange" />
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
      {ergebnis && (
        <Button size="lg" radius="xl" className="vt-los" onClick={weiter} data-weiter autoFocus>
          Weiter
        </Button>
      )}
    </Stack>
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
          <Button color="orange" variant="light" size="md" radius="xl" disabled={gesperrt} onClick={() => gewusst(false)} data-karte-nicht>
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
  const optionen = useMemo(() => auswahlOptionen(v, liste, 'de'), [v.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  useEffect(() => {
    if (hoeren) sprich(v.term, sprache)
  }, [v.term, sprache, hoeren])
  return (
    <Stack align="center">
      <Text className="vt-frage">{hoeren ? 'Hör zu: Was bedeutet das Wort?' : 'Was bedeutet das Wort?'}</Text>
      {hoeren ? (
        <ActionIcon size={72} radius="xl" variant="light" color="orange" onClick={() => sprich(v.term, sprache)} aria-label="Noch einmal anhören">
          <IconVolume size={36} />
        </ActionIcon>
      ) : (
        <Text fw={800} size="2rem" ta="center" c="#1f2937">
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
        <Text fw={800} size="1.8rem" c="#1f2937">
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
      <Card radius="xl" padding="lg" withBorder style={{ borderColor: '#fed7aa', background: 'linear-gradient(160deg, #fff, #fff7ed)', minWidth: 280 }}>
        <Stack gap={4} align="center">
          <Text fw={800} size="1.7rem" c="#1f2937">
            {v.term}
          </Text>
          <Text size="sm" c="dimmed">
            bedeutet
          </Text>
          <Text fw={700} size="1.4rem" c="#c2410c">
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
  const wort = gelegt.map((i) => kacheln.find((k) => k.i === i)!.b).join('')
  return (
    <Stack align="center">
      <Text className="vt-frage">Lege das Wort aus den Buchstaben</Text>
      <Text fw={800} size="1.6rem" c="#1f2937">
        {v.translation}
      </Text>
      <div className="vt-gelegt" data-gelegt>
        <Text size="1.6rem" fw={700} style={{ letterSpacing: 3 }} c="#c2410c">
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
        <ActionIcon size={72} radius="xl" variant="light" color="orange" onClick={() => sprich(v.term, sprache)} aria-label="Noch einmal anhören">
          <IconVolume size={36} />
        </ActionIcon>
      ) : muster ? (
        <Stack gap={4} align="center">
          <Text fw={800} size="2rem" c="#c2410c" style={{ letterSpacing: 6, fontFamily: 'ui-monospace, monospace' }} data-luecken-muster>
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
