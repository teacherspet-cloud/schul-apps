/**
 * Sicht einer Person auf den laufenden Schritt der Partnerarbeit (24.10.2026, abgestimmt mit der Lehrkraft) – für die
 * Lernenden (PartnerarbeitSeite) UND die Vorschau der Lehrkraft (PartnerVorschau, Fenster geteilt A|B|C). Der Inhalt
 * kommt fertig gefiltert aus shared/partnerarbeit/ablauf.ts (`sichtSchritt`): nur die eigene Rollenkarte, Hilfen nur
 * freigeschaltet, keine Namen. Knöpfe lösen Aktionen aus (haken, freischalten, naechste, wechsel, fertig, weiter,
 * rueckmeldung); wer sie ausführt, entscheidet der Aufrufer.
 *
 * Altersgerecht in drei Stufen (abgestimmt 24.10.2026):
 *  - Jg 5–7 („unter"): große Schrift, beim Interview eine Frage auf einmal mit „Nächste Frage" und Fortschrittspunkten,
 *    Symbole an jeder Hilfe, kurze deutsche Hinweise, warme Farbe.
 *  - Jg 8–10 („mittel"): alle Fragen als Liste, Hilfen als aufklappbare Karten, zurückhaltende Farbe.
 *  - Jg 11–13 („ober"): nüchterne Prüfungsoptik, Beschriftungen in der Zielsprache, Uhr prominent, keine Hinweise
 *    „wann" an den Phrases.
 */
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowsExchange,
  IconBook2,
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconLockOpen,
  IconMessage,
  IconMessages,
  IconPlayerTrackNext,
  IconQuote
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { HILFE_NAME, type HilfeArt, type SchrittSicht } from '@shared/partnerarbeit/ablauf'
import { PA_TEIL_NAME } from '@shared/partnerarbeit/typen'
import { symbolName } from '@shared/partnerarbeit/symbole'
import { SymbolBild } from './SymbolBild'

export type Stufe = 'unter' | 'mittel' | 'ober'
export const stufeVon = (jahrgang: number | null | undefined): Stufe =>
  jahrgang != null && jahrgang <= 7 ? 'unter' : jahrgang != null && jahrgang >= 11 ? 'ober' : 'mittel'

export interface Mitglied {
  symbol: string
  ich: boolean
  online: boolean
  rolle?: string
}

const SMILEYS = ['🙁', '🙂', '😀']
const KRITERIEN = ['Verständlich', 'Wortschatz', 'Redefluss']

/** Beschriftungen – Oberstufe in der Zielsprache (Prüfungsoptik), sonst Deutsch */
type Schluessel =
  | 'fragst'
  | 'sprichst'
  | 'hilfst'
  | 'dran'
  | 'runde'
  | 'esAntwortet'
  | 'esSpricht'
  | 'naechsteFrage'
  | 'frageVon'
  | 'interviewt'
  | 'gleichDran'
  | 'stockt'
  | 'leitfragen'
  | 'deineRolle'
  | 'rolleN'
  | 'vorschlaege'
  | 'wortschatz'
  | 'phrases'
  | 'mehrPhrases'
  | 'beispiele'
  | 'freischaltenPartner'
  | 'freischaltenMich'
  | 'freischaltenSprechende'
  | 'andere'
  | 'rundeBeenden'
  | 'fertig'
  | 'weiter'
  | 'ziel'
