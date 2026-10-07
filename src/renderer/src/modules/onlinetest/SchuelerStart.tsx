/**
 * Schüler-Startseite, obere Hälfte (06.10.2026, abgestimmt mit der Lehrkraft; Recherche
 * recherche/schueler-startseite-lerntipps-2026-10-06.md, Abschnitte 2–4):
 *
 *  - Begrüßung nach zwei Achsen – Fleiß (Übungstage der letzten 7–14 Tage) und Leistung (individueller
 *    Trend) – in fünf Zuständen, je Altersstufe anders: Kl. 1–4 Maskottchen jubelt, Sterne; Kl. 5–6
 *    Maskottchen als Coach, Abzeichen; Kl. 7–10 dunkel mit dezentem Leuchten, Meilensteine; Kl. 11–13
 *    sachlich mit Kurzstatistik. Der „coole" Look ist nur Kosmetik und hängt immer am Fleiß, nie an der
 *    Leistung allein. Wochenserie statt Tagesserie, kein Verlustbildschirm, Animation unter 2 s und
 *    abschaltbar (Ruhige Darstellung, prefers-reduced-motion). Keine freischaltbaren Looks.
 *  - Genau ein Lerntipp mit ausführbarem Knopf (einmal je Woche als Wochenrückblick der KI, sonst fest).
 *  - Lernstand: „Mein Stand" (was sitzt – Stufen neu / in Arbeit / sicher statt Rot) und getrennt
 *    „Mein Fortschritt" (gegenüber früher). Keine Vergleiche, keine Ranglisten; Kl. 1–4 Symbole statt Zahlen.
 */
