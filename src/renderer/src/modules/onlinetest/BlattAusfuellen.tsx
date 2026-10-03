/**
 * Arbeitsblatt ausfüllen (Etappe 5 des Schülerbereichs, 02.10.2026; Server: src/server/arbeitsblaetter.ts).
 *
 * Abgestimmt: am iPad/PC direkt AUF dem Blatt – Felder an Linien, Lücken und Kästchen, gemessen hier
 * auf dem Gerät wie beim ausfüllbaren PDF (main/services/export/fillablePdf.ts); am Telefon als
 * Liste je Aufgabe. Tippen oder mit dem Stift (eigene Ebene je Seite; der Server legt sie für die
 * KI über das Blatt). Lösungen gibt es hier nicht – das Blatt ist die Schülerfassung.
 *
 * Das Blatt steht in einem iframe ohne Skripte (sandbox, nur same-origin zum Messen); darüber
 * liegen die Eingabefelder, beides gemeinsam auf die Breite des Geräts skaliert.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowBackUp, IconArrowLeft, IconEraser, IconKeyboard, IconMessageCircle, IconPencil, IconSend } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BlattFeldArt } from '@shared/blattFreigabe'
import { holen, senden } from './serverApi'
import { BogenAnsicht, type FeedbackBogen } from './SchuelerBereich'

/** Breite einer A4-Seite in CSS-Pixeln (210 mm bei 96 dpi) */
const BREITE = 794

interface Feld {
  id: string
  nr: number
  art: BlattFeldArt
  seite: number
  /** Lage im Dokument des iframes (px) */
  x: number
  y: number
  w: number
  h: number
  /** zeilen: Zahl und Abstand der Linien */
  zeilen?: number
  abstand?: number
  /** Beschriftung für die Listenansicht (Text der Zeile/Option) */
  text?: string
}

interface Seite {
  x: number
  y: number
  w: number
  h: number
}

interface AufgabeInfo {
  nr: number
  anweisung: string
  /** Lage des Aufgabenkopfs (für den Feedback-Knopf) */
  x: number
  y: number
  seite: number
}

interface BlattDaten {
  id: string
  titel: string
  offen: boolean
  feedback: boolean
  runden: number
  genutzt: number
  html: string
  einstellungen: { feedback: boolean; aufgabenFeedback: boolean; aufgabenRunden: number; stift: boolean }
  antworten: Record<string, string>
  tinte: Record<string, string>
  aufgabenFeedback: Record<string, { einschaetzung: string; text: string; zeit: number }[]>
  fassungen: { nr: number; zeit: string; bogen?: FeedbackBogen; fehler?: string }[]
  /** Lösungsblatt – nur nach dem ersten Einreichen (03.10.2026) */
  loesung?: string
}

// Wie das ausfüllbare PDF, dazu die leeren Zellen von Ausfülltabellen
const FELDER = '.ws-line, .ws-label-line, .ws-check:not(.ws-check-demo), .ws-gap, .ws-space, .ws-workspace, .ws-box, .ws-tf-cell, .ws-cell-empty'