const TEXTE: Record<string, Record<Schluessel, string>> = {
  de: {
    fragst: 'Du fragst / moderierst',
    sprichst: 'Du sprichst',
    hilfst: 'Du hilfst',
    dran: 'Du bist dran',
    runde: 'Runde',
    esAntwortet: 'Es antwortet:',
    esSpricht: 'Es spricht:',
    naechsteFrage: 'Nächste Frage',
    frageVon: 'Frage',
    interviewt: 'Du wirst interviewt. Antworte in ganzen Sätzen und frag nach, wenn du etwas nicht verstehst.',
    gleichDran: 'Gleich bist du dran – hör gut zu.',
    stockt: 'Wenn es stockt – Fragen zum Weiterhelfen',
    leitfragen: 'Leitfragen',
    deineRolle: 'Deine Rolle',
    rolleN: 'Rolle',
    vorschlaege: 'Vorschläge',
    wortschatz: 'Wortschatz',
    phrases: 'Useful phrases',
    mehrPhrases: 'mehr Phrases',
    beispiele: 'Beispielsätze',
    freischaltenPartner: 'Für deinen Partner freischalten',
    freischaltenMich: 'Für mich freischalten',
    freischaltenSprechende: 'Für die Sprechenden freischalten',
    andere: 'Jetzt der/die andere',
    rundeBeenden: 'Runde beenden',
    fertig: 'Fertig',
    weiter: 'Weiter',
    ziel: 'Ziel'
  },
  en: {
    fragst: 'You ask / moderate',
    sprichst: 'You speak',
    hilfst: 'You help',
    dran: 'Your turn',
    runde: 'Round',
    esAntwortet: 'Answering:',
    esSpricht: 'Speaking:',
    naechsteFrage: 'Next question',
    frageVon: 'Question',
    interviewt: 'You are being interviewed. Answer in full sentences and ask if you do not understand.',
    gleichDran: 'Your turn is next – listen carefully.',
    stockt: 'If your partner gets stuck – prompts',
    leitfragen: 'Guiding questions',
    deineRolle: 'Your role',
    rolleN: 'Role',
    vorschlaege: 'Ideas',
    wortschatz: 'Vocabulary',
    phrases: 'Useful phrases',
    mehrPhrases: 'more phrases',
    beispiele: 'Model sentences',
    freischaltenPartner: 'Unlock for your partner',
    freischaltenMich: 'Unlock for me',
    freischaltenSprechende: 'Unlock for the speakers',
    andere: 'Next speaker',
    rundeBeenden: 'End this round',
    fertig: 'Finished',
    weiter: 'Continue',
    ziel: 'Goal'
  },
  fr: {
    fragst: 'Tu poses les questions / tu animes',
    sprichst: 'Tu parles',
    hilfst: 'Tu aides',
    dran: "C'est à toi",
    runde: 'Tour',
    esAntwortet: 'Répond :',
    esSpricht: 'Parle :',
    naechsteFrage: 'Question suivante',
    frageVon: 'Question',
    interviewt: 'On t’interroge. Réponds par des phrases complètes et demande si tu ne comprends pas.',
    gleichDran: "C'est bientôt à toi – écoute bien.",
    stockt: 'En cas de blocage – questions pour aider',
    leitfragen: 'Questions-guides',
    deineRolle: 'Ton rôle',
    rolleN: 'Rôle',
    vorschlaege: 'Idées',
    wortschatz: 'Vocabulaire',
    phrases: 'Expressions utiles',
    mehrPhrases: "plus d'expressions",
    beispiele: 'Phrases modèles',
    freischaltenPartner: 'Débloquer pour ton partenaire',
    freischaltenMich: 'Débloquer pour moi',
    freischaltenSprechende: 'Débloquer pour les locuteurs',
    andere: 'Au suivant',
    rundeBeenden: 'Terminer le tour',
    fertig: 'Terminé',
    weiter: 'Continuer',
    ziel: 'Objectif'
  },
  es: {
    fragst: 'Tú preguntas / moderas',
    sprichst: 'Tú hablas',
    hilfst: 'Tú ayudas',
    dran: 'Te toca',
    runde: 'Ronda',
    esAntwortet: 'Responde:',
    esSpricht: 'Habla:',
    naechsteFrage: 'Siguiente pregunta',
    frageVon: 'Pregunta',
    interviewt: 'Te entrevistan. Responde con frases completas y pregunta si no entiendes algo.',
    gleichDran: 'Pronto te toca – escucha bien.',
    stockt: 'Si se atasca – preguntas para ayudar',
    leitfragen: 'Preguntas guía',
    deineRolle: 'Tu papel',
    rolleN: 'Papel',
    vorschlaege: 'Ideas',
    wortschatz: 'Vocabulario',
    phrases: 'Expresiones útiles',
    mehrPhrases: 'más expresiones',
    beispiele: 'Frases modelo',
    freischaltenPartner: 'Desbloquear para tu compañero',
    freischaltenMich: 'Desbloquear para mí',
    freischaltenSprechende: 'Desbloquear para los hablantes',
    andere: 'Siguiente',
    rundeBeenden: 'Terminar la ronda',
    fertig: 'Listo',
    weiter: 'Continuar',
    ziel: 'Objetivo'
  }
}