import { Badge, Button, Group, Paper, Progress, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import {
  IconArrowRight,
  IconBook,
  IconBulb,
  IconCalendarCheck,
  IconCheck,
  IconFileText,
  IconFlame,
  IconLanguage,
  IconRoute,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconTrendingUp
} from '@tabler/icons-react'
import { useMemo } from 'react'
import type { LernstandAntwort, Strategie, Stufe, Zustand } from '@shared/lernstand'
import { VorleseKnopf } from './SchuelerEinstellungen'

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Die Tage dieser Woche (Mo–So) als ISO-Daten in UTC – wie die Übungstage gespeichert werden */
function dieseWoche(jetzt = Date.now()): string[] {
  const tag = Math.floor(jetzt / 86_400_000)
  const montag = tag - ((tag + 3) % 7)
  return Array.from({ length: 7 }, (_, i) => new Date((montag + i) * 86_400_000).toISOString().slice(0, 10))
}

interface Knopf {
  text: string
  href: string
}

/** Begrüßungstext je Zustand und Stufe (Recherche 4.3 – nur Beispiele, hier mit echten Zahlen) */
function begruessung(z: Zustand, s: Stufe, a: LernstandAntwort): string {
  const t7 = a.fleiss.tage7
  const neu = a.zahlen.sicherNeu
  const seit = a.fleiss.seitTagen ?? 0
  const tage = (n: number): string => `${n} ${n === 1 ? 'Tag' : 'Tage'}`
  switch (z) {
    case 'erfolgreich_fleissig':
      return s === 'grund'
        ? 'Du hast ganz viel geschafft. Schau, was du alles kannst!'
        : s === 'unter'
          ? `Starke Woche: ${tage(t7)} geübt${neu ? ` und ${neu} neu sicher` : ''}.`
          : s === 'ober'
            ? `Solide Woche: ${tage(t7)} aktiv, ${a.zahlen.sicher} von ${a.zahlen.gesamt} sicher.`
            : `Gute Woche. ${tage(t7)} aktiv${neu ? `, ${neu} Einträge neu sicher` : ''}.`
    case 'fleissig':
      return s === 'grund'
        ? 'Du übst so tapfer! Heute probieren wir einen neuen Trick.'
        : s === 'unter'
          ? 'Du bleibst dran – das zählt. Unten wartet ein Trick, der dir hilft.'
          : s === 'ober'
            ? `Hohe Aktivität (${tage(a.fleiss.tage14)} in zwei Wochen), die Genauigkeit stagniert. Ein Strategiewechsel hilft – siehe Tipp.`
            : `Du hast an ${tage(t7)} geübt. Die Treffer steigen noch nicht – der Tipp unten zeigt einen anderen Weg.`
    case 'erfolgreich':
      return s === 'grund'
        ? 'Du kannst schon viel! Magst du heute 5 Minuten üben, damit es bleibt?'
        : s === 'unter'
          ? 'Dein Wissen sitzt gut. Kleine Auffrischung heute? Dauert 5 Minuten.'
          : s === 'ober'
            ? seit >= 3
              ? `Stoff gut; letzte Übung vor ${seit} Tagen. Kurze Auffrischung empfohlen.`
              : 'Stoff gut. Eine kurze Wiederholung in ein paar Tagen sichert das.'
            : 'Stand gut. Eine Wiederholung nach ein paar Tagen sichert das – eine Runde reicht.'
    case 'inaktiv':
      return s === 'grund'
        ? 'Schön, dass du wieder da bist!'
        : s === 'unter'
          ? 'Willkommen zurück! Starten wir mit einer leichten Runde.'
          : s === 'ober'
            ? `Letzte Aktivität vor ${seit} Tagen. Vorschlag: 10 Minuten Wiedereinstieg mit offenen Themen.`
            : 'Willkommen zurück. Kurze Aufwärmrunde zum Wiedereinstieg?'
    case 'neu':
      return s === 'grund'
        ? 'Das ist dein Lernort. Los geht’s!'
        : s === 'unter'
          ? 'Hier siehst du, was ansteht – und wie weit du schon bist.'
          : s === 'ober'
            ? 'Überblick: Unten steht, was für dich freigeschaltet ist.'
            : 'Hier findest du alles, was für dich freigeschaltet ist. Wähl einen Startpunkt.'
    default:
      return t7 > 0 ? `Schön, dass du da bist. Diese Woche: ${tage(t7)} geübt.` : 'Schön, dass du da bist. Hier ist, was ansteht.'
  }
}

/** Das kleine Maskottchen (eigene Zeichnung, keine KI): Eule mit Posen – Kl. 1–6 */
export function Eule({ pose, groesse = 96 }: { pose: 'jubelt' | 'winkt' | 'coach' | 'lupe' | 'cool'; groesse?: number }): React.JSX.Element {
  const fluegelL = pose === 'jubelt' ? 'rotate(-55 34 62)' : pose === 'winkt' ? 'rotate(-70 34 62)' : 'rotate(8 34 62)'
  const fluegelR = pose === 'jubelt' ? 'rotate(55 86 62)' : pose === 'coach' || pose === 'lupe' ? 'rotate(-35 86 62)' : 'rotate(-8 86 62)'
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 120 120" aria-hidden className={`sl-eule sl-eule-${pose}`} data-maskottchen={pose}>
      <ellipse cx="60" cy="112" rx="30" ry="5" fill="rgba(0,0,0,0.12)" />
      <g transform={fluegelL}>
        <ellipse cx="30" cy="70" rx="11" ry="22" fill="#7048e8" />
      </g>
      <g transform={fluegelR}>
        <ellipse cx="90" cy="70" rx="11" ry="22" fill="#7048e8" />
      </g>
      <ellipse cx="60" cy="68" rx="32" ry="38" fill="#845ef7" />
      <ellipse cx="60" cy="80" rx="20" ry="22" fill="#e5dbff" />
      <path d="M34 34 L40 18 L50 32 Z M86 34 L80 18 L70 32 Z" fill="#7048e8" />
      {pose === 'cool' ? (
        <g>
          <rect x="34" y="44" width="22" height="13" rx="5" fill="#212529" />
          <rect x="64" y="44" width="22" height="13" rx="5" fill="#212529" />
          <rect x="55" y="47" width="10" height="3" fill="#212529" />
          <rect x="38" y="46" width="7" height="3" rx="1.5" fill="rgba(255,255,255,0.5)" />
        </g>
      ) : (
        <g>
          <circle cx="46" cy="50" r="11" fill="#fff" />
          <circle cx="74" cy="50" r="11" fill="#fff" />
          <circle cx={pose === 'lupe' ? 49 : 47} cy="51" r="5" fill="#212529" />
          <circle cx={pose === 'lupe' ? 77 : 73} cy="51" r="5" fill="#212529" />
          <circle cx="45" cy="49" r="1.6" fill="#fff" />
          <circle cx="71" cy="49" r="1.6" fill="#fff" />
        </g>
      )}
      <path d="M56 60 L64 60 L60 67 Z" fill="#fab005" />
      {(pose === 'jubelt' || pose === 'cool') && <path d="M50 72 Q60 80 70 72" stroke="#5f3dc4" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      {pose === 'coach' && (
        <g>
          <path d="M30 30 Q60 6 90 30 L90 34 L30 34 Z" fill="#1c7ed6" />
          <rect x="84" y="30" width="18" height="5" rx="2.5" fill="#1971c2" />
          <line x1="60" y1="66" x2="70" y2="86" stroke="#495057" strokeWidth="1.5" />
          <circle cx="71" cy="89" r="4" fill="#adb5bd" />
        </g>
      )}
      {pose === 'lupe' && (
        <g>
          <circle cx="100" cy="40" r="10" fill="rgba(255,255,255,0.6)" stroke="#495057" strokeWidth="3" />
          <line x1="94" y1="48" x2="88" y2="58" stroke="#495057" strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}

const STRATEGIE_NAME: Record<Strategie, string> = {
  abruf: 'Abrufen',
  verteilen: 'Verteilt üben',
  interleaving: 'Themen mischen',
  selbsterklaerung: 'Sich selbst erklären',
  elaboration: 'Verknüpfen',
  fehleranalyse: 'Fehler verstehen',
  planung: 'Planen'
}

/** Begrüßungsbox (Kopf der Startseite) */
export function Begruessung({
  vorname,
  stand,
  naechstes
}: {
  vorname: string
  stand: LernstandAntwort | null
  naechstes: Knopf | null
}): React.JSX.Element {
  const stunde = new Date().getHours()
  const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 17 ? 'Hallo' : 'Guten Abend'
  const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const s = stand?.stufe ?? 'neutral'
  const z = stand?.zustand ?? 'neutral'
  // „Cool" nur mit Fleiß-Anteil (kosmetisch): wer dranbleibt, bekommt den Look – unabhängig von der Leistung
  const cool = Boolean(stand?.fleiss.fleissig)
  const pose = z === 'erfolgreich_fleissig' ? (s === 'unter' ? 'cool' : 'jubelt') : z === 'fleissig' ? (s === 'grund' ? 'lupe' : 'coach') : z === 'neu' || z === 'inaktiv' ? 'winkt' : s === 'unter' ? 'coach' : 'winkt'
  const text = stand ? begruessung(z, s, stand) : '…'
  // Bei „wenig aktiv" und „länger inaktiv": eine kurze Runde vorschlagen (nie eine Fehltage-Zahl für Jüngere)
  const runde = stand?.bereiche.find((b) => b.faellig > 0 && b.art !== 'blaetter') ?? stand?.bereiche.find((b) => b.art !== 'blaetter')
  const knopf: Knopf | null =
    (z === 'erfolgreich' || z === 'inaktiv') && runde
      ? { text: z === 'inaktiv' ? (s === 'grund' ? 'Leichte Runde starten' : 'Aufwärmrunde starten') : 'Kurze Runde starten', href: runde.href }
      : z === 'neu' && naechstes
        ? { text: s === 'grund' ? 'Los geht’s' : naechstes.text, href: naechstes.href }
        : null
  const regen = z === 'erfolgreich_fleissig' && (s === 'grund' || s === 'unter')
  return (
    <div className={`sl-kopf sl-${s}${cool ? ' sl-cool' : ''}`} data-begruessung={z} data-stufe={s}>
      <style>{START_CSS}</style>
      {regen && (
        <div className="sl-regen" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.09}s` }}>
              ★
            </span>
          ))}
        </div>
      )}
      <Group wrap="nowrap" align="center" gap="md" style={{ position: 'relative' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text className="sl-datum">{heute}</Text>
          <Title order={2} className="sl-gruss" data-gruss>
            {gruss}
            {vorname ? `, ${vorname}` : ''}!
          </Title>
          <Group gap={6} wrap="nowrap" align="flex-start">
            <Text className="sl-unter" data-begruessung-text>
              {text}
            </Text>
            {stand && <VorleseKnopf text={`${gruss}${vorname ? `, ${vorname}` : ''}! ${text}`} farbe="gray" />}
          </Group>
          {stand && <Auszeichnungen a={stand} />}
          {(knopf || (z === 'neu' && s === 'mittel')) && (
            <Group gap="xs" mt="sm">
              {knopf && (
                <Button component="a" href={knopf.href} radius="xl" variant="white" color="dark" rightSection={<IconArrowRight size={16} />} data-begruessung-knopf>
                  {knopf.text}
                </Button>
              )}
              {z === 'neu' && s === 'mittel' && (
                <Button component="a" href="/s/lernen" radius="xl" variant="outline" color="gray.0">
                  Zum Lernraum
                </Button>
              )}
            </Group>
          )}
        </div>
        {(s === 'grund' || s === 'unter') && (
          <div className="sl-figur">
            <Eule pose={pose} groesse={s === 'grund' ? 112 : 88} />
          </div>
        )}
      </Group>
      {stand && s === 'ober' && <Kurzstatistik a={stand} />}
    </div>
  )
}

/**
 * Abzeichen (Kl. 5–6) und Meilensteine (Kl. 7–10) – informativ, nicht vorab versprochen; Fleiß- und
 * Sicher-Abzeichen getrennt. Kl. 1–4: Sterne für die Übungstage der Woche.
 */
function Auszeichnungen({ a }: { a: LernstandAntwort }): React.JSX.Element | null {
  const s = a.stufe
  if (s === 'grund') {
    const tage = new Set(a.tage)
    const woche = dieseWoche()
    return (
      <Group gap={4} mt={8} data-wochen-sterne aria-label={`Diese Woche an ${a.serie.dieseWoche} Tagen geübt`}>
        {woche.map((t, i) => (
          <Tooltip key={t} label={WOCHENTAGE[i]}>
            <span className={`sl-stern${tage.has(t) ? ' an' : ''}`}>{tage.has(t) ? <IconStarFilled size={20} /> : <IconStar size={20} />}</span>
          </Tooltip>
        ))}
      </Group>
    )
  }
  if (s === 'ober' || s === 'neutral') return null
  const liste: { text: string; art: 'fleiss' | 'sicher' }[] = []
  if (s === 'unter') {
    if (a.fleiss.fleissig) liste.push({ text: 'Dranbleiber', art: 'fleiss' })
    if (a.serie.serie >= 2) liste.push({ text: `${a.serie.serie} Lernwochen in Folge`, art: 'fleiss' })
    if ((a.zahlen.sicherNeu ?? 0) >= 5) liste.push({ text: 'Sicher-Sammler', art: 'sicher' })
  } else {
    if (a.serie.serie >= 2) liste.push({ text: `${a.serie.serie} Lernwochen`, art: 'fleiss' })
    const marke = [500, 250, 100, 50, 25].find((m) => a.zahlen.sicher >= m)
    if (marke) liste.push({ text: `Meilenstein: ${marke} sicher`, art: 'sicher' })
    if ((a.zahlen.sicherNeu ?? 0) >= 10) liste.push({ text: `+${a.zahlen.sicherNeu} diese Woche`, art: 'sicher' })
  }
  if (!liste.length) return null
  return (
    <Group gap={6} mt={8} data-abzeichen>
      {liste.map((x) => (
        <span key={x.text} className={`sl-abzeichen sl-${x.art}`}>
          {x.art === 'fleiss' ? <IconFlame size={14} /> : <IconCheck size={14} />} {x.text}
        </span>
      ))}
    </Group>
  )
}

/** Kl. 11–13: sachliche Kurzstatistik */
function Kurzstatistik({ a }: { a: LernstandAntwort }): React.JSX.Element {
  const werte = [
    { name: 'Übungstage (7 T.)', wert: `${a.fleiss.tage7}/${a.serie.ziel}` },
    { name: 'sicher', wert: a.zahlen.gesamt ? `${a.zahlen.sicher}/${a.zahlen.gesamt}` : '–' },
    { name: 'seit Vorwoche', wert: a.zahlen.sicherNeu === null ? '–' : `+${a.zahlen.sicherNeu}` },
    { name: 'letzter Test', wert: a.zahlen.testsZuletzt === null ? '–' : `${a.zahlen.testsZuletzt} %` }
  ]
  return (
    <SimpleGrid cols={{ base: 2, xs: 4 }} spacing={8} mt="md" data-kurzstatistik>
      {werte.map((w) => (
        <div key={w.name} className="sl-zahl">
          <Text fw={800} size="lg">
            {w.wert}
          </Text>
          <Text size="xs" style={{ opacity: 0.8 }}>
            {w.name}
          </Text>
        </div>
      ))}
    </SimpleGrid>
  )
}

/** Genau ein Lerntipp mit Knopf; der Wochenrückblick (KI) lässt sich als gelesen markieren */
export function TippKarte({ stand, gelesen }: { stand: LernstandAntwort; gelesen: () => void }): React.JSX.Element | null {
  const t = stand.tipp
  if (!t) return null
  const ki = stand.wochenrueckblick
  return (
    <Paper className="sl-tipp" radius="xl" p="lg" data-tipp={ki ? 'ki' : 'regel'}>
      <Group wrap="nowrap" align="flex-start" gap="md">
        <ThemeIcon size={46} radius="xl" variant="light" color={ki ? 'grape' : 'yellow'} className="sl-tipp-symbol">
          {ki ? <IconSparkles size={24} /> : <IconBulb size={24} />}
        </ThemeIcon>
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8}>
            <Text size="xs" tt="uppercase" fw={800} c={ki ? 'grape' : 'yellow.8'}>
              {ki ? 'Dein Wochenrückblick' : 'Dein Tipp'}
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {STRATEGIE_NAME[t.strategie]}
            </Badge>
          </Group>
          <Group gap={4} wrap="nowrap" align="flex-start">
            <Text fw={500} data-tipp-text style={{ flex: 1 }}>
              {t.text}
            </Text>
            <VorleseKnopf text={t.text} />
          </Group>
          <Group gap="xs" mt={4}>
            {t.knopf && (
              <Button component="a" href={t.knopf.href} radius="xl" rightSection={<IconArrowRight size={16} />} data-tipp-knopf>
                {t.knopf.text}
              </Button>
            )}
            {ki && (
              <Button variant="subtle" color="gray" radius="xl" onClick={gelesen} data-tipp-gelesen>
                Gelesen
              </Button>
            )}
          </Group>
        </Stack>
      </Group>
    </Paper>
  )
}

const BEREICH_SYMBOL = { vokabeln: <IconLanguage size={18} />, grammatik: <IconBook size={18} />, blaetter: <IconFileText size={18} /> }
/** Stufenfarben: von warm (neu) nach kühl (sicher) – wie im Karteikasten, kein Rot */
const STUFE_FARBE = { neu: '#cbd5e1', arbeit: '#fbbf24', sicher: '#14b8a6' }

/** Stufenbalken neu / in Arbeit / sicher */
function StufenBalken({ neu, arbeit, sicher }: { neu: number; arbeit: number; sicher: number }): React.JSX.Element {
  const ges = Math.max(1, neu + arbeit + sicher)
  return (
    <Progress.Root size={12} radius="xl" aria-hidden>
      <Progress.Section value={(sicher / ges) * 100} color={STUFE_FARBE.sicher} />
      <Progress.Section value={(arbeit / ges) * 100} color={STUFE_FARBE.arbeit} />
      <Progress.Section value={(neu / ges) * 100} color={STUFE_FARBE.neu} />
    </Progress.Root>
  )
}

/** Sterne statt Zahl (Kl. 1–4): Anteil sicher → 0–5 Sterne */
function Sterne({ anteil }: { anteil: number }): React.JSX.Element {
  const n = Math.round(Math.max(0, Math.min(1, anteil)) * 5)
  return (
    <Group gap={2} data-sterne={n}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`sl-stern klein${i < n ? ' an' : ''}`}>
          {i < n ? <IconStarFilled size={16} /> : <IconStar size={16} />}
        </span>
      ))}
    </Group>
  )
}

/** Lernstand: links „Mein Stand", rechts „Mein Fortschritt" – getrennt, ohne Vergleich */
export function Lernstand({
  stand,
  reihen
}: {
  stand: LernstandAntwort
  reihen: { id: string; titel: string; fortschritt: number; fertig: boolean }[]
}): React.JSX.Element {
  const symbole = stand.stufe === 'grund'
  const tage = useMemo(() => new Set(stand.tage), [stand.tage])
  const woche = dieseWoche()
  const heute = new Date().toISOString().slice(0, 10)
  const hatStand = stand.bereiche.length > 0 || reihen.length > 0
  const offeneReihen = reihen.filter((r) => !r.fertig).slice(0, 3)
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" data-lernstand>
      <Paper withBorder radius="xl" p="lg" className="sl-karte" data-mein-stand>
        <Group gap="xs" mb="sm">
          <ThemeIcon variant="light" radius="md" color="teal">
            <IconCheck size={18} />
          </ThemeIcon>
          <Title order={4}>{symbole ? 'Das kannst du schon' : 'Mein Stand'}</Title>
        </Group>
        {!hatStand && (
          <Text size="sm" c="dimmed">
            Sobald deine Lehrkraft etwas freischaltet, siehst du hier, was schon sitzt.
          </Text>
        )}
        <Stack gap="sm">
          {stand.bereiche.slice(0, 6).map((b) => {
            const blatt = b.art === 'blaetter'
            return (
              <a key={`${b.art}-${b.href}`} href={b.href} className="sl-zeile" data-stand-bereich={b.art}>
                <Group justify="space-between" wrap="nowrap" mb={4} gap="xs">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <span className="sl-zeile-symbol">{BEREICH_SYMBOL[b.art]}</span>
                    <Text fw={600} size="sm" truncate>
                      {b.titel}
                    </Text>
                  </Group>
                  {symbole ? (
                    <Sterne anteil={b.gesamt ? b.sicher / b.gesamt : 0} />
                  ) : (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {blatt ? `${b.sicher} von ${b.gesamt} bearbeitet` : `${b.sicher} von ${b.gesamt} sicher`}
                    </Text>
                  )}
                </Group>
                <StufenBalken neu={b.neu} arbeit={b.inArbeit} sicher={b.sicher} />
              </a>
            )
          })}
          {offeneReihen.map((r) => (
            <a key={r.id} href={`/s/r/${r.id}`} className="sl-zeile" data-stand-bereich="reihe">
              <Group justify="space-between" wrap="nowrap" mb={4} gap="xs">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <span className="sl-zeile-symbol">
                    <IconRoute size={18} />
                  </span>
                  <Text fw={600} size="sm" truncate>
                    {r.titel}
                  </Text>
                </Group>
                {symbole ? (
                  <Sterne anteil={r.fortschritt} />
                ) : (
                  <Text size="xs" c="dimmed">
                    {Math.round(r.fortschritt * 100)} % des Wegs
                  </Text>
                )}
              </Group>
              <Progress value={r.fortschritt * 100} color="indigo" size={12} radius="xl" />
            </a>
          ))}
        </Stack>
        {hatStand && (
          <Group gap="md" mt="sm" className="sl-legende">
            <Legende farbe={STUFE_FARBE.sicher} text={symbole ? 'sitzt' : 'sicher'} />
            <Legende farbe={STUFE_FARBE.arbeit} text={symbole ? 'üben wir' : 'in Arbeit'} />
            <Legende farbe={STUFE_FARBE.neu} text="neu" />
          </Group>
        )}
      </Paper>

      <Paper withBorder radius="xl" p="lg" className="sl-karte" data-mein-fortschritt>
        <Group gap="xs" mb="sm">
          <ThemeIcon variant="light" radius="md" color="indigo">
            <IconTrendingUp size={18} />
          </ThemeIcon>
          <Title order={4}>{symbole ? 'So weit bist du gekommen' : 'Mein Fortschritt'}</Title>
        </Group>
        <Text size="sm" fw={600} mb={6}>
          Diese Woche
          {!symbole && (
            <Text span size="sm" c="dimmed" fw={400}>
              {' '}
              · {stand.serie.dieseWoche} von {stand.serie.ziel} Übungstagen
            </Text>
          )}
        </Text>
        <div className="sl-woche" data-wochenleiste>
          {woche.map((t, i) => (
            <div key={t} className={`sl-tag${tage.has(t) ? ' an' : ''}${t === heute ? ' heute' : ''}`}>
              <span className="sl-punkt">{tage.has(t) ? symbole ? <IconStarFilled size={14} /> : <IconCheck size={14} /> : null}</span>
              <Text size="xs" c="dimmed">
                {WOCHENTAGE[i]}
              </Text>
            </div>
          ))}
        </div>
        <Stack gap={8} mt="md">
          {stand.serie.serie >= 1 && (
            <Group gap={8} wrap="nowrap" data-wochenserie>
              <ThemeIcon variant="light" color="orange" radius="xl" size="md">
                <IconCalendarCheck size={16} />
              </ThemeIcon>
              <Text size="sm">
                {symbole
                  ? 'Du hast dein Wochenziel geschafft!'
                  : stand.serie.serie === 1
                    ? 'Wochenziel erreicht.'
                    : `${stand.serie.serie} Lernwochen in Folge mit erreichtem Wochenziel.`}
              </Text>
            </Group>
          )}
          {stand.zahlen.sicherNeu !== null && stand.zahlen.sicherNeu > 0 && (
            <Group gap={8} wrap="nowrap" data-zuwachs>
              <ThemeIcon variant="light" color="teal" radius="xl" size="md">
                <IconTrendingUp size={16} />
              </ThemeIcon>
              <Text size="sm">
                {symbole
                  ? 'Seit letzter Woche kannst du mehr Wörter sicher!'
                  : `+${stand.zahlen.sicherNeu} ${stand.zahlen.sicherNeu === 1 ? 'Eintrag' : 'Einträge'} sicher seit letzter Woche.`}
              </Text>
            </Group>
          )}
          {stand.leistung.trend === 'gleich' && stand.zahlen.sicherNeu !== null && !stand.zahlen.sicherNeu && (
            <Text size="sm" c="dimmed">
              Dein Stand ist gehalten – neue Einträge werden mit der nächsten Runde sicher.
            </Text>
          )}
          {stand.leistung.trend === 'sinkt' && (
            <Text size="sm" c="dimmed" data-trend="wackelig">
              Einiges ist wieder wackelig geworden – das ist normal. Eine Wiederholungsrunde holt es zurück.
            </Text>
          )}
          {stand.zahlen.sicherNeu === null && stand.fleiss.tage14 === 0 && (
            <Text size="sm" c="dimmed">
              Sobald du übst, siehst du hier, wie du vorankommst – nur im Vergleich mit dir selbst.
            </Text>
          )}
        </Stack>
      </Paper>
    </SimpleGrid>
  )
}

function Legende({ farbe, text }: { farbe: string; text: string }): React.JSX.Element {
  return (
    <Group gap={4} wrap="nowrap">
      <span style={{ width: 10, height: 10, borderRadius: 3, background: farbe, display: 'inline-block' }} />
      <Text size="xs" c="dimmed">
        {text}
      </Text>
    </Group>
  )
}

const START_CSS = `
.sl-kopf { position: relative; overflow: hidden; border-radius: 24px; padding: 24px 22px 24px; color: #fff;
  background: linear-gradient(135deg, #4c6ef5 0%, #7048e8 45%, #15aabf 100%); box-shadow: 0 10px 30px rgba(76,110,245,0.25);
  animation: sl-rein .45s ease-out both; }
.sl-kopf.sl-grund { background: linear-gradient(135deg, #ff922b 0%, #f06595 50%, #845ef7 100%); box-shadow: 0 10px 30px rgba(240,101,149,0.28); }
.sl-kopf.sl-unter { background: linear-gradient(135deg, #12b886 0%, #228be6 55%, #7048e8 100%); }
.sl-kopf.sl-mittel { background: radial-gradient(120% 140% at 0% 0%, #1e293b 0%, #0b1020 60%, #05070f 100%); border: 1px solid rgba(124,140,255,0.25);
  box-shadow: 0 0 0 1px rgba(124,140,255,0.08), 0 12px 30px rgba(0,0,0,0.35); }
.sl-kopf.sl-mittel.sl-cool { box-shadow: 0 0 22px rgba(92,124,250,0.35), 0 12px 30px rgba(0,0,0,0.35); animation: sl-rein .45s ease-out both, sl-leuchten 1.6s ease-out 1; }
.sl-kopf.sl-mittel::before { content: ''; position: absolute; inset: -40% -10% auto auto; width: 60%; height: 120%;
  background: radial-gradient(closest-side, rgba(92,124,250,0.28), transparent); pointer-events: none; }
.sl-kopf.sl-ober { background: var(--mantine-color-body); color: var(--mantine-color-text); border: 1px solid var(--mantine-color-default-border); box-shadow: none; }
.sl-kopf.sl-ober .sl-gruss { color: var(--mantine-color-text); }
.sl-kopf.sl-ober .sl-zahl { background: var(--mantine-color-default-hover); }
.sl-gruss { color: inherit; position: relative; font-size: clamp(1.5rem, 5vw, 2.1rem); }
.sl-grund .sl-gruss { font-size: clamp(1.7rem, 6vw, 2.4rem); }
.sl-datum { position: relative; opacity: 0.85; font-size: 0.85rem; text-transform: capitalize; }
.sl-unter { position: relative; opacity: 0.96; margin-top: 4px; font-size: 1.02rem; }
.sl-figur { flex: none; animation: sl-hops .9s ease-out 1; }
.sl-eule-jubelt { animation: sl-hops .9s ease-out 2; }
.sl-regen { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.sl-regen span { position: absolute; top: -24px; color: #ffe066; font-size: 20px; animation: sl-fallen 1.7s ease-in 1 both; text-shadow: 0 0 6px rgba(255,224,102,0.7); }
.sl-abzeichen { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: .8rem; font-weight: 700;
  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.35); }
.sl-mittel .sl-abzeichen { background: rgba(92,124,250,0.12); border-color: rgba(124,140,255,0.45); color: #c5d0ff; }
.sl-mittel .sl-abzeichen.sl-sicher { border-color: rgba(56,217,169,0.5); color: #a6f4dc; background: rgba(56,217,169,0.1); }
.sl-zahl { border-radius: 12px; padding: 8px 10px; background: rgba(255,255,255,0.12); }
.sl-stern { color: rgba(255,255,255,0.55); display: inline-flex; }
.sl-stern.an { color: #ffe066; filter: drop-shadow(0 0 3px rgba(255,224,102,0.6)); }
.sl-stern.klein { color: var(--mantine-color-gray-4); }
.sl-stern.klein.an { color: #fab005; filter: none; }
.sl-tipp { position: relative; border: 1px solid var(--mantine-color-default-border); background: linear-gradient(135deg, var(--mantine-color-yellow-light) 0%, var(--mantine-color-body) 60%); }
.sl-tipp[data-tipp='ki'] { background: linear-gradient(135deg, var(--mantine-color-grape-light) 0%, var(--mantine-color-body) 65%); }
.sl-tipp-symbol { animation: sl-hops .8s ease-out 1; }
.sl-karte { background: var(--mantine-color-body); }
.sl-zeile { display: block; text-decoration: none; color: inherit; padding: 6px 8px; margin: 0 -8px; border-radius: 12px; transition: background .15s; }
.sl-zeile:hover, .sl-zeile:focus-visible { background: var(--mantine-color-default-hover); }
.sl-zeile-symbol { display: inline-flex; color: var(--mantine-color-dimmed); }
.sl-woche { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.sl-tag { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.sl-punkt { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; border: 2px dashed var(--mantine-color-default-border); color: #fff; }
.sl-tag.an .sl-punkt { border: 0; background: linear-gradient(135deg, #20c997, #12b886); box-shadow: 0 3px 8px rgba(18,184,134,0.3); }
.sl-tag.heute .sl-punkt { outline: 2px solid var(--mantine-primary-color-filled); outline-offset: 2px; }
@keyframes sl-rein { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes sl-hops { 0% { transform: translateY(0) } 35% { transform: translateY(-10px) } 65% { transform: translateY(0) } 80% { transform: translateY(-3px) } 100% { transform: none } }
@keyframes sl-fallen { 0% { transform: translateY(0) rotate(0); opacity: 0 } 15% { opacity: 1 } 100% { transform: translateY(220px) rotate(200deg); opacity: 0 } }
@keyframes sl-leuchten { 0% { box-shadow: 0 0 0 rgba(92,124,250,0) } 50% { box-shadow: 0 0 34px rgba(92,124,250,0.55) } 100% { box-shadow: 0 0 22px rgba(92,124,250,0.35) } }
html.sa-ruhig .sl-kopf, html.sa-ruhig .sl-figur, html.sa-ruhig .sl-eule-jubelt, html.sa-ruhig .sl-tipp-symbol, html.sa-ruhig .sl-zeile { animation: none !important; transition: none; }
html.sa-ruhig .sl-regen { display: none; }
@media (prefers-reduced-motion: reduce) {
  .sl-kopf, .sl-figur, .sl-eule-jubelt, .sl-tipp-symbol { animation: none !important; }
  .sl-regen { display: none; }
}
`