/** Felder, Seiten und Aufgaben im gezeichneten Blatt messen (Dokumentreihenfolge = Lesereihenfolge) */
function messen(doc: Document): { felder: Feld[]; seiten: Seite[]; aufgaben: AufgabeInfo[] } {
  const seiten: Seite[] = []
  const roh: Omit<Feld, 'id'>[] = []
  const aufgaben: AufgabeInfo[] = []
  let nr = 0
  const gesehen = new Set<Element>()
  const nummerVon = (task: Element | null, seite: number): number => {
    if (!task) return 0
    if (!gesehen.has(task)) {
      gesehen.add(task)
      if (!task.classList.contains('ws-continued')) {
        nr++
        const kopf = (task.querySelector('.ws-task-num') ?? task).getBoundingClientRect()
        const anweisung = (task.querySelector('.ws-task-instruction') as HTMLElement | null)?.innerText ?? ''
        aufgaben.push({ nr, anweisung: anweisung.trim(), x: kopf.left, y: kopf.top, seite })
      }
    }
    return nr
  }
  doc.querySelectorAll('.ws-page').forEach((p, i) => {
    const r = p.getBoundingClientRect()
    seiten.push({ x: r.left, y: r.top, w: r.width, h: r.height })
    // Aufgaben auch ohne Felder zählen (Nummern wie auf dem Blatt)
    const elemente = [...p.querySelectorAll('.ws-task, ' + FELDER)]
    for (const el of elemente) {
      if (el.classList.contains('ws-task')) {
        nummerVon(el, i)
        continue
      }
      // Gelöstes Beispiel, Kopf (Name/Datum) und Fuß: nichts auszufüllen
      if (el.closest('.ws-example, .ws-header, .ws-footer')) continue
      const b = el.getBoundingClientRect()
      if (b.width < 6 || b.height < 4) continue
      const n = nummerVon(el.closest('.ws-task'), i)
      const art: BlattFeldArt = el.matches('.ws-gap')
        ? 'luecke'
        : el.matches('.ws-check, .ws-tf-cell') || (el.matches('.ws-box') && b.width < 40 && b.height < 40)
          ? 'kreuz'
          : el.matches('.ws-space, .ws-workspace, .ws-cell-empty')
            ? 'flaeche'
            : el.matches('.ws-box')
              ? 'text'
              : 'zeilen'
      const zeile = el.closest('li, tr, .ws-mc-option, .ws-tf-row, p') as HTMLElement | null
      roh.push({
        nr: n,
        art,
        seite: i,
        x: b.left,
        y: b.top,
        w: b.width,
        h: b.height,
        ...(art === 'kreuz' && zeile ? { text: zeile.innerText.trim().slice(0, 160) } : {})
      })
    }
  })
  // Untereinanderliegende Linien derselben Aufgabe zu einem mehrzeiligen Feld zusammenfassen
  const felder: Feld[] = []
  for (const f of roh) {
    const vorher = felder[felder.length - 1]
    if (
      vorher &&
      f.art === 'zeilen' &&
      vorher.art === 'zeilen' &&
      vorher.nr === f.nr &&
      vorher.seite === f.seite &&
      Math.abs(vorher.x - f.x) < 3 &&
      Math.abs(vorher.w - f.w) < 3
    ) {
      // Oberkante der bisher letzten Linie und ihr Abstand zur neuen
      const n = vorher.zeilen ?? 1
      const abstand = n > 1 ? vorher.abstand! : f.y - vorher.y
      const letzteOben = vorher.y + (n - 1) * abstand
      const luecke = f.y - letzteOben
      if (abstand > 4 && luecke > abstand * 0.6 && luecke < abstand * 1.6) {
        vorher.zeilen = n + 1
        vorher.abstand = abstand
        vorher.h = f.y + f.h - vorher.y
        continue
      }
    }
    felder.push({ ...f, id: '', ...(f.art === 'zeilen' ? { zeilen: 1, abstand: f.h } : {}) })
  }
  felder.forEach((f, i) => (f.id = `f${i}`))
  return { felder, seiten, aufgaben }
}

type Werkzeug = 'tastatur' | 'stift' | 'radierer'

export default function BlattAusfuellen({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<BlattDaten | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    void holen<BlattDaten>(`/s/api/blatt?id=${encodeURIComponent(id)}`).then(setD, (e: unknown) => {
      setFehler(e instanceof Error ? e.message : String(e))
      setD(null)
    })
  }, [id])
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Dieses Arbeitsblatt gibt es nicht.'}</Alert>
  return <Ausfuellen d={d} />
}