function Uhr({ seit, zielMinuten, jetzt, gross }: { seit: number; zielMinuten: number; jetzt: number; gross: boolean }): React.JSX.Element {
  // Die Uhr rechnet mit dem Zeitstempel des Servers (iPad drosselt Zähler im Hintergrund)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  void tick
  const vergangen = Math.max(0, Math.floor((Date.now() - (Date.now() - jetzt) - seit) / 1000))
  const ziel = Math.round(zielMinuten * 60)
  const ueber = vergangen > ziel
  const mm = Math.floor(vergangen / 60)
  const ss = String(vergangen % 60).padStart(2, '0')
  return (
    <Badge
      variant={gross ? 'filled' : 'light'}
      size={gross ? 'xl' : 'md'}
      color={ueber ? 'orange' : 'gray'}
      leftSection={<IconClock size={gross ? 16 : 12} />}
      tt="none"
      data-pa-uhr
    >
      {mm}:{ss} / {zielMinuten} min
    </Badge>
  )
}

/** Eine Hilfe-Karte: Unterstufe mit Symbol, Mittelstufe aufklappbar, Oberstufe schlicht */
function HilfeKarte({
  stufe,
  titel,
  symbol,
  kennung,
  children
}: {
  stufe: Stufe
  titel: string
  symbol: React.ReactNode
  kennung: string
  children: React.ReactNode
}): React.JSX.Element {
  const [offen, setOffen] = useState(stufe !== 'mittel')
  return (
    <Paper withBorder p={stufe === 'unter' ? 'sm' : 'xs'} radius="md" data-pa-hilfe={kennung}>
      {stufe === 'mittel' ? (
        <UnstyledButton onClick={() => setOffen(!offen)} style={{ width: '100%' }} data-pa-hilfe-auf={kennung}>
          <Group gap={6}>
            {offen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Text size="xs" c="dimmed" fw={700}>
              {titel}
            </Text>
          </Group>
        </UnstyledButton>
      ) : (
        <Group gap={6} mb={4}>
          {stufe === 'unter' && symbol}
          <Text size={stufe === 'unter' ? 'sm' : 'xs'} c="dimmed" fw={700}>
            {titel}
          </Text>
        </Group>
      )}
      {stufe === 'mittel' ? <Collapse expanded={offen}>{children}</Collapse> : children}
    </Paper>
  )
}

function Hilfen({
  h,
  sprache,
  stufe,
  t
}: {
  h: SchrittSicht['hilfen']
  sprache: string
  stufe: Stufe
  t: Record<Schluessel, string>
}): React.JSX.Element | null {
  const [mehr, setMehr] = useState(false)
  const leer = !h.wortschatz?.length && !h.phrases?.length && !h.beispiele?.length && !h.vorschlaege?.length
  if (leer) return null
  const fz = stufe === 'unter' ? 'md' : 'sm'
  return (
    <Stack gap="xs" data-pa-hilfen>
      {h.vorschlaege && h.vorschlaege.length > 0 && (
        <HilfeKarte stufe={stufe} titel={t.vorschlaege} symbol={<IconBulb size={18} />} kennung="vorschlaege">
          {h.vorschlaege.map((v, i) => (
            <Text key={i} size={fz} lang={sprache}>
              • {v}
            </Text>
          ))}
        </HilfeKarte>
      )}
      {h.wortschatz && h.wortschatz.length > 0 && (
        <HilfeKarte stufe={stufe} titel={t.wortschatz} symbol={<IconBook2 size={18} />} kennung="wortschatz">
          <Group gap={6}>
            {h.wortschatz.map((w, i) => (
              <Badge
                key={i}
                variant="light"
                color={stufe === 'ober' ? 'gray' : 'teal'}
                tt="none"
                size={stufe === 'unter' ? 'xl' : 'lg'}
                title={w.deutsch}
                lang={sprache}
              >
                {w.wort}
                {w.deutsch ? ` – ${w.deutsch}` : ''}
              </Badge>
            ))}
          </Group>
        </HilfeKarte>
      )}
      {h.phrases && h.phrases.length > 0 && (
        <HilfeKarte stufe={stufe} titel={t.phrases} symbol={<IconMessages size={18} />} kennung="phrases">
          <SimpleGrid cols={{ base: 1, sm: stufe === 'unter' ? 1 : 2 }} spacing={4}>
            {h.phrases.map((p, i) => (
              <div key={i}>
                <Text size={fz} lang={sprache}>
                  {p.text}
                </Text>
                {stufe !== 'ober' && p.deutsch && (
                  <Text size="xs" c="dimmed">
                    {p.deutsch}
                  </Text>
                )}
              </div>
            ))}
          </SimpleGrid>
          {h.mehrPhrases && h.mehrPhrases.length > 0 && (
            <>
              <Button size="compact-xs" variant="subtle" mt={4} onClick={() => setMehr(!mehr)} data-pa-mehr-phrases>
                {mehr ? '−' : '+'} {t.mehrPhrases} ({h.mehrPhrases.length})
              </Button>
              <Collapse expanded={mehr}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={2}>
                  {h.mehrPhrases.map((p, i) => (
                    <Text key={i} size="sm" lang={sprache} title={p.deutsch}>
                      {p.text}
                    </Text>
                  ))}
                </SimpleGrid>
              </Collapse>
            </>
          )}
        </HilfeKarte>
      )}
      {h.beispiele && h.beispiele.length > 0 && (
        <HilfeKarte stufe={stufe} titel={t.beispiele} symbol={<IconQuote size={18} />} kennung="beispiele">
          {h.beispiele.map((b, i) => (
            <Text key={i} size={fz} fs="italic" lang={sprache}>
              {b}
            </Text>
          ))}
        </HilfeKarte>
      )}
    </Stack>
  )
}

function Schalter({ s, aktion, fuerWen }: { s: SchrittSicht; aktion: (a: string, w?: unknown) => void; fuerWen: string }): React.JSX.Element | null {
  if (!s.schalter.length) return null
  return (
    <Paper withBorder p="xs" radius="md" data-pa-schalter>
      <Group gap={6} mb={4}>
        <IconLockOpen size={14} />
        <Text size="xs" c="dimmed" fw={700}>
          {fuerWen}
        </Text>
      </Group>
      <Group gap="md">
        {s.schalter.map((x) => (
          <Switch
            key={x.was}
            size="sm"
            label={HILFE_NAME[x.was as HilfeArt]}
            checked={x.an}
            onChange={(e) => aktion('freischalten', { was: x.was, an: e.currentTarget.checked })}
            data-pa-frei={x.was}
          />
        ))}
      </Group>
    </Paper>
  )
}

function Rueckmeldung({ s, aktion, t }: { s: SchrittSicht; aktion: (a: string, w?: unknown) => void; t: Record<Schluessel, string> }): React.JSX.Element {
  const r = s.rueckmeldung
  const [smileys, setSmileys] = useState<number[]>([1, 1, 1])
  const [satz, setSatz] = useState('')
  return (
    <Card withBorder radius="md" padding="md" data-pa-rueckmeldung>
      {r?.geber && !r.abgegeben ? (
        <Stack gap="sm">
          <Group gap={6}>
            <IconMessage size={16} />
            <Text fw={700}>Kurze Rückmeldung für deine Partner</Text>
          </Group>
          <SimpleGrid cols={3} spacing="xs">
            {KRITERIEN.map((k, i) => (
              <Stack key={k} gap={2} align="center">
                <Text size="xs" c="dimmed">
                  {k}
                </Text>
                <Group gap={2}>
                  {SMILEYS.map((sm, w) => (
                    <Button
                      key={w}
                      size="compact-sm"
                      variant={smileys[i] === w ? 'filled' : 'subtle'}
                      onClick={() => setSmileys(smileys.map((x, j) => (j === i ? w : x)))}
                      data-pa-smiley={`${i}:${w}`}
                    >
                      {sm}
                    </Button>
                  ))}
                </Group>
              </Stack>
            ))}
          </SimpleGrid>
          <Textarea
            placeholder="Ein Satz dazu (optional)"
            autosize
            minRows={1}
            maxLength={200}
            value={satz}
            onChange={(e) => setSatz(e.currentTarget.value)}
            data-pa-satz
          />
          <Group>
            <Button onClick={() => aktion('rueckmeldung', { smileys, satz })} data-pa-rueckmeldung-senden>
              Abschicken
            </Button>
            <Button variant="subtle" onClick={() => aktion('weiter')} data-pa-weiter>
              Ohne Rückmeldung weiter
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Text fw={700}>{s.teil === 'dialog' ? 'Dialog beendet' : 'Runde beendet'}</Text>
          {r?.erhalten.map((e, i) => (
            <Paper key={i} withBorder p="xs" radius="md" data-pa-erhalten>
              <Group gap="md">
                {KRITERIEN.map((k, j) => (
                  <Text key={k} size="sm">
                    {k}: {SMILEYS[e.smileys[j] ?? 1]}
                  </Text>
                ))}
              </Group>
              {e.satz && <Text size="sm">„{e.satz}“</Text>}
            </Paper>
          ))}
          {r && !r.geber && !r.erhalten.length && s.teil !== 'dialog' && (
            <Text size="sm" c="dimmed">
              Dein Partner gibt dir gleich eine kurze Rückmeldung.
            </Text>
          )}
          <Button leftSection={<IconPlayerTrackNext size={16} />} onClick={() => aktion('weiter')} data-pa-weiter>
            {t.weiter}
          </Button>
        </Stack>
      )}
    </Card>
  )
}

/** Interview für A: Unterstufe eine Frage auf einmal, sonst die Liste */
function InterviewFragen({
  s,
  stufe,
  sprache,
  aktion,
  t
}: {
  s: SchrittSicht
  stufe: Stufe
  sprache: string
  aktion: (a: string, w?: unknown) => void
  t: Record<Schluessel, string>
}): React.JSX.Element | null {
  const fragen = s.interview?.fragen ?? []
  const [i, setI] = useState(() =>
    Math.max(
      0,
      fragen.findIndex((f) => !f.haken)
    )
  )
  if (!fragen.length) return null
  if (stufe !== 'unter')
    return (
      <Stack gap={6} mt="xs">
        {fragen.map((f, n) => (
          <div key={n}>
            <Checkbox label={<span lang={sprache}>{f.text}</span>} checked={f.haken} onChange={() => aktion('haken', { index: n })} data-pa-frage={n} />
            {f.nachfrage && (
              <Text size="xs" c="dimmed" ml={30} lang={sprache}>
                ↳ {f.nachfrage}
              </Text>
            )}
          </div>
        ))}
      </Stack>
    )
  const f = fragen[Math.min(i, fragen.length - 1)]
  return (
    <Stack gap="sm" mt="xs" data-pa-frage-einzeln={i}>
      <Group gap={4} data-pa-fortschritt>
        {fragen.map((x, n) => (
          <Box
            key={n}
            onClick={() => setI(n)}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              cursor: 'pointer',
              background: n === i ? 'var(--mantine-color-orange-6)' : x.haken ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-gray-4)'
            }}
          />
        ))}
        <Text size="xs" c="dimmed">
          {t.frageVon} {i + 1} / {fragen.length}
        </Text>
      </Group>
      <Text size="xl" fw={700} lang={sprache} data-pa-frage={i}>
        {f.text}
      </Text>
      {f.nachfrage && (
        <Text size="md" c="dimmed" lang={sprache}>
          ↳ {f.nachfrage}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="md"
          color="orange"
          rightSection={<IconPlayerTrackNext size={16} />}
          onClick={() => {
            if (!f.haken) aktion('haken', { index: i })
            setI((x) => Math.min(fragen.length - 1, x + 1))
          }}
          disabled={i >= fragen.length - 1 && f.haken}
          data-pa-naechste-frage
        >
          {t.naechsteFrage}
        </Button>
      </Group>
    </Stack>
  )
}

