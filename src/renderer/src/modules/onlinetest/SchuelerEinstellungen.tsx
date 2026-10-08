import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  ColorSwatch,
  Group,
  MantineProvider,
  NativeSelect,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme
} from '@mantine/core'
import {
  IconArrowLeft,
  IconBook2,
  IconCheck,
  IconDeviceDesktop,
  IconMoon,
  IconPalette,
  IconPlayerStop,
  IconSun,
  IconTarget,
  IconUserCircle,
  IconVolume
} from '@tabler/icons-react'
import { holen, senden } from './serverApi'
import { PasswortAendern } from '../../shared/PasswortAendern'
import {
  fuerServer,
  sprachausgabeDa,
  tempoFaktor,
  ton,
  useDarstellung,
  vomServer,
  vorlesenStopp,
  vorlesenText,
  type Darstellung
} from './schuelerDarstellung'

/**
 * Einstellungen der Lernenden (03.10.2026; neu gegliedert 06.10.2026 nach der Recherche
 * recherche/einstellungen-und-themenauswahl-2026-10-06.md, Teil A, und den Entscheidungen der Lehrkraft):
 * vier Bereiche als Kacheln – Aussehen, Lesen und Hören, Lernen, Konto. Jede Änderung wirkt sofort und
 * wird gespeichert („Gespeichert"), mit Vorschau. Nicht dabei (abgestimmt): Avatar, Spitzname, Push,
 * Grenzen durch die Lehrkraft.
 */
export { useDarstellung, type Darstellung }

const mitKonto = (): boolean => {
  const ich = window.__schulappsServer
  // Seit 08.10.2026 auch Gäste – sie melden sich mit ihrem persönlichen Code an mehreren Geräten an
  return Boolean(ich?.angemeldet)
}

const dunkelImSystem = (): boolean => window.matchMedia?.('(prefers-color-scheme: dark)').matches === true

/** Lesen und Hören: Zeilenabstand, Kontrast, lesefreundliche Schrift – für den ganzen Schülerbereich */
const LESEN_CSS = `
/* Versehentliches Markieren (08.10.2026, Befund im Unterricht): In Übungen, Spielen und Menüs blockierte markierter Text
   die Knöpfe (der Browser zog die Markierung statt zu klicken) – dort ist Text nicht markierbar. Eingaben bleiben es. */
.vt, [data-spiel], [data-verbspiel], [data-sitzung], [data-spielwahl], [data-grammatik-kasten], [data-vokabel-kasten],
button, [role="button"], .mantine-Tabs-list, .mantine-SegmentedControl-root, .mantine-Menu-dropdown, nav {
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.vt input, .vt textarea, [data-spiel] input, [data-sitzung] input, [data-sitzung] textarea { -webkit-user-select: text; user-select: text; }
html.sa-zeilen-weit body { --mantine-line-height: 1.75; line-height: 1.75; }
html.sa-zeilen-weit .mantine-Text-root, html.sa-zeilen-weit p, html.sa-zeilen-weit li { line-height: 1.75; }
html.sa-zeilen-sehrweit body { --mantine-line-height: 2.05; line-height: 2.05; }
html.sa-zeilen-sehrweit .mantine-Text-root, html.sa-zeilen-sehrweit p, html.sa-zeilen-sehrweit li { line-height: 2.05; }
html.sa-leseschrift body, html.sa-leseschrift .mantine-Text-root, html.sa-leseschrift button, html.sa-leseschrift input, html.sa-leseschrift textarea,
html.sa-leseschrift h1, html.sa-leseschrift h2, html.sa-leseschrift h3, html.sa-leseschrift h4 {
  font-family: Verdana, Tahoma, 'Segoe UI', Arial, sans-serif !important; letter-spacing: 0.02em; word-spacing: 0.12em; }
html.sa-kontrast[data-mantine-color-scheme='light'] { --mantine-color-dimmed: #1f2328; --mantine-color-text: #000; --mantine-color-default-border: #555; }
html.sa-kontrast[data-mantine-color-scheme='dark'] { --mantine-color-dimmed: #e9ecef; --mantine-color-text: #fff; --mantine-color-default-border: #adb5bd;
  --mantine-color-body: #000; }
html.sa-kontrast .mantine-Paper-root, html.sa-kontrast .mantine-Card-root { border-color: var(--mantine-color-default-border) !important; }
html.sa-kontrast a:focus-visible, html.sa-kontrast button:focus-visible { outline: 3px solid #ffd43b; outline-offset: 2px; }
.sa-vorlese-leiste { position: fixed; right: 16px; bottom: 16px; z-index: 300; }
`