function Ausfuellen({ d }: { d: BlattDaten }): React.JSX.Element {
  const [antworten, setAntworten] = useState<Record<string, string>>(d.antworten)
  const [tinte, setTinte] = useState<Record<string, string>>(d.tinte)
  const [gemessen, setGemessen] = useState<{ felder: Feld[]; seiten: Seite[]; aufgaben: AufgabeInfo[]; hoehe: number } | null>(null)
  const [breite, setBreite] = useState(BREITE)
  const [ansicht, setAnsicht] = useState<'blatt' | 'liste'>(() => (window.innerWidth < 640 ? 'liste' : 'blatt'))
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('tastatur')
  const [fassungen, setFassungen] = useState(d.fassungen)
  const [genutzt, setGenutzt] = useState(d.genutzt)
  const [aufgabenFb, setAufgabenFb] = useState(d.aufgabenFeedback)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [meldung, setMeldung] = useState('')
  const [loesungOffen, setLoesungOffen] = useState(false)
  const rahmen = useRef<HTMLDivElement>(null)
  const iframe = useRef<HTMLIFrameElement>(null)
  const stand = useRef({ antworten, tinte, tinteGeaendert: false })
  stand.current.antworten = antworten
  stand.current.tinte = tinte
  const offen = d.offen && genutzt < d.runden

  // Breite des Geräts → Maßstab
  useEffect(() => {
    const el = rahmen.current
    if (!el) return
    const ro = new ResizeObserver(() => setBreite(el.clientWidth))
    ro.observe(el)
    setBreite(el.clientWidth)
    return () => ro.disconnect()
  }, [ansicht])
  const massstab = Math.min(1.25, breite / BREITE)

  const geladen = useCallback(() => {
    const doc = iframe.current?.contentDocument
    if (!doc) return
    const messe = (): void => {
      const hoehe = doc.documentElement.scrollHeight
      if (iframe.current) iframe.current.style.height = `${hoehe}px`
      setGemessen({ ...messen(doc), hoehe })
    }
    // Schriften und Bilder abwarten, dann messen
    void (doc.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(messe, 150))
  }, [])

  // Zwischenstände sichern (2 s nach der letzten Änderung)
  const sichern = useCallback(async (): Promise<void> => {
    const s = stand.current
    await senden('/s/api/blatt/speichern', { id: d.id, antworten: s.antworten, ...(s.tinteGeaendert ? { tinte: s.tinte } : {}) }).catch(() => undefined)
    s.tinteGeaendert = false
  }, [d.id])
  useEffect(() => {
    if (!offen) return
    const t = setTimeout(() => void sichern(), 2000)
    return () => clearTimeout(t)
  }, [antworten, tinte, offen, sichern])

  const setze = (f: string, w: string): void => setAntworten((a) => ({ ...a, [f]: w }))
  const felderAlsDaten = (): { id: string; nr: number; art: string; seite: number }[] =>
    (gemessen?.felder ?? []).map((f) => ({ id: f.id, nr: f.nr, art: f.art, seite: f.seite }))

  const aufgabePruefen = async (nr: number): Promise<void> => {
    setLaeuft(`a${nr}`)
    setMeldung('')
    try {
      const fb = await senden<{ einschaetzung: string; text: string }>('/s/api/blatt/aufgabe', {
        id: d.id,
        nr,
        antworten,
        felder: felderAlsDaten(),
        ...(stand.current.tinteGeaendert ? { tinte } : {})
      })
      stand.current.tinteGeaendert = false
      setAufgabenFb((x) => ({ ...x, [String(nr)]: [...(x[String(nr)] ?? []), { ...fb, zeit: Date.now() }] }))
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(null)
    }
  }

  const einreichen = async (): Promise<void> => {
    if (!window.confirm(d.feedback ? 'Blatt jetzt einreichen? Danach bekommst du ein Feedback.' : 'Blatt jetzt einreichen?')) return
    setLaeuft('abgabe')
    setMeldung('')
    try {
      const r = await senden<{ ok: boolean; bogen?: FeedbackBogen; nr: number; fehler?: string }>('/s/api/blatt/abgeben', {
        id: d.id,
        antworten,
        felder: felderAlsDaten(),
        tinte
      })
      setGenutzt((g) => g + 1)
      setFassungen((f) => [...f, { nr: r.nr, zeit: new Date().toISOString(), bogen: r.bogen, fehler: r.fehler }])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(null)
    }
  }

  const letzte = [...fassungen].reverse().find((f) => f.bogen)
  const aufgaben = gemessen?.aufgaben ?? []

  return (
    <Stack data-blatt-ausfuellen>
      <Button variant="subtle" component="a" href="/s/blaetter" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Arbeitsblätter
      </Button>
      <Group justify="space-between" align="end">
        <div>
          <Title order={3}>{d.titel}</Title>
          <Text size="sm" c="dimmed">
            {genutzt ? `${genutzt}× eingereicht` : 'noch nicht eingereicht'}
            {d.runden > 1 ? ` · ${d.runden}× möglich` : ''}
            {!d.offen ? ' · abgeschlossen' : ''}
          </Text>
        </div>
        <SegmentedControl
          size="xs"
          value={ansicht}
          onChange={(v) => setAnsicht(v as 'blatt' | 'liste')}
          data={[
            { value: 'blatt', label: 'Blatt' },
            { value: 'liste', label: 'Liste' }
          ]}
          data-ansicht
        />
      </Group>

      {d.loesung && (
        <Button variant="light" color="green" w="fit-content" onClick={() => setLoesungOffen(true)} data-loesung-knopf>
          Lösung ansehen
        </Button>
      )}
      {loesungOffen && d.loesung && (
        <Modal opened onClose={() => setLoesungOffen(false)} title="Lösung" size="xl">
          <iframe title="Lösung" srcDoc={d.loesung} sandbox="" style={{ width: '100%', height: '75vh', border: 0, background: '#fff' }} />
        </Modal>
      )}
      {letzte?.bogen && (
        <Card withBorder padding="lg" data-blatt-bogen>
          <Title order={4} mb="xs">
            Feedback zu deiner {letzte.nr}. Einreichung
          </Title>
          <BogenAnsicht b={letzte.bogen} />
          {offen && (
            <Text size="sm" c="dimmed" mt="sm">
              Du kannst das Blatt überarbeiten und noch {d.runden - genutzt}× einreichen.
            </Text>
          )}
        </Card>
      )}
      {fassungen.at(-1)?.fehler && (
        <Alert color="orange">Das Feedback konnte nicht erstellt werden: {fassungen.at(-1)!.fehler}. Deine Lehrkraft sieht dein Blatt trotzdem.</Alert>
      )}

      {ansicht === 'blatt' && offen && d.einstellungen.stift && (
        <Group gap="xs" data-werkzeuge>
          <SegmentedControl
            value={werkzeug}
            onChange={(v) => setWerkzeug(v as Werkzeug)}
            data={[
              { value: 'tastatur', label: <IconKeyboard size={18} aria-label="Tastatur" /> },
              { value: 'stift', label: <IconPencil size={18} aria-label="Stift" /> },
              { value: 'radierer', label: <IconEraser size={18} aria-label="Radierer" /> }
            ]}
          />
          <Text size="xs" c="dimmed">
            {werkzeug === 'tastatur'
              ? 'In die Felder tippen'
              : werkzeug === 'stift'
                ? 'Mit Stift oder Finger aufs Blatt schreiben'
                : 'Über Stift-Einträge wischen'}
          </Text>
        </Group>
      )}

      {/* In der Listenansicht bleibt das Blatt unsichtbar da – sonst ließen sich die Felder nicht messen */}
      <div
        ref={rahmen}
        style={ansicht === 'blatt' ? { width: '100%' } : { width: BREITE, position: 'absolute', left: -20000, top: 0, visibility: 'hidden' }}
        aria-hidden={ansicht !== 'blatt'}
      >
        <div style={{ width: BREITE * massstab, height: (gemessen?.hoehe ?? 1123) * massstab, position: 'relative', overflow: 'hidden', margin: '0 auto' }}>
          <div style={{ width: BREITE, transform: `scale(${massstab})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
            <iframe
              ref={iframe}
              title={d.titel}
              srcDoc={d.html}
              sandbox="allow-same-origin"
              onLoad={geladen}
              style={{ width: BREITE, height: 1123, border: 0, display: 'block', pointerEvents: 'none', background: '#fff' }}
            />
            {gemessen && (
              <Ebene
                felder={gemessen.felder}
                seiten={gemessen.seiten}
                aufgaben={aufgaben}
                antworten={antworten}
                setze={setze}
                gesperrt={!offen}
                werkzeug={offen && d.einstellungen.stift ? werkzeug : 'tastatur'}
                tinte={tinte}
                setTinte={(s, url) => {
                  stand.current.tinteGeaendert = true
                  setTinte((t) => ({ ...t, [String(s)]: url }))
                }}
                pruefen={offen && d.einstellungen.aufgabenFeedback ? aufgabePruefen : undefined}
                laeuft={laeuft}
                fb={aufgabenFb}
                runden={d.einstellungen.aufgabenRunden}
              />
            )}
          </div>
        </div>
      </div>

      {ansicht === 'liste' && gemessen && (
        <Liste
          felder={gemessen.felder}
          aufgaben={aufgaben}
          antworten={antworten}
          setze={setze}
          gesperrt={!offen}
          pruefen={offen && d.einstellungen.aufgabenFeedback ? aufgabePruefen : undefined}
          laeuft={laeuft}
          fb={aufgabenFb}
          runden={d.einstellungen.aufgabenRunden}
          tinte={Object.keys(tinte).length > 0}
        />
      )}
      {!gemessen && (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      )}

      {meldung && <Alert color="red">{meldung}</Alert>}
      {offen && (
        <Paper withBorder p="sm" radius="md" style={{ position: 'sticky', bottom: 8, zIndex: 5 }}>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Wird automatisch gespeichert.
            </Text>
            <Button leftSection={<IconSend size={16} />} loading={laeuft === 'abgabe'} onClick={() => void einreichen()} data-blatt-einreichen>
              Einreichen
            </Button>
          </Group>
          {laeuft === 'abgabe' && d.feedback && (
            <Text size="sm" c="dimmed" mt={4}>
              Das Feedback wird geschrieben – das dauert etwa eine Minute.
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  )
}

const FARBE = '#1d4ed8'

/** Feedback-Verlauf zu einer Aufgabe */
function AufgabenFeedbackText({ liste }: { liste?: { einschaetzung: string; text: string }[] }): React.JSX.Element | null {
  const l = liste?.at(-1)
  if (!l) return null
  const farbe = l.einschaetzung === 'sicher' ? 'green' : l.einschaetzung === 'teilweise' ? 'yellow' : 'orange'
  return (
    <Alert color={farbe} variant="light" p="xs" data-aufgaben-feedback>
      <Text size="sm">{l.text}</Text>
    </Alert>
  )
}

/** Eingabefelder und Stift-Ebene über dem Blatt */
function Ebene(p: {
  felder: Feld[]
  seiten: Seite[]
  aufgaben: AufgabeInfo[]
  antworten: Record<string, string>
  setze: (f: string, w: string) => void
  gesperrt: boolean
  werkzeug: Werkzeug
  tinte: Record<string, string>
  setTinte: (seite: number, url: string) => void
  pruefen?: (nr: number) => Promise<void>
  laeuft: string | null
  fb: BlattDaten['aufgabenFeedback']
  runden: number
}): React.JSX.Element {
  const [offenesFb, setOffenesFb] = useState<number | null>(null)
  const schreibt = p.werkzeug !== 'tastatur'
  return (
    <div
      style={{ position: 'absolute', left: 0, top: 0, width: BREITE, height: '100%' }}
      onPointerDown={(e) => {
        // Klick neben das Feedback-Fenster schließt es
        if (offenesFb !== null && !(e.target as HTMLElement).closest('[data-fb-fenster]')) setOffenesFb(null)
      }}
    >
      {p.felder.map((f) => {
        const wert = p.antworten[f.id] ?? ''
        const stil: React.CSSProperties = {
          position: 'absolute',
          left: f.x,
          top: f.y,
          width: f.w,
          height: f.h,
          border: 0,
          background: wert ? 'transparent' : 'rgba(29, 78, 216, 0.05)',
          color: FARBE,
          fontFamily: '"Segoe Print", "Comic Sans MS", system-ui, sans-serif',
          padding: '0 3px',
          outline: 'none',
          pointerEvents: schreibt ? 'none' : 'auto',
          boxSizing: 'border-box'
        }
        if (f.art === 'kreuz')
          return (
            <button
              key={f.id}
              type="button"
              disabled={p.gesperrt}
              onClick={() => p.setze(f.id, wert ? '' : 'x')}
              aria-label={f.text ? `Ankreuzen: ${f.text}` : 'Ankreuzen'}
              style={{ ...stil, padding: 0, cursor: 'pointer', fontSize: Math.min(f.w, f.h) * 0.9, lineHeight: 1, fontWeight: 700 }}
              data-feld={f.id}
            >
              {wert ? '✗' : ''}
            </button>
          )
        if (f.art === 'luecke' || (f.art === 'zeilen' && (f.zeilen ?? 1) === 1) || f.art === 'text') {
          const hoehe = f.art === 'zeilen' ? Math.max(f.h, 22) : f.h
          return (
            <input
              key={f.id}
              value={wert}
              disabled={p.gesperrt}
              onChange={(e) => p.setze(f.id, e.currentTarget.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              style={{ ...stil, top: f.y + f.h - hoehe, height: hoehe, fontSize: Math.max(12, Math.min(18, hoehe * 0.65)) }}
              data-feld={f.id}
            />
          )
        }
        const zeilenhoehe = f.abstand ?? 24
        return (
          <textarea
            key={f.id}
            value={wert}
            disabled={p.gesperrt}
            onChange={(e) => p.setze(f.id, e.currentTarget.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{
              ...stil,
              resize: 'none',
              fontSize: Math.max(12, Math.min(18, zeilenhoehe * 0.6)),
              lineHeight: f.art === 'zeilen' ? `${zeilenhoehe}px` : 1.4,
              paddingTop: f.art === 'zeilen' ? Math.max(0, zeilenhoehe * 0.2) : 4
            }}
            data-feld={f.id}
          />
        )
      })}
      {p.seiten.map((s, i) => (
        <TintenSeite key={i} seite={i} lage={s} bild={p.tinte[String(i)]} werkzeug={p.werkzeug} setTinte={p.setTinte} />
      ))}
      {p.pruefen &&
        p.aufgaben.map((a) => {
          const liste = p.fb[String(a.nr)]
          const rest = p.runden - (liste?.length ?? 0)
          return (
            <div key={a.nr} style={{ position: 'absolute', left: Math.max(2, a.x - 34), top: a.y - 2, zIndex: 20 }} data-fb-fenster>
              <Tooltip label={rest > 0 ? `Feedback zu Aufgabe ${a.nr} (noch ${rest}×)` : 'Feedback ansehen'}>
                <ActionIcon
                  size="md"
                  radius="xl"
                  variant={liste?.length ? 'filled' : 'light'}
                  color={liste?.at(-1)?.einschaetzung === 'sicher' ? 'green' : 'blue'}
                  loading={p.laeuft === `a${a.nr}`}
                  onClick={() => (offenesFb === a.nr ? setOffenesFb(null) : setOffenesFb(a.nr))}
                  aria-label={`Feedback zu Aufgabe ${a.nr}`}
                  data-aufgabe-pruefen={a.nr}
                >
                  <IconMessageCircle size={16} />
                </ActionIcon>
              </Tooltip>
              {offenesFb === a.nr && (
                <Paper withBorder shadow="md" p="xs" w={300} style={{ position: 'absolute', left: 36, top: 0 }}>
                  <Stack gap={6}>
                    <AufgabenFeedbackText liste={liste} />
                    {rest > 0 ? (
                      <Button size="xs" loading={p.laeuft === `a${a.nr}`} onClick={() => void p.pruefen!(a.nr)} data-aufgabe-pruefen-los>
                        {liste?.length ? 'Noch einmal prüfen lassen' : `Aufgabe ${a.nr} prüfen lassen`}
                      </Button>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Für diese Aufgabe gibt es kein weiteres Feedback mehr.
                      </Text>
                    )}
                  </Stack>
                </Paper>
              )}
            </div>
          )
        })}
    </div>
  )
}

/** Stift-Ebene einer Seite: Zeichnen mit Stift/Finger/Maus, Radierer, Rückgängig */
function TintenSeite({
  seite,
  lage,
  bild,
  werkzeug,
  setTinte
}: {
  seite: number
  lage: Seite
  bild?: string
  werkzeug: Werkzeug
  setTinte: (s: number, url: string) => void
}): React.JSX.Element {
  const leinwand = useRef<HTMLCanvasElement>(null)
  const verlauf = useRef<string[]>([])
  const zeichnet = useRef(false)
  const AUFLOESUNG = 2
  useEffect(() => {
    const c = leinwand.current
    if (!c || !bild) return
    const img = new Image()
    img.onload = () => c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
    img.src = bild
    // nur beim ersten Laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const punkt = (e: React.PointerEvent): { x: number; y: number } => {
    const r = leinwand.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * leinwand.current!.width, y: ((e.clientY - r.top) / r.height) * leinwand.current!.height }
  }
  const aktiv = werkzeug !== 'tastatur'
  const fertig = (): void => {
    if (!zeichnet.current) return
    zeichnet.current = false
    setTinte(seite, leinwand.current!.toDataURL('image/png'))
  }
  return (
    <>
      <canvas
        ref={leinwand}
        width={Math.round(lage.w * AUFLOESUNG)}
        height={Math.round(lage.h * AUFLOESUNG)}
        style={{
          position: 'absolute',
          left: lage.x,
          top: lage.y,
          width: lage.w,
          height: lage.h,
          pointerEvents: aktiv ? 'auto' : 'none',
          touchAction: aktiv ? 'none' : 'auto',
          zIndex: 10
        }}
        data-tinte={seite}
        onPointerDown={(e) => {
          if (!aktiv) return
          const ctx = leinwand.current!.getContext('2d')!
          verlauf.current = [...verlauf.current.slice(-9), leinwand.current!.toDataURL('image/png')]
          zeichnet.current = true
          leinwand.current!.setPointerCapture(e.pointerId)
          const { x, y } = punkt(e)
          ctx.globalCompositeOperation = werkzeug === 'radierer' ? 'destination-out' : 'source-over'
          ctx.strokeStyle = FARBE
          ctx.lineWidth = (werkzeug === 'radierer' ? 22 : 2.2 * (e.pressure ? 0.6 + e.pressure : 1)) * AUFLOESUNG
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + 0.1, y + 0.1)
          ctx.stroke()
        }}
        onPointerMove={(e) => {
          if (!zeichnet.current) return
          const ctx = leinwand.current!.getContext('2d')!
          const { x, y } = punkt(e)
          ctx.lineTo(x, y)
          ctx.stroke()
        }}
        onPointerUp={fertig}
        onPointerCancel={fertig}
      />
      {aktiv && (
        <ActionIcon
          variant="default"
          style={{ position: 'absolute', left: lage.x + lage.w - 40, top: lage.y + 8, zIndex: 11 }}
          aria-label="Rückgängig"
          onClick={() => {
            const vorher = verlauf.current.pop()
            const c = leinwand.current!
            const ctx = c.getContext('2d')!
            ctx.globalCompositeOperation = 'source-over'
            ctx.clearRect(0, 0, c.width, c.height)
            if (!vorher) return setTinte(seite, c.toDataURL('image/png'))
            const img = new Image()
            img.onload = () => {
              ctx.drawImage(img, 0, 0)
              setTinte(seite, c.toDataURL('image/png'))
            }
            img.src = vorher
          }}
        >
          <IconArrowBackUp size={16} />
        </ActionIcon>
      )}
    </>
  )
}

/** Listenansicht (Telefon): je Aufgabe die Anweisung und ihre Felder */
function Liste(p: {
  felder: Feld[]
  aufgaben: AufgabeInfo[]
  antworten: Record<string, string>
  setze: (f: string, w: string) => void
  gesperrt: boolean
  pruefen?: (nr: number) => Promise<void>
  laeuft: string | null
  fb: BlattDaten['aufgabenFeedback']
  runden: number
  tinte: boolean
}): React.JSX.Element {
  const gruppen = useMemo(() => {
    const nummern = [...new Set(p.felder.map((f) => f.nr))].sort((a, b) => a - b)
    return nummern.map((nr) => ({ nr, aufgabe: p.aufgaben.find((a) => a.nr === nr), felder: p.felder.filter((f) => f.nr === nr) }))
  }, [p.felder, p.aufgaben])
  return (
    <Stack data-blatt-liste>
      {p.tinte && (
        <Alert variant="light" color="blue">
          Auf dem Blatt gibt es Stift-Einträge – sie bleiben erhalten und zählen mit.
        </Alert>
      )}
      {gruppen.map((g) => {
        const liste = p.fb[String(g.nr)]
        const rest = p.runden - (liste?.length ?? 0)
        return (
          <Card key={g.nr} withBorder padding="md">
            <Group justify="space-between" mb={6} wrap="nowrap" align="start">
              <Text fw={700}>
                {g.nr ? `Aufgabe ${g.nr}` : 'Weitere Felder'}
                {g.aufgabe?.anweisung ? (
                  <Text span fw={400}>
                    {' '}
                    – {g.aufgabe.anweisung}
                  </Text>
                ) : null}
              </Text>
              {p.pruefen && g.nr > 0 && rest > 0 && (
                <Button
                  size="xs"
                  variant="light"
                  loading={p.laeuft === `a${g.nr}`}
                  onClick={() => void p.pruefen!(g.nr)}
                  leftSection={<IconMessageCircle size={14} />}
                >
                  Prüfen
                </Button>
              )}
            </Group>
            <Stack gap={6}>
              {g.felder.map((f, i) =>
                f.art === 'kreuz' ? (
                  <Checkbox
                    key={f.id}
                    label={f.text || `Kästchen ${i + 1}`}
                    checked={Boolean(p.antworten[f.id])}
                    disabled={p.gesperrt}
                    onChange={(e) => p.setze(f.id, e.currentTarget.checked ? 'x' : '')}
                  />
                ) : f.art === 'zeilen' && (f.zeilen ?? 1) > 1 ? (
                  <Textarea
                    key={f.id}
                    autosize
                    minRows={Math.min(6, f.zeilen ?? 2)}
                    label={`${i + 1}`}
                    value={p.antworten[f.id] ?? ''}
                    disabled={p.gesperrt}
                    onChange={(e) => p.setze(f.id, e.currentTarget.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                ) : f.art === 'flaeche' ? (
                  <Textarea
                    key={f.id}
                    autosize
                    minRows={3}
                    label={`${i + 1}`}
                    value={p.antworten[f.id] ?? ''}
                    disabled={p.gesperrt}
                    onChange={(e) => p.setze(f.id, e.currentTarget.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                ) : (
                  <TextInput
                    key={f.id}
                    label={`${f.art === 'luecke' ? 'Lücke' : 'Feld'} ${i + 1}`}
                    value={p.antworten[f.id] ?? ''}
                    disabled={p.gesperrt}
                    onChange={(e) => p.setze(f.id, e.currentTarget.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                )
              )}
              <AufgabenFeedbackText liste={liste} />
              {liste?.length ? (
                <Badge variant="light" size="sm">
                  noch {Math.max(0, rest)}× Feedback
                </Badge>
              ) : null}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