/**
 * Die eigentliche Sicht. `bildUrl` baut die Adresse eines Kartenbilds (Lernende /s/api/sprechen/bild/…, Lehrkraft
 * /server/sprech-bank/bild/…). `mitglieder` zeigt die Gruppe oben (Symbole), `dranSymbol` wer gerade antwortet.
 */
export function SchrittAnsicht({
  s,
  sprache,
  jetzt,
  aktion,
  bildUrl,
  mitglieder,
  dranSymbol,
  lehrkraft = false,
  stufe = 'mittel'
}: {
  s: SchrittSicht
  sprache: string
  jetzt: number
  aktion: (a: string, w?: unknown) => void
  bildUrl: (datei: string) => string
  mitglieder?: Mitglied[]
  dranSymbol?: string
  lehrkraft?: boolean
  stufe?: Stufe
}): React.JSX.Element {
  const istA = s.rolle === 'A'
  const t = stufe === 'ober' ? TEXTE[sprache] ?? TEXTE.de : TEXTE.de
  const rolleText =
    s.teil === 'dialog' && s.rolle !== 'helfer'
      ? `${t.sprichst} · ${t.rolleN} ${s.rolle}`
      : s.rolle === 'A'
      ? t.fragst
      : s.rolle === 'helfer'
      ? t.hilfst
      : t.sprichst
  const partnerText = s.teil === 'dialog' ? (s.rolle === 'helfer' ? t.freischaltenSprechende : t.freischaltenMich) : t.freischaltenPartner
  const farbe = stufe === 'unter' ? 'orange' : stufe === 'ober' ? 'gray' : 'violet'
  const fz = stufe === 'unter' ? 'md' : 'sm'
  return (
    <Stack gap="sm" data-pa-schritt={s.teil} data-pa-rolle={s.rolle} data-pa-stufe={stufe}>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Badge variant={stufe === 'ober' ? 'outline' : 'filled'} color={farbe} tt="none" size={stufe === 'unter' ? 'lg' : 'md'}>
            {PA_TEIL_NAME[s.teil]}
            {s.unterrunden > 1 ? ` · ${t.runde} ${s.unterrunde + 1} / ${s.unterrunden}` : ''}
          </Badge>
          <Badge
            variant="light"
            color={istA ? farbe : s.rolle === 'helfer' ? 'orange' : 'teal'}
            tt="none"
            size={stufe === 'unter' ? 'lg' : 'md'}
            data-pa-rolle-text
          >
            {rolleText}
          </Badge>
          {s.dran === true && (
            <Badge variant="light" color="green" tt="none" size={stufe === 'unter' ? 'lg' : 'md'} data-pa-dran>
              {t.dran}
            </Badge>
          )}
          {s.uhr && stufe !== 'ober' && <Uhr seit={s.uhr.seit} zielMinuten={s.uhr.zielMinuten} jetzt={jetzt} gross={false} />}
        </Group>
        <Group gap="xs">
          {s.uhr && stufe === 'ober' && <Uhr seit={s.uhr.seit} zielMinuten={s.uhr.zielMinuten} jetzt={jetzt} gross />}
          {mitglieder && (
            <Group gap={4}>
              {mitglieder.map((m, i) => (
                <Tooltip
                  key={i}
                  label={`${m.ich ? 'Du' : symbolName(m.symbol.split('#')[0], 'de')}${m.rolle ? ` · ${m.rolle === 'helfer' ? 'Helfer' : m.rolle}` : ''}${
                    m.online ? '' : ' · offline'
                  }`}
                >
                  <Box style={{ opacity: m.online ? 1 : 0.4, outline: m.ich ? `2px solid var(--mantine-color-${farbe}-5)` : undefined, borderRadius: 8 }}>
                    <SymbolBild symbol={m.symbol} groesse={28} lehrkraft={lehrkraft} />
                  </Box>
                </Tooltip>
              ))}
            </Group>
          )}
        </Group>
      </Group>

      {s.phase === 'rueckmeldung' && <Rueckmeldung s={s} aktion={aktion} t={t} />}

      {s.phase === 'arbeit' && s.teil === 'interview' && (
        <Card withBorder radius="md" padding={stufe === 'unter' ? 'lg' : 'md'} data-pa-interview>
          <Text fw={700} size={stufe === 'unter' ? 'lg' : 'md'} lang={sprache}>
            {s.titel}
          </Text>
          {s.interview ? (
            <>
              {dranSymbol && (
                <Group gap={6} data-pa-dran-symbol mt={4}>
                  <Text size="sm" c="dimmed">
                    {t.esAntwortet}
                  </Text>
                  <SymbolBild symbol={dranSymbol} groesse={24} lehrkraft={lehrkraft} />
                </Group>
              )}
              <InterviewFragen s={s} stufe={stufe} sprache={sprache} aktion={aktion} t={t} />
            </>
          ) : (
            <Text size={stufe === 'unter' ? 'lg' : 'sm'} c="dimmed" mt="xs">
              {s.dran === false ? t.gleichDran : t.interviewt}
            </Text>
          )}
        </Card>
      )}

      {s.phase === 'arbeit' && s.teil === 'monolog' && s.monolog && (
        <Card withBorder radius="md" padding={stufe === 'unter' ? 'lg' : 'md'} data-pa-monolog>
          <Group align="flex-start" wrap="wrap" gap="md">
            <Stack gap={4} style={{ flex: '1 1 260px', minWidth: 220 }}>
              {s.monolog.bilder.map((b) => (
                <Image key={b} src={bildUrl(b)} radius="md" fit="contain" mah={stufe === 'unter' ? 420 : 360} alt="" aria-hidden="true" data-pa-bild />
              ))}
            </Stack>
            <Stack gap="xs" style={{ flex: '1 1 240px' }}>
              <Text fw={700} size={stufe === 'unter' ? 'lg' : 'md'} lang={sprache}>
                {s.titel}
              </Text>
              <Text size={stufe === 'unter' ? 'lg' : 'sm'} lang={sprache} data-pa-auftrag>
                {s.monolog.auftrag}
              </Text>
              {istA && dranSymbol && (
                <Group gap={6} data-pa-dran-symbol>
                  <Text size="sm" c="dimmed">
                    {t.esSpricht}
                  </Text>
                  <SymbolBild symbol={dranSymbol} groesse={24} lehrkraft={lehrkraft} />
                </Group>
              )}
              {/* A: Leitfragen + Zusatzfragen als Impulse in EINER Liste (Befund 24.10.2026: keine Doppelung) */}
              {istA && s.monolog.impulse && s.monolog.impulse.length > 0 && (
                <Paper withBorder p="xs" radius="md" data-pa-zusatzfragen>
                  <Text size="xs" c="dimmed" fw={700}>
                    {t.stockt}
                  </Text>
                  {s.monolog.impulse.map((z, i) => (
                    <Text key={i} size={fz} lang={sprache}>
                      • {z}
                    </Text>
                  ))}
                </Paper>
              )}
              {/* Sprechende/r: Leitfragen nur, wenn A sie freigeschaltet hat */}
              {!istA && s.monolog.leitfragen.length > 0 && (
                <Paper withBorder p="xs" radius="md" data-pa-leitfragen>
                  <Text size="xs" c="dimmed" fw={700}>
                    {t.leitfragen}
                  </Text>
                  {s.monolog.leitfragen.map((z, i) => (
                    <Text key={i} size={fz} lang={sprache}>
                      • {z}
                    </Text>
                  ))}
                </Paper>
              )}
            </Stack>
          </Group>
        </Card>
      )}

      {s.phase === 'arbeit' && s.teil === 'dialog' && s.dialog && (
        <Card withBorder radius="md" padding={stufe === 'unter' ? 'lg' : 'md'} data-pa-dialog>
          <Text fw={700} size={stufe === 'unter' ? 'lg' : 'md'} lang={sprache}>
            {s.titel}
          </Text>
          <Text size={stufe === 'unter' ? 'lg' : 'sm'} lang={sprache} mt={4}>
            {s.dialog.situation}
          </Text>
          {s.dialog.rolle && (
            <Paper withBorder p="xs" radius="md" mt="xs" data-pa-rollenkarte>
              <Text size="xs" c="dimmed" fw={700}>
                {t.deineRolle}
                {s.dialog.rolle.name ? `: ${s.dialog.rolle.name}` : ''}
              </Text>
              <Text size={stufe === 'unter' ? 'md' : 'sm'} lang={sprache}>
                {s.dialog.rolle.karte}
              </Text>
            </Paper>
          )}
          {s.dialog.alleRollen?.map((r, i) => (
            <Paper key={i} withBorder p="xs" radius="md" mt="xs" data-pa-rollenkarte={i + 1}>
              <Text size="xs" c="dimmed" fw={700}>
                {t.rolleN} {i + 1}
                {r.name ? `: ${r.name}` : ''}
              </Text>
              <Text size="sm" lang={sprache}>
                {r.karte}
              </Text>
            </Paper>
          ))}
          {s.dialog.punkte.length > 0 && (
            <Group gap={6} mt="xs">
              {s.dialog.punkte.map((p, i) => (
                <Badge key={i} variant="outline" tt="none" size={stufe === 'unter' ? 'xl' : 'lg'} lang={sprache}>
                  {p}
                </Badge>
              ))}
            </Group>
          )}
          <Text size={stufe === 'unter' ? 'md' : 'sm'} fw={600} mt="xs" lang={sprache} data-pa-ziel>
            {stufe === 'ober' ? `${t.ziel}: ` : ''}
            {s.dialog.ziel}
          </Text>
        </Card>
      )}

      {s.phase === 'arbeit' && <Hilfen h={s.hilfen} sprache={sprache} stufe={stufe} t={t} />}
      {s.phase === 'arbeit' && <Schalter s={s} aktion={aktion} fuerWen={partnerText} />}

      {s.phase === 'arbeit' && (
        <Group gap="xs">
          {s.kann.naechste && (
            <Button
              variant="light"
              size={stufe === 'unter' ? 'md' : 'sm'}
              leftSection={<IconArrowsExchange size={16} />}
              onClick={() => aktion('naechste')}
              data-pa-naechste
            >
              {t.andere}
            </Button>
          )}
          {s.kann.wechsel && (
            <Button
              size={stufe === 'unter' ? 'md' : 'sm'}
              color={farbe}
              leftSection={<IconCheck size={16} />}
              onClick={() => aktion('wechsel')}
              data-pa-wechsel
            >
              {t.rundeBeenden}
            </Button>
          )}
          {s.kann.fertig && (
            <Button size={stufe === 'unter' ? 'md' : 'sm'} color={farbe} leftSection={<IconCheck size={16} />} onClick={() => aktion('fertig')} data-pa-fertig>
              {t.fertig}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  )
}