/** Rahmen des Schülerbereichs: Mantine mit der gewählten Darstellung, Lesehilfen, Vorlesen-Knopf */
export function SchuelerRahmen({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { d, setze } = useDarstellung()
  const [systemDunkel, setSystemDunkel] = useState(dunkelImSystem)
  useEffect(() => {
    if (mitKonto())
      void holen<{ darstellung: Partial<Darstellung> | null }>('/s/api/darstellung').then(
        (r) => r.darstellung && setze(vomServer(r.darstellung)),
        () => undefined
      )
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const neu = (): void => setSystemDunkel(dunkelImSystem())
    mq?.addEventListener('change', neu)
    return () => mq?.removeEventListener('change', neu)
  }, [setze])
  // Der frühe Hintergrund aus /server/ich.js hat seinen Dienst getan – ab jetzt bestimmt die Darstellung
  useEffect(() => document.getElementById('sa-frueh')?.remove(), [])
  useEffect(() => {
    const html = document.documentElement
    html.style.fontSize = d.schrift === 'gross' ? '112.5%' : d.schrift === 'sehrgross' ? '125%' : ''
    html.classList.toggle('sa-ruhig', d.ruhig)
    html.classList.toggle('sa-zeilen-weit', d.zeilen === 'weit')
    html.classList.toggle('sa-zeilen-sehrweit', d.zeilen === 'sehrweit')
    html.classList.toggle('sa-kontrast', d.kontrast)
    html.classList.toggle('sa-leseschrift', d.leseschrift)
  }, [d.schrift, d.ruhig, d.zeilen, d.kontrast, d.leseschrift])
  const schema = d.modus === 'auto' ? (systemDunkel ? 'dark' : 'light') : d.modus === 'dunkel' ? 'dark' : 'light'
  return (
    <MantineProvider theme={{ primaryColor: d.farbe, autoContrast: true }} forceColorScheme={schema}>
      <style>{LESEN_CSS}</style>
      {children}
      {d.vorlesen && <VorleseLeiste />}
      <VerbindungsHinweis />
    </MantineProvider>
  )
}

/**
 * Verbindung unterbrochen (08.10.2026, Befund im Unterricht): serverApi.ts wiederholt Aufrufe selbst und meldet das –
 * hier steht dann oben ein kleiner Hinweis statt einer scheinbar hängenden Seite. Dazu gehen Fehler im Browser
 * (Ausnahmen, abgelehnte Zusagen) als kurzer Bericht an den Server (Diagnose, ohne Namen; höchstens 5 je Seite).
 */
function VerbindungsHinweis(): React.JSX.Element | null {
  const [gestoert, setGestoert] = useState(false)
  useEffect(() => {
    const an = (e: Event): void => setGestoert(Boolean((e as CustomEvent<{ gestoert: boolean }>).detail?.gestoert))
    window.addEventListener('schulapps-verbindung', an)
    let gemeldet = 0
    const berichten = (art: string, meldung: string, ort: string): void => {
      if (gemeldet++ >= 5) return
      const daten = JSON.stringify({ art, seite: window.location.pathname, meldung: meldung.slice(0, 400), ort: ort.slice(0, 300) })
      try {
        if (!navigator.sendBeacon?.('/s/api/fehlerbericht', new Blob([daten], { type: 'application/json' })))
          void fetch('/s/api/fehlerbericht', { method: 'POST', body: daten, keepalive: true }).catch(() => undefined)
      } catch {
        /* Diagnose darf nichts stören */
      }
    }
    const fehler = (e: ErrorEvent): void => berichten('fehler', e.message || String(e.error), `${e.filename ?? ''}:${e.lineno ?? ''} ${String(e.error?.stack ?? '').slice(0, 200)}`)
    const zusage = (e: PromiseRejectionEvent): void => {
      const g = e.reason as { message?: string; stack?: string } | undefined
      berichten('zusage', g?.message ?? String(e.reason), String(g?.stack ?? '').slice(0, 250))
    }
    window.addEventListener('error', fehler)
    window.addEventListener('unhandledrejection', zusage)
    // Ein Druck auf einen Knopf hebt eine noch bestehende Markierung auf – sonst kommt der Klick nicht an
    const markierungWeg = (e: PointerEvent): void => {
      const t = e.target as HTMLElement | null
      if (!t?.closest?.('button, [role="button"], a, label, .vt-option, [data-spiel] *, [data-zeitform], [data-rf]')) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) sel.removeAllRanges()
    }
    document.addEventListener('pointerdown', markierungWeg, true)
    return () => {
      window.removeEventListener('schulapps-verbindung', an)
      window.removeEventListener('error', fehler)
      window.removeEventListener('unhandledrejection', zusage)
      document.removeEventListener('pointerdown', markierungWeg, true)
    }
  }, [])
  if (!gestoert) return null
  return (
    <div
      role="status"
      data-verbindung-gestoert
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        background: 'var(--mantine-color-yellow-6)',
        color: '#222',
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 4px 14px rgba(0,0,0,.25)'
      }}
    >
      Verbindung unterbrochen – es wird erneut versucht …
    </div>
  )
}

/**
 * Vorlesen an Texten (06.10.2026): ein schwebender Knopf liest den markierten Text vor – ohne Markierung den
 * Inhalt der Seite. Nicht während eines Onlinetests (dort gelten die Regeln der Aufsicht).
 */
function VorleseLeiste(): React.JSX.Element | null {
  const [liest, setLiest] = useState(false)
  const auswahl = useRef('')
  useEffect(() => {
    // Die Markierung merken – am iPad verschwindet sie beim Tippen auf den Knopf
    const merken = (): void => {
      const t = window.getSelection()?.toString().trim() ?? ''
      if (t) auswahl.current = t
    }
    document.addEventListener('selectionchange', merken)
    return () => {
      document.removeEventListener('selectionchange', merken)
      vorlesenStopp()
    }
  }, [])
  if (!sprachausgabeDa() || /^\/s\/t\//.test(window.location.pathname)) return null
  const umschalten = (): void => {
    if (liest) {
      vorlesenStopp()
      setLiest(false)
      return
    }
    const markiert = window.getSelection()?.toString().trim() || auswahl.current
    auswahl.current = ''
    const bereich = document.querySelector<HTMLElement>('[data-vorlese-bereich]') ?? document.getElementById('root')
    const text = markiert || bereich?.innerText || ''
    if (!text.trim()) return
    setLiest(true)
    vorlesenText(text, () => setLiest(false))
  }
  return (
    <div className="sa-vorlese-leiste">
      <Tooltip label={liest ? 'Vorlesen beenden' : 'Vorlesen (markierten Text oder die Seite)'} position="left">
        <ActionIcon
          size={52}
          radius="xl"
          variant="filled"
          onPointerDown={(e) => e.preventDefault()}
          onClick={umschalten}
          aria-label={liest ? 'Vorlesen beenden' : 'Vorlesen'}
          data-vorlesen-knopf
          style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
        >
          {liest ? <IconPlayerStop size={24} /> : <IconVolume size={24} />}
        </ActionIcon>
      </Tooltip>
    </div>
  )
}

/** Kleiner Knopf „vorlesen" an einem einzelnen Text (z. B. am Lerntipp) – nur, wenn Vorlesen eingeschaltet ist */
export function VorleseKnopf({ text, farbe }: { text: string; farbe?: string }): React.JSX.Element | null {
  const { d } = useDarstellung()
  const [liest, setLiest] = useState(false)
  useEffect(() => () => vorlesenStopp(), [])
  if (!d.vorlesen || !sprachausgabeDa()) return null
  return (
    <ActionIcon
      variant="subtle"
      color={farbe}
      size="sm"
      aria-label={liest ? 'Vorlesen beenden' : 'Vorlesen'}
      onClick={() => {
        if (liest) {
          vorlesenStopp()
          setLiest(false)
        } else {
          setLiest(true)
          vorlesenText(text, () => setLiest(false))
        }
      }}
      data-vorlese-text
    >
      {liest ? <IconPlayerStop size={16} /> : <IconVolume size={16} />}
    </ActionIcon>
  )
}

const FARBEN: { wert: Darstellung['farbe']; name: string }[] = [
  { wert: 'blue', name: 'Blau' },
  { wert: 'teal', name: 'Türkis' },
  { wert: 'green', name: 'Grün' },
  { wert: 'grape', name: 'Lila' },
  { wert: 'pink', name: 'Pink' },
  { wert: 'orange', name: 'Orange' }
]

/**
 * Schneller Wechsel Hell/Dunkel in der Kopfzeile (03.10.2026, Wunsch der Lehrkraft: „auch Schüler in den
 * Darkmode wechseln können") – für Lernende mit Konto und für Gäste.
 */
export function ModusKnopf(): React.JSX.Element {
  const { d, setze } = useDarstellung()
  const dunkel = useComputedColorScheme('light') === 'dark'
  const umschalten = (): void => {
    const neu: Darstellung = { ...d, modus: dunkel ? 'hell' : 'dunkel' }
    setze(neu)
    if (mitKonto()) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  return (
    <Tooltip label={dunkel ? 'Hell' : 'Dunkel'}>
      <ActionIcon variant="subtle" size="lg" onClick={umschalten} aria-label={dunkel ? 'Helle Darstellung' : 'Dunkle Darstellung'} data-modus-knopf>
        {dunkel ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  )
}

const BEREICHE = [
  { id: 'aussehen', titel: 'Aussehen', text: 'Hell oder dunkel, Farbe, Schriftgröße', farbe: 'grape', symbol: <IconPalette size={26} /> },
  { id: 'lesen', titel: 'Lesen und Hören', text: 'Vorlesen, Zeilenabstand, Kontrast, Stimme', farbe: 'blue', symbol: <IconBook2 size={26} /> },
  { id: 'lernen', titel: 'Lernen', text: 'Wochenziel, Lerntipps, Spiele, Töne', farbe: 'teal', symbol: <IconTarget size={26} /> },
  { id: 'konto', titel: 'Konto', text: 'Passwort ändern', farbe: 'orange', symbol: <IconUserCircle size={26} /> }
] as const

/** Sprachen, deren Stimme sich wählen lässt */
const SPRACHEN: { lang: string; name: string; probe: string }[] = [
  { lang: 'de', name: 'Deutsch (Vorlesen)', probe: 'So klingt das Vorlesen mit dieser Stimme.' },
  { lang: 'en', name: 'Englisch', probe: 'This is how this voice sounds.' },
  { lang: 'fr', name: 'Französisch', probe: 'Voici comment sonne cette voix.' },
  { lang: 'es', name: 'Spanisch', probe: 'Así suena esta voz.' },
  { lang: 'it', name: 'Italienisch', probe: 'Ecco come suona questa voce.' },
  { lang: 'nl', name: 'Niederländisch', probe: 'Zo klinkt deze stem.' },
  { lang: 'pl', name: 'Polnisch', probe: 'Tak brzmi ten głos.' },
  { lang: 'tr', name: 'Türkisch', probe: 'Bu ses böyle duyuluyor.' },
  { lang: 'ru', name: 'Russisch', probe: 'Вот как звучит этот голос.' }
]

function useStimmen(): SpeechSynthesisVoice[] {
  const [stimmen, setStimmen] = useState<SpeechSynthesisVoice[]>(() => (sprachausgabeDa() ? window.speechSynthesis.getVoices() : []))
  useEffect(() => {
    if (!sprachausgabeDa()) return
    const neu = (): void => setStimmen(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener?.('voiceschanged', neu)
    const t = setTimeout(neu, 800)
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', neu)
      clearTimeout(t)
    }
  }, [])
  return stimmen
}

/** /s/einstellungen */
export function SchuelerEinstellungen(): React.JSX.Element {
  const { d, setze } = useDarstellung()
  const [gespeichert, setGespeichert] = useState<'' | 'konto' | 'geraet' | 'fehler'>('')
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const konto = mitKonto()
  const melde = (art: 'konto' | 'geraet' | 'fehler'): void => {
    setGespeichert(art)
    if (zeit.current) clearTimeout(zeit.current)
    zeit.current = setTimeout(() => setGespeichert(''), 2600)
  }
  const aendern = (teil: Partial<Darstellung>, nurGeraet = false): void => {
    const neu = { ...d, ...teil }
    setze(neu)
    // Gäste (per QR-Code) und Angaben nur fürs Gerät: kein Konto zum Speichern
    if (!konto || nurGeraet) return melde('geraet')
    void senden('/s/api/darstellung', fuerServer(neu)).then(
      () => melde('konto'),
      () => melde('fehler')
    )
  }
  // Aus einem Tipp („Wochenziel festlegen"): gleich zum Bereich
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(`bereich-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [])
  const hin = (id: string): void => document.getElementById(`bereich-${id}`)?.scrollIntoView({ behavior: d.ruhig ? 'auto' : 'smooth', block: 'start' })

  return (
    <Stack gap="lg" data-schueler-einstellungen data-vorlese-bereich>
      <style>{EINST_CSS}</style>
      <Button variant="subtle" component="a" href="/s/" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Startseite
      </Button>
      <Group justify="space-between" align="end">
        <Title order={2}>Einstellungen</Title>
        <Text size="sm" c="dimmed">
          Alles wirkt sofort.
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        {BEREICHE.filter((b) => b.id !== 'konto' || konto).map((b) => (
          <UnstyledButton key={b.id} className="se-kachel" onClick={() => hin(b.id)} data-bereich-kachel={b.id}>
            <ThemeIcon size={46} radius="md" color={b.farbe} variant="light">
              {b.symbol}
            </ThemeIcon>
            <Text fw={700} mt={8}>
              {b.titel}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {b.text}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <Bereich id="aussehen">
        <Zeile titel="Modus">
          <SegmentedControl
            fullWidth
            value={d.modus}
            onChange={(v) => aendern({ modus: v as Darstellung['modus'] })}
            data={[
              { value: 'hell', label: <Modus icon={<IconSun size={16} />} text="Hell" /> },
              { value: 'dunkel', label: <Modus icon={<IconMoon size={16} />} text="Dunkel" /> },
              { value: 'auto', label: <Modus icon={<IconDeviceDesktop size={16} />} text="Wie das Gerät" /> }
            ]}
            data-modus
          />
        </Zeile>
        <Zeile titel="Farbe">
          <Group gap="sm">
            {FARBEN.map((f) => (
              <ColorSwatch
                key={f.wert}
                component="button"
                type="button"
                color={`var(--mantine-color-${f.wert}-6)`}
                size={36}
                onClick={() => aendern({ farbe: f.wert })}
                aria-label={f.name}
                title={f.name}
                style={{ cursor: 'pointer', outline: d.farbe === f.wert ? '3px solid var(--mantine-color-text)' : undefined, outlineOffset: 2 }}
                data-farbe={f.wert}
              >
                {d.farbe === f.wert && <IconCheck size={18} color="white" />}
              </ColorSwatch>
            ))}
          </Group>
        </Zeile>
        <Zeile titel="Schriftgröße">
          <SegmentedControl
            fullWidth
            value={d.schrift}
            onChange={(v) => aendern({ schrift: v as Darstellung['schrift'] })}
            data={[
              { value: 'normal', label: 'Normal' },
              { value: 'gross', label: 'Groß' },
              { value: 'sehrgross', label: 'Sehr groß' }
            ]}
            data-schrift
          />
        </Zeile>
        <Zeile titel="Farben im Vokabeltraining">
          <SegmentedControl
            fullWidth
            value={d.design}
            onChange={(v) => aendern({ design: v as Darstellung['design'] })}
            data={[
              { value: 'fach', label: 'Farbe des Fachs' },
              { value: 'eigen', label: 'Meine Farbe' }
            ]}
            data-design
          />
        </Zeile>
        {/* Regal mit Fachordnern oder die bisherige Liste (08.10.2026) */}
        <Zeile titel="Meine Materialien">
          <SegmentedControl
            fullWidth
            value={d.materialien ?? 'regal'}
            onChange={(v) => aendern({ materialien: v as NonNullable<Darstellung['materialien']> })}
            data={[
              { value: 'regal', label: 'Regal mit Ordnern' },
              { value: 'liste', label: 'Liste' }
            ]}
            data-materialien
          />
        </Zeile>
        <Switch
          checked={d.ruhig}
          onChange={(e) => aendern({ ruhig: e.currentTarget.checked })}
          label="Ruhige Darstellung"
          description="Ohne Animationen – zum Beispiel ohne aufschwingende Türen, umblätternde Seiten und Sternenregen."
          data-ruhig
        />
        <Vorschau />
      </Bereich>

      <Bereich id="lesen">
        <Switch
          checked={d.vorlesen}
          onChange={(e) => aendern({ vorlesen: e.currentTarget.checked })}
          label="Vorlesen-Knopf"
          description={
            sprachausgabeDa()
              ? 'Ein Knopf unten rechts liest den markierten Text vor – ohne Markierung die ganze Seite. Auch am Lerntipp.'
              : 'Dieses Gerät hat keine Sprachausgabe.'
          }
          disabled={!sprachausgabeDa()}
          data-vorlesen
        />
        <Zeile titel="Zeilenabstand">
          <SegmentedControl
            fullWidth
            value={d.zeilen}
            onChange={(v) => aendern({ zeilen: v as Darstellung['zeilen'] })}
            data={[
              { value: 'normal', label: 'Normal' },
              { value: 'weit', label: 'Weit' },
              { value: 'sehrweit', label: 'Sehr weit' }
            ]}
            data-zeilen
          />
        </Zeile>
        <Switch
          checked={d.kontrast}
          onChange={(e) => aendern({ kontrast: e.currentTarget.checked })}
          label="Hoher Kontrast"
          description="Kräftigere Schrift und Ränder, deutlicher Fokusrahmen."
          data-kontrast
        />
        <Switch
          checked={d.leseschrift}
          onChange={(e) => aendern({ leseschrift: e.currentTarget.checked }, true)}
          label="Lesefreundliche Schrift"
          description="Klare Schrift mit etwas mehr Abstand zwischen Buchstaben und Wörtern. Wird nur auf diesem Gerät gespeichert."
          data-leseschrift
        />
        <Zeile titel="Sprechtempo (Vorlesen und Aussprache)">
          <SegmentedControl
            fullWidth
            value={d.tempo}
            onChange={(v) => aendern({ tempo: v as Darstellung['tempo'] })}
            data={[
              { value: 'langsam', label: 'Langsam' },
              { value: 'normal', label: 'Normal' },
              { value: 'schnell', label: 'Schnell' }
            ]}
            data-tempo
          />
        </Zeile>
        <Zeile
          titel="Stimme der Aussprache"
          text="Die aufgenommene Aussprache der Vokabeln gibt es mit weiblicher und männlicher Stimme. Fehlt die gewählte, hörst du die andere."
        >
          <SegmentedControl
            fullWidth
            value={d.aussprache ?? 'w'}
            onChange={(v) => aendern({ aussprache: v === 'm' ? 'm' : 'w' })}
            data={[
              { value: 'w', label: 'Weiblich' },
              { value: 'm', label: 'Männlich' }
            ]}
            data-aussprache-lage
          />
        </Zeile>
        <StimmenWahl stimmen={d.stimmen} setze={(stimmen) => aendern({ stimmen }, true)} />
      </Bereich>

      <Bereich id="lernen">
        <Zeile titel="Mein Wochenziel" text="An wie vielen Tagen pro Woche möchtest du üben? Die Startseite zeigt, wie weit du in dieser Woche bist.">
          <SegmentedControl
            fullWidth
            value={String(d.wochenziel)}
            onChange={(v) => aendern({ wochenziel: Number(v) })}
            data={['1', '2', '3', '4', '5', '6', '7'].map((n) => ({ value: n, label: n }))}
            data-wochenziel
          />
          <Text size="xs" c="dimmed" mt={4}>
            {d.wochenziel} {d.wochenziel === 1 ? 'Übungstag' : 'Übungstage'} pro Woche – eine Woche Pause beendet deine Serie nicht.
          </Text>
        </Zeile>
        <Switch
          checked={d.tipps}
          onChange={(e) => aendern({ tipps: e.currentTarget.checked })}
          label="Lerntipps"
          description="Ein kurzer Tipp auf der Startseite – einmal pro Woche als Wochenrückblick, dazwischen passend zu deinem Stand."
          data-tipps
        />
        <Switch
          checked={d.spiele}
          onChange={(e) => aendern({ spiele: e.currentTarget.checked })}
          label="Spiele nach dem Karteikasten"
          description="Wenn die Runde für heute geschafft ist, kannst du mit den Wörtern spielen."
          data-spiele
        />
        <Switch
          checked={d.zeitdruck}
          onChange={(e) => aendern({ zeitdruck: e.currentTarget.checked })}
          label="Spiele mit Zeitdruck"
          description="Aus: Spiele mit ablaufender Uhr (Blitzrunde, fallende Wörter, Formenblitz …) werden nicht angeboten."
          disabled={!d.spiele}
          data-zeitdruck
        />
        <Switch
          checked={d.toene}
          onChange={(e) => {
            aendern({ toene: e.currentTarget.checked })
            if (e.currentTarget.checked) setTimeout(() => ton('richtig'), 50)
          }}
          label="Töne"
          description="Ein kurzer Klang bei richtigen Antworten und wenn eine Runde geschafft ist."
          data-toene
        />
      </Bereich>

      {konto && (
        <Bereich id="konto">
          <PasswortAendern />
        </Bereich>
      )}

      {gespeichert && (
        <div className="se-gespeichert" role="status" data-gespeichert={gespeichert}>
          <Badge
            size="lg"
            radius="xl"
            color={gespeichert === 'fehler' ? 'orange' : 'teal'}
            leftSection={gespeichert === 'fehler' ? undefined : <IconCheck size={14} />}
            variant="filled"
            tt="none"
          >
            {gespeichert === 'konto'
              ? 'Gespeichert – gilt auf allen deinen Geräten'
              : gespeichert === 'geraet'
                ? 'Gespeichert auf diesem Gerät'
                : 'Nicht gespeichert – bitte später noch einmal'}
          </Badge>
        </div>
      )}
    </Stack>
  )
}

const EINST_CSS = `
.se-kachel { display: block; padding: 14px; border-radius: 16px; border: 1px solid var(--mantine-color-default-border); background: var(--mantine-color-body);
  transition: transform .15s ease, box-shadow .15s ease; text-align: left; }
.se-kachel:hover, .se-kachel:focus-visible { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.10); }
.se-bereich { scroll-margin-top: 16px; }
.se-gespeichert { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 310; animation: se-rein .2s ease-out; }
@keyframes se-rein { from { opacity: 0; transform: translate(-50%, 8px) } to { opacity: 1; transform: translate(-50%, 0) } }
html.sa-ruhig .se-gespeichert, html.sa-ruhig .se-kachel { animation: none; transition: none; }
@media (prefers-reduced-motion: reduce) { .se-gespeichert { animation: none } .se-kachel { transition: none } }
`

function Bereich({ id, children }: { id: (typeof BEREICHE)[number]['id']; children: React.ReactNode }): React.JSX.Element {
  const b = BEREICHE.find((x) => x.id === id)!
  return (
    <Paper withBorder radius="lg" p="lg" id={`bereich-${id}`} className="se-bereich" data-bereich={id}>
      <Group gap="sm" mb="md">
        <ThemeIcon size={36} radius="md" color={b.farbe} variant="light">
          {b.symbol}
        </ThemeIcon>
        <Title order={3}>{b.titel}</Title>
      </Group>
      <Stack gap="md">{children}</Stack>
    </Paper>
  )
}

function Zeile({ titel, text, children }: { titel: string; text?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <Text size="sm" fw={600} mb={text ? 0 : 4}>
        {titel}
      </Text>
      {text && (
        <Text size="xs" c="dimmed" mb={6}>
          {text}
        </Text>
      )}
      {children}
    </div>
  )
}

/** Live-Vorschau: ein Stück Startseite in der gewählten Darstellung */
function Vorschau(): React.JSX.Element {
  const { d } = useDarstellung()
  return (
    <Paper radius="md" p="md" withBorder data-vorschau style={{ background: `var(--mantine-color-${d.farbe}-light)` }}>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>
        Vorschau
      </Text>
      <Group justify="space-between" wrap="nowrap" align="center">
        <div style={{ minWidth: 0 }}>
          <Text fw={700}>So sieht deine Seite aus.</Text>
          <Text size="sm" c="dimmed">
            Ein kurzer Satz zum Lesen: Heute sind zehn Wörter dran – fünf Minuten genügen.
          </Text>
        </div>
        <Button radius="xl" size="xs" style={{ flex: 'none' }}>
          Knopf
        </Button>
      </Group>
    </Paper>
  )
}

/** Stimme je Sprache wählen (nur auf diesem Gerät) und probehören */
function StimmenWahl({ stimmen, setze }: { stimmen: Record<string, string>; setze: (s: Record<string, string>) => void }): React.JSX.Element | null {
  const alle = useStimmen()
  const [lang, setLang] = useState('en')
  if (!sprachausgabeDa()) return null
  const sprache = SPRACHEN.find((s) => s.lang === lang)!
  const passend = alle.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang))
  const probe = (): void => {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(sprache.probe)
    const v = passend.find((x) => x.name === stimmen[lang]) ?? passend[0]
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
    u.rate = (lang === 'de' ? 0.95 : 0.85) * tempoFaktor()
    window.speechSynthesis.speak(u)
  }
  return (
    <Zeile titel="Stimme" text="Welche Stimme vorliest bzw. die Aussprache spricht – je Sprache, nur auf diesem Gerät.">
      <Group gap="xs" align="end" wrap="wrap">
        <NativeSelect value={lang} onChange={(e) => setLang(e.currentTarget.value)} data={SPRACHEN.map((s) => ({ value: s.lang, label: s.name }))} w={190} data-stimme-sprache />
        <NativeSelect
          style={{ flex: 1, minWidth: 180 }}
          value={stimmen[lang] ?? ''}
          onChange={(e) => {
            const name = e.currentTarget.value
            const neu = { ...stimmen }
            if (name) neu[lang] = name
            else delete neu[lang]
            setze(neu)
          }}
          data={[
            { value: '', label: passend.length ? 'Automatisch (beste Stimme)' : 'Keine Stimme auf diesem Gerät' },
            ...passend.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` }))
          ]}
          disabled={!passend.length}
          data-stimme
        />
        <Button variant="light" leftSection={<IconVolume size={16} />} onClick={probe} disabled={!passend.length} data-probe>
          Probe hören
        </Button>
      </Group>
    </Zeile>
  )
}

function Modus({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <Group gap={6} justify="center" wrap="nowrap">
      {icon}
      <span>{text}</span>
    </Group>
  )
}
